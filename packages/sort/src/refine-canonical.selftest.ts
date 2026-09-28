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

const bag = buildSupplyBag(12, 0, 7);
assert(bag.length === 12, "canonical bag length");
assert(bag.every((kind) => kind === "ammo" || kind === "armor" || kind === "power"), "canonical bag vocabulary");

const board: RefineLive["board"] = ["ammo", "armor", "power", "junk", null, null];
const cleared = clearMatches(board, [0, 1, 2]);
assert(cleared.cleared.ammo === 1, "ammo clear count");
assert(cleared.cleared.armor === 1, "armor clear count");
assert(cleared.cleared.power === 1, "power clear count");
assert(cleared.board[3] === "junk", "junk survives clear");

let state = createRefineFromLocationSearch("?salvagedContainers=2&totalStockPieces=50&isExtracted=1");
state = startRefine(state, 7);
assert(state.board.every((kind) => kind == null || kind === "ammo" || kind === "armor" || kind === "power" || kind === "junk"), "state board uses canonical vocabulary");
assert(state.cleared.ammo === 0 && state.cleared.armor === 0 && state.cleared.power === 0, "canonical cleared state");

const result = toCraftingResult({ ...state, phase: "result", cleared: { ammo: 2, armor: 3, power: 4 } });
assert(result.yieldBag?.ammo === 2, "craft result ammo");
assert(result.yieldBag?.armor === 3, "craft result armor");
assert(result.yieldBag?.power === 4, "craft result power");
assert(!("food" in (result.yieldBag ?? {})), "legacy food does not cross Sort result boundary");
assert(!("material" in (result.yieldBag ?? {})), "legacy material does not cross Sort result boundary");
assert(!("energy" in (result.yieldBag ?? {})), "legacy energy does not cross Sort result boundary");
