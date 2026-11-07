/**
 * 探索 scene on the single canvas (docs/CANVAS_UNIFIED_V0.md §14, U-5a).
 *
 * Same rules as the existing Explore page (`main.ts`), in the same order:
 * boot (`game/exploreBoot.ts`: direct field entry, Invade squad, M3 top-up,
 * checkpoint resume / result / hub), Invade→Explore keys stripped once, the
 * play-log checkpoint provider, the sortie back trap, the hide checkpoint and
 * the pause tap, the briefing guards, 出撃 (`startSortie` → `recordPlayLogSortie`
 * → back trap), the frame tick (`tickWorld` only while not blocked / paused),
 * keys (`dispatchExploreKey`, V cover, WASD/arrows, Space/F, E), the map
 * (`renderWorld` with the view-only `mapZoom` camera; taps / pinch / double tap
 * / wheel with the existing gesture rules), the sortie buttons, the result
 * screen with the one-time HubSave direct save (never from drawing) and
 * 仕分へ・格納庫へ・再出撃.
 *
 * U-5b (§14.5): wing cards with the mech gauge, the shield / barricade panels,
 * the 残骸盾 / 屹立 buttons, the log, the key table (PC), the help line and the
 * DEBUG circuit-lock toggle. The Alpha Lab band stays on the existing page
 * (CANVAS-Y5, as on DOCK).
 */
import {
  CANVAS_THEME,
  CTA_CHIP,
  CTA_COPY,
  EXPLORE_SORTIE_BACK_TRAP,
  HANDOFF_QUERY_KEYS,
  SORTIE_GUARD_RETURN_KEY,
  SORTIE_PAUSE_LABEL,
  ammoShortLineJa,
  checkpointKindOnHide,
  clearPlayLogCheckpointProvider,
  exploreBackBlocked,
  fontSpec,
  historyTrapIsCurrent,
  isSortieDoneMark,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  playLogBlocked,
  pushHistoryTrap,
  recordPlayLogSortie,
  resolveModuleBaseUrl,
  setPlayLogCheckpointProvider,
  sortieFrameShouldTick,
  sortiePausedAfter,
  stripHandoffParams,
  writeHideCheckpoint,
  type CanvasUI,
  Flow,
  drawMechGauge,
  wrapText,
  type FlowButton,
  type HubSnapshot,
  type PickerSpec,
  type RawPointerHandler,
  type RawPointerSample,
  type Rect,
} from "@estg/shared";
import type { Stance, World } from "../game/types";
import { QUIRK_LABEL, STANCE_LABEL } from "../game/types";
import { canBuildBarricade, barricadeWorking, startBarricade, startDismantle } from "../game/barricades";
import { activeStripping, canStripWreck } from "../game/strippingRuntime";
import { dropOwnedShield, shieldItem, shieldReservedBy, sortedGroundShields, spareShields, startShieldPickup } from "../game/shieldOperations";
import { equippedShield, shieldHudText } from "../game/shields";
import { groundShieldGroups } from "../ui/shieldPanel";
import { loadLineJa, wreckCarrierId } from "../game/carry";
import { exploreMechGaugeModel } from "../game/mechGaugeExplore";
import { ENEMY_UNKNOWN_JA } from "../game/enemyIdentity";
import { repairDetails, unreadLabel, type LogRow } from "../ui/logPanel";
import { isShortcutsOverlayHidden, setShortcutsOverlayHidden } from "../game/keyboardOverlay";
import { COMMAND_UNLOCK_MODE_LABEL, isDebugUnlockToggleVisible, writeDebugCommandUnlockMode } from "../game/unlockMode";
import { attachCircuitPlay } from "../game/circuitPlay";
import { CanvasLogFeed, SQUAD_ORDER_KEYS, repairRowsOf, shortcutRows, sortieHelpText, wingStatus } from "./explore-panels";
import { startSortie } from "../game/world";
import { clampZoom, gestureDownForTap, gestureMove, gestureUp, MAP_WHEEL_STEP, newMapGestureState, withViewCamera, type MapGestureState } from "../game/mapZoom";
import { renderWorld, isEnemySeen } from "../game/render";
import { mapTargetsAt, type MapTarget } from "../ui/mapTargets";
import { shieldGroupAt } from "../ui/shieldPanel";
import { wallEntries } from "../game/barricades";
import { wallCircleOverlap } from "../game/barricadeGeometry";
import { squadSees } from "../game/vision";
import { startStrippingAt } from "../game/strippingRuntime";
import { takeShieldNotices } from "../game/shieldOperations";
import { interruptStripping } from "../game/strippingRuntime";
import { interruptBarricade } from "../game/barricades";
import { enemyAt, noteEnemyTap } from "../game/enemyIdentity";
import { campDrPercent, isOperationTimedOut, toggleSquadCover } from "../game/orders";
import { boardingCargoEta, boardingLiftOffEta, boardingRequirementsHud, tickWorld, type PlayerInput } from "../game/sim";
import { WING_COMMAND_FOR_STANCE, dispatchExploreKey, executeExploreCommand, isExploreCommandAvailable, type ExploreCommandOutcome, type ExploreCommandRequest } from "../game/commands";
import type { ExploreCommandId } from "../game/commandUnlock";
import { createPhaseWatcher, type PhaseWatcher } from "../game/phaseWatch";
import { leftBehindFateLine, leftBehindResultLines, strandedResultLines } from "../game/leftBehind";
import {
  forcedRescueAliveLines,
  hudTimePresentation,
  previewHeldCredits,
  rescueAbortFromHub,
  rescueConfirmCopy,
  rescueResultLines,
  resultHeading,
  retreatButtonShown,
} from "../game/rescue";
import { briefingHelpText, campHudText, isCampUnlocked } from "../game/campVisibility";
import {
  beginCircuitButton,
  captainActive,
  circuitButtons,
  handleMapTap,
  noteCollectTap,
  openWingPalette,
  paletteWingmen,
  pressWingPalette,
  usableAmmo,
  wingmanPaletteActions,
} from "../game/circuitPlay";
import { invadeIntelBannerText } from "../game/invadeIntelBanner";
import { clearInvadeForcedLockAfterResolve, markExploreForcedHandoffIntent } from "../game/forcedBackWipe";
import { snapshotResultWorld, snapshotSortieWorld } from "../game/checkpoint";
import {
  buildSortieOutcome,
  hubWearHandoffUrl,
  recoveredCircuitResultLines,
  returnKindFromWorld,
  sortHandoffUrl,
  toExploreResult,
  wreckResultLines,
} from "../game/outcome";
import type { DirectSaveResult } from "../game/hubDirectSave";
import {
  bootExploreSession,
  directSaveNoteText,
  ensureDirectSave,
  leaderLoadHud,
  makeExploreWorld,
  resolveExploreEntry,
  resortieFrom,
  sortieEquipmentNote,
  type ExploreBoot,
} from "../game/exploreBoot";

/** World map aspect (render.ts world camera is 720×420). CANVAS-X3. */
export const EXPLORE_MAP_ASPECT = 720 / 420;
const LINE = 18;
const TOAST_MS = 2800;
/** Same as DOCK (Q7): a gauge tap shows its numbers for 1.5 s. */
const GAUGE_TEXT_MS = 1500;
const GAUGE_PX = 44;
const LOG_H = 180;
const LOG_LINE = 17;
const GATED_BUTTONS: ReadonlyArray<{ id: string; cmd: "camp_set" | "camp_unload" | "purge" | "camp_pickup" | "scatter_search"; label: string }> = [
  { id: "btn-camp", cmd: "camp_set", label: "キャンプ設置" },
  { id: "btn-camp-unload", cmd: "camp_unload", label: "小隊荷下ろし" },
  { id: "btn-purge", cmd: "purge", label: "パージ／キャンプへ降ろす" },
  { id: "btn-camp-pickup", cmd: "camp_pickup", label: "キャンプから積込" },
  { id: "btn-scatter", cmd: "scatter_search", label: "散開捜索" },
];

