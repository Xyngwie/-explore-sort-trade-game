/**
 * Minimal assertions for Sort Zoo Keeper + active-chain refine rules.
 */
import {
  areAdjacent,
  areHorizontalAdjacent,
  boardNeedsSettle,
  buildSupplyBag,
  canStartRefine,
  canSwapAdjacent,
  classifySwipeAxis,
  commitClearStep,
  computeBudgets,
  createRefineFromLocationSearch,
  createTestPlayRefine,
  countMatchingSwaps,
  findHintSwap,
  findLineMatches,
  isActiveChain,
  isJunkOnlyStalemate,
  isNearStuckHint,
  refillFromAbove,
  resolveChains,
  resolveCraftMultiplier,
  resolveNearStuckHint,
  resolveSwipeNeighbor,
  settleMotionIndices,
  SORT_V0_RULES,
  spawnTopFromBag,
  startRefine,
  stepGravityOnce,
  swapPanels,
  tapCell,
  TEST_PLAY_CONTAINERS,
  tickSettleStep,
  toCraftingResult,
  validSupplyGaugeState,
  type RefineLive,
  type PieceKind,
} from "./refine";
import { PIECES_PER_CONTAINER } from "@estg/shared";
import { yieldBagFromClearedCounts } from "@estg/shared";
import {
  buildCargoSkipHubCtaHtml,
  buildCargoSkipToHubUrl,
  buildEmptySkipHubCtaHtml,
  buildEmptySkipToHubUrl,
  buildResultRibbonHtml,
  buildResultYieldCompactHtml,
  canSkipWithCargo,
  isEmptyCargoEntry,
  resolveRestartState,
  toStagePhase,
} from "./resultOverlay";
import { parseSortToTradeSearch } from "@estg/shared";
import {
  buildBriefingBagDifficultyHtml,
  buildPlayHudHtml,
  buildTopFeedbackHtml,
  buildValidSupplyGaugeHtml,
  buildYieldPreviewFromDelta,
  comboFeedbackTier,
  comboTierClass,
  formatYieldPreviewChips,
  nextYieldPreviewMode,
} from "./playHud";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function idx(cols: number, r: number, c: number): number {
  return r * cols + c;
}

function settleUntilQuiet(s: RefineLive, maxTicks = 200): RefineLive {
  let cur = s;
  for (let i = 0; i < maxTicks && cur.playMode === "settling"; i++) {
    cur = tickSettleStep(cur);
  }
  return cur;
}

// Budget from containers / stock — no fixed junk mix ratio
{
  const b = computeBudgets({
    salvagedContainers: 2,
    totalStockPieces: 50,
    isExtracted: true,
  });
  assert(b.validPieceBudget === 50, "budget uses totalStockPieces");
  assert(b.invalidPieceCount === 0, "invalid mix count unused (junk on-demand)");
}

// Gate: not extracted / zero stock
{
  const a = canStartRefine({
    salvagedContainers: 1,
    totalStockPieces: 25,
    isExtracted: false,
  });
  assert(!a.ok, "blocks when not extracted");
  const b = canStartRefine({
    salvagedContainers: 0,
    totalStockPieces: 0,
    isExtracted: true,
  });
  assert(!b.ok, "blocks when budget 0");
}

// Supply bag composition — valid only (junk arg ignored)
{
  const bag = buildSupplyBag(30, 6, 42);
  assert(bag.length === 30, "bag length = valid only");
  assert(bag.filter((k) => k === "junk").length === 0, "no junk in bag");
  assert(bag.filter((k) => k !== "junk").length === 30, "valid count");
}

// Start play: Zoo Keeper filled board — zero junk while valid remains
{
  // Budget >= capacity → full board of valid only, bag leftover, idle
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=4&totalStockPieces=100&isExtracted=1",
  );
  s = startRefine(s, 7);
  assert(s.phase === "play", "starts play");
  assert(s.playMode === "idle", "idle when bag still has valid");
  const filled = s.board.filter((c) => c != null).length;
  const capacity = s.cols * s.rows;
  const junkOnBoard = s.board.filter((c) => c === "junk").length;
  const junkInBag = s.bag.filter((k) => k === "junk").length;
  assert(filled === capacity, "board full when budget >= capacity");
  assert(junkOnBoard === 0, "no junk on board while valid supply remains");
  assert(junkInBag === 0, "no junk in bag");
  assert(s.bag.every((k) => k !== "junk"), "bag valid-only");
  assert(s.bag.length === s.validPieceBudget - filled, "bag leftover valid");
  assert(findLineMatches(s.board, s.cols, s.rows).size === 0, "no opening matches");
  assert(SORT_V0_RULES.initialFillRows === SORT_V0_RULES.boardRows, "fill all rows");
}

// Small budget: valid-only fill; bag empty → settle packs holes with junk
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=25&isExtracted=1",
  );
  s = startRefine(s, 7);
  assert(s.phase === "play", "small budget starts");
  const junkBefore = s.board.filter((c) => c === "junk").length;
  assert(junkBefore === 0, "no junk placed during valid-only initial fill");
  assert(s.bag.length === 0 || s.bag.every((k) => k !== "junk"), "bag has no junk");
  if (s.playMode === "settling") {
    s = settleUntilQuiet(s);
  }
  const capacity = s.cols * s.rows;
  const filled = s.board.filter((c) => c != null).length;
  assert(filled === capacity, "junk settle fills board after valid exhausted");
  assert(
    s.board.some((c) => c === "junk"),
    "junk present after valid bag empty settle",
  );
}

// Junk never appears in line matches
{
  const cols = 6;
  const rows = 8;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  board[idx(cols, rows - 1, 0)] = "junk";
  board[idx(cols, rows - 1, 1)] = "junk";
  board[idx(cols, rows - 1, 2)] = "junk";
  const m = findLineMatches(board, cols, rows);
  assert(m.size === 0, "junk lines do not match");
}

// Horizontal food line of 3 clears; junk beside stays
{
  const cols = 6;
  const rows = 8;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  board[idx(cols, rows - 1, 0)] = "food";
  board[idx(cols, rows - 1, 1)] = "food";
  board[idx(cols, rows - 1, 2)] = "food";
  board[idx(cols, rows - 1, 3)] = "junk";
  const resolved = resolveChains(board, cols, rows);
  assert(resolved.cleared.food === 3, "cleared food += 3");
  assert(resolved.chain === 1, "one clear wave");
  assert(
    resolved.board[idx(cols, rows - 1, 3)] === "junk",
    "junk remains in its column",
  );
}

// Vertical clear
{
  const cols = 4;
  const rows = 6;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  board[idx(cols, 3, 0)] = "food";
  board[idx(cols, 4, 0)] = "food";
  board[idx(cols, 5, 0)] = "food";
  const resolved = resolveChains(board, cols, rows);
  assert(resolved.cleared.food === 3, "vertical clear");
  assert(resolved.board.every((c) => c == null), "board empty after");
}

// Diagonal must NOT match (H/V only)
{
  const cols = 4;
  const rows = 4;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  board[idx(cols, 1, 0)] = "energy";
  board[idx(cols, 2, 1)] = "energy";
  board[idx(cols, 3, 2)] = "energy";
  const m = findLineMatches(board, cols, rows);
  assert(m.size === 0, "diagonal does not match");
}

