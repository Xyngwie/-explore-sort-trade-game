import assert from "node:assert/strict";
import {
  createEmptyCircuitBoard,
  decodeEdgeState,
  encodeEdgeState,
  edgeCount,
  type EdgeMark,
} from "@estg/shared";
import {
  cycleEdgeMark,
  deriveStubOutcome,
  digitSatisfaction,
  generatePuzzle,
  hEdgeIndex,
  isLoopClosed,
  vEdgeIndex,
} from "./puzzle";

const n = edgeCount(4, 4);
assert.equal(n, 40);
const marks: EdgeMark[] = Array.from({ length: n }, (_, i) =>
  (i % 3) as EdgeMark,
);
const enc = encodeEdgeState(marks);
assert.deepEqual(decodeEdgeState(enc, n), marks);

const board = createEmptyCircuitBoard(4, 4);
assert.equal(board.outcome, undefined);
assert.ok(!("timer" in board));

assert.equal(cycleEdgeMark(0), 1);
assert.equal(cycleEdgeMark(1), 2);
assert.equal(cycleEdgeMark(2), 0);

const puzzle = generatePuzzle("selftest-seed", 6, 6);
assert.equal(puzzle.cols, 6);
assert.equal(puzzle.rows, 6);
assert.equal(puzzle.clues.length, 6);
assert.equal(puzzle.clues[0]!.length, 6);
// deterministic
assert.deepEqual(generatePuzzle("selftest-seed", 6, 6).clues, puzzle.clues);

// 2×2 unit square loop on a 3×3 cell board
{
  const cols = 3;
  const rows = 3;
  const m: EdgeMark[] = Array.from(
    { length: edgeCount(cols, rows) },
    () => 0 as EdgeMark,
  );
  // square around cell (1,1): top/right/bottom/left
  m[hEdgeIndex(cols, rows, 1, 1)] = 1;
  m[vEdgeIndex(cols, rows, 2, 1)] = 1;
  m[hEdgeIndex(cols, rows, 1, 2)] = 1;
  m[vEdgeIndex(cols, rows, 1, 1)] = 1;
  assert.equal(isLoopClosed(m, cols, rows), true);

  const empty: EdgeMark[] = Array.from(
    { length: edgeCount(cols, rows) },
    () => 0 as EdgeMark,
  );
  assert.equal(isLoopClosed(empty, cols, rows), false);

  // open path (3 sides) is not closed
  m[vEdgeIndex(cols, rows, 1, 1)] = 0;
  assert.equal(isLoopClosed(m, cols, rows), false);
}

{
  const cols = 2;
  const rows = 2;
  const clues = [
    [2, null],
    [null, 1],
  ];
  const m: EdgeMark[] = Array.from(
    { length: edgeCount(cols, rows) },
    () => 0 as EdgeMark,
  );
  // cell (0,0): top + left = 2 lines
  m[hEdgeIndex(cols, rows, 0, 0)] = 1;
  m[vEdgeIndex(cols, rows, 0, 0)] = 1;
  // cell (1,1): only bottom
  m[hEdgeIndex(cols, rows, 1, 2)] = 1;
  const stats = digitSatisfaction(clues, m, cols, rows);
  assert.equal(stats.clueCount, 2);
  assert.equal(stats.satisfied, 2);
  assert.equal(stats.rate, 1);
}

assert.equal(deriveStubOutcome(true, 1, 4), "fully_awakened");
assert.equal(deriveStubOutcome(true, 0.5, 4), "bypass");
assert.equal(deriveStubOutcome(false, 0.8, 4), "bypass");
assert.equal(deriveStubOutcome(false, 0.2, 2), "offline");
assert.equal(deriveStubOutcome(false, 1, 0), "offline");

console.log("restore circuit.selftest ok");
