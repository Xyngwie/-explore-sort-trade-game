/**
 * Canvas app: one page, one visible canvas, scenes switched inside it.
 * docs/CANVAS_SHELL_V0.md, docs/CANVAS_UNIFIED_V0.md §9.
 *
 * The page URL carries the same handoff query as the existing module pages
 * (no new URL keys): a Sort query (`salvagedContainers` …) shows SORT, anything
 * else shows DOCK. Moving between DOCK and SORT is a history entry on this page
 * (pushState) instead of a page load, and the existing guards run in the same
 * order as the existing pages' boot:
 *   DOCK: token gate (sort-handoff-gate) → last-yield note (wallet-summary) →
 *         committed handoff clears the back-refund (unopened-sort-back-guard) →
 *         ingest (main.ts) → strip the query.
 *   SORT: back trap (back-guard) → scene (main.ts rules).
 *   Back from SORT to DOCK: refund reserved containers (pageshow back_forward).
 * Modules that are not on canvas yet are left through the play log as before.
 */
import {
  CANVAS_THEME,
  CanvasSurface,
  canvasDebugEnabled,
  canvasNewGameDestination,
  mountShieldDebugConsole,
  setPlayLogNewGameDestination,
  HANDOFF_QUERY_KEYS,
  HUB_SAVED_EVENT,
  SHELL_MAX_WIDTH_PX,
  bindEditorNameInput,
  computeShellModel,
  confirmModal,
  pickerModal,
  stripHandoffParams,
  Flow,
  isPerfectCircuitDebugContext,
  drawResourceHud,
  drawShellTabs,
  loadHubSaveFromLocalStorage,
  playLogBlocked,
  playLogNavigate,
  resolveModuleBaseUrl,
  type CanvasUI,
  type FrameInfo,
} from "@estg/shared";
import { SortScene, armSortBackTrap, sortPopstateAction } from "@estg/sort/canvas";
import { RestoreScene, slowPerfectBoardSide, stripInboundSearchFromLocation } from "@estg/restore/canvas";
import { InvadeScene } from "@estg/invade/canvas";
import { ExploreScene, inspectShieldFixture } from "@estg/explore/canvas";
import { mountDebugPanel, type DebugAction } from "./debug-panel";
import { routeGameKey } from "./game-keys";
import { DockScene, layoutDock, CANVAS_MOBILE_MAX_W } from "./dock-scene";
import { browserDockEnv, DOCK_ANCHOR } from "./dock-sections";
import { tabUrl } from "./tabs";
import { StartScene, layoutStart } from "./start-scene";
import { clearHandoffFromUrl, createInitialHangar, ingestLocationSearch, loadCraftSignature } from "../hangar";
import { captureSortYieldFromHandoff, clearPendingSort, gateSortHandoff, hasSortHandoff, restorePendingSortOnBack } from "../sort-return-core";

export type SceneId = "start" | "dock" | "sort" | "restore" | "invade" | "explore";
/** The RESTORE page of this app (same app, own path like the existing /restore/ page). */
export const CANVAS_RESTORE_PATH = "restore/";
/** The INVADE page of this app (same app, own path like the existing /invade/ page). */
export const CANVAS_INVADE_PATH = "invade/";
/**
 * The 探索 page of this app (U-5). CANVAS-X2 → CANVAS-Y6 (神宮決定 2026-11-05): with U-5b,
 * 探索へ / the SORTIE tab / INVADE sorties open it in place.
 */
export const CANVAS_EXPLORE_PATH = "explore/";
const MODULE_PATHS = [CANVAS_RESTORE_PATH, CANVAS_INVADE_PATH, CANVAS_EXPLORE_PATH];
/** `/…/canvas/` for `/…/canvas/` and its module paths (`restore/`, `invade/`, `explore/`). */
export function canvasRootPath(pathname: string): string {
  for (const m of MODULE_PATHS) if (pathname.endsWith("/" + m)) return pathname.slice(0, -m.length);
  return pathname;
}

/**
 * SORT when the query is an Explore/HUB→Sort handoff: a Sort-only key
 * (`craftMultiplier` is also on Sort→HUB returns, so it does not decide).
 */
