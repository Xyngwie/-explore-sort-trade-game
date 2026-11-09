/**
 * INVADE scene on the single canvas (docs/CANVAS_UNIFIED_V0.md §11, U-4).
 *
 * Same rules as the existing Invade page (`main.ts`): the front board and its
 * HubSave.frontProgress session (`hub-persist.ts`), open / mark / chord
 * (`chord.ts`), forced-combat lock and its back trap (`forced-combat.ts`), the
 * forced-handoff intent, ranks (挑む・撤退), regenerate, focus clear, skip,
 * lost mechs / wrecks / field drops on the board, the sortie bar and the
 * Invade→Explore / Invade→HUB URLs, the `invade.<action>` play-log names.
 * Input on the board goes through the existing `BoardGesture` unchanged (300ms
 * hold preview, pan as soon as the finger leaves the cell, pinch, double tap
 * when zoomed out, mouse left / right / Ctrl+left / chord / middle drag, wheel).
 */
import {
  CANVAS_THEME,
  CTA_CHIP,
  CTA_COPY,
  FIRST_CLEAR_DISCOVERY_LINE_JA,
  SECTOR_FRONT_DISTANCE,
  SECTOR_WALL_DISTANCE,
  buildInvadeToExploreUrl,
  buildInvadeToTradeUrl,
  firstClearDiscoveredOnBoard,
  fontSpec,
  invadeRankOf,
  parseTradeToInvadeSearch,
  playLogBlocked,
  roundRectPath,
  sectorDensityAt,
  setPlayLogOperation,
  unlockedInvadeRank,
  type CanvasUI,
  type ConfirmSpec,
  type EngageMode,
  type EnemyCellCoord,
  type Flow,
  type InvadeToExplorePayload,
  type InvadeToTradePayload,
  type PickerSpec,
  type RawPointerHandler,
  type RawPointerSample,
  type Rect,
  type TradeToInvadePayload,
} from "@estg/shared";
import { AOI_HALF, BOARD_SPAN, cellGlyph, countFlagged, densityAfterBoard, forcedEngageTargets, getCell, mergeBoardIntel, minesRemaining, openCell, raidEngageTarget, toggleFlag, type MsBoard, type MsCell } from "../board";
import { BOARD_INPUT, BoardGesture, type BoardAction, type CellBounds, type Coord, type Point } from "../boardInput";
import { chordCells } from "../chord";
import { dangerBandAtCell, dangerBandHintJa, dangerBandLabelJa, exploredFeelLabelJa, frontProgressFeel, isPendingMineCell, isResolvedMineCell } from "../front-feel";
import { changeFrontRank, clearPersistedFrontProgress, loadOrCreateFrontSession, persistFrontSessionWithClear, readStoredHub, regenerateFrontSession } from "../hub-persist";
import { cellKey, fieldDropSortieLineJa, lostMechSortieLineJa, wreckSortieLineJa } from "../lost-mechs";
import { armForcedLockHistory, forcedLockBackAction, isForcedCombatLock, markForcedHandoffIntent } from "../forced-combat";

type SectorSel = { sx: number; sy: number };
export const RANK_PAGE_SIZE = 100;
const NUM_COLOR = ["", "#58a6ff", "#3fb950", "#f85149", "#a371f7", "#d29922", "#39c5cf", "#e6edf3", "#8b949e"];

export type InvadeHost = {
  search: string;
  /** HUB on this page (Invade→HUB URLs are built on it). */
  hubBase: string;
  exploreBase: string;
  go: (url: string) => void;
  redraw: () => void;
  history: Pick<History, "state" | "pushState">;
  href: () => string;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
};

export type SortieBar = {
  tone: "hint" | "ok" | "locked" | "resolved";
  lines: string[];
  chip?: string;
  buttons: Array<{ id: string; label: string; url: string; forced?: boolean; variant?: "primary" | "danger" | "normal" }>;
};

export class InvadeScene {
  readonly inbound: TradeToInvadePayload | null;
  board: MsBoard;
  selected: SectorSel | null;
  skipped: boolean;
  lastBoardLog: string | null;
  lostByCell: Map<string, string[]>;
  dropsByCell: Map<string, string[]>;
  wrecksByCell: Map<string, string[]>;
  reversedTouch = false;
  private forcedLockHistoryArmed = false;
  private lastSavedStatus: MsBoard["status"];
  private firstClearOnThisBoard: boolean;
  rankListPage: number;
  rankChoice: number | null = null;
  retreatChoice: number | null = null;
  confirm: ConfirmSpec | null = null;
  picker: PickerSpec | null = null;
  /* view (bindBoardInput's `view`, in viewport px) */
  view = { scale: 1, x: 0, y: 0 };
  private viewport: Rect | null = null;
  private preview: { cell: Coord; kind: "mark" | "unmark" | "open"; at: number } | null = null;
  readonly gesture: BoardGesture;
  constructor(private readonly host: InvadeHost) {
    this.inbound = parseTradeToInvadeSearch(host.search);
    const s = loadOrCreateFrontSession();
    this.board = s.board;
    this.selected = s.focus;
    this.skipped = this.selected == null;
    this.lastBoardLog = s.restored
      ? `前線進捗を HubSave から復元 — 敵 ${this.board.mineCount} · seed ${this.board.seed ?? "—"}`
      : `前線盤生成 — ${BOARD_SPAN}×${BOARD_SPAN} · 敵 ${this.board.mineCount} · HQ 開放 · seed ${this.board.seed ?? "—"}`;
    this.lostByCell = s.lostByCell; this.dropsByCell = s.dropsByCell; this.wrecksByCell = s.wrecksByCell;
    this.lastSavedStatus = this.board.status;
    this.firstClearOnThisBoard = firstClearDiscoveredOnBoard(readStoredHub(), this.board.seed);
    this.rankListPage = Math.floor(invadeRankOf(readStoredHub()).current / RANK_PAGE_SIZE);
    const clock = host.now && host.setTimer && host.clearTimer
      ? { now: host.now, set: host.setTimer, clear: host.clearTimer }
      : undefined;
    this.gesture = new BoardGesture({
      hit: (p) => this.hit(p),
      bounds: (c) => this.cellRect(c),
      preview: (c) => this.setPreview(c),
      action: (a, c) => this.applyBoardAction(a, c),
      pan: (x, y) => { this.view.x += x; this.view.y += y; this.clampView(); this.host.redraw(); },
      zoom: (f, p) => this.zoom(f, p),
      zoomedOut: () => this.view.scale < BOARD_INPUT.doubleTapBelow,
    }, clock);
    this.armForcedLockIfNeeded();
  }
  private now(): number { return this.host.now?.() ?? performance.now(); }
  /** The board viewport as last drawn (verification scripts). */
  get boardViewport(): Rect | null { return this.viewport; }
  dispose(): void { this.gesture.cancel(); }

