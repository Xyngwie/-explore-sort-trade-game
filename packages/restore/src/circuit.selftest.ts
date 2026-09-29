import assert from "node:assert/strict";
import {
  LOOP_CELEBRATE_MS,
  buildLoopCelebrateNoteHtml,
  effectSettleClass,
  shouldArmLoopCelebrate,
  slitherLoopCelebrateClass,
} from "./loopCelebrate";
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
  buildSizedTruePuzzleIdV2,
  countCircuitLoopSolutions,
  loopTouchesAllOuterSides,
  resolveSizedTruePuzzle,
  computeCircuitEffectForBoard,
  computeCircuitEffectValue,
  type EdgeMark,
} from "@estg/shared";
import {
  classifyPlayResult,
  cycleEdgeMark,
  deriveStubOutcome,
  digitSatisfaction,
  hazardNoiseEdgeIndices,
  isCellDigitActivated,
  generateFlawedClues,
  generatePuzzle,
  hEdgeIndex,
  isLoopClosed,
  previewOutcomeEffects,
  vEdgeIndex,
  lineEdgeCount,
  sampleGeneratorRatios,
  FLAWED_HAZARD_WEIGHTS,
  boardFromMarks,
  bypassGuideEffectJa,
  freshMarks,
} from "./puzzle";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  bootstrapFromSearch,
  buildNextLocalBoardHref,
  buildReturnToTradeUrl,
  readLocalSeedFromSearch,
  slowPerfectBoardSide,
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
assert.equal(puzzle.rarity, "flawed_majority");
assert.ok(puzzle.hazard !== "none");
// deterministic
assert.deepEqual(generatePuzzle("selftest-seed", 6, 6).clues, puzzle.clues);
assert.equal(generatePuzzle("selftest-seed", 6, 6).hazard, puzzle.hazard);

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
// Partial progress with a few lines → Bypass (imperfect craft).
assert.equal(deriveStubOutcome(false, 0.2, 4), "bypass");
assert.equal(deriveStubOutcome(false, 0.5, 1), "bypass");

// --- outcome classification ---
{
  const cols = 2;
  const rows = 2;
  const clues = VERIFY_TRUE_CLUES;
  const empty = Array.from({ length: edgeCount(cols, rows) }, () => 0 as EdgeMark);
  const offline = classifyPlayResult(clues, empty, cols, rows);
  assert.equal(offline.outcome, "offline");
  assert.equal(offline.perfectClearance, false);

  const sol = buildVerifyTrueSolutionMarks();
  const full = classifyPlayResult(clues, sol, cols, rows);
  assert.equal(full.outcome, "fully_awakened");
  assert.equal(full.perfectClearance, true);
  assert.equal(full.digits.rate, 1);
  assert.equal(full.loopClosed, true);
  assert.equal(full.effect.hasLoop, true);
  assert.equal(full.effect.effect, 8); // four satisfied 2s
  // Failure-only boundary probe. This does not alter the production/shared path:
  // recompute the exact shared call independently so CI can distinguish
  // classifier state, shared return value, and later mutation.
  const diagnosticInput = {
    clues,
    marks: sol,
    cols,
    rows,
    perfect: full.perfectClearance,
    outcome: full.outcome,
  } as const;
  const diagnosticCompute = computeCircuitEffectValue(diagnosticInput);
  const diagnosticComputeForcedPerfect = computeCircuitEffectValue({
    ...diagnosticInput,
    perfect: true,
  });
  const diagnostic = {
    puzzle: {
      cols,
      rows,
      clueRows: clues.length,
      clueCols: clues[0]?.length ?? 0,
      puzzleId: VERIFY_TRUE_PUZZLE_ID,
    },
    solutionMarks: sol,
    full: {
      outcome: full.outcome,
      perfectClearance: full.perfectClearance,
      digits: full.digits,
      loopClosed: full.loopClosed,
      lineCount: full.lineCount,
      effect: full.effect,
    },
    compute: {
      input: diagnosticInput,
      returnValue: diagnosticCompute,
      forcedPerfectReturnValue: diagnosticComputeForcedPerfect,
    },
    sameEffectObjectValues: {
      perfect: full.effect.perfect,
      computedPerfect: diagnosticCompute.perfect,
      computedForcedPerfect: diagnosticComputeForcedPerfect.perfect,
    },
  };
  assert.equal(
    full.effect.perfect,
    true,
    `RESTORE_PERFECT_DIAGNOSTIC ${JSON.stringify(diagnostic)}`,
  );

  const offlineEffect = classifyPlayResult(clues, empty, cols, rows);
  assert.equal(offlineEffect.effect.effect, 0);
  assert.equal(offlineEffect.effect.hasLoop, false);

  // Force Bypass override even on a full board (manual commit path).
  const forced = classifyPlayResult(clues, sol, cols, rows, "bypass");
  assert.equal(forced.outcome, "bypass");
  assert.equal(forced.perfectClearance, false);
}

