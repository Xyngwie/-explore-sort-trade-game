import assert from "node:assert/strict";
import {
  buildTradeToRestoreUrl,
  createEmptyCircuitBoard,
  decodeEdgeState,
  encodeCircuitBoardCompact,
  encodeEdgeState,
  edgeCount,
  parseRestoreToTradeSearch,
  VERIFY_TRUE_PUZZLE_ID,
  VERIFY_TRUE_CLUES,
  buildVerifyTrueSolutionMarks,
  buildVerifyTrueUnsolvedBoard,
  PERFECT_CIRCUIT_DEV_RATE,
  PERFECT_CIRCUIT_PROD_RATE,
  resolvePerfectCircuitInjectRate,
  type EdgeMark,
} from "@estg/shared";
import {
  cycleEdgeMark,
  deriveStubOutcome,
  digitSatisfaction,
  isCellDigitActivated,
  generateFlawedClues,
  generatePuzzle,
  hEdgeIndex,
  isLoopClosed,
  vEdgeIndex,
  lineEdgeCount,
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
  assert.equal(isCellDigitActivated(clues, m, cols, rows, 0, 0), false);
  assert.equal(isCellDigitActivated(clues, m, cols, rows, 1, 0), null);
  m[hEdgeIndex(cols, rows, 0, 0)] = 1;
  m[vEdgeIndex(cols, rows, 0, 0)] = 1;
  assert.equal(isCellDigitActivated(clues, m, cols, rows, 0, 0), true);
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


{
  const board0 = createEmptyCircuitBoard(4, 4, "locked-board");
  const ttr = buildTradeToRestoreUrl({
    circuitId: "locked_id",
    circuitBoard: board0,
    editorName: "刻印テスト",
    locked: true,
    lastEditorName: "刻印テスト",
  });
  const lockedSession = bootstrapFromSearch(new URL(ttr).search);
  assert.equal(lockedSession.locked, true);
  assert.equal(lockedSession.editorName, "刻印テスト");
  assert.ok(
    lockedSession.engravedName === "刻印テスト" ||
      lockedSession.editorName === "刻印テスト",
  );

  const ret = buildReturnToTradeUrl({
    circuitId: "locked_id",
    cols: 4,
    rows: 4,
    marks: lockedSession.marks,
    puzzleId: "locked-board",
    outcome: "fully_awakened",
    lastEditorName: "刻印テスト",
    perfect: true,
    locked: true,
    baseUrl: "https://example.test/trade/",
  });
  const parsed = parseRestoreToTradeSearch(new URL(ret).search);
  assert.ok(parsed);
  assert.equal(parsed!.lastEditorName, "刻印テスト");
  assert.equal(parsed!.locked, true);
  assert.equal(parsed!.perfect, true);
}


// --- verify-true fixed puzzle is solvable → fully_awakened ---
{
  const puzzle = generatePuzzle(VERIFY_TRUE_PUZZLE_ID, 8, 8);
  assert.equal(puzzle.cols, 2);
  assert.equal(puzzle.rows, 2);
  assert.equal(puzzle.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.deepEqual(puzzle.clues, VERIFY_TRUE_CLUES.map((r) => [...r]));

  const solution = buildVerifyTrueSolutionMarks();
  assert.equal(isLoopClosed(solution, 2, 2), true);
  const digits = digitSatisfaction(puzzle.clues, solution, 2, 2);
  assert.equal(digits.rate, 1);
  assert.equal(
    deriveStubOutcome(true, digits.rate, lineEdgeCount(solution)),
    "fully_awakened",
  );

  const board = buildVerifyTrueUnsolvedBoard();
  const ttr = buildTradeToRestoreUrl({
    circuitId: "verify_true",
    circuitBoard: board,
  });
  const session = bootstrapFromSearch(new URL(ttr).search);
  assert.equal(session.puzzle.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.equal(session.puzzle.cols, 2);
  assert.equal(session.locked, false);
  assert.equal(session.marks.every((m) => m === 0), true);
}


// --- Perfect Circuit injection rates on generatePuzzle ---
{
  assert.equal(PERFECT_CIRCUIT_PROD_RATE, 0.01);
  assert.equal(PERFECT_CIRCUIT_DEV_RATE, 0.33);
  assert.equal(
    resolvePerfectCircuitInjectRate({ isDev: true }),
    PERFECT_CIRCUIT_DEV_RATE,
  );
  assert.equal(
    resolvePerfectCircuitInjectRate({ hostname: "cdn.example" }),
    PERFECT_CIRCUIT_PROD_RATE,
  );

  const trueBoard = generatePuzzle("roll-me", 6, 6, { forceKind: "true" });
  assert.equal(trueBoard.injectedTrue, true);
  assert.equal(trueBoard.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.equal(trueBoard.cols, 2);
  assert.deepEqual(trueBoard.clues, VERIFY_TRUE_CLUES.map((r) => [...r]));
  const sol = buildVerifyTrueSolutionMarks();
  assert.equal(isLoopClosed(sol, 2, 2), true);
  assert.equal(digitSatisfaction(trueBoard.clues, sol, 2, 2).rate, 1);

  const flawed = generatePuzzle("flaw-path", 6, 6, { forceKind: "flawed" });
  assert.equal(flawed.injectedTrue, false);
  assert.equal(flawed.puzzleId, "flaw-path");
  assert.equal(flawed.cols, 6);
  assert.deepEqual(flawed.clues, generateFlawedClues("flaw-path", 6, 6));

  // rate 0 → always flawed; rate 1 → always true
  const never = generatePuzzle("r0", 6, 6, { injectRate: 0, rng: () => 0 });
  assert.equal(never.injectedTrue, false);
  const always = generatePuzzle("r1", 6, 6, { injectRate: 1, rng: () => 0.99 });
  assert.equal(always.injectedTrue, true);
  assert.equal(always.puzzleId, VERIFY_TRUE_PUZZLE_ID);

  // bootstrap with explicit DEV rate + rng-forced inject via injectRate 1
  const injectedSession = bootstrapFromSearch("", { injectRate: 1 });
  assert.equal(injectedSession.injectedTrue, true);
  assert.equal(injectedSession.puzzle.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.ok(injectedSession.note.includes("真盤"));

  const flawedSession = bootstrapFromSearch("", { injectRate: 0 });
  assert.equal(flawedSession.injectedTrue, false);
  assert.equal(flawedSession.puzzle.puzzleId, "restore-stub-6");
  assert.equal(flawedSession.puzzle.cols, 6);
}

console.log("restore circuit.selftest ok");
