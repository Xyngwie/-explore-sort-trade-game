/**
 * SORT scene on the single canvas (docs/CANVAS_UNIFIED_V0.md §9, U-2).
 *
 * Same rules and timing as the existing Sort page (`main.ts`): the reducers in
 * `refine.ts`, the play-session save (`wreckline.sortSession.v1`, route =
 * the page query), the intro-opening checks and result save (#332), the
 * phase-change play-log operations (`sort.<phase>`), the active-chain timers
 * (blink → slow settle, retried while the play log saves), swipe ≥ 16px /
 * tap-tap / arrow keys. Only the drawing and the way pages change differ: the
 * host (canvas app) receives URLs through `go` and switches scenes in place.
 */
import {
  CANVAS_THEME,
  CTA_CHIP,
  CTA_COPY,
  RESOURCE_IDS,
  RESOURCE_LABEL_JA,
  buildSortToTradeUrlFromResult,
  completeIntroOpening,
  fontSpec,
  loadHubSaveFromLocalStorage,
  playLogBlocked,
  playLogRecording,
  roundRectPath,
  saveHubSaveToLocalStorage,
  wrapText,
  setPlayLogOperation,
  type CanvasUI,
  type FrameInfo,
  type Rect,
} from "@estg/shared";
import {
  PIECE_LABEL_JA,
  SORT_V0_RULES,
  TEST_PLAY_CONTAINERS,
  commitClearStep,
  createRefineFromLocationSearch,
  createTestPlayRefine,
  demoQueryExample,
  finishRefine,
  remainingValidInBag,
  resolveCraftMultiplier,
  resolveNearStuckHint,
  resolveSwipeNeighbor,
  settleMotionIndices,
  startRefine,
  swapPanels,
  tapCell,
  tickSettleStep,
  toCraftingResult,
  validSupplyGaugeState,
  type JunkGaugeLevel,
  type PieceKind,
  type RefineLive,
} from "../refine";
import {
  buildCargoSkipToHubUrl,
  buildEmptySkipToHubUrl,
  canSkipWithCargo,
  isEmptyCargoEntry,
  resolveRestartState,
  type SessionSource,
} from "../resultOverlay";
import { buildYieldPreviewFromDelta, nextYieldPreviewMode, YIELD_PREVIEW_MODE_LABEL_JA, type YieldPreviewMode } from "../playHud";
import { armSortHandoffHref } from "../handoff-core";
import { addContainersToQuery, isExploreHandoffQuery, readHubUnopenedContainers, spendHubContainers } from "../hub-container-core";

export const SORT_SESSION_KEY = "wreckline.sortSession.v1";

export const PIECE_STYLE: Record<PieceKind, { fill: string; edge: string; text: string }> = {
  ammo: { fill: "#6b2f2f", edge: "#f85149", text: "#ffd4d0" },
  armor: { fill: "#1f4d6b", edge: "#58a6ff", text: "#c8e1ff" },
  power: { fill: "#5a4a1e", edge: "#d4a72c", text: "#ffe8a3" },
  junk: { fill: "#3a3a3a", edge: "#6e7681", text: "#c9d1d9" },
};

export type SortHost = {
  /** The page query this scene runs on (`?salvagedContainers=…`). */
  search: string;
  /** Canvas page URL without query (Sort→HUB URLs are built on it). */
  hubBase: string;
  /** Sort module URL without query (stored intro `opening.url` stays canonical). */
  sortModuleBase: string;
  /** Current page URL (token check base). */
  href: () => string;
  /** Open a URL: the host switches scenes in place or leaves the page. */
  go: (url: string) => void;
  redraw: () => void;
  now?: () => number;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  /** Debug mode only: open the HTML debug area under the canvas (#353 B2). */
  openDebug?: () => void;
};