  /* ------------------------------ rules (main.ts) ----------------------------- */
  forcedLockActive(): boolean { return isForcedCombatLock(this.board); }
  armForcedLockIfNeeded(): void {
    if (!this.forcedLockActive() || this.forcedLockHistoryArmed) return;
    armForcedLockHistory(this.host.history, this.host.href());
    this.forcedLockHistoryArmed = true;
  }
  /** popstate: true = swallowed (forced lock back trap), the scene stays. */
  onPopstate(): boolean {
    if (!forcedLockBackAction(this.board).block) return false;
    this.forcedLockHistoryArmed = false;
    this.armForcedLockIfNeeded();
    return true;
  }
  private saveFrontProgress(): void {
    const justWon = this.board.status === "won" && this.lastSavedStatus !== "won";
    const r = persistFrontSessionWithClear(this.board, this.selected, undefined, { justWon });
    if (r.saved) this.lastSavedStatus = this.board.status;
    else this.lastBoardLog = "進捗を保存できませんでした。段位の更新は保存されていません。";
    if (r.discovered) this.firstClearOnThisBoard = true;
  }
  private op(id: string, ctx: Record<string, string | number> = {}): boolean {
    if (playLogBlocked()) return false;
    setPlayLogOperation(`invade.${id}`, ctx);
    return true;
  }
  applyBoardAction(action: BoardAction, { sx, sy }: Coord): void {
    if (playLogBlocked()) return;
    setPlayLogOperation(`invade.${action}`, { sx, sy });
    const board = this.board;
    const cell = getCell(board, sx, sy); if (!cell || cell.blocked) return;
    if (this.forcedLockActive()) {
      if (cell.open && cell.mine) { this.selected = { sx, sy }; this.skipped = false; this.saveFrontProgress(); this.host.redraw(); }
      return;
    }
    const flag = action === "right" || (action === "tap" && !this.reversedTouch) || (action === "hold" && this.reversedTouch);
    let chordHit: Coord | null = null;
    if (cell.open) {
      if (!cell.mine && (action === "chord" || action === "tap")) {
        const r = chordCells(board, sx, sy); chordHit = r.hit;
        this.lastBoardLog = `周囲開放 (${sx},${sy}) ×${r.opened}`;
      } else this.lastBoardLog = `ルート焦点 (${sx},${sy})`;
    } else if (action === "chord") return;
    else if (flag) { const r = toggleFlag(board, sx, sy); if (!r.ok) return; this.lastBoardLog = r.flagged ? `敵位置をマーク (${sx},${sy})` : `マーク解除 (${sx},${sy})`; }
    else {
      const r = openCell(board, sx, sy);
      if (!r.ok) { if (r.reason === "flagged") { this.selected = { sx, sy }; this.skipped = false; this.lastBoardLog = `マーク付きマス (${sx},${sy}) は開けません`; this.saveFrontProgress(); this.host.redraw(); } return; }
      this.lastBoardLog = `開放 (${sx},${sy}) ×${r.opened} · 残敵 ${minesRemaining(board)}`;
    }
    this.selected = chordHit ?? { sx, sy }; this.skipped = false;
    if (board.hitMine) this.lastBoardLog = `敵接触 (${this.selected.sx},${this.selected.sy}) → scoutHazard · 強制出撃 敵 ${forcedEngageTargets(board, this.selected.sx, this.selected.sy).length} マス`;
    else if (board.status === "won") this.lastBoardLog = "掃討完了 → sectorCleared";
    this.saveFrontProgress();
    this.armForcedLockIfNeeded();
    this.host.redraw();
  }
  private adopt(session: ReturnType<typeof regenerateFrontSession>): void {
    this.board = session.board; this.selected = session.focus; this.lastSavedStatus = this.board.status;
    this.firstClearOnThisBoard = firstClearDiscoveredOnBoard(readStoredHub(), this.board.seed);
    this.lostByCell = session.lostByCell; this.dropsByCell = session.dropsByCell; this.wrecksByCell = session.wrecksByCell;
    this.reversedTouch = false; this.forcedLockHistoryArmed = false;
    this.resetView();
  }
  moveToRank(rank: number, retreat: boolean): void {
    if (this.forcedLockActive()) return;
    const current = invadeRankOf(readStoredHub()).current;
    if (retreat ? rank >= current || this.board.status === "won" : this.board.status !== "won") return;
    this.ask({
      id: "invade:confirm:rank", title: "段位の確認", text: `${retreat ? "この盤面を諦めて" : "新しい盤面で"}${rank}段に挑みますか？`, okLabel: "挑む",
      onOk: () => {
        if (!this.op(retreat ? "btn-rank-retreat" : "btn-rank-start", { rank })) return;
        const session = changeFrontRank(rank);
        if (!session) { this.lastBoardLog = "段を変更できませんでした。保存状態を確認してください。"; return; }
        this.adopt(session);
        this.skipped = false;
        this.rankListPage = Math.floor(rank / RANK_PAGE_SIZE);
        this.rankChoice = null; this.retreatChoice = null;
        this.lastBoardLog = `${rank}段の盤を開始`;
        this.panel = "main"; // the new board is shown
      },
    });
  }
  regenerate(): void {
    if (this.forcedLockActive()) return;
    this.ask({
      id: "invade:confirm:regen", title: "盤の再生成", okLabel: "再生成する", okVariant: "danger",
      text: "盤を再生成すると、保存済みの前線進捗（開いたマス・マーク・地雷シード・ルート焦点）が消えます。よろしいですか？",
      onOk: () => {
        if (!this.op("btn-regen")) return;
        clearPersistedFrontProgress();
        const session = regenerateFrontSession();
        this.adopt(session);
        this.skipped = false;
        this.lastBoardLog = `盤再生成（進捗リセット）— 敵 ${this.board.mineCount} · HQ 開放 · seed ${this.board.seed ?? "—"}`;
        this.panel = "main";
      },
    });
  }
  clearFocus(): void {
    if (this.forcedLockActive() || this.selected == null || !this.op("btn-clear")) return;
    this.selected = { sx: 0, sy: 0 }; this.skipped = false; this.lastBoardLog = "ルート焦点を HQ に戻した";
    this.saveFrontProgress(); this.host.redraw();
  }
  skip(): void {
    if (this.forcedLockActive() || !this.op("btn-skip")) return;
    this.selected = null; this.skipped = true; this.reversedTouch = false; this.lastBoardLog = "quick-battle スキップ（ナビなし）";
    this.saveFrontProgress(); this.host.redraw();
  }
  toggleTouch(): void { if (this.forcedLockActive()) return; this.gesture.cancel(); this.reversedTouch = !this.reversedTouch; this.host.redraw(); }
  private ask(spec: Omit<ConfirmSpec, "onCancel" | "onOk"> & { onOk: () => void }): void {
    this.confirm = { ...spec, onOk: () => { this.confirm = null; spec.onOk(); this.host.redraw(); }, onCancel: () => { this.confirm = null; } };
  }

