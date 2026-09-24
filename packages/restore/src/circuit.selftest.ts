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
  type EdgeMark,
} from "@estg/shared";
import {
  classifyPlayResult,
  clueDensity,
  cycleEdgeMark,
  deriveStubOutcome,
  digitSatisfaction,
  findContradictionBlockOrigin,
  hazardNoiseEdgeIndices,
  isCellDigitActivated,
  generateFlawedClues,
  generatePuzzle,
  hasContradictionBlock,
  hEdgeIndex,
  isLoopClosed,
  previewOutcomeEffects,
  vEdgeIndex,
  lineEdgeCount,
  sampleGeneratorRatios,
  FLAWED_HAZARD_WEIGHTS,
} from "./puzzle";
import {
  bootstrapFromSearch,
  buildNextLocalBoardHref,
  buildReturnToTradeUrl,
  readLocalSeedFromSearch,
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
  assert.equal(full.effect.perfect, true);

  const offlineEffect = classifyPlayResult(clues, empty, cols, rows);
  assert.equal(offlineEffect.effect.effect, 0);
  assert.equal(offlineEffect.effect.hasLoop, false);

  // Force Bypass override even on a full board (manual commit path).
  const forced = classifyPlayResult(clues, sol, cols, rows, "bypass");
  assert.equal(forced.outcome, "bypass");
  assert.equal(forced.perfectClearance, false);
}

// --- flawed hazard generators ---
{
  const c = generateFlawedClues("haz-c", 6, 6, undefined, "contradiction");
  assert.equal(c.hazard, "contradiction");
  assert.equal(hasContradictionBlock(c.clues), true);

  const o = generateFlawedClues("haz-o", 6, 6, undefined, "overdigit");
  assert.equal(o.hazard, "overdigit");
  assert.ok(clueDensity(o.clues) >= 0.55);

  const d = generateFlawedClues("haz-d", 6, 6, undefined, "dense_noise");
  assert.equal(d.hazard, "dense_noise");
  assert.ok(clueDensity(d.clues) > 0);
  assert.ok(clueDensity(d.clues) < 1);

  const forced = generatePuzzle("force-c", 6, 6, { forceHazard: "contradiction" });
  assert.equal(forced.rarity, "flawed_majority");
  assert.equal(forced.hazard, "contradiction");
  assert.equal(hasContradictionBlock(forced.clues), true);
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
  // Hazard mix should hit each bucket at least once across 80 draws.
  assert.ok(none.hazards.contradiction > 0);
  assert.ok(none.hazards.overdigit > 0);
  assert.ok(none.hazards.dense_noise > 0);

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
  assert.equal(trueBoard.rarity, "perfect_rare");
  assert.equal(trueBoard.hazard, "none");
  assert.equal(trueBoard.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.equal(trueBoard.cols, 2);
  assert.deepEqual(trueBoard.clues, VERIFY_TRUE_CLUES.map((r) => [...r]));
  const sol = buildVerifyTrueSolutionMarks();
  assert.equal(isLoopClosed(sol, 2, 2), true);
  assert.equal(digitSatisfaction(trueBoard.clues, sol, 2, 2).rate, 1);

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
  assert.equal(always.puzzleId, VERIFY_TRUE_PUZZLE_ID);

  // bootstrap with explicit DEV rate + rng-forced inject via injectRate 1
  const injectedSession = bootstrapFromSearch("", { injectRate: 1 });
  assert.equal(injectedSession.injectedTrue, true);
  assert.equal(injectedSession.puzzle.puzzleId, VERIFY_TRUE_PUZZLE_ID);
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
  const c = generateFlawedClues("ui-noise-c", 6, 6, undefined, "contradiction");
  assert.equal(c.hazard, "contradiction");
  assert.ok(hasContradictionBlock(c.clues));
  const origin = findContradictionBlockOrigin(c.clues);
  assert.ok(origin);
  const noise = hazardNoiseEdgeIndices(c.clues, 6, 6, "contradiction");
  assert.ok(noise.size >= 8);
  for (const dy of [0, 1]) {
    for (const dx of [0, 1]) {
      const cx = origin!.x + dx;
      const cy = origin!.y + dy;
      assert.ok(noise.has(hEdgeIndex(6, 6, cx, cy)));
      assert.ok(noise.has(hEdgeIndex(6, 6, cx, cy + 1)));
      assert.ok(noise.has(vEdgeIndex(6, 6, cx, cy)));
      assert.ok(noise.has(vEdgeIndex(6, 6, cx + 1, cy)));
    }
  }

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
  assert.equal(open, "");
  console.log("restore perfect loop celebrate ok");
}

console.log("restore circuit.selftest ok");