export type ExploreHost = {
  /** location.search when the scene opened. */
  search: string;
  href: () => string;
  /** Replace the current URL (the existing page's history.replaceState). */
  replaceUrl: (url: string) => void;
  /** HUB (DOCK) of this page. */
  hubBase: string;
  go: (url: string) => void;
  redraw: () => void;
  history: Pick<History, "state" | "pushState" | "back">;
  storage: () => Storage;
  session: () => Storage;
  now?: () => number;
  requestFrame?: (fn: (now: number) => void) => number;
  cancelFrame?: (id: number) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  /** Debug mode only: open the HTML debug area under the canvas (#353 B2). */
  openDebug?: () => void;
  /** Coarse pointer (phone / tablet): the key table is not shown (CANVAS-Y4). */
  touch?: boolean;
  /** Clipboard (repair-log rows copy their details, as on the existing page). */
  copy?: (text: string) => Promise<void>;
  /** Off-screen canvas for the map (absent in selftests: the map is a plain box). */
  createCanvas?: () => HTMLCanvasElement;
};

export type ExploreSortieLayout = { hud: Rect; map: Rect; controls: Rect; side: boolean };

/**
 * Sortie layout (CANVAS-X3/X4): HUD lines on top, the map at the world's
 * 720:420 aspect (column width; on short landscape screens the height wins
 * and the controls go beside it when there is room), controls below.
 */
export function layoutExploreSortie(area: Rect, hudLines: number): ExploreSortieLayout {
  const pad = 8;
  const hudH = pad + hudLines * LINE + 4;
  const hud: Rect = { x: area.x + pad, y: area.y, w: area.w - pad * 2, h: hudH };
  const top = area.y + hudH;
  const availH = area.y + area.h - top;
  const innerW = area.w - pad * 2;
  let mapW = innerW;
  let mapH = mapW / EXPLORE_MAP_ASPECT;
  const minControls = 52;
  if (mapH > availH - minControls) {
    mapH = Math.max(120, availH - minControls);
    mapW = Math.min(innerW, mapH * EXPLORE_MAP_ASPECT);
    mapH = mapW / EXPLORE_MAP_ASPECT;
  }
  const sideW = innerW - mapW - pad;
  if (sideW >= 200 && availH - mapH < 160) {
    const map: Rect = { x: area.x + pad, y: top, w: mapW, h: mapH };
    return { hud, map, controls: { x: map.x + mapW + pad, y: top, w: sideW, h: availH }, side: true };
  }
  const map: Rect = { x: area.x + pad + (innerW - mapW) / 2, y: top, w: mapW, h: mapH };
  const cy = top + mapH + 6;
  return { hud, map, controls: { x: area.x, y: cy, w: area.w, h: Math.max(0, area.y + area.h - cy) }, side: false };
}

export class ExploreScene {
  world: World;
  paused: boolean;
  readonly leaveForHub: boolean;
  /** Last search the scene left on the URL (after the Invade keys were stripped). */
  search: string;
  /** Map target picker (overlapping targets) — same choices as the existing panel. */
  picker: PickerSpec | null = null;
  rescueConfirm = false;
  resortieNote = "";
  toast = "";
  private toastUntil = 0;
  private bootSearch: string;
  private preSortieAmmoNote: string;
  private readonly entrySaveRefused: boolean;
  private readonly boot: ExploreBoot;
  private readonly forcedEngageActive: boolean;
  private readonly phaseWatch: PhaseWatcher;
  private readonly directSaves = new WeakMap<World, DirectSaveResult>();
  private readonly keys = new Set<string>();
  private readonly input: PlayerInput;
  private gesture: MapGestureState = newMapGestureState();
  private gestureWorld: World | null = null;
  private mapRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private offscreen: HTMLCanvasElement | null = null;
  private stripTargetPending = false;
  private selectedBarricadeKey: string | null = null;
  private selectedShieldPosition: { x: number; y: number } | null = null;
  private mapTargetPick: { point: { x: number; y: number }; radius: number; targets: MapTarget[] } | null = null;
  private last: number;
  private raf: number | null = null;
  private disposed = false;
  private readonly gaugeShown = new Map<string, number>();
  readonly log = new CanvasLogFeed();
  private repairRows: LogRow[] = [];
  private logScroll = 0;
  keysHidden = isShortcutsOverlayHidden();

  constructor(private readonly host: ExploreHost) {
    const readHub = () => this.readHub();
    const entry = resolveExploreEntry(host.search, readHub);
    this.entrySaveRefused = entry.entrySaveRefused;
    this.bootSearch = entry.bootSearch;
    this.preSortieAmmoNote = entry.preSortieAmmoNote;
    this.boot = entry.boot;
    this.search = host.search;
    if (this.boot.invadeSector != null) {
      const cleaned = stripHandoffParams(host.href(), HANDOFF_QUERY_KEYS.invadeToExplore);
      const u = new URL(host.href());
      if (cleaned !== u.pathname + u.search + u.hash) host.replaceUrl(cleaned);
      this.search = new URL(host.href()).search;
    }
    const session = bootExploreSession(this.boot, this.bootSearch, this.make);
    this.bootSearch = session.bootSearch;
    this.world = session.world;
    this.paused = session.paused;
    this.leaveForHub = session.leaveForHub;
    this.input = {
      move: { x: 0, y: 0 },
      clickMove: this.world.leader.playerMoveTarget ? { ...this.world.leader.playerMoveTarget } : null,
      fire: false,
      interact: false,
    };
    setPlayLogCheckpointProvider(() => this.world.phase === "sortie" ? { v: 1, kind: "sortie", body: snapshotSortieWorld(this.world) } : this.world.phase === "result" ? { v: 1, kind: "result", body: snapshotResultWorld(this.world) } : null);
    this.phaseWatch = createPhaseWatcher(this.world.phase);
    this.forcedEngageActive = this.world.invadeSector?.engage === "forced";
    this.last = this.now();
    if (this.leaveForHub) return;
    if (this.world.phase === "sortie") this.armBack();
    // U9: the result is recorded before any result button can be pressed (not from drawing).
    if (this.world.phase === "result") ensureDirectSave(this.world, this.directSaves, host.storage);
    this.loop();
  }

  private readonly make = (b: ExploreBoot): World => makeExploreWorld(b, () => this.readHub());
  private now(): number { return this.host.now ? this.host.now() : performance.now(); }
  private readHub(): HubSnapshot | null {
    try {
      const loaded = loadHubSaveFromLocalStorage();
      // Existing freshHub(): every read refreshes the repair-log rows.
      this.repairRows = repairRowsOf(loaded?.hub ?? null);
      return loaded?.hub ? normalizeHubSnapshot(loaded.hub) : null;
    } catch { return null; }
  }
  get phase(): World["phase"] { return this.world.phase; }
  get zoom(): number { return this.currentGesture().zoom; }
  get map(): Rect { return { ...this.mapRect }; }
  get clickMove(): { x: number; y: number } | null { return this.input.clickMove ? { ...this.input.clickMove } : null; }

  dispose(): void {
    this.disposed = true;
    if (this.raf != null) this.host.cancelFrame?.(this.raf);
    this.raf = null;
    this.keys.clear();
    this.log.dispose();
    clearPlayLogCheckpointProvider();
  }

