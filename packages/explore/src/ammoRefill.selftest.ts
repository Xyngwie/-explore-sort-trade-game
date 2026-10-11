/**
 * fix/circuit-ammo-activity-refill (神宮 10/12 07:32), Explore side:
 * - the sortie ammo cap is base 28 × gun × release scale; ammo is never thrown away
 * - the circuit battery boost is sortie-only (never written to mechBattery)
 * - repeated sorties do not compound; an old 5-3 checkpoint with a boosted battery loads
 * - 分配 shares ready rounds without discarding
 * - pre-sortie top-up for Explore-built squads (Invade link / 再出撃)
 */
import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  applyExploreReturnToHub,
  circuitHEdgeIndex,
  circuitVEdgeIndex,
  edgeCount,
  encodeEdgeState,
  loadHubSaveFromLocalStorage,
  makeRestoredTrueOneByOne,
  normalizeHubSnapshot,
  saveHubSaveToLocalStorage,
  type CircuitBoardState,
  type EdgeMark,
  type HubCircuitRecord,
  type HubSnapshot,
  type OwnedMech,
} from "@estg/shared";
import {
  attachCircuitPlay,
  effectiveBatteryCapacity,
  sortieAmmoCap,
  splitAmmo,
  stepCircuitPlay,
  usableAmmo,
} from "./game/circuitPlay";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { buildSortieOutcome, exploreReturnPayload } from "./game/outcome";
import { refillBeforeSortie } from "./game/preSortieAmmo";
import { tickWorld } from "./game/sim";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import type { World } from "./game/types";

const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };

function perimeter(n: number): string {
  const m = Array.from({ length: edgeCount(n, n) }, () => 0 as EdgeMark);
  for (let x = 0; x < n; x++) { m[circuitHEdgeIndex(n, n, x, 0)] = 1; m[circuitHEdgeIndex(n, n, x, n)] = 1; }
  for (let y = 0; y < n; y++) { m[circuitVEdgeIndex(n, n, 0, y)] = 1; m[circuitVEdgeIndex(n, n, n, y)] = 1; }
  return encodeEdgeState(m);
}
function circuit(id: string, key: string, equippedTo: string): HubCircuitRecord {
  const circuitBoard = { v: 1, cols: 4, rows: 4, edgeState: perimeter(4), puzzleId: `pz-${id}`, outcome: "bypass" } as unknown as CircuitBoardState;
  return { circuitId: id, circuitBoard, restoreState: "bypass", origin: "crafted", equippedTo, effectKey: key } as unknown as HubCircuitRecord;
}
function mech(id: string, over: Partial<OwnedMech> = {}): OwnedMech {
  return { instanceId: id, catalogId: "mech_gen1", durability: 100, durabilityMax: 100, status: "operational", battery: { capacity: 300, activity: 300 }, ...over } as OwnedMech;
}
const trueCap = (): HubCircuitRecord => ({ ...makeRestoredTrueOneByOne("t-cap"), equippedTo: "cap" });

/** Sortie from a hub the way trade's deploy link sends it (carried ammo / battery per mech). */
function sortieFrom(hub: HubSnapshot, release = true): World {
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  world.commandUnlock.mode = release ? "release" : "all_unlocked";
  const units = [world.leader, ...world.wingmen];
  world.deployedInstanceIds = [];
  hub.fleet.slice(0, units.length).forEach((m, i) => {
    const u = units[i]!;
    u.instanceId = m.instanceId;
    world.deployedInstanceIds.push(m.instanceId);
    world.deployedDurability[m.instanceId] = m.durability;
    world.currentAmmo[m.instanceId] = m.currentAmmo;
    world.mechBattery[m.instanceId] = { ...m.battery };
  });
  for (const e of world.enemies) e.alive = false;
  attachCircuitPlay(world, hub, release);
  return world;
}
function returnHome(hub: HubSnapshot, world: World, n: number): HubSnapshot {
  world.phase = "result";
  world.extracted = true;
  const payload = exploreReturnPayload(world)!;
  assert.ok(payload, "return payload");
  const back = applyExploreReturnToHub(hub, { ...payload, sortieId: `ammo-fix-${n}` });
  assert.ok(back.applied);
  return normalizeHubSnapshot(back.hub);
}

