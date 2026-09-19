/**
 * Sector-internal minesweeper — mini-board played inside a selected front sector.
 * Metaphor: HQ open = home · blank = explored safe · numbers = buffer sensing · mine = enemy → M1.
 * Invade-only; feeds existing handoff via intelFlags / density (no new URL keys).
 */

import { densityAfterSweep, type CellMark } from "./sweep";

/** Classic beginner-ish grid (8×8). */
export const BOARD_SIZE = 8;

/** Mine count at density 0 (HQ-near sectors stay light). */
export const MIN_MINES = 3;

/** Mine count at density 1 (~25% of 64 cells). */
export const MAX_MINES = 16;

export type BoardStatus = "playing" | "won" | "hazard";

export type MsCell = {
  mine: boolean;
  /** Adjacent mine count (0–8). Meaningful when !mine. */
  adjacent: number;
  open: boolean;
  flagged: boolean;
  /** Forced-safe home cell(s); never mined; start open. */
  isHq: boolean;
};

export type MsBoard = {
  size: number;
  cells: MsCell[][];
  mineCount: number;
  density: number;
  /** Sector seed inputs (for regen / debug). */
  sectorX: number;
  sectorY: number;
  status: BoardStatus;
  /** True after the player opens a mine (soft hazard — front not hard-locked). */
  hitMine: boolean;
};

export type OpenResult =
  | { ok: true; opened: number; status: BoardStatus }
  | { ok: false; reason: "oob" | "flagged" | "alreadyOpen" };

export type FlagResult =
  | { ok: true; flagged: boolean }
  | { ok: false; reason: "oob" | "open" };

/** Map provisional sector density → mine count on the mini-board. */
export function mineCountFromDensity(
  density: number,
  size: number = BOARD_SIZE,
): number {
  const d = Number.isFinite(density) ? Math.min(1, Math.max(0, density)) : 0;
  const raw = Math.round(MIN_MINES + d * (MAX_MINES - MIN_MINES));
  const maxFit = Math.max(0, size * size - hqCellCount(size) - 1);
  return Math.min(maxFit, Math.max(MIN_MINES, raw));
}

/** 2×2 HQ block centered on an even-sized board (else single center cell). */
export function hqCoords(size: number = BOARD_SIZE): ReadonlyArray<{ x: number; y: number }> {
  if (size < 2) return [{ x: 0, y: 0 }];
  if (size % 2 === 0) {
    const a = size / 2 - 1;
    const b = size / 2;
    return [
      { x: a, y: a },
      { x: b, y: a },
      { x: a, y: b },
      { x: b, y: b },
    ];
  }
  const c = Math.floor(size / 2);
  return [{ x: c, y: c }];
}

export function hqCellCount(size: number = BOARD_SIZE): number {
  return hqCoords(size).length;
}

/** Deterministic mulberry32 from sector + density bucket. */
export function rngFromSector(
  sectorX: number,
  sectorY: number,
  density: number,
): () => number {
  const densBucket = Math.round(
    (Number.isFinite(density) ? Math.min(1, Math.max(0, density)) : 0) * 1000,
  );
  let t =
    (Math.imul(sectorX | 0, 374761393) ^
      Math.imul(sectorY | 0, 668265263) ^
      Math.imul(densBucket, 2147483647)) >>>
    0;
  t = (t + 0x6d2b79f5) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function inBounds(size: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function neighbors(size: number, x: number, y: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(size, nx, ny)) out.push({ x: nx, y: ny });
    }
  }
  return out;
}

function emptyCells(size: number): MsCell[][] {
  const cells: MsCell[][] = [];
  for (let y = 0; y < size; y++) {
    const row: MsCell[] = [];
    for (let x = 0; x < size; x++) {
      row.push({
        mine: false,
        adjacent: 0,
        open: false,
        flagged: false,
        isHq: false,
      });
    }
    cells.push(row);
  }
  return cells;
}

function markHq(cells: MsCell[][], size: number): void {
  for (const { x, y } of hqCoords(size)) {
    cells[y]![x]!.isHq = true;
  }
}

function placeMines(
  cells: MsCell[][],
  size: number,
  mineCount: number,
  rng: () => number,
): number {
  const forbidden = new Set(
    hqCoords(size).map((c) => `${c.x},${c.y}`),
  );
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!forbidden.has(`${x},${y}`)) candidates.push({ x, y });
    }
  }
  // Fisher–Yates partial shuffle
  const n = Math.min(mineCount, candidates.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (candidates.length - i));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
    const { x, y } = candidates[i]!;
    cells[y]![x]!.mine = true;
  }
  return n;
}

function computeAdjacents(cells: MsCell[][], size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y]![x]!;
      if (cell.mine) {
        cell.adjacent = 0;
        continue;
      }
      let n = 0;
      for (const nb of neighbors(size, x, y)) {
        if (cells[nb.y]![nb.x]!.mine) n++;
      }
      cell.adjacent = n;
    }
  }
}

/**
 * Flood-open from (x,y) like classic MS: zeros recurse to neighbors.
 * Does not open mines (caller handles mine step).
 */