// Swap creates match → clearing window; commit clears
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 1);
  // Build a controlled board: two food adjacent + one food to swap in
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  board[idx(cols, r, 0)] = "food";
  board[idx(cols, r, 1)] = "food";
  board[idx(cols, r, 2)] = "material";
  board[idx(cols, r, 3)] = "food";
  s = {
    ...s,
    board,
    bag: ["energy", "energy", "energy", "energy", "energy", "energy"],
    movesLeft: 10,
    pendingClear: [],
    playMode: "idle",
  };
  const movesBefore = s.movesLeft;
  // Swap material(2) with food(3) → food food food
  s = swapPanels(s, idx(cols, r, 2), idx(cols, r, 3));
  assert(s.playMode === "clearing", "enters clearing");
  assert(s.pendingClear.length >= 3, "pending clear set");
  assert(s.movesLeft === movesBefore - 1, "idle swap costs a move");
  assert(s.chainCount === 1, "chain starts at 1");

  s = commitClearStep(s);
  assert(s.cleared.food >= 3, "food cleared on commit");
  assert(s.playMode === "settling", "commit enters slow settle (not snap fill)");
  assert(isActiveChain(s), "settling is active chain");
  s = settleUntilQuiet(s);
  assert(s.playMode === "idle" || s.playMode === "clearing", "after settle");
}

// Active chain: mid-window swap is free and can add matches
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 2);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  // Pending clear: food food food at 0,1,2
  board[idx(cols, r, 0)] = "food";
  board[idx(cols, r, 1)] = "food";
  board[idx(cols, r, 2)] = "food";
  // Setup for mid-chain: energy energy | material | energy → swap to match
  board[idx(cols, r, 3)] = "energy";
  board[idx(cols, r, 4)] = "energy";
  board[idx(cols, r, 5)] = "material";
  // Put spare energy above material to swap down? Better: put energy at row-2 col5 and swap vertically
  board[idx(cols, r - 1, 5)] = "energy";

  s = {
    ...s,
    board,
    movesLeft: 5,
    pendingClear: [idx(cols, r, 0), idx(cols, r, 1), idx(cols, r, 2)],
    playMode: "clearing",
    chainCount: 1,
    chainWindowMsLeft: SORT_V0_RULES.chainWindowMs,
  };
  const movesBefore = s.movesLeft;
  // Vertical swap material <-> energy above → energy energy energy on bottom
  s = swapPanels(s, idx(cols, r, 5), idx(cols, r - 1, 5));
  assert(s.movesLeft === movesBefore, "active-chain swap is free");
  assert(s.playMode === "clearing", "still clearing");
  assert(
    s.pendingClear.includes(idx(cols, r, 3)) ||
      s.pendingClear.length > 3,
    "new energy match merged into pending",
  );
}

// areAdjacent / canSwapAdjacent — 4 directions
{
  assert(areAdjacent(6, 0, 1), "horiz adjacent");
  assert(areAdjacent(6, 0, 6), "vert adjacent");
  assert(!areAdjacent(6, 0, 2), "not adjacent");
  assert(canSwapAdjacent(6, 0, 1), "can swap horiz");
  assert(canSwapAdjacent(6, 0, 6), "can swap vert (intentional)");
  assert(!canSwapAdjacent(6, 0, 7), "no diagonal swap");
  assert(areHorizontalAdjacent(6, 0, 1), "classic horiz");
  assert(!areHorizontalAdjacent(6, 0, 6), "classic rejects vert");
}

// Idle vertical swap creates a match (above/below neighbors)
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 11);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  // food food | material  on bottom; food above material → vertical swap
  board[idx(cols, r, 0)] = "food";
  board[idx(cols, r, 1)] = "food";
  board[idx(cols, r, 2)] = "material";
  board[idx(cols, r - 1, 2)] = "food";
  s = {
    ...s,
    board,
    movesLeft: 10,
    pendingClear: [],
    playMode: "idle",
    selected: null,
  };
  const movesBefore = s.movesLeft;
  s = swapPanels(s, idx(cols, r, 2), idx(cols, r - 1, 2));
  assert(s.playMode === "clearing", "vertical swap enters clearing");
  assert(s.movesLeft === movesBefore - 1, "vertical idle swap costs a move");
  assert(s.pendingClear.length >= 3, "vertical swap pending clear");
  assert(s.board[idx(cols, r, 2)] === "food", "food swapped down");
}

// tapCell vertical neighbors swap
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=20&isExtracted=1",
  );
  s = startRefine(s, 12);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  board[idx(cols, r, 0)] = "material";
  board[idx(cols, r - 1, 0)] = "energy";
  s = { ...s, board, playMode: "idle", pendingClear: [], selected: null };
  s = tapCell(s, idx(cols, r, 0));
  assert(s.selected === idx(cols, r, 0), "selected bottom");
  s = tapCell(s, idx(cols, r - 1, 0));
  assert(s.board[idx(cols, r, 0)] === "energy", "tap vertical swap a");
  assert(s.board[idx(cols, r - 1, 0)] === "material", "tap vertical swap b");
  assert(s.phase === "result", "idle no-match tap-tap finishes refine");
}

// Diagonal / non-adjacent swap rejected
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=20&isExtracted=1",
  );
  s = startRefine(s, 13);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  board[idx(cols, r, 0)] = "food";
  board[idx(cols, r - 1, 1)] = "food";
  s = { ...s, board, playMode: "idle", pendingClear: [], selected: null, movesLeft: 5 };
  const before = s.board.slice();
  s = swapPanels(s, idx(cols, r, 0), idx(cols, r - 1, 1));
  assert(s.board[idx(cols, r, 0)] === before[idx(cols, r, 0)], "diagonal no-op a");
  assert(s.board[idx(cols, r - 1, 1)] === before[idx(cols, r - 1, 1)], "diagonal no-op b");
  assert(s.movesLeft === 5, "rejected swap costs nothing");
}

// refillFromAbove fills empty top cells from bag (Zoo Keeper)
{
  const cols = 3;
  const rows = 4;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  board[idx(cols, rows - 1, 0)] = "food";
  board[idx(cols, rows - 1, 1)] = "material";
  const holes = cols * rows - 2;
  const bag: RefineLive["bag"] = Array.from({ length: holes }, (_, i) =>
    (["energy", "food", "material", "junk"] as const)[i % 4]!,
  );
  const filled = refillFromAbove(board, bag, cols, rows);
  assert(filled.board.filter((c) => c != null).length === cols * rows, "board full");
  assert(filled.bag.length === 0, "bag drained for holes");
  assert(filled.board[idx(cols, 0, 0)] != null, "top refilled");
}