export type SortLayout = { field: Rect; rail: Rect; board: Rect; cell: number; footer: Rect; finish: Rect; landscape: boolean };
/** Max cell edge (SORT_V0 §8-5: PC ≈ 65px, width-based). */
export const SORT_MAX_CELL_PX = 65;
/**
 * Board fits the field (SORT_V0 §8-7: board + 「精製を終える」 without scrolling).
 * Portrait: rail above, footer below. Short-and-wide fields (landscape phones):
 * rail on the left, footer on the right of the board.
 */
export function layoutSort(field: Rect, cols: number, rows: number): SortLayout {
  const pad = 12, railH = 108, footerH = 92, sideW = 200;
  const portraitCell = Math.min((field.w - pad * 2) / cols, (field.h - railH - footerH - pad * 2) / rows, SORT_MAX_CELL_PX);
  const landscapeCell = Math.min((field.w - pad * 4 - sideW * 2) / cols, (field.h - pad * 2) / rows, SORT_MAX_CELL_PX);
  const landscape = portraitCell < 36 && landscapeCell > portraitCell;
  if (landscape) {
    const cell = Math.max(24, Math.floor(landscapeCell));
    const bw = cell * cols, bh = cell * rows;
    const board: Rect = { x: field.x + (field.w - bw) / 2, y: field.y + (field.h - bh) / 2, w: bw, h: bh };
    const rail: Rect = { x: field.x + pad, y: field.y + pad, w: Math.max(120, board.x - field.x - pad * 2), h: railH - pad };
    const fx = board.x + bw + pad;
    const footer: Rect = { x: fx, y: board.y, w: Math.max(120, field.x + field.w - fx - pad), h: footerH };
    const finish: Rect = { x: footer.x, y: footer.y + 28, w: footer.w, h: 44 };
    return { field, rail, board, cell, footer, finish, landscape };
  }
  const cell = Math.max(24, Math.floor(portraitCell));
  const bw = cell * cols, bh = cell * rows;
  const rail: Rect = { x: field.x + pad, y: field.y + pad, w: field.w - pad * 2, h: railH - pad };
  const board: Rect = { x: field.x + (field.w - bw) / 2, y: rail.y + rail.h + 4, w: bw, h: bh };
  const footer: Rect = { x: field.x + pad, y: board.y + bh + 6, w: field.w - pad * 2, h: footerH - 6 };
  const finish: Rect = { x: footer.x + (footer.w - Math.min(footer.w, 260)) / 2, y: footer.y + 28, w: Math.min(footer.w, 260), h: 44 };
  return { field, rail, board, cell, footer, finish, landscape };
}

export class SortScene {
  state: RefineLive;
  private readonly introOpeningId: string | null;
  private chainTimer: ReturnType<typeof setTimeout> | null = null;
  private fallIn = new Set<number>();
  private fallAt = 0;
  private sessionSource: SessionSource = "location";
  private bagIntroUntil = 0;
  private junkTensionUntil = 0;
  private lastGaugeLevel: JunkGaugeLevel | null = null;
  private yieldMode: YieldPreviewMode = "wave";
  private disposed = false;
  constructor(private readonly host: SortHost) {
    this.introOpeningId = new URLSearchParams(host.search).get("introOpening");
    this.state = this.initialState();
    if (this.state.playMode === "clearing" || this.state.playMode === "settling") this.schedule();
  }
  private now(): number { return this.host.now?.() ?? Date.now(); }
  dispose(): void { this.disposed = true; this.clearTimer(); }

