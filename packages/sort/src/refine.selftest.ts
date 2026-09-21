/**
 * Minimal assertions for Sort Panel de Pon refine rules (no test runner dep).
 */
import {
  areAdjacent,
  areHorizontalAdjacent,
  buildSupplyBag,
  canStartRefine,
  canSwapAdjacent,
  commitClearStep,
  computeBudgets,
  createRefineFromLocationSearch,
  findLineMatches,
  raiseStack,
  resolveChains,
  resolveCraftMultiplier,
  SORT_V0_RULES,
  startRefine,
  swapPanels,
  tapCell,
  toCraftingResult,
  type RefineLive,
} from "./refine";
import { yieldBagFromClearedCounts } from "@estg/shared";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function idx(cols: number, r: number, c: number): number {
  return r * cols + c;
}

// Budget from containers / stock
{
  const b = computeBudgets({
    salvagedContainers: 2,
    totalStockPieces: 50,
    isExtracted: true,
  });
  assert(b.validPieceBudget === 50, "budget uses totalStockPieces");
  assert(
    b.invalidPieceCount === Math.floor(50 * SORT_V0_RULES.invalidRatio),
    "invalid = floor(valid * 0.2)",
  );
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

// Supply bag composition
{
  const bag = buildSupplyBag(30, 6, 42);
  assert(bag.length === 36, "bag length = valid + invalid");
  assert(bag.filter((k) => k === "junk").length === 6, "junk count");
  assert(bag.filter((k) => k !== "junk").length === 30, "valid count");
}

// Start play fills board from bag (no falling column)
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=25&isExtracted=1",
  );
  s = startRefine(s, 7);
  assert(s.phase === "play", "starts play");
  assert(s.playMode === "idle", "idle mode");
  const filled = s.board.filter((c) => c != null).length;
  assert(filled > 0, "board prefilled");
  assert(
    s.bag.length === s.validPieceBudget + s.invalidPieceCount - filled,
    "bag after fill",
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

// Diagonal must NOT match (Panel de Pon is H/V only)
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
  assert(s.playMode === "idle" || s.playMode === "clearing", "after commit");
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

// areAdjacent / canSwapAdjacent — vertical allowed (departure from classic)
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

// Raise spends a move and adds a bottom row
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=40&isExtracted=1",
  );
  s = startRefine(s, 3);
  // Clear top row so raise won't top-out
  const board = [...s.board];
  for (let c = 0; c < s.cols; c++) board[c] = null;
  s = { ...s, board, movesLeft: 8, playMode: "idle", pendingClear: [] };
  const bagBefore = s.bag.length;
  const movesBefore = s.movesLeft;
  s = raiseStack(s);
  assert(s.movesLeft === movesBefore - 1, "raise costs move");
  assert(s.bag.length < bagBefore, "bag consumed");
  const bottomFilled = s.board
    .slice((s.rows - 1) * s.cols)
    .filter((c) => c != null).length;
  assert(bottomFilled > 0, "bottom row has panels");
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

// Active chain multi-step: commit → gravity creates new match → still clearing
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
  assert(s.playMode === "clearing", "still in chain after gravity match");
  assert(s.chainCount === 2, "chain incremented");
  assert(s.pendingClear.length >= 3, "food pending");
  s = commitClearStep(s);
  assert(s.cleared.food === 3, "second wave food");
  assert(s.playMode === "idle", "chain ended");
  assert(s.lastChain === 2, "lastChain recorded");
}

console.log("sort refine.selftest: ok");
