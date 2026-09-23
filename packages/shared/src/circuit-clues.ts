/**
 * Deterministic flawed / hazardous clue grids for Module 5.
 * Shared so restore play and trade hub scoring regenerate the same digits.
 */

import {
  decodeEdgeState,
  edgeCount,
  type CircuitBoardState,
} from "./circuit-board";
import { resolveVerifyTrueClues } from "./perfect-circuit-seed";
import {
  computeCircuitEffectValue,
  type CircuitClueGrid,
  type CircuitEffectBreakdown,
} from "./circuit-effect";

export type CircuitHazardKind =
  | "none"
  | "contradiction"
  | "overdigit"
  | "dense_noise";

export const FLAWED_HAZARD_WEIGHTS: Readonly<
  Record<Exclude<CircuitHazardKind, "none">, number>
> = {
  contradiction: 0.45,
  overdigit: 0.3,
  dense_noise: 0.25,
};

/** Simple seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a short puzzleSeed string → uint32. */
export function hashSeed(puzzleSeed: string): number {
  let h = 2166136261;
  for (let i = 0; i < puzzleSeed.length; i++) {
    h ^= puzzleSeed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function blankClues(cols: number, rows: number): (number | null)[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null as number | null),
  );
}

function pickHazard(
  rnd: () => number,
  force?: Exclude<CircuitHazardKind, "none">,
): Exclude<CircuitHazardKind, "none"> {
  if (force) return force;
  const r = rnd();
  const w = FLAWED_HAZARD_WEIGHTS;
  if (r < w.contradiction) return "contradiction";
  if (r < w.contradiction + w.overdigit) return "overdigit";
  return "dense_noise";
}

function applyContradictionHazard(
  clues: (number | null)[][],
  cols: number,
  rows: number,
  rnd: () => number,
): void {
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
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (clues[y]![x] != null) continue;
      if (rnd() < 0.2) clues[y]![x] = 1 + Math.floor(rnd() * 3);
    }
  }
}

function applyOverdigitHazard(
  clues: (number | null)[][],
  cols: number,
  rows: number,
  rnd: () => number,
): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const r = rnd();
      if (r < 0.72) {
        clues[y]![x] = 2 + Math.floor(rnd() * 2);
      } else if (r < 0.88) {
        clues[y]![x] = Math.floor(rnd() * 2);
      } else {
        clues[y]![x] = null;
      }
    }
  }
}

function applyDenseNoiseHazard(
  clues: (number | null)[][],
  cols: number,
  rows: number,
  rnd: () => number,
): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const r = rnd();
      if (r < 0.35) clues[y]![x] = null;
      else clues[y]![x] = Math.floor(rnd() * 4);
    }
  }
}

/**
 * Intentionally imperfect / hazardous clue fill (majority path).
 * Must stay seed-stable — restore + trade both regenerate from puzzleId.
 */
export function generateFlawedClues(
  puzzleSeed: string,
  cols: number,
  rows: number,
  rng?: () => number,
  forceHazard?: Exclude<CircuitHazardKind, "none">,
): {
  clues: (number | null)[][];
  hazard: Exclude<CircuitHazardKind, "none">;
} {
  const rnd = rng ?? mulberry32(hashSeed(`${puzzleSeed}:flawed`));
  const hazard = pickHazard(
    rng ?? mulberry32(hashSeed(`${puzzleSeed}:hazard`)),
    forceHazard,
  );
  const clues = blankClues(cols, rows);
  if (hazard === "contradiction") {
    applyContradictionHazard(clues, cols, rows, rnd);
  } else if (hazard === "overdigit") {
    applyOverdigitHazard(clues, cols, rows, rnd);
  } else {
    applyDenseNoiseHazard(clues, cols, rows, rnd);
  }
  return { clues, hazard };
}

/**
 * Resolve clue grid for a stored circuit board (hub / scoring).
 * Verify-true boards use the fixed solvable clues; others regenerate
 * deterministic flawed clues from puzzleId + size.
 */
export function resolveCluesForCircuitBoard(
  board: Pick<CircuitBoardState, "cols" | "rows" | "puzzleId">,
): CircuitClueGrid {
  const fixed = resolveVerifyTrueClues(
    board.puzzleId,
    board.cols,
    board.rows,
  );
  if (fixed) {
    return fixed.clues.map((row) => [...row]);
  }
  const seed =
    (board.puzzleId && board.puzzleId.trim()) ||
    `board-${board.cols}x${board.rows}`;
  return generateFlawedClues(seed, board.cols, board.rows).clues;
}

/**
 * Score a persisted CircuitBoardState by regenerating clues from puzzleId.
 */
export function computeCircuitEffectForBoard(
  board: CircuitBoardState,
  opts?: { perfect?: boolean | null },
): CircuitEffectBreakdown {
  const clues = resolveCluesForCircuitBoard(board);
  const marks = decodeEdgeState(
    board.edgeState,
    edgeCount(board.cols, board.rows),
  );
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
