import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  createHubSave,
  deserializeHubSave,
  serializeHubSave,
  type HubCircuitRecord,
  normalizeLostMechs,
} from "./hub-save";
import { createOwnedMech } from "./mech-fleet";
import { createEmptyCircuitBoard } from "./circuit-board";
import {
  applySortieReport,
  equipCircuit,
  recoverLostMechs,
  stashCircuits,
  unequipCircuit,
  LOST_MECH_RECOVERY_FALLBACK_DURABILITY,
} from "./circuit-inventory";
import { applyExploreReturnToHub } from "./sortie-return";
import { buildExploreToHubWearUrl, parseExploreToHubWearSearch } from "./handoff";
import { normalizeHubSnapshot } from "./hub-save";

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


// Invalid lost-mech snapshots are discarded rather than receiving normalizeBattery defaults.
{
  const base = createOwnedMech("mech_gen1", { instanceId: "valid-lost" });
  const result = normalizeLostMechs([
    {
      instanceId: "missing-battery",
      currentAmmo: 4,
      circuitIds: [],
    },
    {
      instanceId: "invalid-battery",
      currentAmmo: 5,
      battery: { capacity: "bad", activity: 1 },
      circuitIds: [],
    },
    {
      instanceId: "valid-lost",
      currentAmmo: 6,
      battery: { capacity: 300, activity: 221 },
      circuitIds: [],
    },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    instanceId: base.instanceId,
    currentAmmo: 6,
    battery: { capacity: 300, activity: 221 },
    circuitIds: [],
  });
}

// Explore left-behind return state is persisted independently from wreck/field drops.
{
  const lostMech = {
    ...createOwnedMech("mech_gen1", {
      instanceId: "left-behind-mech",
      currentAmmo: 11,
    }),
    battery: { capacity: 300, activity: 221 },
  };
  const circuit: HubCircuitRecord = {
    ...equippedCircuit,
    circuitId: "left-behind-circuit",
    equippedTo: lostMech.instanceId,
  };
  const base = {
    ...INITIAL_HUB,
    fleet: [lostMech],
    circuits: [circuit],
  };
  const result = applySortieReport(base, {
    sortieId: "sortie-left-behind",
    cell: null,
    frontSeed: null,
    lostMechInstanceIds: [],
    lostCause: {},
    recoveredDropIds: [],
    acquiredCircuits: [],
    lostMechs: [{
      instanceId: lostMech.instanceId,
      currentAmmo: lostMech.currentAmmo,
      battery: lostMech.battery,
      circuitIds: [circuit.circuitId],
    }],
  });
  assert.equal(result.applied, true);
  assert.equal(result.hub.fleet.some((m) => m.instanceId === lostMech.instanceId), false);
  assert.equal(result.hub.fieldDrops.length, 0);
  assert.equal(result.hub.lostMechs.length, 1);
  assert.deepEqual(result.hub.lostMechs[0], {
    instanceId: lostMech.instanceId,
    currentAmmo: 11,
    battery: { capacity: 300, activity: 221 },
    circuitIds: [circuit.circuitId],
  });
  assert.equal(result.hub.circuits.some((c) => c.circuitId === circuit.circuitId), true);
  const roundTrip = deserializeHubSave(serializeHubSave(createHubSave(result.hub)))!.hub;
  assert.deepEqual(roundTrip.lostMechs, result.hub.lostMechs);
  assert.deepEqual(roundTrip.lostMechs[0]!.circuitIds, [circuit.circuitId]);
}

