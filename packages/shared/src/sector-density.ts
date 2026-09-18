/**
 * Module 4 (invade / front) — Chebyshev sector density placeholders.
 * Pure helpers only; no handoff / UI. Curve is provisional (see docs/INVADE_V0.md).
 */

/** Chebyshev distance between two integer lattice points. */
export function chebyshevDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** HQ at (0,0) → sector (sx, sy) Chebyshev distance. */
export function sectorDistanceFromHq(sx: number, sy: number): number {
  return chebyshevDistance(sx, sy, 0, 0);
}

/** Provisional wall: d >= 12 is blocked (PRODUCT_VISION / INVADE_V0). */
export const SECTOR_WALL_DISTANCE = 12;

/** Front-cap reference distance (~ density 1.0 before wall). */
export const SECTOR_FRONT_DISTANCE = 10;

export type SectorDensityInfo = {
  distance: number;
  /** 0..1 when enterable; 0 when blocked. */
  density: number;
  blocked: boolean;
};

/**
 * Map Chebyshev distance → provisional density scalar.
 * - d >= SECTOR_WALL_DISTANCE → blocked
 * - else density = clamp(d / SECTOR_FRONT_DISTANCE, 0..1)
 */
export function sectorDensityFromChebyshev(distance: number): SectorDensityInfo {
  const d = Math.max(0, Math.floor(distance));
  if (d >= SECTOR_WALL_DISTANCE) {
    return { distance: d, density: 0, blocked: true };
  }
  const density = Math.min(1, d / SECTOR_FRONT_DISTANCE);
  return { distance: d, density, blocked: false };
}

export function sectorDensityAt(sx: number, sy: number): SectorDensityInfo {
  return sectorDensityFromChebyshev(sectorDistanceFromHq(sx, sy));
}
