import {
  buildSupplyBag,
  clearMatches,
  createRefineFromLocationSearch,
  startRefine,
  toCraftingResult,
  type RefineLive,
} from "./refine";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const canonicalKinds = new Set(["ammo", "armor", "power", "junk"]);
const matchableKinds = new Set(["ammo", "armor", "power"]);

// Supply generation must use only the three matchable resource kinds.
const bag = buildSupplyBag(64, 0, 17);
assert(bag.length === 64, "supply bag length");
assert(bag.every((kind) => matchableKinds.has(kind)), "supply bag uses only canonical matchable kinds");

// Junk is a valid board resource but must survive a clear operation.
const board: RefineLive["board"] = ["ammo", "armor", "power", "junk", null, null];
const cleared = clearMatches(board, [0, 1, 2]);
assert(cleared.cleared.ammo === 1, "ammo clear count");
assert(cleared.cleared.armor === 1, "armor clear count");
assert(cleared.cleared.power === 1, "power clear count");
assert(cleared.board[3] === "junk", "junk survives clear");

// A normal game state may contain only the four canonical kinds (or empty cells).
let state = createRefineFromLocationSearch("?salvagedContainers=2&totalStockPieces=50&isExtracted=1");
state = startRefine(state, 17);
assert(
  state.board.every((kind) => kind == null || canonicalKinds.has(kind)),
  "board uses only canonical four-resource vocabulary",
);
assert(
  state.cleared.ammo === 0 && state.cleared.armor === 0 && state.cleared.power === 0,
  "cleared state uses canonical three-resource counters",
);

// Sort's result boundary must expose only the four-resource model and never legacy names.
const result = toCraftingResult({
  ...state,
  phase: "result",
  cleared: { ammo: 2, armor: 3, power: 4 },
});
assert(result.yieldBag?.ammo === 2, "craft result ammo");
assert(result.yieldBag?.armor === 3, "craft result armor");
assert(result.yieldBag?.power === 4, "craft result power");
assert(!("food" in (result.yieldBag ?? {})), "legacy food does not cross Sort result boundary");
assert(!("material" in (result.yieldBag ?? {})), "legacy material does not cross Sort result boundary");
assert(!("energy" in (result.yieldBag ?? {})), "legacy energy does not cross Sort result boundary");
