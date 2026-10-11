/**
 * fix/circuit-ammo-activity-refill (神宮 10/12 07:32): per-mech ammo vs the
 * 「弾薬」 stock, circuit swaps, the one-time M6 repair and save compatibility.
 */
import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  MECH_AMMO_MAX_CAPACITY,
  ammoShortLineJa,
  ammoStock,
  applyExploreReturnToHub,
  circuitHEdgeIndex,
  circuitVEdgeIndex,
  createHubSave,
  edgeCount,
  encodeEdgeState,
  equipCircuit,
  mechAmmoCap,
  normalizeCurrentAmmo,
  normalizeHubSnapshot,
  parseHubSave,
  previewAmmoShort,
  refillFleetAmmo,
  reloadMechAmmo,
  toExploreToHubWearPayload,
  unequipCircuit,
  type CircuitBoardState,
  type EdgeMark,
  type HubCircuitRecord,
  type HubSnapshot,
  type OwnedMech,
} from "./index";

function perimeter(n: number): string {
  const m = Array.from({ length: edgeCount(n, n) }, () => 0 as EdgeMark);
  for (let x = 0; x < n; x++) { m[circuitHEdgeIndex(n, n, x, 0)] = 1; m[circuitHEdgeIndex(n, n, x, n)] = 1; }
  for (let y = 0; y < n; y++) { m[circuitVEdgeIndex(n, n, 0, y)] = 1; m[circuitVEdgeIndex(n, n, n, y)] = 1; }
  return encodeEdgeState(m);
}
function gun(id: string, key: "mmr" | "lmg", equippedTo: string | null = null): HubCircuitRecord {
  const circuitBoard = { v: 1, cols: 4, rows: 4, edgeState: perimeter(4), puzzleId: `pz-${id}`, outcome: "bypass" } as unknown as CircuitBoardState;
  return { circuitId: id, circuitBoard, restoreState: "bypass", origin: "crafted", equippedTo, effectKey: key } as unknown as HubCircuitRecord;
}
function mech(id: string, over: Partial<OwnedMech> = {}): OwnedMech {
  return { instanceId: id, catalogId: "mech_gen1", status: "operational", durability: 100, durabilityMax: 100, battery: { capacity: 300, activity: 300 }, ...over } as OwnedMech;
}
const ammoOf = (h: HubSnapshot, id: string) => h.fleet.find((m) => m.instanceId === id)?.currentAmmo;
const total = (h: HubSnapshot) => ammoStock(h) + h.fleet.reduce((n, m) => n + (m.currentAmmo ?? 0), 0);

// caps: base 28 × gun (MMR ÷5, LMG ×2); no release ×0.5 in the hangar
{
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("a"), mech("b"), mech("c")], circuits: [gun("g-mmr", "mmr", "a"), gun("g-lmg", "lmg", "b")], ammoBatteryRepaired: true } as never);
  assert.equal(mechAmmoCap(hub, "a"), 6, "MMR 28÷5");
  assert.equal(mechAmmoCap(hub, "b"), 56, "LMG 28×2");
  assert.equal(mechAmmoCap(hub, "c"), 28);
  assert.equal(MECH_AMMO_MAX_CAPACITY, 56);
  assert.equal(normalizeCurrentAmmo(999), 56, "transport clamp = largest per-mech cap");
  assert.equal(ammoOf(hub, "b"), 56, "LMG keeps 56 (save clamp is per mech)");
}
console.log("mech-ammo caps ok");

