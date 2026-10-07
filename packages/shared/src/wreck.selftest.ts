/**
 * 項目5-1b① (2026-10-07 神宮): a mech shot down in the field becomes a wreck
 * (`lostMechs` row with `kind: "wreck"` + `pos`) with its circuits inside.
 * Save compatibility: older saves load unchanged; circuit-only wreck drops
 * (#228, `wreck_not_carried`) go back to the stash once (W9 B).
 */
import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  HUB_SAVE_STORAGE_KEY,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  normalizeLostMechExtras,
  normalizeExplorePos,
  returnWreckFieldDropsToStash,
  saveHubSaveToLocalStorage,
  isWreckRow,
  type HubCircuitRecord,
  type HubSnapshot,
} from "./hub-save";
import { createOwnedMech } from "./mech-fleet";
import { createEmptyCircuitBoard } from "./circuit-board";
import {
  applySortieReport,
  hubVisibleCircuits,
  recoverLostMechs,
  removeWreckRows,
} from "./circuit-inventory";
import { aggregateCircuitBonuses } from "./circuit-bonuses";
import { applyExploreReturnToHub } from "./sortie-return";
import { buildExploreToHubWearUrl, parseExploreToHubWearSearch } from "./handoff";

const mkCircuit = (id: string, equippedTo: string | null): HubCircuitRecord => ({
  circuitId: id,
  circuitBoard: { ...createEmptyCircuitBoard(2, 2, id), outcome: "bypass" } as never,
  outcome: "bypass",
  restoreState: "bypass",
  equippedTo,
} as HubCircuitRecord);
const memStore = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
};
const battery = { capacity: 300, activity: 200 };

// (1) save compat: an older save (lostMechs rows without kind / pos, no wreck
// drops) loads unchanged and stays byte-identical through save → load.
{
  const old = {
    ...INITIAL_HUB,
    fleet: [createOwnedMech("mech_gen1", { instanceId: "m1" })],
    circuits: [mkCircuit("c-left", "left-1"), mkCircuit("c-stash", null)],
    lostMechs: [{
      instanceId: "left-1", currentAmmo: 3, battery, circuitIds: ["c-left"],
      frontSeed: 7, cell: { sx: 1, sy: 2 }, lostAt: "2026-10-03T00:00:00.000Z", lostSortieId: "s-old",
      catalogId: "mech_gen1", durability: 60, durabilityMax: 100, status: "operational",
    }],
    fieldDrops: [{
      dropId: "drop_left", frontSeed: 7, cell: { sx: 1, sy: 2 }, cause: "left_behind",
      droppedAt: "2026-10-03T00:00:00.000Z", circuit: mkCircuit("c-loose", null),
    }],
  } as unknown as HubSnapshot;
  const a = normalizeHubSnapshot(old);
  assert.equal(a.lostMechs.length, 1);
  assert.equal("kind" in a.lostMechs[0]!, false, "no kind added to an old row");
  assert.equal("pos" in a.lostMechs[0]!, false, "no pos added to an old row");
  assert.equal(isWreckRow(a.lostMechs[0]!), false, "old row = left behind");
  assert.equal(a.lostMechs[0]!.durability, 60);
  assert.equal(a.lostMechs[0]!.status, "operational");
  assert.deepEqual(a.fieldDrops.map((d) => d.dropId), ["drop_left"], "other drop causes untouched");
  assert.deepEqual(a.circuits.map((c) => c.circuitId).sort(), ["c-left", "c-stash"]);
  assert.deepEqual(normalizeHubSnapshot(a), a, "normalize is idempotent");
  const st = memStore();
  assert.ok(saveHubSaveToLocalStorage(a, st));
  const first = st.raw.get(HUB_SAVE_STORAGE_KEY)!;
  const loaded = normalizeHubSnapshot(loadHubSaveFromLocalStorage(st)!.hub);
  assert.deepEqual(loaded, a, "save → load unchanged");
  assert.ok(saveHubSaveToLocalStorage(loaded, st));
  const second = st.raw.get(HUB_SAVE_STORAGE_KEY)!;
  assert.deepEqual(JSON.parse(second).hub, JSON.parse(first).hub, "re-save writes the same hub");
  console.log("wreck (1) old save loads unchanged ok");
}