// MMR: two (three) sorties never keep cutting the ammo (old bug 28 → 6 → 1)
{
  let hub = normalizeHubSnapshot({
    ...INITIAL_HUB,
    fleet: [mech("cap"), mech("wa"), mech("wb")],
    circuits: [trueCap(), circuit("g-mmr", "mmr", "wa"), circuit("act2", "scout_activity", "wb")],
    inventory: { ammo: 40 },
    ammoBatteryRepaired: true,
  } as never);
  assert.equal(hub.fleet.find((m) => m.instanceId === "wa")!.currentAmmo, 6, "hangar: MMR 6");
  for (let n = 1; n <= 3; n++) {
    const w = sortieFrom(hub);
    for (let i = 0; i < 5; i++) stepCircuitPlay(w, 0.05);
    const wa = w.wingmen[0]!;
    assert.equal(w.currentAmmo.wa, 6, `sortie ${n}: carried 6 kept`);
    const cap = sortieAmmoCap(w, wa);
    assert.equal(usableAmmo(w, wa), Math.min(6, cap), `sortie ${n}: ready = min(carried, sortie cap ${cap})`);
    const wb = w.wingmen[1]!;
    const eff = effectiveBatteryCapacity(w, wb)!;
    assert.ok(eff > 150, `sortie ${n}: the activity boost applies in the sortie (300 × 1.03 × release 0.5 = ${eff})`);
    assert.equal(w.mechBattery.wb!.capacity, 300, `sortie ${n}: mechBattery keeps the pre-boost cap`);
    const out = buildSortieOutcome(w)!;
    assert.equal(out.mechBattery.find((r) => r.instanceId === "wb")!.battery.capacity, 300, `sortie ${n}: the return writes 300`);
    hub = returnHome(hub, w, n);
    assert.equal(hub.fleet.find((m) => m.instanceId === "wa")!.currentAmmo, 6, `after sortie ${n}: MMR still 6`);
    assert.equal(hub.fleet.find((m) => m.instanceId === "wb")!.battery.capacity, 300, `after sortie ${n}: battery cap 300 (no compounding)`);
  }
}
console.log("ammo-fix MMR repeated sorties ok");

// A legacy deploy URL with 28 rounds on an MMR mech: the extra 22 is held back, not destroyed
{
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("cap"), mech("wa")], circuits: [trueCap(), circuit("g-mmr", "mmr", "wa")], ammoBatteryRepaired: true } as never);
  const w = sortieFrom(hub, false);
  w.currentAmmo.wa = 28;
  stepCircuitPlay(w, 0.05);
  assert.equal(usableAmmo(w, w.wingmen[0]!), 6, "MMR: 6 ready");
  assert.equal(w.currentAmmo.wa, 28, "the rest stays with the mech");
  const back = returnHome(hub, w, 99);
  assert.equal(back.fleet.find((m) => m.instanceId === "wa")!.currentAmmo, 6);
  assert.equal(back.inventory.ammo, 22, "and goes to the stock at home");
}
// release ×0.5 (no 「4」): sortie-only, the held-back half goes home and is not lost
{
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("cap")], ammoBatteryRepaired: true } as never);
  const w = sortieFrom(hub, true);
  stepCircuitPlay(w, 0.05);
  assert.equal(usableAmmo(w, w.leader), 14);
  const back = returnHome(hub, w, 98);
  assert.equal(back.fleet[0]!.currentAmmo, 28, "release ×0.5 does not compound");
}
// a gun circuit cap change mid-sortie moves rounds between ready and held back
{
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("cap")], circuits: [trueCap()], ammoBatteryRepaired: true } as never);
  const w = sortieFrom(hub, true);
  stepCircuitPlay(w, 0.05);
  assert.equal(usableAmmo(w, w.leader), 28);
  w.circuitPlay!.loadout.leader = [...(w.circuitPlay!.loadout.leader ?? []), { circuitId: "x", effect: 4, r: 0.2, effectKey: "mmr", trueBoard: false, oneByOne: null, side: 4, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false } as never];
  stepCircuitPlay(w, 0.05);
  assert.equal(usableAmmo(w, w.leader), 6, "cap down: 22 held back");
  assert.equal(w.currentAmmo[w.leader.instanceId!], 28);
  w.circuitPlay!.loadout.leader = w.circuitPlay!.loadout.leader!.filter((c) => c.circuitId !== "x");
  stepCircuitPlay(w, 0.05);
  assert.equal(usableAmmo(w, w.leader), 28, "cap back up: held-back rounds are ready again");
}
console.log("ammo-fix no-discard ok");

