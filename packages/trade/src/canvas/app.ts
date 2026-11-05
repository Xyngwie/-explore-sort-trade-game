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
  HANDOFF_QUERY_KEYS,
  HUB_SAVED_EVENT,
  SHELL_MAX_WIDTH_PX,
  bindEditorNameInput,
  computeShellModel,
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
import { DockScene, layoutDock, CANVAS_MOBILE_MAX_W } from "./dock-scene";
import { browserDockEnv } from "./dock-sections";
import { tabUrl } from "./tabs";
import { StartScene, layoutStart } from "./start-scene";
import { clearHandoffFromUrl, createInitialHangar, ingestLocationSearch } from "../hangar";
import { captureSortYieldFromHandoff, clearPendingSort, gateSortHandoff, hasSortHandoff, restorePendingSortOnBack } from "../sort-return-core";

export type SceneId = "start" | "dock" | "sort";

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
export function inPageUrl(url: string, canvasBase: string, sortBase: string, tradeBase: string): string | null {
  let u: URL;
  try { u = new URL(url, canvasBase); } catch { return null; }
  const at = u.origin + u.pathname;
  if (at === stripQuery(canvasBase) || at === stripQuery(sortBase) || at === stripQuery(tradeBase)) return stripQuery(canvasBase) + u.search;
  return null;
}

export function mountCanvasApp(doc: Document = document): void {
  const win = doc.defaultView!;
  const canvas = doc.getElementById("wl-canvas") as HTMLCanvasElement;
  const input = doc.getElementById("wl-canvas-name") as HTMLInputElement;
  let current: SceneId = "start";
  let dock: DockScene | null = null;
  let sort: SortScene | null = null;
  let sortSearch = "";
  const canvasBase = () => win.location.origin + win.location.pathname;
  const sortBase = stripQuery(new URL(resolveModuleBaseUrl("sort"), win.location.href).toString());
  const tradeBase = stripQuery(new URL(resolveModuleBaseUrl("trade"), win.location.href).toString());

  /** Open a URL: in place when this page shows it, else through the play log. */
  const go = (url: string) => {
    const inPage = inPageUrl(url, canvasBase(), sortBase, tradeBase);
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
      env: { ...browserDockEnv(), navigate: go },
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
    });
    current = "sort";
  };
  const enter = () => {
    sort?.dispose();
    sort = null;
    if (sceneForSearch(win.location.search) === "sort") enterSort();
    else enterDock();
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

  const surface = new CanvasSurface(canvas, {
    blocked: () => playLogBlocked(),
    draw: (ui, frame) => {
      if (current === "sort" && sort) drawSort(ui, frame, sort);
      else if (current === "dock" && dock) dock.draw(ui, frame);
      else start.draw(ui, frame);
      placeInput(frame);
    },
  });

  const composing = bindEditorNameInput(input, (v) => { start.draft = v; });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !composing.isComposing() && !e.isComposing && !playLogBlocked()) {
      e.preventDefault();
      start.start();
      surface.invalidate();
    }
  });
  // SORT keys: arrows swap with the selected neighbour, Shift+arrow moves the selection.
  win.addEventListener("keydown", (e) => {
    if (current === "sort" && sort && !playLogBlocked() && sort.key(e.key, e.shiftKey)) e.preventDefault();
  });

  win.addEventListener("popstate", () => {
    if (current === "start") return; // the URL is read when 開始 is pressed
    if (current === "sort" && sortPopstateAction().block) { armSortBackTrap(win.history, win.location.href); return; }
    // Popping the trap entry lands on the same Sort URL: the existing page stays as it is.
    if (current === "sort" && sort && sceneForSearch(win.location.search) === "sort" && sortSearch === win.location.search) return;
    const leftSort = current === "sort" && sceneForSearch(win.location.search) === "dock";
    enter();
    // Back out of SORT = the existing pageshow back_forward refund of reserved containers.
    if (leftSort) restorePendingSortOnBack(() => enter());
  });

  // The screen re-reads the save when it changed elsewhere; reading never writes.
  const refresh = () => { dock?.reload(); surface.invalidate(); };
  win.addEventListener(HUB_SAVED_EVENT, refresh);
  win.addEventListener("storage", refresh);
  win.addEventListener("pageshow", refresh);

  // Read-only hook for scripts/verify-canvas-*.cjs.
  (win as unknown as Record<string, unknown>).__wlCanvas = {
    scene: () => current,
    regions: () => surface.ui.debugRegions(),
    scroll: (id: string) => ({ y: surface.ui.getScroll(id), max: surface.ui.maxScroll(id) }),
    size: () => surface.cssSize,
    frames: () => surface.frameCount,
    activations: () => surface.ui.activationCount,
    pressing: () => surface.ui.pressing,
    sort: () => (sort ? { phase: sort.state.phase, playMode: sort.state.playMode, movesLeft: sort.state.movesLeft, selected: sort.state.selected, cols: sort.state.cols, rows: sort.state.rows } : null),
  };
  surface.invalidate();
}
