/**
 * Canvas DOCK app (stage 1): one visible canvas, scenes switched inside it.
 * docs/CANVAS_SHELL_V0.md. Scene order: start (name) → dock.
 */
import {
  CanvasSurface,
  HUB_SAVED_EVENT,
  bindEditorNameInput,
  playLogBlocked,
  playLogNavigate,
  resolveModuleBaseUrl,
  type CanvasUI,
  type FrameInfo,
} from "@estg/shared";
import { DockScene } from "./dock-scene";
import { browserDockEnv } from "./dock-sections";
import { tabUrl } from "./tabs";
import { StartScene, layoutStart } from "./start-scene";

export type SceneId = "start" | "dock";
type Scene = { draw(ui: CanvasUI, frame: FrameInfo): void };

export function mountCanvasApp(doc: Document = document): void {
  const canvas = doc.getElementById("wl-canvas") as HTMLCanvasElement;
  const input = doc.getElementById("wl-canvas-name") as HTMLInputElement;
  let current: SceneId = "start";
  let dock: DockScene | null = null;
  const start = new StartScene((name) => {
    void name;
    // Start: hide and blur the only HTML control, then switch scenes on the same canvas.
    input.blur();
    input.hidden = true;
    input.disabled = true;
    dock = new DockScene({
      navigateLegacy: () => playLogNavigate(resolveModuleBaseUrl("trade")),
      env: browserDockEnv(),
      onTab: (tab) => { if (!playLogBlocked()) playLogNavigate(tabUrl(tab)); },
      redraw: () => surface.invalidate(),
    });
    current = "dock";
    surface.invalidate();
  });
  const scenes = (): Scene => (current === "dock" && dock ? dock : start);

  const placeInput = (frame: FrameInfo) => {
    const show = current === "start" && !start.locked;
    if (!show) {
      if (!input.hidden) { input.blur(); input.hidden = true; }
      return;
    }
    const r = layoutStart(frame).input;
    const rect = canvas.getBoundingClientRect();
    input.hidden = false;
    input.disabled = false;
    input.style.left = `${rect.left + r.x + 1}px`;
    input.style.top = `${rect.top + r.y + 1}px`;
    input.style.width = `${r.w - 2}px`;
    input.style.height = `${r.h - 2}px`;
  };

  const surface = new CanvasSurface(canvas, {
    blocked: () => playLogBlocked(),
    draw: (ui, frame) => {
      scenes().draw(ui, frame);
      placeInput(frame);
    },
  });

  const composing = bindEditorNameInput(input, (v) => { start.draft = v; });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !composing.isComposing() && !e.isComposing && !playLogBlocked()) {
      e.preventDefault();
      start.start();
      surface.invalidate();
    }
  });

  // The screen re-reads the save when it changed elsewhere; reading never writes.
  const refresh = () => { dock?.reload(); surface.invalidate(); };
  doc.defaultView!.addEventListener(HUB_SAVED_EVENT, refresh);
  doc.defaultView!.addEventListener("storage", refresh);
  doc.defaultView!.addEventListener("pageshow", refresh);

  // Read-only hook for scripts/verify-canvas-dock.cjs.
  (doc.defaultView as unknown as Record<string, unknown>).__wlCanvas = {
    scene: () => current,
    regions: () => surface.ui.debugRegions(),
    scroll: (id: string) => ({ y: surface.ui.getScroll(id), max: surface.ui.maxScroll(id) }),
    size: () => surface.cssSize,
    frames: () => surface.frameCount,
    activations: () => surface.ui.activationCount,
    pressing: () => surface.ui.pressing,
  };
  surface.invalidate();
}
