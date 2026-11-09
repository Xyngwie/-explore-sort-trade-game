/**
 * Higher-level canvas widgets built on CanvasUI (docs/CANVAS_UNIFIED_V0.md §3):
 * a vertical flow layout with cards, a confirm dialog, a picker dialog and the
 * mech gauge. Drawing only; actions run in button callbacks.
 */
import { CANVAS_THEME, fontSpec, roundRectPath, wrapText, type ButtonVariant, type CanvasUI, type Rect } from "./core";
import { MECH_GAUGE_COLORS, type MechGaugeModel } from "../mech-gauge";
import { formatHudNumber, hudItems, type ShellTabState } from "../fullscreen-shell";
import type { HubSnapshot } from "../hub-save";

export type FlowButton = {
  id: string;
  label: string;
  sub?: string;
  disabled?: boolean;
  variant?: ButtonVariant;
  /** Fixed width (else measured from the label). */
  w?: number;
  onActivate?: () => void;
};
export type FlowTextOpts = { size?: number; color?: string; weight?: 400 | 600 | 700; lineH?: number };

/**
 * Stacks content top-down inside a width. `originY` is the canvas y of the
 * content top (scroll area top − scroll offset), so anchors are recorded in
 * content coordinates and survive scrolling.
 */
export class Flow {
  y: number;
  constructor(
    readonly ui: CanvasUI,
    readonly x: number,
    y: number,
    readonly w: number,
    readonly originY = 0,
    readonly anchors?: Map<string, number>,
  ) { this.y = y; }

