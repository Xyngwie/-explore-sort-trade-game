/**
 * RESTORE scene on the single canvas (docs/CANVAS_UNIFIED_V0.md §10, U-3).
 *
 * Same rules as the existing Restore page (`app.ts`): the session from
 * `bootstrapFromSearch` (handoff board / handoff id / demo), edge cycle
 * 空 → 線 → × → 空, classification and effect from `puzzle.ts`, Commit Fully
 * Awakened / Commit Bypass / Abandon → Offline / Clear, the per-puzzle edge
 * save (`estg.restore.edges.v1:<puzzleId>`, only when 保存 is on), the noise
 * flash and loop-close celebration timings, nearest-edge taps (`boardHit.ts`)
 * with the existing dead zones, zoom 全体 / 1× / 1.5× on large boards, and the
 * Restore→HUB URL (`buildReturnToTradeUrl`). Drawing and input are canvas.
 *
 * CANVAS-Q1: the engraving name is the user name confirmed before play; the
 * scene has no name field.
 */
import {
  CANVAS_THEME,
  CTA_COPY,
  encodeEdgeState,
  fontSpec,
  sanitizeEditorName,
  setPlayLogOperation,
  playLogBlocked,
  roundRectPath,
  toggleButton,
  Flow,
  type CanvasUI,
  type CircuitOutcome,
  type EdgeMark,
  type Point,
  type Rect,
} from "@estg/shared";
import {
  boardFromMarks,
  bypassGuideEffectJa,
  classifyPlayResult,
  cycleEdgeMark,
  formatCircuitEffectJa,
  freshMarks,
  hEdgeIndex,
  hazardLabel,
  hazardNoiseEdgeIndices,
  isCellDigitActivated,
  outcomeLabel,
  previewOutcomeEffects,
  rarityLabel,
  saveMarksToStorage,
  vEdgeIndex,
} from "../puzzle";
import { bootstrapFromSearch, buildNextLocalBoardHref, buildReturnToTradeUrl, type RestoreSession } from "../session";
import { LOOP_CELEBRATE_MS, shouldArmLoopCelebrate } from "../loopCelebrate";
import { CELL_REM, DOT_REM, MIN_DOT_PX, ZOOM_MODES, fitZoom, nearestEdgeAt, shouldUseLargeBoardLayout, zoomFactor, type ZoomMode } from "../boardHit";

/** Pan starts after this much travel; less is a tap (the existing page toggles on `click`, which a pan never fires). */
export const RESTORE_TAP_SLOP_PX = 8;
const REM = 16;
const NOISE_FLASH_MS = 520;

export type RestoreHost = {
  search: string;
  /** Restore page URL (this scene's page) for 「もう一度」. */
  href: () => string;
  /** HUB base on this page (Restore→HUB URLs are built on it). */
  hubBase: string;
  go: (url: string) => void;
  redraw: () => void;
  /** CANVAS-Q1: the confirmed user name (craft signature). */
  signature: string;
  rateOpts: { hostname: string; isDev: boolean; envRate: string | null; showInjectionDetails: boolean };
  now?: () => number;
};

export const OUTCOME_COLOR: Record<CircuitOutcome, string> = { fully_awakened: "#3fb950", bypass: "#d29922", offline: "#9aa0a6" };

export class RestoreScene {
  readonly session: RestoreSession;
  marks: EdgeMark[];
  outcomeOverride: CircuitOutcome | null;
  persist: boolean;
  abandoned = false;
  readonly editorName: string;
  zoomMode: ZoomMode = "1";
  panX = 0;
  panY = 0;
  private panStart: Point | null = null;
  private panned = false;
  /** The gesture `panStart`/`panned` belong to (core passes the same start object per gesture). */
  private gesture: Point | null = null;
  private noiseFlashEdge: number | null = null;
  private noiseToast: string | null = null;
  private noiseTimer: ReturnType<typeof setTimeout> | null = null;
  private celebrateUntil = 0;
  private prevLoopClosed = false;
  private boardView: Rect | null = null;
  private boardZoom = 1;
  constructor(private readonly host: RestoreHost) {
    this.session = bootstrapFromSearch(host.search, host.rateOpts);
    this.marks = [...this.session.marks];
    this.outcomeOverride = this.session.inboundOutcome ?? null;
    this.persist = this.session.source === "demo" || this.session.source === "handoff-id";
    // CANVAS-Q1: inbound name (the HUB passes the signature) or the confirmed signature; never typed here.
    this.editorName = sanitizeEditorName(this.session.editorName ?? this.session.engravedName ?? host.signature) ?? "";
    this.prevLoopClosed = this.play().loopClosed;
  }
  private now(): number { return this.host.now?.() ?? Date.now(); }
  get locked(): boolean { return this.session.locked; }
  dispose(): void { if (this.noiseTimer) clearTimeout(this.noiseTimer); }

