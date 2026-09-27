/**
 * Deterministic Restore circuit clues.
 *
 * v3 boards share one generated closed-loop substrate. True boards keep the
 * derived digits; junk boards mutate only 2–3 digits and then mask about 50%.
 * Restore and Trade both regenerate from puzzleId, so no clue grid is saved.
 */
import {
  decodeEdgeState,
  edgeCount,
  type CircuitBoardState,
} from "./circuit-board";
import { VERIFY_TRUE_PUZZLE_ID, resolveTrueBoardClues } from "./perfect-circuit-seed";
import {
  generateSlitherlinkBoard,
  type SlitherlinkBoardData,
} from "./slitherlink-generator";
import {
  computeCircuitEffectValue,
  type CircuitClueGrid,
  type CircuitEffectBreakdown,
} from "./circuit-effect";

export type CircuitHazardKind = "none" | "contradiction" | "overdigit" | "dense_noise";
export const FLAWED_HAZARD_WEIGHTS: Readonly<Record<Exclude<CircuitHazardKind, "none">, number>> = {
  contradiction: 1,
  overdigit: 0,
  dense_noise: 0,
};

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(puzzleSeed: string): number {
  let h = 2166136261;
  for (let i = 0; i < puzzleSeed.length; i++) {
    h ^= puzzleSeed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** v3 generator is exported here for Restore/Trade callers and tests. */
export { generateSlitherlinkBoard } from "./slitherlink-generator";
export type { SlitherlinkBoardData } from "./slitherlink-generator";

/** Stable v3 prefix used for newly generated seeded boards. */
export const SLITHERLINK_V3_PREFIX = "slitherlink-v3-";

function v3PuzzleId(seed: string, cols: number, rows: number): string {
  return `${SLITHERLINK_V3_PREFIX}${cols}x${rows}-${hashSeed(seed).toString(36)}`;
}

function parseV3PuzzleId(puzzleId: string | null | undefined): { cols: number; rows: number; seed: string } | null {
  if (!puzzleId) return null;
  const m = /^slitherlink-v3-(\d+)x(\d+)-([0-9a-z]+)$/.exec(puzzleId.trim());
  if (!m) return null;
  const cols = Number(m[1]);
  const rows = Number(m[2]);
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return null;
  return { cols, rows, seed: m[3]! };
}

function v3SeedFromId(id: string, cols: number, rows: number): string {
  return `${id}:${cols}x${rows}`;
}

function generatedV3Clues(seed: string, cols: number, rows: number): (number | null)[][] {
  return generateSlitherlinkBoard(cols, rows, seed).cells;
}

function legacyFlawedClues(
  puzzleSeed: string,
  cols: number,
  rows: number,
  rng?: () => number,
  forceHazard?: Exclude<CircuitHazardKind, "none">,
): { clues: (number | null)[][]; hazard: Exclude<CircuitHazardKind, "none"> } {
  const rnd = rng ?? mulberry32(hashSeed(`${puzzleSeed}:flawed`));
  const clues = Array.from({ length: rows }, () => Array<number | null>(cols).fill(null));
  const hazard = forceHazard ?? "contradiction";
  const count = Math.min(3, Math.max(2, Math.min(cols * rows, Math.floor(rnd() * 2) + 2)));
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * cols);
    const y = Math.floor(rnd() * rows);
    clues[y]![x] = 3;
  }
  return { clues, hazard };
}

/**
 * v3 majority generator. `rng` and `forceHazard` remain accepted for source
 * compatibility; v3's mutation positions come from the board seed itself.
 */
export function generateFlawedClues(
  puzzleSeed: string,
  cols: number,
  rows: number,
  rng?: () => number,
  forceHazard?: Exclude<CircuitHazardKind, "none">,
): { clues: (number | null)[][]; hazard: Exclude<CircuitHazardKind, "none"> } {
  void rng;
  void forceHazard;
  return {
    clues: generatedV3Clues(puzzleSeed, cols, rows),
    hazard: "contradiction",
  };
}

/** Generate a v3 board directly, including its stable puzzle id. */
export function generateCircuitClueBoard(
  seed: string,
  cols: number,
  rows: number,
  opts?: { forceSolvable?: boolean },
): { puzzleId: string; clues: (number | null)[][]; isSolvable: boolean; solutionEdges: SlitherlinkBoardData["solutionEdges"] } {
  const board = generateSlitherlinkBoard(cols, rows, seed, opts);
  return {
    puzzleId: v3PuzzleId(seed, cols, rows),
    clues: board.cells,
    isSolvable: board.isSolvable,
    solutionEdges: board.solutionEdges,
  };
}

/**
 * Resolve a persisted board. Legacy verify/sized-perfect ids retain their
 * existing behavior. New v3 ids regenerate from the same deterministic seed.
 */
export function resolveCluesForCircuitBoard(
  board: Pick<CircuitBoardState, "cols" | "rows" | "puzzleId">,
): CircuitClueGrid {
  const fixed = resolveTrueBoardClues(board.puzzleId);
  if (fixed && (fixed.puzzleId === VERIFY_TRUE_PUZZLE_ID || (fixed.cols === board.cols && fixed.rows === board.rows))) {
    return fixed.clues.map((row) => [...row]);
  }
  const parsed = parseV3PuzzleId(board.puzzleId);
  if (parsed && parsed.cols === board.cols && parsed.rows === board.rows) {
    return generateSlitherlinkBoard(
      v3SeedFromId(board.puzzleId!, board.cols, board.rows),
      board.cols,
      board.rows,
    ).cells;
  }
  // Existing non-v3 ids intentionally use the old deterministic behavior.
  return legacyFlawedClues(
    board.puzzleId?.trim() || `board-${board.cols}x${board.rows}`,
    board.cols,
    board.rows,
  ).clues;
}

export function computeCircuitEffectForBoard(
  board: CircuitBoardState,
  opts?: { perfect?: boolean | null },
): CircuitEffectBreakdown {
  const clues = resolveCluesForCircuitBoard(board);
  const marks = decodeEdgeState(board.edgeState, edgeCount(board.cols, board.rows));
  return computeCircuitEffectValue({
    clues,
    marks,
    cols: board.cols,
    rows: board.rows,
    perfect: opts?.perfect ?? board.perfect,
    outcome: board.outcome,
    locked: board.locked,
  });
}