  /* ----------------------------- rules (main.ts) ---------------------------- */
  activeIntroOpening(): boolean {
    const hub = loadHubSaveFromLocalStorage(this.host.storage ?? undefined)?.hub;
    const opening = hub?.newGameIntro?.opening, params = new URLSearchParams(this.host.search);
    return !!this.introOpeningId && opening?.id === this.introOpeningId
      && Number(params.get("salvagedContainers")) === opening.containerCount
      && Number(params.get("totalStockPieces")) === opening.containerCount * 25;
  }
  private introReturnUrl(url: string, cancel = false): string {
    if (!this.introOpeningId) return url;
    const target = new URL(url);
    target.searchParams.set(cancel ? "introCancelId" : "introResultId", this.introOpeningId);
    return target.toString();
  }
  private initialState(): RefineLive {
    if (playLogRecording()) {
      const raw = (this.host.storage ?? localStorage).getItem(SORT_SESSION_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { route: string; state: RefineLive };
        if (saved.route === this.host.search && saved.state && ["play", "result"].includes(saved.state.phase)
          && (!this.introOpeningId || this.activeIntroOpening() || saved.state.phase === "result")) return saved.state;
      }
    }
    const next = createRefineFromLocationSearch(this.host.search);
    if (this.introOpeningId && !this.activeIntroOpening())
      return { ...next, phase: "blocked", blockReason: "このコンテナの開封は終了または取り消されています。格納庫へ戻ってください。" };
    return next;
  }
  private clearTimer(): void { if (this.chainTimer != null) { clearTimeout(this.chainTimer); this.chainTimer = null; } }
  private schedule(): void {
    this.clearTimer();
    const s = this.state;
    if (this.disposed || s.phase !== "play") return;
    if (s.playMode === "clearing") {
      const delay = Math.max(80, s.chainWindowMsLeft || SORT_V0_RULES.clearBlinkMs);
      this.chainTimer = setTimeout(() => {
        if (playLogBlocked()) { this.schedule(); return; }
        const next = commitClearStep(this.state);
        if (next.phase !== this.state.phase) { this.setState(next); return; }
        this.state = next;
        this.host.redraw();
        this.schedule();
      }, delay);
      return;
    }
    if (s.playMode === "settling") {
      const delay = Math.max(40, SORT_V0_RULES.settleStepMs);
      this.chainTimer = setTimeout(() => {
        if (playLogBlocked()) { this.schedule(); return; }
        const before = this.state.board;
        const next = tickSettleStep(this.state);
        if (next.phase !== this.state.phase) { this.setState(next); return; }
        this.state = next;
        this.fallIn = new Set(settleMotionIndices(before, this.state.board));
        this.fallAt = this.now();
        this.host.redraw();
        this.schedule();
      }, delay);
    }
  }
  setState(next: RefineLive): void {
    if (this.introOpeningId && next.phase === "play" && !this.activeIntroOpening()) return;
    if (this.introOpeningId && next.phase === "result") {
      const hub = loadHubSaveFromLocalStorage(this.host.storage ?? undefined)?.hub;
      if (hub) {
        const result = toCraftingResult(next);
        const updated = completeIntroOpening(hub, this.introOpeningId, result.yieldBag ?? {});
        if (updated !== hub) {
          setPlayLogOperation("intro.opening.result", { id: this.introOpeningId, harvest: result.yieldBag ?? {}, award: updated.credits - hub.credits });
          if (!saveHubSaveToLocalStorage(updated, this.host.storage ?? undefined)) throw new Error("記録を保存できません");
        }
      }
    }
    if (playLogRecording() && next.phase !== this.state.phase) {
      setPlayLogOperation(`sort.${next.phase}`);
      (this.host.storage ?? localStorage).setItem(SORT_SESSION_KEY, JSON.stringify({ route: this.host.search, state: next }));
    }
    const prevMode = this.state.playMode;
    this.state = next;
    this.fallIn = new Set();
    if (this.state.playMode === "clearing" || this.state.playMode === "settling" || prevMode === "clearing" || prevMode === "settling") this.schedule();
    this.maybeTension();
    this.host.redraw();
  }
  private maybeTension(): void {
    if (this.state.phase !== "play") { this.lastGaugeLevel = null; return; }
    const level = validSupplyGaugeState(this.state).level;
    const entered = level === "tension" && this.lastGaugeLevel != null && this.lastGaugeLevel !== "tension";
    this.lastGaugeLevel = level;
    if (entered) this.flash("tension", 2200);
  }
  private flash(kind: "bag" | "tension", ms: number): void {
    const until = this.now() + ms;
    if (kind === "bag") this.bagIntroUntil = until; else this.junkTensionUntil = until;
    setTimeout(() => this.host.redraw(), ms + 20);
  }
  private resetFlashes(): void { this.bagIntroUntil = 0; this.junkTensionUntil = 0; this.lastGaugeLevel = null; }

