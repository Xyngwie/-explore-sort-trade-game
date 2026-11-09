/**
 * DOCK scene: HUD, every DOCK section, the 物資市場 purchases and the bottom
 * tabs. docs/CANVAS_SHELL_V0.md §5, docs/CANVAS_UNIFIED_V0.md §4. Drawing only
 * reads state; changes happen in the button callbacks.
 */
import {
  CANVAS_MIN_TARGET_PX,
  CANVAS_THEME,
  SHELL_HUD_HEIGHT_PX,
  SHELL_MAX_WIDTH_PX,
  SHELL_TAB_HEIGHT_PX,
  Flow,
  confirmModal,
  pickerModal,
  drawResourceHud,
  drawShellTabs,
  signedDelta,
  type CanvasUI,
  type FrameInfo,
  type HubSnapshot,
  type Rect,
} from "@estg/shared";
import {
  MARKET_COLOR, MARKET_ITEMS, MARKET_NAME, MARKET_SHORT, QTY_STEPS,
  browserMarketDeps, clampQty, confirmText, failureNotice, maxBuy, needsConfirm, purchase, shortText, stockOf, unitPrice,
  type Delta, type MarketDeps, type MarketItem,
} from "./market";
import { DockSections, DOCK_ANCHOR, type DockEnv } from "./dock-sections";
import { PALETTE_TITLE } from "./palette-tree";
import { dockTabs, type DockTab } from "./tabs";
import type { HangarState } from "../hangar";

/** Phone/PC breakpoint already decided for the shell (§13-1). */
export const CANVAS_MOBILE_MAX_W = 600;
/** Rows go to one line from this column width. */
export const WIDE_ROW_MIN_W = 600;

export type MarketRow = { item: MarketItem; rect: Rect; steps: Rect[]; qty: Rect; buy: Rect; info: Rect; note: Rect };
export type DockLayout = {
  column: Rect;
  hud: Rect;
  header: Rect;
  scroll: Rect;
  tabs: Rect;
  wide: boolean;
  /** Market rows as laid out at the top of an empty list (selftests); the scene lays them out where the market section starts. */
  rows: MarketRow[];
  marketTitle: Rect;
};

const PAD = 12;
const GAP = 4;
const ROW_GAP = 8;

/** Market rows starting at (x, y), `inner` wide. */
export function layoutMarketRows(x0: number, y0: number, inner: number, wide: boolean, items: readonly MarketItem[] = MARKET_ITEMS): { rows: MarketRow[]; height: number } {
  let y = y0;
  const rows: MarketRow[] = [];
  for (const item of items) {
    // Every control keeps the 44px minimum (CANVAS_MIN_TARGET_PX). When the buy button
    // (≥ 88px) does not fit beside the quantity buttons, it moves to its own line.
    const T = CANVAS_MIN_TARGET_PX;
    const stepW = T, qtyW = 52, minBuy = 88;
    const ctrlTotal = stepW * 4 + qtyW + GAP * 4;
    const buyBelow = !wide && inner - 16 - ctrlTotal - GAP < minBuy;
    const rowH = wide ? 76 : buyBelow ? 116 + T + 6 : 116;
    const rect: Rect = { x: x0, y, w: inner, h: rowH };
    const buyW = wide ? 128 : buyBelow ? inner - 16 : Math.min(140, inner - 16 - ctrlTotal - GAP);
    const ctrlY = wide ? y + (rowH - T) / 2 : y + 44;
    const ctrlX = wide ? rect.x + rect.w - 8 - buyW - GAP - ctrlTotal : rect.x + 8;
    const steps: Rect[] = [];
    let x = ctrlX;
    for (let i = 0; i < QTY_STEPS.length; i++) {
      if (i === 2) { x += qtyW + GAP; }
      steps.push({ x, y: ctrlY, w: stepW, h: T });
      x += stepW + GAP;
    }
    const qty: Rect = { x: ctrlX + stepW * 2 + GAP * 2, y: ctrlY, w: qtyW, h: T };
    const buy: Rect = buyBelow
      ? { x: rect.x + 8, y: ctrlY + T + 6, w: buyW, h: T }
      : { x: rect.x + rect.w - 8 - buyW, y: ctrlY, w: buyW, h: T };
    const info: Rect = wide
      ? { x: rect.x + 10, y: y + 8, w: Math.max(0, ctrlX - rect.x - 18), h: 36 }
      : { x: rect.x + 10, y: y + 6, w: inner - 20, h: 36 };
    const note: Rect = wide
      ? { x: rect.x + 10, y: y + 46, w: Math.max(0, ctrlX - rect.x - 18), h: 22 }
      : { x: rect.x + 10, y: y + rowH - 24, w: inner - 20, h: 20 };
    rows.push({ item, rect, steps, qty, buy, info, note });
    y += rowH + ROW_GAP;
  }
  return { rows, height: y - ROW_GAP - y0 };
}