// ---------------------------------------------------------------------------
// lostMechs recovery (shared PR): circuits stay on the lost mech, location /
// copy fields, recovery back into the fleet, old saves keep loading.
// ---------------------------------------------------------------------------
const mkCircuit = (id: string, equippedTo: string | null): HubCircuitRecord => ({
  ...equippedCircuit,
  circuitBoard: { ...createEmptyCircuitBoard(2, 2, id), outcome: "fully_awakened", perfect: true, locked: true },
  circuitId: id,
  equippedTo,
});
/** Each circuit record exists once and sits in exactly one place. */
const placesOk = (h: ReturnType<typeof normalizeHubSnapshot>) => {
  const ids = h.circuits.map((c) => c.circuitId);
  assert.equal(new Set(ids).size, ids.length, "no duplicated circuit record");
  for (const c of h.circuits) {
    const onLost = h.lostMechs.filter((m) => m.circuitIds.includes(c.circuitId)).length;
    const inFleet = c.equippedTo != null && h.fleet.some((m) => m.instanceId === c.equippedTo) ? 1 : 0;
    const inStash = c.equippedTo == null ? 1 : 0;
    assert.equal(onLost + inFleet + inStash, 1, `circuit ${c.circuitId} in exactly one place`);
    if (onLost) assert.ok(h.lostMechs.some((m) => m.instanceId === c.equippedTo), "lost circuit points at its lost mech");
  }
};

// (A) new loss: the circuit stays attached to the lost mech (not moved to the stash)
{
  const wing = createOwnedMech("mech_gen1", { instanceId: "wing-a", currentAmmo: 9 });
  const base = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [wing], circuits: [mkCircuit("c-wing", "wing-a")] });
  const r = applySortieReport(base, {
    sortieId: "s-attach", cell: null, frontSeed: null, lostMechInstanceIds: [], lostCause: {},
    recoveredDropIds: [], acquiredCircuits: [],
    lostMechs: [{ instanceId: "wing-a", currentAmmo: 9, battery: { capacity: 300, activity: 200 }, circuitIds: ["c-wing"] }],
  });
  assert.equal(r.hub.circuits.find((c) => c.circuitId === "c-wing")!.equippedTo, "wing-a", "circuit stays on the lost mech");
  assert.equal(stashCircuits(r.hub).length, 0, "not in the stash");
  assert.deepEqual(r.hub.lostMechs[0]!.circuitIds, ["c-wing"]);
  placesOk(r.hub);
  const reloaded = deserializeHubSave(serializeHubSave(createHubSave(r.hub)))!.hub;
  assert.equal(reloaded.circuits.find((c) => c.circuitId === "c-wing")!.equippedTo, "wing-a", "kept through save/load");
  // a lost mech's circuit can't be re-equipped or unequipped from the hangar
  const fleetMech = createOwnedMech("mech_gen1", { instanceId: "f-1" });
  const withF = normalizeHubSnapshot({ ...reloaded, fleet: [...reloaded.fleet, fleetMech] });
  const eq = equipCircuit(withF, "c-wing", "f-1");
  assert.equal(eq.ok, false);
  assert.equal(eq.reason, "on_lost_mech");
  assert.equal(unequipCircuit(withF, "c-wing"), withF);
  // no-location rows keep the old shape (Explore deepEquals it)
  assert.deepEqual(Object.keys(r.hub.lostMechs[0]!).sort(), ["battery", "circuitIds", "currentAmmo", "instanceId"]);
}