// --- v3 majority substrate contract ---
{
  // New Restore boards use the v3 Slitherlink substrate. The old
  // contradiction / overdigit / dense-noise grids were a legacy generator;
  // their exact hazard shapes are no longer part of the v3 Restore contract.
  const c = generateFlawedClues("v3-junk", 6, 6);
  assert.equal(c.clues.length, 6);
  assert.ok(c.clues.every((row) => row.length === 6));
  assert.ok(
    c.clues.flat().every(
      (value) =>
        value == null ||
        (Number.isInteger(value) && value >= 0 && value <= 3),
    ),
  );
  assert.ok(c.clues.flat().some((value) => value != null));

  // Generation remains deterministic for Restore → Trade regeneration.
  const again = generateFlawedClues("v3-junk", 6, 6);
  assert.deepEqual(again.clues, c.clues);
  assert.equal(again.hazard, c.hazard);
}

assert.ok(
  Math.abs(
    FLAWED_HAZARD_WEIGHTS.contradiction +
      FLAWED_HAZARD_WEIGHTS.overdigit +
      FLAWED_HAZARD_WEIGHTS.dense_noise -
      1,
  ) < 1e-9,
);

// --- generator ratios: majority flawed, rare perfect ---
{
  const none = sampleGeneratorRatios(80, { injectRate: 0, seedPrefix: "r0" });
  assert.equal(none.perfect, 0);
  assert.equal(none.flawed, 80);
  assert.equal(
    none.hazards.contradiction + none.hazards.overdigit + none.hazards.dense_noise,
    80,
  );
  // v3 majority generation no longer selects legacy hazard buckets.
  // generateFlawedClues returns the compatibility hazard tag "contradiction"
  // for all v3-generated flawed boards; verify that the aggregate matches
  // the current generator contract instead of the removed legacy distribution.
  assert.equal(none.hazards.contradiction, 80);
  assert.equal(none.hazards.overdigit, 0);
  assert.equal(none.hazards.dense_noise, 0);

  const always = sampleGeneratorRatios(40, { injectRate: 1, seedPrefix: "r1" });
  assert.equal(always.perfect, 40);
  assert.equal(always.flawed, 0);
  assert.equal(always.perfectRate, 1);

  // ~1% inject: most trials flawed; allow statistical slack.
  const rare = sampleGeneratorRatios(200, {
    injectRate: PERFECT_CIRCUIT_PROD_RATE,
    seedPrefix: "prod",
  });
  assert.ok(rare.flawed >= 190, `expected flawed majority, got ${rare.flawed}`);
  assert.ok(rare.perfect <= 10, `expected rare perfect, got ${rare.perfect}`);
}

// --- M4/M5 handoff wire (restore session) ---
{
  const demo = bootstrapFromSearch("");
  assert.equal(demo.source, "demo");
  assert.equal(demo.puzzle.cols, 6);
  assert.equal(demo.puzzle.puzzleId, "restore-stub-6");
  assert.equal(demo.rarity, "flawed_majority");
  assert.ok(!demo.circuitId);
}

{
  assert.equal(readLocalSeedFromSearch("?seed=alpha-board"), "alpha-board");
  const seeded = bootstrapFromSearch("?seed=alpha-board", { injectRate: 0 });
  assert.equal(seeded.source, "demo");
  assert.equal(seeded.puzzle.puzzleId, "alpha-board");
  assert.equal(seeded.rarity, "flawed_majority");
  const href = buildNextLocalBoardHref(
    "next-1",
    "https://example.test/restore/?perfectRate=0.01",
  );
  assert.ok(href.includes("seed=next-1"));
  assert.ok(href.includes("perfectRate=0.01"));
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
  assert.equal(puzzle.rarity, "perfect_rare");
  assert.equal(puzzle.hazard, "none");
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
  assert.equal(session.rarity, "perfect_rare");
  assert.equal(session.marks.every((m) => m === 0), true);
}