export function layoutDock(frame: Pick<FrameInfo, "width" | "height" | "insets">, hasNotice: boolean): DockLayout {
  const { width: W, height: H, insets } = frame;
  const avail = Math.max(0, W - insets.left - insets.right);
  const cw = Math.min(avail, SHELL_MAX_WIDTH_PX);
  const column: Rect = { x: insets.left + (avail - cw) / 2, y: 0, w: cw, h: H };
  const hud: Rect = { x: column.x, y: insets.top, w: cw, h: SHELL_HUD_HEIGHT_PX };
  const header: Rect = { x: column.x, y: hud.y + hud.h, w: cw, h: 44 };
  const tabs: Rect = { x: column.x, y: H - insets.bottom - SHELL_TAB_HEIGHT_PX, w: cw, h: SHELL_TAB_HEIGHT_PX };
  const scrollTop = header.y + header.h;
  const scroll: Rect = { x: column.x, y: scrollTop, w: cw, h: Math.max(0, tabs.y - scrollTop) };
  const wide = cw >= WIDE_ROW_MIN_W;
  const inner = cw - PAD * 2;
  const y = PAD + (hasNotice ? 40 : 0);
  const marketTitle: Rect = { x: column.x + PAD, y, w: inner, h: 28 };
  const { rows } = layoutMarketRows(column.x + PAD, y + 32, inner, wide);
  return { column, hud, header, scroll, tabs, wide, rows, marketTitle };
}

/** What the canvas edition does not have yet (shown as text, no fake buttons). */
export const UNPORTED_LIST = "HUD タップのパレット";
export const UNPORTED_TITLE = "未実装（この画面ではまだ操作できません）";

export type DockSceneOptions = {
  deps?: MarketDeps;
  navigateLegacy?: () => void;
  /** With an environment the full DOCK is drawn; without it only the market (stage 1 selftests). */
  env?: DockEnv;
  /** Bottom tab tapped (enabled tabs only). */
  onTab?: (tab: DockTab) => void;
  redraw?: () => void;
  /** Hangar state after a Sort→HUB ingest (else read from the save). */
  initialState?: HangarState;
};

export class DockScene {
  hub: HubSnapshot | null;
  qty: Record<MarketItem, number> = { ammo: 1, armor: 1, power: 1, junk: 1, unopened: 1 };
  confirm: { item: MarketItem; qty: number } | null = null;
  delta: { item: MarketItem; deltas: Delta[] } | null = null;
  notice: string | null = null;
  readonly deps: MarketDeps;
  readonly sections: DockSections | null;
  /** Section anchors (content y), filled while drawing. */
  readonly anchors = new Map<string, number>();
  constructor(private readonly opts: DockSceneOptions = {}) {
    this.deps = opts.deps ?? browserMarketDeps;
    this.sections = opts.env ? new DockSections(opts.env, () => this.reloadMarket(), () => opts.redraw?.(), opts.initialState) : null;
    if (this.sections) this.sections.onNavigate = () => { this.scrollReset = true; this.delta = null; this.notice = null; this.opts.redraw?.(); };
    this.hub = this.deps.read();
  }
  /** The next frame starts the (new) palette at its top. */
  private scrollReset = false;
  private reloadMarket(): void {
    this.hub = this.deps.read();
    for (const item of MARKET_ITEMS) this.qty[item] = clampQty(this.qty[item], maxBuy(this.hub, item));
  }
  /** Re-read the save (another tab, the play log restoring, …). Never writes. */
  reload(): void {
    this.reloadMarket();
    this.sections?.reloadHub();
  }
  /** Open the palette that holds an old section (SORT tab = 未開封 → 仕分). */
  goAnchor(id: string): void {
    if (this.sections) this.sections.goAnchor(id);
    else this.opts.redraw?.();
  }
  step(item: MarketItem, d: number): void {
    this.qty[item] = clampQty(this.qty[item] + d, maxBuy(this.hub, item));
  }
  requestBuy(item: MarketItem): void {
    const q = clampQty(this.qty[item], maxBuy(this.hub, item));
    if (needsConfirm(item)) { this.confirm = { item, qty: q }; return; }
    this.run(item, q);
  }
  confirmBuy(): void {
    const c = this.confirm;
    this.confirm = null;
    if (c) this.run(c.item, c.qty);
  }
  cancelConfirm(): void { this.confirm = null; }
  private run(item: MarketItem, q: number): void {
    const r = purchase(item, q, this.deps);
    if (r.ok) {
      this.hub = r.hub;
      this.delta = { item, deltas: r.deltas };
      this.notice = null;
      // CANVAS-D4 (神宮決定 2026-11-04): quantity returns to 1 after each purchase.
      for (const it of MARKET_ITEMS) this.qty[it] = clampQty(it === item ? 1 : this.qty[it], maxBuy(this.hub, it));
      this.sections?.reloadHub();
    } else {
      this.notice = failureNotice(r.reason);
      this.reload();
    }
  }

