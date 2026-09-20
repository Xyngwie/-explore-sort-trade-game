/**
 * Minimal assertions for Sort Columns refine rules (no test runner dep).
 */
import {
  applyControl,
  buildSupplyBag,
  canPlaceFalling,
  canStartRefine,
  computeBudgets,
  createRefineFromLocationSearch,
  findLineMatches,
  resolveChains,
  resolveCraftMultiplier,
  SORT_V0_RULES,
  startRefine,
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

// Start play spawns a falling column; bag shrinks
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=25&isExtracted=1",
  );
  s = startRefine(s, 7);
  assert(s.phase === "play", "starts play");
  assert(s.falling != null, "has falling piece");
  assert(s.falling!.gems.length === SORT_V0_RULES.fallingHeight, "3 gems");
  assert(
    s.bag.length === s.validPieceBudget + s.invalidPieceCount - 3,
    "bag after spawn",
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

// Horizontal food line of 3 clears; junk beside stays in its column
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

// Diagonal match
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
  assert(m.size === 3, "diagonal match of 3");
}

// Controls: rotate cycles gems; hard drop locks and spends a move
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=12&isExtracted=1",
  );
  s = startRefine(s, 99);
  assert(s.falling != null, "falling");
  const before = [...s.falling!.gems];
  s = applyControl(s, "rotate");
  assert(s.falling != null, "still falling");
  assert(s.falling!.gems[0] === before[before.length - 1], "rotate cycle");
  assert(
    s.falling!.gems[1] === before[0] && s.falling!.gems[2] === before[1],
    "rotate order",
  );
  const movesBefore = s.movesLeft;
  s = applyControl(s, "hardDrop");
  assert(s.movesLeft === movesBefore - 1, "hard drop spends move");
  assert(
    s.phase === "result" || s.falling != null,
    "after lock: new piece or result",
  );
}

// canPlaceFalling respects occupied cells
{
  const cols = 3;
  const rows = 4;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  board[idx(cols, 3, 1)] = "junk";
  assert(
    canPlaceFalling(board, cols, rows, 1, 1, 3) === false,
    "blocked by junk",
  );
  assert(canPlaceFalling(board, cols, rows, 0, 1, 3) === true, "empty col ok");
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
    falling: null,
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
    falling: null,
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

// Simultaneous food row + material column both clear
{
  const cols = 3;
  const rows = 5;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  board[idx(cols, 4, 0)] = "food";
  board[idx(cols, 4, 1)] = "food";
  board[idx(cols, 4, 2)] = "food";
  board[idx(cols, 1, 1)] = "material";
  board[idx(cols, 2, 1)] = "material";
  board[idx(cols, 3, 1)] = "material";
  const resolved = resolveChains(board, cols, rows);
  assert(resolved.cleared.food === 3, "food cleared");
  assert(resolved.cleared.material === 3, "material cleared");
  assert(resolved.chain >= 1, "at least one wave");
}

// Gravity chain: clear bottom, upper gems fall into a new match
{
  const cols = 3;
  const rows = 6;
  const board: RefineLive["board"] = Array.from(
    { length: cols * rows },
    () => null,
  );
  // Bottom: energy energy energy → wave 1 clear
  board[idx(cols, 5, 0)] = "energy";
  board[idx(cols, 5, 1)] = "energy";
  board[idx(cols, 5, 2)] = "energy";
  // Floating food that will drop into a horizontal of 3 after energy clears
  board[idx(cols, 3, 0)] = "food";
  board[idx(cols, 2, 1)] = "food";
  board[idx(cols, 4, 2)] = "food";
  const resolved = resolveChains(board, cols, rows);
  assert(resolved.cleared.energy === 3, "energy wave");
  assert(resolved.cleared.food === 3, "food chain after gravity");
  assert(resolved.chain === 2, "two-wave chain");
}

console.log("sort refine.selftest: ok");
