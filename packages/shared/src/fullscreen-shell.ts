/**
 * WRECKLINE fullscreen shell PR1 (docs/FULLSCREEN_SHELL_V0.md).
 * Pure tab model + a DOM mount that wraps the existing #app without
 * redesigning it. The shell reads the hub save only; trades go through
 * resource-palette.ts (PR2b).
 */
import { loadHubSaveFromLocalStorage, HUB_SAVED_EVENT, type HubSnapshot } from "./hub-save";
import { HUB_SAVE_STORAGE_KEY, resolveModuleBaseUrl, type ModuleKey } from "./constants";
import { playLogNavigate } from "./play-log-hooks";
import { PALETTE_CSS, closeResourcePalette, openResourcePalette } from "./resource-palette";

export type ShellTabId = "DOCK" | "INVADE" | "SORT" | "RESTORE" | "SORTIE";
export const SHELL_TABS: readonly ShellTabId[] = ["DOCK", "INVADE", "SORT", "RESTORE", "SORTIE"];
/** Q3 tab → existing module (provisional mapping, see design memo §4). */
export const SHELL_TAB_MODULE: Record<ShellTabId, ModuleKey> = {
  DOCK: "trade",
  INVADE: "invade",
  SORT: "sort",
  RESTORE: "restore",
  SORTIE: "explore",
};
/** Decided 2026-11-01: SORT tab opens DOCK's unopened-container panel (opening starts in the hub). */
export const SHELL_SORT_TAB_HASH = "#unopened-panel";
export function shellTabHref(id: ShellTabId, tradeBase: string, moduleBase: string): string {
  return id === "SORT" ? tradeBase.replace(/#.*$/, "") + SHELL_SORT_TAB_HASH : moduleBase;
}
export const SHELL_MAX_WIDTH_PX = 960;
export const SHELL_TAB_HEIGHT_PX = 56;
export const SHELL_HUD_HEIGHT_PX = 32;

/** PR2 HUD (神宮 2026-11-01): Cr・弾・装・電・箱, stock only, display only. */
export type HudKey = "credits" | "ammo" | "armor" | "power" | "unopened";
export type HudItem = { key: HudKey; label: string; value: number; color: string };
export const HUD_COLORS: Record<HudKey, string> = {
  credits: "#ffffff", ammo: "#f85149", armor: "#58a6ff", power: "#d4a72c", unopened: "#ffffff",
};
export function hudItems(hub: Pick<HubSnapshot, "credits" | "inventory" | "unopenedContainers"> | null): HudItem[] {
  const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  const v: Record<HudKey, number> = {
    credits: n(hub?.credits), ammo: n(hub?.inventory?.ammo), armor: n(hub?.inventory?.armor),
    power: n(hub?.inventory?.power), unopened: n(hub?.unopenedContainers),
  };
  const labels: Record<HudKey, string> = { credits: "Cr", ammo: "弾", armor: "装", power: "電", unopened: "箱" };
  return (Object.keys(labels) as HudKey[]).map((key) => ({ key, label: labels[key], value: v[key], color: HUD_COLORS[key] }));
}
/** Mobile: >=10,000 → 12.3k (>=1,000,000 → 1.2M, provisional). PC: thousands separators. */
export function formatHudNumber(value: number, mobile: boolean): string {
  const v = Math.max(0, Math.floor(value));
  if (!mobile) return v.toLocaleString("en-US");
  if (v < 10_000) return String(v);
  const [d, u] = v >= 1_000_000 ? [1_000_000, "M"] : [1_000, "k"];
  return (Math.floor((v / d) * 10) / 10).toFixed(1).replace(/\.0$/, "") + u;
}
export const HUD_MOBILE_QUERY = "(max-width: 600px)";

export type ShellContext = {
  current: ModuleKey;
  hub: HubSnapshot | null;
  /** true when the page URL carries a handoff query (e.g. SORT opening in progress). */
  handoffInProgress: boolean;
};
export type ShellTabState = { id: ShellTabId; module: ModuleKey; active: boolean; enabled: boolean };
export type ShellModel = { hidden: boolean; tabs: ShellTabState[] };

export function inOnboarding(hub: HubSnapshot | null): boolean {
  return !!hub?.newGameIntro && !hub.newGameIntro.firstSortie;
}

/** Q4/Q11 as far as the shell needs. Existing in-screen CTAs keep owning the route. */
export function computeShellModel(ctx: ShellContext): ShellModel {
  // Q4: the explore module is the sortie itself → no tabs.
  const hidden = ctx.current === "explore";
  const onboarding = inOnboarding(ctx.hub);
  const tabs = SHELL_TABS.map((id) => {
    const module = SHELL_TAB_MODULE[id];
    const active = module === ctx.current;
    let enabled = !active;
    // No hub save: only DOCK exists (other modules bounce to trade anyway).
    if (!ctx.hub && module !== "trade") enabled = false;
    // Q11: during onboarding the only tab is the next destination. The
    // hub (DOCK) owns the guided route, so only DOCK leads anywhere.
    if (onboarding && module !== "trade") enabled = false;
    // #332 guards: never leave a page mid-handoff through a tab.
    if (ctx.handoffInProgress) enabled = false;
    return { id, module, active, enabled };
  });
  return { hidden, tabs };
}

const STYLE_ID = "wl-shell-style";
export const SHELL_CSS = `
html,body{height:100dvh!important;max-height:100dvh;overflow:hidden!important;overscroll-behavior:none}
body{margin:0 auto!important;max-width:${SHELL_MAX_WIDTH_PX}px;display:flex;flex-direction:column;touch-action:manipulation}
#wl-shell-panel{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
body>#shield-debug-console{flex:0 1 auto;min-height:0;max-height:45dvh;overflow:auto}
#wl-shell-hud{box-sizing:border-box!important;flex:0 0 auto;display:flex;align-items:center;gap:10px;height:32px;padding:0 10px;overflow:hidden;white-space:nowrap;background:#0d1117;border-bottom:1px solid #30363d;font:600 13px/1 system-ui,sans-serif}
#wl-shell-hud[hidden]{display:none}
#wl-shell-hud .wl-hud-i{display:inline-flex;gap:3px;align-items:baseline;min-width:0;background:none;border:0;padding:4px 2px;font:inherit;color:inherit}
#wl-shell-hud .wl-hud-i.zero{color:#6e7681!important}
#wl-shell-hud button.wl-hud-i:active:not(:disabled){transform:translateY(1px);filter:brightness(.8)}
#wl-shell-hud button.wl-hud-i.flash{animation:wl-hud-flash .25s}
@keyframes wl-hud-flash{from{background:#ffffff33}to{background:none}}
#wl-shell-tabs{box-sizing:border-box!important;flex:0 0 auto;display:flex;height:${SHELL_TAB_HEIGHT_PX}px;padding-bottom:env(safe-area-inset-bottom);background:#0d1117;border-top:1px solid #30363d;touch-action:none}
#wl-shell-tabs[hidden]{display:none}
#wl-shell-tabs button{all:unset;box-sizing:border-box!important;flex:1!important;min-width:0!important;height:100%!important;display:flex!important;align-items:center!important;justify-content:center!important;margin:0!important;padding:0!important;background:none!important;border:0!important;border-radius:0!important;box-shadow:none!important;color:#c9d1d9!important;font:600 12px/1 system-ui,sans-serif!important;letter-spacing:.06em!important;cursor:pointer}
#wl-shell-tabs button:disabled{cursor:default}
#wl-shell-tabs button:disabled{color:#484f58!important}
#wl-shell-tabs button[aria-current=page]{color:#fff!important;box-shadow:inset 0 2px 0 #4f8fe8!important}
`;

export function mountFullscreenShell(current: ModuleKey, doc: Document = document): ShellModel {
  let hub: HubSnapshot | null = null;
  try {
    hub = loadHubSaveFromLocalStorage()?.hub ?? null;
  } catch {
    hub = null;
  }
  const model = computeShellModel({
    current,
    hub,
    handoffInProgress: current === "sort" && doc.location.search.length > 1,
  });
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = SHELL_CSS + PALETTE_CSS;
    doc.head.appendChild(style);
  }
  // Existing screen goes inside the panel untouched (its own layout/min-height kept).
  let panel = doc.getElementById("wl-shell-panel");
  const app = doc.getElementById("app");
  if (!panel) {
    panel = doc.createElement("div");
    panel.id = "wl-shell-panel";
    doc.body.insertBefore(panel, doc.body.firstChild);
  }
  if (app && app.parentElement !== panel) panel.appendChild(app);
  if (!scrollShellToHash(doc)) doc.defaultView?.setTimeout(() => scrollShellToHash(doc), 0);
  mountHud(doc, current, model, hub);
  doc.getElementById("wl-shell-tabs")?.remove();
  const nav = doc.createElement("nav");
  nav.id = "wl-shell-tabs";
  nav.setAttribute("aria-label", "WRECKLINE");
  nav.hidden = model.hidden;
  for (const t of model.tabs) {
    const b = doc.createElement("button");
    b.type = "button";
    b.textContent = t.id;
    b.dataset.shellTab = t.id;
    if (t.active) b.setAttribute("aria-current", "page");
    b.disabled = !t.enabled;
    b.addEventListener("click", () => {
      if (b.disabled) return;
      if (t.id === "SORT") goToUnopened(doc, current);
      else playLogNavigate(resolveModuleBaseUrl(t.module));
    });
    nav.appendChild(b);
  }
  doc.body.appendChild(nav);
  return model;
}