export const SORT_ONLY_KEYS: readonly string[] = HANDOFF_QUERY_KEYS.exploreToSort.filter(
  (k) => !(HANDOFF_QUERY_KEYS.sortToTrade as readonly string[]).includes(k),
);
export function sceneForSearch(search: string): "dock" | "sort" {
  const p = new URLSearchParams(search);
  return SORT_ONLY_KEYS.some((k) => p.has(k)) ? "sort" : "dock";
}
const stripQuery = (u: string) => { const x = new URL(u); return x.origin + x.pathname; };
/**
 * A module URL that this page shows itself → the same query on this page.
 * Anything else (modules not on canvas yet) → null (leave the page).
 */
export function inPageUrl(url: string, canvasBase: string, sortBase: string, tradeBase: string, restoreBase?: string, invadeBase?: string, exploreBase?: string): string | null {
  let u: URL;
  try { u = new URL(url, canvasBase); } catch { return null; }
  const at = u.origin + u.pathname;
  const root = stripQuery(canvasBase);
  if (at === root || at === stripQuery(sortBase) || at === stripQuery(tradeBase)) return root + u.search;
  if (at === root + CANVAS_RESTORE_PATH || (restoreBase && at === stripQuery(restoreBase))) return root + CANVAS_RESTORE_PATH + u.search;
  if (at === root + CANVAS_INVADE_PATH || (invadeBase && at === stripQuery(invadeBase))) return root + CANVAS_INVADE_PATH + u.search;
  if (at === root + CANVAS_EXPLORE_PATH || (exploreBase && at === stripQuery(exploreBase))) return root + CANVAS_EXPLORE_PATH + u.search;
  return null;
}

