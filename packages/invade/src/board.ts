/**
 * Front-map minesweeper — the invade AOI sector grid IS the board.
 * Metaphor: HQ open = home · blank flood = explored · numbers = buffer sensing · mine = enemy → M1.
 * Invade-only; feeds existing handoff via intelFlags / density (no new URL keys).
 */

import {
  SECTOR_FRONT_DISTANCE,
  SECTOR_WALL_DISTANCE,
  sectorDistanceFromHq,
} from "@estg/shared";
import { densityAfterSweep, type CellMark } from "./sweep";

/**
 * Half-extent of the front AOI (coords −AOI_HALF … +AOI_HALF).
 * Includes the wall ring at d≥SECTOR_WALL_DISTANCE (12).
 */
export const AOI_HALF = 12;

/** Full board side length (odd): 2*AOI_HALF+1 = 25. */
export const BOARD_SPAN = AOI_HALF * 2 + 1;

/** @deprecated Use BOARD_SPAN — kept as alias for call-site clarity. */
export const BOARD_SIZE = BOARD_SPAN;

/** Near-HQ mine rate floor (d→0+, excluding HQ). Matches old mini-board ~5%. */
export const MIN_MINE_P = 0.05;

/** Front-cap mine rate (d≥FRONT). Matches old mini-board ~25%. */
export const MAX_MINE_P = 0.25;

export type BoardStatus = "playing" | "won" | "hazard";

export type MsCell = {
  /** World sector X (−AOI_HALF … +AOI_HALF). */
  sx: number;
  /** World sector Y. */
  sy: number;
  mine: boolean;
  /** d ≥ wall — impassable; not openable / not flaggable. */
  blocked: boolean;
  /** Adjacent mine count among 8-neighbors (blocked neighbors ignored). */
  adjacent: number;
  open: boolean;
  flagged: boolean;
  /** HQ at (0,0); never mined; starts open. */
  isHq: boolean;
};

export type MsBoard = {
  aoiHalf: number;
  span: number;
  /** Row-major [iy][ix]; world = (ix - aoiHalf, iy - aoiHalf). */
  cells: MsCell[][];
  mineCount: number;
  status: BoardStatus;
  /** Soft hazard — front not hard-locked. */
  hitMine: boolean;
};

export type OpenResult =
  | { ok: true; opened: number; status: BoardStatus }
  | { ok: false; reason: "oob" | "flagged" | "alreadyOpen" | "blocked" };

export type FlagResult =
  | { ok: true; flagged: boolean }
  | { ok: false; reason: "oob" | "open" | "blocked" };

/** Index helpers: world sector → array index. */
export function worldToIndex(aoiHalf: number, s: number): number {
  return s + aoiHalf;
}

export function indexToWorld(aoiHalf: number, i: number): number {
  return i - aoiHalf;
}

export function inAoi(aoiHalf: number, sx: number, sy: number): boolean {
  return (
    sx >= -aoiHalf &&
    sx <= aoiHalf &&
    sy >= -aoiHalf &&
    sy <= aoiHalf
  );
}

export function getCell(board: MsBoard, sx: number, sy: number): MsCell | null {
  if (!inAoi(board.aoiHalf, sx, sy)) return null;
  const ix = worldToIndex(board.aoiHalf, sx);
  const iy = worldToIndex(board.aoiHalf, sy);
  return board.cells[iy]![ix] ?? null;
}

/**
 * P(mine) for a playable cell at Chebyshev distance d from HQ.
 * Denser farther out; HQ (d=0) and wall (blocked) are never mined here.
 */
export function mineProbabilityAtDistance(d: number): number {
  if (!Number.isFinite(d) || d <= 0) return 0;
  if (d >= SECTOR_WALL_DISTANCE) return 0;
  const density = Math.min(1, d / SECTOR_FRONT_DISTANCE);
  return MIN_MINE_P + density * (MAX_MINE_P - MIN_MINE_P);
}

/** Expected mine count across the playable AOI (analytic sum of P). */
export function expectedMineCount(aoiHalf: number = AOI_HALF): number {
  let sum = 0;
  for (let sy = -aoiHalf; sy <= aoiHalf; sy++) {
    for (let sx = -aoiHalf; sx <= aoiHalf; sx++) {
      const d = sectorDistanceFromHq(sx, sy);
      if (d >= SECTOR_WALL_DISTANCE) continue;
      if (sx === 0 && sy === 0) continue;
      sum += mineProbabilityAtDistance(d);
    }
  }
  return sum;
}

/** Deterministic mulberry32 from optional seed (default fixed campaign seed). */
export function rngFromSeed(seed: number = 0x4ead_f001): () => number {
  let t = (seed >>> 0) + 0x6d2b79f5;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function neighbors(
  aoiHalf: number,
  sx: number,
  sy: number,
): Array<{ sx: number; sy: number }> {
  const out: Array<{ sx: number; sy: number }> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = sx + dx;
      const ny = sy + dy;
      if (inAoi(aoiHalf, nx, ny)) out.push({ sx: nx, sy: ny });
    }
  }
  return out;
}

