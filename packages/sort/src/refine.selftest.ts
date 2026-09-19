/**
 * Minimal assertions for Sort v0 refine rules (no test runner dep).
 */
import {
  buildSupplyBag,
  canStartRefine,
  computeBudgets,
  floodGroup,
  settleBoard,
  startRefine,
  tapCell,
  toCraftingResult,
  createRefineFromLocationSearch,
  resolveCraftMultiplier,
  SORT_V0_RULES,
  type RefineLive,
} from "./refine";
import { yieldBagFromClearedCounts } from "@estg/shared";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
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
  assert(
    bag.filter((k) => k !== "junk").length === 30,
    "valid count",
  );
}

// Junk cannot be cleared via tap
{
  let s = createRefineFromLocationSearch(
    "?salvagedContainers=1&totalStockPieces=25&isExtracted=1",
  );
  s = startRefine(s, 7);
  assert(s.phase === "play", "starts play");
  const junkIdx = s.board.findIndex((c) => c === "junk");
  assert(junkIdx >= 0, "board has junk");
  const before = s.board.join(",");
  const clearedBefore = { ...s.cleared };
  s = tapCell(s, junkIdx);
  assert(s.board.join(",") === before, "junk tap does not clear");
  assert(
    s.cleared.food === clearedBefore.food &&
      s.cleared.material === clearedBefore.material &&
      s.cleared.energy === clearedBefore.energy,
    "junk does not add yield",
  );
}

// Clear a forced group of 3 food
{
  const cols = 6;
  const rows = 8;
  let s: RefineLive = {
    ...createRefineFromLocationSearch(
      "?salvagedContainers=1&totalStockPieces=9&isExtracted=1",
    ),
    phase: "play",
    cols,
    rows,
    bag: [],
    board: Array.from({ length: cols * rows }, () => null),
    movesLeft: 10,
    cleared: { food: 0, material: 0, energy: 0 },
    selected: null,
  };
  // Place three adjacent food at bottom-left
  s.board[cols * (rows - 1) + 0] = "food";
  s.board[cols * (rows - 1) + 1] = "food";
  s.board[cols * (rows - 1) + 2] = "food";
  s.board[cols * (rows - 1) + 3] = "junk";
  const group = floodGroup(s.board, cols, rows, cols * (rows - 1));
  assert(group.length === 3, "flood finds 3 food");
  s = tapCell(s, cols * (rows - 1));
  assert(s.cleared.food === 3, "cleared food += 3");
  assert(s.board[cols * (rows - 1) + 3] === "junk", "junk remains");
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
  };
  const result = toCraftingResult(s);
  assert(Math.abs(result.craftMultiplier - 1.1) < 0.001, "result craft");
  const unscaled = yieldBagFromClearedCounts({ food: 10, material: 0, energy: 0 });
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

// settleBoard fills from bag
{
  const cols = 3;
  const rows = 2;
  const settled = settleBoard(
    Array.from({ length: 6 }, () => null),
    ["food", "material", "energy", "junk"],
    cols,
    rows,
  );
  assert(
    settled.board.filter((c) => c != null).length === 4,
    "filled 4 cells",
  );
  assert(settled.bag.length === 0, "bag drained");
}

console.log("sort refine.selftest: ok");
