/**
 * Canvas surface: sizes one visible canvas to the viewport at the device pixel
 * ratio, converts pointer positions to the CSS-pixel coordinates scenes draw
 * in, and redraws on demand (never on a timer). docs/CANVAS_SHELL_V0.md §3.
 */
import { CanvasUI, type Ctx2D, type Point } from "./core";
import { ContactRouter, type ContactSample } from "./contacts";

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
  /**
   * True while the page around the canvas must scroll (the debug area under the
   * canvas is open): the canvas then takes no pointer, wheel, or key input and
   * never prevents the page's own pan / wheel / key scroll (Space included).
   * False = game input as usual.
   */
  inert?: () => boolean;
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
  private readonly inert: () => boolean;

  constructor(readonly canvas: HTMLCanvasElement, opts: CanvasSurfaceOptions) {
    this.draw = opts.draw;
    this.inert = opts.inert ?? (() => false);
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

  /** Drop every contact and press (e.g. before the canvas turns inert). */
  cancelInput(): void { this.contacts?.cancelAll(); this.ui.pointerCancel(); }

  /** Every contact goes through one router (buttons and raw boards share it). */
  private contacts: ContactRouter | null = null;
  private sample(e: PointerEvent): ContactSample {
    const p = this.toCanvas(e.clientX, e.clientY);
    return { id: e.pointerId, type: e.pointerType, button: e.button, buttons: e.buttons, x: p.x, y: p.y, ctrl: e.ctrlKey, primary: e.isPrimary };
  }

  private bindInput(win: Window): void {
    const c = this.canvas;
    const router = (this.contacts = new ContactRouter(this.ui));
    c.addEventListener("pointerdown", (e) => {
      if (this.inert()) return; // the page scrolls; the game takes nothing
      e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
      router.down(this.sample(e));
      this.invalidate();
    });
    c.addEventListener("pointermove", (e) => router.move(this.sample(e)));
    c.addEventListener("pointerup", (e) => { router.up(this.sample(e)); this.invalidate(); });
    c.addEventListener("pointercancel", (e) => { router.cancel(e.pointerId); this.invalidate(); });
    c.addEventListener("lostpointercapture", (e) => router.lostCapture(e.pointerId));
    c.addEventListener("wheel", (e) => {
      if (this.inert()) return; // page wheel scroll passes through
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.cssH : 1;
      router.wheel(this.toCanvas(e.clientX, e.clientY), e.deltaY * unit);
      this.invalidate();
    }, { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("auxclick", (e) => e.preventDefault());
    win.addEventListener("keydown", (e) => {
      if (this.inert()) return; // debug area open: the page keeps the key (Space scrolls)
      if (this.ui.key(e.key)) e.preventDefault();
    });
    win.addEventListener("blur", () => router.cancelAll());
    c.ownerDocument.addEventListener("visibilitychange", () => { if (c.ownerDocument.hidden) router.cancelAll(); else this.ui.pointerCancel(); });
  }
}

/**
 * Debug area of the canvas page (神宮決定 2026-11-06): only on a local dev
 * server or when the page was opened with `?debug=1`. Read once at load.
 */
export function canvasDebugEnabled(search: string, hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  try { return new URLSearchParams(search).get("debug") === "1"; } catch { return false; }
}
/**
 * Where the play log's 新規ゲーム / デモ初期化 return to (CANVAS-Z3): this page's
 * canvas DOCK. When debug mode came from `?debug=1` (not from a local host),
 * keep `?debug=1` so the debug area is still there after the reload. No other
 * query key is carried (e.g. `debug_fixture`).
 */
export function canvasNewGameDestination(base: string, search: string, hostname: string): string {
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  let fromQuery = false;
  try { fromQuery = new URLSearchParams(search).get("debug") === "1"; } catch { /* no query */ }
  return !local && fromQuery ? `${base}?debug=1` : base;
}