  /* --------------------------------- actions -------------------------------- */
  start(): void { this.flash("bag", 2800); this.setState(startRefine(this.state)); }
  /**
   * Test-only actions, shown in the page's debug area (神宮決定 2026-11-06), never
   * on the canvas: the existing 「コンテナ100でテストプレイ」 (briefing / blocked,
   * not during the intro) and 「デモクエリで開く」 (blocked, not empty cargo).
   */
  debugActions(): Array<{ id: string; label: string; run: () => void }> {
    const s = this.state;
    const out: Array<{ id: string; label: string; run: () => void }> = [];
    if ((s.phase === "briefing" || s.phase === "blocked") && !this.introOpeningId) out.push({ id: "sort-test-play", label: `SORT：コンテナ${TEST_PLAY_CONTAINERS}でテストプレイ`, run: () => this.testPlay() });
    if (s.phase === "blocked" && !isEmptyCargoEntry(s)) out.push({ id: "sort-demo", label: "SORT：デモクエリで開く", run: () => this.host.go(this.host.sortModuleBase + demoQueryExample()) });
    return out;
  }
  testPlay(): void {
    if (this.introOpeningId) return;
    this.clearTimer();
    this.sessionSource = "test-play";
    this.flash("bag", 2800);
    this.setState(startRefine(createTestPlayRefine(TEST_PLAY_CONTAINERS)));
  }
  finish(): void { this.clearTimer(); this.resetFlashes(); this.setState(finishRefine(this.state)); }
  again(): void {
    if (this.introOpeningId) return;
    this.clearTimer(); this.resetFlashes();
    this.setState(resolveRestartState(this.sessionSource, this.host.search));
  }
  tap(index: number): void { if (this.state.phase === "play") this.setState(tapCell(this.state, index)); }
  /** A board gesture: below the swipe threshold = tap; otherwise swap with the neighbour on the strong axis. */
  gesture(index: number, dx: number, dy: number): void {
    if (this.state.phase !== "play") return;
    const target = resolveSwipeNeighbor(this.state.cols, this.state.rows, index, dx, dy);
    if (target == null && Math.max(Math.abs(dx), Math.abs(dy)) >= SORT_V0_RULES.swipeMinPx) return;
    this.setState(target == null ? tapCell(this.state, index) : swapPanels(this.state, index, target));
  }
  key(key: string, shift: boolean): boolean {
    const s = this.state;
    if (s.phase !== "play" || s.selected == null) return false;
    const sel = s.selected, r = Math.floor(sel / s.cols), c = sel % s.cols;
    let target: number | null = null;
    if (key === "ArrowLeft" && c > 0) target = sel - 1;
    if (key === "ArrowRight" && c + 1 < s.cols) target = sel + 1;
    if (key === "ArrowUp" && r > 0) target = sel - s.cols;
    if (key === "ArrowDown" && r + 1 < s.rows) target = sel + s.cols;
    if (target == null) return false;
    this.setState(shift ? { ...s, selected: target } : swapPanels(s, sel, target));
    return true;
  }
  /** Sort→HUB with the single-use token (sort-handoff-guard). */
  private toHub(url: string): void {
    if (playLogBlocked()) return;
    this.host.go(armSortHandoffHref(url, this.host.href()));
  }
  resultHubUrl(): string | null {
    if (this.state.phase !== "result") return null;
    return this.introReturnUrl(buildSortToTradeUrlFromResult(toCraftingResult(this.state), this.host.hubBase));
  }
  /** ＋1 / ＋ALL 未開封 (hubContainerBridge). */
  addHubContainers(count: number): void {
    if (playLogBlocked()) return;
    const url = addContainersToQuery(count, this.host.sortModuleBase + this.host.search);
    if (!spendHubContainers(count, url, this.host.search)) return;
    this.host.go(url);
  }
  /** Animation running (blink / fall-in / flashes) → the host keeps redrawing. */
  animating(): boolean {
    const t = this.now();
    return this.state.phase === "play" && (this.state.playMode === "clearing" || (this.fallIn.size > 0 && t - this.fallAt < SORT_V0_RULES.settleStepMs));
  }