// 分配: even split under caps, nothing thrown away
{
  assert.deepEqual(splitAmmo(30, [28, 28]), [15, 15]);
  assert.deepEqual(splitAmmo(31, [6, 28, 28]), [6, 13, 12]);
  assert.deepEqual(splitAmmo(70, [6, 28, 28]), [14, 28, 28], "a remainder nobody can take stays (held back by syncCaps)");
  assert.equal(splitAmmo(70, [6, 28, 28]).reduce((a, b) => a + b, 0), 70);
}
console.log("ammo-fix distribute ok");

// compat: a 5-3 checkpoint written before the fix (boosted mechBattery, old baseAmmo) loads
{
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("cap"), mech("wa")], circuits: [trueCap(), circuit("act2", "scout_activity", "wa")], ammoBatteryRepaired: true } as never);
  const w = sortieFrom(hub, true);
  assert.equal(hub.circuits.find((c) => c.circuitId === "act2")?.equippedTo, "wa");
  stepCircuitPlay(w, 0.05);
  const body = JSON.parse(JSON.stringify(snapshotSortieWorld(w))) as { mechBattery: Record<string, { capacity: number; activity: number }>; circuitPlay: Record<string, unknown> };
  body.mechBattery.wa = { capacity: 450, activity: 400 }; // the old syncCaps wrote the boost
  (body.circuitPlay.baseBattery as Record<string, number>).wa = 300;
  body.circuitPlay.baseAmmo = { cap: 28, wa: 28 };
  delete body.circuitPlay.ammoFloor;
  delete body.circuitPlay.ammoCapAt;
  const old = worldFromCheckpointBody(body)!;
  assert.ok(old, "old checkpoint restores");
  assert.equal(old.mechBattery.wa!.capacity, 300, "pre-boost battery cap restored");
  for (let i = 0; i < 10; i++) tickWorld(old, 0.05, idle);
  assert.equal(old.mechBattery.wa!.capacity, 300, "and not boosted again");
  assert.equal(buildSortieOutcome(old)!.mechBattery.find((r) => r.instanceId === "wa")!.battery.capacity, 300);
  // a checkpoint from an already inflated save (baseBattery 675) → 300
  const inflated = JSON.parse(JSON.stringify(body)) as typeof body;
  (inflated.circuitPlay.baseBattery as Record<string, number>).wa = 675;
  inflated.mechBattery.wa = { capacity: 1012, activity: 900 };
  assert.equal(worldFromCheckpointBody(inflated)!.mechBattery.wa!.capacity, 300);
}
console.log("ammo-fix old checkpoint ok");

// pre-sortie top-up for Explore-built squads (Invade link / 再出撃 from the save)
{
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("cap", { currentAmmo: 10 }), mech("wa", { currentAmmo: 0 })], inventory: { ammo: 20 }, ammoBatteryRepaired: true } as never);
  const r = refillBeforeSortie(hub, ["cap", "wa"], store);
  assert.equal(r.hub.fleet.find((m) => m.instanceId === "cap")!.currentAmmo, 28);
  assert.equal(r.hub.fleet.find((m) => m.instanceId === "wa")!.currentAmmo, 2);
  assert.equal(r.line, "弾薬が足りません：僚機A 2/28");
  const saved = normalizeHubSnapshot(loadHubSaveFromLocalStorage(store)!.hub);
  assert.equal(saved.fleet.find((m) => m.instanceId === "wa")!.currentAmmo, 2, "saved before the sortie");
  assert.equal(saved.inventory.ammo, undefined, "stock used up");
  void saveHubSaveToLocalStorage;
}
console.log("ammo-fix pre-sortie top-up ok");
console.log("ammoRefill.selftest ok");
