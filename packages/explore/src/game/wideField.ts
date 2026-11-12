/**
 * Wide-map placement (stage 3). Positions come from frontSeed and the board,
 * not from Math.random, so the same seed and the same opened/flagged set
 * always lay out the same spots.
 *
 * Mine cells (decision 13, 19): 2 enemies and 1 container, whether or not
 * the cell is open or flagged.
 * Known-safe cells: open, not a mine, not a wall. No enemies. A container
 * when wideHash(seed, sx, sy, 0) % 10 === 0 (about 1 cell in 10).
 * Unopened non-mines and false flags: nothing. Walls: nothing.
 */
import {
  AOI_HALF,
  DEFAULT_BOARD_SEED,
  SECTOR_WALL_DISTANCE,
  cellBoundsInWorld,
  cellCenterToWorld,
  chebyshevDistance,
  generateBoard,
  getCell,
  inAoi,
  recomputeStatus,
  restoreBoardFromProgress,
  worldToCell,
  type InvadeFrontProgress,
  type MsBoard,
  type MsCell,
} from "@estg/shared";

export const MINE_ENEMY_COUNT = 2;
export const SAFE_CONTAINER_MOD = 10;
/** Captain simulates enemies in cells at most this Chebyshev distance away. */
export const CAPTAIN_ENEMY_CELLS = 2;
/** A seen target is chased only into the home cell or an adjacent cell. */
export const ENEMY_CHASE_CELLS = 1;
const CELL_INSET = 80;
const CENTER_CLEAR = 140;

export type WideLayout = {
  seed: number;
  opened: { sx: number; sy: number }[];
  flagged: { sx: number; sy: number }[];
};

export type WideSpot = {
  sx: number;
  sy: number;
  x: number;
  y: number;
  kind: "enemy" | "mine-container" | "safe-container";
  /** 0 or 1 for the two enemies in a mine cell. */
  index: number;
};

export function wideHash(seed: number, sx: number, sy: number, salt: number): number {
  let t =
    (Math.imul(seed >>> 0, 0x9e3779b1) ^
      Math.imul((sx + 64) | 0, 0x85ebca6b) ^
      Math.imul((sy + 64) | 0, 0xc2b2ae35) ^
      Math.imul((salt + 1) | 0, 0x27d4eb2d)) >>>
    0;
  t = Math.imul(t ^ (t >>> 16), 0x7feb352d);
  t = Math.imul(t ^ (t >>> 15), 0x846ca68b);
  return (t ^ (t >>> 16)) >>> 0;
}

export function hashUnit(seed: number, sx: number, sy: number, salt: number): number {
  return wideHash(seed, sx, sy, salt) / 4294967296;
}

export function isMineCell(cell: MsCell): boolean {
  return cell.mine && !cell.blocked;
}

/** Opened ground the player already knows is not a mine. Includes numbered cells and HQ. */
export function isKnownSafeCell(cell: MsCell): boolean {
  return cell.open && !cell.mine && !cell.blocked;
}

export function safeCellGetsContainer(seed: number, sx: number, sy: number): boolean {
  return wideHash(seed, sx, sy, 0) % SAFE_CONTAINER_MOD === 0;
}

function spotInCell(seed: number, sx: number, sy: number, salt: number): { x: number; y: number } {
  const bounds = cellBoundsInWorld(sx, sy);
  const spanX = Math.max(1, bounds.x1 - bounds.x0 - CELL_INSET * 2);
  const spanY = Math.max(1, bounds.y1 - bounds.y0 - CELL_INSET * 2);
  let x = bounds.x0 + CELL_INSET + hashUnit(seed, sx, sy, salt) * spanX;
  let y = bounds.y0 + CELL_INSET + hashUnit(seed, sx, sy, salt + 17) * spanY;
  const center = cellCenterToWorld(sx, sy);
  const dx = x - center.x;
  const dy = y - center.y;
  const dist = Math.hypot(dx, dy);
  if (dist < CENTER_CLEAR) {
    const angle = dist > 1 ? Math.atan2(dy, dx) : salt * 0.9;
    x = center.x + Math.cos(angle) * CENTER_CLEAR;
    y = center.y + Math.sin(angle) * CENTER_CLEAR;
    x = Math.min(bounds.x1 - CELL_INSET, Math.max(bounds.x0 + CELL_INSET, x));
    y = Math.min(bounds.y1 - CELL_INSET, Math.max(bounds.y0 + CELL_INSET, y));
  }
  return { x, y };
}

export function cellsInOrder(board: MsBoard): MsCell[] {
  const out: MsCell[] = [];
  for (const row of board.cells) {
    for (const cell of row) {
      if (!cell.blocked) out.push(cell);
    }
  }
  return out;
}