  /* ---------------- history / visibility (existing main.ts rules) ---------------- */
  private armBack(): void {
    if (this.leaveForHub || this.world.phase !== "sortie") return;
    pushHistoryTrap(this.host.history, EXPLORE_SORTIE_BACK_TRAP, this.host.href());
  }
  private releaseBack(): void {
    if (!historyTrapIsCurrent(this.host.history, EXPLORE_SORTIE_BACK_TRAP)) return;
    this.host.history.back();
  }
  /** popstate: true when the back press was swallowed (sortie in progress → trap re-armed). */
  onPopstate(): boolean {
    if (!exploreBackBlocked(this.world.phase)) return false;
    pushHistoryTrap(this.host.history, EXPLORE_SORTIE_BACK_TRAP, this.host.href());
    return true;
  }
  persistOnHide(showPause: boolean): void {
    if (this.leaveForHub) return;
    const kind = checkpointKindOnHide(this.world.phase, isSortieDoneMark());
    if (kind === "sortie") {
      this.paused = sortiePausedAfter("hidden", this.paused);
      writeHideCheckpoint("sortie", snapshotSortieWorld(this.world));
      if (showPause) this.host.redraw();
      return;
    }
    if (kind === "result") writeHideCheckpoint("result", snapshotResultWorld(this.world));
  }

  /* ---------------- frame ---------------- */
  private loop(): void {
    if (this.disposed || !this.host.requestFrame) return;
    this.raf = this.host.requestFrame((now) => { this.frame(now); this.loop(); });
  }
  /** One animation frame (exported for selftests). Returns whether the screen changed. */
  frame(now: number): boolean {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    let changed = false;
    if (!playLogBlocked() && sortieFrameShouldTick(this.world.phase, this.paused)) {
      this.syncMoveFromKeys();
      tickWorld(this.world, dt, this.input);
      for (const message of takeShieldNotices(this.world)) this.flash(message);
      changed = true;
    }
    // Compare with the last handled phase (not a per-frame snapshot), as main.ts does.
    const changedTo = this.phaseWatch.takeChange(this.world.phase);
    if (changedTo != null) {
      if (changedTo === "result" && this.forcedEngageActive) {
        markExploreForcedHandoffIntent();
        clearInvadeForcedLockAfterResolve();
      }
      if (changedTo === "result") {
        this.releaseBack();
        ensureDirectSave(this.world, this.directSaves, this.host.storage);
      }
      if (changedTo !== "sortie") this.onLeaveSortie();
      changed = true;
    }
    if (this.world.phase === "sortie") {
      // Existing paintShieldPanel: a pending strip / circuit target drops the choice list.
      if (this.stripTargetPending || this.world.circuitPlay?.pending) { this.mapTargetPick = null; if (this.picker) { this.picker = null; changed = true; } }
      if (this.log.update(this.world, this.repairRows)) changed = true;
    }
    if (this.toast && now >= this.toastUntil) { this.toast = ""; changed = true; }
    if (changed) this.host.redraw();
    return changed;
  }
  private onLeaveSortie(): void {
    this.stripTargetPending = false;
    this.selectedShieldPosition = null;
    this.picker = null;
    this.mapTargetPick = null;
    this.rescueConfirm = false;
  }
  private flash(text: string): void {
    this.toast = text;
    this.toastUntil = this.now() + TOAST_MS;
    this.host.redraw();
  }

  /* ---------------- keys ---------------- */
  /** keydown: returns true when the page should preventDefault. */
  keyDown(key: string, repeat: boolean, shift = false): boolean {
    if (this.paused && this.world.phase === "sortie") return false;
    const k = key.toLowerCase();
    this.keys.add(k);
    let prevent = ["w", "a", "s", "d", " "].includes(k);
    const outcome = dispatchExploreKey(this.world, k, { repeat });
    if (outcome) { prevent = true; this.afterCommand(outcome); }
    if (k === "v" && this.world.phase === "sortie" && !repeat) {
      prevent = true;
      this.toggleCover();
    }
    // Key table toggle (? or Shift+/). Does not affect gameplay.
    if ((k === "?" || (k === "/" && shift)) && !repeat) {
      prevent = true;
      this.toggleKeys();
    }
    return prevent;
  }
  keyUp(key: string): void { this.keys.delete(key.toLowerCase()); }
  private syncMoveFromKeys(): void {
    const keys = this.keys;
    let x = 0, y = 0;
    if (keys.has("w") || keys.has("arrowup")) y -= 1;
    if (keys.has("s") || keys.has("arrowdown")) y += 1;
    if (keys.has("a") || keys.has("arrowleft")) x -= 1;
    if (keys.has("d") || keys.has("arrowright")) x += 1;
    this.input.move = { x, y };
    if (x !== 0 || y !== 0) this.input.clickMove = null;
    this.input.fire = keys.has(" ") || keys.has("f");
    this.input.interact = keys.has("e");
  }

  /* ---------------- commands ---------------- */
  /** Saving (play log) or paused mid-sortie: actions do nothing (the pause cover only resumes). */
  private inputLocked(): boolean { return playLogBlocked() || (this.paused && this.world.phase === "sortie"); }
  private cmdLocked = (id: ExploreCommandId, wingId?: string): boolean => !isExploreCommandAvailable(this.world, id, wingId);
  private afterCommand(outcome: ExploreCommandOutcome): void {
    this.stripTargetPending = false;
    const w = this.world;
    if (outcome.status === "done" && outcome.id === "camp_unload" && outcome.result === "unloaded" && w.camp) {
      this.flash(`置場 ${w.camp.stashedCount} · 被弾−${campDrPercent(w)}%`);
    }
    this.host.redraw();
  }
  private run(req: ExploreCommandRequest): void {
    if (this.inputLocked()) return;
    this.afterCommand(executeExploreCommand(this.world, req));
  }
  private toggleKeys(): void {
    this.keysHidden = !this.keysHidden;
    setShortcutsOverlayHidden(this.keysHidden);
    this.host.redraw();
  }
  private toggleCover(): void {
    const w = this.world;
    interruptStripping(w, w.leader.id); interruptBarricade(w, w.leader.id);
    for (const u of w.wingmen) interruptBarricade(w, u.id);
    const r = toggleSquadCover(w);
    if (r === "entered") this.flash("カバー開始 · 障害物で身を隠す");
    else if (r === "exited") this.flash("カバー解除");
    this.host.redraw();
  }
  /** 出撃 (existing btn-start). */
  start(): void {
    if (playLogBlocked() || this.world.phase !== "briefing") return;
    if (this.equipmentNote()) return;
    if (!startSortie(this.world)) { this.host.redraw(); return; }
    recordPlayLogSortie(snapshotSortieWorld(this.world));
    this.armBack();
    this.phaseWatch.markRendered(this.world.phase);
    this.last = this.now();
    this.host.redraw();
  }
  /** 再出撃 (existing btn-again). */
  again(): void {
    if (playLogBlocked() || this.world.phase !== "result") return;
    const next = resortieFrom(this.world, this.bootSearch, this.boot, this.make, this.preSortieAmmoNote);
    if (next.kind === "refused") { this.resortieNote = next.note; this.host.redraw(); return; }
    this.bootSearch = next.bootSearch;
    this.preSortieAmmoNote = next.preSortieAmmoNote;
    this.world = next.world;
    this.resortieNote = "";
    this.input.clickMove = null;
    this.phaseWatch.markRendered(this.world.phase);
    this.host.redraw();
  }
  /** HubSave changed elsewhere (storage event): refresh the repair rows, as the existing page does. */
  hubChanged(): void { this.readHub(); this.host.redraw(); }
  equipmentNote(): string { return sortieEquipmentNote(this.world, this.readHub(), this.entrySaveRefused); }