  /* ------------------------------ rules (app.ts) ------------------------------ */
  play() {
    const p = this.session.puzzle;
    return classifyPlayResult(p.clues, this.marks, p.cols, p.rows, this.abandoned ? "offline" : this.outcomeOverride);
  }
  private persistIfNeeded(): void { if (this.persist && !this.locked) saveMarksToStorage(this.session.puzzle.puzzleId, this.marks); }
  private op(kind: string, ctx: Record<string, string | number> = {}): boolean {
    if (playLogBlocked()) return false;
    setPlayLogOperation(`restore.${kind}`, ctx);
    return true;
  }
  toggleEdge(index: number): void {
    if (this.locked || !this.op("edge", { edge: index })) return;
    const p = this.session.puzzle;
    const noise = hazardNoiseEdgeIndices(p.clues, p.cols, p.rows, this.session.hazard);
    const next = cycleEdgeMark(this.marks[index] ?? 0);
    this.marks[index] = next;
    this.outcomeOverride = null;
    this.abandoned = false;
    if (this.noiseTimer) { clearTimeout(this.noiseTimer); this.noiseTimer = null; }
    this.noiseFlashEdge = null; this.noiseToast = null;
    if (noise.has(index) && this.session.hazard !== "none") {
      this.noiseFlashEdge = index;
      this.noiseToast = next === 1 ? "ノイズ干渉 — 危険辺に導通" : next === 2 ? "破断マーク — ノイズ辺を遮断" : "ノイズ辺を解放";
      this.noiseTimer = setTimeout(() => { this.noiseFlashEdge = null; this.noiseToast = null; this.noiseTimer = null; this.host.redraw(); }, NOISE_FLASH_MS);
    }
    this.persistIfNeeded();
    this.afterChange();
  }
  private afterChange(): void {
    const closed = this.play().loopClosed;
    if (shouldArmLoopCelebrate(this.prevLoopClosed, closed)) {
      this.celebrateUntil = this.now() + LOOP_CELEBRATE_MS;
      setTimeout(() => this.host.redraw(), LOOP_CELEBRATE_MS + 20);
    }
    this.prevLoopClosed = closed;
    this.host.redraw();
  }
  commitAwaken(): void {
    if (this.locked || this.play().outcome !== "fully_awakened" || !this.op("commit-awaken")) return;
    this.outcomeOverride = "fully_awakened"; this.abandoned = false; this.persistIfNeeded(); this.afterChange();
  }
  commitBypass(): void {
    if (this.locked || !this.op("commit-bypass")) return;
    this.outcomeOverride = "bypass"; this.abandoned = false; this.persistIfNeeded(); this.afterChange();
  }
  abandon(): void {
    if (this.locked || !this.op("abandon")) return;
    this.abandoned = true; this.outcomeOverride = "offline"; this.persistIfNeeded(); this.afterChange();
  }
  clear(): void {
    if (this.locked || !this.op("clear")) return;
    const p = this.session.puzzle;
    this.marks = freshMarks(p.cols, p.rows); this.outcomeOverride = null; this.abandoned = false; this.persistIfNeeded(); this.afterChange();
  }
  setPersist(on: boolean): void {
    if (this.locked || !this.op("persist", { on: on ? 1 : 0 })) return;
    this.persist = on;
    if (on) this.persistIfNeeded();
  }
  returnUrl(): string {
    const c = this.play();
    const p = this.session.puzzle;
    return buildReturnToTradeUrl({
      circuitId: this.session.circuitId, cols: p.cols, rows: p.rows, marks: this.marks, puzzleId: p.puzzleId,
      outcome: c.outcome, lastEditorName: this.editorName, perfect: c.perfectClearance || undefined,
      locked: this.locked || c.perfectClearance || undefined, baseUrl: this.host.hubBase,
    });
  }
  toHub(): void { if (!playLogBlocked()) this.host.go(this.returnUrl()); }
  nextBoard(): void {
    if (this.session.source !== "demo" || playLogBlocked()) return;
    const href = buildNextLocalBoardHref(`board-${this.now().toString(36)}`, this.host.href());
    this.host.go(new URL(href, this.host.href()).toString());
  }

