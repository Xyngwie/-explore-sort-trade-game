import assert from "node:assert/strict";
import {
  buildTradeToRestoreUrl,
  createEmptyCircuitBoard,
  decodeEdgeState,
  encodeCircuitBoardCompact,
  encodeEdgeState,
  edgeCount,
  parseRestoreToTradeSearch,
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
import {
  bootstrapFromSearch,
  buildReturnToTradeUrl,
  stripInboundSearchFromLocation,
} from "./session";

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

// --- M4/M5 handoff wire (restore session) ---
{
  const demo = bootstrapFromSearch("");
  assert.equal(demo.source, "demo");
  assert.equal(demo.puzzle.cols, 6);
  assert.equal(demo.puzzle.puzzleId, "restore-stub-6");
  assert.ok(!demo.circuitId);
}

{
  const idOnly = bootstrapFromSearch("circuitId=board_from_hub");
  assert.equal(idOnly.source, "handoff-id");
  assert.equal(idOnly.circuitId, "board_from_hub");
  assert.equal(idOnly.puzzle.puzzleId, "board_from_hub");
  assert.equal(idOnly.puzzle.cols, 6);
}

{
  const board0 = createEmptyCircuitBoard(8, 8, "stub-8");
  const rawMarks = decodeEdgeState(board0.edgeState, edgeCount(8, 8));
  rawMarks[0] = 1;
  rawMarks[1] = 2;
  board0.edgeState = encodeEdgeState(rawMarks);
  board0.outcome = "bypass";

  const ttr = buildTradeToRestoreUrl({
    circuitId: "board_demo",
    circuitBoard: board0,
  });
  const search = new URL(ttr).search;
  const hydrated = bootstrapFromSearch(search);
  assert.equal(hydrated.source, "handoff-board");
  assert.equal(hydrated.circuitId, "board_demo");
  assert.equal(hydrated.puzzle.cols, 8);
  assert.equal(hydrated.puzzle.rows, 8);
  assert.equal(hydrated.puzzle.puzzleId, "stub-8");
  assert.equal(hydrated.inboundOutcome, "bypass");
  assert.equal(hydrated.marks[0], 1);
  assert.equal(hydrated.marks[1], 2);
  assert.equal(hydrated.marks.length, edgeCount(8, 8));

  const ret = buildReturnToTradeUrl({
    circuitId: hydrated.circuitId,
    cols: hydrated.puzzle.cols,
    rows: hydrated.puzzle.rows,
    marks: hydrated.marks,
    puzzleId: hydrated.puzzle.puzzleId,
    outcome: "fully_awakened",
    baseUrl: "https://example.test/trade/",
  });
  const parsed = parseRestoreToTradeSearch(new URL(ret).search);
  assert.ok(parsed);
  assert.equal(parsed!.outcome, "fully_awakened");
  assert.equal(parsed!.circuitId, "board_demo");
  assert.equal(parsed!.circuitBoard.cols, 8);
  assert.equal(parsed!.circuitBoard.outcome, "fully_awakened");
  assert.equal(parsed!.circuitBoard.puzzleId, "stub-8");
  const back = decodeEdgeState(
    parsed!.circuitBoard.edgeState,
    edgeCount(8, 8),
  );
  assert.equal(back[0], 1);
  assert.equal(back[1], 2);

  const stripped = stripInboundSearchFromLocation(
    `https://example.test/restore/${search}`,
  );
  assert.ok(!stripped.includes("circuitId="));
  assert.ok(!stripped.includes("circuitBoard="));
}

{
  const bare = createEmptyCircuitBoard(4, 4, "bare");
  const compact = encodeCircuitBoardCompact(bare);
  const s = bootstrapFromSearch(`circuitBoard=${encodeURIComponent(compact)}`);
  assert.equal(s.source, "handoff-board");
  assert.equal(s.puzzle.cols, 4);
  assert.ok(s.inboundOutcome == null);
}

console.log("restore circuit.selftest ok");
