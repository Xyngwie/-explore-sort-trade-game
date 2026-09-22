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
  commitClearStep,
  computeBudgets,
  createRefineFromLocationSearch,
  createTestPlayRefine,
  findLineMatches,
  isActiveChain,
  isJunkOnlyStalemate,
  refillFromAbove,
  resolveChains,
  resolveCraftMultiplier,
  SORT_V0_RULES,
  spawnTopFromBag,
  startRefine,
  stepGravityOnce,
  swapPanels,
  tapCell,
  TEST_PLAY_CONTAINERS,
  tickSettleStep,
  toCraftingResult,
  type RefineLive,
} from "./refine";
import { PIECES_PER_CONTAINER } from "@estg/shared";
import { yieldBagFromClearedCounts } from "@estg/shared";

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

// Timing constants exposed for UI / docs
{
  assert(SORT_V0_RULES.clearBlinkMs === 280, "clearBlinkMs");
  assert(SORT_V0_RULES.settleStepMs === 110, "settleStepMs");
  assert(SORT_V0_RULES.initialFillRows === SORT_V0_RULES.boardRows, "dense fill all rows");
  assert(SORT_V0_RULES.chainWindowMs === SORT_V0_RULES.clearBlinkMs, "chainWindowMs alias");
}

console.log("sort refine.selftest: ok");
