/**
 * Stage 4, decision 34. Old explore coordinates were 0…1400 × 0…1000
 * with the squad starting at (700, 500). The wide map puts that same
 * square on the HQ cell, so an unmarked point in the old box is read as
 * (x − 700, y − 500). `wide: true` is the mark that this point was already
 * shifted (or was written as a world coordinate). A second read does not
 * shift again. The mark sits on the position, not a new hub top-level key.
 * Non-finite values and points outside the old box are left for the caller.
 */
export const OLD_EXPLORE_MAX_X = 1400;
export const OLD_EXPLORE_MAX_Y = 1000;
export const OLD_EXPLORE_SHIFT_X = 700;
export const OLD_EXPLORE_SHIFT_Y = 500;

export type StoredExplorePos = { x: number; y: number; wide?: true };

export function inOldExploreBox(x: number, y: number): boolean {
  return x >= 0 && x <= OLD_EXPLORE_MAX_X && y >= 0 && y <= OLD_EXPLORE_MAX_Y;
}

/** Shift an unmarked old-map point once. A marked point, or one outside the old box, keeps its numbers. */
export function migrateStoredExplorePos(pos: { x: number; y: number; wide?: boolean }): StoredExplorePos {
  if (pos.wide === true) return { x: pos.x, y: pos.y, wide: true };
  if (inOldExploreBox(pos.x, pos.y)) {
    const tenth = (n: number) => Math.round(n * 10) / 10;
    return {
      x: tenth(pos.x - OLD_EXPLORE_SHIFT_X),
      y: tenth(pos.y - OLD_EXPLORE_SHIFT_Y),
      wide: true,
    };
  }
  return { x: pos.x, y: pos.y };
}
