/**
 * Single-canvas UI core (docs/CANVAS_SHELL_V0.md, stage 1).
 *
 * Immediate-mode: every frame a scene draws itself and registers hit regions
 * (buttons, scroll areas, modal layers). Input is resolved against the regions
 * of the last drawn frame. Drawing never changes game state; only a button's
 * `onActivate` (called from a pointer release) may do that.
 *
 * Coordinates are CSS pixels relative to the canvas' top-left corner. The
 * surface (surface.ts) applies the device-pixel-ratio transform, so scenes and
 * hit tests never see device pixels.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}
export function intersectRect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w), btm = Math.min(a.y + a.h, b.y + b.h);
  return { x, y, w: Math.max(0, r - x), h: Math.max(0, btm - y) };
}

/** Movement (CSS px) after which a press inside a scroll area becomes a scroll. */
export const CANVAS_SCROLL_SLOP_PX = 8;
/** Minimum touch target edge (CSS px). */
export const CANVAS_MIN_TARGET_PX = 44;

export const CANVAS_THEME = {
  bg: "#0d1117",
  panel: "#161b22",
  panelEdge: "#30363d",
  rowEdge: "#21262d",
  text: "#c9d1d9",
  muted: "#8b949e",
  faint: "#6e7681",
  disabledText: "#484f58",
  button: "#21262d",
  buttonPressed: "#30363d",
  buttonEdge: "#30363d",
  primary: "#1f6feb",
  primaryPressed: "#1158c7",
  danger: "#da3633",
  gain: "#56d364",
  spend: "#ff8b8b",
  zero: "#8b949e",
  backdrop: "rgba(0,0,0,0.55)",
  font: 'system-ui,-apple-system,"Hiragino Sans","Noto Sans JP","Yu Gothic UI",sans-serif',
} as const;

/** Subset of CanvasRenderingContext2D the UI uses (lets selftests pass a stub). */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | "save" | "restore" | "beginPath" | "rect" | "clip" | "fillRect" | "strokeRect" | "fillText"
  | "measureText" | "moveTo" | "lineTo" | "arcTo" | "closePath" | "fill" | "stroke" | "setTransform"
  | "clearRect" | "arc" | "setLineDash"
> & {
  fillStyle: CanvasRenderingContext2D["fillStyle"];
  strokeStyle: CanvasRenderingContext2D["strokeStyle"];
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
};

/** A pointer event as a board with its own gesture rules needs it (canvas CSS px). */
export type RawPointerSample = { id: number; type: string; button: number; buttons: number; x: number; y: number; ctrl: boolean };
/**
 * Region that takes raw pointer input (pointer type, buttons, Ctrl, several
 * fingers) for a board that keeps its own gesture rules. The surface routes
 * every event of a pointer that started in it, plus further touches, here.
 */
export type RawPointerHandler = {
  down(s: RawPointerSample): void;
  move(s: RawPointerSample): void;
  up(s: RawPointerSample): void;
  cancel(): void;
  wheel?(p: Point, deltaY: number): void;
};

export type ButtonVariant = "normal" | "primary" | "danger";
export type ButtonOpts = {
  disabled?: boolean;
  variant?: ButtonVariant;
  /** Smaller second line inside the button. */
  sub?: string;
  fontSize?: number;
  onActivate?: () => void;
};

type Region = {
  id: string;
  rect: Rect;
  /** Visible part (clip of the scroll area it sits in, or the whole canvas). */
  clip: Rect;
  layer: number;
  disabled: boolean;
  onActivate?: () => void;
  /** Modal backdrop: swallows input; activation = dismiss. */
  backdrop?: boolean;
  /** Drag region: release reports start and end (wherever it ends). */
  onDrag?: (start: Point, end: Point) => void;
  /** Drag region: every move while pressed (same `start` object for one gesture). */
  onDragMove?: (start: Point, current: Point) => void;
};
/** `clip`: visible part (an area nested in another scroll area is cut by it). */
type ScrollArea = { id: string; rect: Rect; clip: Rect; layer: number; contentH: number };
type RawArea = { id: string; rect: Rect; clip: Rect; layer: number; handler: RawPointerHandler };

type Press = {
  pointerId: number;
  regionId: string | null;
  scrollId: string | null;
  layer: number;
  start: Point;
  startScroll: number;
  mode: "press" | "scroll" | "idle";
  inside: boolean;
};

export type CanvasUIOptions = {
  /** Activation is refused while this returns true (e.g. play log saving). */
  blocked?: () => boolean;
  /** Called whenever input changed something visible. */
  invalidate?: () => void;
};