export function mountCanvasApp(doc: Document = document): void {
  const win = doc.defaultView!;
  const canvas = doc.getElementById("wl-canvas") as HTMLCanvasElement;
  const input = doc.getElementById("wl-canvas-name") as HTMLInputElement;
  let current: SceneId = "start";
  let dock: DockScene | null = null;
  let sort: SortScene | null = null;
  let restore: RestoreScene | null = null;
  let restoreLoading = 0;
  let invade: InvadeScene | null = null;
  let explore: ExploreScene | null = null;
  let sortSearch = "";
  const canvasBase = () => win.location.origin + canvasRootPath(win.location.pathname);
  const sortBase = stripQuery(new URL(resolveModuleBaseUrl("sort"), win.location.href).toString());
  const tradeBase = stripQuery(new URL(resolveModuleBaseUrl("trade"), win.location.href).toString());
  const restoreBase = stripQuery(new URL(resolveModuleBaseUrl("restore"), win.location.href).toString());
  const onRestorePage = () => win.location.pathname.endsWith("/" + CANVAS_RESTORE_PATH);
  const invadeBase = stripQuery(new URL(resolveModuleBaseUrl("invade"), win.location.href).toString());
  const exploreBase = new URL(resolveModuleBaseUrl("explore"), win.location.href).toString();
  const onInvadePage = () => win.location.pathname.endsWith("/" + CANVAS_INVADE_PATH);
  const onExplorePage = () => win.location.pathname.endsWith("/" + CANVAS_EXPLORE_PATH);
  // Debug area (神宮決定 2026-11-06): localhost or ?debug=1, read once at load.
  const debug = canvasDebugEnabled(win.location.search, win.location.hostname);
  // 新規ゲーム (play log) comes back to this page's DOCK, not the existing one (CANVAS-Z3).
  if (debug) setPlayLogNewGameDestination(canvasNewGameDestination(canvasBase(), win.location.search, win.location.hostname));

  /** Open a URL: in place when this page shows it, else through the play log. */
  const go = (url: string) => {
    const inPage = inPageUrl(url, canvasBase(), sortBase, tradeBase, restoreBase, invadeBase, exploreBase);
    if (!inPage) { playLogNavigate(url); return; }
    win.history.pushState({}, "", inPage);
    enter();
  };

  const enterDock = () => {
    // sort-handoff-gate → wallet-summary → unopened-sort-back-guard → main.ts ingest (existing boot order).
    const cleaned = gateSortHandoff(win.location.search, win.location.href);
    if (cleaned) win.history.replaceState({}, "", cleaned);
    captureSortYieldFromHandoff(win.location.search);
    if (hasSortHandoff(win.location.search)) clearPendingSort();
    const ingested = ingestLocationSearch(createInitialHangar(), win.location.search);
    if (ingested.consumed) clearHandoffFromUrl();
    dock = new DockScene({
      navigateLegacy: () => playLogNavigate(resolveModuleBaseUrl("trade")),
      env: { ...browserDockEnv(), navigate: go, debug, openDebug: () => debugPanel?.open() },
      onTab: (tab) => { if (!playLogBlocked()) go(tabUrl(tab)); },
      redraw: () => surface.invalidate(),
      initialState: ingested.state,
    });
    current = "dock";
  };
  const enterSort = () => {
    sortSearch = win.location.search;
    armSortBackTrap(win.history, win.location.href);
    sort = new SortScene({
      search: win.location.search,
      hubBase: canvasBase(),
      sortModuleBase: sortBase,
      href: () => win.location.href,
      go,
      redraw: () => surface.invalidate(),
      openDebug: debug ? () => debugPanel?.open() : undefined,
    });
    current = "sort";
  };
  const enterRestore = () => {
    const search = win.location.search;
    const build = () => {
      const showInjectionDetails = isPerfectCircuitDebugContext({ search, hostname: win.location.hostname, isDev: Boolean(import.meta.env.DEV) });
      restore = new RestoreScene({
        search,
        href: () => win.location.href,
        hubBase: canvasBase(),
        go,
        redraw: () => surface.invalidate(),
        signature: loadCraftSignature(),
        rateOpts: {
          hostname: win.location.hostname,
          isDev: Boolean(import.meta.env.DEV),
          envRate: (import.meta.env.VITE_PERFECT_CIRCUIT_RATE as string | undefined) ?? (import.meta.env.PERFECT_CIRCUIT_RATE as string | undefined) ?? null,
          showInjectionDetails,
        },
      });
      // Existing app.ts: consume trade→restore keys so a refresh uses the local session / storage.
      if (restore.session.source === "handoff-board" || restore.session.source === "handoff-id") {
        try { win.history.replaceState(null, "", stripInboundSearchFromLocation(win.location.href)); } catch { /* ignore */ }
      }
      restoreLoading = 0;
      surface.invalidate();
    };
    current = "restore";
    // Existing main.ts: large v2 Perfect boards (N ≥ 15) paint 「生成中…」 before the blocking generation.
    restoreLoading = slowPerfectBoardSide(search) ?? 0;
    if (restoreLoading) { surface.invalidate(); win.requestAnimationFrame(() => setTimeout(build, 0)); }
    else build();
  };
  const enterInvade = () => {
    invade = new InvadeScene({
      search: win.location.search,
      hubBase: canvasBase(),
      exploreBase,
      go,
      redraw: () => surface.invalidate(),
      history: win.history,
      href: () => win.location.href,
    });
    // Existing main.ts: the trade→invade keys are read once, then removed from the URL.
    if (invade.inbound != null) {
      const cleaned = stripHandoffParams(win.location.href, HANDOFF_QUERY_KEYS.tradeToInvade);
      if (cleaned !== win.location.pathname + win.location.search + win.location.hash) win.history.replaceState(null, "", cleaned);
    }
    current = "invade";
  };
  const enterExplore = () => {
    const scene = new ExploreScene({
      search: win.location.search,
      href: () => win.location.href,
      replaceUrl: (url) => win.history.replaceState(null, "", url),
      hubBase: canvasBase(),
      go,
      redraw: () => surface.invalidate(),
      history: win.history,
      storage: () => win.localStorage,
      session: () => win.sessionStorage,
      requestFrame: (fn) => win.requestAnimationFrame(fn),
      cancelFrame: (id) => win.cancelAnimationFrame(id),
      createCanvas: () => doc.createElement("canvas"),
      setTimer: (fn, ms) => win.setTimeout(fn, ms),
      touch: win.matchMedia?.("(pointer: coarse)").matches ?? false,
      copy: (text) => win.navigator.clipboard.writeText(text),
      openDebug: debug ? () => debugPanel?.open() : undefined,
    });
    if (scene.leaveForHub) {
      // Existing main.ts: no save / unreadable checkpoint / done → the hub (replace).
      scene.dispose();
      win.history.replaceState({}, "", canvasBase());
      enterDock();
      return;
    }
    explore = scene;
    current = "explore";
  };
  const enter = () => {
    // Leaving 探索 in place fires no pagehide: write the same hide checkpoint the
    // existing page writes on pagehide (a finished sortie must never resume).
    explore?.persistOnHide(false);
    explore?.dispose();
    explore = null;
    sort?.dispose();
    sort = null;
    restore?.dispose();
    restore = null;
    invade?.dispose();
    invade = null;
    if (onExplorePage()) enterExplore();
    else if (onInvadePage()) enterInvade();
    else if (onRestorePage()) enterRestore();
    else if (sceneForSearch(win.location.search) === "sort") enterSort();
    else enterDock();
    debugPanel?.refresh();
    surface.invalidate();
  };

  const start = new StartScene(() => {
    // Start: hide and blur the only HTML control, then switch scenes on the same canvas.
    input.blur();
    input.hidden = true;
    input.disabled = true;
    enter();
  });

  const placeInput = (frame: FrameInfo) => {
    const show = current === "start" && !start.locked;
    if (!show) {
      if (!input.hidden) { input.blur(); input.hidden = true; }
      return;
    }
    const r = layoutStart(frame).input;
    const rect = canvas.getBoundingClientRect();
    input.hidden = false;
    input.disabled = false;
    input.style.left = `${rect.left + r.x + 1}px`;
    input.style.top = `${rect.top + r.y + 1}px`;
    input.style.width = `${r.w - 2}px`;
    input.style.height = `${r.h - 2}px`;
  };

  const drawSort = (ui: CanvasUI, frame: FrameInfo, scene: SortScene) => {
    const ctx = ui.context;
    const L = layoutDock(frame, false);
    ctx.fillStyle = CANVAS_THEME.bg;
    ctx.fillRect(0, 0, frame.width, frame.height);
    const hub = loadHubSaveFromLocalStorage()?.hub ?? null;
    drawResourceHud(ui, L.hud, hub, frame.width <= CANVAS_MOBILE_MAX_W);
    // SORT keeps the existing Sort width (#app max 28rem) inside the shell column.
    const fw = Math.min(L.column.w, Math.max(SHELL_MAX_WIDTH_PX / 2, 448));
    const landscapeWide = frame.width > frame.height && L.column.w > fw;
    const w = landscapeWide ? L.column.w : fw;
    const top = L.hud.y + L.hud.h;
    scene.draw(ui, frame, { x: L.column.x + (L.column.w - w) / 2, y: top, w, h: L.tabs.y - top });
    // #332: every tab is off while a Sort handoff is open (existing shell rule).
    drawShellTabs(ui, L.tabs, computeShellModel({ current: "sort", hub, handoffInProgress: true }).tabs, () => {});
    if (scene.animating()) surface.invalidate();
  };

  const drawRestore = (ui: CanvasUI, frame: FrameInfo) => {
    const ctx = ui.context;
    const L = layoutDock(frame, false);
    ctx.fillStyle = CANVAS_THEME.bg;
    ctx.fillRect(0, 0, frame.width, frame.height);
    const hub = loadHubSaveFromLocalStorage()?.hub ?? null;
    drawResourceHud(ui, L.hud, hub, frame.width <= CANVAS_MOBILE_MAX_W);
    const top = L.hud.y + L.hud.h;
    const area = { x: L.column.x, y: top, w: L.column.w, h: L.tabs.y - top };
    if (!restore) {
      ui.text("生成中…", area.x + 16, area.y + 40, { size: 18, weight: 700 });
      ui.text(`${restoreLoading}×${restoreLoading} のパーフェクト基板を生成しています。大きい盤は少し時間がかかります。`, area.x + 16, area.y + 70, { size: 13, color: CANVAS_THEME.muted, maxW: area.w - 32 });
    } else {
      const scene = restore;
      ui.scrollArea("restore", area, "auto", (off) => {
        const originY = area.y - off;
        const f = new Flow(ui, area.x + 12, originY + 12, area.w - 24, originY);
        scene.draw(ui, f, frame.height);
        f.gap(12);
        return f.y - originY;
      });
    }
    drawShellTabs(ui, L.tabs, computeShellModel({ current: "restore", hub, handoffInProgress: false }).tabs, (tab) => {
      if (playLogBlocked()) return;
      if (tab.id === "SORT") { go(canvasBase()); dock?.goAnchor(DOCK_ANCHOR.unopened); } // §5-1: SORT tab = DOCK 未開封
      else go(tabUrl(tab));
    });
  };

  const drawInvade = (ui: CanvasUI, frame: FrameInfo, scene: InvadeScene) => {
    const ctx = ui.context;
    const L = layoutDock(frame, false);
    ctx.fillStyle = CANVAS_THEME.bg;
    ctx.fillRect(0, 0, frame.width, frame.height);
    const hub = loadHubSaveFromLocalStorage()?.hub ?? null;
    drawResourceHud(ui, L.hud, hub, frame.width <= CANVAS_MOBILE_MAX_W);
    const top = L.hud.y + L.hud.h;
    const area = { x: L.column.x, y: top, w: L.column.w, h: L.tabs.y - top };
    ui.scrollArea("invade", area, "auto", (off) => {
      const originY = area.y - off;
      const f = new Flow(ui, area.x + 12, originY + 12, area.w - 24, originY);
      scene.draw(ui, f, area.h);
      f.gap(12);
      return f.y - originY;
    });
    drawShellTabs(ui, L.tabs, computeShellModel({ current: "invade", hub, handoffInProgress: false }).tabs, (tab) => {
      if (playLogBlocked()) return;
      if (tab.id === "SORT") { go(canvasBase()); dock?.goAnchor(DOCK_ANCHOR.unopened); } // §5-1: SORT tab = DOCK 未開封
      else go(tabUrl(tab));
    });
    if (scene.confirm) confirmModal(ui, L.column, frame.height, scene.confirm, frame.insets.top);
    if (scene.picker) pickerModal(ui, L.column, frame.height, scene.picker, frame.insets.top, frame.insets.bottom);
    if (scene.animating()) surface.invalidate();
  };

  /**
   * 探索: the existing page hides the shell HUD, shows the tabs only in the
   * briefing (exploreTabsVisible) and lays the sortie out as CANVAS-X3/X4.
   */
  const drawExplore = (ui: CanvasUI, frame: FrameInfo, scene: ExploreScene) => {
    const ctx = ui.context;
    const L = layoutDock(frame, false);
    ctx.fillStyle = CANVAS_THEME.bg;
    ctx.fillRect(0, 0, frame.width, frame.height);
    const top = frame.insets.top;
    const bottom = frame.height - frame.insets.bottom;
    if (scene.phase === "sortie") {
      scene.drawSortie(ui, { x: L.column.x, y: top, w: L.column.w, h: bottom - top }, frame.dpr);
      if (scene.picker) pickerModal(ui, L.column, frame.height, scene.picker, frame.insets.top, frame.insets.bottom);
      scene.drawPauseCover(ui, frame.width, frame.height); // last: the pause tap reaches nothing else
      return;
    }
    const briefing = scene.phase === "briefing";
    const area = { x: L.column.x, y: top, w: L.column.w, h: (briefing ? L.tabs.y : bottom) - top };
    ui.scrollArea(`explore:${scene.phase}`, area, "auto", (off) => {
      const originY = area.y - off;
      const f = new Flow(ui, area.x + 12, originY + 12, area.w - 24, originY);
      scene.drawPage(ui, f);
      f.gap(12);
      return f.y - originY;
    });
    if (briefing) {
      const hub = loadHubSaveFromLocalStorage()?.hub ?? null;
      drawShellTabs(ui, L.tabs, computeShellModel({ current: "explore", hub, handoffInProgress: false }).tabs, (tab) => {
        if (playLogBlocked()) return;
        if (tab.id === "SORT") { go(canvasBase()); dock?.goAnchor(DOCK_ANCHOR.unopened); } // §5-1: SORT tab = DOCK 未開封
        else go(tabUrl(tab));
      });
    }
  };

  const surface = new CanvasSurface(canvas, {
    blocked: () => playLogBlocked(),
    // Debug area open: the page scrolls between the canvas and the area (#353 B3).
    inert: () => !!debugPanel?.isOpen,
    draw: (ui, frame) => {
      if (current === "explore" && explore) drawExplore(ui, frame, explore);
      else if (current === "invade" && invade) drawInvade(ui, frame, invade);
      else if (current === "restore") drawRestore(ui, frame);
      else if (current === "sort" && sort) drawSort(ui, frame, sort);
      else if (current === "dock" && dock) dock.draw(ui, frame);
      else start.draw(ui, frame);
      placeInput(frame);
    },
  });

  // The HTML debug area under the canvas (debug mode only).
  let alphaLab: HTMLElement | null = null;
  const debugPanel = debug ? mountDebugPanel({
    doc,
    dockActions: () => (current === "dock" && dock?.sections ? dock.sections.debugActions() : null),
    sceneActions: () => {
      const out: DebugAction[] = [];
      if (current === "sort" && sort) out.push(...sort.debugActions());
      const unlock = current === "explore" ? explore?.debugUnlock() : null;
      if (unlock) out.push({ id: "explore-unlock", label: `探索：回路ロック ${unlock.mode} → ${unlock.next}`, run: () => explore?.toggleDebugUnlock() });
      return out;
    },
    alphaLab: () => {
      if (!alphaLab) {
        mountShieldDebugConsole(() => (explore ? inspectShieldFixture(explore.world) : null));
        alphaLab = doc.getElementById("shield-debug-console");
      }
      return alphaLab;
    },
    redraw: () => surface.invalidate(),
    // Keys already down would keep moving and firing: keyup is not applied while the area is open.
    beforeOpen: () => { surface.cancelInput(); explore?.releaseHeldKeys(); },
  }) : null;

  const composing = bindEditorNameInput(input, (v) => { start.draft = v; });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !composing.isComposing() && !e.isComposing && !playLogBlocked()) {
      e.preventDefault();
      start.start();
      surface.invalidate();
    }
  });
  // SORT keys: arrows swap with the selected neighbour, Shift+arrow moves the selection.
  // 探索: the existing page's keys (CANVAS-X5), not while typing in the name field.
  // Debug area open: neither runs, and nothing calls preventDefault (Space scrolls the page).
  const onGameKey = (e: KeyboardEvent, type: "keydown" | "keyup") => routeGameKey({
    type, key: e.key, repeat: e.repeat, shiftKey: e.shiftKey, targetIsNameField: e.target === input,
  }, {
    debugOpen: !!debugPanel?.isOpen, scene: current, playLogBlocked: playLogBlocked(), sort, explore,
  });
  win.addEventListener("keydown", (e) => { if (onGameKey(e, "keydown")) e.preventDefault(); });
  win.addEventListener("keyup", (e) => { onGameKey(e, "keyup"); });
  // Existing main.ts: hidden → checkpoint + pause; pagehide → checkpoint.
  doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden" && current === "explore") explore?.persistOnHide(true); });
  win.addEventListener("pagehide", () => { if (current === "explore") explore?.persistOnHide(false); });

  win.addEventListener("popstate", () => {
    if (current === "start") return; // the URL is read when 開始 is pressed
    // Existing main.ts: during a forced-combat lock, back is swallowed (the trap is re-armed).
    if (current === "invade" && invade && invade.onPopstate()) return;
    // Existing main.ts: during a sortie, back is swallowed (the trap is re-armed).
    if (current === "explore" && explore && explore.onPopstate()) return;
    // Popping the sortie trap (result screen) lands on the same 探索 URL: stay.
    if (current === "explore" && explore && onExplorePage() && explore.search === win.location.search) return;
    if (current === "sort" && sortPopstateAction().block) { armSortBackTrap(win.history, win.location.href); return; }
    // Popping the trap entry lands on the same Sort URL: the existing page stays as it is.
    if (current === "sort" && sort && sceneForSearch(win.location.search) === "sort" && sortSearch === win.location.search) return;
    const leftSort = current === "sort" && sceneForSearch(win.location.search) === "dock";
    enter();
    // Back out of SORT = the existing pageshow back_forward refund of reserved containers.
    if (leftSort) restorePendingSortOnBack(() => enter());
  });

  // The screen re-reads the save when it changed elsewhere; reading never writes.
  const refresh = () => { dock?.reload(); explore?.hubChanged(); surface.invalidate(); };
  win.addEventListener(HUB_SAVED_EVENT, refresh);
  win.addEventListener("storage", refresh);
  win.addEventListener("pageshow", refresh);

  // Read-only hook for scripts/verify-canvas-*.cjs.
  (win as unknown as Record<string, unknown>).__wlCanvas = {
    scene: () => current,
    palette: () => (current === "dock" ? dock?.sections?.nav.current ?? null : null),
    selectedCircuit: () => dock?.sections?.state.lastCircuit?.circuitId ?? null,
    regions: () => surface.ui.debugRegions(),
    scroll: (id: string) => ({ y: surface.ui.getScroll(id), max: surface.ui.maxScroll(id) }),
    size: () => surface.cssSize,
    frames: () => surface.frameCount,
    activations: () => surface.ui.activationCount,
    pressing: () => surface.ui.pressing,
    invade: () => (invade ? { locked: invade.forcedLockActive(), status: invade.board.status, hitMine: invade.board.hitMine, selected: invade.selected, scale: invade.view.scale, x: invade.view.x, y: invade.view.y, reversed: invade.reversedTouch, open: invade.board.cells.flat().filter((c) => c.open).length, flagged: invade.board.cells.flat().filter((c) => c.flagged).length, log: invade.lastBoardLog, inbound: invade.inbound } : null),
    invadeViewport: () => invade?.boardViewport ?? null,
    explore: () => (explore ? { phase: explore.phase, paused: explore.paused, zoom: explore.zoom, map: explore.map, clickMove: explore.clickMove, leader: { ...explore.world.leader.pos }, alive: explore.world.leader.alive, timeLeft: explore.world.timeLeft, salvaged: explore.world.salvaged, boarding: !!explore.world.boarding, inCover: explore.world.leader.inCover, engage: explore.world.invadeSector?.engage ?? null, deployed: explore.world.deployedInstanceIds, log: explore.log.rows.length, wingmen: explore.world.wingmen.map((u) => u.id), picker: explore.picker?.options.map((o) => o.label) ?? null, toast: explore.toast, note: explore.equipmentNote() } : null),
    exploreToCanvas: (x: number, y: number) => explore?.worldToCanvas(x, y) ?? null,
    invadeCell: (sx: number, sy: number) => invade?.cellRect({ sx, sy }) ?? null,
    invadeFind: (kind: string) => invade?.board.cells.flat().find((c) => !c.blocked && (kind === "closed-safe" ? !c.open && !c.mine && !c.flagged && Math.max(Math.abs(c.sx), Math.abs(c.sy)) <= 3 : kind === "closed-any" ? !c.open && !c.mine && !c.flagged : kind === "mine" ? c.mine && !c.open : kind === "number" ? c.open && !c.mine && c.adjacent > 0 : false)) ?? null,
    restoreEdge: (i: number) => restore?.debugEdgeCenter(i) ?? null,
    restore: () => (restore ? { source: restore.session.source, cols: restore.session.puzzle.cols, rows: restore.session.puzzle.rows, locked: restore.locked, outcome: restore.play().outcome, marks: restore.marks.join(""), zoom: restore.zoomMode, persist: restore.persist, editor: restore.editorName } : null),
    sort: () => (sort ? { phase: sort.state.phase, playMode: sort.state.playMode, movesLeft: sort.state.movesLeft, selected: sort.state.selected, cols: sort.state.cols, rows: sort.state.rows } : null),
  };
  surface.invalidate();
}