// commitClearStep enters settle; tickSettleStep gradually refills from bag
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=40&isExtracted=1",
  );
  s = startRefine(s, 3);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  board[idx(cols, r, 0)] = "food";
  board[idx(cols, r, 1)] = "food";
  board[idx(cols, r, 2)] = "food";
  s = {
    ...s,
    board,
    bag: ["energy", "energy", "energy", "material", "material", "material"],
    pendingClear: [idx(cols, r, 0), idx(cols, r, 1), idx(cols, r, 2)],
    playMode: "clearing",
    chainCount: 1,
    chainWindowMsLeft: 500,
    cleared: { food: 0, material: 0, energy: 0 },
  };
  const bagBefore = s.bag.length;
  s = commitClearStep(s);
  assert(s.cleared.food === 3, "food cleared");
  assert(s.playMode === "settling", "enters settle after clear");
  // Immediately after clear, holes exist and bag not yet drained (slow refill)
  assert(s.bag.length === bagBefore, "no snap refill on commit");
  assert(s.board.filter((c) => c == null).length >= 3, "holes remain for slow fall");

  s = settleUntilQuiet(s);
  assert(s.bag.length === 0, "bag empty after settle");
  const onBoard = s.board.filter((c) => c != null).length;
  assert(onBoard === cols * rows, "after valid bag drains, junk packs full board");
  const fromBag = s.board.filter(
    (c) => c === "energy" || c === "material",
  ).length;
  assert(fromBag === bagBefore, "all six bag pieces dropped in");
  assert(
    s.board.filter((c) => c === "junk").length === cols * rows - bagBefore,
    "remaining cells are junk",
  );
}

// stepGravityOnce + spawnTopFromBag move one row / spawn tops (visible settle units)
{
  const cols = 3;
  const rows = 4;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  board[idx(cols, 0, 0)] = "food";
  board[idx(cols, 0, 1)] = "material";
  const fell = stepGravityOnce(board, cols, rows);
  assert(fell.moved, "gravity step moved");
  assert(fell.board[idx(cols, 1, 0)] === "food", "food fell one row");
  assert(fell.board[idx(cols, 0, 0)] == null, "top vacated");
  const spawned = spawnTopFromBag(fell.board, ["energy", "junk"], cols, rows);
  assert(spawned.spawned, "spawned into empty tops");
  assert(spawned.board[idx(cols, 0, 0)] === "energy", "top spawn");
  assert(boardNeedsSettle(spawned.board, spawned.bag, cols, rows), "still needs settle");
}

// Active chain during settle: free swap while holes refill
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 8);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  // Leave a hole under a panel so settle continues for several ticks
  board[idx(cols, rows - 1, 0)] = "food";
  board[idx(cols, rows - 3, 0)] = "material"; // floating — will fall
  board[idx(cols, rows - 1, 1)] = "energy";
  board[idx(cols, rows - 1, 2)] = "junk";
  board[idx(cols, rows - 1, 3)] = "food";
  board[idx(cols, rows - 1, 4)] = "material";
  s = {
    ...s,
    board,
    bag: ["energy", "energy", "energy", "food", "food", "food"],
    pendingClear: [],
    playMode: "settling",
    chainCount: 1,
    chainWindowMsLeft: 0,
    movesLeft: 5,
    selected: null,
  };
  assert(isActiveChain(s), "settling is active chain");
  assert(boardNeedsSettle(s.board, s.bag, cols, rows), "holes/floaters remain");
  const movesBefore = s.movesLeft;
  // Swap two settled neighbors freely during refill
  s = swapPanels(s, idx(cols, rows - 1, 1), idx(cols, rows - 1, 2));
  assert(s.movesLeft === movesBefore, "settle swap is free (active chain)");
  assert(s.playMode === "settling", "stays settling after swap");
  assert(s.board[idx(cols, rows - 1, 1)] === "junk", "swapped during settle a");
  assert(s.board[idx(cols, rows - 1, 2)] === "energy", "swapped during settle b");
}

// tapCell select then swap
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=20&isExtracted=1",
  );
  s = startRefine(s, 4);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  board[idx(cols, r, 0)] = "material";
  board[idx(cols, r, 1)] = "energy";
  s = { ...s, board, playMode: "idle", pendingClear: [], selected: null };
  s = tapCell(s, idx(cols, r, 0));
  assert(s.selected === idx(cols, r, 0), "selected");
  s = tapCell(s, idx(cols, r, 1));
  assert(s.board[idx(cols, r, 0)] === "energy", "swapped via tap-tap");
  assert(s.board[idx(cols, r, 1)] === "material", "swapped via tap-tap b");
  assert(s.phase === "result", "idle no-match tap-tap finishes refine");
}

// Result → YieldBag + legacy yields
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=12&isExtracted=1",
  );
  s = startRefine(s, 99);
  s = {
    ...s,
    phase: "result",
    cleared: { food: 5, material: 10, energy: 0 },
    playMode: "idle",
    pendingClear: [],
  };
  const result = toCraftingResult(s);
  assert(result.yieldFood === 5, "yieldFood");
  assert(result.yieldMaterial === 10, "yieldMaterial");
  assert(result.yieldEnergy === 0, "yieldEnergy");
  assert(result.yieldBag != null, "yieldBag present");
  const expected = yieldBagFromClearedCounts({
    food: 5,
    material: 10,
    energy: 0,
  });
  assert(result.yieldBag!.mat_ration === expected.mat_ration, "mat_ration");
  assert(result.yieldBag!.mat_scrap === expected.mat_scrap, "mat_scrap");
  assert(result.craftMultiplier === 1, "default craftMultiplier 1");
}

// craftMultiplier from ?craftMultiplier= scales yieldBag
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=12&isExtracted=1&craftMultiplier=1.100",
  );
  assert(
    Math.abs(resolveCraftMultiplier(s.inbound) - 1.1) < 0.001,
    "resolve inbound craft",
  );
  assert(s.note.includes("craft×"), "note mentions craft");
  s = {
    ...s,
    phase: "result",
    cleared: { food: 10, material: 0, energy: 0 },
    playMode: "idle",
    pendingClear: [],
  };
  const result = toCraftingResult(s);
  assert(Math.abs(result.craftMultiplier - 1.1) < 0.001, "result craft");
  const unscaled = yieldBagFromClearedCounts({
    food: 10,
    material: 0,
    energy: 0,
  });
  const ration = unscaled.mat_ration ?? 0;
  assert(
    result.yieldBag!.mat_ration === Math.floor(ration * 1.1),
    "yieldBag scaled by craftMultiplier",
  );
}

// circuitBonuses compact craft also accepted
{
  const s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=12&isExtracted=1&circuitBonuses=craft:1.050",
  );
  assert(
    Math.abs(resolveCraftMultiplier(s.inbound) - 1.05) < 0.001,
    "circuitBonuses craft",
  );
}

// Gravity chain (passive resolve)
{
  const cols = 3;
  const rows = 6;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  board[idx(cols, 5, 0)] = "energy";
  board[idx(cols, 5, 1)] = "energy";
  board[idx(cols, 5, 2)] = "energy";
  // Staggered foods — become a horizontal match only after energy clears
  board[idx(cols, 3, 0)] = "food";
  board[idx(cols, 2, 1)] = "food";
  board[idx(cols, 4, 2)] = "food";
  const resolved = resolveChains(board, cols, rows);
  assert(resolved.cleared.energy === 3, "energy wave");
  assert(resolved.cleared.food === 3, "food chain after gravity");
  assert(resolved.chain === 2, "two-wave chain");
}

