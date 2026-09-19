/**
 * Thin Slitherlink-ish helpers for Module 5 stub.
 * Uses @estg/shared CircuitBoardState encode/decode; rules are provisional.
 */
import {
  createEmptyCircuitBoard,
  decodeEdgeState,
  encodeEdgeState,
  edgeCount,
  type CircuitBoardState,
  type CircuitOutcome,
  type EdgeMark,
} from "@estg/shared";

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

export type ClueGrid = ReadonlyArray<ReadonlyArray<number | null>>;

export type RestorePuzzle = {
  cols: number;
  rows: number;
  puzzleId: string;
  /** Cell clues; null = no digit. */
  clues: ClueGrid;
};

/** Horizontal edge index: row of dots `y` (0..rows), col `x` (0..cols-1). */
export function hEdgeIndex(cols: number, rows: number, x: number, y: number): number {
  void rows;
  return y * cols + x;
}

/** Vertical edge index: col of dots `x` (0..cols), row `y` (0..rows-1). */
export function vEdgeIndex(cols: number, rows: number, x: number, y: number): number {
  return cols * (rows + 1) + y * (cols + 1) + x;
}

export function cellEdgeIndices(
  cols: number,
  rows: number,
  cx: number,
  cy: number,
): [number, number, number, number] {
  // top, right, bottom, left
  return [
    hEdgeIndex(cols, rows, cx, cy),
    vEdgeIndex(cols, rows, cx + 1, cy),
    hEdgeIndex(cols, rows, cx, cy + 1),
    vEdgeIndex(cols, rows, cx, cy),
  ];
}

export function countLineEdgesAroundCell(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
  cx: number,
  cy: number,
): number {
  let n = 0;
  for (const i of cellEdgeIndices(cols, rows, cx, cy)) {
    if (marks[i] === 1) n++;
  }
  return n;
}

/**
 * Generate a small clue grid from puzzleSeed.
 * Clues are decorative/provisional (not solved from a hidden solution).
 */
export function generatePuzzle(
  puzzleSeed: string,
  cols = 6,
  rows = 6,
): RestorePuzzle {
  const rnd = mulberry32(hashSeed(puzzleSeed));
  const clues: (number | null)[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: (number | null)[] = [];
    for (let x = 0; x < cols; x++) {
      const r = rnd();
      if (r < 0.45) row.push(null);
      else row.push(Math.floor(rnd() * 4)); // 0..3
    }
    clues.push(row);
  }
  return { cols, rows, puzzleId: puzzleSeed, clues };
}

export type DigitStats = {
  clueCount: number;
  satisfied: number;
  /** 0..1; 1 when no clues. */
  rate: number;
};


/**
 * Whether a digit cell is 「activated」(satisfied by current line edges).
 * Returns null when the cell has no clue.
 */
export function isCellDigitActivated(
  clues: ClueGrid,
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
  cx: number,
  cy: number,
): boolean | null {
  const c = clues[cy]?.[cx];
  if (c == null) return null;
  return countLineEdgesAroundCell(marks, cols, rows, cx, cy) === c;
}

export function digitSatisfaction(
  clues: ClueGrid,
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): DigitStats {
  let clueCount = 0;
  let satisfied = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = clues[y]![x]!;
      if (c == null) continue;
      clueCount++;
      if (countLineEdgesAroundCell(marks, cols, rows, x, y) === c) {
        satisfied++;
      }
    }
  }
  return {
    clueCount,
    satisfied,
    rate: clueCount === 0 ? 1 : satisfied / clueCount,
  };
}

/**
 * Provisional loop-closed check: line edges form exactly one cycle
 * (every used vertex degree 2; single component).
 */
export function isLoopClosed(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): boolean {
  const vw = cols + 1;
  const vh = rows + 1;
  const vCount = vw * vh;
  const adj: number[][] = Array.from({ length: vCount }, () => []);

  const vid = (x: number, y: number) => y * vw + x;

  // horizontal
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = hEdgeIndex(cols, rows, x, y);
      if (marks[i] !== 1) continue;
      const a = vid(x, y);
      const b = vid(x + 1, y);
      adj[a]!.push(b);
      adj[b]!.push(a);
    }
  }
  // vertical
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x <= cols; x++) {
      const i = vEdgeIndex(cols, rows, x, y);
      if (marks[i] !== 1) continue;
      const a = vid(x, y);
      const b = vid(x, y + 1);
      adj[a]!.push(b);
      adj[b]!.push(a);
    }
  }

  let start = -1;
  let edgeVerts = 0;
  for (let i = 0; i < vCount; i++) {
    const d = adj[i]!.length;
    if (d === 0) continue;
    if (d !== 2) return false;
    edgeVerts++;
    if (start < 0) start = i;
  }
  if (edgeVerts < 4) return false; // need at least a 2x2 loop

  // Walk cycle; must cover all edge vertices and return.
  const seen = new Set<number>();
  let prev = -1;
  let cur = start;
  for (;;) {
    seen.add(cur);
    const nbrs = adj[cur]!;
    const next = nbrs[0] === prev ? nbrs[1]! : nbrs[0]!;
    prev = cur;
    cur = next;
    if (cur === start) break;
    if (seen.has(cur)) return false;
  }
  return seen.size === edgeVerts;
}

/** Cycle EdgeMark: 0 → 1 → 2 → 0. */
export function cycleEdgeMark(m: EdgeMark): EdgeMark {
  return ((m + 1) % 3) as EdgeMark;
}

/**
 * Provisional outcome from play metrics (no timer).
 * - fully_awakened: closed loop + all digits ok
 * - bypass: meaningful partial (loop or ≥75% digits)
 * - offline: otherwise
 */
export function deriveStubOutcome(
  loopClosed: boolean,
  digitRate: number,
  lineCount: number,
): CircuitOutcome {
  if (lineCount === 0) return "offline";
  if (loopClosed && digitRate >= 1) return "fully_awakened";
  if (loopClosed || digitRate >= 0.75) return "bypass";
  return "offline";
}

export function lineEdgeCount(marks: readonly EdgeMark[]): number {
  let n = 0;
  for (const m of marks) if (m === 1) n++;
  return n;
}

export function boardFromMarks(
  cols: number,
  rows: number,
  marks: readonly EdgeMark[],
  puzzleId: string,
  outcome?: CircuitOutcome,
): CircuitBoardState {
  const state: CircuitBoardState = {
    v: 1,
    cols,
    rows,
    edgeState: encodeEdgeState([...marks]),
    puzzleId,
  };
  if (outcome != null) state.outcome = outcome;
  return state;
}

export function freshMarks(cols: number, rows: number): EdgeMark[] {
  const board = createEmptyCircuitBoard(cols, rows);
  return decodeEdgeState(board.edgeState, edgeCount(cols, rows));
}

export const STORAGE_PREFIX = "estg.restore.edges.v1:";

export function loadMarksFromStorage(
  puzzleId: string,
  expectedEdges: number,
): EdgeMark[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + puzzleId);
    if (raw == null || raw === "") return null;
    const marks = decodeEdgeState(raw, expectedEdges);
    if (marks.length !== expectedEdges) return null;
    return marks;
  } catch {
    return null;
  }
}

export function saveMarksToStorage(puzzleId: string, marks: readonly EdgeMark[]): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + puzzleId, encodeEdgeState([...marks]));
  } catch {
    /* ignore quota / private mode */
  }
}

export function outcomeLabel(o: CircuitOutcome): string {
  if (o === "fully_awakened") return "Fully Awakened";
  if (o === "bypass") return "Bypass";
  return "Offline";
}