  /* ------------------------------ handoff payloads ----------------------------- */
  private baseIntelFlags(sx: number, sy: number): string[] {
    const info = sectorDensityAt(sx, sy);
    const flags: string[] = ["routeHint"];
    if (info.distance >= SECTOR_FRONT_DISTANCE) flags.push("frontLine");
    if (info.density >= 0.7) flags.push("rareSignal");
    return flags;
  }
  sectorPayload(sel: SectorSel, engage?: { mode: EngageMode; enemyCells: EnemyCellCoord[] }): InvadeToTradePayload & InvadeToExplorePayload {
    const info = sectorDensityAt(sel.sx, sel.sy);
    const out: InvadeToTradePayload & InvadeToExplorePayload = {
      sectorX: sel.sx, sectorY: sel.sy, density: densityAfterBoard(info.density, this.board),
      invadeRank: invadeRankOf(readStoredHub()).current,
      neighborCount: getCell(this.board, sel.sx, sel.sy)?.adjacent ?? 0,
      intelFlags: mergeBoardIntel(this.baseIntelFlags(sel.sx, sel.sy), this.board),
    };
    if (engage != null) { out.engage = engage.mode; if (engage.enemyCells.length > 0) out.enemyCells = engage.enemyCells; }
    return out;
  }
  private fmtCells(cells: readonly EnemyCellCoord[]): string { return cells.map((c) => `(${c.sx},${c.sy})`).join(" · ") || "—"; }
  /** The under-grid CTA cluster (cellSortieBarBaseHtml + lost / wreck / drop lines). */
  sortieBar(): SortieBar {
    const sel = this.selected;
    if (sel == null) return { tone: "hint", lines: [`セルを開く／マークすると、この直下から「${CTA_COPY.toExplore}」できます。`], buttons: [] };
    if (sectorDensityAt(sel.sx, sel.sy).blocked) return { tone: "hint", lines: ["壁セルでは出撃できません。"], buttons: [] };
    const board = this.board, cell = getCell(board, sel.sx, sel.sy);
    const locked = this.forcedLockActive();
    const base = this.sectorPayload(sel);
    const hangar = { id: "invade:to-hangar", label: CTA_COPY.toHangar, url: buildInvadeToTradeUrl(base, this.host.hubBase) };
    const forcedTargets = cell && cell.open && cell.mine ? forcedEngageTargets(board, sel.sx, sel.sy) : [];
    const toForced = forcedTargets.length > 0 ? buildInvadeToExploreUrl(this.sectorPayload(sel, { mode: "forced", enemyCells: forcedTargets }), this.host.exploreBase) : null;
    const extras: string[] = [];
    const lostN = this.lostByCell.get(cellKey(sel.sx, sel.sy))?.length ?? 0;
    const wreckN = this.wrecksByCell.get(cellKey(sel.sx, sel.sy))?.length ?? 0;
    const dropN = this.dropsByCell.get(cellKey(sel.sx, sel.sy))?.length ?? 0;
    if (lostN > 0) extras.push(lostMechSortieLineJa(lostN));
    if (wreckN > 0) extras.push(wreckSortieLineJa(wreckN));
    if (dropN > 0) extras.push(fieldDropSortieLineJa(dropN));
    const withExtras = (bar: SortieBar): SortieBar => ({ ...bar, lines: [bar.lines[0], ...extras, ...bar.lines.slice(1)] });
    if (locked) {
      if (toForced == null) return withExtras({ tone: "locked", lines: ["強制戦闘ロック — 他操作不可。", `地雷マスを選ぶと「${CTA_COPY.toExplore}」（${CTA_CHIP.forcedCombat}）が表示されます。`], buttons: [] });
      return withExtras({ tone: "locked", chip: CTA_CHIP.forcedCombat, lines: ["強制戦闘ロック（地雷踏み）— 解決／ハンドオフまで他操作不可。", `cell (${sel.sx},${sel.sy}) · enemyCells: ${this.fmtCells(forcedTargets)}`], buttons: [{ id: "invade:to-explore-forced", label: CTA_COPY.toExplore, url: toForced, forced: true, variant: "danger" }] });
    }
    const raidTargets = cell && cell.flagged && !cell.open ? raidEngageTarget(board, sel.sx, sel.sy) : [];
    if (raidTargets.length > 0) {
      const toRaid = buildInvadeToExploreUrl(this.sectorPayload(sel, { mode: "raid", enemyCells: raidTargets }), this.host.exploreBase);
      return withExtras({ tone: "ok", chip: CTA_CHIP.raid, lines: ["このセルから出撃（マーク · engage=raid）", `(${sel.sx},${sel.sy}) · enemyCells: ${this.fmtCells(raidTargets)}`], buttons: [{ id: "invade:to-explore", label: CTA_COPY.toExplore, url: toRaid, variant: "primary" }, hangar] });
    }
    if (cell && isResolvedMineCell(cell, board) && toForced != null) {
      return withExtras({ tone: "resolved", chip: CTA_CHIP.forcedCombat, lines: [`交戦解決済 — ${CTA_COPY.sortieAgain}できます（${sel.sx},${sel.sy}）`, `cell (${sel.sx},${sel.sy}) · enemyCells: ${this.fmtCells(forcedTargets)} · ロック解除済`], buttons: [{ id: "invade:to-explore", label: CTA_COPY.toExplore, url: toForced, variant: "primary" }, hangar] });
    }
    if (cell && (cell.open || cell.flagged)) {
      const hint = cell.open && !cell.mine && cell.adjacent === 0 ? " · 探索済空白" : cell.flagged ? " · マーク" : "";
      return withExtras({ tone: "ok", lines: [`このセルから出撃（${sel.sx},${sel.sy}${hint}）`], buttons: [{ id: "invade:to-explore", label: CTA_COPY.toExplore, url: buildInvadeToExploreUrl(base, this.host.exploreBase), variant: "primary" }, hangar] });
    }
    return { tone: "hint", lines: [`セル (${sel.sx},${sel.sy}) を開くか敵位置をマークすると、ここから出撃できます。`], buttons: [] };
  }
  /**
   * The URL the existing 「格納庫へ」 uses (Invade→HUB with the selected sector), or
   * null when there is none (no cell selected: the board progress is already saved).
   * The 「‹ 親」 header leaves through it (#358 P1).
   */
  hubReturnUrl(): string | null {
    return this.sortieBar().buttons.find((b) => b.id === "invade:to-hangar")?.url ?? null;
  }
  leave(b: SortieBar["buttons"][number]): void {
    if (playLogBlocked()) return;
    if (b.forced) markForcedHandoffIntent(); // existing data-forced-handoff
    this.host.go(b.url);
  }