// Active chain multi-step: commit → slow settle → gravity match → clearing again
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 5);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  // Bottom energy energy energy (pending)
  board[idx(cols, rows - 1, 0)] = "energy";
  board[idx(cols, rows - 1, 1)] = "energy";
  board[idx(cols, rows - 1, 2)] = "energy";
  // Floating food that drops into a row of 3 after energy clears
  board[idx(cols, rows - 3, 0)] = "food";
  board[idx(cols, rows - 4, 1)] = "food";
  board[idx(cols, rows - 2, 2)] = "food";
  s = {
    ...s,
    board,
    bag: [],
    pendingClear: [
      idx(cols, rows - 1, 0),
      idx(cols, rows - 1, 1),
      idx(cols, rows - 1, 2),
    ],
    playMode: "clearing",
    chainCount: 1,
    chainWindowMsLeft: 500,
    cleared: { food: 0, material: 0, energy: 0 },
  };
  s = commitClearStep(s);
  assert(s.cleared.energy === 3, "first wave energy");
  assert(s.playMode === "settling", "slow settle after clear");
  s = settleUntilQuiet(s);
  assert(s.playMode === "clearing", "still in chain after gravity match");
  assert(s.chainCount === 2, "chain incremented");
  assert(s.pendingClear.length >= 3, "food pending");
  s = commitClearStep(s);
  assert(s.playMode === "settling", "second settle");
  s = settleUntilQuiet(s);
  assert(s.cleared.food === 3, "second wave food");
  assert(s.playMode === "idle", "chain ended");
  assert(s.lastChain === 2, "lastChain recorded");
}

// After valid bag empty, spawnTopFromBag / settle emit junk only
{
  const cols = 3;
  const rows = 4;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  board[idx(cols, rows - 1, 0)] = "food";
  const spawned = spawnTopFromBag(board, [], cols, rows);
  assert(spawned.spawned, "spawned with empty bag");
  assert(spawned.board[idx(cols, 0, 0)] === "junk", "empty bag → junk spawn");
  assert(spawned.board[idx(cols, 0, 1)] === "junk", "all empty tops get junk");
  assert(spawned.bag.length === 0, "bag stays empty");
}

// Live settle after valid drained → junk packs holes; junk still unmatchable
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=40&isExtracted=1",
  );
  s = startRefine(s, 3);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  board[idx(cols, r, 0)] = "food";
  board[idx(cols, r, 1)] = "food";
  board[idx(cols, r, 2)] = "food";
  s = {
    ...s,
    board,
    bag: [], // valid exhausted
    pendingClear: [idx(cols, r, 0), idx(cols, r, 1), idx(cols, r, 2)],
    playMode: "clearing",
    chainCount: 1,
    chainWindowMsLeft: 500,
    cleared: { food: 0, material: 0, energy: 0 },
  };
  s = commitClearStep(s);
  assert(s.cleared.food === 3, "yields still count after valid-only bag");
  assert(s.playMode === "settling", "settle after clear");
  s = settleUntilQuiet(s);
  assert(
    s.board.filter((c) => c === "junk").length >= 3,
    "junk filled cleared holes",
  );
  assert(findLineMatches(s.board, s.cols, s.rows).size === 0, "junk does not match");
}

// Junk-only stalemate → auto-finish eligible
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=12&isExtracted=1",
  );
  s = startRefine(s, 9);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => "junk" as const,
  );
  s = {
    ...s,
    board,
    bag: [],
    playMode: "idle",
    pendingClear: [],
    movesLeft: 5,
    cleared: { food: 2, material: 0, energy: 0 },
  };
  assert(isJunkOnlyStalemate(s), "junk-only stalemate detected");
  // One idle swap path triggers maybeFinish via tickSettle completing;
  // finishRefine path: call tickSettle not needed — swap no-match still leaves stalemate.
  // Directly verify helper; engine finishes on settle→idle via maybeFinishOnMoves.
  s = tickSettleStep({ ...s, playMode: "settling" });
  // With full junk board, settle ends immediately → idle → finish
  assert(
    s.phase === "result" || isJunkOnlyStalemate(s) || s.playMode === "idle",
    "settle on full junk reaches idle/result",
  );
}

// コンテナ100 test-play helper
{
  const t = createTestPlayRefine();
  assert(t.phase === "briefing", "test play briefing");
  assert(t.inbound.salvagedContainers === TEST_PLAY_CONTAINERS, "100 cans");
  assert(
    t.validPieceBudget === TEST_PLAY_CONTAINERS * PIECES_PER_CONTAINER,
    "budget = 100 * PIECES_PER_CONTAINER",
  );
  assert(t.inbound.isExtracted === true, "extracted");
  let s = startRefine(t, 1);
  assert(s.phase === "play", "test play starts");
  assert(s.board.every((c) => c != null && c !== "junk"), "long session starts valid-only full");
  assert(s.bag.length > 0, "large leftover bag");
  assert(s.bag.every((k) => k !== "junk"), "leftover bag valid-only");
}

// Mid-settle swap of already-landed panels: match interrupts settle + chain++
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 21);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  // Floater keeps settle alive (column 0 hole under floating material).
  board[idx(cols, rows - 1, 0)] = "junk";
  board[idx(cols, rows - 3, 0)] = "material";
  // Settled bottom row setup: food food | material | food → swap → match
  board[idx(cols, rows - 1, 1)] = "food";
  board[idx(cols, rows - 1, 2)] = "food";
  board[idx(cols, rows - 1, 3)] = "material";
  board[idx(cols, rows - 1, 4)] = "food";
  s = {
    ...s,
    board,
    bag: ["energy", "energy", "energy", "energy"],
    pendingClear: [],
    playMode: "settling",
    chainCount: 1,
    chainWindowMsLeft: 0,
    movesLeft: 5,
    selected: null,
  };
  assert(isActiveChain(s), "settling active before landed swap");
  assert(boardNeedsSettle(s.board, s.bag, cols, rows), "floater keeps settle open");
  const movesBefore = s.movesLeft;
  // Swap settled material with food → food food food on bottom
  s = swapPanels(s, idx(cols, rows - 1, 3), idx(cols, rows - 1, 4));
  assert(s.movesLeft === movesBefore, "landed settle-match swap is free");
  assert(s.playMode === "clearing", "match interrupts settle into blink");
  assert(s.chainCount === 2, "landed settle match increments chain");
  assert(s.pendingClear.length >= 3, "pending clear from landed match");
  assert(s.board[idx(cols, rows - 1, 4)] === "material", "swapped pieces placed");
}

// Idle no-match swap → finishRefine (yields locked; no endless leftover shuffle)
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=20&isExtracted=1",
  );
  s = startRefine(s, 21);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  board[idx(cols, r, 0)] = "food";
  board[idx(cols, r, 1)] = "material";
  board[idx(cols, r, 2)] = "energy";
  s = {
    ...s,
    board,
    bag: ["food", "food"],
    playMode: "idle",
    pendingClear: [],
    movesLeft: 8,
    cleared: { food: 3, material: 1, energy: 0 },
    selected: null,
  };
  s = swapPanels(s, idx(cols, r, 0), idx(cols, r, 1));
  assert(s.phase === "result", "idle no-match → phase result");
  assert(s.playMode === "idle", "result resets playMode idle");
  assert(
    s.statusMsg === "マッチなし · 精製終了",
    "idle no-match status message",
  );
  const result = toCraftingResult(s);
  assert(result.yieldFood === 3, "yield locked food");
  assert(result.yieldMaterial === 1, "yield locked material");
  assert(result.yieldBag != null, "yieldBag locked");
  assert(s.board[idx(cols, r, 0)] === "material", "swap kept on board for scrap");
  assert(s.board[idx(cols, r, 1)] === "food", "swap kept on board for scrap b");
}