// compat: an old save without currentAmmo and with an inflated battery → M6 once
{
  const raw = {
    v: 3,
    savedAt: "2026-10-01T00:00:00.000Z",
    hub: {
      ...INITIAL_HUB,
      fleet: [
        mech("old-a", { battery: { capacity: 450, activity: 420 } }),
        mech("old-b", { currentAmmo: 1, battery: { capacity: 675, activity: 10 } }),
        mech("old-c", { currentAmmo: 40 }),
      ],
      circuits: [gun("g-old-mmr", "mmr", "old-b")],
      inventory: { ammo: 3 },
      lostMechs: [{ instanceId: "wreck-1", catalogId: "mech_gen1", durability: 0, durabilityMax: 100, status: "destroyed", kind: "wreck", currentAmmo: 4, battery: { capacity: 450, activity: 400 }, circuitIds: [], frontSeed: 1, cell: { sx: 0, sy: 0 }, lostAt: "2026-10-01T00:00:00.000Z" }],
    },
  };
  const first = parseHubSave(raw)!;
  assert.ok(first, "old save loads");
  const h = first.hub;
  assert.equal(h.ammoBatteryRepaired, true, "M6 marks the save");
  assert.equal(ammoOf(h, "old-a"), 28, "no currentAmmo → full at its cap");
  assert.equal(ammoOf(h, "old-b"), 6, "MMR 1 → topped up to 6 as a grant (M6)");
  assert.equal(ammoOf(h, "old-c"), 28, "over the cap → cap");
  assert.equal(ammoStock(h), 3 + 12, "the excess goes to the stock; the grant is not taken from it");
  assert.deepEqual(h.fleet.find((m) => m.instanceId === "old-a")!.battery, { capacity: 300, activity: 300 }, "battery >300 → 300");
  assert.deepEqual(h.fleet.find((m) => m.instanceId === "old-b")!.battery, { capacity: 300, activity: 10 });
  const wreck = h.lostMechs.find((l) => l.instanceId === "wreck-1")!;
  assert.ok(wreck, "wreck row survives");
  assert.equal(wreck.battery.capacity, 300, "wreck battery repaired too");
  assert.equal(wreck.currentAmmo, 4, "a wreck keeps its ammo");
  assert.deepEqual(h.circuits.find((c) => c.circuitId === "g-old-mmr")?.equippedTo, "old-b", "circuits untouched");

  // M6 runs only once: a later low value / over-300 battery is not repaired again
  const later = normalizeHubSnapshot({
    ...h,
    fleet: h.fleet.map((m) => (m.instanceId === "old-a" ? { ...m, currentAmmo: 5, battery: { capacity: 450, activity: 300 } } : m)),
  });
  assert.equal(ammoOf(later, "old-a"), 5, "no second grant");
  assert.equal(later.fleet.find((m) => m.instanceId === "old-a")!.battery.capacity, 450, "no second battery repair");
  const rt = parseHubSave(JSON.parse(JSON.stringify(createHubSave(later))))!;
  assert.equal(rt.hub.ammoBatteryRepaired, true, "flag persists");
  assert.equal(ammoOf(rt.hub, "old-a"), 5);
  assert.equal(ammoStock(normalizeHubSnapshot(normalizeHubSnapshot(later))), ammoStock(later), "normalize is idempotent");
}
console.log("mech-ammo M6 once ok");

// equip / swap / unequip: return to the stock, reload up to the new cap (M5); total unchanged
for (const key of ["mmr", "lmg"] as const) {
  let hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("m1", { currentAmmo: 20 }), mech("m2", { currentAmmo: 28 })], circuits: [gun("g", key)], inventory: { ammo: 50 }, ammoBatteryRepaired: true } as never);
  const t0 = total(hub);
  const eq = equipCircuit(hub, "g", "m1");
  assert.ok(eq.ok);
  hub = eq.hub;
  assert.equal(ammoOf(hub, "m1"), key === "mmr" ? 6 : 56, `${key}: loads up to the new cap`);
  assert.equal(total(hub), t0, `${key}: equip keeps ammo + stock`);
  const swap = equipCircuit(hub, "g", "m2");
  hub = swap.hub;
  assert.equal(ammoOf(hub, "m1"), 28, `${key}: the old holder reloads to 28`);
  assert.equal(ammoOf(hub, "m2"), key === "mmr" ? 6 : 56);
  assert.equal(total(hub), t0, `${key}: swap keeps ammo + stock`);
  hub = unequipCircuit(hub, "g");
  assert.equal(ammoOf(hub, "m2"), 28, `${key}: unequip reloads to 28`);
  assert.equal(total(hub), t0, `${key}: equip → remove keeps ammo + stock`);
}
// short stock: load what there is (M2); M5 reload even when the cap does not change
{
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("s1", { currentAmmo: 6 })], circuits: [gun("g", "lmg")], ammoBatteryRepaired: true } as never);
  const r = equipCircuit(hub, "g", "s1").hub;
  assert.equal(ammoOf(r, "s1"), 6, "LMG cap 56 but only 6 rounds → 6");
  const same = reloadMechAmmo(r, "s1");
  assert.equal(ammoOf(same.hub, "s1"), 6);
  assert.equal(same.moved, 0);
  assert.deepEqual(same.row, { instanceId: "s1", have: 6, cap: 56 });
}
// destroyed mech: equip / unequip still return and reload
{
  let hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("d1", { status: "destroyed", durability: 0, currentAmmo: 28 })], circuits: [gun("g", "mmr")], inventory: { ammo: 2 }, ammoBatteryRepaired: true } as never);
  const t0 = total(hub);
  const eq = equipCircuit(hub, "g", "d1");
  assert.ok(eq.ok, "equip on a destroyed mech works as before");
  hub = eq.hub;
  assert.equal(ammoOf(hub, "d1"), 6);
  assert.equal(ammoStock(hub), 24);
  hub = unequipCircuit(hub, "g");
  assert.equal(ammoOf(hub, "d1"), 28, "unequip on a destroyed mech reloads from the stock");
  assert.equal(ammoStock(hub), 2);
  assert.equal(total(hub), t0);
  // M3 auto top-up skips destroyed mechs
  const low = normalizeHubSnapshot({ ...hub, fleet: hub.fleet.map((m) => ({ ...m, currentAmmo: 3 })) });
  assert.deepEqual(refillFleetAmmo(low).short, []);
  assert.equal(ammoOf(refillFleetAmmo(low).hub, "d1"), 3);
}
console.log("mech-ammo equip/swap/unequip ok");