  /* -------------------------------- geometry -------------------------------- */
  isLarge(availW: number): boolean {
    const p = this.session.puzzle;
    return shouldUseLargeBoardLayout(p.cols, p.rows, availW, REM);
  }
  zoom(availW: number, availH: number): number {
    const p = this.session.puzzle;
    if (!this.isLarge(availW)) return 1;
    return zoomFactor(this.zoomMode, fitZoom(p.cols, p.rows, availW, availH, REM));
  }
  /** Dot size / pitch at a zoom (mirror of style.css: cell 2rem, dot 0.35rem, min 3px). */
  static metrics(z: number): { dot: number; cell: number; pitch: number } {
    const dot = Math.max(MIN_DOT_PX, DOT_REM * REM * z), cell = CELL_REM * REM * z;
    return { dot, cell, pitch: dot + cell };
  }
  extent(z: number): { w: number; h: number } {
    const p = this.session.puzzle, m = RestoreScene.metrics(z);
    return { w: p.cols * m.cell + (p.cols + 1) * m.dot, h: p.rows * m.cell + (p.rows + 1) * m.dot };
  }
  private clampPan(view: Rect, z: number): void {
    const e = this.extent(z);
    this.panX = Math.max(0, Math.min(Math.max(0, e.w - view.w), this.panX));
    this.panY = Math.max(0, Math.min(Math.max(0, e.h - view.h), this.panY));
  }
  /** Board-space point → nearest edge (same dead zones as the existing page). */
  edgeAt(view: Rect, z: number, p: Point): number | null {
    const m = RestoreScene.metrics(z), e = this.extent(z);
    const ox = view.x + Math.max(0, (view.w - e.w) / 2) - this.panX + m.dot / 2;
    const oy = view.y + Math.max(0, (view.h - e.h) / 2) - this.panY + m.dot / 2;
    const pz = this.session.puzzle;
    const hit = nearestEdgeAt(p.x, p.y, { cols: pz.cols, rows: pz.rows, originX: ox, originY: oy, pitchX: m.pitch, pitchY: m.pitch });
    return hit ? hit.index : null;
  }
  /** Canvas point at the middle of an edge as last drawn (verification scripts). */
  debugEdgeCenter(index: number): Point | null {
    const view = this.boardView;
    if (!view) return null;
    const pz = this.session.puzzle, z = this.boardZoom, m = RestoreScene.metrics(z), e = this.extent(z);
    const ox = view.x + Math.max(0, (view.w - e.w) / 2) - this.panX + m.dot / 2;
    const oy = view.y + Math.max(0, (view.h - e.h) / 2) - this.panY + m.dot / 2;
    const nh = pz.cols * (pz.rows + 1);
    if (index < nh) { const y = Math.floor(index / pz.cols), x = index % pz.cols; return { x: ox + (x + 0.5) * m.pitch, y: oy + y * m.pitch }; }
    const k = index - nh, y = Math.floor(k / (pz.cols + 1)), x = k % (pz.cols + 1);
    return { x: ox + x * m.pitch, y: oy + (y + 0.5) * m.pitch };
  }
  setZoom(m: ZoomMode): void { this.zoomMode = m; this.panX = 0; this.panY = 0; this.host.redraw(); }