  /* ---------------------------------- view ---------------------------------- */
  /** Cell pitch at scale 1: the grid fills the viewport width (25 cells, 1px gaps). */
  private pitch(vpW: number): { cell: number; pitch: number } {
    const cell = (vpW - (BOARD_SPAN - 1)) / BOARD_SPAN;
    return { cell, pitch: cell + 1 };
  }
  private gridSize(vp: Rect): number { return vp.w; }
  clampView(): void {
    const vp = this.viewport; if (!vp) return;
    const g = this.gridSize(vp) * this.view.scale;
    const margin = Math.min(BOARD_INPUT.visibleMarginPx, vp.w / 2);
    this.view.x = Math.max(margin - g, Math.min(vp.w - margin, this.view.x));
    this.view.y = Math.max(margin - g, Math.min(vp.h - margin, this.view.y));
  }
  zoom(f: number, p: Point): void {
    const vp = this.viewport; if (!vp) return;
    const next = Math.max(BOARD_INPUT.minScale, Math.min(BOARD_INPUT.maxScale, this.view.scale * f)), ratio = next / this.view.scale;
    this.view.x = p.x - vp.x - (p.x - vp.x - this.view.x) * ratio;
    this.view.y = p.y - vp.y - (p.y - vp.y - this.view.y) * ratio;
    this.view.scale = next;
    this.clampView(); this.host.redraw();
  }
  home(): void {
    this.gesture.cancel();
    const vp = this.viewport;
    this.view.scale = 1;
    if (vp) {
      const { cell, pitch } = this.pitch(vp.w);
      this.view.x = vp.w / 2 - (AOI_HALF * pitch + cell / 2);
      this.view.y = vp.h / 2 - (AOI_HALF * pitch + cell / 2);
    }
    this.clampView(); this.host.redraw();
  }
  resetView(): void { this.gesture.cancel(); this.view = { scale: 1, x: 0, y: 0 }; this.clampView(); }
  /** Screen rect of a cell (the transformed cell's client rect in the existing page). */
  cellRect(c: Coord): CellBounds | null {
    const vp = this.viewport; if (!vp) return null;
    const { cell, pitch } = this.pitch(vp.w);
    const col = c.sx + AOI_HALF, row = AOI_HALF - c.sy;
    const s = this.view.scale;
    const left = vp.x + this.view.x + col * pitch * s, top = vp.y + this.view.y + row * pitch * s;
    return { left, top, right: left + cell * s, bottom: top + cell * s };
  }
  /** Cell under a point: inside the viewport, on a cell (not a gap), not a wall. */
  hit(p: Point): Coord | null {
    const vp = this.viewport; if (!vp) return null;
    if (p.x < vp.x || p.y < vp.y || p.x >= vp.x + vp.w || p.y >= vp.y + vp.h) return null;
    const { cell, pitch } = this.pitch(vp.w);
    const lx = (p.x - vp.x - this.view.x) / this.view.scale, ly = (p.y - vp.y - this.view.y) / this.view.scale;
    const col = Math.floor(lx / pitch), row = Math.floor(ly / pitch);
    if (col < 0 || row < 0 || col >= BOARD_SPAN || row >= BOARD_SPAN) return null;
    if (lx - col * pitch >= cell || ly - row * pitch >= cell) return null;
    const c = getCell(this.board, col - AOI_HALF, AOI_HALF - row);
    return c && !c.blocked ? { sx: c.sx, sy: c.sy } : null;
  }
  private setPreview(c: Coord | null): void {
    if (!c) { if (this.preview) { this.preview = null; this.host.redraw(); } return; }
    const cell = getCell(this.board, c.sx, c.sy);
    if (!cell || cell.blocked || cell.open || this.forcedLockActive()) return;
    const kind = this.reversedTouch ? (cell.flagged ? "unmark" : "mark") : cell.flagged ? null : "open";
    if (!kind) return;
    this.preview = { cell: c, kind, at: this.now() };
    this.host.redraw();
  }
  animating(): boolean { return !!this.preview && this.preview.kind === "open" && this.now() - this.preview.at < 300; }
  rawHandler(): RawPointerHandler {
    const toSample = (s: RawPointerSample) => ({ id: s.id, type: s.type, button: s.button, buttons: s.buttons, x: s.x, y: s.y, ctrl: s.ctrl });
    return {
      down: (s) => this.gesture.down(toSample(s)),
      move: (s) => this.gesture.move(toSample(s)),
      up: (s) => this.gesture.up(toSample(s)),
      cancel: () => this.gesture.cancel(),
      wheel: (p, dy) => { this.gesture.cancel(); this.zoom(Math.exp(-dy * BOARD_INPUT.wheelSensitivity), p); },
    };
  }