// (B) REQUIRED 1: an existing save with the old duplication — the left-behind
// mech's circuit was moved to the stash while lostMechs[].circuitIds still
// lists it. Rule: the circuit stays where its record is (stash, or the fleet
// mech it was re-equipped to); the id is dropped from the lost row.
{
  const raw = {
    v: 3,
    savedAt: "2026-10-02T00:00:00.000Z",
    hub: {
      ...INITIAL_HUB,
      fleet: [createOwnedMech("mech_gen1", { instanceId: "f-keep" })],
      circuits: [
        mkCircuit("dup-stash", null), // moved to the stash by the old normalize
        mkCircuit("dup-reequipped", "f-keep"), // player equipped it again meanwhile
        mkCircuit("plain-stash", null),
      ],
      lostMechs: [
        { instanceId: "old-lost", currentAmmo: 7, battery: { capacity: 300, activity: 150 }, circuitIds: ["dup-stash", "dup-reequipped", "sold-already"] },
      ],
    },
  };
  let loaded: ReturnType<typeof deserializeHubSave> = null;
  assert.doesNotThrow(() => { loaded = deserializeHubSave(JSON.stringify(raw)); });
  const h = loaded!.hub;
  assert.deepEqual(h.circuits.map((c) => c.circuitId).sort(), ["dup-reequipped", "dup-stash", "plain-stash"], "no circuit lost or added");
  assert.equal(h.circuits.find((c) => c.circuitId === "dup-stash")!.equippedTo, null, "stays in the stash");
  assert.equal(h.circuits.find((c) => c.circuitId === "dup-reequipped")!.equippedTo, "f-keep", "stays on the fleet mech");
  assert.equal(h.lostMechs.length, 1, "lost row kept");
  assert.deepEqual(h.lostMechs[0]!.circuitIds, [], "ids no longer duplicated on the lost row");
  assert.equal(h.lostMechs[0]!.currentAmmo, 7);
  placesOk(h);
  const again = deserializeHubSave(serializeHubSave(createHubSave(h)))!.hub;
  assert.deepEqual(again.circuits, h.circuits, "save again → same circuits");
  assert.deepEqual(again.lostMechs, h.lostMechs, "save again → same lostMechs");
  // recovering that mech brings it back without circuits (they stayed in the stash / fleet)
  const rec = recoverLostMechs(again, ["old-lost"]);
  assert.deepEqual(rec.recovered, ["old-lost"]);
  assert.equal(rec.hub.circuits.length, 3);
  placesOk(rec.hub);
}

// (C) REQUIRED 2: an older lostMechs row without location / copy fields —
// loads, re-saves unchanged, and can be recovered.
{
  const raw = {
    v: 3,
    savedAt: "2026-10-01T00:00:00.000Z",
    hub: {
      ...INITIAL_HUB,
      fleet: [createOwnedMech("mech_gen1", { instanceId: "f-a" })],
      circuits: [mkCircuit("c-old", null)],
      lostMechs: [{ instanceId: "legacy-lost", currentAmmo: 5, battery: { capacity: 300, activity: 99 }, circuitIds: [] }],
    },
  };
  const h = deserializeHubSave(JSON.stringify(raw))!.hub;
  assert.deepEqual(h.lostMechs, [{ instanceId: "legacy-lost", currentAmmo: 5, battery: { capacity: 300, activity: 99 }, circuitIds: [] }]);
  const again = deserializeHubSave(serializeHubSave(createHubSave(h)))!.hub;
  assert.deepEqual(again.lostMechs, h.lostMechs, "re-save keeps the legacy row as-is");
  const rec = recoverLostMechs(again, ["legacy-lost"]);
  assert.deepEqual(rec.recovered, ["legacy-lost"]);
  assert.equal(rec.hub.lostMechs.length, 0);
  const back = rec.hub.fleet.find((m) => m.instanceId === "legacy-lost")!;
  assert.equal(back.catalogId, "mech_gen1", "no copy → mech_gen1");
  assert.equal(back.durability, LOST_MECH_RECOVERY_FALLBACK_DURABILITY, "no copy → lowest operational durability");
  assert.equal(back.status, "operational");
  assert.equal(back.currentAmmo, 5, "ammo kept");
  assert.deepEqual(back.battery, { capacity: 300, activity: 99 }, "battery kept");
  // the same via a return (URL) carrying recoveredLostMechInstanceIds
  const url = buildExploreToHubWearUrl(
    { returnKind: "extract", mechWear: [], sortieId: "s-recover-legacy", recoveredLostMechInstanceIds: ["legacy-lost"] },
    "https://estg.invalid/",
  );
  const payload = parseExploreToHubWearSearch(new URL(url).search)!;
  assert.deepEqual(payload.recoveredLostMechInstanceIds, ["legacy-lost"]);
  const viaReturn = applyExploreReturnToHub(again, payload);
  assert.equal(viaReturn.applied, true);
  assert.ok(viaReturn.hub.fleet.some((m) => m.instanceId === "legacy-lost"));
  assert.equal(normalizeHubSnapshot(viaReturn.hub).lostMechs.length, 0);
  // unknown / in-fleet ids are ignored
  assert.deepEqual(recoverLostMechs(again, ["f-a", "nope"]).recovered, []);
}