  /* --------------------------------- drawing -------------------------------- */
  draw(ui: CanvasUI, frame: FrameInfo, field: Rect): void {
    const s = this.state;
    const L = layoutSort(field, s.cols, s.rows);
    const ctx = ui.context;
    if (s.phase === "play") this.drawRail(ui, L);
    this.drawBoard(ui, L, s.phase !== "play");
    if (s.phase === "play") {
      const hint = s.playMode === "settling" || s.playMode === "clearing"
        ? "操作: スワイプ／隣タップ（連鎖中は無料）"
        : "スワイプ／隣タップでスワップ · idle でマッチなしは即終了 · 落下・点滅中の仕込みは無料";
      ui.text(hint, L.footer.x + L.footer.w / 2, L.footer.y + 12, { size: 11, color: CANVAS_THEME.muted, align: "center", maxW: L.footer.w });
      ui.button("sort:finish", L.finish, "精製を終える", { onActivate: () => this.finish() });
    } else {
      ctx.fillStyle = "rgba(13,17,23,0.72)";
      ctx.fillRect(L.board.x, L.board.y, L.board.w, L.board.h);
      this.drawOverlay(ui, frame, L);
    }
  }

  private drawRail(ui: CanvasUI, L: SortLayout): void {
    const s = this.state;
    const r = L.rail;
    const chain = s.playMode === "clearing" || s.playMode === "settling"
      ? `×${s.chainCount}${s.playMode === "settling" ? " 落下" : " 点滅"}`
      : s.lastChain > 0 ? `前回×${s.lastChain}` : "—";
    const stats = `手数 ${s.movesLeft}　袋 ${remainingValidInBag(s.bag)}　消 ${s.cleared.ammo}/${s.cleared.armor}/${s.cleared.power}　連鎖 ${chain}`;
    ui.text(stats, r.x, r.y + 10, { size: 13, weight: 600, maxW: r.w });
    // Valid-supply gauge.
    const g = validSupplyGaugeState(s);
    const gy = r.y + 26;
    const label = g.level === "depleted" ? "有効供給なし（以降ジャンク）" : g.level === "tension" ? `ジャンク間近 残り有効 ${g.remaining}/${g.budget}` : `残り有効 ${g.remaining}/${g.budget}`;
    ui.text(label, r.x, gy + 8, { size: 11, color: g.level === "tension" || g.level === "depleted" ? "#ffa198" : CANVAS_THEME.muted, maxW: r.w });
    const ctx = ui.context;
    ctx.fillStyle = CANVAS_THEME.panelEdge;
    ctx.fillRect(r.x, gy + 18, r.w, 4);
    ctx.fillStyle = g.level === "tension" || g.level === "depleted" ? "#f85149" : g.level === "low" ? "#d4a72c" : "#58a6ff";
    ctx.fillRect(r.x, gy + 18, r.w * g.ratio, 4);
    // Feedback line (bag intro / tension / chain / yield / status).
    const fy = r.y + 58;
    const t = this.now();
    let feedback = "";
    let color: string = CANVAS_THEME.text;
    if (this.bagIntroUntil > t) { feedback = `袋スケール 有効 ${g.remaining}/${g.budget} · ジャンク変換まで ${g.remaining}`; }
    else if (this.junkTensionUntil > t && g.level === "tension") { feedback = `緊張 ジャンク間近 · 有効残り ${g.remaining}`; color = "#ffa198"; }
    else if (s.playMode === "clearing" || s.playMode === "settling") {
      const n = Math.max(1, s.chainCount);
      feedback = `×${n} ${s.playMode === "clearing" ? "同時消去" : "落下連鎖"} · ${n >= 3 ? "連続クリア！" : n >= 2 ? "連鎖中" : "着地済みもスワップ可"}`;
      color = n >= 3 ? "#ffa657" : n >= 2 ? "#d2a8ff" : CANVAS_THEME.text;
    } else if (s.lastChain > 1 && s.statusMsg?.includes("連鎖完了")) {
      feedback = `×${s.lastChain} 連鎖完了 · ${s.lastChain >= 3 ? "高連鎖" : "コンボ"}`;
    } else if (s.statusMsg) feedback = s.statusMsg;
    const craft = resolveCraftMultiplier(s.inbound);
    const counts = this.yieldMode === "session" ? s.cleared : s.lastClearDelta;
    const bag = buildYieldPreviewFromDelta(counts, craft);
    const chips = Object.entries(bag).filter(([, n]) => (n ?? 0) > 0).map(([id, n]) => `${RESOURCE_LABEL_JA[id as keyof typeof RESOURCE_LABEL_JA] ?? id} +${n}`).join(" ");
    const toggleW = 64;
    ui.text(feedback, r.x, fy + 10, { size: 12, color, maxW: r.w - toggleW - 8 });
    if (chips) ui.text(chips, r.x, fy + 26, { size: 11, color: CANVAS_THEME.gain, maxW: r.w - toggleW - 8 });
    ui.button("sort:yield-mode", { x: r.x + r.w - toggleW, y: fy - 8, w: toggleW, h: 44 }, YIELD_PREVIEW_MODE_LABEL_JA[this.yieldMode], { sub: "産出", fontSize: 12, onActivate: () => { this.yieldMode = nextYieldPreviewMode(this.yieldMode); } });
  }