  /* --------------------------------- drawing -------------------------------- */
  /** CANVAS-G5: the board screen keeps the board and the confirm buttons; the rest is here. */
  detail = false;
  setDetail(on: boolean): void { this.detail = on; this.host.redraw(); }
  private drawDetail(f: Flow, preview: ReturnType<typeof previewOutcomeEffects>, c: ReturnType<RestoreScene["play"]>): void {
    const s = this.session, pz = s.puzzle;
    f.buttons([{ id: "restore:detail-back", label: "‹ 修復", w: 112, onActivate: () => this.setDetail(false) }]).gap(8);
    f.heading("修復の詳細");
    f.text("大半は不完全基板。稀に可解コア。部分修復→Bypass、完全ループ→Fully Awakened（刻印ロック）、放棄→Offline。タイマー圧なし。", { size: 12, color: CANVAS_THEME.muted }).gap(4);
    f.text("数字＝そのマスの上下左右に接する線の本数。線をつないで閉ループを作り、数字を満たします。", { size: 12 });
    f.text(`${c.effect.activeLoopEdgeCount > 0 ? `有効ループ ${c.effect.activeLoopEdgeCount}辺${c.effect.loopCount > 1 ? `（${c.effect.loopCount}ループ中の最小）` : ""}` : "ループなし → 効果 0"} · 青白グロー＝採点中の最小閉ループ`, { size: 11, color: CANVAS_THEME.muted });
    f.text(`${s.note}`, { size: 11, color: CANVAS_THEME.muted });
    f.text(`puzzleSeed ${pz.puzzleId} · 辺: 空 → 線 → × → 空${s.circuitId ? ` · circuitId ${s.circuitId}` : ""}`, { size: 11, color: CANVAS_THEME.muted }).gap(4);
    this.drawPreview(f, preview);
    f.gap(6);
    f.text(`刻印 ${s.engravedName ?? (sanitizeEditorName(this.editorName) || "—")}（開始画面で確定した名前）`, { size: 12, color: CANVAS_THEME.muted });
    f.text("判定は digit 充足＋単一ループ。Perfect は Fully Awakened かつ完全充足でロック。制限タイマーなし。", { size: 11, color: CANVAS_THEME.muted });
    f.gap(8);
    // Judge details (the existing page's table, as lines).
    f.card("restore:judge", (k) => {
      k.text("判定の詳細", { weight: 700, size: 13 });
      const enc = encodeEdgeState(this.marks);
      const board = boardFromMarks(pz.cols, pz.rows, this.marks, pz.puzzleId, c.outcome);
      for (const [a, b] of [
        ["loop-closed?", c.loopClosed ? "yes" : "no"],
        ["digit satisfaction", `${c.digits.satisfied}/${c.digits.clueCount} (${(c.digits.rate * 100).toFixed(0)}%)`],
        ["status", outcomeLabel(c.outcome)],
        ["perfect / locked", `${c.perfectClearance ? "perfect" : "—"} / ${this.locked || c.perfectClearance ? "locked" : "editable"}`],
        ["line edges", String(c.lineCount)],
        ["edgeState", enc || "(empty)"],
        ["board.outcome", board.outcome ?? "—"],
      ]) k.kv(a, b, { size: 11 });
    }).gap(8);
  }