// Mid-settle non-matching swap does NOT finish (active-chain setup stays free)
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 22);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  board[idx(cols, rows - 1, 0)] = "food";
  board[idx(cols, rows - 3, 0)] = "material"; // floater keeps settle open
  board[idx(cols, rows - 1, 1)] = "energy";
  board[idx(cols, rows - 1, 2)] = "junk";
  s = {
    ...s,
    board,
    bag: ["food", "food", "food"],
    pendingClear: [],
    playMode: "settling",
    chainCount: 2,
    chainWindowMsLeft: 0,
    movesLeft: 6,
    cleared: { food: 2, material: 0, energy: 0 },
    selected: null,
  };
  assert(isActiveChain(s), "settle is active chain");
  const movesBefore = s.movesLeft;
  s = swapPanels(s, idx(cols, rows - 1, 1), idx(cols, rows - 1, 2));
  assert(s.phase === "play", "settle no-match does not finish");
  assert(s.playMode === "settling", "stays settling after no-match setup swap");
  assert(s.movesLeft === movesBefore, "settle no-match swap is free");
  assert(s.board[idx(cols, rows - 1, 1)] === "junk", "settle setup swap applied");
  assert(s.board[idx(cols, rows - 1, 2)] === "energy", "settle setup swap applied b");
}

// Mid-clearing (blink) non-matching swap does NOT finish
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 23);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  board[idx(cols, r, 0)] = "food";
  board[idx(cols, r, 1)] = "food";
  board[idx(cols, r, 2)] = "food";
  board[idx(cols, r, 3)] = "energy";
  board[idx(cols, r, 4)] = "material";
  s = {
    ...s,
    board,
    pendingClear: [idx(cols, r, 0), idx(cols, r, 1), idx(cols, r, 2)],
    playMode: "clearing",
    chainCount: 1,
    chainWindowMsLeft: SORT_V0_RULES.clearBlinkMs,
    movesLeft: 4,
    selected: null,
  };
  const movesBefore = s.movesLeft;
  s = swapPanels(s, idx(cols, r, 3), idx(cols, r, 4));
  assert(s.phase === "play", "blink no-match does not finish");
  assert(s.playMode === "clearing", "stays clearing after no-match blink swap");
  assert(s.movesLeft === movesBefore, "blink no-match swap is free");
  assert(s.board[idx(cols, r, 3)] === "material", "blink setup swap applied");
  assert(s.board[idx(cols, r, 4)] === "energy", "blink setup swap applied b");
}

// Matching idle swap still starts clear/chain (regression)
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 24);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  board[idx(cols, r, 0)] = "energy";
  board[idx(cols, r, 1)] = "energy";
  board[idx(cols, r, 2)] = "food";
  board[idx(cols, r, 3)] = "energy";
  s = {
    ...s,
    board,
    bag: ["material", "material"],
    playMode: "idle",
    pendingClear: [],
    movesLeft: 7,
    cleared: { food: 0, material: 0, energy: 0 },
    selected: null,
  };
  const movesBefore = s.movesLeft;
  s = swapPanels(s, idx(cols, r, 2), idx(cols, r, 3));
  assert(s.phase === "play", "matching idle stays in play");
  assert(s.playMode === "clearing", "matching idle enters clearing");
  assert(s.chainCount === 1, "matching idle starts chain at 1");
  assert(s.movesLeft === movesBefore - 1, "matching idle costs a move");
  assert(s.pendingClear.length >= 3, "matching idle sets pending clear");
}

// Timing constants exposed for UI / docs
{
  assert(SORT_V0_RULES.clearBlinkMs === 280, "clearBlinkMs");
  assert(SORT_V0_RULES.settleStepMs === 500, "settleStepMs");
  assert(SORT_V0_RULES.initialFillRows === SORT_V0_RULES.boardRows, "dense fill all rows");
  assert(SORT_V0_RULES.chainWindowMs === SORT_V0_RULES.clearBlinkMs, "chainWindowMs alias");
  assert(SORT_V0_RULES.swipeMinPx === 16, "swipeMinPx micro-tune");
  assert(SORT_V0_RULES.swipeAxisDominanceRatio === 1.12, "swipeAxisDominanceRatio micro-tune");
  assert(SORT_V0_RULES.junkGaugeLowRatio === 0.2, "junkGaugeLowRatio");
  assert(SORT_V0_RULES.junkGaugeTensionRatio === 0.08, "junkGaugeTensionRatio");
  assert(
    SORT_V0_RULES.junkGaugeTensionAbsolute === SORT_V0_RULES.boardCols,
    "junkGaugeTensionAbsolute = one board row",
  );
}

// Swipe axis judgment: player-favorable dominance, reject true diagonal
{
  assert(classifySwipeAxis(0, 0) == null, "zero is tap");
  assert(classifySwipeAxis(10, 0) == null, "below min px is tap");
  assert(classifySwipeAxis(16, 0) === "horizontal", "at min px registers");
  assert(classifySwipeAxis(30, 0) === "horizontal", "pure horizontal");
  assert(classifySwipeAxis(0, 30) === "vertical", "pure vertical");
  assert(classifySwipeAxis(-40, 5) === "horizontal", "mostly left");
  assert(classifySwipeAxis(5, 40) === "vertical", "mostly down");
  // Almost-diagonal but dominant: 40 vs 35 → ratio ≈ 1.143 >= 1.12
  assert(classifySwipeAxis(40, 35) === "horizontal", "almost-diagonal still horizontal");
  assert(classifySwipeAxis(35, 40) === "vertical", "almost-diagonal still vertical");
  // True / near-equal diagonal: 40 vs 38 → ratio ≈ 1.053 < 1.12
  assert(classifySwipeAxis(40, 38) == null, "near-equal diagonal rejected");
  assert(classifySwipeAxis(40, 40) == null, "exact diagonal rejected");
  assert(classifySwipeAxis(-35, 35) == null, "exact diagonal rejected (signs)");

  const cols = 6;
  const rows = 12;
  const center = idx(cols, 5, 2);
  assert(
    resolveSwipeNeighbor(cols, rows, center, 40, 10) === center + 1,
    "swipe right → neighbor",
  );
  assert(
    resolveSwipeNeighbor(cols, rows, center, -40, 10) === center - 1,
    "swipe left → neighbor",
  );
  assert(
    resolveSwipeNeighbor(cols, rows, center, 10, 40) === center + cols,
    "swipe down → neighbor",
  );
  assert(
    resolveSwipeNeighbor(cols, rows, center, 10, -40) === center - cols,
    "swipe up → neighbor",
  );
  assert(
    resolveSwipeNeighbor(cols, rows, center, 40, 40) == null,
    "diagonal swipe → no neighbor",
  );
  assert(
    resolveSwipeNeighbor(cols, rows, idx(cols, 0, 0), -40, 0) == null,
    "edge swipe left → null",
  );
}

