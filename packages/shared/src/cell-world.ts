/**
 * Cell ↔ world coordinates for the wide map (explore/invade stage 2).
 * Pure functions. Explore does not call these yet.
 *
 * Decision 14 (神宮 2026-11-12, stage 2-1 = B): world (0, 0) is the center of
 * the HQ cell (sx=0, sy=0). Coordinates may be negative.
 * Decision 15 (神宮 2026-11-12, stage 2-2 = A): larger sx is larger world x
 * (right). Larger sy is larger world y (down), the same row order as
 * `front-board.ts` (`iy` 0 is sy = −AOI_HALF).
 *
 * Cell (sx, sy) center is (sx * CELL_WORLD_W, sy * CELL_WORLD_H).
 * The cell covers the half-open rectangle
 *   x ∈ [centerX − CELL_WORLD_W/2, centerX + CELL_WORLD_W/2)
 *   y ∈ [centerY − CELL_WORLD_H/2, centerY + CELL_WORLD_H/2)
 * The left and top edges belong to this cell. The right and bottom edges
 * belong to the next cell.
 *
 * `worldToCell` returns null when x or y is not finite, or when the cell
 * would lie outside sx, sy ∈ [−AOI_HALF, +AOI_HALF]. The board therefore
 * covers x ∈ [−17500, +17500) and y ∈ [−12500, +12500). x = +17500 and
 * y = +12500 are outside: they are the left/top edge of a cell at +13,
 * and that cell is not on the board. x = −17500 and y = −12500 belong to
 * cell (−12, −12).
 *
 * `cellCenterToWorld` and `cellBoundsInWorld` apply the formula only. They
 * do not check that the cell is on the board.
 *
 * Cell size (1400×1000) is named once, below. The board radius is `AOI_HALF`
 * in `front-board.ts` (12). This file does not repeat that 12.
 */

import { AOI_HALF } from "./front-board";
import type { FrontCellCoord } from "./hub-save";

/** One front cell in world units. Decision 2: the current 1400×1000. */
export const CELL_WORLD_W = 1400;
/** One front cell in world units. Decision 2. */
export const CELL_WORLD_H = 1000;

export type CellWorldPoint = { x: number; y: number };

/** Half-open bounds [x0, x1) × [y0, y1). */
export type CellWorldBounds = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export function cellCenterToWorld(sx: number, sy: number): CellWorldPoint {
  return { x: sx * CELL_WORLD_W, y: sy * CELL_WORLD_H };
}

export function cellBoundsInWorld(sx: number, sy: number): CellWorldBounds {
  const center = cellCenterToWorld(sx, sy);
  const halfW = CELL_WORLD_W / 2;
  const halfH = CELL_WORLD_H / 2;
  return {
    x0: center.x - halfW,
    y0: center.y - halfH,
    x1: center.x + halfW,
    y1: center.y + halfH,
  };
}

/** Cell containing (x, y), or null when the point is off the board. */
export function worldToCell(x: number, y: number): FrontCellCoord | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const sx = Math.floor((x + CELL_WORLD_W / 2) / CELL_WORLD_W);
  const sy = Math.floor((y + CELL_WORLD_H / 2) / CELL_WORLD_H);
  if (sx < -AOI_HALF || sx > AOI_HALF || sy < -AOI_HALF || sy > AOI_HALF) {
    return null;
  }
  return { sx, sy };
}