  /** HUB (H) wide layout: CANVAS-PR2 (神宮決定 2026-11-08) — 1200px and up, 3:2, at most 1440px. */
  static readonly HUB_TWO_COL_MIN_W = 1200;
  static readonly HUB_TWO_COL_MAX_W = 1440;

  draw(ui: CanvasUI, frame: FrameInfo): void {
    const ctx = ui.context;
    const L = layoutDock(frame, !!this.notice);
    ctx.fillStyle = CANVAS_THEME.bg;
    ctx.fillRect(0, 0, frame.width, frame.height);
    this.drawHud(ui, L, frame.width <= CANVAS_MOBILE_MAX_W);
    const sc = this.sections;
    const nav = sc?.nav;
    const cur = nav?.current ?? "H";
    // Header: the palette's name, 「‹ 親」 one step back, and 「HUB」 straight home when deeper.
    const hx = L.header.x + PAD, hy = L.header.y;
    if (nav && nav.depth > 1) {
      const parent = nav.parent!;
      ui.button("dock:nav:back", { x: L.header.x + 4, y: hy, w: 112, h: 44 }, `‹ ${PALETTE_TITLE[parent]}`, { fontSize: 13, onActivate: () => sc!.backPalette() });
      ui.text(PALETTE_TITLE[cur], L.header.x + 124, hy + L.header.h / 2, { size: 16, weight: 700, maxW: L.header.w - 124 - (nav.depth > 2 ? 80 : 12) });
      if (nav.depth > 2) ui.button("dock:nav:home", { x: L.header.x + L.header.w - 72, y: hy, w: 68, h: 44 }, "HUB", { fontSize: 13, onActivate: () => sc!.homePalette() });
    } else {
      ui.text("DOCK", hx, hy + L.header.h / 2, { size: 18, weight: 700 });
      ui.text("BASE HUB", hx + 64, hy + L.header.h / 2, { size: 13, color: CANVAS_THEME.muted, maxW: L.header.w - PAD * 2 - 64 });
    }
    ctx.fillStyle = CANVAS_THEME.rowEdge;
    ctx.fillRect(L.header.x, L.header.y + L.header.h - 1, L.header.w, 1);

    if (this.scrollReset) { ui.scrollTo("dock", 0); this.scrollReset = false; }
    const twoCol = !!sc && cur === "H" && frame.width >= DockScene.HUB_TWO_COL_MIN_W;
    const avail = Math.max(0, frame.width - frame.insets.left - frame.insets.right);
    const cw = twoCol ? Math.min(avail, DockScene.HUB_TWO_COL_MAX_W) : L.column.w;
    const cx = twoCol ? frame.insets.left + (avail - cw) / 2 : L.column.x;
    const area: Rect = { x: cx, y: L.scroll.y, w: cw, h: L.scroll.h };
    ui.scrollArea("dock", area, "auto", (off) => {
      const originY = area.y - off;
      const inner = cw - PAD * 2;
      const leftW = twoCol ? Math.floor((inner - PAD) * 0.6) : inner;
      const f = new Flow(ui, cx + PAD, originY + PAD, leftW, originY, this.anchors);
      const side = twoCol ? new Flow(ui, cx + PAD + leftW + PAD, originY + PAD, inner - leftW - PAD, originY, this.anchors) : undefined;
      if (this.notice) {
        const warn = this.notice;
        f.card("market-notice", (c) => c.text(warn, { color: "#ffdcd7" }), { fill: "#3d1d1d", edge: "#f85149" }).gap(8);
      }
      const drawMarket = (mf: Flow, items: readonly MarketItem[]) => this.drawMarket(ui, mf, mf.w >= WIDE_ROW_MIN_W, items);
      if (sc) sc.drawPalette(ui, f, drawMarket, side);
      else drawMarket(f, MARKET_ITEMS);
      if (!sc || cur === "H") {
        const g = side ?? f;
        g.gap(8);
        g.card("unported", (c) => {
          c.text(UNPORTED_TITLE, { weight: 700, color: CANVAS_THEME.muted, size: 14 });
          c.text(`${UNPORTED_LIST}は、既存版で操作します。`, { color: CANVAS_THEME.muted }).gap(8);
          c.buttons([{ id: "dock:legacy", label: "既存版の DOCK を開く", onActivate: () => this.opts.navigateLegacy?.() }]);
        });
      }
      f.gap(PAD);
      return Math.max(f.y, side?.y ?? 0) - originY;
    });

    this.drawTabs(ui, L);
    if (this.confirm) this.drawConfirm(ui, frame, L);
    const spec = sc?.confirmSpec();
    if (spec) confirmModal(ui, L.column, frame.height, spec, frame.insets.top);
    if (sc?.picker) pickerModal(ui, L.column, frame.height, sc.picker, frame.insets.top, frame.insets.bottom);
  }

