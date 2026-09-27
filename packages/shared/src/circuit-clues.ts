/**
 * Deterministic Restore circuit clues.
 * v3 majority boards are generated from one closed-loop substrate, then 2–3
 * clue values are mutated and ~50% of clues are masked. Legacy puzzle ids keep
 * the old hazard generator so already-issued boards remain compatible.
 */
import { decodeEdgeState, edgeCount, type CircuitBoardState } from "./circuit-board";
import { VERIFY_TRUE_PUZZLE_ID, resolveTrueBoardClues } from "./perfect-circuit-seed";
import { generateSlitherlinkBoard, type SlitherlinkBoardData } from "./slitherlink-generator";
import { computeCircuitEffectValue, type CircuitClueGrid, type CircuitEffectBreakdown } from "./circuit-effect";

export type CircuitHazardKind = "none" | "contradiction" | "overdigit" | "dense_noise";
export const FLAWED_HAZARD_WEIGHTS: Readonly<Record<Exclude<CircuitHazardKind, "none">, number>> = {
  contradiction: 0.45,
  overdigit: 0.3,
  dense_noise: 0.25,
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

export { generateSlitherlinkBoard } from "./slitherlink-generator";
export type { SlitherlinkBoardData } from "./slitherlink-generator";

export const SLITHERLINK_V3_PREFIX = "slitherlink-v3-";
function v3PuzzleId(seed: string, cols: number, rows: number): string {
  return `${SLITHERLINK_V3_PREFIX}${cols}x${rows}-${hashSeed(seed).toString(36)}`;
}
function parseV3PuzzleId(puzzleId: string | null | undefined): { cols: number; rows: number } | null {
  if (!puzzleId) return null;
  const m = /^slitherlink-v3-(\d+)x(\d+)-[0-9a-z]+$/.exec(puzzleId.trim());
  if (!m) return null;
  const cols = Number(m[1]);
  const rows = Number(m[2]);
  return Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0 ? { cols, rows } : null;
}

function legacyBlank(cols: number, rows: number): (number | null)[][] {
  return Array.from({ length: rows }, () => Array<number | null>(cols).fill(null));
}
function legacyContradiction(clues: (number | null)[][], cols: number, rows: number, rnd: () => number): void {
  if (cols < 2 || rows < 2) {
    if (cols >= 1 && rows >= 1) {
      clues[0]![0] = 3;
      if (cols > 1) clues[0]![1] = 0;
      else if (rows > 1) clues[1]![0] = 0;
    }
    return;
  }
  const ox = Math.floor(rnd() * (cols - 1));
  const oy = Math.floor(rnd() * (rows - 1));
  clues[oy]![ox] = 3;
  clues[oy]![ox + 1] = 3;
  clues[oy + 1]![ox] = 3;
  clues[oy + 1]![ox + 1] = 3;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (clues[y]![x] != null) continue;
    if (rnd() < 0.2) clues[y]![x] = 1 + Math.floor(rnd() * 3);
  }
}
function legacyOverdigit(clues: (number | null)[][], cols: number, rows: number, rnd: () => number): void {
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const r = rnd();
    if (r < 0.72) clues[y]![x] = 2 + Math.floor(rnd() * 2);
    else if (r < 0.88) clues[y]![x] = Math.floor(rnd() * 2);
    else clues[y]![x] = null;
  }
}
function legacyDense(clues: (number | null)[][], cols: number, rows: number, rnd: () => number): void {
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (rnd() < 0.35) clues[y]![x] = null;
    else clues[y]![x] = Math.floor(rnd() * 4);
  }
}
function legacyGenerate(puzzleSeed: string, cols: number, rows: number): (number | null)[][] {
  const rnd = mulberry32(hashSeed(`${puzzleSeed}:flawed`));
  const hazardRnd = mulberry32(hashSeed(`${puzzleSeed}:hazard`));
  const r = hazardRnd();
  const hazard = r < 0.45 ? "contradiction" : r < 0.75 ? "overdigit" : "dense_noise";
  const clues = legacyBlank(cols, rows);
  if (hazard === "contradiction") legacyContradiction(clues, cols, rows, rnd);
  else if (hazard === "overdigit") legacyOverdigit(clues, cols, rows, rnd);
  else legacyDense(clues, cols, rows, rnd);
  return clues;
}

/** New majority path. */
export function generateFlawedClues(
  puzzleSeed: string,
  cols: number,
  rows: number,
  rng?: () => number,
  forceHazard?: Exclude<CircuitHazardKind, "none">,
): { clues: (number | null)[][]; hazard: Exclude<CircuitHazardKind, "none"> } {
  void rng;
  void forceHazard;
  return { clues: generateSlitherlinkBoard(cols, rows, puzzleSeed).cells, hazard: "contradiction" };
}

/** Direct v3 generator for callers that need the solution edge set. */
export function generateCircuitClueBoard(
  seed: string,
  cols: number,
  rows: number,
  opts?: { forceSolvable?: boolean },
): { puzzleId: string; clues: (number | null)[][]; isSolvable: boolean; solutionEdges: SlitherlinkBoardData["solutionEdges"] } {
  const board = generateSlitherlinkBoard(cols, rows, seed, opts);
  return { puzzleId: v3PuzzleId(seed, cols, rows), clues: board.cells, isSolvable: board.isSolvable, solutionEdges: board.solutionEdges };
}

export function resolveCluesForCircuitBoard(
  board: Pick<CircuitBoardState, "cols" | "rows" | "puzzleId">,
): CircuitClueGrid {
  const fixed = resolveTrueBoardClues(board.puzzleId);
  if (fixed && (fixed.puzzleId === VERIFY_TRUE_PUZZLE_ID || (fixed.cols === board.cols && fixed.rows === board.rows))) {
    return fixed.clues.map((row) => [...row]);
  }
  const v3 = parseV3PuzzleId(board.puzzleId);
  if (v3 && v3.cols === board.cols && v3.rows === board.rows) {
    // v3 ids are self-describing; the actual seed is encoded in the id only
    // for routing. Normal Restore boards still use puzzleSeed directly.
    return generateSlitherlinkBoard(board.cols, board.rows, board.puzzleId!).cells;
  }
  return legacyGenerate(board.puzzleId?.trim() || `board-${board.cols}x${board.rows}`, board.cols, board.rows);
}

export function computeCircuitEffectForBoard(board: CircuitBoardState, opts?: { perfect?: boolean | null }): CircuitEffectBreakdown {
  const clues = resolveCluesForCircuitBoard(board);
  const marks = decodeEdgeState(board.edgeState, edgeCount(board.cols, board.rows));
  return computeCircuitEffectValue({ clues, marks, cols: board.cols, rows: board.rows, perfect: opts?.perfect ?? board.perfect, outcome: board.outcome, locked: board.locked });
}