export function wideSpots(board: MsBoard, seed: number): WideSpot[] {
  const spots: WideSpot[] = [];
  for (const cell of cellsInOrder(board)) {
    if (isMineCell(cell)) {
      for (let i = 0; i < MINE_ENEMY_COUNT; i++) {
        const pos = spotInCell(seed, cell.sx, cell.sy, 1 + i * 3);
        spots.push({ sx: cell.sx, sy: cell.sy, x: pos.x, y: pos.y, kind: "enemy", index: i });
      }
      const crate = spotInCell(seed, cell.sx, cell.sy, 9);
      spots.push({
        sx: cell.sx,
        sy: cell.sy,
        x: crate.x,
        y: crate.y,
        kind: "mine-container",
        index: 0,
      });
      continue;
    }
    if (isKnownSafeCell(cell) && safeCellGetsContainer(seed, cell.sx, cell.sy)) {
      const crate = spotInCell(seed, cell.sx, cell.sy, 4);
      spots.push({
        sx: cell.sx,
        sy: cell.sy,
        x: crate.x,
        y: crate.y,
        kind: "safe-container",
        index: 0,
      });
    }
  }
  return spots;
}

function snapshotLayout(board: MsBoard, seed: number): WideLayout {
  const opened: WideLayout["opened"] = [];
  const flagged: WideLayout["flagged"] = [];
  for (const cell of cellsInOrder(board)) {
    if (cell.open) opened.push({ sx: cell.sx, sy: cell.sy });
    else if (cell.flagged) flagged.push({ sx: cell.sx, sy: cell.sy });
  }
  return { seed: (board.seed ?? seed) >>> 0, opened, flagged };
}

/** Board used for one sortie. Missing progress uses the campaign seed. */
export function boardFromProgress(progress: InvadeFrontProgress | null | undefined): {
  board: MsBoard;
  layout: WideLayout;
} {
  const seed =
    progress != null && Number.isFinite(progress.seed) ? progress.seed >>> 0 : DEFAULT_BOARD_SEED;
  const usable =
    progress != null &&
    Number.isFinite(progress.seed) &&
    (progress.aoiHalf == null || progress.aoiHalf === AOI_HALF);
  const restored = usable
    ? restoreBoardFromProgress({ ...progress!, aoiHalf: AOI_HALF, seed })
    : null;
  const board = restored?.board ?? generateBoard(AOI_HALF, seed);
  return { board, layout: snapshotLayout(board, seed) };
}

/** Replay a stored layout. Mines come from the seed; opens and flags are reapplied. */
export function boardFromLayout(layout: WideLayout): MsBoard {
  const board = generateBoard(AOI_HALF, layout.seed >>> 0);
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.blocked) continue;
      cell.open = false;
      cell.flagged = false;
    }
  }
  for (const opened of layout.opened) {
    const cell = getCell(board, opened.sx, opened.sy);
    if (!cell || cell.blocked) continue;
    cell.open = true;
    cell.flagged = false;
  }
  for (const flagged of layout.flagged) {
    const cell = getCell(board, flagged.sx, flagged.sy);
    if (!cell || cell.blocked || cell.open) continue;
    cell.flagged = true;
  }
  recomputeStatus(board);
  return board;
}

/**
 * Entry cell. A missing sector, a wall, or a coordinate off the board
 * starts at HQ (0, 0). Direct sortie passes sector (0, 0), which is the same point.
 */
export function entryCellOf(
  sector: { sectorX: number; sectorY: number } | null | undefined,
): { sx: number; sy: number } {
  if (!sector || !Number.isFinite(sector.sectorX) || !Number.isFinite(sector.sectorY)) {
    return { sx: 0, sy: 0 };
  }
  const sx = Math.trunc(sector.sectorX);
  const sy = Math.trunc(sector.sectorY);
  if (!inAoi(AOI_HALF, sx, sy)) return { sx: 0, sy: 0 };
  if (chebyshevDistance(sx, sy, 0, 0) >= SECTOR_WALL_DISTANCE) return { sx: 0, sy: 0 };
  return { sx, sy };
}

export function entryPointOf(
  sector: { sectorX: number; sectorY: number } | null | undefined,
): { x: number; y: number } {
  const cell = entryCellOf(sector);
  return cellCenterToWorld(cell.sx, cell.sy);
}

/** Cell under a point, or null when it is off the board or on a wall. */
export function playableCellAt(x: number, y: number): { sx: number; sy: number } | null {
  const cell = worldToCell(x, y);
  if (!cell) return null;
  if (chebyshevDistance(cell.sx, cell.sy, 0, 0) >= SECTOR_WALL_DISTANCE) return null;
  return cell;
}