  gap(h = 8): this { this.y += h; return this; }
  /** Remember where a section starts (content coordinates). */
  mark(anchor: string): this { this.anchors?.set(anchor, this.y - this.originY); return this; }
  heading(text: string, o: FlowTextOpts = {}): this {
    const size = o.size ?? 15;
    this.ui.text(text, this.x, this.y + 12, { size, weight: o.weight ?? 700, color: o.color, maxW: this.w });
    this.y += 26;
    return this;
  }
  text(text: string, o: FlowTextOpts = {}): this {
    const size = o.size ?? 13;
    const lineH = o.lineH ?? Math.round(size * 1.5);
    const ctx = this.ui.context;
    ctx.font = fontSpec(size, o.weight ?? 400);
    ctx.fillStyle = o.color ?? CANVAS_THEME.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const lines = wrapText(ctx, text, this.w);
    lines.forEach((l, i) => ctx.fillText(l, this.x, this.y + lineH * i + lineH / 2));
    this.y += lines.length * lineH;
    return this;
  }
  /** One line: left text, optional right text (muted). */
  kv(left: string, right = "", o: FlowTextOpts = {}): this {
    const size = o.size ?? 13;
    const ctx = this.ui.context;
    ctx.font = fontSpec(size);
    const rw = right ? Math.min(this.w * 0.5, ctx.measureText(right).width) : 0;
    this.ui.text(left, this.x, this.y + 10, { size, weight: o.weight, color: o.color, maxW: this.w - rw - (right ? 8 : 0) });
    if (right) this.ui.text(right, this.x + this.w, this.y + 10, { size, color: CANVAS_THEME.muted, align: "right", maxW: rw });
    this.y += o.lineH ?? 20;
    return this;
  }
  /** Buttons in rows, wrapping to the next row when the width runs out. */
  buttons(btns: FlowButton[], o: { h?: number; gap?: number; fill?: boolean } = {}): this {
    const h = o.h ?? 44, gap = o.gap ?? 6;
    const ctx = this.ui.context;
    ctx.font = fontSpec(14, 600);
    const widths = btns.map((b) => Math.min(this.w, b.w ?? Math.max(72, ctx.measureText(b.label).width + 28, b.sub ? ctx.measureText(b.sub).width * 0.85 + 24 : 0)));
    let x = this.x, rowStart = 0;
    const rows: number[][] = [[]];
    widths.forEach((bw, i) => {
      if (x > this.x && x + bw > this.x + this.w + 0.5) { rows.push([]); x = this.x; rowStart = i; }
      rows[rows.length - 1].push(i);
      x += bw + gap;
    });
    void rowStart;
    for (const row of rows) {
      if (row.length === 0) continue;
      let extra = 0;
      if (o.fill) {
        const used = row.reduce((s, i) => s + widths[i], 0) + gap * (row.length - 1);
        extra = (this.w - used) / row.length;
      }
      let bx = this.x;
      for (const i of row) {
        const b = btns[i], bw = widths[i] + extra;
        this.ui.button(b.id, { x: bx, y: this.y, w: bw, h }, b.label, { disabled: b.disabled, variant: b.variant, sub: b.sub, fontSize: b.sub ? 13 : 14, onActivate: b.onActivate });
        bx += bw + gap;
      }
      this.y += h + gap;
    }
    this.y -= gap;
    return this;
  }
  /**
   * A panel around the content `draw` adds. The panel height comes from the
   * previous frame's measurement (corrected with one extra frame).
   */
  card(id: string, draw: (f: Flow) => void, o: { pad?: number; fill?: string; edge?: string; highlight?: boolean } = {}): this {
    const pad = o.pad ?? 12;
    const key = `card:${id}:h`;
    const top = this.y;
    const h = this.ui.memo.get(key) ?? 60;
    this.ui.panel({ x: this.x, y: top, w: this.w, h }, { fill: o.fill, edge: o.highlight ? CANVAS_THEME.primary : o.edge, radius: 10 });
    if (o.highlight) {
      const ctx = this.ui.context;
      roundRectPath(ctx, { x: this.x - 1, y: top - 1, w: this.w + 2, h: h + 2 }, 11);
      ctx.strokeStyle = CANVAS_THEME.primary;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    const inner = new Flow(this.ui, this.x + pad, top + pad, this.w - pad * 2, this.originY, this.anchors);
    draw(inner);
    const measured = Math.round(inner.y - top + pad);
    if (measured !== h) { this.ui.memo.set(key, measured); this.ui.requestRedraw(); }
    this.y = top + measured;
    return this;
  }
}

export type ConfirmSpec = {
  id: string;
  title: string;
  text: string;
  okLabel?: string;
  cancelLabel?: string;
  okVariant?: ButtonVariant;
  /** Optional quantity row (e.g. a sale: 神宮 2026-11-09). The caller rebuilds `text` from the value. */
  qty?: { value: number; max: number; steps: readonly number[]; onChange: (q: number) => void };
  onOk: () => void;
  onCancel: () => void;
};
/** Canvas confirm dialog (replaces window.confirm). Backdrop / Escape = cancel. */
export function confirmModal(ui: CanvasUI, column: { x: number; w: number }, height: number, spec: ConfirmSpec, insetTop = 0): void {
  ui.modal(spec.id, () => {
    const ctx = ui.context;
    const w = Math.min(column.w - 32, 380);
    ctx.font = fontSpec(15);
    const lines = wrapText(ctx, spec.text, w - 32);
    const qtyRow = spec.qty ? 44 + 14 : 0;
    const h = 20 + 26 + lines.length * 22 + 16 + qtyRow + 48 + 20;
    const box: Rect = { x: column.x + (column.w - w) / 2, y: Math.max(insetTop + 16, (height - h) / 2), w, h };
    ui.region(`${spec.id}:box`, box);
    ui.panel(box, { radius: 12, edge: "#484f58" });
    ui.text(spec.title, box.x + 16, box.y + 30, { size: 16, weight: 700, maxW: w - 32 });
    ui.paragraph(spec.text, box.x + 16, box.y + 46, w - 32, { size: 15, lineH: 22 });
    const by = box.y + box.h - 20 - 48, bw = (w - 42) / 2;
    if (spec.qty) {
      const q = spec.qty, steps = q.steps;
      const half = Math.ceil(steps.length / 2);
      const gap = 6, qtyW = 60;
      const stepW = Math.max(44, Math.min(56, (w - 32 - qtyW - gap * steps.length) / steps.length));
      const rowW = stepW * steps.length + qtyW + gap * steps.length;
      let x = box.x + (w - rowW) / 2;
      const y = by - 14 - 44;
      steps.forEach((d, i) => {
        if (i === half) {
          ui.text(`×${q.value}`, x + qtyW / 2, y + 22, { size: 16, weight: 700, align: "center", maxW: qtyW });
          x += qtyW + gap;
        }
        const next = Math.max(1, Math.min(q.max, q.value + d));
        ui.button(`${spec.id}:qty:${d}`, { x, y, w: stepW, h: 44 }, d > 0 ? `+${d}` : `−${-d}`, { fontSize: 13, disabled: next === q.value, onActivate: () => q.onChange(next) });
        x += stepW + gap;
      });
    }
    ui.button(`${spec.id}:cancel`, { x: box.x + 16, y: by, w: bw, h: 48 }, spec.cancelLabel ?? "やめる", { onActivate: spec.onCancel });
    ui.button(`${spec.id}:ok`, { x: box.x + 26 + bw, y: by, w: bw, h: 48 }, spec.okLabel ?? "OK", { variant: spec.okVariant ?? "primary", onActivate: spec.onOk });
  }, spec.onCancel);
}

export type PickerOption = { key: string; label: string; sub?: string; disabled?: boolean; selected?: boolean };
export type PickerSpec = { id: string; title: string; options: PickerOption[]; onPick: (key: string) => void; onCancel: () => void };
/** Canvas list picker (replaces <select>). */
export function pickerModal(ui: CanvasUI, column: { x: number; w: number }, height: number, spec: PickerSpec, insetTop = 0, insetBottom = 0): void {
  ui.modal(spec.id, () => {
    const w = Math.min(column.w - 24, 420);
    const rowH = 52;
    const maxH = height - insetTop - insetBottom - 48;
    const listH = Math.min(spec.options.length * (rowH + 6), maxH - 56 - 64);
    const h = 56 + listH + 64;
    const box: Rect = { x: column.x + (column.w - w) / 2, y: Math.max(insetTop + 24, (height - h) / 2), w, h };
    ui.region(`${spec.id}:box`, box);
    ui.panel(box, { radius: 12, edge: "#484f58" });
    ui.text(spec.title, box.x + 16, box.y + 28, { size: 16, weight: 700, maxW: w - 32 });
    const list: Rect = { x: box.x + 12, y: box.y + 52, w: w - 24, h: listH };
    ui.scrollArea(`${spec.id}:list`, list, spec.options.length * (rowH + 6), (off) => {
      spec.options.forEach((o, i) => {
        const r: Rect = { x: list.x, y: list.y + i * (rowH + 6) - off, w: list.w - 6, h: rowH };
        ui.button(`${spec.id}:opt:${o.key}`, r, o.label, { disabled: o.disabled, sub: o.sub, variant: o.selected ? "primary" : "normal", fontSize: 14, onActivate: () => spec.onPick(o.key) });
      });
    });
    ui.button(`${spec.id}:cancel`, { x: box.x + 16, y: box.y + h - 56, w: w - 32, h: 44 }, "やめる", { onActivate: spec.onCancel });
  }, spec.onCancel);
}

/** Toggle (checkbox look) with a label; `on` drawn filled. */
export function toggleButton(ui: CanvasUI, id: string, r: Rect, label: string, on: boolean, o: { disabled?: boolean; onActivate?: () => void } = {}): void {
  ui.button(id, r, "", { disabled: o.disabled, onActivate: o.onActivate });
  const ctx = ui.context;
  const bx = r.x + 10, by = r.y + r.h / 2 - 9;
  roundRectPath(ctx, { x: bx, y: by, w: 18, h: 18 }, 4);
  ctx.fillStyle = on && !o.disabled ? CANVAS_THEME.primary : CANVAS_THEME.bg;
  ctx.fill();
  ctx.strokeStyle = o.disabled ? CANVAS_THEME.rowEdge : "#6e7681";
  ctx.stroke();
  if (on && !o.disabled) {
    ctx.beginPath(); ctx.moveTo(bx + 4, by + 9); ctx.lineTo(bx + 8, by + 13); ctx.lineTo(bx + 14, by + 5);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
  }
  ui.text(label, bx + 26, r.y + r.h / 2, { size: 14, weight: 600, color: o.disabled ? CANVAS_THEME.disabledText : CANVAS_THEME.text, maxW: r.w - 44 });
}

/** The PR3 mech gauge drawn on canvas (same model and colors as the SVG). */
export function drawMechGauge(ui: CanvasUI, m: MechGaugeModel, x: number, y: number, size: number): void {
  const ctx = ui.context;
  const C = MECH_GAUGE_COLORS;
  const s = size, c = s / 2, sw = Math.max(3, s * 0.1), r = c - sw / 2 - s * 0.12, core = r - sw / 2 - s * 0.06;
  const barW = Math.max(2, s * 0.09), barH = s * 0.8, barY = y + s * 0.1, barX = x + s - barW;
  const cx = x + c - barW / 2, cy = y + c;
  const dead = m.destroyed;
  const dash = (zero: boolean | undefined) => ctx.setLineDash(!dead && zero ? [2, 2] : []);
  ctx.lineWidth = sw;
  dash(m.armor?.zero);
  ctx.strokeStyle = C.track;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  if (!dead && m.ringDeg > 0) {
    const end = -Math.PI / 2 + Math.PI * 2; // 12 o'clock, drained from 12 clockwise
    const start = end - (Math.PI * 2 * Math.min(360, m.ringDeg)) / 360;
    ctx.strokeStyle = C.armor;
    ctx.beginPath(); ctx.arc(cx, cy, r, start, end); ctx.stroke();
  }
  ctx.lineWidth = 1;
  // Core: power level as liquid from the bottom.
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, core, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "#0d1117"; ctx.fillRect(cx - core, cy - core, core * 2, core * 2);
  const lvl = dead || !m.power ? 0 : m.power.frac;
  ctx.fillStyle = C.power; ctx.fillRect(cx - core, cy + core - 2 * core * lvl, core * 2, 2 * core * lvl);
  ctx.restore();
  dash(m.power?.zero);
  ctx.strokeStyle = dead ? C.dead : C.track;
  ctx.beginPath(); ctx.arc(cx, cy, core, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  // Ammo bar.
  const ammo = dead || !m.ammo ? 0 : m.ammo.frac;
  ctx.fillStyle = C.track; ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = C.ammo; ctx.fillRect(barX, barY + barH * (1 - ammo), barW, barH * ammo);
  if (dead) {
    ctx.strokeStyle = C.dead; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - core * 0.7, cy - core * 0.7); ctx.lineTo(cx + core * 0.7, cy + core * 0.7);
    ctx.moveTo(cx + core * 0.7, cy - core * 0.7); ctx.lineTo(cx - core * 0.7, cy + core * 0.7); ctx.stroke();
    ctx.lineWidth = 1;
  }
  if (m.leader) {
    ctx.globalAlpha = 0.6; ctx.strokeStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(cx, cy, c - 1 - barW / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Shell HUD (FULLSCREEN_SHELL_V0 §6): Cr・弾・装・電・箱, 0 in grey, short numbers on phones. Display only. */
export function drawResourceHud(ui: CanvasUI, r: Rect, hub: HubSnapshot | null, mobile: boolean): void {
  const ctx = ui.context;
  ctx.fillStyle = CANVAS_THEME.panel;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = CANVAS_THEME.panelEdge;
  ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  const items = hudItems(hub);
  const cellW = r.w / items.length;
  items.forEach((it, i) => {
    const cx = r.x + cellW * i + 10;
    const cy = r.y + r.h / 2;
    ui.text(it.label, cx, cy, { size: 12, weight: 700, color: it.value === 0 ? CANVAS_THEME.faint : it.color });
    ui.text(formatHudNumber(it.value, mobile), cx + (it.label.length > 1 ? 22 : 16), cy, { size: 13, weight: 600, color: it.value === 0 ? CANVAS_THEME.faint : CANVAS_THEME.text, maxW: cellW - 30 });
  });
}

/** Bottom tabs (FULLSCREEN_SHELL_V0 §4). The active tab is drawn highlighted and is not a button. */
export function drawShellTabs(ui: CanvasUI, r: Rect, tabs: readonly ShellTabState[], onTap: (tab: ShellTabState) => void): void {
  const ctx = ui.context;
  ctx.fillStyle = CANVAS_THEME.bg;
  ctx.fillRect(r.x, r.y, r.w, r.h + 64);
  ctx.fillStyle = CANVAS_THEME.panelEdge;
  ctx.fillRect(r.x, r.y, r.w, 1);
  const w = r.w / tabs.length;
  tabs.forEach((tab, i) => {
    const b: Rect = { x: r.x + w * i + 2, y: r.y + 4, w: w - 4, h: r.h - 8 };
    if (tab.active) {
      ui.panel(b, { fill: "#1f6feb33", edge: CANVAS_THEME.primary, radius: 8 });
      ui.text(tab.id, b.x + b.w / 2, b.y + b.h / 2, { size: 13, weight: 700, align: "center", color: "#ffffff", maxW: b.w - 4 });
      ui.region(`tab:${tab.id}`, b, { disabled: true });
    } else {
      ui.button(`tab:${tab.id}`, b, tab.id, { disabled: !tab.enabled, fontSize: 13, onActivate: () => onTap(tab) });
    }
  });
}