/** Text helpers ----------------------------------------------------------- */
export function fontSpec(size: number, weight: 400 | 600 | 700 = 400): string {
  return `${weight} ${size}px ${CANVAS_THEME.font}`;
}
/** Cut `text` to fit `maxW`, ending in "…" when cut. */
export function ellipsize(ctx: Pick<Ctx2D, "measureText">, text: string, maxW: number): string {
  if (maxW <= 0) return "";
  if (ctx.measureText(text).width <= maxW) return text;
  const chars = Array.from(text);
  let lo = 0, hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(chars.slice(0, mid).join("") + "…").width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? chars.slice(0, lo).join("") + "…" : "…";
}
/** Wrap by character (Japanese has no spaces). Honors "\n". */
export function wrapText(ctx: Pick<Ctx2D, "measureText">, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const ch of Array.from(para)) {
      if (line && ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; }
      else line += ch;
    }
    out.push(line);
  }
  return out;
}

export function roundRectPath(ctx: Ctx2D, r: Rect, radius: number): void {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.lineTo(r.x + r.w - rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + rad, rad);
  ctx.lineTo(r.x + r.w, r.y + r.h - rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x + r.w - rad, r.y + r.h, rad);
  ctx.lineTo(r.x + rad, r.y + r.h);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y + r.h - rad, rad);
  ctx.lineTo(r.x, r.y + rad);
  ctx.arcTo(r.x, r.y, r.x + rad, r.y, rad);
  ctx.closePath();
}

/**
 * Hit regions, press/scroll state machine, modal layers and widget drawing.
 * One instance per canvas.
 */
export class CanvasUI {
  private ctx: Ctx2D | null = null;
  private width = 0;
  private height = 0;
  /** Regions being built for the current frame. */
  private building: Region[] = [];
  private buildingScroll: ScrollArea[] = [];
  /** Regions of the last completed frame (used for input). */
  private regions: Region[] = [];
  private scrolls: ScrollArea[] = [];
  private buildingRaw: RawArea[] = [];
  private raws: RawArea[] = [];
  private topLayerFrame = 0;
  private layer = 0;
  private clipStack: Rect[] = [];
  private scrollY = new Map<string, number>();
  private scrollStack: string[] = [];
  private press: Press | null = null;
  /** Every pointer currently touching (not only the one that pressed). */
  private downs = new Set<number>();
  private activations = 0;
  /** Per-id values kept across frames (measured heights, …). Never game state. */
  readonly memo = new Map<string, number>();
  constructor(private readonly opts: CanvasUIOptions = {}) {}

