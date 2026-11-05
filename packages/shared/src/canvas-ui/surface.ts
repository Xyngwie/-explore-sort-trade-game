/**
 * Canvas surface: sizes one visible canvas to the viewport at the device pixel
 * ratio, converts pointer positions to the CSS-pixel coordinates scenes draw
 * in, and redraws on demand (never on a timer). docs/CANVAS_SHELL_V0.md §3.
 */
import { CanvasUI, type Ctx2D, type Point } from "./core";

export type SafeInsets = { top: number; right: number; bottom: number; left: number };
export type FrameInfo = { width: number; height: number; dpr: number; insets: SafeInsets };
export type DrawFn = (ui: CanvasUI, frame: FrameInfo) => void;

/** Backing-store size for a CSS size at a pixel ratio (whole pixels, at least 1). */
export function backingSize(cssW: number, cssH: number, dpr: number): { w: number; h: number } {
  const r = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return { w: Math.max(1, Math.round(cssW * r)), h: Math.max(1, Math.round(cssH * r)) };
}
/**
 * Client (event) position → canvas CSS-pixel position. `rect` is the canvas'
 * bounding client rect; `cssW/cssH` the size scenes draw in.
 */
export function clientToCanvas(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, cssW: number, cssH: number): Point {
  const sx = rect.width > 0 ? cssW / rect.width : 1;
  const sy = rect.height > 0 ? cssH / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}

export type CanvasSurfaceOptions = {
  blocked?: () => boolean;
  draw: DrawFn;
};

export class CanvasSurface {
  readonly ui: CanvasUI;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private insets: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  private queued = false;
  private frames = 0;
  private readonly probe: HTMLDivElement;
  private draw: DrawFn;

  constructor(readonly canvas: HTMLCanvasElement, opts: CanvasSurfaceOptions) {
    this.draw = opts.draw;
    this.ui = new CanvasUI({ blocked: opts.blocked, invalidate: () => this.invalidate() });
    const doc = canvas.ownerDocument;
    this.probe = doc.createElement("div");
    this.probe.setAttribute("aria-hidden", "true");
    this.probe.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    doc.body.appendChild(this.probe);
    const win = doc.defaultView!;
    const resize = () => this.resize();
    win.addEventListener("resize", resize);
    win.visualViewport?.addEventListener("resize", resize);
    win.addEventListener("orientationchange", resize);
    if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(canvas);
    this.bindInput(win);
    this.resize();
  }
  setDraw(draw: DrawFn): void { this.draw = draw; this.invalidate(); }
  get frameCount(): number { return this.frames; }
  get cssSize(): { width: number; height: number; dpr: number } { return { width: this.cssW, height: this.cssH, dpr: this.dpr }; }

  resize(): void {
    const win = this.canvas.ownerDocument.defaultView!;
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width || win.innerWidth);
    this.cssH = Math.max(1, rect.height || win.innerHeight);
    this.dpr = win.devicePixelRatio || 1;
    const b = backingSize(this.cssW, this.cssH, this.dpr);
    if (this.canvas.width !== b.w) this.canvas.width = b.w;
    if (this.canvas.height !== b.h) this.canvas.height = b.h;
    const cs = win.getComputedStyle(this.probe);
    const px = (v: string) => Math.max(0, parseFloat(v) || 0);
    this.insets = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
    this.renderNow();
  }
  /** Ask for one redraw on the next animation frame (coalesced). */
  invalidate(): void {
    if (this.queued) return;
    this.queued = true;
    const win = this.canvas.ownerDocument.defaultView!;
    win.requestAnimationFrame(() => { this.queued = false; this.renderNow(); });
  }
  renderNow(): void {
    const win = this.canvas.ownerDocument.defaultView!;
    if ((win.devicePixelRatio || 1) !== this.dpr) { this.resize(); return; }
    const ctx = this.canvas.getContext("2d") as unknown as Ctx2D | null;
    if (!ctx) return;
    // Exact scale even when the backing store was rounded.
    ctx.setTransform(this.canvas.width / this.cssW, 0, 0, this.canvas.height / this.cssH, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    this.ui.beginFrame(ctx, this.cssW, this.cssH);
    this.draw(this.ui, { width: this.cssW, height: this.cssH, dpr: this.dpr, insets: this.insets });
    this.ui.endFrame();
    this.frames++;
  }
  toCanvas(clientX: number, clientY: number): Point {
    return clientToCanvas(clientX, clientY, this.canvas.getBoundingClientRect(), this.cssW, this.cssH);
  }

  /** Pointers owned by a raw region (pointerId → handler). */
  private raw = new Map<number, import("./core").RawPointerHandler>();
  private sample(e: PointerEvent): import("./core").RawPointerSample {
    const p = this.toCanvas(e.clientX, e.clientY);
    return { id: e.pointerId, type: e.pointerType, button: e.button, buttons: e.buttons, x: p.x, y: p.y, ctrl: e.ctrlKey };
  }
  private cancelRaw(): void {
    const handlers = new Set(this.raw.values());
    this.raw.clear();
    handlers.forEach((h) => h.cancel());
  }

  private bindInput(win: Window): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
      const p = this.toCanvas(e.clientX, e.clientY);
      // A further finger joins the board it started on (pinch); otherwise route by position.
      const owner = e.pointerType !== "mouse" && this.raw.size > 0 ? this.raw.values().next().value! : this.ui.rawAt(p);
      if (owner) { this.raw.set(e.pointerId, owner); owner.down(this.sample(e)); this.invalidate(); return; }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      this.ui.pointerDown(e.pointerId, p, e.isPrimary);
    });
    c.addEventListener("pointermove", (e) => {
      const h = this.raw.get(e.pointerId);
      if (h) { h.move(this.sample(e)); return; }
      this.ui.pointerMove(e.pointerId, this.toCanvas(e.clientX, e.clientY));
    });
    c.addEventListener("pointerup", (e) => {
      const h = this.raw.get(e.pointerId);
      if (h) {
        h.up(this.sample(e));
        if (e.pointerType !== "mouse" || e.buttons === 0) this.raw.delete(e.pointerId);
        this.invalidate();
        return;
      }
      this.ui.pointerUp(e.pointerId, this.toCanvas(e.clientX, e.clientY));
    });
    c.addEventListener("pointercancel", (e) => {
      if (this.raw.has(e.pointerId)) { this.cancelRaw(); this.invalidate(); return; }
      this.ui.pointerCancel(e.pointerId);
    });
    // After a release the capture is lost too: only button/press state is dropped (raw boards keep their pending taps).
    c.addEventListener("lostpointercapture", (e) => { if (!this.raw.has(e.pointerId)) this.ui.pointerCancel(e.pointerId); });
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.cssH : 1;
      const p = this.toCanvas(e.clientX, e.clientY);
      const raw = this.ui.rawAt(p);
      if (raw?.wheel) { raw.wheel(p, e.deltaY * unit); this.invalidate(); return; }
      this.ui.wheel(p, e.deltaY * unit);
    }, { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("auxclick", (e) => e.preventDefault());
    win.addEventListener("keydown", (e) => { if (this.ui.key(e.key)) e.preventDefault(); });
    win.addEventListener("blur", () => { this.ui.pointerCancel(); this.cancelRaw(); });
    c.ownerDocument.addEventListener("visibilitychange", () => { this.ui.pointerCancel(); if (c.ownerDocument.hidden) this.cancelRaw(); });
  }
}
