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
 *
 * Two id versions:
 * - v1 `perfect-true-{c}x{r}-{hash}` (#150): every cell shows its digit; the
 *   loop may sit anywhere. Kept byte-for-byte so already-issued ids regenerate
 *   the same board.
 * - v2 `perfect-true-v2-{c}x{r}-{hash}` (current injection): the loop touches
 *   all 4 outer sides, the full-clue board is checked to be uniquely solvable,
 *   then clues are hidden (null) one by one in seeded order while the puzzle
 *   stays uniquely solvable, up to {@link sizedTrueHiddenFraction}(N).
 *
 * Sides are 2..{@link RESTORE_MAX_SIDE} (20). Hiding is bounded by step
 * (DFS node) budgets only — never wall-clock — so a puzzleId always rebuilds
 * the same board.
 */
import { RESTORE_MAX_SIDE, type EdgeMark } from "./circuit-board";
import {
  circuitCellEdgeIndices,
  isCircuitSingleLoopClosed,
} from "./circuit-effect";
import {
  countCircuitLoopSolutions,
  isCircuitUniquelySolvable,
} from "./circuit-solver";

/** puzzleId prefix for sized true boards: `perfect-true-{cols}x{rows}-{hash}`. */
export const SIZED_TRUE_PUZZLE_PREFIX = "perfect-true-";

const SIZED_TRUE_ID_RE = /^perfect-true-(\d+)x(\d+)-([0-9a-z]+)$/;

/** puzzleId prefix for v2 sized true boards (4-side loop + hidden clues). */
export const SIZED_TRUE_V2_PUZZLE_PREFIX = "perfect-true-v2-";

const SIZED_TRUE_V2_ID_RE = /^perfect-true-v2-(\d+)x(\d+)-([0-9a-z]+)$/;

/**
 * Smallest / largest board side supported by the sized true generator.
 * The max is Restore's max side ({@link RESTORE_MAX_SIDE} = 20).
 */
export const SIZED_TRUE_MIN_SIDE = 2;
export const SIZED_TRUE_MAX_SIDE = RESTORE_MAX_SIDE;

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

/** Build the stable puzzleId for a v2 sized true board (≤ 64 chars, no `|`). */
export function buildSizedTruePuzzleIdV2(
  seed: string,
  cols: number,
  rows: number,
): string {
  return `${SIZED_TRUE_V2_PUZZLE_PREFIX}${cols}x${rows}-${fnv1a(
    `${seed}:perfect-true-v2`,
  ).toString(36)}`;
}

/** Parse a sized true puzzleId (v1 or v2) → version + size + numeric seed, or null. */
export function parseSizedTruePuzzleId(
  puzzleId: string | null | undefined,
): { version: 1 | 2; cols: number; rows: number; seed: number } | null {
  if (puzzleId == null) return null;
  const t = puzzleId.trim();
  const m2 = SIZED_TRUE_V2_ID_RE.exec(t);
  const m = m2 ?? SIZED_TRUE_ID_RE.exec(t);
  if (!m) return null;
  const cols = Number(m[1]);
  const rows = Number(m[2]);
  if (!sideOk(cols) || !sideOk(rows)) return null;
  const seed = parseInt(m[3]!, 36);
  if (!Number.isFinite(seed)) return null;
  return { version: m2 ? 2 : 1, cols, rows, seed: seed >>> 0 };
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
 * Target hidden-clue fraction for v2 boards of side N = max(cols, rows):
 * `min(0.5, 0.1 + 0.05 × N)` → 3:25%, 4:30%, 5:35%, 6:40%, 7:45%, ≥8: 50%.
 * Hiding stops earlier if no further clue can be proven hideable within the
 * step budgets while the puzzle stays uniquely solvable.
 * (The 50% cap keeps 20×20 fast: the last 10% toward 60% cost most of the
 * search on big boards.)
 */
export function sizedTrueHiddenFraction(side: number): number {
  const n = Math.max(0, Math.floor(side));
  return Math.min(0.5, 0.1 + 0.05 * n);
}

/** True when the loop has at least one edge on each of the 4 outer sides. */
export function loopTouchesAllOuterSides(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): boolean {
  let top = false;
  let bottom = false;
  let left = false;
  let right = false;
  for (let x = 0; x < cols; x++) {
    if (marks[circuitCellEdgeIndices(cols, rows, x, 0)[0]] === 1) top = true;
    if (marks[circuitCellEdgeIndices(cols, rows, x, rows - 1)[2]] === 1) bottom = true;
  }
  for (let y = 0; y < rows; y++) {
    if (marks[circuitCellEdgeIndices(cols, rows, 0, y)[3]] === 1) left = true;
    if (marks[circuitCellEdgeIndices(cols, rows, cols - 1, y)[1]] === 1) right = true;
  }
  return top && bottom && left && right;
}

/**
 * v2 solution loop: grow a hole-free region (boundary stays one simple loop)
 * to 35–60% of the cells, then keep growing toward any outer side the region
 * does not touch yet (frontier cells nearest an untouched side first) until
 * the loop has an edge on all 4 sides. Returns null if stuck (caller retries).
 */
function buildSizedTrueSolutionMarksV2Attempt(
  seed: number,
  attempt: number,
  cols: number,
  rows: number,
): EdgeMark[] | null {
  const edges = (rows + 1) * cols + rows * (cols + 1);
  const rnd = prng((seed ^ 0x51ed270b ^ Math.imul(attempt + 1, 0x85ebca6b)) >>> 0);
  const total = cols * rows;
  const inRegion: boolean[] = Array.from({ length: total }, () => false);
  inRegion[Math.floor(rnd() * total)] = true;
  let size = 1;
  const target = Math.max(
    1,
    Math.min(total - 1, Math.round(total * (0.35 + rnd() * 0.25))),
  );
  const sides = () => {
    let top = false;
    let bottom = false;
    let left = false;
    let right = false;
    for (let i = 0; i < total; i++) {
      if (!inRegion[i]) continue;
      const x = i % cols;
      const y = Math.floor(i / cols);
      if (y === 0) top = true;
      if (y === rows - 1) bottom = true;
      if (x === 0) left = true;
      if (x === cols - 1) right = true;
    }
    return { top, bottom, left, right };
  };
  for (;;) {
    const sd = sides();
    const allSides = sd.top && sd.bottom && sd.left && sd.right;
    if (size >= target && allSides) break;
    if (size >= total) break;
    const frontier: { cell: number; key: number }[] = [];
    for (let i = 0; i < total; i++) {
      if (inRegion[i]) continue;
      const x = i % cols;
      const y = Math.floor(i / cols);
      if (
        !(
          (x > 0 && inRegion[i - 1]) ||
          (x < cols - 1 && inRegion[i + 1]) ||
          (y > 0 && inRegion[i - cols]) ||
          (y < rows - 1 && inRegion[i + cols])
        )
      ) {
        continue;
      }
      let dist = 0;
      if (size >= target) {
        // Past the size target: head for the nearest untouched side.
        dist = Number.POSITIVE_INFINITY;
        if (!sd.top) dist = Math.min(dist, y);
        if (!sd.bottom) dist = Math.min(dist, rows - 1 - y);
        if (!sd.left) dist = Math.min(dist, x);
        if (!sd.right) dist = Math.min(dist, cols - 1 - x);
      }
      frontier.push({ cell: i, key: dist + rnd() * 0.5 });
    }
    frontier.sort((a, b) => a.key - b.key);
    let grew = false;
    for (const { cell } of frontier) {
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
  const marks = marksForRegion(inRegion, cols, rows, edges);
  if (!isCircuitSingleLoopClosed(marks, cols, rows)) return null;
  if (!loopTouchesAllOuterSides(marks, cols, rows)) return null;
  return marks;
}

type SizedTruePuzzle = {
  version: 1 | 2;
  cols: number;
  rows: number;
  puzzleId: string;
  /** Displayed clues; `null` = hidden (v2) — hidden cells never score. */
  clues: (number | null)[][];
  solution: EdgeMark[];
  /** Number of hidden clue cells (0 on v1). */
  hiddenCount: number;
};

const V2_MAX_ATTEMPTS = 12;
/** DFS node budget per uniqueness check while hiding clues. */
export const SIZED_TRUE_HIDE_NODE_BUDGET = 5_000;
/**
 * Total DFS node budget for the whole hide phase of one board. When spent,
 * hiding stops (remaining clues stay shown). Step-based → deterministic.
 * ~10× the average a 20×20 board needs.
 */
export const SIZED_TRUE_HIDE_TOTAL_NODE_BUDGET = 150_000;
const sizedCache = new Map<string, SizedTruePuzzle>();
const SIZED_CACHE_MAX = 256;

function cloneSized(p: SizedTruePuzzle): SizedTruePuzzle {
  return {
    ...p,
    clues: p.clues.map((row) => [...row]),
    solution: [...p.solution],
  };
}

function buildV2(seed: number, cols: number, rows: number): {
  clues: (number | null)[][];
  solution: EdgeMark[];
  hiddenCount: number;
} {
  const edges = (rows + 1) * cols + rows * (cols + 1);
  let solution: EdgeMark[] | null = null;
  let full: (number | null)[][] | null = null;
  // 2×2: the only loops touching all 4 sides are the 4 L-trominoes (their
  // full clue grids are pairwise ambiguous → never unique) and the whole
  // perimeter, which growth never reaches. Every attempt would fail, so go
  // straight to the perimeter fallback (same result, no wasted work).
  const attempts = cols === 2 && rows === 2 ? 0 : V2_MAX_ATTEMPTS;
  for (let a = 0; a < attempts && solution == null; a++) {
    const m = buildSizedTrueSolutionMarksV2Attempt(seed, a, cols, rows);
    if (!m) continue;
    const c = sizedTrueCluesFromMarks(m, cols, rows);
    if (!isCircuitUniquelySolvable(c, cols, rows)) continue;
    solution = m;
    full = c;
  }
  if (solution == null || full == null) {
    // Fallback: the whole-board perimeter (touches all sides; unique).
    solution = marksForRegion(
      Array.from({ length: cols * rows }, () => true),
      cols,
      rows,
      edges,
    );
    full = sizedTrueCluesFromMarks(solution, cols, rows);
  }
  // Hide clues in seeded order while the puzzle stays uniquely solvable.
  const clues = full.map((row) => [...row]);
  const total = cols * rows;
  const target = Math.floor(total * sizedTrueHiddenFraction(Math.max(cols, rows)));
  const order = Array.from({ length: total }, (_, i) => i);
  const rnd = prng((seed ^ 0x2545f491) >>> 0);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  }
  let hidden = 0;
  let spent = 0;
  for (const cell of order) {
    if (hidden >= target) break;
    const left = SIZED_TRUE_HIDE_TOTAL_NODE_BUDGET - spent;
    if (left <= 0) break;
    const x = cell % cols;
    const y = Math.floor(cell / cols);
    const keep = clues[y]![x]!;
    clues[y]![x] = null;
    // Per-check and total node budgets keep big boards fast; an exhausted
    // search counts as "not proven unique" → the clue stays (deterministic,
    // not time-based).
    const r = countCircuitLoopSolutions(clues, cols, rows, {
      limit: 2,
      nodeBudget: Math.min(SIZED_TRUE_HIDE_NODE_BUDGET, left),
    });
    spent += r.nodes;
    if (!r.aborted && r.count === 1) hidden++;
    else clues[y]![x] = keep;
  }
  return { clues, solution, hiddenCount: hidden };
}

/** Test hook: drop cached boards so regeneration is exercised from scratch. */
export function clearSizedTruePuzzleCache(): void {
  sizedCache.clear();
}

/**
 * Resolve clues (and the known solution) for a sized true puzzleId (v1 or v2).
 * Size comes from the id; returns null for non-sized ids. Deterministic and
 * cached per puzzleId (returns a fresh copy).
 */
export function resolveSizedTruePuzzle(
  puzzleId: string | null | undefined,
): SizedTruePuzzle | null {
  const parsed = parseSizedTruePuzzleId(puzzleId);
  if (!parsed) return null;
  const id = puzzleId!.trim();
  const hit = sizedCache.get(id);
  if (hit) return cloneSized(hit);
  const { version, cols, rows, seed } = parsed;
  let out: SizedTruePuzzle;
  if (version === 1) {
    const solution = buildSizedTrueSolutionMarks(seed, cols, rows);
    out = {
      version,
      cols,
      rows,
      puzzleId: id,
      clues: sizedTrueCluesFromMarks(solution, cols, rows),
      solution,
      hiddenCount: 0,
    };
  } else {
    const v2 = buildV2(seed, cols, rows);
    out = { version, cols, rows, puzzleId: id, ...v2 };
  }
  if (sizedCache.size >= SIZED_CACHE_MAX) sizedCache.clear();
  sizedCache.set(id, out);
  return cloneSized(out);
}