// --- Perfect Circuit injection rates on generatePuzzle ---
{
  // Unconditional failure-context probe: capture runtime exports before the
  // strict contract assertions. This does not alter production/shared code.
  console.error(
    "RESTORE_PROD_RATE_RUNTIME",
    JSON.stringify({
      prodRate: PERFECT_CIRCUIT_PROD_RATE,
      prodRateType: typeof PERFECT_CIRCUIT_PROD_RATE,
      devRate: PERFECT_CIRCUIT_DEV_RATE,
      devRateType: typeof PERFECT_CIRCUIT_DEV_RATE,
      resolvedProdRate: resolvePerfectCircuitInjectRate({ hostname: "cdn.example" }),
      resolvedDevRate: resolvePerfectCircuitInjectRate({ isDev: true }),
    }),
  );
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

  // Injection honors the requested size (STATUS 項目12): 6×6 true board.
  const trueBoard = generatePuzzle("roll-me", 6, 6, { forceKind: "true" });
  assert.equal(trueBoard.injectedTrue, true);
  assert.equal(trueBoard.rarity, "perfect_rare");
  assert.equal(trueBoard.hazard, "none");
  assert.equal(trueBoard.puzzleId, buildSizedTruePuzzleIdV2("roll-me", 6, 6));
  assert.equal(trueBoard.cols, 6);
  assert.equal(trueBoard.rows, 6);
  const sol = resolveSizedTruePuzzle(trueBoard.puzzleId)!.solution;
  assert.equal(isLoopClosed(sol, 6, 6), true);
  assert.equal(digitSatisfaction(trueBoard.clues, sol, 6, 6).rate, 1);
  // 2×2 request still yields the fixed verify-true board.
  const true2 = generatePuzzle("roll-me", 2, 2, { forceKind: "true" });
  assert.equal(true2.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.deepEqual(true2.clues, VERIFY_TRUE_CLUES.map((r) => [...r]));

  const flawed = generatePuzzle("flaw-path", 6, 6, { forceKind: "flawed" });
  assert.equal(flawed.injectedTrue, false);
  assert.equal(flawed.rarity, "flawed_majority");
  assert.equal(flawed.puzzleId, "flaw-path");
  assert.equal(flawed.cols, 6);
  assert.deepEqual(
    flawed.clues,
    generateFlawedClues("flaw-path", 6, 6).clues,
  );

  // rate 0 → always flawed; rate 1 → always true
  const never = generatePuzzle("r0", 6, 6, { injectRate: 0, rng: () => 0 });
  assert.equal(never.injectedTrue, false);
  assert.equal(never.rarity, "flawed_majority");
  const always = generatePuzzle("r1", 6, 6, { injectRate: 1, rng: () => 0.99 });
  assert.equal(always.injectedTrue, true);
  assert.equal(always.rarity, "perfect_rare");
  assert.equal(always.puzzleId, buildSizedTruePuzzleIdV2("r1", 6, 6));
  assert.equal(always.cols, 6);

  // bootstrap with explicit DEV rate + rng-forced inject via injectRate 1
  const injectedSession = bootstrapFromSearch("", { injectRate: 1 });
  assert.equal(injectedSession.injectedTrue, true);
  assert.equal(
    injectedSession.puzzle.puzzleId,
    buildSizedTruePuzzleIdV2("restore-stub-6", 6, 6),
  );
  assert.equal(injectedSession.puzzle.cols, 6);
  assert.equal(injectedSession.rarity, "perfect_rare");
  assert.ok(injectedSession.note.includes("Perfect rare") || injectedSession.note.includes("真盤"));

  const hiddenSession = bootstrapFromSearch("", {
    injectRate: 1,
    showInjectionDetails: false,
  });
  assert.equal(hiddenSession.injectedTrue, true);
  assert.equal(hiddenSession.note.includes("真盤"), false);
  assert.equal(hiddenSession.note.includes("inject"), false);

  const flawedSession = bootstrapFromSearch("", { injectRate: 0 });
  assert.equal(flawedSession.injectedTrue, false);
  assert.equal(flawedSession.puzzle.puzzleId, "restore-stub-6");
  assert.equal(flawedSession.puzzle.cols, 6);
  assert.equal(flawedSession.rarity, "flawed_majority");
}


// --- Module 5 Restore UI: active loop / outcome preview / noise edges ---
{
  const cols = 2;
  const rows = 2;
  const clues: (number | null)[][] = [
    [4, null],
    [null, 0],
  ];
  const m: EdgeMark[] = Array.from(
    { length: edgeCount(cols, rows) },
    () => 0 as EdgeMark,
  );
  m[hEdgeIndex(cols, rows, 0, 0)] = 1;
  m[vEdgeIndex(cols, rows, 1, 0)] = 1;
  m[hEdgeIndex(cols, rows, 0, 1)] = 1;
  m[vEdgeIndex(cols, rows, 0, 0)] = 1;

  const play = classifyPlayResult(clues, m, cols, rows);
  assert.equal(play.effect.hasLoop, true);
  assert.equal(play.effect.activeLoopEdgeCount, 4);
  assert.equal(play.effect.activeLoopEdgeIndices.length, 4);
  for (const ei of play.effect.activeLoopEdgeIndices) {
    assert.equal(m[ei], 1);
  }
  assert.ok(play.effect.scoringCells.some((cell) => cell.x === 0 && cell.y === 0));

  const preview = previewOutcomeEffects(clues, m, cols, rows);
  assert.equal(preview.bypass.effect, 4);
  assert.equal(preview.awakened.effect, 8);
  assert.equal(preview.awakenedBetter, true);
}

{
  // v3 keeps the compatibility hazard tag "contradiction", but no longer
  // guarantees the legacy 2×2 block of four 3s. Restore UI noise therefore
  // uses its documented fallback: edges around visible clue cells.
  const c = generateFlawedClues("ui-noise-c", 6, 6, undefined, "contradiction");
  assert.equal(c.hazard, "contradiction");
  assert.ok(c.clues.flat().some((value) => value != null));
  const noise = hazardNoiseEdgeIndices(c.clues, 6, 6, "contradiction");
  assert.ok(noise.size > 0);

  const d = generateFlawedClues("ui-noise-d", 6, 6, undefined, "dense_noise");
  const noiseD = hazardNoiseEdgeIndices(d.clues, 6, 6, "dense_noise");
  assert.ok(noiseD.size > 0);
  assert.equal(hazardNoiseEdgeIndices(d.clues, 6, 6, "none").size, 0);
}


// RESTORE-01 perfect / closed-loop celebrate (amplifies active-loop)
{
  assert.equal(shouldArmLoopCelebrate(false, true), true);
  assert.equal(shouldArmLoopCelebrate(true, true), false);
  assert.equal(shouldArmLoopCelebrate(false, false), false);
  assert.equal(shouldArmLoopCelebrate(true, false), false);
  assert.ok(LOOP_CELEBRATE_MS >= 800 && LOOP_CELEBRATE_MS <= 1600);

  const closed = {
    loopClosed: true,
    celebrating: false,
    perfect: false,
  };
  assert.ok(slitherLoopCelebrateClass(closed).includes("loop-closed"));
  assert.ok(!slitherLoopCelebrateClass(closed).includes("loop-celebrate"));

  const celeb = {
    loopClosed: true,
    celebrating: true,
    perfect: false,
  };
  const cls = slitherLoopCelebrateClass(celeb);
  assert.ok(cls.includes("loop-closed"));
  assert.ok(cls.includes("loop-celebrate"));
  assert.ok(effectSettleClass(celeb).includes("settle"));
  assert.ok(effectSettleClass(celeb).includes("loop-live"));

  const note = buildLoopCelebrateNoteHtml(celeb);
  assert.ok(note.includes("loop-celebrate-note"));
  assert.ok(note.includes("閉ループ成立"));
  assert.ok(note.includes("active-loop") || note.includes("最小閉ループ"));

  const perfect = {
    loopClosed: true,
    celebrating: true,
    perfect: true,
    fullyAwakened: true,
  };
  assert.ok(slitherLoopCelebrateClass(perfect).includes("loop-perfect"));
  assert.ok(effectSettleClass(perfect).includes("perfect"));
  const pnote = buildLoopCelebrateNoteHtml(perfect);
  assert.ok(pnote.includes("完全ループ成立"));

  const open = buildLoopCelebrateNoteHtml({
    loopClosed: false,
    celebrating: false,
    perfect: false,
  });
  // #101 (ffc907b): the first-play rule guide is always shown, even before a loop closes.
  assert.ok(open.includes("restore-rule-guide"), "open loop still shows rule guide");
  assert.ok(!open.includes("loop-celebrate-note"), "no celebrate note while open");
  assert.ok(!open.includes("loop-live-hint"), "no live-scoring hint while open");
  assert.ok(pnote.includes("restore-rule-guide") && note.includes("restore-rule-guide"), "guide also prefixed when closed");
  console.log("restore perfect loop celebrate ok");
}

// --- STATUS 項目12: variable N×N boards (2..8), sized Perfect injection,
//     HUB round-trip, default 6×6 kept, Bypass guide text. All seeded. ---
{
  assert.equal(DEFAULT_COLS, 6);
  assert.equal(DEFAULT_ROWS, 6);

  for (let size = 2; size <= 8; size++) {
    for (const seed of ["n-a", "n-b", "n-c"]) {
      // Flawed generation at N×N: deterministic, right shape, empty = Offline / 0.
      const flawed = generatePuzzle(`${seed}-${size}`, size, size);
      assert.equal(flawed.cols, size);
      assert.equal(flawed.rows, size);
      assert.equal(flawed.rarity, "flawed_majority");
      assert.equal(flawed.clues.length, size);
      assert.ok(flawed.clues.every((row) => row.length === size));
      assert.deepEqual(generatePuzzle(`${seed}-${size}`, size, size).clues, flawed.clues);
      const empty = freshMarks(size, size);
      assert.equal(empty.length, edgeCount(size, size));
      const emptyRes = classifyPlayResult(flawed.clues, empty, size, size);
      assert.equal(emptyRes.outcome, "offline");
      assert.equal(emptyRes.effect.effect, 0);
      assert.equal(emptyRes.perfectClearance, false);

      // Perfect injection at the requested size; its known solution is Perfect.
      const t = generatePuzzle(`${seed}-true`, size, size, { forceKind: "true" });
      assert.equal(t.injectedTrue, true);
      assert.equal(t.rarity, "perfect_rare");
      assert.equal(t.cols, size);
      assert.equal(t.rows, size);
      const solution =
        size === 2
          ? buildVerifyTrueSolutionMarks()
          : resolveSizedTruePuzzle(t.puzzleId)!.solution;
      if (size === 2) assert.equal(t.puzzleId, VERIFY_TRUE_PUZZLE_ID);
      else {
        assert.equal(t.puzzleId, buildSizedTruePuzzleIdV2(`${seed}-true`, size, size));
        // Hidden clues (null) on v2 perfect boards; unique; loop on all 4 sides.
        const sized = resolveSizedTruePuzzle(t.puzzleId)!;
        const nulls = t.clues.flat().filter((c) => c == null).length;
        assert.equal(nulls, sized.hiddenCount);
        assert.ok(nulls > 0);
        assert.equal(loopTouchesAllOuterSides(solution, size, size), true);
      }
      const uniq = countCircuitLoopSolutions(t.clues, size, size);
      assert.equal(uniq.count, 1);
      assert.equal(uniq.aborted, false);
      assert.equal(isLoopClosed(solution, size, size), true);
      assert.equal(digitSatisfaction(t.clues, solution, size, size).rate, 1);
      const perfectRes = classifyPlayResult(t.clues, solution, size, size);
      assert.equal(perfectRes.outcome, "fully_awakened");
      assert.equal(perfectRes.perfectClearance, true);
      assert.ok(perfectRes.effect.effect > 0);
      assert.equal(
        perfectRes.effect.effect,
        computeCircuitEffectValue({
          clues: t.clues,
          marks: solution,
          cols: size,
          rows: size,
          perfect: true,
          outcome: "fully_awakened",
        }).effect,
      );
      // Bypass on the same lines: not Perfect (0-digits do not get +4).
      const bypassRes = classifyPlayResult(t.clues, solution, size, size, "bypass");
      assert.equal(bypassRes.outcome, "bypass");
      assert.equal(bypassRes.perfectClearance, false);
      assert.ok(bypassRes.effect.effect <= perfectRes.effect.effect);

      // HUB round-trip: an unsolved board with this puzzleId opens at N×N
      // with the same clues; trade scoring regenerates the same effect.
      const unsolved = createEmptyCircuitBoard(size, size, t.puzzleId);
      const url = buildTradeToRestoreUrl({
        circuitId: `hub-${seed}-${size}`,
        circuitBoard: unsolved,
      });
      const sess = bootstrapFromSearch(new URL(url).search);
      assert.equal(sess.source, "handoff-board");
      assert.equal(sess.puzzle.cols, size);
      assert.equal(sess.puzzle.rows, size);
      assert.equal(sess.rarity, "perfect_rare");
      assert.deepEqual(sess.puzzle.clues, t.clues);
      const solvedBoard = {
        ...boardFromMarks(size, size, solution, t.puzzleId, "fully_awakened"),
        perfect: true,
      };
      assert.equal(
        computeCircuitEffectForBoard(solvedBoard, { perfect: true }).effect,
        perfectRes.effect.effect,
      );
    }
  }

  // HUB-passed flawed boards keep opening at their own size (e.g. junk craft 4×4).
  {
    const junk = createEmptyCircuitBoard(4, 4, "junk-circuit-selftest");
    const url = buildTradeToRestoreUrl({ circuitId: "junk-circuit-selftest", circuitBoard: junk });
    const sess = bootstrapFromSearch(new URL(url).search);
    assert.equal(sess.puzzle.cols, 4);
    assert.equal(sess.puzzle.rows, 4);
    assert.equal(sess.rarity, "flawed_majority");
  }
  // Fresh boards (no HUB board) stay 6×6.
  {
    const demo = bootstrapFromSearch("", { injectRate: 0 });
    assert.equal(demo.puzzle.cols, 6);
    const injected = bootstrapFromSearch("", { injectRate: 1 });
    assert.equal(injected.puzzle.cols, 6);
    assert.equal(injected.puzzle.rows, 6);
    const idOnly = bootstrapFromSearch(
      new URL(buildTradeToRestoreUrl({ circuitId: "id-only-x" })).search,
      { injectRate: 1 },
    );
    assert.equal(idOnly.puzzle.cols, 6);
  }

  // Bypass guide text branches.
  {
    const noLoop = bypassGuideEffectJa({ effect: 0, hasLoop: false });
    assert.ok(noLoop.includes("効果0になります"));
    assert.ok(noLoop.includes("閉ループがない"));
    const withLoop = bypassGuideEffectJa({ effect: 5, hasLoop: true });
    assert.ok(withLoop.includes("効果値 5"));
    assert.ok(!withLoop.includes("効果0"));
    assert.ok(bypassGuideEffectJa({ effect: 0, hasLoop: true }).includes("効果値 0"));

    // Real board: a lone line (no loop) → preview has no loop → 「効果0」.
    const t = generatePuzzle("guide-true", 4, 4, { forceKind: "true" });
    const solution = resolveSizedTruePuzzle(t.puzzleId)!.solution;
    const partial = freshMarks(4, 4);
    const firstLine = solution.findIndex((m) => m === 1);
    partial[firstLine] = 1;
    const pv = previewOutcomeEffects(t.clues, partial, 4, 4);
    assert.equal(pv.bypass.hasLoop, false);
    assert.ok(bypassGuideEffectJa(pv.bypass).includes("効果0になります"));
    // Closed loop → shows the Bypass effect value.
    const pv2 = previewOutcomeEffects(t.clues, solution, 4, 4);
    assert.equal(pv2.bypass.hasLoop, true);
    assert.ok(bypassGuideEffectJa(pv2.bypass).includes(`効果値 ${pv2.bypass.effect}`));
  }
  console.log("restore variable board size (2..8) + sized perfect + bypass guide ok");
}

// --- Restore max 20×20 (U12): sizes 9..20 generate + judge; >20 clamps to
//     20 (never 2×2); oversize stored boards open clamped with empty marks;
//     「生成中…」 only for large v2 Perfect boards. ---
{
  for (let size = 9; size <= 20; size++) {
    const flawed = generatePuzzle(`big-${size}`, size, size);
    assert.equal(flawed.cols, size);
    assert.equal(flawed.rows, size);
    assert.equal(flawed.clues.length, size);
    const empty = freshMarks(size, size);
    assert.equal(classifyPlayResult(flawed.clues, empty, size, size).outcome, "offline");
    const t = generatePuzzle(`big-${size}-true`, size, size, { forceKind: "true" });
    assert.equal(t.injectedTrue, true);
    assert.equal(t.cols, size);
    assert.equal(t.puzzleId, buildSizedTruePuzzleIdV2(`big-${size}-true`, size, size));
    const solution = resolveSizedTruePuzzle(t.puzzleId)!.solution;
    assert.equal(loopTouchesAllOuterSides(solution, size, size), true);
    const res = classifyPlayResult(t.clues, solution, size, size);
    assert.equal(res.outcome, "fully_awakened");
    assert.equal(res.perfectClearance, true);
  }
  // Above 20 → 20 for both kinds.
  const f30 = generatePuzzle("clamp-30", 30, 30);
  assert.deepEqual([f30.cols, f30.rows, f30.clues.length, f30.clues[0]!.length], [20, 20, 20, 20]);
  const t25 = generatePuzzle("clamp-25", 25, 21, { forceKind: "true" });
  assert.deepEqual([t25.cols, t25.rows, t25.injectedTrue], [20, 20, true]);
  assert.equal(t25.puzzleId, buildSizedTruePuzzleIdV2("clamp-25", 20, 20));
  // Stored 30×30 board (older save; decode tolerates ≤ 64) opens as 20×20.
  const b30 = createEmptyCircuitBoard(30, 30, "stored-30");
  const m30 = decodeEdgeState(b30.edgeState, edgeCount(30, 30));
  m30[0] = 1;
  b30.edgeState = encodeEdgeState(m30);
  const s30 = bootstrapFromSearch(
    new URL(buildTradeToRestoreUrl({ circuitId: "c30", circuitBoard: b30 })).search,
  );
  assert.deepEqual([s30.puzzle.cols, s30.puzzle.rows], [20, 20]);
  assert.equal(s30.marks.length, edgeCount(20, 20));
  assert.ok(s30.marks.every((m) => m === 0), "old-geometry marks dropped");
  // A v2 18×18 id handed from trade opens as that Perfect board (was flawed
  // while the sized max was 16).
  const id18 = buildSizedTruePuzzleIdV2("hand-18", 18, 18);
  const s18 = bootstrapFromSearch(
    new URL(buildTradeToRestoreUrl({ circuitId: "c18", circuitBoard: createEmptyCircuitBoard(18, 18, id18) })).search,
  );
  assert.deepEqual([s18.puzzle.cols, s18.injectedTrue, s18.rarity], [18, true, "perfect_rare"]);
  // 「生成中…」 notice: v2 Perfect id with side ≥ 15 only.
  const urlFor = (id: string, n: number) =>
    new URL(buildTradeToRestoreUrl({ circuitId: "x", circuitBoard: createEmptyCircuitBoard(n, n, id) })).search;
  assert.equal(slowPerfectBoardSide(urlFor(id18, 18)), 18);
  assert.equal(slowPerfectBoardSide(urlFor(buildSizedTruePuzzleIdV2("s", 15, 15), 15)), 15);
  assert.equal(slowPerfectBoardSide(urlFor(buildSizedTruePuzzleIdV2("s", 14, 14), 14)), null);
  assert.equal(slowPerfectBoardSide(urlFor(buildSizedTruePuzzleIdV2("s", 20, 8), 20)), 20);
  assert.equal(slowPerfectBoardSide(urlFor("flawed-20", 20)), null);
  assert.equal(slowPerfectBoardSide(urlFor("perfect-true-20x20-abc", 20)), null, "v1 is instant");
  assert.equal(slowPerfectBoardSide(`?seed=${buildSizedTruePuzzleIdV2("s", 16, 16)}`), 16);
  assert.equal(slowPerfectBoardSide("?circuitId=" + buildSizedTruePuzzleIdV2("s", 17, 17)), 17);
  assert.equal(slowPerfectBoardSide(""), null);
  console.log("restore max 20×20 (9..20, clamp >20, oversize stored board, 生成中 notice) ok");
}

console.log("restore circuit.selftest ok");
