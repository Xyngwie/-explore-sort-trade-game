/**
 * DOCK scene (canvas stage 1): HUD, unopened count and the 物資市場 purchases.
 * docs/CANVAS_SHELL_V0.md §5. Drawing only reads `DockScene` state; changes
 * happen in the button callbacks.
 */
import {
  CANVAS_MIN_TARGET_PX,
  CANVAS_THEME,
  SHELL_HUD_HEIGHT_PX,
  SHELL_MAX_WIDTH_PX,
  fontSpec,
  formatHudNumber,
  wrapText,
  hudItems,
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

/** Phone/PC breakpoint already decided for the shell (§13-1). */
export const CANVAS_MOBILE_MAX_W = 600;
/** Rows go to one line from this column width. */
export const WIDE_ROW_MIN_W = 600;

export type DockLayout = {
  column: Rect;
  hud: Rect;
  header: Rect;
  scroll: Rect;
  wide: boolean;
  /** Row rects relative to the scroll content top. */
  rows: Array<{ item: MarketItem; rect: Rect; steps: Rect[]; qty: Rect; buy: Rect; info: Rect; note: Rect }>;
  marketTitle: Rect;
  unported: Rect;
  unportedButton: Rect;
};

const PAD = 12;
const GAP = 4;

export function layoutDock(frame: Pick<FrameInfo, "width" | "height" | "insets">, hasNotice: boolean): DockLayout {
  const { width: W, height: H, insets } = frame;
  const avail = Math.max(0, W - insets.left - insets.right);
  const cw = Math.min(avail, SHELL_MAX_WIDTH_PX);
  const column: Rect = { x: insets.left + (avail - cw) / 2, y: 0, w: cw, h: H };
  const hud: Rect = { x: column.x, y: insets.top, w: cw, h: SHELL_HUD_HEIGHT_PX };
  const header: Rect = { x: column.x, y: hud.y + hud.h, w: cw, h: 44 };
  const scrollTop = header.y + header.h;
  const scroll: Rect = { x: column.x, y: scrollTop, w: cw, h: Math.max(0, H - insets.bottom - scrollTop) };
  const wide = cw >= WIDE_ROW_MIN_W;
  const inner = cw - PAD * 2;
  let y = PAD + (hasNotice ? 40 : 0);
  const marketTitle: Rect = { x: column.x + PAD, y, w: inner, h: 28 };
  y += 32;
  const rows: DockLayout["rows"] = [];
  for (const item of MARKET_ITEMS) {
    const rowH = wide ? 76 : 116;
    const rect: Rect = { x: column.x + PAD, y, w: inner, h: rowH };
    // Narrow rows: shrink the steppers (≥36px) then the quantity box before the buy button drops below 72px.
    let stepW = 44, qtyW = 52;
    const fixed = () => 16 + GAP + stepW * 4 + qtyW + GAP * 4;
    if (!wide) {
      if (inner - fixed() < 88) stepW = Math.max(36, 44 - Math.ceil((88 - (inner - fixed())) / 4));
      if (inner - fixed() < 72) qtyW = 44;
    }
    const buyW = wide ? 128 : Math.max(72, Math.min(140, inner - fixed()));
    const ctrlTotal = stepW * 4 + qtyW + GAP * 4;
    const ctrlY = wide ? y + (rowH - 44) / 2 : y + 44;
    const ctrlX = wide ? rect.x + rect.w - 8 - buyW - GAP - ctrlTotal : rect.x + 8;
    const steps: Rect[] = [];
    let x = ctrlX;
    for (let i = 0; i < QTY_STEPS.length; i++) {
      if (i === 2) { x += qtyW + GAP; }
      steps.push({ x, y: ctrlY, w: stepW, h: 44 });
      x += stepW + GAP;
    }
    const qty: Rect = { x: ctrlX + stepW * 2 + GAP * 2, y: ctrlY, w: qtyW, h: 44 };
    const buy: Rect = { x: rect.x + rect.w - 8 - buyW, y: ctrlY, w: buyW, h: 44 };
    const info: Rect = wide
      ? { x: rect.x + 10, y: y + 8, w: Math.max(0, ctrlX - rect.x - 18), h: 36 }
      : { x: rect.x + 10, y: y + 6, w: inner - 20, h: 36 };
    const note: Rect = wide
      ? { x: rect.x + 10, y: y + 46, w: Math.max(0, ctrlX - rect.x - 18), h: 22 }
      : { x: rect.x + 10, y: y + 92, w: inner - 20, h: 20 };
    rows.push({ item, rect, steps, qty, buy, info, note });
    y += rowH + 8;
  }
  y += 8;
  const unported: Rect = { x: column.x + PAD, y, w: inner, h: 0 };
  const unportedButton: Rect = { x: unported.x + 10, y: 0, w: Math.min(inner - 20, 280), h: 44 };
  // The unported card's height depends on its wrapped text; it is measured at draw time.
  return { column, hud, header, scroll, wide, rows, marketTitle, unported, unportedButton };
}

/** Features of the existing DOCK that this stage does not port (shown as text, no fake buttons). */
export const UNPORTED_LIST = "ハンガー（機体・修理）・回路・作戦室（出撃）・SORT（開封）・売却・署名の表示・下部タブ";
export const UNPORTED_TITLE = "未実装（この画面ではまだ操作できません）";

export type DockSceneOptions = {
  deps?: MarketDeps;
  navigateLegacy?: () => void;
};

export class DockScene {
  hub: HubSnapshot | null;
  qty: Record<MarketItem, number> = { ammo: 1, armor: 1, power: 1, junk: 1, unopened: 1 };
  confirm: { item: MarketItem; qty: number } | null = null;
  delta: { item: MarketItem; deltas: Delta[] } | null = null;
  notice: string | null = null;
  readonly deps: MarketDeps;
  constructor(private readonly opts: DockSceneOptions = {}) {
    this.deps = opts.deps ?? browserMarketDeps;
    this.hub = this.deps.read();
  }
  /** Re-read the save (another tab, the play log restoring, …). Never writes. */
  reload(): void {
    this.hub = this.deps.read();
    for (const item of MARKET_ITEMS) this.qty[item] = clampQty(this.qty[item], maxBuy(this.hub, item));
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
    } else {
      this.notice = failureNotice(r.reason);
      this.reload();
    }
  }

  draw(ui: CanvasUI, frame: FrameInfo): void {
    const ctx = ui.context;
    const L = layoutDock(frame, !!this.notice);
    ctx.fillStyle = CANVAS_THEME.bg;
    ctx.fillRect(0, 0, frame.width, frame.height);
    this.drawHud(ui, L, frame.width <= CANVAS_MOBILE_MAX_W);
    // Header
    ui.text("DOCK", L.header.x + PAD, L.header.y + L.header.h / 2, { size: 18, weight: 700 });
    ui.text("BASE HUB · 物資市場", L.header.x + PAD + 64, L.header.y + L.header.h / 2, { size: 13, color: CANVAS_THEME.muted, maxW: L.header.w - PAD * 2 - 64 });
    ctx.fillStyle = CANVAS_THEME.rowEdge;
    ctx.fillRect(L.header.x, L.header.y + L.header.h - 1, L.header.w, 1);

    const unportedTextW = L.unported.w - 20;
    const unportedText = `${UNPORTED_LIST}は、既存版の DOCK で操作します。`;
    ctx.font = fontSpec(13);
    const measureH = 12 + 24 + wrapText(ctx, unportedText, unportedTextW).length * 20 + 10 + 44 + 12;
    const contentH = L.unported.y + measureH + PAD;
    ui.scrollArea("dock", L.scroll, contentH, (off) => {
      const sh = (r: Rect): Rect => ({ x: r.x, y: r.y + L.scroll.y - off, w: r.w, h: r.h });
      if (this.notice) {
        const n = sh({ x: L.column.x + PAD, y: PAD, w: L.column.w - PAD * 2, h: 32 });
        ui.panel(n, { fill: "#3d1d1d", edge: "#f85149", radius: 8 });
        ui.text(this.notice, n.x + 10, n.y + n.h / 2, { size: 13, color: "#ffdcd7", maxW: n.w - 20 });
      }
      const t = sh(L.marketTitle);
      ui.text("物資市場（購入）", t.x, t.y + t.h / 2, { size: 15, weight: 700 });
      const cr = Math.max(0, Math.floor(Number(this.hub?.credits) || 0));
      ui.text(`所持 Cr ${cr.toLocaleString("en-US")}`, t.x + t.w, t.y + t.h / 2, { size: 13, color: CANVAS_THEME.muted, align: "right" });
      for (const row of L.rows) this.drawRow(ui, row, sh, L.wide);
      // Unported card
      const u = sh({ ...L.unported, h: measureH });
      ui.panel(u, { radius: 10 });
      ui.text(UNPORTED_TITLE, u.x + 10, u.y + 12 + 12, { size: 14, weight: 700, color: CANVAS_THEME.muted, maxW: u.w - 20 });
      const ph = ui.paragraph(unportedText, u.x + 10, u.y + 12 + 24, unportedTextW, { size: 13, color: CANVAS_THEME.muted, lineH: 20 });
      const b: Rect = { ...L.unportedButton, y: u.y + 12 + 24 + ph + 10 };
      ui.button("dock:legacy", b, "既存版の DOCK を開く", { onActivate: () => this.opts.navigateLegacy?.() });
    });

    if (this.confirm) this.drawConfirm(ui, frame, L);
  }

  private drawHud(ui: CanvasUI, L: DockLayout, mobile: boolean): void {
    const ctx = ui.context;
    ctx.fillStyle = CANVAS_THEME.panel;
    ctx.fillRect(L.hud.x, L.hud.y, L.hud.w, L.hud.h);
    ctx.fillStyle = CANVAS_THEME.panelEdge;
    ctx.fillRect(L.hud.x, L.hud.y + L.hud.h - 1, L.hud.w, 1);
    const items = hudItems(this.hub);
    const cellW = L.hud.w / items.length;
    items.forEach((it, i) => {
      const cx = L.hud.x + cellW * i + 10;
      const cy = L.hud.y + L.hud.h / 2;
      ui.text(it.label, cx, cy, { size: 12, weight: 700, color: it.value === 0 ? CANVAS_THEME.faint : it.color });
      ui.text(formatHudNumber(it.value, mobile), cx + (it.label.length > 1 ? 22 : 16), cy, { size: 13, weight: 600, color: it.value === 0 ? CANVAS_THEME.faint : CANVAS_THEME.text, maxW: cellW - 30 });
    });
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
    ui.modal("dock:confirm", () => {
      const ctx = ui.context;
      const w = Math.min(L.column.w - 32, 360);
      const text = confirmText(c.item, c.qty);
      ctx.font = fontSpec(15);
      const h = 20 + 26 + wrapText(ctx, text, w - 32).length * 22 + 16 + 48 + 20;
      const box: Rect = { x: L.column.x + (L.column.w - w) / 2, y: Math.max(frame.insets.top + 16, (frame.height - h) / 2), w, h };
      ui.region("dock:confirm:box", box); // taps inside the box do nothing
      ui.panel(box, { radius: 12, edge: "#484f58" });
      ui.text("購入の確認", box.x + 16, box.y + 20 + 10, { size: 16, weight: 700 });
      ui.paragraph(text, box.x + 16, box.y + 20 + 26, w - 32, { size: 15, lineH: 22 });
      const by = box.y + box.h - 20 - 48;
      const bw = (w - 32 - 10) / 2;
      ui.button("dock:confirm:cancel", { x: box.x + 16, y: by, w: bw, h: 48 }, "やめる", { onActivate: () => this.cancelConfirm() });
      ui.button("dock:confirm:ok", { x: box.x + 16 + bw + 10, y: by, w: bw, h: 48 }, "購入する", { variant: "primary", onActivate: () => this.confirmBuy() });
    }, () => this.cancelConfirm());
  }
}