  /* --------------------------------- drawing -------------------------------- */
  /**
   * CANVAS-G4 (神宮決定 2026-11-08): the board screen keeps the board, its status
   * and the sortie bar; the rest is behind 盤の操作・段位・盤の詳細. Panels only
   * change what is drawn under the title; nothing here saves.
   */
  panel: "main" | "ops" | "rank" | "rankUp" | "rankDown" | "detail" = "main";
  openPanel(p: InvadeScene["panel"]): void {
    if (playLogBlocked()) return;
    this.panel = p;
    this.host.redraw();
  }

  draw(ui: CanvasUI, f: Flow, viewportH: number): void {
    const board = this.board;
    const locked = this.forcedLockActive();
    const feel = frontProgressFeel(board);
    const selInfo = this.selected != null ? sectorDensityAt(this.selected.sx, this.selected.sy) : null;
    if (this.panel !== "main") return this.drawPanel(ui, f, locked);
    ui.text("戦線マップ", f.x, f.y + 12, { size: 18, weight: 700 }); f.y += 30;
    if (selInfo != null && !selInfo.blocked && selInfo.distance >= SECTOR_FRONT_DISTANCE)
      f.card("invade:front-warn", (k) => k.text(`⚠ ルート焦点 d≥${SECTOR_FRONT_DISTANCE} — 高密度帯（遠方ほど敵が濃い）。`, { size: 12, color: "#ffdcd7" }), { fill: "#3d1d1d", edge: "#f85149" }).gap(8);
    if (board.status === "won") f.card("invade:status", (k) => { k.text("前線掃討完了 — sectorCleared。探索へ敵残ゼロのインテルを渡せます。", { size: 12, color: "#aff5b4" }); if (this.firstClearOnThisBoard) k.text(FIRST_CLEAR_DISCOVERY_LINE_JA, { size: 12, color: "#aff5b4", weight: 700 }); }, { fill: "#12261e", edge: "#2ea043" }).gap(8);
    else if (board.hitMine || board.status === "hazard") f.card("invade:status", (k) => k.text("敵接触（scoutHazard）。強制戦闘ロック — 強制出撃のみ可。", { size: 12, color: "#ffdcd7" }), { fill: "#3d1d1d", edge: "#f85149" }).gap(8);
    else if (feel.openedMines > 0) f.card("invade:status", (k) => k.text(`交戦解決済の接触マスが ${feel.openedMines} — 「済」セルから再出撃できます（盤操作も再開）。`, { size: 12, color: "#aff5b4" }), { fill: "#12261e", edge: "#2ea043" }).gap(8);
    // Progress feel (one line + bar).
    const pct = Math.round(feel.openSafeRatio * 100);
    f.text(`前線進捗 — ${exploredFeelLabelJa(feel.exploredFeel)}（${pct}%） · 残敵 ${feel.minesRemaining}/${feel.mineCount}`, { size: 12, weight: 700 });
    const ctx = ui.context;
    ctx.fillStyle = CANVAS_THEME.panelEdge; ctx.fillRect(f.x, f.y, f.w, 6);
    ctx.fillStyle = "#58a6ff"; ctx.fillRect(f.x, f.y, f.w * feel.openSafeRatio, 6);
    f.y += 12;
    if (this.lastBoardLog) f.text(this.lastBoardLog, { size: 11, color: CANVAS_THEME.muted });
    // Board viewport.
    const side = Math.max(200, Math.min(f.w, viewportH - 120));
    const vp: Rect = { x: f.x + (f.w - side) / 2, y: f.y, w: side, h: side };
    this.viewport = vp;
    this.clampView();
    this.drawBoard(ui, vp, locked);
    ui.rawRegion("invade:board", vp, this.rawHandler());
    f.y += side + 8;
    this.drawSortieBar(f);
    const progress = invadeRankOf(readStoredHub());
    f.gap(8).buttons([
      { id: "invade:panel:ops", label: "盤の操作", sub: "拠点へ・タッチ・焦点・スキップ・再生成", onActivate: () => this.openPanel("ops") },
      { id: "invade:panel:rank", label: "段位", sub: `挑戦中 ${progress.current}段`, onActivate: () => this.openPanel("rank") },
      { id: "invade:panel:detail", label: "盤の詳細", sub: "状態・凡例・操作の説明", onActivate: () => this.openPanel("detail") },
    ], { fill: true, h: 52 });
    f.gap(8);
  }