// (2) W9 B: circuit-only wreck drops (#228) go back to the stash on load,
// once. An already-owned circuit is not duplicated. Other drops stay.
{
  const old = {
    ...INITIAL_HUB,
    fleet: [createOwnedMech("mech_gen1", { instanceId: "m1" })],
    circuits: [mkCircuit("c-owned", null), mkCircuit("c-eq", "m1")],
    perfectMaxSize: 5,
    fieldDrops: [
      { dropId: "drop_w1", frontSeed: 9, cell: { sx: 0, sy: 1 }, cause: "wreck_not_carried", fromMechInstanceId: "m3",
        droppedAt: "2026-10-04T00:00:00.000Z", circuit: mkCircuit("c-w1", "m3") },
      { dropId: "drop_w2", frontSeed: 9, cell: { sx: 2, sy: 1 }, cause: "wreck_not_carried",
        droppedAt: "2026-10-04T00:00:00.000Z", circuit: { ...mkCircuit("c-owned", null), customName: "重複" } },
      { dropId: "drop_l", frontSeed: 9, cell: { sx: 2, sy: 1 }, cause: "left_behind",
        droppedAt: "2026-10-04T00:00:00.000Z", circuit: mkCircuit("c-l", null) },
    ],
  } as unknown as HubSnapshot;
  const st = memStore();
  // write the raw old save the way an older build did (no normalize on the way in)
  st.setItem(HUB_SAVE_STORAGE_KEY, JSON.stringify({ v: 3, savedAt: "2026-10-04T00:00:00.000Z", hub: old }));
  const loaded = loadHubSaveFromLocalStorage(st);
  assert.ok(loaded, "old save still loads");
  const h = normalizeHubSnapshot(loaded!.hub);
  assert.deepEqual(h.fieldDrops.map((d) => d.dropId), ["drop_l"], "wreck drops removed, other kept");
  const back = h.circuits.find((c) => c.circuitId === "c-w1")!;
  assert.ok(back, "c-w1 back in the stash");
  assert.equal(back.equippedTo, null);
  assert.equal(h.circuits.filter((c) => c.circuitId === "c-owned").length, 1, "no duplicate");
  assert.equal(h.circuits.find((c) => c.circuitId === "c-owned")!.customName, undefined, "owned record wins");
  assert.equal(h.circuits.find((c) => c.circuitId === "c-eq")!.equippedTo, "m1", "equipped untouched");
  assert.equal(h.circuits.length, 3);
  assert.equal(h.perfectMaxSize, 5, "stored perfectMaxSize kept");
  assert.equal(h.fleet.length, 1);
  // idempotent: normalize again / save → load again → same
  assert.deepEqual(normalizeHubSnapshot(h), h);
  assert.ok(saveHubSaveToLocalStorage(h, st));
  assert.deepEqual(normalizeHubSnapshot(loadHubSaveFromLocalStorage(st)!.hub), h, "second load: nothing more changes");
  // pure helper
  const none = returnWreckFieldDropsToStash(h.circuits, h.fieldDrops);
  assert.deepEqual(none.returned, []);
  assert.equal(none.circuits, h.circuits, "no-op returns the same arrays");
  console.log("wreck (2) W9 old wreck drops → stash once ok");
}

// (3) row fields: kind / pos normalize; a wreck is always destroyed at 0.
{
  const w = normalizeLostMechExtras({ kind: "wreck", pos: { x: 512.34, y: "300" }, durability: 55, status: "operational" });
  assert.deepEqual(w, { kind: "wreck", pos: { x: 512.3, y: 300 }, durability: 0, status: "destroyed" });
  assert.deepEqual(normalizeLostMechExtras({ kind: "left_behind" }), { kind: "left_behind" });
  assert.deepEqual(normalizeLostMechExtras({ kind: "ghost", pos: { x: NaN, y: 1 } }), {}, "bad kind / pos dropped");
  assert.equal(normalizeExplorePos({ x: 1e9, y: 0 }), null);
  assert.equal(normalizeExplorePos({ x: 1 }), null);
  assert.equal(normalizeExplorePos([1, 2]), null);
  console.log("wreck (3) row normalize ok");
}