// settleMotionIndices marks fall destinations / spawns for UI animation
{
  const cols = 3;
  const rows = 3;
  const before: RefineLive["board"] = Array.from({ length: cols * rows }, () => null);
  before[idx(cols, 0, 0)] = "food";
  before[idx(cols, 1, 1)] = "energy";
  const stepped = stepGravityOnce(before, cols, rows);
  const moved = settleMotionIndices(before, stepped.board);
  assert(moved.includes(idx(cols, 1, 0)), "food fall destination marked");
  assert(moved.includes(idx(cols, 2, 1)), "energy fall destination marked");
  assert(!moved.includes(idx(cols, 0, 0)), "vacated cell not marked (empty)");
}

// Result ribbon overlay markup + restart session source + stage phase map
{
  const html = buildResultRibbonHtml(
    "http://localhost:5175/?importMaterials=1&yieldFood=2",
  );
  assert(html.includes("仕分完了！"), "ribbon title");
  assert(html.includes("格納庫へ"), "hangar CTA label");
  assert(html.includes("もう一度"), "replay CTA label");
  assert(html.includes('id="btn-hangar"'), "hangar button id");
  assert(html.includes('id="btn-again"'), "again button id");
  assert(html.includes("result-ribbon"), "ribbon class");
  assert(
    html.includes("http://localhost:5175/?importMaterials=1&amp;yieldFood=2"),
    "handoff URL escaped in href",
  );

  const compact = buildResultYieldCompactHtml({
    yieldFood: 2,
    yieldMaterial: 4,
    yieldEnergy: 1,
    scrapLossCount: 3,
    craftMultiplier: 1.1,
    lastChain: 5,
  });
  assert(compact.includes("result-yield-compact"), "compact yield class");
  assert(compact.includes("食 2"), "compact food");
  assert(compact.includes("部 4"), "compact material");
  assert(compact.includes("電 1"), "compact energy");
  assert(compact.includes("craft 1.100"), "compact craft");

  assert(toStagePhase("briefing") === "briefing", "stage briefing");
  assert(toStagePhase("play") === "playing", "stage play → playing");
  assert(toStagePhase("result") === "result", "stage result");
  assert(toStagePhase("blocked") === "blocked", "stage blocked");

  const demoSearch =
    "?salvagedContainers=2&totalStockPieces=50&isExtracted=1";
  const fromLoc = resolveRestartState("location", demoSearch);
  assert(fromLoc.phase === "briefing", "location restart → briefing");
  assert(fromLoc.inbound.salvagedContainers === 2, "location keeps handoff cans");

  const fromTest = resolveRestartState("test-play", demoSearch);
  assert(fromTest.phase === "briefing", "test-play restart → briefing");
  assert(
    fromTest.inbound.salvagedContainers === TEST_PLAY_CONTAINERS,
    "test-play restart keeps 100 cans even if URL is demo",
  );
  assert(
    fromTest.note.includes("テストプレイ"),
    "test-play restart note",
  );
}


// Valid-supply gauge state (bag leftover vs budget) — visualization, not a banner
{
  const full = validSupplyGaugeState({
    bag: ["food", "material", "energy"],
    validPieceBudget: 10,
  });
  assert(full.remaining === 3, "gauge remaining from bag");
  assert(full.budget === 10, "gauge budget");
  assert(Math.abs(full.ratio - 0.3) < 1e-9, "gauge ratio 3/10");
  assert(!full.depleted, "gauge not depleted with bag");
  // remaining 3 ≤ absolute tension (6) → tension even though ratio 0.3 > low
  assert(full.level === "tension", "absolute remaining overrides ratio for tension");

  const ok = validSupplyGaugeState({
    bag: Array.from({ length: 40 }, () => "food" as PieceKind),
    validPieceBudget: 100,
  });
  assert(ok.level === "ok", "0.4 ratio + remaining>6 → ok");

  const empty = validSupplyGaugeState({ bag: [], validPieceBudget: 50 });
  assert(empty.remaining === 0 && empty.depleted, "empty bag → depleted");
  assert(empty.ratio === 0, "depleted ratio 0");
  assert(empty.level === "depleted", "empty → depleted level");

  const zeroBudget = validSupplyGaugeState({ bag: [], validPieceBudget: 0 });
  assert(zeroBudget.ratio === 0 && zeroBudget.depleted, "zero budget safe");
  assert(zeroBudget.level === "depleted", "zero budget level");

  // junk never counts as supply in the bag filter
  const mixed: PieceKind[] = ["junk", "food", "junk"];
  const junky = validSupplyGaugeState({
    bag: mixed,
    validPieceBudget: 2,
  });
  assert(junky.remaining === 1, "junk filtered from remaining");
  // 1 remaining ≤ absolute tension (6) → tension even if ratio is 0.5
  assert(junky.level === "tension", "absolute remaining triggers tension");

  const low = validSupplyGaugeState({
    bag: Array.from({ length: 15 }, () => "food" as PieceKind),
    validPieceBudget: 100,
  });
  assert(Math.abs(low.ratio - 0.15) < 1e-9, "low ratio 0.15");
  assert(low.level === "low", "0.15 is low (≤0.2, >0.08, >6 abs)");

  const tensionRatio = validSupplyGaugeState({
    bag: Array.from({ length: 7 }, () => "food" as PieceKind),
    validPieceBudget: 100,
  });
  assert(tensionRatio.level === "tension", "0.07 ratio → tension");
}

// Play HUD includes remaining-valid gauge (no junk-transition banner copy)
{
  const briefing = createRefineFromLocationSearch(
    "?salvagedContainers=2&totalStockPieces=50&isExtracted=1",
  );
  const playing = startRefine(briefing, 7);
  const hud = buildPlayHudHtml(playing);
  assert(hud.includes('aria-label="プレイ HUD"'), "hud rail");
  assert(hud.includes("hud-gauge"), "valid supply gauge class");
  assert(hud.includes('aria-label="残り有効パネル"'), "gauge aria");
  assert(hud.includes('role="meter"'), "gauge meter role");
  const g = validSupplyGaugeState(playing);
  assert(hud.includes(`aria-valuenow="${g.remaining}"`), "gauge valuenow");
  assert(hud.includes(`aria-valuemax="${g.budget}"`), "gauge valuemax");
  assert(!hud.includes("ジャンク移行"), "no junk-transition banner phrasing");
  assert(!hud.includes("junk-transition"), "no junk-transition banner class");

  const depletedHud = buildValidSupplyGaugeHtml({
    bag: [],
    validPieceBudget: 40,
  });
  assert(depletedHud.includes("depleted"), "depleted class when bag empty");
  assert(depletedHud.includes('aria-valuenow="0"'), "depleted valuenow 0");
  assert(depletedHud.includes('data-level="depleted"'), "depleted data-level");

  const tensionHud = buildValidSupplyGaugeHtml({
    bag: ["food", "food", "food"],
    validPieceBudget: 50,
  });
  assert(tensionHud.includes(" tension"), "tension class near junk");
  assert(tensionHud.includes('data-level="tension"'), "tension data-level");
  assert(tensionHud.includes("ジャンク間近"), "tension aria text");
  assert(!tensionHud.includes("ジャンク移行"), "still no junk-transition banner");
}