  /** The sub-panels: header 「‹ 親」 then that panel only. */
  private drawPanel(ui: CanvasUI, f: Flow, locked: boolean): void {
    const parent = this.panel === "rankUp" || this.panel === "rankDown" ? "rank" : "main";
    const title = { ops: "盤の操作", rank: "段位", rankUp: "段位：挑む", rankDown: "段位：撤退", detail: "盤の詳細", main: "" }[this.panel];
    f.buttons([{ id: "invade:panel-back", label: `‹ ${parent === "rank" ? "段位" : "戦線地図"}`, w: 128, onActivate: () => this.openPanel(parent) }]);
    f.y -= 44;
    ui.text(title, f.x + 140, f.y + 22, { size: 16, weight: 700, maxW: f.w - 140 });
    f.y += 52;
    const board = this.board;
    const feel = frontProgressFeel(board);
    const selInfo = this.selected != null ? sectorDensityAt(this.selected.sx, this.selected.sy) : null;
    if (this.panel === "ops") {
      f.buttons([
        { id: "invade:home", label: "拠点へ", w: f.w, onActivate: () => this.home() },
        { id: "invade:touch-mode", label: `タッチ操作を反転：${this.reversedTouch ? "ON（タップで開く）" : "OFF（タップでマーク）"}`, w: f.w, disabled: locked, onActivate: () => this.toggleTouch() },
        { id: "invade:clear", label: "焦点クリア", w: f.w, disabled: this.selected == null || locked, onActivate: () => this.clearFocus() },
        { id: "invade:skip", label: "スキップ（quick-battle・ナビなし）", w: f.w, disabled: locked, onActivate: () => this.skip() },
        { id: "invade:regen", label: "盤を再生成（進捗リセット）", w: f.w, variant: "danger", disabled: locked, onActivate: () => this.regenerate() },
      ]);
      return;
    }
    if (this.panel === "rank") {
      const progress = invadeRankOf(readStoredHub());
      f.text(`段位：挑戦中 ${progress.current}段 · 解放済み 0〜${unlockedInvadeRank(readStoredHub())}段`, { size: 12, weight: 700 }).gap(6);
      f.buttons([
        { id: "invade:panel:rankUp", label: "挑む", sub: "次の段を選んで挑戦", w: f.w, onActivate: () => this.openPanel("rankUp") },
        { id: "invade:panel:rankDown", label: "撤退", sub: "下の段へ（この盤面を諦める）", w: f.w, onActivate: () => this.openPanel("rankDown") },
      ], { h: 56 });
      return;
    }
    if (this.panel === "rankUp" || this.panel === "rankDown") { this.drawRanks(f, locked, this.panel === "rankUp" ? "up" : "down"); return; }
    // detail: the arrival, the board numbers, the legend and the how-to texts (display only).
    f.card("invade:inbound", (k) => {
      k.text("到着（trade→invade）", { weight: 700, size: 13 });
      if (this.inbound == null) k.text("Hub からの到着クエリなし（直接オープン可）。", { size: 12, color: CANVAS_THEME.muted });
      else {
        k.kv("fromHub", "はい", { size: 12 });
        k.kv("deployableMechs", this.inbound.deployableMechs != null ? String(this.inbound.deployableMechs) : "—", { size: 12 });
        k.kv("startingAmmo", this.inbound.startingAmmo != null ? String(this.inbound.startingAmmo) : "—", { size: 12 });
        k.text("trade→invade 取込済（配備コミットではない）。", { size: 12, color: "#aff5b4" });
      }
    }).gap(8);
    f.text(`HQ 中心の前線格子そのものがマインスイーパ。空白＝探索済 · 数字＝周囲の敵感知 · 赤三角＝確認された敵（→ Explore）· 壁 d≥${SECTOR_WALL_DISTANCE}。`, { size: 12, color: CANVAS_THEME.muted }).gap(6);
    f.text(`前線マインスイーパ（${BOARD_SPAN}×${BOARD_SPAN} · 半辺 ${AOI_HALF}）`, { weight: 700, size: 13 });
    const status = board.status === "won" ? "前線掃討完了" : board.status === "hazard" || board.hitMine ? "接触（hazard・強制戦闘ロック中）" : feel.openedMines > 0 ? `偵察中（解決済接触 ${feel.openedMines} · 再出撃可）` : `偵察中 — ${exploredFeelLabelJa(feel.exploredFeel)}`;
    f.kv("状態", status, { size: 12 });
    f.kv("敵（地雷）", String(board.mineCount), { size: 12 });
    f.kv("残敵（概算）", String(minesRemaining(board)), { size: 12 });
    f.kv("推定敵位置", String(countFlagged(board)), { size: 12 });
    f.kv("ルート焦点", this.selected ? `(${this.selected.sx}, ${this.selected.sy})` : this.skipped ? "—（quick-battle スキップ）" : "未選択", { size: 12 });
    f.kv("距離 d／仮 density", `${selInfo ? selInfo.distance : "—"} ／ ${selInfo && !selInfo.blocked ? selInfo.density.toFixed(2) : "—"}`, { size: 12 });
    const pct = Math.round(feel.openSafeRatio * 100);
    f.text(`セーフ開放 ${feel.openSafe}/${feel.playableSafe}（${pct}%） · 空白 ${feel.blanksOpen} · マーク ${feel.flagged} · 残敵 ${feel.minesRemaining}/${feel.mineCount} · 解決済接触 ${board.hitMine ? 0 : feel.openedMines}`, { size: 11, color: CANVAS_THEME.muted });
    f.text(`凡例：白スコープ＝推定敵位置 · 赤三角＝確認された敵 · 済＝解決済・再出撃可 · 右上の灰点＝置き去り機 · 右下の錆点＝残骸 · 左上の橙点＝落とし物 · 未開マスの色＝HQ からの距離帯（${(["near", "mid", "front"] as const).map((b) => `${dangerBandLabelJa(b)} ${dangerBandHintJa(b)}`).join("・")}）`, { size: 11, color: CANVAS_THEME.muted }).gap(6);
    f.text(`タッチ：${this.reversedTouch ? "タップで開く／長押しして離すとマーク" : "タップでマーク／長押しして離すと開く"}（未開放マスのみ）。長押しは${BOARD_INPUT.holdMs}msで予告、離すと確定。元のマスを外れるスイープですぐ盤面移動。ピンチでズーム。広域表示のダブルタップでその位置を拡大。「拠点へ」で視点を戻せます。`, { size: 11, color: CANVAS_THEME.muted });
    f.text("開いた数字をタップ：斥候が感知した周囲の敵数とマーク数が一致した時だけ周囲開放。反転の影響なし。推定が誤っていれば敵に接触し得ます。", { size: 11, color: CANVAS_THEME.muted });
    f.text("マウス：左クリックで開く／右クリック・Ctrl＋左クリックで敵位置をマーク・マーク解除。数字で左右同時押しはマーク数一致時のみ周囲開放。中ボタンドラッグで移動、ホイールでズーム。マウス長押しはマーク操作になりません。", { size: 11, color: CANVAS_THEME.muted });
    f.text("開いたマス・マーク・地雷シード・ルート焦点は HubSave.frontProgress に自動保存（リロード後も復元）。報酬はインテルのみ。コンテナ／YieldBag は払わない。", { size: 11, color: CANVAS_THEME.muted });
  }