  /* ---------------- frame ---------------- */
  beginFrame(ctx: Ctx2D, width: number, height: number): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.building = [];
    this.buildingScroll = [];
    this.buildingRaw = [];
    this.layer = 0;
    this.clipStack = [{ x: 0, y: 0, w: width, h: height }];
    this.scrollStack = [];
  }
  endFrame(): void {
    this.regions = this.building;
    this.scrolls = this.buildingScroll;
    this.raws = this.buildingRaw;
    this.topLayerFrame = this.regions.reduce((m, r) => Math.max(m, r.layer), 0);
    for (const s of this.scrolls) this.setScroll(s.id, this.getScroll(s.id), s);
    this.ctx = null;
  }
  get size(): { width: number; height: number } { return { width: this.width, height: this.height }; }
  get context(): Ctx2D {
    if (!this.ctx) throw new Error("CanvasUI: draw outside beginFrame/endFrame");
    return this.ctx;
  }
  /** Ask for another frame (e.g. a measured height changed). */
  requestRedraw(): void { this.opts.invalidate?.(); }
  /** Set a scroll position (clamped on the next frame). */
  scrollTo(id: string, y: number): void { this.scrollY.set(id, Math.max(0, y)); this.opts.invalidate?.(); }
  /** Highest layer that receives input (a modal blocks everything under it). */
  get topLayer(): number { return this.topLayerFrame; }

  /* ---------------- layers ---------------- */
  /**
   * Draw a modal layer. Everything registered before it stops receiving input
   * while it is open. `onDismiss` runs when the backdrop is tapped / Escape.
   */
  modal(id: string, draw: () => void, onDismiss?: () => void): void {
    const ctx = this.context;
    this.layer += 1;
    const full: Rect = { x: 0, y: 0, w: this.width, h: this.height };
    ctx.fillStyle = CANVAS_THEME.backdrop;
    ctx.fillRect(0, 0, this.width, this.height);
    this.building.push({ id: `${id}:backdrop`, rect: full, clip: full, layer: this.layer, disabled: false, onActivate: onDismiss, backdrop: true });
    const savedClip = this.clipStack;
    this.clipStack = [full];
    draw();
    this.clipStack = savedClip;
  }

  /* ---------------- scroll ---------------- */
  getScroll(id: string): number { return this.scrollY.get(id) ?? 0; }
  maxScroll(id: string): number {
    const s = this.scrolls.find((a) => a.id === id) ?? this.buildingScroll.find((a) => a.id === id);
    return s ? Math.max(0, s.contentH - s.rect.h) : 0;
  }
  private setScroll(id: string, y: number, area?: ScrollArea): void {
    const s = area ?? this.scrolls.find((a) => a.id === id);
    const max = s ? Math.max(0, s.contentH - s.rect.h) : 0;
    this.scrollY.set(id, Math.max(0, Math.min(max, y)));
  }
  /**
   * A vertically scrolling, clipped area. `draw(offsetY)` draws content in
   * canvas coordinates already shifted by the scroll offset (y - offsetY).
   */
  scrollArea(id: string, rect: Rect, contentH: number | "auto", draw: (offsetY: number) => number | void): void {
    const ctx = this.context;
    const autoKey = `scroll:${id}:h`;
    if (contentH === "auto") contentH = this.memo.get(autoKey) ?? rect.h;
    const clip = intersectRect(this.clipStack[this.clipStack.length - 1], rect);
    const area: ScrollArea = { id, rect, clip, layer: this.layer, contentH };
    this.buildingScroll.push(area);
    this.setScroll(id, this.getScroll(id), area);
    const off = this.getScroll(id);
    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.w, clip.h);
    ctx.clip();
    this.clipStack.push(clip);
    this.scrollStack.push(id);
    const used = draw(off);
    if (typeof used === "number" && Math.round(used) !== Math.round(this.memo.get(autoKey) ?? -1)) {
      this.memo.set(autoKey, used);
      area.contentH = used;
      this.opts.invalidate?.();
    }
    this.scrollStack.pop();
    this.clipStack.pop();
    ctx.restore();
    if (contentH > rect.h) {
      const trackH = rect.h - 4;
      const barH = Math.max(24, (rect.h / contentH) * trackH);
      const barY = rect.y + 2 + (off / (contentH - rect.h)) * (trackH - barH);
      ctx.fillStyle = CANVAS_THEME.panelEdge;
      ctx.fillRect(rect.x + rect.w - 4, barY, 3, barH);
    }
  }

  /* ---------------- regions ---------------- */
  /** Register an input region without drawing anything. */
  region(id: string, rect: Rect, opts: { disabled?: boolean; onActivate?: () => void } = {}): void {
    const clip = intersectRect(this.clipStack[this.clipStack.length - 1], rect);
    this.building.push({ id, rect, clip, layer: this.layer, disabled: !!opts.disabled, onActivate: opts.onActivate });
  }
  /**
   * A region that reports the whole gesture on release (e.g. a puzzle board's
   * swipe), wherever the pointer ends. Never inside a scroll area. A cancel,
   * a second finger or a modal opening drops the gesture.
   */
  dragRegion(id: string, rect: Rect, onDrag: (start: Point, end: Point) => void, onDragMove?: (start: Point, current: Point) => void): void {
    const clip = intersectRect(this.clipStack[this.clipStack.length - 1], rect);
    this.building.push({ id, rect, clip, layer: this.layer, disabled: false, onDrag, onDragMove });
  }
  /** Register a raw-input region (see RawPointerHandler). */
  rawRegion(id: string, rect: Rect, handler: RawPointerHandler): void {
    const clip = intersectRect(this.clipStack[this.clipStack.length - 1], rect);
    this.buildingRaw.push({ id, rect, clip, layer: this.layer, handler });
  }
  /** Raw region under `p` in the active layer (a modal above it wins). */
  rawAt(p: Point): RawPointerHandler | null {
    const top = this.topLayerFrame;
    for (let i = this.raws.length - 1; i >= 0; i--) {
      const r = this.raws[i];
      if (r.layer === top && rectContains(r.clip, p) && rectContains(r.rect, p)) return r.handler;
    }
    return null;
  }
  isPressed(id: string): boolean {
    return !!this.press && this.press.mode === "press" && this.press.regionId === id && this.press.inside;
  }

  /* ---------------- widgets ---------------- */
  text(str: string, x: number, y: number, o: { size?: number; weight?: 400 | 600 | 700; color?: string; align?: CanvasTextAlign; maxW?: number; baseline?: CanvasTextBaseline } = {}): void {
    const ctx = this.context;
    ctx.font = fontSpec(o.size ?? 14, o.weight ?? 400);
    ctx.fillStyle = o.color ?? CANVAS_THEME.text;
    ctx.textAlign = o.align ?? "left";
    ctx.textBaseline = o.baseline ?? "middle";
    ctx.fillText(o.maxW !== undefined ? ellipsize(ctx, str, o.maxW) : str, x, y);
  }
  /** Wrapped paragraph; returns the height used. */
  paragraph(str: string, x: number, y: number, maxW: number, o: { size?: number; color?: string; lineH?: number } = {}): number {
    const ctx = this.context;
    const size = o.size ?? 14, lineH = o.lineH ?? Math.round(size * 1.45);
    ctx.font = fontSpec(size);
    ctx.fillStyle = o.color ?? CANVAS_THEME.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const lines = wrapText(ctx, str, maxW);
    lines.forEach((l, i) => ctx.fillText(l, x, y + lineH * i + lineH / 2));
    return lines.length * lineH;
  }
  panel(r: Rect, o: { fill?: string; edge?: string; radius?: number } = {}): void {
    const ctx = this.context;
    roundRectPath(ctx, r, o.radius ?? 10);
    ctx.fillStyle = o.fill ?? CANVAS_THEME.panel;
    ctx.fill();
    ctx.strokeStyle = o.edge ?? CANVAS_THEME.panelEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  /** Draw a button and register it. Disabled buttons never activate. */
  button(id: string, r: Rect, label: string, o: ButtonOpts = {}): void {
    const ctx = this.context;
    const pressed = !o.disabled && this.isPressed(id);
    const v = o.variant ?? "normal";
    const fill = o.disabled
      ? CANVAS_THEME.panel
      : v === "primary" ? (pressed ? CANVAS_THEME.primaryPressed : CANVAS_THEME.primary)
      : v === "danger" ? (pressed ? "#b62324" : CANVAS_THEME.danger)
      : pressed ? CANVAS_THEME.buttonPressed : CANVAS_THEME.button;
    roundRectPath(ctx, pressed ? { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 } : r, 8);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = o.disabled ? CANVAS_THEME.rowEdge : CANVAS_THEME.buttonEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
    const color = o.disabled ? CANVAS_THEME.disabledText : v === "normal" ? CANVAS_THEME.text : "#ffffff";
    const size = o.fontSize ?? 14;
    const maxW = r.w - 8;
    if (o.sub) {
      this.text(label, r.x + r.w / 2, r.y + r.h / 2 - size * 0.45, { size, weight: 600, color, align: "center", maxW });
      this.text(o.sub, r.x + r.w / 2, r.y + r.h / 2 + size * 0.65, { size: Math.max(10, size - 3), color: o.disabled ? CANVAS_THEME.disabledText : v === "normal" ? CANVAS_THEME.muted : "#ffffffcc", align: "center", maxW });
    } else {
      this.text(label, r.x + r.w / 2, r.y + r.h / 2, { size, weight: 600, color, align: "center", maxW });
    }
    this.region(id, r, { disabled: o.disabled, onActivate: o.onActivate });
  }

  /* ---------------- input ---------------- */
  /** Topmost enabled-or-disabled region under `p` in the active layer. */
  hitTest(p: Point): Region | null {
    const top = this.topLayerFrame;
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (r.layer !== top) continue;
      if (rectContains(r.clip, p) && rectContains(r.rect, p)) return r;
    }
    return null;
  }
  private scrollAt(p: Point): ScrollArea | null {
    const top = this.topLayerFrame;
    for (let i = this.scrolls.length - 1; i >= 0; i--) {
      const s = this.scrolls[i];
      if (s.layer === top && rectContains(s.clip, p) && rectContains(s.rect, p)) return s;
    }
    return null;
  }
  /**
   * `primary` = the browser says no other pointer of this kind is down
   * (PointerEvent.isPrimary): stale pointers whose release never arrived are
   * forgotten. Unknown (undefined) keeps them.
   */
  pointerDown(pointerId: number, p: Point, primary?: boolean): void {
    if (primary === true) this.downs.clear();
    this.downs.add(pointerId);
    if (this.downs.size > 1) {
      // While another finger touches, nothing presses: the first press is
      // cancelled and every further touch is ignored until all are lifted.
      if (this.press) { this.press = null; this.opts.invalidate?.(); }
      return;
    }
    const hit = this.hitTest(p);
    const scroll = this.scrollAt(p);
    this.press = {
      pointerId,
      regionId: hit && !hit.disabled ? hit.id : null,
      scrollId: scroll?.id ?? null,
      layer: this.topLayerFrame,
      start: p,
      startScroll: scroll ? this.getScroll(scroll.id) : 0,
      mode: hit && !hit.disabled ? "press" : "idle",
      inside: true,
    };
    this.opts.invalidate?.();
  }
  pointerMove(pointerId: number, p: Point): void {
    const s = this.press;
    if (!s || s.pointerId !== pointerId) return;
    const dy = p.y - s.start.y, dx = p.x - s.start.x;
    const dragging = !!s.regionId && !!this.regions.find((x) => x.id === s.regionId)?.onDrag;
    if (!dragging && s.mode !== "scroll" && s.scrollId && Math.abs(dy) > CANVAS_SCROLL_SLOP_PX && Math.abs(dy) >= Math.abs(dx)) {
      s.mode = "scroll"; // a scroll never activates the button it started on
      s.regionId = null;
    }
    if (dragging && s.mode === "press") {
      const r = this.regions.find((x) => x.id === s.regionId);
      if (r?.onDragMove && s.layer === this.topLayerFrame && !this.opts.blocked?.()) r.onDragMove(s.start, p);
      this.opts.invalidate?.();
      return;
    }
    if (s.mode === "scroll" && s.scrollId) {
      this.setScroll(s.scrollId, s.startScroll - dy);
    } else if (s.mode === "press" && s.regionId) {
      const r = this.regions.find((x) => x.id === s.regionId);
      s.inside = !!r && rectContains(r.rect, p) && rectContains(r.clip, p);
    }
    this.opts.invalidate?.();
  }
  /** Returns true when a region was activated. */
  pointerUp(pointerId: number, p: Point): boolean {
    this.downs.delete(pointerId);
    const s = this.press;
    if (!s || s.pointerId !== pointerId) return false;
    this.press = null;
    this.opts.invalidate?.();
    if (s.mode !== "press" || !s.regionId) return false;
    if (s.layer !== this.topLayerFrame) return false; // a modal opened/closed meanwhile
    const drag = this.regions.find((x) => x.id === s.regionId && x.onDrag);
    if (drag) {
      if (this.opts.blocked?.()) return false;
      this.activations++;
      drag.onDrag!(s.start, p);
      this.opts.invalidate?.();
      return true;
    }
    const r = this.hitTest(p);
    if (!r || r.id !== s.regionId || r.disabled) return false;
    if (this.opts.blocked?.()) return false;
    this.activations++;
    r.onActivate?.();
    this.opts.invalidate?.();
    return true;
  }
  pointerCancel(pointerId?: number): void {
    if (pointerId === undefined) this.downs.clear();
    else this.downs.delete(pointerId);
    if (!this.press) return;
    if (pointerId !== undefined && this.press.pointerId !== pointerId) return;
    this.press = null;
    this.opts.invalidate?.();
  }
  wheel(p: Point, deltaY: number): void {
    if (this.press) return;
    const s = this.scrollAt(p);
    if (!s) return;
    this.setScroll(s.id, this.getScroll(s.id) + deltaY);
    this.opts.invalidate?.();
  }
  /** Escape dismisses the top modal (same as tapping its backdrop). */
  key(key: string): boolean {
    if (key !== "Escape" || this.topLayerFrame === 0) return false;
    const b = this.regions.find((r) => r.layer === this.topLayerFrame && r.backdrop);
    if (!b?.onActivate || this.opts.blocked?.()) return false;
    b.onActivate();
    this.opts.invalidate?.();
    return true;
  }
  get pressing(): boolean { return this.press !== null; }
  get activationCount(): number { return this.activations; }

  /** Read-only snapshot for tests / verification scripts. */
  debugRegions(): Array<{ id: string; x: number; y: number; w: number; h: number; layer: number; disabled: boolean; visible: boolean }> {
    return this.regions.map((r) => {
      const v = intersectRect(r.rect, r.clip);
      return { id: r.id, x: v.x, y: v.y, w: v.w, h: v.h, layer: r.layer, disabled: r.disabled, visible: v.w > 0 && v.h > 0 && r.layer === this.topLayerFrame };
    });
  }
}
