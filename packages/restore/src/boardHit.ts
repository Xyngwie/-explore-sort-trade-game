/**
 * Pure geometry for the Restore board on touch screens (no DOM access).
 *
 * - `nearestEdgeAt` maps a pointer position to the nearest edge of the
 *   slitherlink lattice (or `null` in the dead zones), so a tap does not have
 *   to land on the thin 5–6 px edge bar itself.
 * - Layout helpers decide the large-board layout and the zoom levels.
 *
 * Coordinates: vertex (x, y) sits at `(originX + x·pitchX, originY + y·pitchY)`
 * — origin = centre of the top-left dot, pitch = dot + cell (all in CSS px).
 */
import { hEdgeIndex, vEdgeIndex } from "./puzzle";

/** Perpendicular reach of an edge, in pitch units (≈ ± half a cell). */
export const EDGE_REACH = 0.4;
/** Radius (pitch units) around every dot where taps are ignored (corner ambiguity). */
export const DOT_DEAD_ZONE = 0.2;
/** |dh − dv| below this (pitch units) = near a cell diagonal → ambiguous, ignored. */
export const DIAGONAL_DEAD_ZONE = 0.05;

export interface BoardGeometry {
  cols: number;
  rows: number;
  /** Client-space centre of vertex (0, 0). */
  originX: number;
  originY: number;
  /** Distance between neighbouring vertices (px). */
  pitchX: number;
  pitchY: number;
}

export interface EdgeHit {
  kind: "h" | "v";
  /** h: cell column 0..cols-1, row line 0..rows · v: column line 0..cols, cell row 0..rows-1 */
  x: number;
  y: number;
  /** Index into the `marks` array (same as `hEdgeIndex` / `vEdgeIndex`). */
  index: number;
}

export interface NearestEdgeOptions {
  reach?: number;
  dotDeadZone?: number;
  diagonalDeadZone?: number;
}

/** Nearest edge for a pointer at (px, py), or `null` (dead zone / outside / cell centre). */
export function nearestEdgeAt(
  px: number,
  py: number,
  g: BoardGeometry,
  opts: NearestEdgeOptions = {},
): EdgeHit | null {
  const reach = opts.reach ?? EDGE_REACH;
  const dotDead = opts.dotDeadZone ?? DOT_DEAD_ZONE;
  const diagDead = opts.diagonalDeadZone ?? DIAGONAL_DEAD_ZONE;
  const { cols, rows, pitchX, pitchY } = g;
  if (!(cols >= 1 && rows >= 1 && pitchX > 0 && pitchY > 0)) return null;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  const u = (px - g.originX) / pitchX;
  const v = (py - g.originY) / pitchY;
  const rx = Math.round(u);
  const ry = Math.round(v);
  const dv = Math.abs(u - rx); // distance to the nearest vertical lattice line
  const dh = Math.abs(v - ry); // distance to the nearest horizontal lattice line
  if (Math.hypot(dv, dh) < dotDead) return null;
  if (Math.min(dh, dv) > reach) return null;
  if (Math.abs(dh - dv) < diagDead) return null;
  if (dh < dv) {
    const x = Math.floor(u);
    const y = ry;
    if (x < 0 || x >= cols || y < 0 || y > rows) return null;
    return { kind: "h", x, y, index: hEdgeIndex(cols, rows, x, y) };
  }
  const x = rx;
  const y = Math.floor(v);
  if (x < 0 || x > cols || y < 0 || y >= rows) return null;
  return { kind: "v", x, y, index: vEdgeIndex(cols, rows, x, y) };
}

/* ---------- layout / zoom helpers (mirror style.css: cell 2rem, dot/edge 0.35rem, min 3px) ---------- */

export const CELL_REM = 2;
export const DOT_REM = 0.35;
export const MIN_DOT_PX = 3;
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 1.5;
/** Boards with max(cols, rows) ≥ this use the large-board layout even if they fit. */
export const LARGE_BOARD_SIDE = 11;

export type ZoomMode = "fit" | "1" | "1.5";
export const ZOOM_MODES: readonly ZoomMode[] = ["fit", "1", "1.5"];

/** Board extent (px) along an axis with `n` cells at zoom `z`. */
export function boardExtentPx(n: number, z: number, remPx = 16): number {
  const dot = Math.max(MIN_DOT_PX, DOT_REM * remPx * z);
  return n * CELL_REM * remPx * z + (n + 1) * dot;
}

/** Vertex pitch (px) at zoom `z`. */
export function pitchAtZoom(z: number, remPx = 16): number {
  return CELL_REM * remPx * z + Math.max(MIN_DOT_PX, DOT_REM * remPx * z);
}

export function shouldUseLargeBoardLayout(
  cols: number,
  rows: number,
  availWidthPx: number,
  remPx = 16,
): boolean {
  if (Math.max(cols, rows) >= LARGE_BOARD_SIDE) return true;
  return boardExtentPx(cols, 1, remPx) > availWidthPx;
}

/** Largest zoom (≤ ZOOM_MAX, ≥ ZOOM_MIN) at which the whole board fits in availW × availH. */
export function fitZoom(
  cols: number,
  rows: number,
  availWidthPx: number,
  availHeightPx: number = Number.POSITIVE_INFINITY,
  remPx = 16,
): number {
  const solve = (n: number, avail: number): number => {
    if (!(avail > 0)) return ZOOM_MIN;
    if (!Number.isFinite(avail)) return ZOOM_MAX;
    // Unclamped dot: n·C·z + (n+1)·D·z = avail
    const z = avail / (n * CELL_REM * remPx + (n + 1) * DOT_REM * remPx);
    if (DOT_REM * remPx * z >= MIN_DOT_PX) return z;
    // Dot clamped at MIN_DOT_PX: n·C·z + (n+1)·MIN = avail
    return (avail - (n + 1) * MIN_DOT_PX) / (n * CELL_REM * remPx);
  };
  const z = Math.min(solve(cols, availWidthPx), solve(rows, availHeightPx));
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function zoomFactor(mode: ZoomMode, fit: number): number {
  if (mode === "fit") return fit;
  return mode === "1.5" ? 1.5 : 1;
}