// lastClearDelta set on commit, cleared when settle returns to idle
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 31);
  assert(s.lastClearDelta == null, "start has no clear delta");
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  board[idx(cols, r, 0)] = "food";
  board[idx(cols, r, 1)] = "food";
  board[idx(cols, r, 2)] = "food";
  s = {
    ...s,
    board,
    bag: ["energy", "energy", "energy", "energy", "energy", "energy"],
    pendingClear: [idx(cols, r, 0), idx(cols, r, 1), idx(cols, r, 2)],
    playMode: "clearing",
    chainCount: 1,
    chainWindowMsLeft: 280,
    cleared: { food: 0, material: 0, energy: 0 },
    lastClearDelta: null,
  };
  s = commitClearStep(s);
  assert(s.lastClearDelta != null, "commit sets lastClearDelta");
  assert(s.lastClearDelta!.food === 3, "delta food 3");
  assert(s.lastClearDelta!.material === 0, "delta material 0");
  const preview = buildYieldPreviewFromDelta(s.lastClearDelta, 1);
  assert((preview.mat_ration ?? 0) === 3, "yield preview ration from food clear");
  const chips = formatYieldPreviewChips(preview);
  assert(chips.chips.includes("糧食パック"), "yield chip label ja");
  assert(chips.chips.includes("+3"), "yield chip count");

  const feedback = buildTopFeedbackHtml(s);
  assert(feedback.includes("hud-flash-chain"), "top chain flash while settling");
  assert(feedback.includes("hud-flash-yield"), "top yield flash after clear");
  assert(feedback.includes("産出"), "yield flash label");
  assert(!feedback.includes("stage-overlay"), "no center overlay class in feedback");
  assert(feedback.includes('data-combo="1"'), "base combo data attr");

  s = settleUntilQuiet(s);
  if (s.playMode === "idle") {
    assert(s.lastClearDelta == null, "idle clears lastClearDelta");
  }
}

// findHintSwap / near-stuck optional hints
{
  const cols = 6;
  const rows = 8;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  // food food | material | food → swap material with food makes match
  board[idx(cols, r, 0)] = "food";
  board[idx(cols, r, 1)] = "food";
  board[idx(cols, r, 2)] = "material";
  board[idx(cols, r, 3)] = "food";
  board[idx(cols, r, 4)] = "energy";
  board[idx(cols, r, 5)] = "junk";
  const hint = findHintSwap(board, cols, rows);
  assert(hint != null, "hint finds a matching swap");
  assert(
    (hint!.a === idx(cols, r, 2) && hint!.b === idx(cols, r, 3)) ||
      (hint!.a === idx(cols, r, 3) && hint!.b === idx(cols, r, 2)),
    "hint points at the food-completing swap",
  );
  assert(countMatchingSwaps(board, cols, rows) >= 1, "at least one matching swap");

  const noBoard: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => "junk" as const,
  );
  assert(findHintSwap(noBoard, cols, rows) == null, "junk board has no hint");
  assert(countMatchingSwaps(noBoard, cols, rows) === 0, "junk board zero swaps");

  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=20&isExtracted=1",
  );
  s = startRefine(s, 32);
  s = {
    ...s,
    board,
    bag: ["food"],
    playMode: "idle",
    pendingClear: [],
    movesLeft: 2,
    selected: null,
    lastClearDelta: null,
  };
  assert(isNearStuckHint(s), "low moves → near-stuck");
  const resolved = resolveNearStuckHint(s);
  assert(resolved != null, "near-stuck resolves a hint pair");

  s = { ...s, movesLeft: 20 };
  // Only one matching swap on this sparse board → still near-stuck
  assert(countMatchingSwaps(s.board, s.cols, s.rows) <= 2, "sparse board few swaps");
  assert(isNearStuckHint(s), "few matching swaps → near-stuck even with moves");

  s = { ...s, playMode: "settling", chainCount: 1 };
  assert(!isNearStuckHint(s), "never hint during active chain");
  assert(resolveNearStuckHint(s) == null, "no resolved hint while settling");
}

// Play HUD top feedback + bag intro + briefing bag difficulty (no center overlays)
{
  const briefing = createRefineFromLocationSearch(
    "?salvagedContainers=2&totalStockPieces=50&isExtracted=1",
  );
  const bagLine = buildBriefingBagDifficultyHtml(briefing);
  assert(bagLine.includes("ジャンクまで"), "briefing shows until-junk");
  assert(bagLine.includes("50"), "briefing budget in until-junk");
  assert(bagLine.includes("brief-bag"), "briefing bag class");

  const playing = startRefine(briefing, 7);
  const hudIntro = buildPlayHudHtml(playing, { showBagIntro: true });
  assert(hudIntro.includes("hud-flash-bag"), "bag intro flash when armed");
  assert(hudIntro.includes("袋スケール"), "bag scale label");
  assert(hudIntro.includes("ジャンク変換まで"), "until junk conversion copy");
  assert(hudIntro.includes("hud-feedback"), "top feedback container");

  const hudQuiet = buildPlayHudHtml(playing, { showBagIntro: false });
  assert(!hudQuiet.includes("hud-flash-bag"), "no bag intro when not armed");
}


// Empty cargo entry → skip-to-hub (no refine board)
{
  const empty = createRefineFromLocationSearch(
    "?salvagedContainers=0&totalStockPieces=0&isExtracted=1",
  );
  assert(empty.phase === "blocked", "empty cargo → blocked (not briefing/play)");
  assert(empty.validPieceBudget === 0, "empty budget 0");
  assert(isEmptyCargoEntry(empty), "detect empty cargo entry");
  assert(
    empty.inbound.salvagedContainers === 0,
    "inbound cans 0",
  );

  const skipUrl = buildEmptySkipToHubUrl(empty, "http://localhost:5175/");
  const skipParsed = new URL(skipUrl);
  assert(
    skipParsed.searchParams.get("importMaterials") === "0",
    "empty skip handoff importMaterials=0",
  );
  assert(
    skipParsed.searchParams.get("craftMultiplier") != null,
    "empty skip keeps craftMultiplier key",
  );
  assert(
    !skipParsed.searchParams.has("yieldBag"),
    "empty skip omits empty yieldBag",
  );

  const cta = buildEmptySkipHubCtaHtml(skipUrl);
  assert(cta.includes("格納庫へ"), "empty skip CTA label");
  assert(!cta.includes("格納庫へ戻る"), "empty skip no legacy 戻る");
  assert(cta.includes('id="btn-skip-hub"'), "empty skip button id");
  assert(cta.includes("importMaterials=0"), "CTA href carries handoff keys");

  const withCraft = createRefineFromLocationSearch(
    "?salvagedContainers=0&totalStockPieces=0&isExtracted=1&craftMultiplier=1.100",
  );
  assert(isEmptyCargoEntry(withCraft), "empty+craft still empty cargo");
  const craftUrl = new URL(
    buildEmptySkipToHubUrl(withCraft, "http://localhost:5175/"),
  );
  assert(
    craftUrl.searchParams.get("craftMultiplier") === "1.100",
    "empty skip preserves inbound craft",
  );

  const notExtracted = createRefineFromLocationSearch(
    "?salvagedContainers=0&totalStockPieces=0&isExtracted=0",
  );
  assert(notExtracted.phase === "blocked", "not extracted blocked");
  assert(
    !isEmptyCargoEntry(notExtracted),
    "not-extracted is not empty-cargo skip path",
  );

  const hasCargo = createRefineFromLocationSearch(
    "?salvagedContainers=2&totalStockPieces=50&isExtracted=1",
  );
  assert(hasCargo.phase === "briefing", "cargo > 0 → briefing");
  assert(!isEmptyCargoEntry(hasCargo), "cargo > 0 hides empty-skip path");
}