function emptyFront(aoiHalf: number): MsCell[][] {
  const span = aoiHalf * 2 + 1;
  const cells: MsCell[][] = [];
  for (let iy = 0; iy < span; iy++) {
    const row: MsCell[] = [];
    const sy = indexToWorld(aoiHalf, iy);
    for (let ix = 0; ix < span; ix++) {
      const sx = indexToWorld(aoiHalf, ix);
      const d = sectorDistanceFromHq(sx, sy);
      const isHq = sx === 0 && sy === 0;
      const blocked = d >= SECTOR_WALL_DISTANCE;
      row.push({
        sx,
        sy,
        mine: false,
        blocked,
        adjacent: 0,
        open: false,
        flagged: false,
        isHq,
      });
    }
    cells.push(row);
  }
  return cells;
}

function placeMinesByDistance(
  cells: MsCell[][],
  aoiHalf: number,
  rng: () => number,
): number {
  let placed = 0;
  const span = aoiHalf * 2 + 1;
  for (let iy = 0; iy < span; iy++) {
    for (let ix = 0; ix < span; ix++) {
      const cell = cells[iy]![ix]!;
      if (cell.isHq || cell.blocked) continue;
      const d = sectorDistanceFromHq(cell.sx, cell.sy);
      const p = mineProbabilityAtDistance(d);
      if (rng() < p) {
        cell.mine = true;
        placed++;
      }
    }
  }
  return placed;
}

function computeAdjacents(cells: MsCell[][], aoiHalf: number): void {
  const span = aoiHalf * 2 + 1;
  for (let iy = 0; iy < span; iy++) {
    for (let ix = 0; ix < span; ix++) {
      const cell = cells[iy]![ix]!;
      if (cell.mine || cell.blocked) {
        cell.adjacent = 0;
        continue;
      }
      let n = 0;
      for (const nb of neighbors(aoiHalf, cell.sx, cell.sy)) {
        const ncell =
          cells[worldToIndex(aoiHalf, nb.sy)]![worldToIndex(aoiHalf, nb.sx)]!;
        if (ncell.mine) n++;
      }
      cell.adjacent = n;
    }
  }
}

/**
 * Flood-open from (sx,sy) like classic MS: zeros recurse to neighbors.
 * Skips mines, flags, and blocked wall cells.
 */
export function floodOpen(board: MsBoard, sx: number, sy: number): number {
  const cell0 = getCell(board, sx, sy);
  if (!cell0 || cell0.blocked || cell0.open || cell0.flagged || cell0.mine) {
    return 0;
  }

  let opened = 0;
  const stack: Array<{ sx: number; sy: number }> = [{ sx, sy }];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const cell = getCell(board, cur.sx, cur.sy);
    if (!cell || cell.blocked || cell.open || cell.flagged || cell.mine) continue;
    cell.open = true;
    opened++;
    if (cell.adjacent === 0) {
      for (const nb of neighbors(board.aoiHalf, cur.sx, cur.sy)) {
        const ncell = getCell(board, nb.sx, nb.sy);
        if (
          ncell &&
          !ncell.blocked &&
          !ncell.open &&
          !ncell.flagged &&
          !ncell.mine
        ) {
          stack.push(nb);
        }
      }
    }
  }
  return opened;
}

function openHqAndFlood(board: MsBoard): void {
  floodOpen(board, 0, 0);
}

function allSafeOpen(board: MsBoard): boolean {
  for (const row of board.cells) {
    for (const c of row) {
      if (c.blocked) continue;
      if (!c.mine && !c.open) return false;
    }
  }
  return true;
}

function allMinesFlagged(board: MsBoard): boolean {
  let flaggedMines = 0;
  let falseFlags = 0;
  for (const row of board.cells) {
    for (const c of row) {
      if (c.blocked) continue;
      if (c.flagged && c.mine) flaggedMines++;
      if (c.flagged && !c.mine) falseFlags++;
    }
  }
  return falseFlags === 0 && flaggedMines === board.mineCount;
}

export function recomputeStatus(board: MsBoard): BoardStatus {
  if (allSafeOpen(board) || allMinesFlagged(board)) {
    board.status = "won";
    return "won";
  }
  if (board.hitMine) {
    board.status = "hazard";
    return "hazard";
  }
  board.status = "playing";
  return "playing";
}

/**
 * Generate the front minesweeper board.
 * HQ (0,0) starts forced-open (flood). Wall ring d≥12 is blocked.
 * Mines placed with P rising by Chebyshev distance from HQ.
 */
export function generateBoard(
  aoiHalf: number = AOI_HALF,
  rng: () => number = rngFromSeed(),
): MsBoard {
  const cells = emptyFront(aoiHalf);
  const placed = placeMinesByDistance(cells, aoiHalf, rng);
  computeAdjacents(cells, aoiHalf);

  const board: MsBoard = {
    aoiHalf,
    span: aoiHalf * 2 + 1,
    cells,
    mineCount: placed,
    status: "playing",
    hitMine: false,
  };
  openHqAndFlood(board);
  recomputeStatus(board);
  return board;
}

