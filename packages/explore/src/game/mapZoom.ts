/**
 * PR5 gestures (FULLSCREEN_SHELL_V0 §11, Q10): pinch / double-tap / (desktop) wheel zoom on the Explore map only.
 * View-only: world.camera stays the base 720×420 (so the checkpoint is unchanged); a zoomed view camera is
 * swapped in only while drawing and mapping taps. Zoom is never saved (resets on reload / new sortie).
 */
import type { Camera, World } from "./types";
/** §11 values (神宮決定 2026-11-01) */
export const MAP_ZOOM_MIN = 1;
export const MAP_ZOOM_MAX = 2.5;
export const MAP_ZOOM_DOUBLE_TAP = 2;
export const MAP_DOUBLE_TAP_MS = 300;
export const MAP_DOUBLE_TAP_PX = 30;
export const MAP_WHEEL_STEP = 1.15;
export function clampZoom(z: number): number {
  return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, Number.isFinite(z) ? z : 1));
}
/** Zoomed view of the base camera: same centre (it follows the leader), clamped inside the world. */
export function viewCamera(base: Camera, zoom: number, worldW: number, worldH: number): Camera {
  const z = clampZoom(zoom);
  if (z === 1) return base;
  const w = base.w / z, h = base.h / z;
  const cx = base.x + base.w / 2, cy = base.y + base.h / 2;
  const x = Math.min(Math.max(0, cx - w / 2), Math.max(0, worldW - w));
  const y = Math.min(Math.max(0, cy - h / 2), Math.max(0, worldH - h));
  return { x, y, w, h };
}
/** Run fn with world.camera temporarily replaced by the zoomed view; always restores the base camera. */
export function withViewCamera<T>(world: World, zoom: number, fn: () => T): T {
  const base = world.camera;
  world.camera = viewCamera(base, zoom, world.balance.worldW, world.balance.worldH);
  try { return fn(); } finally { world.camera = base; }
}
export function pinchZoom(startZoom: number, startDist: number, dist: number): number {
  return startDist > 0 ? clampZoom(startZoom * (dist / startDist)) : clampZoom(startZoom);
}
/** Double-tap toggles 1× ↔ 2× (any zoom above 1 goes back to 1). */
export function doubleTapZoom(zoom: number): number {
  return clampZoom(zoom) > 1 ? 1 : MAP_ZOOM_DOUBLE_TAP;
}
export type MapGestureState = {
  zoom: number;
  pointers: Map<number, { x: number; y: number }>;
  pinch: { dist: number; zoom: number } | null;
  lastTap: { t: number; x: number; y: number } | null;
};
export function newMapGestureState(): MapGestureState {
  return { zoom: 1, pointers: new Map(), pinch: null, lastTap: null };
}
const dist = (s: MapGestureState) => { const [a, b] = [...s.pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
/** pointerdown: returns "pinch" when this pointer starts/joins a pinch (the caller must not treat it as a map tap). */
export function gestureDown(s: MapGestureState, id: number, x: number, y: number, t: number): "tap" | "pinch" | "doubletap" {
  s.pointers.set(id, { x, y });
  if (s.pointers.size >= 2) { s.pinch = { dist: dist(s), zoom: s.zoom }; s.lastTap = null; return "pinch"; }
  const last = s.lastTap;
  if (last && t - last.t <= MAP_DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) <= MAP_DOUBLE_TAP_PX) {
    s.lastTap = null; s.zoom = doubleTapZoom(s.zoom); return "doubletap";
  }
  s.lastTap = { t, x, y };
  return "tap";
}
export function gestureMove(s: MapGestureState, id: number, x: number, y: number): void {
  if (!s.pointers.has(id)) return;
  s.pointers.set(id, { x, y });
  if (s.pinch && s.pointers.size >= 2) s.zoom = pinchZoom(s.pinch.zoom, s.pinch.dist, dist(s));
}
export function gestureUp(s: MapGestureState, id: number): void {
  s.pointers.delete(id);
  if (s.pointers.size < 2) s.pinch = null;
}