  private drawBoard(ui: CanvasUI, L: SortLayout, inert: boolean): void {
    const s = this.state;
    const ctx = ui.context;
    const { board: b, cell } = L;
    ctx.fillStyle = "#0b0f14";
    ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    const pending = new Set(s.pendingClear);
    const hint = !inert && s.phase === "play" ? resolveNearStuckHint(s) : null;
    const hintSet = new Set(hint ? [hint.a, hint.b] : []);
    const t = this.now();
    const blinkOn = Math.floor(t / 90) % 2 === 0;
    const fallP = Math.min(1, (t - this.fallAt) / SORT_V0_RULES.settleStepMs);
    const showCells = s.phase === "play" || s.phase === "result";
    for (let i = 0; i < s.cols * s.rows; i++) {
      const col = i % s.cols, row = Math.floor(i / s.cols);
      const x = b.x + col * cell, y0 = b.y + row * cell;
      const kind = showCells ? s.board[i] : null;
      const yOff = !inert && kind != null && this.fallIn.has(i) && fallP < 1 ? -(1 - fallP) * cell : 0;
      const r: Rect = { x: x + 2, y: y0 + 2 + yOff, w: cell - 4, h: cell - 4 };
      if (kind == null) {
        ctx.strokeStyle = "#161b22"; ctx.lineWidth = 1;
        roundRectPath(ctx, r, 6); ctx.stroke();
        continue;
      }
      const st = PIECE_STYLE[kind];
      const isPending = pending.has(i);
      ctx.globalAlpha = isPending && blinkOn ? 0.45 : inert ? 0.6 : 1;
      roundRectPath(ctx, r, 6);
      ctx.fillStyle = st.fill; ctx.fill();
      ctx.lineWidth = s.selected === i && !inert ? 3 : hintSet.has(i) ? 2 : 1;
      ctx.strokeStyle = s.selected === i && !inert ? "#ffffff" : hintSet.has(i) ? "#d4a72c" : st.edge;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.font = fontSpec(Math.max(11, Math.floor(cell * 0.32)), 700);
      ctx.fillStyle = st.text; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(kind === "junk" ? "ジ" : PIECE_LABEL_JA[kind].slice(0, 1), r.x + r.w / 2, r.y + r.h / 2);
      ctx.globalAlpha = 1;
    }
    if (!inert && s.phase === "play") {
      ui.dragRegion("sort:board", b, (start, end) => {
        const col = Math.floor((start.x - b.x) / cell), row = Math.floor((start.y - b.y) / cell);
        if (col < 0 || row < 0 || col >= s.cols || row >= s.rows) return;
        this.gesture(row * s.cols + col, end.x - start.x, end.y - start.y);
      });
    }
  }