/**
 * PR6 §12-1: the page no longer scrolls; `#wl-shell-panel` does. A hash that
 * arrived before the panel existed (e.g. SORT tab → trade#unopened-panel) is
 * re-applied inside the panel once the target exists.
 */
export function scrollShellToHash(doc: Document = document): boolean {
  const id = decodeURIComponent((doc.location?.hash ?? "").slice(1));
  if (!id) return false;
  const el = doc.getElementById(id);
  if (!el || !doc.getElementById("wl-shell-panel")?.contains(el)) return false;
  el.scrollIntoView({ block: "start" });
  return true;
}

/**
 * PR6 §12-4（FULLSCREEN_SHELL_V0 #339 ④）: explore shows the tab bar on the
 * briefing screen only; sortie start and later phases hide it.
 * The shell HUD stays hidden in explore (explore has its own HUD).
 */
export function exploreTabsVisible(phase: string): boolean {
  return phase === "briefing";
}
export function setExploreShellPhase(phase: string, doc: Document = document): void {
  const nav = doc.getElementById("wl-shell-tabs");
  if (nav) nav.hidden = !exploreTabsVisible(phase);
}

/** Q5: same destination as the SORT tab. */
function goToUnopened(doc: Document, current: ModuleKey): void {
  if (current === "trade") {
    doc.location.hash = SHELL_SORT_TAB_HASH;
    doc.querySelector(SHELL_SORT_TAB_HASH)?.scrollIntoView({ block: "start" });
    return;
  }
  playLogNavigate(shellTabHref("SORT", resolveModuleBaseUrl("trade"), resolveModuleBaseUrl("sort")));
}
/** Unopened tap: works in onboarding (it is the next step); off mid-SORT-handoff or with no save. */
export function hudUnopenedEnabled(ctx: ShellContext): boolean {
  return !!ctx.hub && !ctx.handoffInProgress && ctx.current !== "explore";
}
/** PR2b: 弾/装/電/Cr tap opens the trade palette; same availability as the unopened tap. */
export function hudPaletteEnabled(ctx: ShellContext): boolean {
  return hudUnopenedEnabled(ctx);
}
function readHub(): HubSnapshot | null {
  try { return loadHubSaveFromLocalStorage()?.hub ?? null; } catch { return null; }
}
function mountHud(doc: Document, current: ModuleKey, model: ShellModel, hub: HubSnapshot | null): void {
  doc.getElementById("wl-shell-hud")?.remove();
  const bar = doc.createElement("div");
  bar.id = "wl-shell-hud";
  bar.hidden = model.hidden;
  doc.body.insertBefore(bar, doc.body.firstChild);
  const handoff = current === "sort" && doc.location.search.length > 1;
  const render = (h: HubSnapshot | null) => {
    const mobile = !!doc.defaultView?.matchMedia?.(HUD_MOBILE_QUERY).matches;
    bar.textContent = "";
    for (const it of hudItems(h)) {
      const el = doc.createElement("button");
      el.className = "wl-hud-i" + (it.value === 0 ? " zero" : "");
      el.dataset.hudKey = it.key;
      el.dataset.value = String(it.value);
      if (it.key !== "unopened") el.dataset.walletKey = it.key;
      el.style.color = it.color;
      const k = doc.createElement("span");
      k.textContent = it.label;
      el.append(k, " " + formatHudNumber(it.value, mobile));
      if (el instanceof HTMLButtonElement) {
        el.type = "button";
        const ctx = { current, hub: h, handoffInProgress: handoff };
        el.disabled = it.key === "unopened" ? !hudUnopenedEnabled(ctx) : !hudPaletteEnabled(ctx);
        if (it.key !== "unopened") el.dataset.palette = it.key;
        el.addEventListener("click", () => {
          if (el.disabled) return;
          el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
          if (it.key === "unopened") { closeResourcePalette(doc); setTimeout(() => goToUnopened(doc, current), 120); }
          else openResourcePalette(doc, it.key as "credits" | "ammo" | "armor" | "power");
        });
      }
      bar.appendChild(el);
    }
  };
  render(hub);
  const win = doc.defaultView;
  if (!win) return;
  win.addEventListener(HUB_SAVED_EVENT, () => render(readHub()));
  win.addEventListener("storage", (e) => { if (!e.key || e.key === HUB_SAVE_STORAGE_KEY) render(readHub()); });
  win.matchMedia?.(HUD_MOBILE_QUERY).addEventListener?.("change", () => render(readHub()));
}