// (D) left behind on an Invade cell: location, time, sortie id and copy are
// recorded; the copy takes this sortie's wear; recovery restores it with its circuit.
{
  const wing = { ...createOwnedMech("mech_gen2", { instanceId: "wing-b", durability: 90, currentAmmo: 20 }), battery: { capacity: 300, activity: 260 } };
  const leader = createOwnedMech("mech_gen1", { instanceId: "lead" });
  const base = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [leader, wing], circuits: [mkCircuit("c-b", "wing-b")] });
  const lossUrl = buildExploreToHubWearUrl({
    returnKind: "extract",
    mechWear: [{ instanceId: "lead", durabilityAfter: 85 }, { instanceId: "wing-b", durabilityAfter: 75 }],
    mechCurrentAmmo: [{ instanceId: "lead", currentAmmo: 10 }],
    sortieId: "s-loss",
    lostMechs: [{ instanceId: "wing-b", currentAmmo: 14, battery: { capacity: 300, activity: 230 }, circuitIds: ["c-b"], frontSeed: 777, cell: { sx: 3, sy: -1 } }],
  }, "https://estg.invalid/");
  const lossPayload = parseExploreToHubWearSearch(new URL(lossUrl).search)!;
  assert.deepEqual(lossPayload.lostMechs![0]!.cell, { sx: 3, sy: -1 }, "row location survives the URL");
  const at = new Date("2026-10-03T12:00:00.000Z");
  const lost = normalizeHubSnapshot(applyExploreReturnToHub(base, lossPayload, at).hub);
  const row = lost.lostMechs[0]!;
  assert.equal(row.frontSeed, 777);
  assert.deepEqual(row.cell, { sx: 3, sy: -1 });
  assert.equal(row.lostAt, at.toISOString());
  assert.equal(row.lostSortieId, "s-loss");
  assert.equal(row.catalogId, "mech_gen2", "copy from the fleet mech");
  assert.equal(row.durability, 75, "copy takes this sortie's wear");
  assert.equal(row.durabilityMax, 100);
  assert.equal(row.status, "operational");
  assert.equal(lost.circuits.find((c) => c.circuitId === "c-b")!.equippedTo, "wing-b");
  placesOk(lost);
  const reloaded = deserializeHubSave(serializeHubSave(createHubSave(lost)))!.hub;
  assert.deepEqual(reloaded.lostMechs, lost.lostMechs, "new fields kept through save/load");

  // (E) reappeared and left behind again → the same entry is updated in place
  const again = normalizeHubSnapshot(applySortieReport(reloaded, {
    sortieId: "s-loss-2", cell: { sx: 5, sy: 2 }, frontSeed: 888, lostMechInstanceIds: [], lostCause: {},
    recoveredDropIds: [], acquiredCircuits: [],
    lostMechs: [{ instanceId: "wing-b", currentAmmo: 12, battery: { capacity: 300, activity: 210 }, circuitIds: ["c-b"] }],
  }, new Date("2026-10-04T00:00:00.000Z")).hub);
  assert.equal(again.lostMechs.length, 1);
  assert.equal(again.lostMechs[0]!.lostSortieId, "s-loss-2");
  assert.deepEqual(again.lostMechs[0]!.cell, { sx: 5, sy: 2 });
  assert.equal(again.lostMechs[0]!.frontSeed, 888);
  assert.equal(again.lostMechs[0]!.currentAmmo, 12);
  assert.equal(again.lostMechs[0]!.catalogId, "mech_gen2", "copy kept");
  assert.equal(again.lostMechs[0]!.durability, 75);

  // recovery via the return: back in the fleet, same id / ammo / battery, circuit equipped
  const recUrl = buildExploreToHubWearUrl({
    returnKind: "extract",
    mechWear: [{ instanceId: "lead", durabilityAfter: 80 }],
    sortieId: "s-recover",
    recoveredLostMechInstanceIds: ["wing-b"],
  }, "https://estg.invalid/");
  const recovered = normalizeHubSnapshot(applyExploreReturnToHub(again, parseExploreToHubWearSearch(new URL(recUrl).search)!).hub);
  assert.equal(recovered.lostMechs.length, 0, "removed from lostMechs");
  const b = recovered.fleet.find((m) => m.instanceId === "wing-b")!;
  assert.equal(b.catalogId, "mech_gen2");
  assert.equal(b.durability, 75);
  assert.equal(b.currentAmmo, 12);
  assert.deepEqual(b.battery, { capacity: 300, activity: 210 });
  assert.equal(recovered.circuits.find((c) => c.circuitId === "c-b")!.equippedTo, "wing-b", "comes back equipped");
  assert.equal(recovered.fleet.length, 2);
  placesOk(recovered);
  // applying the same recovery return again does nothing (sortieId)
  assert.equal(applyExploreReturnToHub(recovered, parseExploreToHubWearSearch(new URL(recUrl).search)!).applied, false);
}

