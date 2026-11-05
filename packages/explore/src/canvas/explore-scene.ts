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
 * U-5b (not here yet): wing cards and gauges, shield / barricade / stripping
 * panels, the log panel, the keyboard overlay, the debug unlock toggle and
 * the Alpha Lab band. Their state is kept exactly as the existing page sets it.
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
  type FlowButton,
  type HubSnapshot,
  type PickerSpec,
  type RawPointerHandler,
  type RawPointerSample,
  type Rect,
} from "@estg/shared";
import type { Stance, World } from "../game/types";
import { STANCE_LABEL } from "../game/types";
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
const SQUAD_ORDER_KEYS: ReadonlyArray<{ stance: Stance; key: string }> = [
  { stance: "escort", key: "1" },
  { stance: "patrol", key: "2" },
  { stance: "recover", key: "3" },
  { stance: "raid", key: "4" },
];
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
  keyDown(key: string, repeat: boolean): boolean {
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
    if (playLogBlocked()) return;
    this.afterCommand(executeExploreCommand(this.world, req));
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
      if (this.world.phase !== "sortie" || playLogBlocked()) return;
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
          if (playLogBlocked()) return;
          // Sortie-guard guidance（神宮決定 2026-11-01）: HUB shows where to fix it.
          try { this.host.session().setItem(SORTIE_GUARD_RETURN_KEY, "1"); } catch { /* private mode: no banner */ }
          this.host.go(resolveModuleBaseUrl("trade"));
        } }]);
      }
      if (Object.values(w.mechBattery).some((b) => b.activity <= 0)) c.gap(6).text("活動量0の機体は出撃すると残骸になります。格納庫の各機体の「充電」で電力パーツを使って充電してください。", { color: "#d29922" });
      if (this.preSortieAmmoNote) c.gap(6).text(this.preSortieAmmoNote, { color: "#d29922" });
      c.gap(8).text(briefingHelpText(this.cmdLocked), { size: 12, color: CANVAS_THEME.muted });
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
      this.drawControls(f);
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
    // Paused: the next tap anywhere only resumes (existing capture listener).
    if (this.paused && this.world.phase === "sortie") {
      ui.rawRegion("explore:resume", { x: 0, y: 0, w: area.x * 2 + area.w, h: area.y + area.h + 200 }, {
        down: () => {
          if (playLogBlocked()) return;
          this.paused = sortiePausedAfter("tap", this.paused);
          this.last = this.now();
          this.host.redraw();
        },
        move: () => {}, up: () => {}, cancel: () => {},
      });
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#000000";
      ctx.fillRect(L.map.x, L.map.y, L.map.w, L.map.h);
      ctx.globalAlpha = 1;
      ui.text(SORTIE_PAUSE_LABEL, L.map.x + L.map.w / 2, L.map.y + L.map.h / 2, { size: 16, weight: 700, align: "center", maxW: L.map.w - 16 });
    }
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

  private drawControls(f: Flow): void {
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
    for (const b of circuitButtons(w)) btns.push({ id: `explore:circuit:${b.id}`, label: b.label, onActivate: () => { if (playLogBlocked()) return; beginCircuitButton(this.world, b.id); this.host.redraw(); } });
    for (const g of GATED_BUTTONS) {
      if (this.cmdLocked(g.cmd)) continue; // C20-a: locked commands are not shown
      btns.push({ id: `explore:${g.id}`, label: g.label, disabled: timedOut, onActivate: () => this.run({ id: g.cmd }) });
    }
    btns.push({ id: "explore:cover", label: w.leader.inCover ? "カバー解除" : "カバー", variant: w.leader.inCover ? "primary" : "normal", onActivate: () => { if (!playLogBlocked()) this.toggleCover(); } });
    if (retreatButtonShown(w.leader.alive) && !this.rescueConfirm) btns.push({ id: "explore:rescue", label: "救助撤退", variant: "danger", onActivate: () => { this.rescueConfirm = true; this.host.redraw(); } });
    f.buttons(btns);
    if (retreatButtonShown(w.leader.alive) && this.rescueConfirm) {
      f.gap(6).text(rescueConfirmCopy(previewHeldCredits()), { color: "#d29922" });
      f.gap(4).buttons([
        { id: "explore:rescue-yes", label: "撤退", variant: "danger", onActivate: () => { if (playLogBlocked()) return; this.rescueConfirm = false; rescueAbortFromHub(this.world); this.host.redraw(); } },
        { id: "explore:rescue-no", label: "やめる", onActivate: () => { this.rescueConfirm = false; this.host.redraw(); } },
      ]);
    }
    this.drawWingPalette(f);
    this.drawSquadOrders(f);
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
    const btns: FlowButton[] = [{ id: "explore:wing-all", label: "全僚機", variant: allOn ? "primary" : "normal", onActivate: () => { if (playLogBlocked()) return; openWingPalette(this.world, paletteWingmen(this.world)); this.host.redraw(); } }];
    f.gap(8);
    if (sel) {
      const names = sel.ids.map((id) => w.wingmen.find((u) => u.id === id)?.name ?? id).join("・");
      f.text(`僚機：${names}`, { size: 12, color: CANVAS_THEME.muted });
      if (p.pending?.kind === "wing_move") f.text("地図をタップして地点を指定", { size: 12, color: "#d29922" });
      else if (p.pending?.kind === "wing_recover") f.text("回収する機体・残骸・コンテナをタップ", { size: 12, color: "#d29922" });
      else for (const a of wingmanPaletteActions(w, sel.ids)) btns.push({ id: `explore:wing-act:${a.id}`, label: a.label, onActivate: () => { if (playLogBlocked()) return; pressWingPalette(this.world, a.id); this.host.redraw(); } });
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
