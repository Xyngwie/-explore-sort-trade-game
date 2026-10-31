/**
 * WRECKLINE fullscreen shell PR1 (docs/FULLSCREEN_SHELL_V0.md).
 * Pure tab model + a DOM mount that wraps the existing #app without
 * redesigning it. Reads the hub save only; never writes it.
 */
import { loadHubSaveFromLocalStorage, type HubSnapshot } from "./hub-save";
import { resolveModuleBaseUrl, type ModuleKey } from "./constants";
import { playLogNavigate } from "./play-log-hooks";

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
export const SHELL_MAX_WIDTH_PX = 960;
export const SHELL_TAB_HEIGHT_PX = 56;

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
#wl-shell-tabs{flex:0 0 auto;display:flex;height:${SHELL_TAB_HEIGHT_PX}px;padding-bottom:env(safe-area-inset-bottom);background:#0d1117;border-top:1px solid #30363d;touch-action:none}
#wl-shell-tabs[hidden]{display:none}
#wl-shell-tabs button{flex:1;min-width:0;background:none;border:0;color:#c9d1d9;font:600 12px/1 system-ui,sans-serif;letter-spacing:.06em}
#wl-shell-tabs button:disabled{color:#484f58}
#wl-shell-tabs button[aria-current=page]{color:#fff!important;box-shadow:inset 0 2px 0 #4f8fe8}
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
    style.textContent = SHELL_CSS;
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
      if (!b.disabled) playLogNavigate(resolveModuleBaseUrl(t.module));
    });
    nav.appendChild(b);
  }
  doc.body.appendChild(nav);
  return model;
}
