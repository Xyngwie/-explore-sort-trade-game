import {
  addSortCleared,
  emptySortCleared,
  fromLegacyBoard,
  fromLegacyCleared,
  fromLegacyPieceKind,
  toLegacyBoard,
  toLegacyCleared,
  toLegacyPieceKind,
} from "./resource-model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(fromLegacyPieceKind("food") === "ammo", "food maps to ammo");
assert(fromLegacyPieceKind("material") === "armor", "material maps to armor");
assert(fromLegacyPieceKind("energy") === "power", "energy maps to power");
assert(fromLegacyPieceKind("junk") === "junk", "junk remains junk");

assert(toLegacyPieceKind("ammo") === "food", "ammo maps to legacy food");
assert(toLegacyPieceKind("armor") === "material", "armor maps to legacy material");
assert(toLegacyPieceKind("power") === "energy", "power maps to legacy energy");
assert(toLegacyPieceKind("junk") === "junk", "junk round-trips");

const board = fromLegacyBoard(["food", "material", "energy", "junk", null]);
assert(board.join(",") === "ammo,armor,power,junk,", "board conversion");
assert(
  JSON.stringify(toLegacyBoard(board)) === JSON.stringify(["food", "material", "energy", "junk", null]),
  "board round-trip",
);

const cleared = fromLegacyCleared({ food: 3, material: 5, energy: 7 });
assert(cleared.ammo === 3 && cleared.armor === 5 && cleared.power === 7, "cleared conversion");
assert(
  JSON.stringify(toLegacyCleared(cleared)) === JSON.stringify({ food: 3, material: 5, energy: 7 }),
  "cleared round-trip",
);

const sum = addSortCleared(emptySortCleared(), cleared);
assert(sum.ammo === 3 && sum.armor === 5 && sum.power === 7, "cleared addition");