  /* ---------------- map input ---------------- */
  private currentGesture(): MapGestureState {
    if (this.gestureWorld !== this.world) { this.gesture = newMapGestureState(); this.gestureWorld = this.world; }
    return this.gesture;
  }
  /** Canvas point → world point under the camera in effect (call inside withViewCamera). */
  private toWorld(x: number, y: number): { x: number; y: number } {
    const r = this.mapRect, cam = this.world.camera;
    const nx = r.w > 0 ? (x - r.x) / r.w : 0, ny = r.h > 0 ? (y - r.y) / r.h : 0;
    return { x: cam.x + nx * cam.w, y: cam.y + ny * cam.h };
  }
  /** World point → canvas point with the zoom on screen (debug / verify). */
  worldToCanvas(x: number, y: number): { x: number; y: number } {
    return withViewCamera(this.world, this.currentGesture().zoom, () => {
      const r = this.mapRect, cam = this.world.camera;
      return { x: r.x + ((x - cam.x) / cam.w) * r.w, y: r.y + ((y - cam.y) / cam.h) * r.h };
    });
  }
  private readonly mapHandler: RawPointerHandler = {
    down: (s: RawPointerSample) => {
      if (this.world.phase !== "sortie" || this.inputLocked()) return;
      // Map the tap with the zoom on screen BEFORE this pointer (Q3: a double tap's 2nd tap is still a map tap).
      const { kind, tapZoom } = gestureDownForTap(this.currentGesture(), s.id, s.x, s.y, this.now());
      this.host.redraw();
      if (kind === "pinch") return;
      withViewCamera(this.world, tapZoom, () => this.mapPointerDown(s.x, s.y));
    },
    move: (s: RawPointerSample) => {
      const g = this.currentGesture();
      const before = g.zoom;
      gestureMove(g, s.id, s.x, s.y);
      if (g.zoom !== before) this.host.redraw();
    },
    up: (s: RawPointerSample) => { gestureUp(this.currentGesture(), s.id); },
    cancel: () => { const g = this.currentGesture(); g.pointers.clear(); g.pinch = null; },
    wheel: (_p, deltaY) => {
      if (this.world.phase !== "sortie") return;
      const g = this.currentGesture();
      g.zoom = clampZoom(deltaY < 0 ? g.zoom * MAP_WHEEL_STEP : g.zoom / MAP_WHEEL_STEP);
      this.host.redraw();
    },
  };
  /** Existing mapPointerDown, in the same order. */
  private mapPointerDown(cx: number, cy: number): void {
    const world = this.world;
    const pt = this.toWorld(cx, cy);
    this.mapTargetPick = null;
    this.picker = null;
    if (this.stripTargetPending) {
      const result = startStrippingAt(world, pt, this.readHub(), world.balance.interactRadius);
      if (result === "started") { this.stripTargetPending = false; this.input.clickMove = null; this.input.fire = false; this.input.interact = false; }
      this.flash(result === "started" ? "残骸盾：剥離開始" : result === "far" ? "残骸が遠すぎます" : result === "busy" ? "この残骸は作業中です" : "近くの残骸をタップしてください");
      return;
    }
    // P1: ~24 screen px around a wingman selects it (scaled for the map width on screen).
    const perPx = this.mapRect.w > 0 ? world.camera.w / this.mapRect.w : 1;
    const radius = Math.max(24, 24 * perPx);
    if (!world.circuitPlay?.pending) {
      const targets = mapTargetsAt(world, pt, radius);
      if (targets.length > 1) {
        this.mapTargetPick = { point: pt, radius, targets };
        this.selectedBarricadeKey = null; this.selectedShieldPosition = null;
        this.openPicker();
        return;
      }
    }
    const wall = wallEntries(world).find(([, b]) => squadSees(world, b.pos) && wallCircleOverlap(b, pt, radius));
    this.selectedBarricadeKey = wall?.[0] ?? null;
    if (wall && !world.circuitPlay?.pending) { this.host.redraw(); return; }
    const shieldGroup = shieldGroupAt(world, pt, radius);
    if (shieldGroup && !world.circuitPlay?.pending) { this.selectedShieldPosition = { ...shieldGroup.pos }; this.host.redraw(); return; }
    this.selectedShieldPosition = null;
    // Enemy PR1 (F1 = B): a tap near a seen enemy shows 「所属不明」; the tap still does what it did before.
    const tapped = enemyAt(world, pt, radius, (en) => isEnemySeen(world, en));
    if (tapped) noteEnemyTap(world, tapped.id);
    const tap = handleMapTap(world, pt, radius);
    if (tap !== "move") { this.input.clickMove = null; this.host.redraw(); return; }
    noteCollectTap(world, pt);
    this.input.clickMove = pt;
    this.host.redraw();
  }
  /** Existing map-target choices (data-map-choice) as a canvas picker. */
  private openPicker(): void {
    const pick = this.mapTargetPick;
    if (!pick) return;
    this.picker = {
      id: "explore:targets",
      title: "対象を選択",
      options: [
        ...pick.targets.map((t, i) => ({ key: String(i), label: t.label })),
        { key: "move", label: "この地点へ移動" },
      ],
      onCancel: () => { this.mapTargetPick = null; this.picker = null; this.host.redraw(); },
      onPick: (choice) => this.pickTarget(choice),
    };
    this.host.redraw();
  }
  private pickTarget(choice: string): void {
    if (this.inputLocked()) return;
    const pick = this.mapTargetPick;
    this.mapTargetPick = null;
    this.picker = null;
    const world = this.world;
    if (!pick || world.phase !== "sortie") { this.host.redraw(); return; }
    if (choice === "move") {
      if (world.circuitPlay) world.circuitPlay.wingSelect = null;
      noteCollectTap(world, pick.point); this.input.clickMove = { ...pick.point };
    } else {
      const old = pick.targets[Number(choice)];
      const target = old && mapTargetsAt(world, pick.point, pick.radius).find((t) => t.kind === old.kind && t.key === old.key);
      if (!target || world.circuitPlay?.pending || this.stripTargetPending) this.flash("対象が変わりました。もう一度タップしてください");
      else if (target.kind === "wall") this.selectedBarricadeKey = target.key;
      else if (target.kind === "ground") this.selectedShieldPosition = { ...target.pos };
      else if (target.kind === "wing") openWingPalette(world, [target.key]);
      else {
        const result = startStrippingAt(world, target.pos, this.readHub(), 0, target.key);
        if (result === "started") { this.input.clickMove = null; this.input.fire = false; this.input.interact = false; }
        this.flash(result === "started" ? "残骸盾：剥離開始" : result === "far" ? "残骸が遠すぎます" : "この残骸は作業できません");
      }
    }
    this.host.redraw();
  }

  /* ---------------- drawing: briefing / result (in the app's scroll area) ---------------- */
  /** Briefing or result page (Flow inside a scroll area). Drawing never saves. */
  drawPage(ui: CanvasUI, f: Flow): void {
    if (this.world.phase === "result") this.drawResult(ui, f);
    else this.drawBriefing(ui, f);
  }