// repeated sorties do not compound the ammo or battery caps (return = M3 top-up)
{
  let hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("r1"), mech("r2")], circuits: [gun("g", "mmr", "r1")], inventory: { ammo: 100 }, ammoBatteryRepaired: true } as never);
  for (let i = 1; i <= 3; i++) {
    const payload = toExploreToHubWearPayload("extract", [{ instanceId: "r1", durabilityAfter: 100 }, { instanceId: "r2", durabilityAfter: 100 }], {
      sortieId: `sortie-${i}`,
      mechCurrentAmmo: [{ instanceId: "r1", currentAmmo: ammoOf(hub, "r1")! - 2 }, { instanceId: "r2", currentAmmo: 20 }],
      mechBattery: [{ instanceId: "r1", battery: { capacity: 300, activity: 200 } }],
    });
    const back = applyExploreReturnToHub(hub, payload);
    assert.ok(back.applied);
    hub = normalizeHubSnapshot(back.hub);
    assert.equal(ammoOf(hub, "r1"), 6, `sortie ${i}: MMR stays 6 (no 28 → 6 → 1)`);
    assert.equal(ammoOf(hub, "r2"), 28, `sortie ${i}: auto top-up to 28`);
    assert.equal(hub.fleet.find((m) => m.instanceId === "r1")!.battery.capacity, 300, `sortie ${i}: battery cap stays 300`);
    assert.equal(back.ammoShort, undefined, "enough stock: nobody short");
  }
  assert.equal(ammoStock(hub), 100 - 3 * (2 + 8));
  // short stock on return: rows reported
  const poor = normalizeHubSnapshot({ ...hub, inventory: {} });
  const back = applyExploreReturnToHub(poor, toExploreToHubWearPayload("extract", [{ instanceId: "r2", durabilityAfter: 100 }], { sortieId: "sortie-poor", mechCurrentAmmo: [{ instanceId: "r2", currentAmmo: 12 }] }));
  assert.deepEqual(back.ammoShort, [{ instanceId: "r2", have: 12, cap: 28 }]);
  assert.equal(ammoShortLineJa(back.ammoShort!, ["r1", "r2"]), "弾薬が足りません：僚機A 12/28");
  assert.deepEqual(previewAmmoShort(normalizeHubSnapshot(back.hub), ["r2", "r1"]), [{ instanceId: "r2", have: 12, cap: 28 }]);
  assert.equal(ammoShortLineJa([{ instanceId: "x", have: 0, cap: 6 }, { instanceId: "y", have: 3, cap: 28 }], ["x", "z", "y"]), "弾薬が足りません：隊長 0/6・僚機B 3/28");
  assert.equal(ammoShortLineJa([], ["r1"]), "");
}
console.log("mech-ammo repeated sorties ok");
console.log("mech-ammo selftest: ok");