export function floodOpen(board: MsBoard, x: number, y: number): number {
  const { size, cells } = board;
  if (!inBounds(size, x, y)) return 0;
  const start = cells[y]![x]!;
  if (start.open || start.flagged || start.mine) return 0;

  let opened = 0;
  const stack: Array<{ x: number; y: number }> = [{ x, y }];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const cell = cells[cur.y]![cur.x]!;
    if (cell.open || cell.flagged || cell.mine) continue;
    cell.open = true;
    opened++;
    if (cell.adjacent === 0) {
      for (const nb of neighbors(size, cur.x, cur.y)) {
        const ncell = cells[nb.y]![nb.x]!;
        if (!ncell.open && !ncell.flagged && !ncell.mine) {
          stack.push(nb);
        }
      }
    }
  }
  return opened;
}

function openHqAndFlood(board: MsBoard): void {
  for (const { x, y } of hqCoords(board.size)) {
    floodOpen(board, x, y);
  }
}

function allSafeOpen(board: MsBoard): boolean {
  for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const c = board.cells[y]![x]!;
      if (!c.mine && !c.open) return false;
    }
  }
  return true;
}

function allMinesFlagged(board: MsBoard): boolean {
  let flaggedMines = 0;
  let falseFlags = 0;
  for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const c = board.cells[y]![x]!;
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
 * Generate a seeded mini-board for a sector. HQ cells start forced-open (flood).
 */
export function generateBoard(
  sectorX: number,
  sectorY: number,
  density: number,
  size: number = BOARD_SIZE,
  rng: () => number = rngFromSector(sectorX, sectorY, density),
): MsBoard {
  const mineCount = mineCountFromDensity(density, size);
  const cells = emptyCells(size);
  markHq(cells, size);
  const placed = placeMines(cells, size, mineCount, rng);
  computeAdjacents(cells, size);

  const board: MsBoard = {
    size,
    cells,
    mineCount: placed,
    density: Number.isFinite(density) ? Math.min(1, Math.max(0, density)) : 0,
    sectorX,
    sectorY,
    status: "playing",
    hitMine: false,
  };
  openHqAndFlood(board);
  recomputeStatus(board);
  return board;
}

/** Left-click / open a cell. Stepping a mine → soft hazard (no hard-lock). */
export function openCell(board: MsBoard, x: number, y: number): OpenResult {
  if (!inBounds(board.size, x, y)) return { ok: false, reason: "oob" };
  const cell = board.cells[y]![x]!;
  if (cell.flagged) return { ok: false, reason: "flagged" };
  if (cell.open) return { ok: false, reason: "alreadyOpen" };

  if (cell.mine) {
    cell.open = true;
    board.hitMine = true;
    const status = recomputeStatus(board);
    return { ok: true, opened: 1, status };
  }

  const opened = floodOpen(board, x, y);
  const status = recomputeStatus(board);
  return { ok: true, opened, status };
}

/** Toggle flag on a closed cell. */
export function toggleFlag(board: MsBoard, x: number, y: number): FlagResult {
  if (!inBounds(board.size, x, y)) return { ok: false, reason: "oob" };
  const cell = board.cells[y]![x]!;
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
    for (const c of row) if (c.open && !c.mine) n++;
  }
  return n;
}

/** Unopened (and unflagged-as-done) mines still conceptually on the board. */
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
 * - minesRemaining — still uncleared enemies (conceptual for explore)
 * - scoutHazard — stepped a mine (soft; front not locked)
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
  const safeTotal = board.size * board.size - board.mineCount;
  const opened = countOpenSafe(board);
  if (board.status !== "won" && safeTotal > 0 && opened / safeTotal >= 0.35) {
    flags.push("scoutClear");
  }
  return flags;
}

/**
 * Density nudge from board outcome (reuses thin-sweep scaler semantics).
 * won → cool-down · hazard → heat · partial open → slight cool · else unchanged.
 */
export function densityAfterBoard(baseDensity: number, board: MsBoard): number {
  let mark: CellMark = "none";
  if (board.status === "won") mark = "cleared";
  else if (board.hitMine) mark = "hazard";
  else if (countOpenSafe(board) > hqCellCount(board.size)) mark = "cleared";
  // Partial clear uses a gentler cool-down than full scoutClear:
  const d = densityAfterSweep(baseDensity, mark);
  if (board.status === "won" || board.hitMine || mark === "none") return d;
  // Soft partial: halfway between base and cleared nudge
  const cleared = densityAfterSweep(baseDensity, "cleared");
  return Number(((baseDensity + cleared) / 2).toFixed(3));
}

/** Merge route-base intel with board-derived tokens. */
export function mergeBoardIntel(
  base: readonly string[],
  board: MsBoard,
): string[] {
  // mergeIntelFlags expects a CellMark; fold board tokens manually with same dedupe.
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
  if (cell.flagged && !cell.open) return "⚑";
  if (!cell.open) return "";
  if (cell.mine) return "✕";
  if (cell.isHq && cell.adjacent === 0) return "HQ";
  if (cell.adjacent === 0) return "";
  return String(cell.adjacent);
}