  private drawBriefing(ui: CanvasUI, f: Flow): void {
    const w = this.world;
    f.text("MODULE 1 · EXPLORE · BEHAVIOR v0", { size: 11, color: CANVAS_THEME.muted });
    f.heading("WRECKLINE 探索（振る舞い垂直スライス）", { size: 17 });
    f.card("explore:briefing", (c) => {
      if (w.note) c.text(w.note, { color: CANVAS_THEME.muted });
      const banner = invadeIntelBannerText(w.invadeSector);
      if (banner) c.gap(4).text(banner, { color: "#d29922" });
      c.gap(6);
      const leaderAmmo = w.leader.instanceId == null ? "—" : (w.currentAmmo[w.leader.instanceId] == null ? "—" : String(usableAmmo(w, w.leader)));
      c.kv("僚機", String(w.wingmen.length));
      c.kv("積載上限", "2（コンテナ 1・残骸 2）");
      c.kv("実弾", String(w.ammoStock));
      c.kv("隊長の携行弾", leaderAmmo);
      c.kv("活動限界", `${w.maxOperationTimeSec}s`);
      c.kv("I/O v2 ids", w.deployedInstanceIds.length ? w.deployedInstanceIds.join(", ") : "（なし・件数互換）");
      c.kv("戦線セクター", w.invadeSector ? `(${w.invadeSector.sectorX},${w.invadeSector.sectorY})` : "（なし・直接出撃）");
      c.kv("density", w.invadeSector ? w.invadeSector.density.toFixed(3) : "—（基準脅威）");
      c.kv("脅威", `敵 ${w.densityThreat.enemyCount} · 距離 ${Math.round(w.densityThreat.spawnDist)} · 速度×${w.densityThreat.enemySpeedMul.toFixed(2)}`);
      const engage = w.invadeSector?.engage;
      if (engage) c.kv("交戦", `${engage === "forced" ? "強制交戦・周囲引き込み" : engage === "raid" ? "任意侵入" : engage}（engage=${engage}）`);
      const cells = w.invadeSector?.enemyCells;
      if (cells && cells.length > 0) c.kv("enemyCells", `${cells.map((x) => `${x.sx},${x.sy}`).join("; ")}（${cells.length}）`);
      if (w.invadeSector && w.invadeSector.intelFlags.length > 0) c.kv("intelFlags", w.invadeSector.intelFlags.join(", "));
      c.gap(8);
      const note = this.equipmentNote();
      c.buttons([{ id: "explore:start", label: "出撃", variant: "primary", disabled: !!note, w: 120, onActivate: () => this.start() }]);
      if (note) {
        c.gap(6).text(note, { color: "#d29922" });
        c.gap(4).buttons([{ id: "explore:guard-hub", label: "格納庫へ", onActivate: () => {
          if (this.inputLocked()) return;
          // Sortie-guard guidance（神宮決定 2026-11-01）: HUB shows where to fix it.
          try { this.host.session().setItem(SORTIE_GUARD_RETURN_KEY, "1"); } catch { /* private mode: no banner */ }
          this.host.go(resolveModuleBaseUrl("trade"));
        } }]);
      }
      if (Object.values(w.mechBattery).some((b) => b.activity <= 0)) c.gap(6).text("活動量0の機体は出撃すると残骸になります。格納庫の各機体の「充電」で電力パーツを使って充電してください。", { color: "#d29922" });
      if (this.preSortieAmmoNote) c.gap(6).text(this.preSortieAmmoNote, { color: "#d29922" });
      c.gap(8).text(briefingHelpText(this.cmdLocked), { size: 12, color: CANVAS_THEME.muted });
      this.drawDebugOpener(c);
    });
    void ui;
  }

  private drawResult(ui: CanvasUI, f: Flow): void {
    const w = this.world;
    const result = toExploreResult(w);
    const res = this.directSaves.get(w) ?? null;
    const sortUrl = sortHandoffUrl(w);
    const wearUrl = hubWearHandoffUrl(w);
    f.text("MODULE 1 · RESULT", { size: 11, color: CANVAS_THEME.muted });
    f.heading("作戦結果", { size: 17 });
    f.card("explore:result", (c) => {
      c.text(resultHeading(w) ?? (result.isExtracted ? "生還" : `失敗（${w.failReason ?? "abort"}）`), { size: 15, weight: 700, color: result.isExtracted ? CANVAS_THEME.gain : "#d29922" });
      const fate = leftBehindFateLine(w);
      const lines = [
        ...rescueResultLines(w),
        ...forcedRescueAliveLines(w),
        ...leftBehindResultLines(w), ...(fate ? [fate] : []), ...strandedResultLines(w),
        ...wreckResultLines(w),
        ...recoveredCircuitResultLines(w),
      ];
      for (const l of lines) c.text(`・${l}`);
      c.gap(6);
      c.kv("returnKind", returnKindFromWorld(w));
      c.kv("isExtracted", String(result.isExtracted));
      c.kv("salvagedContainers", String(result.salvagedContainers));
      c.kv("totalStockPieces", String(result.totalStockPieces));
      c.kv("ammoStock", String(result.ammoStock));
      const outcome = buildSortieOutcome(w);
      if (outcome && outcome.mechWear.length > 0) {
        c.gap(6).text("機体摩耗 (MechWearReport)", { weight: 700 });
        for (const m of outcome.mechWear) c.kv(m.instanceId, `${m.durabilityBefore} → ${m.durabilityAfter}（-${m.wearApplied}）${m.statusAfter}`, { size: 12 });
      }
      c.gap(8);
      const btns: FlowButton[] = [
        { id: "explore:to-sort", label: CTA_COPY.toSort, variant: "primary", onActivate: () => { if (!playLogBlocked()) this.host.go(sortUrl); } },
        { id: "explore:to-hangar", label: CTA_COPY.toHangar, sub: wearUrl ? CTA_CHIP.wearReport : undefined, onActivate: () => { if (!playLogBlocked()) this.host.go(wearUrl ?? resolveModuleBaseUrl("trade")); } },
        { id: "explore:again", label: CTA_COPY.sortieAgain, onActivate: () => this.again() },
      ];
      c.buttons(btns);
      if (res?.status === "saved" && res.ammoShort?.length) c.gap(6).text(ammoShortLineJa(res.ammoShort, w.deployedInstanceIds), { color: "#d29922" });
      const saveNote = directSaveNoteText(res);
      if (saveNote) c.gap(6).text(saveNote, { size: 12, color: CANVAS_THEME.muted });
      if (this.resortieNote) c.gap(6).text(this.resortieNote, { color: "#d29922" });
      c.gap(6).text(sortUrl, { size: 11, color: CANVAS_THEME.faint });
      if (wearUrl) c.text(wearUrl, { size: 11, color: CANVAS_THEME.faint });
    });
    void ui;
  }

  /* ---------------- drawing: sortie ---------------- */
  private hudLines(): Array<{ text: string; color?: string; weight?: 400 | 600 | 700 }> {
    const w = this.world;
    const time = hudTimePresentation(w);
    const ammo = w.leader.instanceId == null ? "—" : (w.currentAmmo[w.leader.instanceId] == null ? "—" : String(usableAmmo(w, w.leader)));
    const cargo = boardingCargoEta(w), lift = boardingLiftOffEta(w);
    const extract = w.boarding ? (cargo != null ? `貨物 ${cargo.toFixed(1)}s / 離昇 ${(lift ?? 0).toFixed(1)}s` : `貨物到着 · 離昇 ${(lift ?? 0).toFixed(1)}s`) : "待機（どこでも要請可）";
    const camp = campHudText(w, isCampUnlocked(this.cmdLocked));
    const out: Array<{ text: string; color?: string; weight?: 400 | 600 | 700 }> = [];
    if (this.paused) out.push({ text: SORTIE_PAUSE_LABEL, color: "#d29922", weight: 700 });
    const banner = invadeIntelBannerText(w.invadeSector);
    if (banner) out.push({ text: banner, color: "#d29922" });
    if (w.phase === "sortie" && !w.operationTimedOut && w.timeLeft > 0 && w.timeLeft <= 30) out.push({ text: "あと30秒で強制救助", color: CANVAS_THEME.spend, weight: 700 });
    if (w.phase === "sortie" && !w.leader.alive) out.push({ text: "隊長機大破 — 撤退できます（救助費用：所持金の半分）・時間切れまで待つと、救助費用は所持金の¾", color: CANVAS_THEME.spend });
    out.push({ text: `残時間 ${time.text} · 回収 ${w.salvaged} · 実弾 ${ammo} · 隊長HP ${Math.ceil(w.leader.hp)}`, color: time.className ? CANVAS_THEME.spend : undefined, weight: 600 });
    out.push({ text: `帰還 ${extract} · ${w.leader.inCover ? "カバー ON" : "カバー OFF"}${camp == null ? "" : ` · ${camp}`}` });
    out.push({ text: leaderLoadHud(w), color: CANVAS_THEME.muted });
    // Top-edge 帰還 HUD of the existing map (as a HUD line here, CANVAS-X4).
    const req = boardingRequirementsHud(w);
    if (!req.active) out.push({ text: `帰還 未要請 · X で展開 · 必須:${req.mustBeIn}`, color: CANVAS_THEME.muted });
    else {
      const seconds = req.liftOffEta != null ? `離昇 ${req.liftOffEta.toFixed(1)}s` : "離昇直前";
      const sub = req.cargoArrived ? "貨物済·待機" : req.cargoEta != null ? `貨物 ${req.cargoEta.toFixed(1)}s` : "";
      const must = req.captainInside ? "必須: 隊長円内 OK" : "必須: 隊長円外！戻れ";
      const count = `円内 ${req.insideCount}/${req.aliveCount}` + (req.outsideCount > 0 ? ` 円外:${req.outsideNames.join("・")}` : " 全員円内");
      out.push({ text: `${seconds}${sub ? " · " + sub : ""} · ${must} · ${count}`, color: req.captainInside ? CANVAS_THEME.gain : CANVAS_THEME.spend, weight: 600 });
    }
    return out;
  }