// (4) return URL round-trip carries kind + pos; applied once per sortieId:
// the wreck leaves the fleet with its circuits inside (not visible, no bonus).
{
  const m2 = { ...createOwnedMech("mech_gen1", { instanceId: "m2" }), battery };
  const h0 = normalizeHubSnapshot({
    ...INITIAL_HUB,
    fleet: [createOwnedMech("mech_gen1", { instanceId: "m1" }), m2],
    circuits: [mkCircuit("c-in", "m2"), mkCircuit("c-m1", "m1")],
  });
  const url = buildExploreToHubWearUrl({
    returnKind: "abort",
    mechWear: [{ instanceId: "m1", durabilityAfter: 80 }, { instanceId: "m2", durabilityAfter: 0 }],
    sortieId: "s-wreck-1",
    lostMechs: [{ instanceId: "m2", currentAmmo: 5, battery, circuitIds: ["c-in"], kind: "wreck", pos: { x: 640, y: 420 } }],
    frontSeed: 4242,
    cell: { sx: 2, sy: -1 },
  }, "https://estg.invalid/trade/");
  const payload = parseExploreToHubWearSearch(new URL(url).search)!;
  assert.equal(payload.lostMechs![0]!.kind, "wreck");
  assert.deepEqual(payload.lostMechs![0]!.pos, { x: 640, y: 420 });
  const r = applyExploreReturnToHub(h0, payload);
  assert.equal(r.applied, true);
  const h = normalizeHubSnapshot(r.hub);
  assert.equal(h.fleet.some((m) => m.instanceId === "m2"), false, "W1 A: out of the hangar list");
  const row = h.lostMechs.find((m) => m.instanceId === "m2")!;
  assert.equal(row.kind, "wreck");
  assert.deepEqual(row.pos, { x: 640, y: 420 });
  assert.equal(row.frontSeed, 4242);
  assert.deepEqual(row.cell, { sx: 2, sy: -1 });
  assert.equal(row.durability, 0);
  assert.equal(row.status, "destroyed");
  assert.deepEqual(row.circuitIds, ["c-in"]);
  assert.equal(h.circuits.find((c) => c.circuitId === "c-in")!.equippedTo, "m2", "circuit inside the wreck");
  assert.equal(h.fieldDrops.length, 0, "no circuit-only drop");
  assert.deepEqual(hubVisibleCircuits(h).map((c) => c.circuitId), ["c-m1"], "W5 A: not listed / counted");
  assert.deepEqual(
    aggregateCircuitBonuses(hubVisibleCircuits(h)),
    aggregateCircuitBonuses(hubVisibleCircuits(normalizeHubSnapshot({ ...h, circuits: h.circuits.filter((c) => c.circuitId !== "c-in") }))),
    "W5 A: no bonus from a wreck's circuit",
  );
  assert.equal(applyExploreReturnToHub(h, payload).applied, false, "once per sortieId");
  // saved and loaded again: unchanged
  const st = memStore();
  assert.ok(saveHubSaveToLocalStorage(h, st));
  assert.deepEqual(normalizeHubSnapshot(loadHubSaveFromLocalStorage(st)!.hub), h);
  console.log("wreck (4) wreck row applied once, circuits inside ok");

  // (5) W7 A: a recovered wreck rejoins the fleet destroyed with its circuit;
  // scrapping (mech removed) moves the circuit to the stash.
  const rec = recoverLostMechs(h, ["m2"]);
  assert.deepEqual(rec.recovered, ["m2"]);
  const hull = rec.hub.fleet.find((m) => m.instanceId === "m2")!;
  assert.equal(hull.status, "destroyed");
  assert.equal(hull.durability, 0);
  assert.equal(rec.hub.circuits.find((c) => c.circuitId === "c-in")!.equippedTo, "m2");
  assert.equal(rec.hub.lostMechs.length, 0);
  const scrapped = normalizeHubSnapshot({ ...rec.hub, fleet: rec.hub.fleet.filter((m) => m.instanceId !== "m2") });
  assert.equal(scrapped.circuits.find((c) => c.circuitId === "c-in")!.equippedTo, null, "scrap → stash");
  console.log("wreck (5) recovered wreck = destroyed with circuits; scrap → stash ok");

  // (6) W3 C helper: wrecks vanish with their circuits; left-behind rows stay.
  const withLeft = normalizeHubSnapshot({
    ...h,
    circuits: [...h.circuits, mkCircuit("c-left", "left-9")],
    lostMechs: [...h.lostMechs, { instanceId: "left-9", currentAmmo: 1, battery, circuitIds: ["c-left"], frontSeed: 4242, cell: { sx: 0, sy: 0 } }],
  });
  const swept = removeWreckRows(withLeft, () => true);
  assert.deepEqual(swept.removed, ["m2"]);
  assert.deepEqual(swept.removedCircuitIds, ["c-in"]);
  assert.equal(swept.hub.circuits.some((c) => c.circuitId === "c-in"), false, "circuits gone with the wreck (not stashed)");
  assert.deepEqual(swept.hub.lostMechs.map((m) => m.instanceId), ["left-9"]);
  assert.equal(swept.hub.circuits.find((c) => c.circuitId === "c-left")!.equippedTo, "left-9");
  assert.equal(removeWreckRows(swept.hub, () => true).hub, swept.hub, "nothing left to remove → same hub");
  console.log("wreck (6) removeWreckRows ok");
}

// (7) W4 A: a wreck row without a place (not via Invade) is lost outright with its circuits.
{
  const h0 = normalizeHubSnapshot({
    ...INITIAL_HUB,
    fleet: [{ ...createOwnedMech("mech_gen1", { instanceId: "m3" }), battery }],
    circuits: [mkCircuit("c-x", "m3")],
  });
  const r = applySortieReport(h0, {
    sortieId: "s-direct-wreck",
    cell: null,
    frontSeed: null,
    lostMechInstanceIds: [],
    lostCause: {},
    recoveredDropIds: [],
    acquiredCircuits: [],
    lostMechs: [{ instanceId: "m3", currentAmmo: 0, battery, circuitIds: ["c-x"], kind: "wreck", pos: { x: 1, y: 2 } }],
  });
  assert.equal(r.applied, true);
  assert.equal(r.hub.fleet.length, 0);
  assert.equal(r.hub.lostMechs.length, 0);
  assert.deepEqual(r.lostForever.map((c) => c.circuitId), ["c-x"]);
  assert.equal(r.hub.circuits.length, 0);
  assert.equal(r.hub.fieldDrops.length, 0);
  console.log("wreck (7) placeless wreck lost outright ok");
}
