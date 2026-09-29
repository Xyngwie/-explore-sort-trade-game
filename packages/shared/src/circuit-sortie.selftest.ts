import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  type HubCircuitRecord,
} from "./hub-save";
import { createOwnedMech } from "./mech-fleet";
import { createEmptyCircuitBoard } from "./circuit-board";
import { applySortieReport } from "./circuit-inventory";

const board = createEmptyCircuitBoard(2, 2, "sortie-circuit-1");
const lostMech = createOwnedMech("mech_gen1", { instanceId: "lost-mech" });
const equippedCircuit: HubCircuitRecord = {
  circuitId: "sortie-circuit-1",
  circuitBoard: { ...board, outcome: "fully_awakened", perfect: true, locked: true },
  restoreState: "fully_awakened",
  origin: "crafted",
  equippedTo: lostMech.instanceId,
  outcome: "fully_awakened",
  locked: true,
};

const hub = {
  ...INITIAL_HUB,
  fleet: [lostMech],
  circuits: [equippedCircuit],
};

const appliedAt = new Date("2026-09-29T00:00:00.000Z");
const first = applySortieReport(
  hub,
  {
    sortieId: "sortie-1",
    cell: { sx: 4, sy: -2 },
    frontSeed: 1234,
    lostMechInstanceIds: [lostMech.instanceId],
    lostCause: { [lostMech.instanceId]: "left_behind" },
    recoveredDropIds: [],
    acquiredCircuits: [],
  },
  appliedAt,
);

assert.equal(first.applied, true);
assert.equal(first.hub.fleet.length, 0);
assert.equal(first.hub.circuits.length, 0);
assert.equal(first.droppedToField.length, 1);
assert.equal(first.lostForever.length, 0);
assert.equal(first.hub.fieldDrops.length, 1);
assert.equal(first.hub.fieldDrops[0]!.dropId, "drop_sortie-1_sortie-circuit-1");
assert.equal(first.hub.fieldDrops[0]!.circuit.restoreState, "fully_awakened");
assert.equal(first.hub.fieldDrops[0]!.circuit.equippedTo, null);
assert.equal(first.hub.fieldDrops[0]!.cause, "left_behind");
assert.equal(first.hub.appliedSortieIds?.includes("sortie-1"), true);
assert.equal(first.hub.fieldDrops[0]!.droppedAt, appliedAt.toISOString());

// The same sortie must never be applied twice.
const duplicate = applySortieReport(first.hub, {
  sortieId: "sortie-1",
  cell: { sx: 4, sy: -2 },
  frontSeed: 1234,
  lostMechInstanceIds: [],
  lostCause: {},
  recoveredDropIds: [],
  acquiredCircuits: [],
});
assert.equal(duplicate.applied, false);
assert.strictEqual(duplicate.hub, first.hub);

// Recovery returns the exact circuit state to the stash, not as a new/used circuit.
const recovered = applySortieReport(first.hub, {
  sortieId: "sortie-2",
  cell: null,
  frontSeed: null,
  lostMechInstanceIds: [],
  lostCause: {},
  recoveredDropIds: [first.hub.fieldDrops[0]!.dropId],
  acquiredCircuits: [],
});
assert.equal(recovered.applied, true);
assert.deepEqual(recovered.recovered, ["sortie-circuit-1"]);
assert.equal(recovered.hub.fieldDrops.length, 0);
assert.equal(recovered.hub.circuits.length, 1);
assert.equal(recovered.hub.circuits[0]!.circuitId, "sortie-circuit-1");
assert.equal(recovered.hub.circuits[0]!.restoreState, "fully_awakened");
assert.equal(recovered.hub.circuits[0]!.equippedTo, null);
assert.equal(recovered.hub.circuits[0]!.origin, "crafted");
assert.equal(recovered.hub.circuits[0]!.locked, true);

// Without an Invade front cell, the equipped circuit is lost forever rather than
// being written to fieldDrops (U7).
const noFrontMech = createOwnedMech("mech_gen1", { instanceId: "no-front-mech" });
const noFrontCircuit: HubCircuitRecord = {
  ...equippedCircuit,
  circuitId: "lost-forever-circuit",
  circuitBoard: { ...board, puzzleId: "lost-forever-circuit" },
  equippedTo: noFrontMech.instanceId,
  restoreState: "unrestored",
  outcome: "offline",
  locked: undefined,
};
const noFront = applySortieReport(
  { ...INITIAL_HUB, fleet: [noFrontMech], circuits: [noFrontCircuit] },
  {
    sortieId: "sortie-no-front",
    cell: null,
    frontSeed: null,
    lostMechInstanceIds: [noFrontMech.instanceId],
    lostCause: { [noFrontMech.instanceId]: "rescue_abort" },
    recoveredDropIds: [],
    acquiredCircuits: [],
  },
);
assert.equal(noFront.applied, true);
assert.equal(noFront.lostForever.length, 1);
assert.equal(noFront.droppedToField.length, 0);
assert.equal(noFront.hub.fieldDrops.length, 0);
assert.equal(noFront.hub.circuits.length, 0);

console.log("shared circuit sortie selftest: ok");