// (F) a lost row whose mech is (somehow) in the fleet is dropped — the fleet copy wins
{
  const m = createOwnedMech("mech_gen1", { instanceId: "both" });
  const h = normalizeHubSnapshot({
    ...INITIAL_HUB, fleet: [m], circuits: [mkCircuit("c-both", "both")],
    lostMechs: [{ instanceId: "both", currentAmmo: 1, battery: { capacity: 300, activity: 1 }, circuitIds: ["c-both"] }],
  });
  assert.equal(h.lostMechs.length, 0);
  assert.equal(h.circuits[0]!.equippedTo, "both");
}

// (G) invalid optional fields are dropped one by one; the row stays
{
  const rows = normalizeLostMechs([{
    instanceId: "x", currentAmmo: 3, battery: { capacity: 300, activity: 10 }, circuitIds: [],
    frontSeed: "nope", cell: { sx: 999, sy: 0 }, lostAt: 5, lostSortieId: "bad id!", catalogId: "mech_zzz",
    durability: "a", durabilityMax: 0, status: "flying",
  }]);
  assert.deepEqual(rows, [{ instanceId: "x", currentAmmo: 3, battery: { capacity: 300, activity: 10 }, circuitIds: [] }]);
}

// (H) left behind on a sortie NOT via Invade (abandonedMechInstanceIds): lost
// outright with its circuits — out of the fleet, no lostMechs row, circuit gone
// (not stashed); other circuits untouched. URL round trip carries the ids.
{
  const lead = createOwnedMech("mech_gen1", { instanceId: "lead" });
  const wing = createOwnedMech("mech_gen1", { instanceId: "wing-x", currentAmmo: 4 });
  const h = normalizeHubSnapshot({
    ...INITIAL_HUB, fleet: [lead, wing],
    circuits: [mkCircuit("c-x", "wing-x"), mkCircuit("c-lead", "lead"), mkCircuit("c-stash", null)],
  });
  const url = buildExploreToHubWearUrl(
    { returnKind: "extract", mechWear: [], sortieId: "s-abandon", abandonedMechInstanceIds: ["wing-x"] },
    "https://estg.invalid/trade/",
  );
  const payload = parseExploreToHubWearSearch(new URL(url).search)!;
  assert.deepEqual(payload.abandonedMechInstanceIds, ["wing-x"]);
  const r = applyExploreReturnToHub(h, payload);
  assert.equal(r.applied, true);
  assert.deepEqual(r.hub.fleet.map((m) => m.instanceId), ["lead"]);
  assert.deepEqual(r.hub.lostMechs, []);
  assert.deepEqual(r.hub.circuits.map((c) => [c.circuitId, c.equippedTo]), [["c-lead", "lead"], ["c-stash", null]]);
  placesOk(r.hub);
  assert.equal(applyExploreReturnToHub(r.hub, payload).applied, false, "same sortieId → no-op");
  // no ids → nothing abandoned (key omitted)
  assert.equal(new URL(buildExploreToHubWearUrl({ returnKind: "extract", mechWear: [] }, "https://estg.invalid/trade/")).searchParams.has("abandonedMechInstanceIds"), false);
}

console.log("shared lostMechs recovery selftest: ok");
console.log("shared circuit sortie selftest: ok");