/** Open a sector cell. Stepping a mine → soft hazard (no hard-lock). */
export function openCell(board: MsBoard, sx: number, sy: number): OpenResult {
  const cell = getCell(board, sx, sy);
  if (!cell) return { ok: false, reason: "oob" };
  if (cell.blocked) return { ok: false, reason: "blocked" };
  if (cell.flagged) return { ok: false, reason: "flagged" };
  if (cell.open) return { ok: false, reason: "alreadyOpen" };

  if (cell.mine) {
    cell.open = true;
    board.hitMine = true;
    const status = recomputeStatus(board);
    return { ok: true, opened: 1, status };
  }

  const opened = floodOpen(board, sx, sy);
  const status = recomputeStatus(board);
  return { ok: true, opened, status };
}

/** Toggle flag on a closed playable cell. */
export function toggleFlag(board: MsBoard, sx: number, sy: number): FlagResult {
  const cell = getCell(board, sx, sy);
  if (!cell) return { ok: false, reason: "oob" };
  if (cell.blocked) return { ok: false, reason: "blocked" };
  if (cell.open) return { ok: false, reason: "open" };
  cell.flagged = !cell.flagged;
  recomputeStatus(board);
  return { ok: true, flagged: cell.flagged };
}

export function countFlagged(board: MsBoard): number {
  let n = 0;
  for (const row of board.cells) {
    for (const c of row) if (c.flagged) n++;
  }
  return n;
}

export function countOpenSafe(board: MsBoard): number {
  let n = 0;
  for (const row of board.cells) {
    for (const c of row) if (c.open && !c.mine && !c.blocked) n++;
  }
  return n;
}

export function countPlayableSafe(board: MsBoard): number {
  let n = 0;
  for (const row of board.cells) {
    for (const c of row) if (!c.blocked && !c.mine) n++;
  }
  return n;
}

/** Unopened / unflagged mines still on the front. */
export function minesRemaining(board: MsBoard): number {
  if (board.status === "won") return 0;
  let flaggedCorrect = 0;
  let openedMines = 0;
  for (const row of board.cells) {
    for (const c of row) {
      if (c.mine && c.flagged) flaggedCorrect++;
      if (c.mine && c.open) openedMines++;
    }
  }
  return Math.max(0, board.mineCount - flaggedCorrect - openedMines);
}

/**
 * Intel tokens from board progress (HANDOFF_M45 intelFlags — identifier tokens only).
 * - sectorCleared — all safe open or mines correctly flagged
 * - minesRemaining — still uncleared enemies
 * - scoutHazard — stepped a mine (soft)
 * - sectorFlagged — at least one flag placed
 * - scoutClear — meaningful safe ground opened without full clear
 */
export function intelFromBoard(board: MsBoard): string[] {
  const flags: string[] = [];
  if (board.status === "won") {
    flags.push("sectorCleared");
  } else if (minesRemaining(board) > 0) {
    flags.push("minesRemaining");
  }
  if (board.hitMine) flags.push("scoutHazard");
  if (countFlagged(board) > 0) flags.push("sectorFlagged");
  const safeTotal = countPlayableSafe(board);
  const opened = countOpenSafe(board);
  if (board.status !== "won" && safeTotal > 0 && opened / safeTotal >= 0.35) {
    flags.push("scoutClear");
  }
  return flags;
}

/**
 * Density nudge from board outcome for a handoff sector's base density.
 * won → cool-down · hazard → heat · partial open → slight cool · else unchanged.
 */
export function densityAfterBoard(baseDensity: number, board: MsBoard): number {
  let mark: CellMark = "none";
  if (board.status === "won") mark = "cleared";
  else if (board.hitMine) mark = "hazard";
  else if (countOpenSafe(board) > 1) mark = "cleared";
  const d = densityAfterSweep(baseDensity, mark);
  if (board.status === "won" || board.hitMine || mark === "none") return d;
  const cleared = densityAfterSweep(baseDensity, "cleared");
  return Number(((baseDensity + cleared) / 2).toFixed(3));
}

/** Merge route-base intel with board-derived tokens. */
export function mergeBoardIntel(
  base: readonly string[],
  board: MsBoard,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...base, ...intelFromBoard(board)]) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Display glyph for a cell (UI). */
export function cellGlyph(cell: MsCell): string {
  if (cell.blocked) return "壁";
  if (cell.flagged && !cell.open) return "⚑";
  if (!cell.open) return "";
  if (cell.mine) return "✕";
  if (cell.isHq && cell.adjacent === 0) return "HQ";
  if (cell.isHq) return "HQ";
  if (cell.adjacent === 0) return "";
  return String(cell.adjacent);
}