  private drawRanks(k: Flow, locked: boolean, mode: "up" | "down"): void {
    const hub = readStoredHub();
    const progress = invadeRankOf(hub);
    const max = unlockedInvadeRank(hub);
    const start = Math.min(this.rankListPage * RANK_PAGE_SIZE, Math.floor(max / RANK_PAGE_SIZE) * RANK_PAGE_SIZE);
    const ranks = Array.from({ length: Math.min(RANK_PAGE_SIZE, max - start + 1) }, (_, i) => start + i);
    const lower = ranks.filter((i) => i < progress.current);
    const won = this.board.status === "won";
    const choice = this.rankChoice != null && ranks.includes(this.rankChoice) ? this.rankChoice : progress.current;
    const retreat = this.retreatChoice != null && lower.includes(this.retreatChoice) ? this.retreatChoice : lower[0] ?? null;
    k.text(`段位：挑戦中 ${progress.current}段 · 解放済み 0〜${max}段`, { size: 12, weight: 700 });
    if (max >= RANK_PAGE_SIZE) {
      k.text(`一覧 ${start}〜${start + ranks.length - 1}段`, { size: 11, color: CANVAS_THEME.muted });
      k.buttons([
        { id: "invade:rank-prev", label: "前の100段", disabled: start === 0, onActivate: () => { this.rankListPage = Math.max(0, this.rankListPage - 1); } },
        { id: "invade:rank-next", label: "次の100段", disabled: start + ranks.length > max, onActivate: () => { this.rankListPage++; } },
      ]).gap(4);
    }
    if (mode === "up") {
      if (!won) k.text("前線掃討を完了すると次の段へ挑めます。", { size: 12, color: CANVAS_THEME.muted }).gap(4);
      k.buttons([
        { id: "invade:rank-select", label: `次に挑む段：${choice}段`, w: k.w, disabled: locked || !won, onActivate: () => {
          this.picker = { id: "invade:pick:rank", title: "次に挑む段", options: ranks.map((i) => ({ key: String(i), label: `${i}段`, selected: i === choice })), onPick: (key) => { this.rankChoice = Number(key); this.picker = null; }, onCancel: () => { this.picker = null; } };
        } },
        { id: "invade:rank-start", label: "選んだ段に挑む", variant: "primary", w: k.w, disabled: locked || !won, onActivate: () => this.moveToRank(choice, false) },
      ]).gap(4);
      return;
    }
    k.buttons([
      { id: "invade:retreat-select", label: `撤退先：${retreat != null ? `${retreat}段` : "—"}`, w: k.w, disabled: locked || lower.length === 0, onActivate: () => {
        this.picker = { id: "invade:pick:retreat", title: "撤退先", options: lower.map((i) => ({ key: String(i), label: `${i}段`, selected: i === retreat })), onPick: (key) => { this.retreatChoice = Number(key); this.picker = null; }, onCancel: () => { this.picker = null; } };
      } },
      { id: "invade:rank-retreat", label: "この盤面を諦めて下の段へ", w: k.w, disabled: locked || lower.length === 0 || won, onActivate: () => { if (retreat != null) this.moveToRank(retreat, true); } },
    ]).gap(8);
  }

  private drawSortieBar(k: Flow): void {
    const bar = this.sortieBar();
    const color = bar.tone === "locked" ? "#ffa198" : bar.tone === "hint" ? CANVAS_THEME.muted : "#aff5b4";
    k.text(bar.lines[0], { size: 12, weight: 700, color });
    bar.lines.slice(1).forEach((l) => k.text(l, { size: 11, color: CANVAS_THEME.muted }));
    if (bar.chip) k.text(`［${bar.chip}］`, { size: 11, weight: 700, color: bar.tone === "locked" ? "#ff7b72" : "#d2a8ff" });
    if (bar.buttons.length) k.gap(4).buttons(bar.buttons.map((b) => ({ id: b.id, label: b.label, variant: b.variant, onActivate: () => this.leave(b) })), { fill: true });
  }