  draw(ui: CanvasUI, f: Flow, viewportH: number): void {
    const s = this.session, pz = s.puzzle;
    const c = this.play();
    const effectLabel = formatCircuitEffectJa(c.effect);
    const preview = previewOutcomeEffects(pz.clues, this.marks, pz.cols, pz.rows);
    const t = this.now();
    const celebrating = t < this.celebrateUntil;
    const canAwaken = !this.locked && c.outcome === "fully_awakened";
    const canBypass = !this.locked && (c.outcome === "bypass" || c.digits.satisfied > 0 || c.loopClosed);
    const large = this.isLarge(f.w - 12);
    if (this.detail) return this.drawDetail(f, preview, c);

    ui.text("精密回路修復", f.x, f.y + 12, { size: 18, weight: 700 }); f.y += 30;
    if (this.locked) {
      f.card("restore:lock", (k) => {
        k.text("完璧な回路・編集不可", { weight: 700 });
        k.text(`最終編集者（刻印） ${s.engravedName ?? (sanitizeEditorName(this.editorName) || "—")}`, { size: 12, color: CANVAS_THEME.muted });
      }).gap(8);
    }
    // Outcome banner.
    f.card("restore:outcome", (k) => {
      k.text(outcomeLabel(c.outcome), { weight: 700, size: 16, color: OUTCOME_COLOR[c.outcome] });
      k.text(c.blurb, { size: 12, color: CANVAS_THEME.muted });
    }, { edge: OUTCOME_COLOR[c.outcome] }).gap(8);
    // Bypass hero.
    if (!this.locked && (s.rarity === "flawed_majority" && c.outcome !== "fully_awakened" || c.outcome === "bypass")) {
      const flawed = s.rarity === "flawed_majority"; // (inside: the outcome is never fully_awakened here)
      f.card("restore:hero", (k) => {
        k.text(flawed ? "不完全基板 — Bypass で確定" : "Bypass 準備完了", { weight: 700, color: "#d29922" });
        k.text(flawed ? "全解は期待しない盤です。部分充足のまま Bypass で拠点へ戻せます。" : "部分修復として確定できます。", { size: 12 });
        k.text(bypassGuideEffectJa(preview.bypass), { size: 12, weight: 600 }).gap(6);
        k.buttons([{ id: "restore:hero-bypass", label: "Bypass を確定する", variant: "primary", disabled: flawed ? !canBypass : false, onActivate: () => this.commitBypass() }]);
      }, { edge: "#d29922" }).gap(8);
    }
    // Board card.
    f.card("restore:board", (k) => {
      const badges = `${rarityLabel(s.rarity)}${s.hazard !== "none" ? ` · ${hazardLabel(s.hazard)}` : ""} · ${pz.cols}×${pz.rows}`;
      k.text(badges, { size: 12, weight: 700, color: s.rarity === "perfect_rare" ? "#3fb950" : CANVAS_THEME.muted });
      if (large) {
        k.buttons(ZOOM_MODES.map((m) => ({ id: `restore:zoom:${m}`, label: m === "fit" ? "全体" : m === "1" ? "1×" : "1.5×", variant: this.zoomMode === m ? "primary" : "normal", w: 64, onActivate: () => this.setZoom(m) }))).gap(6);
      }
      // One reserved status line (noise toast / loop celebration) so the board never moves under the finger.
      const status = this.noiseToast
        ? { text: this.noiseToast, color: "#ff7b72" }
        : c.loopClosed && celebrating
          ? { text: `${c.perfectClearance || c.outcome === "fully_awakened" ? "完全ループ成立" : "閉ループ成立"} · 効果値が着地`, color: "#9cdcff" }
          : c.loopClosed ? { text: "閉ループ採点中", color: CANVAS_THEME.muted } : null;
      ui.text(status?.text ?? "", k.x, k.y + 10, { size: 12, weight: 700, color: status?.color, maxW: k.w });
      k.y += 22;
      const maxH = Math.max(160, Math.round(viewportH * 0.72));
      const z = this.zoom(k.w, maxH);
      const e = this.extent(z);
      const view: Rect = { x: k.x, y: k.y, w: k.w, h: Math.min(maxH, e.h + 12) };
      this.boardView = view;
      this.boardZoom = z;
      this.clampPan(view, z);
      this.drawBoard(ui, view, z, celebrating, c);
      k.y += view.h + 8;
      // Meters.
      const pct = Math.round(c.digits.rate * 100);
      k.text(`充足 ${c.digits.satisfied}/${c.digits.clueCount} · ${pct}%`, { size: 12, weight: 600 });
      const ctx = ui.context;
      ctx.fillStyle = CANVAS_THEME.panelEdge; ctx.fillRect(k.x, k.y, k.w, 6);
      ctx.fillStyle = "#3fb950"; ctx.fillRect(k.x, k.y, k.w * c.digits.rate, 6);
      k.y += 12;
      k.kv("効果値", effectLabel, { weight: 700 });
    }).gap(8);
    // Actions.
    f.card("restore:actions", (k) => {
      k.buttons([
        { id: "restore:commit-awaken", label: "Commit Fully Awakened", disabled: !canAwaken, onActivate: () => this.commitAwaken() },
        { id: "restore:commit-bypass", label: "Commit Bypass", variant: s.rarity === "flawed_majority" || c.outcome === "bypass" ? "primary" : "normal", disabled: !canBypass, onActivate: () => this.commitBypass() },
        { id: "restore:abandon", label: "Abandon → Offline", disabled: this.locked, onActivate: () => this.abandon() },
        { id: "restore:clear", label: "Clear edges", disabled: this.locked, onActivate: () => this.clear() },
        ...(s.source === "demo" ? [{ id: "restore:again", label: CTA_COPY.again, onActivate: () => this.nextBoard() }] : []),
      ]).gap(6);
      const r: Rect = { x: k.x, y: k.y, w: k.w, h: 44 };
      toggleButton(ui, "restore:persist", r, "この盤の線を保存する（この puzzleId）", this.persist, { disabled: this.locked, onActivate: () => this.setPersist(!this.persist) });
      k.y += 50;
    }).gap(8);
    // CANVAS-G5 (神宮決定 2026-11-08): explanations, preview and the judge details are 詳細.
    f.buttons([{ id: "restore:detail", label: "詳細", sub: "説明・成果プレビュー・判定の詳細", w: f.w, onActivate: () => this.setDetail(true) }]).gap(8);
    // Return CTA.
    f.card("restore:cta", (k) => {
      k.kv(`成果 ${outcomeLabel(c.outcome)}`, "", { weight: 700, color: OUTCOME_COLOR[c.outcome] }).gap(4);
      k.buttons([{ id: "restore:to-hangar", label: CTA_COPY.toHangar, variant: "primary", w: k.w, onActivate: () => this.toHub() }]);
    });
  }