// Cargo skip-with-deposit (briefing) — deposits N unopened, zero materials
{
  const cargo = createRefineFromLocationSearch(
    "?salvagedContainers=3&totalStockPieces=75&isExtracted=1",
  );
  assert(cargo.phase === "briefing", "cargo briefing");
  assert(canSkipWithCargo(cargo), "cargo skip available on briefing");
  assert(cargo.validPieceBudget > 0, "budget > 0");

  const empty = createRefineFromLocationSearch(
    "?salvagedContainers=0&totalStockPieces=0&isExtracted=1",
  );
  assert(!canSkipWithCargo(empty), "empty cargo is not cargo-skip");
  const emptyUrl = new URL(
    buildEmptySkipToHubUrl(empty, "http://localhost:5175/"),
  );
  assert(
    !emptyUrl.searchParams.has("depositUnopenedContainers"),
    "empty skip deposits nothing",
  );
  assert(
    emptyUrl.searchParams.get("importMaterials") === "0",
    "empty skip still zero materials",
  );

  const skipUrl = buildCargoSkipToHubUrl(cargo, "http://localhost:5175/");
  const parsed = parseSortToTradeSearch(new URL(skipUrl).search);
  assert(parsed != null, "cargo skip parses as sort→trade");
  assert(parsed!.depositUnopenedContainers === 3, "deposit N cans");
  assert(parsed!.importMaterials === 0, "no material import");
  assert(
    parsed!.yieldBag == null || Object.keys(parsed!.yieldBag).length === 0,
    "no yieldBag import",
  );

  const cta = buildCargoSkipHubCtaHtml(skipUrl);
  assert(cta.includes("格納庫へ"), "cargo skip CTA JA hub");
  assert(cta.includes("未開封"), "cargo skip unopened chip");
  assert(!cta.includes("未開封のまま格納庫へ"), "cargo skip no legacy long label");
  assert(cta.includes('id="btn-skip-cargo-hub"'), "cargo skip button id");
  assert(cta.includes("depositUnopenedContainers=3"), "CTA carries deposit");
}

// Junk-tension telegraph + session yield toggle (no junk banner)
{
  assert(nextYieldPreviewMode("wave") === "session", "wave → session");
  assert(nextYieldPreviewMode("session") === "wave", "session → wave");

  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 41);
  s = {
    ...s,
    bag: ["food", "food", "food", "food"],
    cleared: { food: 5, material: 2, energy: 1 },
    lastClearDelta: { food: 3, material: 0, energy: 0 },
    playMode: "settling",
    chainCount: 1,
    statusMsg: null,
  };

  const waveFb = buildTopFeedbackHtml(s, { yieldMode: "wave" });
  assert(waveFb.includes("hud-flash-yield"), "wave yield flash");
  assert(waveFb.includes('data-mode="wave"'), "wave toggle mode");
  assert(waveFb.includes(">今回<"), "wave toggle label JA");
  assert(waveFb.includes("食3"), "wave shows clear delta pieces");
  assert(waveFb.includes("+3"), "wave chip from delta");

  const sessionFb = buildTopFeedbackHtml(s, { yieldMode: "session" });
  assert(sessionFb.includes('data-mode="session"'), "session toggle mode");
  assert(sessionFb.includes(">累積<"), "session toggle label JA");
  assert(sessionFb.includes("食5"), "session shows cumulative food");
  assert(sessionFb.includes("部2"), "session cumulative material");
  assert(sessionFb.includes("電1"), "session cumulative energy");

  const tensionFb = buildTopFeedbackHtml(s, {
    showJunkTension: true,
    yieldMode: "wave",
  });
  assert(tensionFb.includes("hud-flash-tension"), "tension telegraph when armed");
  assert(tensionFb.includes("ジャンク間近"), "tension telegraph copy");
  assert(tensionFb.includes("緊張"), "tension kicker JA");
  assert(!tensionFb.includes("ジャンク移行"), "telegraph is not junk-transition banner");

  const quietTension = buildTopFeedbackHtml(s, { showJunkTension: false });
  assert(!quietTension.includes("hud-flash-tension"), "no telegraph when not armed");

  const hud = buildPlayHudHtml(s, {
    showJunkTension: true,
    yieldMode: "session",
  });
  assert(hud.includes("hud-gauge"), "gauge present with tension opts");
  assert(hud.includes(" tension") || hud.includes('data-level="tension"'), "gauge tension class");
  assert(!hud.includes("ジャンク移行"), "HUD never junk-transition banner");
}

// SORT-01 combo / consecutive-clear feedback tiers
{
  assert(comboFeedbackTier(0) === "base", "tier 0 base");
  assert(comboFeedbackTier(1) === "base", "tier 1 base");
  assert(comboFeedbackTier(2) === "combo-2", "tier 2");
  assert(comboFeedbackTier(3) === "combo-hot", "tier 3 hot");
  assert(comboFeedbackTier(5) === "combo-hot", "tier 5 hot");
  assert(comboTierClass(1) === "", "class empty for base");
  assert(comboTierClass(2) === "combo-2", "class combo-2");
  assert(comboTierClass(4) === "combo-hot", "class combo-hot");

  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=30&isExtracted=1",
  );
  s = startRefine(s, 31);
  const cols = s.cols;
  const rows = s.rows;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  const r = rows - 1;
  board[idx(cols, r, 0)] = "food";
  board[idx(cols, r, 1)] = "food";
  board[idx(cols, r, 2)] = "food";
  s = {
    ...s,
    board,
    pendingClear: [idx(cols, r, 0), idx(cols, r, 1), idx(cols, r, 2)],
    playMode: "clearing",
    chainCount: 2,
    chainWindowMsLeft: 280,
    lastClearDelta: null,
  };
  const fb2 = buildTopFeedbackHtml(s);
  assert(fb2.includes("combo-2"), "HUD combo-2 class at ×2");
  assert(fb2.includes("連鎖中"), "combo-2 note JA");
  assert(fb2.includes('data-combo="2"'), "data-combo 2");

  s = { ...s, chainCount: 3 };
  const fb3 = buildTopFeedbackHtml(s);
  assert(fb3.includes("combo-hot"), "HUD combo-hot at ×3");
  assert(fb3.includes("連続クリア"), "combo-hot note JA");
  assert(fb3.includes('data-combo="3"'), "data-combo 3");

  s = {
    ...s,
    playMode: "idle",
    pendingClear: [],
    chainCount: 0,
    lastChain: 4,
    statusMsg: "連鎖完了 ×4",
  };
  const done = buildTopFeedbackHtml(s);
  assert(done.includes("hud-flash-chain done"), "done flash");
  assert(done.includes("combo-hot"), "done keeps hot tier");
  assert(done.includes("高連鎖"), "done hot note");
  console.log("sort combo clear feedback ok");
}


console.log("sort refine.selftest: ok");
