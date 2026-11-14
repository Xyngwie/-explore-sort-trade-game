/**
 * Sortie bounds in HQ-centered world coordinates (stage 3, decision 16).
 * The playable rectangle is the inside of the wall ring. Old checkpoints
 * that have no min/max keep the 0…worldW box they were saved with.
 */
import {
  SECTOR_WALL_DISTANCE,
  cellBoundsInWorld,
  chebyshevDistance,
  worldToCell,
} from "@estg/shared";
import type { Balance } from "./balance";

/** Same inset the 1400×1000 map used so a unit center does not sit on the edge. */
export const FIELD_EDGE = 20;

export type FieldRect = { minX: number; maxX: number; minY: number; maxY: number };

export type BoundsBalance = Pick<Balance, "worldW" | "worldH"> & Partial<FieldRect>;

/**
 * Cells with Chebyshev distance from HQ strictly below SECTOR_WALL_DISTANCE.
 * The right and bottom edges are the wall's left/top edges (half-open).
 */
export function playableFieldRect(): FieldRect {
  const inner = SECTOR_WALL_DISTANCE - 1;
  const left = cellBoundsInWorld(-inner, 0);
  const right = cellBoundsInWorld(inner, 0);
  const top = cellBoundsInWorld(0, -inner);
  const bottom = cellBoundsInWorld(0, inner);
  return { minX: left.x0, maxX: right.x1, minY: top.y0, maxY: bottom.y1 };
}

export function isWideMap(balance: BoundsBalance): boolean {
  return (
    Number.isFinite(balance.minX) &&
    Number.isFinite(balance.maxX) &&
    Number.isFinite(balance.minY) &&
    Number.isFinite(balance.maxY) &&
    (balance.maxX as number) > (balance.minX as number) &&
    (balance.maxY as number) > (balance.minY as number)
  );
}

/** Wide sorties use min/max. A checkpoint without them stays 0…worldW. */
export function fieldRectOf(balance: BoundsBalance): FieldRect {
  if (isWideMap(balance)) {
    return {
      minX: balance.minX as number,
      maxX: balance.maxX as number,
      minY: balance.minY as number,
      maxY: balance.maxY as number,
    };
  }
  return { minX: 0, maxX: balance.worldW, minY: 0, maxY: balance.worldH };
}

export function intersectRect(a: FieldRect, b: FieldRect): FieldRect {
  return {
    minX: Math.max(a.minX, b.minX),
    maxX: Math.min(a.maxX, b.maxX),
    minY: Math.max(a.minY, b.minY),
    maxY: Math.min(a.maxY, b.maxY),
  };
}

/** Cells (sx±reach, sy±reach), before intersecting the playable field. */
export function cellReachRect(sx: number, sy: number, reach: number): FieldRect {
  const left = cellBoundsInWorld(sx - reach, 0);
  const right = cellBoundsInWorld(sx + reach, 0);
  const top = cellBoundsInWorld(0, sy - reach);
  const bottom = cellBoundsInWorld(0, sy + reach);
  return { minX: left.x0, maxX: right.x1, minY: top.y0, maxY: bottom.y1 };
}

export function clampToRect(
  x: number,
  y: number,
  rect: FieldRect,
  margin = 0,
): { x: number; y: number } {
  let loX = rect.minX + margin;
  let hiX = rect.maxX - margin;
  let loY = rect.minY + margin;
  let hiY = rect.maxY - margin;
  if (!(hiX > loX)) {
    const c = (rect.minX + rect.maxX) / 2;
    loX = c;
    hiX = c;
  }
  if (!(hiY > loY)) {
    const c = (rect.minY + rect.maxY) / 2;
    loY = c;
    hiY = c;
  }
  const cx = (rect.minX + rect.maxX) / 2;
  const cy = (rect.minY + rect.maxY) / 2;
  return {
    x: Math.min(hiX, Math.max(loX, Number.isFinite(x) ? x : cx)),
    y: Math.min(hiY, Math.max(loY, Number.isFinite(y) ? y : cy)),
  };
}

export function clampToField(
  balance: BoundsBalance,
  x: number,
  y: number,
  margin = 0,
): { x: number; y: number } {
  return clampToRect(x, y, fieldRectOf(balance), margin);
}

export function cellChebyshev(
  a: { sx: number; sy: number },
  b: { sx: number; sy: number },
): number {
  return chebyshevDistance(a.sx, a.sy, b.sx, b.sy);
}

/** Finite, inside the field rect, and not on a wall cell. */
export function isPlayablePoint(balance: BoundsBalance, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const rect = fieldRectOf(balance);
  if (x < rect.minX || y < rect.minY || x >= rect.maxX || y >= rect.maxY) return false;
  if (!isWideMap(balance)) return true;
  const cell = worldToCell(x, y);
  if (!cell) return false;
  return chebyshevDistance(cell.sx, cell.sy, 0, 0) < SECTOR_WALL_DISTANCE;
}

/**
 * Read a saved explore coordinate without rewriting the save.
 * A finite point that is already playable is returned as-is (no migration).
 * NaN, a wall cell, or a point outside the field is pulled inside so the
 * unit can still move. The caller keeps that adjusted point in memory.
 */
export function settleLegacyPos(
  balance: BoundsBalance,
  pos: { x: number; y: number },
): { x: number; y: number } {
  if (isPlayablePoint(balance, pos.x, pos.y)) return { x: pos.x, y: pos.y };
  return clampToField(balance, pos.x, pos.y, FIELD_EDGE);
}