  private drawPreview(k: Flow, preview: ReturnType<typeof previewOutcomeEffects>): void {
    k.gap(6).text("成果プレビュー（効果値）", { size: 12, weight: 700 });
    if (!preview.bypass.hasLoop) { k.text("閉ループが無いため効果は 0。線を閉じてから Bypass / Fully Awakened の差が出ます。", { size: 11, color: CANVAS_THEME.muted }); return; }
    k.kv(`Bypass ${preview.bypass.effect}`, `Fully Awakened ${preview.awakened.effect}`, { size: 13, weight: 600 });
    k.text(preview.awakenedBetter ? `差 +${preview.awakened.effect - preview.bypass.effect}（Perfect 時の 0→4 ボーナス）` : "現状、両者の効果値は同じ（0セル寄与なし）", { size: 11, color: CANVAS_THEME.muted });
  }

  private drawBoard(ui: CanvasUI, view: Rect, z: number, celebrating: boolean, c: ReturnType<RestoreScene["play"]>): void {
    const ctx = ui.context;
    const s = this.session, pz = s.puzzle;
    const m = RestoreScene.metrics(z), e = this.extent(z);
    const ox = view.x + Math.max(0, (view.w - e.w) / 2) - this.panX;
    const oy = view.y + Math.max(0, (view.h - e.h) / 2) - this.panY;
    ctx.save();
    ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip();
    ctx.fillStyle = "#0b0f14"; ctx.fillRect(view.x, view.y, view.w, view.h);
    const noise = hazardNoiseEdgeIndices(pz.clues, pz.cols, pz.rows, s.hazard);
    const active = new Set(c.effect.activeLoopEdgeIndices);
    const scoring = new Set(c.effect.scoringCells.map((p) => `${p.x},${p.y}`));
    const edgeW = Math.max(3, m.dot);
    const flashOn = this.noiseFlashEdge != null && Math.floor(this.now() / 80) % 2 === 0;
    const edgeColor = (i: number): { fill: string; glow: string | null } => {
      const mk = this.marks[i] ?? 0;
      const nz = noise.has(i) && s.hazard !== "none";
      if (mk === 1) {
        if (active.has(i)) return { fill: c.perfectClearance ? "#b6e3ff" : "#9cdcff", glow: celebrating || c.loopClosed ? "rgba(121,184,255,0.9)" : "rgba(121,184,255,0.6)" };
        return { fill: nz ? "#e3a857" : "#58a6ff", glow: null };
      }
      if (mk === 2) return { fill: nz ? "#2a1818" : "#21262d", glow: null };
      return { fill: nz ? "#3a2f28" : "#30363d", glow: null };
    };
    const drawEdge = (i: number, r: Rect) => {
      const col = edgeColor(i);
      if (col.glow) { ctx.fillStyle = col.glow; ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); }
      ctx.globalAlpha = this.noiseFlashEdge === i && flashOn ? 0.4 : 1;
      ctx.fillStyle = col.fill; ctx.fillRect(r.x, r.y, r.w, r.h);
      if ((this.marks[i] ?? 0) === 2) {
        ctx.strokeStyle = noise.has(i) ? "#f85149" : "#484f58"; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        ctx.font = fontSpec(Math.max(9, Math.round(10 * z)), 700); ctx.fillStyle = noise.has(i) ? "#ff7b72" : "#f85149";
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("×", r.x + r.w / 2, r.y + r.h / 2);
      }
      ctx.globalAlpha = 1;
    };
    for (let y = 0; y <= pz.rows; y++) for (let x = 0; x < pz.cols; x++) {
      const px = ox + x * m.pitch + m.dot, py = oy + y * m.pitch + (m.dot - edgeW) / 2;
      drawEdge(hEdgeIndex(pz.cols, pz.rows, x, y), { x: px, y: py, w: m.cell, h: edgeW });
    }
    for (let y = 0; y < pz.rows; y++) for (let x = 0; x <= pz.cols; x++) {
      const px = ox + x * m.pitch + (m.dot - edgeW) / 2, py = oy + y * m.pitch + m.dot;
      drawEdge(vEdgeIndex(pz.cols, pz.rows, x, y), { x: px, y: py, w: edgeW, h: m.cell });
    }
    ctx.fillStyle = "#8b949e";
    for (let y = 0; y <= pz.rows; y++) for (let x = 0; x <= pz.cols; x++) {
      ctx.beginPath(); ctx.arc(ox + x * m.pitch + m.dot / 2, oy + y * m.pitch + m.dot / 2, m.dot / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = fontSpec(Math.max(10, Math.round(15 * z)), 700);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let y = 0; y < pz.rows; y++) for (let x = 0; x < pz.cols; x++) {
      const clue = pz.clues[y]![x];
      const cx = ox + x * m.pitch + m.dot + m.cell / 2, cy = oy + y * m.pitch + m.dot + m.cell / 2;
      if (scoring.has(`${x},${y}`)) {
        roundRectPath(ctx, { x: cx - m.cell / 2 + 2, y: cy - m.cell / 2 + 2, w: m.cell - 4, h: m.cell - 4 }, 4);
        ctx.strokeStyle = "rgba(121,184,255,0.7)"; ctx.stroke();
      }
      if (clue == null) continue;
      ctx.fillStyle = isCellDigitActivated(pz.clues, this.marks, pz.cols, pz.rows, x, y) ? "#3fb950" : "#e8eaed";
      ctx.fillText(String(clue), cx, cy);
    }
    ctx.restore();
    if (e.w > view.w || e.h > view.h) ui.text("ドラッグで盤を動かせます", view.x + view.w - 6, view.y + view.h - 10, { size: 10, color: CANVAS_THEME.faint, align: "right" });
    if (this.locked) return;
    ui.dragRegion("restore:board", view, (start, end) => {
      const panned = this.gesture === start && this.panned;
      this.gesture = null; this.panStart = null; this.panned = false;
      if (panned || Math.hypot(end.x - start.x, end.y - start.y) >= RESTORE_TAP_SLOP_PX) { this.host.redraw(); return; }
      const i = this.edgeAt(view, z, start);
      if (i != null) this.toggleEdge(i);
    }, (start, cur) => {
      if (this.gesture !== start) { this.gesture = start; this.panStart = { x: this.panX, y: this.panY }; this.panned = false; }
      if (!this.panned && Math.hypot(cur.x - start.x, cur.y - start.y) < RESTORE_TAP_SLOP_PX) return;
      this.panned = true;
      this.panX = this.panStart!.x - (cur.x - start.x);
      this.panY = this.panStart!.y - (cur.y - start.y);
      this.clampPan(view, z);
      this.host.redraw();
    });
  }
}
