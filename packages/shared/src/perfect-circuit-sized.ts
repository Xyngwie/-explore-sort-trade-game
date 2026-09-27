/**
 * Sized Perfect Circuit boards (generate-from-solution) for any N×N / cols×rows.
 *
 * A seeded random loop is built first (boundary of a grown, hole-free cell
 * region that stays one simple cycle), then every cell gets the digit =
 * number of loop edges around it. The generating loop therefore always
 * satisfies every digit and is a single closed loop → a Perfect solution
 * is guaranteed to exist (it need not be unique).
 *
 * Clues are regenerated deterministically from `puzzleId` + size, so restore
 * play and trade hub scoring agree without storing clues.
 */
import type { EdgeMark } from "./circuit-board";
import {
  circuitCellEdgeIndices,
  isCircuitSingleLoopClosed,
} from "./circuit-effect";

/** puzzleId prefix for sized true boards: `perfect-true-{cols}x{rows}-{hash}`. */
export const SIZED_TRUE_PUZZLE_PREFIX = "perfect-true-";

const SIZED_TRUE_ID_RE = /^perfect-true-(\d+)x(\d+)-([0-9a-z]+)$/;

/** Smallest / largest board side supported by the sized true generator. */
export const SIZED_TRUE_MIN_SIDE = 2;
export const SIZED_TRUE_MAX_SIDE = 16;

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function prng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function sideOk(n: number): boolean {
  return (
    Number.isInteger(n) && n >= SIZED_TRUE_MIN_SIDE && n <= SIZED_TRUE_MAX_SIDE
  );
}

/** Build the stable puzzleId for a sized true board (≤ 64 chars, no `|`). */
export function buildSizedTruePuzzleId(
  seed: string,
  cols: number,
  rows: number,
): string {
  return `${SIZED_TRUE_PUZZLE_PREFIX}${cols}x${rows}-${fnv1a(
    `${seed}:perfect-true`,
  ).toString(36)}`;
}

/** Parse a sized true puzzleId → size + numeric seed, or null. */
export function parseSizedTruePuzzleId(
  puzzleId: string | null | undefined,
): { cols: number; rows: number; seed: number } | null {
  if (puzzleId == null) return null;
  const m = SIZED_TRUE_ID_RE.exec(puzzleId.trim());
  if (!m) return null;
  const cols = Number(m[1]);
  const rows = Number(m[2]);
  if (!sideOk(cols) || !sideOk(rows)) return null;
  const seed = parseInt(m[3]!, 36);
  if (!Number.isFinite(seed)) return null;
  return { cols, rows, seed: seed >>> 0 };
}

export function isSizedTruePuzzleId(puzzleId: string | null | undefined): boolean {
  return parseSizedTruePuzzleId(puzzleId) != null;
}

function marksForRegion(
  inRegion: readonly boolean[],
  cols: number,
  rows: number,
  edges: number,
): EdgeMark[] {
  const marks: EdgeMark[] = Array.from({ length: edges }, () => 0 as EdgeMark);
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < cols && y < rows && inRegion[y * cols + x] === true;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!inside(x, y)) continue;
      const [t, r, b, l] = circuitCellEdgeIndices(cols, rows, x, y);
      if (!inside(x, y - 1)) marks[t] = 1;
      if (!inside(x + 1, y)) marks[r] = 1;
      if (!inside(x, y + 1)) marks[b] = 1;
      if (!inside(x - 1, y)) marks[l] = 1;
    }
  }
  return marks;
}

/**
 * Deterministic solution loop for a sized true board.
 * Grows a cell region from a random start; a cell is accepted only if the
 * region boundary stays exactly one simple closed loop (no holes, no
 * diagonal pinch). Target size is 35–60% of the cells.
 */
export function buildSizedTrueSolutionMarks(
  seed: number,
  cols: number,
  rows: number,
): EdgeMark[] {
  const edges = (rows + 1) * cols + rows * (cols + 1);
  const rnd = prng(seed ^ 0x9e3779b9);
  const total = cols * rows;
  const inRegion: boolean[] = Array.from({ length: total }, () => false);
  const start = Math.floor(rnd() * total);
  inRegion[start] = true;
  let size = 1;
  const target = Math.max(
    1,
    Math.min(total - 1, Math.round(total * (0.35 + rnd() * 0.25))),
  );
  while (size < target) {
    const frontier: number[] = [];
    for (let i = 0; i < total; i++) {
      if (inRegion[i]) continue;
      const x = i % cols;
      const y = Math.floor(i / cols);
      if (
        (x > 0 && inRegion[i - 1]) ||
        (x < cols - 1 && inRegion[i + 1]) ||
        (y > 0 && inRegion[i - cols]) ||
        (y < rows - 1 && inRegion[i + cols])
      ) {
        frontier.push(i);
      }
    }
    // Fisher–Yates with the seeded stream → deterministic try order.
    for (let i = frontier.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = frontier[i]!;
      frontier[i] = frontier[j]!;
      frontier[j] = tmp;
    }
    let grew = false;
    for (const cell of frontier) {
      inRegion[cell] = true;
      const next = marksForRegion(inRegion, cols, rows, edges);
      if (isCircuitSingleLoopClosed(next, cols, rows)) {
        size++;
        grew = true;
        break;
      }
      inRegion[cell] = false;
    }
    if (!grew) break;
  }
  return marksForRegion(inRegion, cols, rows, edges);
}

/** Full clue grid (every cell) derived from the solution loop. */
export function sizedTrueCluesFromMarks(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): (number | null)[][] {
  return Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => {
      let n = 0;
      for (const i of circuitCellEdgeIndices(cols, rows, x, y)) {
        if (marks[i] === 1) n++;
      }
      return n as number | null;
    }),
  );
}

/**
 * Resolve clues (and the known solution) for a sized true puzzleId.
 * Size comes from the id; returns null for non-sized ids.
 */
export function resolveSizedTruePuzzle(puzzleId: string | null | undefined): {
  cols: number;
  rows: number;
  puzzleId: string;
  clues: (number | null)[][];
  solution: EdgeMark[];
} | null {
  const parsed = parseSizedTruePuzzleId(puzzleId);
  if (!parsed) return null;
  const { cols, rows, seed } = parsed;
  const solution = buildSizedTrueSolutionMarks(seed, cols, rows);
  return {
    cols,
    rows,
    puzzleId: puzzleId!.trim(),
    clues: sizedTrueCluesFromMarks(solution, cols, rows),
    solution,
  };
}