  /** Sortie screen inside `area` (the app hides the tabs during the sortie, PR6). */
  drawSortie(ui: CanvasUI, area: Rect, dpr: number): void {
    const ctx = ui.context;
    const lines = this.hudLines();
    const L = layoutExploreSortie(area, lines.length);
    this.mapRect = L.map;
    lines.forEach((l, i) => ui.text(l.text, L.hud.x, L.hud.y + 8 + i * LINE + LINE / 2, { size: 12, color: l.color, weight: l.weight, maxW: L.hud.w }));
    this.drawMap(ui, L.map, dpr);
    ui.rawRegion("explore:map", L.map, this.mapHandler);
    ui.scrollArea("explore:controls", L.controls, "auto", (off) => {
      const originY = L.controls.y - off;
      const pad = L.side ? 0 : 8;
      const f = new Flow(ui, L.controls.x + pad, originY, L.controls.w - pad * 2, originY);
      this.drawControls(ui, f);
      f.gap(12);
      return f.y - originY;
    });
    if (this.toast) {
      ctx.font = fontSpec(13, 600);
      const tw = Math.min(L.map.w - 16, ctx.measureText(this.toast).width + 24);
      const r = { x: L.map.x + (L.map.w - tw) / 2, y: L.map.y + L.map.h - 40, w: tw, h: 30 };
      ui.panel(r, { fill: "#000000cc", edge: CANVAS_THEME.panelEdge, radius: 8 });
      ui.text(this.toast, r.x + r.w / 2, r.y + r.h / 2, { size: 13, weight: 600, align: "center", maxW: r.w - 12 });
    }
    if (this.paused && this.world.phase === "sortie") {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#000000";
      ctx.fillRect(L.map.x, L.map.y, L.map.w, L.map.h);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Paused: the next tap anywhere only resumes (the existing page's capture
   * listener). Drawn last, in its own top layer, so no button, map, scroll or
   * target picker under it receives that tap.
   */
  drawPauseCover(ui: CanvasUI, width: number, height: number): void {
    if (!(this.paused && this.world.phase === "sortie")) return;
    const full: Rect = { x: 0, y: 0, w: width, h: height };
    const map = this.mapRect;
    ui.modal("explore:pause", () => {
      ui.rawRegion("explore:resume", full, {
        down: () => {
          if (playLogBlocked()) return;
          this.paused = sortiePausedAfter("tap", this.paused);
          this.last = this.now();
          this.host.redraw();
        },
        move: () => {}, up: () => {}, cancel: () => {},
      });
      ui.text(SORTIE_PAUSE_LABEL, map.x + map.w / 2, map.y + map.h / 2, { size: 16, weight: 700, align: "center", maxW: Math.max(120, map.w - 16) });
    });
  }

  private drawMap(ui: CanvasUI, r: Rect, dpr: number): void {
    const ctx = ui.context as unknown as CanvasRenderingContext2D;
    if (!this.host.createCanvas || typeof ctx.drawImage !== "function") {
      ui.panel(r, { fill: "#0b0f14", radius: 0 });
      return;
    }
    // Off-screen map at the map's CSS size × DPR: render.ts draws in its own
    // CSS pixels (status badges keep their on-screen size), then one copy.
    const off = (this.offscreen ??= this.host.createCanvas());
    const bw = Math.max(1, Math.round(r.w * dpr)), bh = Math.max(1, Math.round(r.h * dpr));
    if (off.width !== bw) off.width = bw;
    if (off.height !== bh) off.height = bh;
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.setTransform(bw / r.w, 0, 0, bh / r.h, 0, 0);
    withViewCamera(this.world, this.currentGesture().zoom, () => renderWorld(octx, this.world, r.w, r.h));
    ctx.drawImage(off, r.x, r.y, r.w, r.h);
    ctx.strokeStyle = CANVAS_THEME.panelEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }

  private drawControls(ui: CanvasUI, f: Flow): void {
    const w = this.world;
    const timedOut = isOperationTimedOut(w);
    const alive = captainActive(w);
    const btns: FlowButton[] = [];
    // Q3: return / retreat never need a circuit.
    btns.push({
      id: "explore:extract",
      label: !alive ? "大破・帰還要請不可" : w.boarding ? "帰還シーケンス中…" : "帰還要請（搭乗円）",
      variant: "primary",
      disabled: !!w.boarding || timedOut || !alive,
      onActivate: () => this.run({ id: "extract" }),
    });
    if (canStripWreck(w)) btns.push({
      id: "explore:strip",
      label: `残骸盾${this.stripTargetPending ? "：対象選択" : activeStripping(w, w.leader.id) ? "：剥離中" : ""}`,
      variant: this.stripTargetPending ? "primary" : "normal",
      disabled: !w.leader.alive || timedOut || !!wreckCarrierId(w, w.leader.id),
      onActivate: () => this.toggleStrip(),
    });
    if (canBuildBarricade(w, w.leader)) btns.push({
      id: "explore:barricade",
      label: w.barricades?.jobs[w.leader.id]?.kind === "build" ? "屹立：作業中" : "屹立",
      disabled: barricadeWorking(w, w.leader.id),
      onActivate: () => this.buildBarricade(),
    });
    for (const b of circuitButtons(w)) btns.push({ id: `explore:circuit:${b.id}`, label: b.label, onActivate: () => { if (this.inputLocked()) return; beginCircuitButton(this.world, b.id); this.host.redraw(); } });
    for (const g of GATED_BUTTONS) {
      if (this.cmdLocked(g.cmd)) continue; // C20-a: locked commands are not shown
      btns.push({ id: `explore:${g.id}`, label: g.label, disabled: timedOut, onActivate: () => this.run({ id: g.cmd }) });
    }
    btns.push({ id: "explore:cover", label: w.leader.inCover ? "カバー解除" : "カバー", variant: w.leader.inCover ? "primary" : "normal", onActivate: () => { if (!this.inputLocked()) this.toggleCover(); } });
    if (retreatButtonShown(w.leader.alive) && !this.rescueConfirm) btns.push({ id: "explore:rescue", label: "救助撤退", variant: "danger", onActivate: () => { if (this.inputLocked()) return; this.rescueConfirm = true; this.host.redraw(); } });
    f.buttons(btns);
    if (retreatButtonShown(w.leader.alive) && this.rescueConfirm) {
      f.gap(6).text(rescueConfirmCopy(previewHeldCredits()), { color: "#d29922" });
      f.gap(4).buttons([
        { id: "explore:rescue-yes", label: "撤退", variant: "danger", onActivate: () => { if (this.inputLocked()) return; this.rescueConfirm = false; rescueAbortFromHub(this.world); this.host.redraw(); } },
        { id: "explore:rescue-no", label: "やめる", onActivate: () => { this.rescueConfirm = false; this.host.redraw(); } },
      ]);
    }
    this.drawShieldPanel(f);
    this.drawWingPalette(f);
    this.drawSquadOrders(f);
    f.gap(8).text(sortieHelpText(this.cmdLocked), { size: 11, color: CANVAS_THEME.muted });
    this.drawWingPanel(ui, f);
    this.drawLog(ui, f);
    this.drawKeys(f);
    this.drawDebugOpener(f);
  }

  /**
   * Debug mode only: reach the debug area from 探索 (tabs are hidden in the sortie).
   * The circuit-lock toggle itself stays in the HTML area, never on the canvas.
   */
  private drawDebugOpener(f: Flow): void {
    const open = this.host.openDebug;
    if (!open) return;
    f.gap(12).buttons([{ id: "explore:debug-open", label: "検証用の欄へ ▼", onActivate: () => { if (!this.inputLocked()) open(); } }]);
  }

  /** 残骸盾 (existing btn-strip). */
  private toggleStrip(): void {
    const w = this.world;
    if (this.inputLocked() || !canStripWreck(w)) return;
    interruptStripping(w, w.leader.id); interruptBarricade(w, w.leader.id);
    this.stripTargetPending = !this.stripTargetPending;
    if (w.circuitPlay) { w.circuitPlay.pending = null; w.circuitPlay.wingSelect = null; }
    if (this.stripTargetPending) this.flash("近くの残骸をタップしてください");
    this.host.redraw();
  }
  /** 屹立 (existing btn-barricade). */
  private buildBarricade(): void {
    if (this.inputLocked()) return;
    if (startBarricade(this.world, this.world.leader)) {
      this.input.clickMove = null; this.input.fire = false; this.input.interact = false; this.stripTargetPending = false;
      this.host.redraw();
    } else this.flash("この位置には設置できません");
  }

  /** Existing #shield-panel: ground-shield pickup list, held shields, selected barricade. */
  private drawShieldPanel(f: Flow): void {
    const w = this.world, leader = w.leader;
    const hp = (key: string) => { const item = shieldItem(w, key)!; return `${Number(item.hp.toFixed(1))}/${Number(item.maxHp.toFixed(1))}`; };
    const sel = this.selectedShieldPosition;
    const group = sel ? groundShieldGroups(w).find((g) => g.pos.x === sel.x && g.pos.y === sel.y) : null;
    const ground = sortedGroundShields(w, group?.keys ?? []);
    if (ground.length) {
      f.gap(8).card("explore:shield-ground", (c) => {
        c.text("盾の回収候補", { weight: 700 });
        for (const key of ground) {
          const owner = shieldReservedBy(w, key), own = owner === leader.id;
          c.gap(4).buttons([{ id: `explore:shield-pick:${key}`, label: own ? "回収中" : "回収", sub: `盾 ${hp(key)}${owner ? "・回収中" : ""}`, disabled: own, w: 160, onActivate: () => {
            if (this.inputLocked()) return;
            this.stripTargetPending = false;
            if (this.world.circuitPlay) { this.world.circuitPlay.pending = null; this.world.circuitPlay.wingSelect = null; }
            const result = startShieldPickup(this.world, this.world.leader, key);
            if (result === "far") this.flash("盾が遠すぎます");
            else if (result === "none") this.flash("この盾は回収できません");
            for (const m of takeShieldNotices(this.world)) this.flash(m);
            this.host.redraw();
          } }]);
        }
      });
    }
    const equipped = equippedShield(w, leader), spares = spareShields(w, leader);
    const held = [...(equipped ? [{ key: equipped.key, label: "装備盾" }] : []), ...spares.map((r) => ({ key: r.key, label: "予備盾" }))];
    if (held.length) {
      f.gap(8).card("explore:shield-held", (c) => {
        c.text("所持盾", { weight: 700 });
        for (const h of held) {
          const locked = w.shieldState?.exchanges?.[leader.id]?.key === h.key;
          c.gap(4).buttons([{ id: `explore:shield-drop:${h.key}`, label: "投棄", sub: `${h.label} ${hp(h.key)}${locked ? "・交換中" : ""}`, disabled: locked, w: 160, onActivate: () => {
            if (this.inputLocked()) return;
            dropOwnedShield(this.world, this.world.leader, h.key);
            this.host.redraw();
          } }]);
        }
      });
    }
    const key = this.selectedBarricadeKey;
    const b = key ? w.barricades?.walls[key] : null;
    const item = key && b ? shieldItem(w, key) : null;
    if (key && b && item) {
      const u = w.leader;
      const disabled = !u.alive || w.operationTimedOut || Math.hypot(u.pos.x - b.pos.x, u.pos.y - b.pos.y) > u.radius * 2 || !!w.barricades!.jobs[u.id];
      f.gap(8).card("explore:barricade-panel", (c) => {
        c.text(`設置盾 ${Number(item.hp.toFixed(1))}/${Number(item.maxHp.toFixed(1))}`, { weight: 700 });
        c.gap(4).buttons([{ id: "explore:barricade-dismantle", label: "撤去", disabled, onActivate: () => {
          if (this.inputLocked()) return;
          if (startDismantle(this.world, key)) { this.input.clickMove = null; this.input.fire = false; this.input.interact = false; this.host.redraw(); }
        } }]);
      });
    }
  }

  /**
   * DEBUG circuit-lock toggle (preview builds only, existing debug-unlock-bar).
   * Shown in the page's debug area, not on the canvas (神宮決定 2026-11-06).
   */
  debugUnlock(): { mode: string; next: string } | null {
    if (!isDebugUnlockToggleVisible()) return null;
    const mode = this.world.commandUnlock.mode;
    const next = mode === "release" ? "all_unlocked" : "release";
    return { mode: COMMAND_UNLOCK_MODE_LABEL[mode], next: COMMAND_UNLOCK_MODE_LABEL[next] };
  }
  toggleDebugUnlock(): void {
    if (this.inputLocked() || !isDebugUnlockToggleVisible()) return;
    const w = this.world;
    const next = w.commandUnlock.mode === "release" ? "all_unlocked" : "release";
    writeDebugCommandUnlockMode(next);
    w.commandUnlock.mode = next;
    if (w.circuitPlay) w.circuitPlay.release = next === "release";
    else attachCircuitPlay(w, this.readHub(), next === "release");
    this.host.redraw();
  }

  /** Existing #wing-panel: one card per wingman (gauge, status, load, orders). Tapping a card opens the palette. */
  private drawWingPanel(ui: CanvasUI, f: Flow): void {
    const w = this.world;
    if (w.wingmen.length === 0) return;
    const now = this.now();
    f.gap(12).text("僚機指揮（オフスクリーン可）", { weight: 700 });
    const selectable = new Set(paletteWingmen(w));
    const stances: Stance[] = ["escort", "patrol", "recover", "raid"];
    for (const u of w.wingmen) {
      const st = wingStatus(w, u);
      const selected = !!w.circuitPlay?.wingSelect?.ids.includes(u.id);
      f.gap(6).card(`explore:wing:${u.id}`, (c) => {
        const top = c.y;
        // The card itself (behind its buttons): open the palette for this wingman (P1).
        if (selectable.has(u.id)) {
          const h = ui.memo.get(`card:explore:wing:${u.id}:h`) ?? 60;
          ui.region(`explore:wing-card:${u.id}`, { x: c.x - 12, y: top - 12, w: c.w + 24, h }, { onActivate: () => {
            if (this.inputLocked()) return;
            if (openWingPalette(this.world, [u.id])) this.host.redraw();
          } });
        }
        const badgeColor = st.tone === "danger" ? CANVAS_THEME.spend : st.tone === "combat" ? "#f0883e" : st.tone === "warn" ? "#d29922" : CANVAS_THEME.muted;
        const gm = exploreMechGaugeModel(w, u);
        drawMechGauge(ui, gm, c.x, top, GAUGE_PX);
        ui.region(`explore:gauge:${u.id}`, { x: c.x, y: top, w: GAUGE_PX, h: GAUGE_PX }, { onActivate: () => {
          this.gaugeShown.set(u.id, this.now() + GAUGE_TEXT_MS);
          this.host.setTimer?.(() => this.host.redraw(), GAUGE_TEXT_MS + 30);
          this.host.redraw();
        } });
        const tx = c.x + GAUGE_PX + 10, tw = c.w - GAUGE_PX - 10;
        ui.text(`${u.name}${u.alive ? "" : "（撃破）"}`, tx, top + 10, { size: 14, weight: 700, maxW: tw * 0.55 });
        ui.text(st.badge, c.x + c.w, top + 10, { size: 12, weight: 600, color: badgeColor, align: "right", maxW: tw * 0.45 });
        const shown = (this.gaugeShown.get(u.id) ?? 0) > now;
        const quirk = u.quirk != null ? ` · 癖:${QUIRK_LABEL[u.quirk]}` : "";
        const sh = shieldHudText(w, u);
        const line = shown ? gm.text : `${loadLineJa(w, u)}${sh ? `・${sh}` : ""}${wreckCarrierId(w, u.id) ? "・搭載中" : ""}${quirk}${u.inCover ? " · カバー" : ""}`;
        ui.text(line, tx, top + 32, { size: 11, color: shown ? CANVAS_THEME.text : CANVAS_THEME.muted, maxW: tw });
        c.y = top + GAUGE_PX + 6;
        // C20-a: decided per wingman; locked stances / 召還 are not shown.
        const orders: FlowButton[] = [];
        if (!(w.circuitPlay?.release || this.cmdLocked("wing_escort", u.id))) orders.push({ id: `explore:rally:${u.id}`, label: "召還", onActivate: () => this.run({ id: "wing_escort", wingId: u.id, rally: true }) });
        for (const s2 of stances) {
          if (this.cmdLocked(WING_COMMAND_FOR_STANCE[s2], u.id)) continue;
          orders.push({ id: `explore:order:${u.id}:${s2}`, label: STANCE_LABEL[s2], variant: u.stance === s2 ? "primary" : "normal", onActivate: () => this.run({ id: WING_COMMAND_FOR_STANCE[s2], wingId: u.id }) });
        }
        if (orders.length) c.buttons(orders);
      }, { highlight: selected, edge: st.tone === "danger" ? CANVAS_THEME.spend : st.offscreen ? "#d29922" : undefined });
    }
  }

  /** Existing #log-panel: 戦術／戦報, follows the latest unless scrolled up; repair rows copy their details. */
  private drawLog(ui: CanvasUI, f: Flow): void {
    const w = this.world;
    f.gap(12).text("戦術／戦報", { weight: 700 });
    if (w.enemyTag) f.text(ENEMY_UNKNOWN_JA, { size: 12, color: CANVAS_THEME.muted });
    const rect: Rect = { x: f.x, y: f.y + 4, w: f.w, h: LOG_H };
    ui.panel(rect, { fill: CANVAS_THEME.bg, radius: 6 });
    const id = "explore:log";
    const feed = this.log;
    // A scroll up by the player (never by new rows) stops the follow; back at the bottom resumes it.
    const cur = ui.getScroll(id), max = ui.maxScroll(id);
    if (feed.follow && cur < this.logScroll - 1) feed.follow = false;
    else if (!feed.follow && cur >= max - 1 && max > 0 && cur !== this.logScroll) { feed.follow = true; feed.unread = 0; }
    if (feed.follow && cur < max) ui.scrollTo(id, max);
    ui.scrollArea(id, rect, "auto", (off) => {
      const ctx = ui.context;
      ctx.font = fontSpec(12);
      let y = rect.y + 6 - off;
      if (feed.rows.length === 0) { ui.text("戦術／戦報はここに出ます。", rect.x + 8, y + LOG_LINE / 2, { size: 12, color: CANVAS_THEME.muted }); y += LOG_LINE; }
      for (const r of feed.rows) {
        const lines = wrapText(ctx, r.text, rect.w - 20);
        const color = r.kind === "tactical" ? "#9aa0a6" : "#ff9b9b";
        const h = lines.length * LOG_LINE + 4;
        if (y + h >= rect.y && y <= rect.y + rect.h) {
          lines.forEach((l, i) => ui.text(l, rect.x + 8, y + i * LOG_LINE + LOG_LINE / 2, { size: 12, color }));
          if (r.repair) {
            const repair = r.repair;
            ui.region(`explore:log-repair:${r.key}`, { x: rect.x, y, w: rect.w, h }, { onActivate: () => {
              const copy = this.host.copy;
              if (!copy) { this.flash("コピーに失敗しました"); return; }
              copy(repairDetails(repair)).then(() => this.flash("修復詳細をコピーしました"), () => this.flash("コピーに失敗しました"));
            } });
          }
        }
        ctx.font = fontSpec(12);
        y += h;
      }
      return y + 6 - (rect.y - off);
    });
    this.logScroll = ui.getScroll(id);
    f.y = rect.y + rect.h;
    if (feed.unread > 0) {
      f.gap(4).buttons([{ id: "explore:log-unread", label: unreadLabel(feed.unread), onActivate: () => { feed.follow = true; feed.unread = 0; ui.scrollTo(id, 1e9); } }]);
    }
  }

  /** Key table (PC only, CANVAS-Y4): the existing overlay rows, toggled with 「キー」 or ?. */
  private drawKeys(f: Flow): void {
    if (this.host.touch) return;
    f.gap(12).buttons([{ id: "explore:keys", label: this.keysHidden ? "キー" : "キーを隠す", onActivate: () => this.toggleKeys() }]);
    if (this.keysHidden) return;
    f.gap(6);
    for (const row of shortcutRows(this.cmdLocked)) f.kv(row.keys.join(" / "), row.label, { size: 12, lineH: 18 });
  }

  /** P1 wingman palette (existing wing-palette-row). */
  private drawWingPalette(f: Flow): void {
    const w = this.world;
    const p = w.circuitPlay;
    if (w.phase !== "sortie" || !p) return;
    const eligible = paletteWingmen(w);
    if (eligible.length === 0) return;
    const sel = p.wingSelect ?? null;
    const allOn = !!sel && eligible.every((id) => sel.ids.includes(id)) && sel.ids.length > 1;
    const btns: FlowButton[] = [{ id: "explore:wing-all", label: "全僚機", variant: allOn ? "primary" : "normal", onActivate: () => { if (this.inputLocked()) return; openWingPalette(this.world, paletteWingmen(this.world)); this.host.redraw(); } }];
    f.gap(8);
    if (sel) {
      const names = sel.ids.map((id) => w.wingmen.find((u) => u.id === id)?.name ?? id).join("・");
      f.text(`僚機：${names}`, { size: 12, color: CANVAS_THEME.muted });
      if (p.pending?.kind === "wing_move") f.text("地図をタップして地点を指定", { size: 12, color: "#d29922" });
      else if (p.pending?.kind === "wing_recover") f.text("回収する機体・残骸・コンテナをタップ", { size: 12, color: "#d29922" });
      else for (const a of wingmanPaletteActions(w, sel.ids)) btns.push({ id: `explore:wing-act:${a.id}`, label: a.label, onActivate: () => { if (this.inputLocked()) return; pressWingPalette(this.world, a.id); this.host.redraw(); } });
    }
    f.gap(4).buttons(btns);
  }

  /** 小隊方針 bar (existing squad-order-bar; not in release mode). */
  private drawSquadOrders(f: Flow): void {
    if (this.world.circuitPlay?.release) return;
    const items = SQUAD_ORDER_KEYS.filter(({ stance }) => !this.cmdLocked(WING_COMMAND_FOR_STANCE[stance]));
    if (items.length === 0) return;
    f.gap(8).text("小隊方針", { size: 12, color: CANVAS_THEME.muted });
    f.gap(2).buttons(items.map(({ stance, key }) => ({
      id: `explore:squad:${stance}`,
      label: `${key} ${STANCE_LABEL[stance]}`,
      onActivate: () => this.run({ id: WING_COMMAND_FOR_STANCE[stance] }),
    })), { fill: true });
  }
}