  private drawBoard(ui: CanvasUI, vp: Rect, locked: boolean): void {
    const ctx = ui.context;
    const board = this.board;
    const { cell: cw, pitch } = this.pitch(vp.w);
    const s = this.view.scale;
    ctx.save();
    ctx.beginPath(); ctx.rect(vp.x, vp.y, vp.w, vp.h); ctx.clip();
    ctx.fillStyle = "#10141b"; ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    const size = cw * s;
    const fontPx = Math.max(7, Math.min(22, size * 0.55));
    const t = this.now();
    for (let row = 0; row < BOARD_SPAN; row++) for (let col = 0; col < BOARD_SPAN; col++) {
      const x = vp.x + this.view.x + col * pitch * s, y = vp.y + this.view.y + row * pitch * s;
      if (x > vp.x + vp.w || y > vp.y + vp.h || x + size < vp.x || y + size < vp.y) continue;
      const c = getCell(board, col - AOI_HALF, AOI_HALF - row)!;
      const st = this.cellStyle(c);
      const pv = this.preview && this.preview.cell.sx === c.sx && this.preview.cell.sy === c.sy ? this.preview : null;
      let fill = st.fill;
      if (pv?.kind === "open") { const k2 = Math.min(1, (t - pv.at) / 300); ctx.globalAlpha = 1; fill = mix(st.fill, "#ffffff", 0.35 * k2); }
      ctx.fillStyle = fill; ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = st.edge; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      const cx = x + size / 2, cy = y + size / 2;
      const showScope = (c.flagged && !c.open) || pv?.kind === "mark" || pv?.kind === "unmark";
      if (showScope) {
        ctx.globalAlpha = pv && (pv.kind === "mark" || pv.kind === "unmark") ? 0.5 : 1;
        const r = Math.max(3, size * 0.28);
        ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - r * 1.35, cy); ctx.lineTo(cx + r * 1.35, cy); ctx.moveTo(cx, cy - r * 1.35); ctx.lineTo(cx, cy + r * 1.35); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (c.open && c.mine) {
        const h = Math.max(4, size * 0.42);
        ctx.fillStyle = "#f85149"; ctx.beginPath(); ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx + h * 0.55, cy + h / 2); ctx.lineTo(cx - h * 0.55, cy + h / 2); ctx.closePath(); ctx.fill();
        if (!board.hitMine) { ctx.font = fontSpec(Math.max(6, fontPx * 0.7), 700); ctx.fillStyle = "#7ee787"; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("済", x + size * 0.62, y + size * 0.05); }
      } else {
        const glyph = cellGlyph(c, { hitMine: board.hitMine });
        if (glyph) {
          ctx.font = fontSpec(c.isHq || c.blocked ? fontPx * 0.7 : fontPx, c.isHq ? 700 : 600);
          ctx.fillStyle = st.text; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(glyph, cx, cy);
        }
      }
      const dot = Math.max(2, Math.min(8, size * 0.3));
      if ((this.lostByCell.get(cellKey(c.sx, c.sy))?.length ?? 0) > 0) { ctx.fillStyle = "#8a9099"; ctx.fillRect(x + size - dot, y, dot, dot); }
      if ((this.dropsByCell.get(cellKey(c.sx, c.sy))?.length ?? 0) > 0) { ctx.fillStyle = "#f59e0b"; ctx.fillRect(x, y, dot, dot); }
      if ((this.wrecksByCell.get(cellKey(c.sx, c.sy))?.length ?? 0) > 0) { ctx.fillStyle = "#a8604a"; ctx.fillRect(x + size - dot, y + size - dot, dot, dot); }
      if (this.selected && this.selected.sx === c.sx && this.selected.sy === c.sy) {
        ctx.strokeStyle = "#f0c14b"; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, size - 2, size - 2); ctx.lineWidth = 1;
      }
    }
    ctx.restore();
    if (locked) { roundRectPath(ctx, vp, 2); ctx.strokeStyle = "#f85149"; ctx.stroke(); }
    else { ctx.strokeStyle = CANVAS_THEME.panelEdge; ctx.strokeRect(vp.x + 0.5, vp.y + 0.5, vp.w - 1, vp.h - 1); }
  }

  private cellStyle(c: MsCell): { fill: string; edge: string; text: string } {
    const b = this.board;
    if (c.blocked) return { fill: "#3d2a2a", edge: "#8b4545", text: "#f85149" };
    if (c.open) {
      if (c.mine) return isPendingMineCell(c, b) ? { fill: "#4a1818", edge: "#f85149", text: "#ff7b72" } : isResolvedMineCell(c, b) ? { fill: "#1f2d24", edge: "#3fb950", text: "#7ee787" } : { fill: "#3d1f1f", edge: "#f85149", text: "#f85149" };
      if (c.isHq) return { fill: "#1a3320", edge: "#3fb950", text: "#7ee787" };
      if (c.adjacent === 0) return { fill: "#1a2430", edge: "rgba(88,166,255,0.28)", text: "#c9d1d9" };
      return { fill: "#0d1014", edge: "#2a313c", text: NUM_COLOR[c.adjacent] ?? "#c9d1d9" };
    }
    if (c.flagged) return { fill: "#3d3420", edge: "rgba(240,193,75,0.55)", text: "#ffffff" };
    const band = dangerBandAtCell(c.sx, c.sy);
    if (band === "near") return { fill: "#1c2420", edge: "#2d3b34", text: "#c9d1d9" };
    if (band === "mid") return { fill: "#242018", edge: "#3d3728", text: "#c9d1d9" };
    if (band === "front") return { fill: "#2a1c1c", edge: "#4a2e2e", text: "#c9d1d9" };
    return { fill: "#21262d", edge: "#2a313c", text: "#c9d1d9" };
  }
}

function mix(a: string, b: string, k: number): string {
  const p = (h: string) => { const m = /^#([0-9a-f]{6})$/i.exec(h); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const x = p(a), y = p(b);
  if (!x || !y) return a;
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