  /** 物資市場（購入）: title + rows at the flow position. */
  private drawMarket(ui: CanvasUI, f: Flow, wide: boolean, items: readonly MarketItem[] = MARKET_ITEMS): void {
    const cr = Math.max(0, Math.floor(Number(this.hub?.credits) || 0));
    ui.text(items.length === 1 && items[0] === "unopened" ? "未開封コンテナ" : "物資市場（購入）", f.x, f.y + 14, { size: 15, weight: 700 });
    ui.text(`所持 Cr ${cr.toLocaleString("en-US")}`, f.x + f.w, f.y + 14, { size: 13, color: CANVAS_THEME.muted, align: "right" });
    f.y += 32;
    const { rows, height } = layoutMarketRows(f.x, f.y, f.w, wide, items);
    const id = (r: Rect) => r;
    for (const row of rows) this.drawRow(ui, row, id, wide);
    f.y += height;
  }

  private drawTabs(ui: CanvasUI, L: DockLayout): void {
    drawShellTabs(ui, L.tabs, dockTabs(this.sections?.state.hub ?? this.hub), (tab) => {
      if (tab.id === "SORT") this.goAnchor(DOCK_ANCHOR.unopened); // §5-1: SORT tab = DOCK 未開封
      else this.opts.onTab?.(tab);
    });
  }

  private drawHud(ui: CanvasUI, L: DockLayout, mobile: boolean): void {
    drawResourceHud(ui, L.hud, this.sections?.state.hub ?? this.hub, mobile);
  }

  private drawRow(ui: CanvasUI, row: DockLayout["rows"][number], sh: (r: Rect) => Rect, wide: boolean): void {
    const { item } = row;
    const r = sh(row.rect);
    ui.panel(r, { radius: 10 });
    const max = maxBuy(this.hub, item);
    const q = clampQty(this.qty[item], max);
    const can = max >= 1 && !!this.hub;
    const info = sh(row.info);
    const stock = stockOf(this.hub, item);
    ui.text(MARKET_SHORT[item] === MARKET_NAME[item] ? MARKET_NAME[item] : `${MARKET_SHORT[item]}  ${MARKET_NAME[item]}`, info.x, info.y + 10, { size: 15, weight: 700, color: MARKET_COLOR[item], maxW: info.w });
    ui.text(`在庫 ${stock.toLocaleString("en-US")} · 買 ${unitPrice(item)}c${item === "unopened" ? "（毎回確認）" : ""}`, info.x, info.y + 29, { size: 12, color: CANVAS_THEME.muted, maxW: info.w });
    QTY_STEPS.forEach((d, i) => {
      const disabled = !can || (d < 0 ? q <= 1 : q >= max);
      ui.button(`dock:${item}:step:${d}`, sh(row.steps[i]), d > 0 ? `+${d}` : `−${-d}`, { disabled, fontSize: 13, onActivate: () => this.step(item, d) });
    });
    const qr = sh(row.qty);
    ui.text(`×${q}`, qr.x + qr.w / 2, qr.y + qr.h / 2, { size: 16, weight: 700, align: "center", color: can ? CANVAS_THEME.text : CANVAS_THEME.disabledText, maxW: qr.w });
    ui.button(`dock:${item}:buy`, sh(row.buy), "購入", {
      variant: "primary",
      disabled: !can,
      sub: can ? `合計 ${(unitPrice(item) * q).toLocaleString("en-US")}c` : shortText(this.hub, item),
      onActivate: () => this.requestBuy(item),
    });
    const note = sh(row.note);
    if (this.delta?.item === item) {
      let x = note.x;
      for (const d of this.delta.deltas) {
        const s = signedDelta(d.value);
        const str = `${d.label} ${s.text}`;
        ui.text(str, x, note.y + note.h / 2, { size: 12, weight: 600, color: CANVAS_THEME[s.cls] });
        x += ui.context.measureText(str).width + 14;
      }
    } else if (!can && wide) {
      ui.text(shortText(this.hub, item), note.x, note.y + note.h / 2, { size: 12, color: CANVAS_THEME.faint, maxW: note.w });
    }
  }

  private drawConfirm(ui: CanvasUI, frame: FrameInfo, L: DockLayout): void {
    const c = this.confirm!;
    confirmModal(ui, L.column, frame.height, {
      id: "dock:confirm", title: "購入の確認", text: confirmText(c.item, c.qty), okLabel: "購入する",
      onOk: () => this.confirmBuy(), onCancel: () => this.cancelConfirm(),
    }, frame.insets.top);
  }
}