  private drawOverlay(ui: CanvasUI, frame: FrameInfo, L: SortLayout): void {
    const s = this.state;
    const w = Math.min(L.field.w - 24, 420);
    const x = L.field.x + (L.field.w - w) / 2;
    const top = Math.max(L.field.y + 12, L.board.y + 8);
    const btn = (id: string, label: string, o: { variant?: "primary" | "normal"; sub?: string; disabled?: boolean; onActivate: () => void }, y: number, bw = w - 32, bx = x + 16) => {
      ui.button(id, { x: bx, y, w: bw, h: 48 }, label, { variant: o.variant, sub: o.sub, disabled: o.disabled, onActivate: o.onActivate });
      return y + 54;
    };
    const lines: Array<{ text: string; size?: number; color?: string; weight?: 400 | 600 | 700 }> = [];
    const buttons: Array<{ id: string; label: string; variant?: "primary" | "normal"; sub?: string; onActivate: () => void }> = [];
    let kicker = "", title = "";
    if (s.phase === "briefing") {
      kicker = "BRIEFING"; title = "精製準備";
      const capacity = SORT_V0_RULES.boardCols * SORT_V0_RULES.boardRows;
      const budget = Math.max(0, s.validPieceBudget);
      lines.push({ text: `コンテナ ${s.inbound.salvagedContainers} · 有効予算 ${s.validPieceBudget} · craft ${(s.inbound.craftMultiplier ?? 1).toFixed(3)}`, weight: 600 });
      lines.push({ text: `ジャンクまで ${budget}（${budget >= capacity ? `盤 ${capacity} 埋めたあと袋に ${budget - capacity}` : `盤を埋める有効 ${budget} · 不足は開始後ジャンク`}）`, size: 12, color: CANVAS_THEME.muted });
      lines.push({ text: "盤は開始時に埋まります。上下左右にスワップして 3 つ以上そろえると消去→ゆっくり落下補充。落下中もスワップしてアクティブ連鎖。idle でマッチしないスワップは即終了。有効が尽きたらオジャマのみ。", size: 12 });
      buttons.push({ id: "sort:start", label: "精製開始", variant: "primary", onActivate: () => this.start() });
      if (isExploreHandoffQuery(this.host.search)) {
        const remaining = readHubUnopenedContainers(this.host.search);
        if (remaining > 0) {
          buttons.push({ id: "sort:add-one", label: `＋1 未開封コンテナ（残り ${remaining}）`, onActivate: () => this.addHubContainers(1) });
          buttons.push({ id: "sort:add-all", label: `＋ALL（${remaining}個）`, onActivate: () => this.addHubContainers(remaining) });
        }
      }
      if (canSkipWithCargo(s)) {
        lines.push({ text: "精製せず、受取コンテナを未開封のまま格納庫へ預けられます（資材産出なし）。", size: 12, color: CANVAS_THEME.muted });
        buttons.push({ id: "sort:skip-cargo", label: CTA_COPY.toHangar, sub: CTA_CHIP.unopened, onActivate: () => this.toHub(this.introReturnUrl(buildCargoSkipToHubUrl(s, this.host.hubBase), true)) });
      }
    } else if (s.phase === "blocked") {
      if (isEmptyCargoEntry(s)) {
        kicker = "EMPTY CARGO"; title = "仕分けるものがありません";
        lines.push({ text: "コンテナ 0 · 有効予算 0。精製盤には進みません。" });
        lines.push({ text: "仕分けせずに格納庫（HUB）へ戻れます。", color: CANVAS_THEME.muted, size: 12 });
        buttons.push({ id: "sort:skip-empty", label: CTA_COPY.toHangar, variant: "primary", onActivate: () => this.toHub(buildEmptySkipToHubUrl(s, this.host.hubBase)) });
      } else {
        kicker = "BLOCKED"; title = "開始できません";
        lines.push({ text: s.blockReason ?? "開始不可", color: "#ffa198" });
      }
    } else if (s.phase === "result") {
      kicker = ""; title = "仕分完了！";
      const result = toCraftingResult(s);
      const bag = result.yieldBag ?? {};
      lines.push({ text: RESOURCE_IDS.map((id) => `${RESOURCE_LABEL_JA[id]} ${Math.max(0, Math.floor(bag[id] ?? 0))}`).join("　"), weight: 600 });
      lines.push({ text: `×${s.lastChain || 1}　craft ${result.craftMultiplier.toFixed(3)}`, size: 12, color: CANVAS_THEME.muted });
      buttons.push({ id: "sort:to-hangar", label: CTA_COPY.toHangar, variant: "primary", onActivate: () => { const u = this.resultHubUrl(); if (u) this.toHub(u); } });
      if (!this.introOpeningId) buttons.push({ id: "sort:again", label: CTA_COPY.again, onActivate: () => this.again() });
    }
    // Debug mode only: reach the debug area from SORT too (its tabs are off during a handoff, #332).
    // The test actions themselves stay in the HTML area, never on the canvas.
    const openDebug = this.host.openDebug;
    if (openDebug) buttons.push({ id: "sort:debug-open", label: "検証用の欄へ ▼", onActivate: () => openDebug() });
    // Measure: kicker + title + lines + buttons.
    const ctx = ui.context;
    let h = 16 + (kicker ? 18 : 0) + 30;
    const wrapped = lines.map((l) => { ctx.font = fontSpec(l.size ?? 14, l.weight ?? 400); return wrapText(ctx, l.text, w - 32); });
    wrapped.forEach((ls, i) => { h += ls.length * Math.round((lines[i].size ?? 14) * 1.5) + 4; });
    h += 8 + buttons.length * 54 + 8;
    const drawBox = (boxY: number) => {
      const box: Rect = { x, y: boxY, w, h };
      ui.panel(box, { radius: 12, edge: s.phase === "result" ? "#2ea043" : s.phase === "blocked" && !isEmptyCargoEntry(s) ? "#f85149" : "#484f58" });
      let y = box.y + 16;
      if (kicker) { ui.text(kicker, box.x + 16, y + 6, { size: 11, weight: 700, color: s.phase === "blocked" && !isEmptyCargoEntry(s) ? "#ffa198" : CANVAS_THEME.muted }); y += 18; }
      ui.text(title, box.x + 16, y + 12, { size: 18, weight: 700, maxW: w - 32 }); y += 30;
      wrapped.forEach((ls, i) => {
        const l = lines[i], lh = Math.round((l.size ?? 14) * 1.5);
        ls.forEach((t, k) => ui.text(t, box.x + 16, y + lh * k + lh / 2, { size: l.size ?? 14, weight: l.weight, color: l.color }));
        y += ls.length * lh + 4;
      });
      y += 8;
      for (const b of buttons) y = btn(b.id, b.label, b, y);
    };
    // The panel fits the field when it can; when the field is too short (landscape phones), it
    // scrolls inside the field so every button stays reachable (docs/CANVAS_UNIFIED_V0.md §13).
    const avail: Rect = { x: L.field.x, y: L.field.y + 8, w: L.field.w, h: Math.max(0, L.field.h - 16) };
    if (h <= avail.h) drawBox(Math.min(top, Math.max(avail.y, avail.y + avail.h - h)));
    else ui.scrollArea("sort:overlay", avail, h, (off) => drawBox(avail.y - off));
  }
}
