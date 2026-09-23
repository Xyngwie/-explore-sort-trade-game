import assert from "node:assert/strict";
import {
  HUB_SAVE_STORAGE_KEY,
  INITIAL_HUB,
  createHubSave,
  createOwnedMech,
  deserializeHubSave,
  normalizeHubSnapshot,
  serializeHubSave,
} from "@estg/shared";
import {
  ALL_DESTROYED_INTEL,
  armForcedLockHistory,
  clearForcedHandoffIntent,
  isForcedCombatLock,
  markForcedHandoffIntent,
  readHandoffIntent,
  resolveForcedBackWipe,
  wipeAllMechsDestroyed,
  withAllDestroyedIntel,
} from "./forced-combat";

function memStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  } as Storage;
}

assert.equal(isForcedCombatLock({ hitMine: false }), false);
assert.equal(isForcedCombatLock({ hitMine: true }), true);
assert.equal(
  isForcedCombatLock({ hitMine: true }, { handoffIntent: true }),
  false,
);

assert.deepEqual(withAllDestroyedIntel(undefined), [ALL_DESTROYED_INTEL]);
assert.deepEqual(withAllDestroyedIntel(["scoutHazard"]), [
  "scoutHazard",
  ALL_DESTROYED_INTEL,
]);
assert.deepEqual(withAllDestroyedIntel([ALL_DESTROYED_INTEL]), [
  ALL_DESTROYED_INTEL,
]);

{
  const fleet = [
    createOwnedMech("mech_gen1", { instanceId: "m1", durability: 80 }),
    createOwnedMech("mech_gen1", { instanceId: "m2", durability: 50 }),
  ];
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet });
  const storage = memStorage({
    [HUB_SAVE_STORAGE_KEY]: serializeHubSave(createHubSave(hub)),
  });
  const wipe = wipeAllMechsDestroyed(storage);
  assert.equal(wipe.wipedCount, 2);
  assert.ok(wipe.mechWear.every((w) => w.durabilityAfter === 0));
  const saved = deserializeHubSave(storage.getItem(HUB_SAVE_STORAGE_KEY)!);
  assert.ok(saved);
  assert.ok(saved!.hub.fleet.every((m) => m.durability === 0));
  assert.ok(saved!.hub.fleet.every((m) => m.status === "destroyed"));
}

{
  const fleet = [
    createOwnedMech("mech_gen1", { instanceId: "a", durability: 90 }),
  ];
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet });
  const storage = memStorage({
    [HUB_SAVE_STORAGE_KEY]: serializeHubSave(createHubSave(hub)),
  });
  const session = memStorage();
  const resolved = resolveForcedBackWipe({
    board: { hitMine: true },
    sector: {
      sectorX: 3,
      sectorY: -2,
      density: 0.4,
      intelFlags: ["scoutHazard"],
    },
    storage,
    session,
    tradeBaseUrl: "http://localhost:5175/",
  });
  assert.ok(resolved);
  assert.equal(resolved!.wipe.wipedCount, 1);
  const u = new URL(resolved!.url);
  assert.equal(u.searchParams.get("sectorX"), "3");
  assert.equal(u.searchParams.get("returnKind"), "fail");
  assert.ok((u.searchParams.get("mechWear") ?? "").includes("a"));
  const flags = (u.searchParams.get("intelFlags") ?? "").split(",");
  assert.ok(flags.includes(ALL_DESTROYED_INTEL));
}

{
  const session = memStorage();
  markForcedHandoffIntent(session);
  assert.equal(readHandoffIntent(session), true);
  const resolved = resolveForcedBackWipe({
    board: { hitMine: true },
    sector: { sectorX: 0, sectorY: 0, density: 0 },
    storage: memStorage(),
    session,
  });
  assert.equal(resolved, null);
  assert.equal(readHandoffIntent(session), false);
  clearForcedHandoffIntent(session);
}

{
  const states: unknown[] = [null];
  const historyLike = {
    get state() {
      return states[states.length - 1] ?? null;
    },
    pushState(state: unknown) {
      states.push(state);
    },
  };
  assert.equal(armForcedLockHistory(historyLike, "http://x/"), true);
  assert.equal(armForcedLockHistory(historyLike, "http://x/"), false);
  assert.equal(states.length, 2);
}

console.log("invade forced-combat.selftest ok");
