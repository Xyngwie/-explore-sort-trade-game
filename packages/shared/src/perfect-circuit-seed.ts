/**
 * Guaranteed solvable Perfect Circuit playtest seed (2×2 Slitherlink).
 * Solution = outer perimeter loop; all cell clues are 2.
 * Used by trade hangar grant buttons + restore fixed-clue lookup.
 */
import {
  encodeEdgeState,
  edgeCount,
  sanitizeEditorName,
  type CircuitBoardState,
  type EdgeMark,
} from "./circuit-board";

/** puzzleId stamped on CircuitBoardState / restore generatePuzzle lookup. */
export const VERIFY_TRUE_PUZZLE_ID = "verify-true-2";

/** Hub circuitId for unsolved solvable grant 「検証用真盤を受領」. */
export const VERIFY_TRUE_CIRCUIT_ID = "verify_true";

/** Hub circuitId for already-locked sample 「検証用・既に完璧」. */
export const VERIFY_PERFECT_CIRCUIT_ID = "verify_perfect";

export const VERIFY_TRUE_COLS = 2;
export const VERIFY_TRUE_ROWS = 2;

/** Default 刻印 on the pre-locked sample when hangar signature unset. */
export const VERIFY_PERFECT_DEFAULT_EDITOR = "検証職人";

/**
 * Cell clues for the verify-true board (all 2s).
 * Spoilers: see VERIFY_TRUE_SOLUTION_HINT / docs.
 */
export const VERIFY_TRUE_CLUES: ReadonlyArray<ReadonlyArray<number | null>> = [
  [2, 2],
  [2, 2],
];

/** Light spoiler for playtesters (outer loop). */
export const VERIFY_TRUE_SOLUTION_HINT =
  "外周を一周（内部の十字辺は線にしない）。各マスの周囲辺数は 2。";

export function isVerifyTruePuzzleId(
  puzzleId: string | null | undefined,
): boolean {
  if (puzzleId == null) return false;
  return puzzleId.trim() === VERIFY_TRUE_PUZZLE_ID;
}

function hEdgeIndex(cols: number, x: number, y: number): number {
  return y * cols + x;
}

function vEdgeIndex(cols: number, rows: number, x: number, y: number): number {
  return cols * (rows + 1) + y * (cols + 1) + x;
}

/**
 * Solution marks: single outer loop on the 2×2 grid (8 line edges).
 * Guarantees digitRate=1 + loopClosed → fully_awakened + perfect lock.
 */
export function buildVerifyTrueSolutionMarks(): EdgeMark[] {
  const cols = VERIFY_TRUE_COLS;
  const rows = VERIFY_TRUE_ROWS;
  const marks: EdgeMark[] = Array.from(
    { length: edgeCount(cols, rows) },
    () => 0 as EdgeMark,
  );
  marks[hEdgeIndex(cols, 0, 0)] = 1;
  marks[hEdgeIndex(cols, 1, 0)] = 1;
  marks[hEdgeIndex(cols, 0, 2)] = 1;
  marks[hEdgeIndex(cols, 1, 2)] = 1;
  marks[vEdgeIndex(cols, rows, 0, 0)] = 1;
  marks[vEdgeIndex(cols, rows, 0, 1)] = 1;
  marks[vEdgeIndex(cols, rows, 2, 0)] = 1;
  marks[vEdgeIndex(cols, rows, 2, 1)] = 1;
  return marks;
}

/** Empty (unsolved) board for solving → lock path. */
export function buildVerifyTrueUnsolvedBoard(): CircuitBoardState {
  const n = edgeCount(VERIFY_TRUE_COLS, VERIFY_TRUE_ROWS);
  const marks = Array.from({ length: n }, () => 0 as EdgeMark);
  return {
    v: 1,
    cols: VERIFY_TRUE_COLS,
    rows: VERIFY_TRUE_ROWS,
    edgeState: encodeEdgeState(marks),
    puzzleId: VERIFY_TRUE_PUZZLE_ID,
    outcome: "offline",
  };
}

/**
 * Already solved + Perfect-locked board for lock/engraving UI smoke test.
 */
export function buildVerifyPerfectLockedBoard(
  editorName?: string | null,
): CircuitBoardState {
  const editor =
    sanitizeEditorName(editorName) ?? VERIFY_PERFECT_DEFAULT_EDITOR;
  return {
    v: 1,
    cols: VERIFY_TRUE_COLS,
    rows: VERIFY_TRUE_ROWS,
    edgeState: encodeEdgeState(buildVerifyTrueSolutionMarks()),
    puzzleId: VERIFY_TRUE_PUZZLE_ID,
    outcome: "fully_awakened",
    perfect: true,
    locked: true,
    lastEditorName: editor,
  };
}

/** Fixed clues when puzzleId matches verify-true. */
export function resolveVerifyTrueClues(
  puzzleId: string | null | undefined,
  cols?: number,
  rows?: number,
): {
  cols: number;
  rows: number;
  puzzleId: string;
  clues: ReadonlyArray<ReadonlyArray<number | null>>;
} | null {
  if (!isVerifyTruePuzzleId(puzzleId)) return null;
  void cols;
  void rows;
  return {
    cols: VERIFY_TRUE_COLS,
    rows: VERIFY_TRUE_ROWS,
    puzzleId: VERIFY_TRUE_PUZZLE_ID,
    clues: VERIFY_TRUE_CLUES.map((row) => [...row]),
  };
}
