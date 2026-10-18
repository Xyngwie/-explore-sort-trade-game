import assert from "node:assert/strict";
import {
  emptyFieldObjectIdentities, normalizeFieldObjectIdentities, registerWreckIdentity,
  shieldIdentityFromWreck, resolveFieldObjectIdentity,
  INITIAL_HUB, normalizeHubSnapshot, createHubSave, serializeHubSave, parseHubSave,
  loadHubSaveWithStatus, saveHubSaveToLocalStorage,
  HUB_SAVE_STORAGE_KEY, HUB_SAVE_LEGACY_STORAGE_KEY,
} from "./index";

const at = new Date("2026-10-18T01:02:03.000Z");
assert.equal(normalizeFieldObjectIdentities(undefined), undefined);
assert.equal(normalizeHubSnapshot(INITIAL_HUB).fieldObjectIdentities, undefined, "no entities/events manufactured for old saves");
let state = registerWreckIdentity(emptyFieldObjectIdentities(), "first", { hp: 0, pos: { x: 3, y: 4 }, circuitIds: ["c1"] });
assert.equal(state.wrecks.first!.wreckId, "1");
assert.equal(state.nextWreckId, "2");
state = shieldIdentityFromWreck(state, "first", "shield-key", { hp: 20, maxHp: 50, pos: { x: 3, y: 4 } });
assert.equal(state.wrecks.first, undefined);
assert.deepEqual([state.shields["shield-key"]!.shieldId, state.shields["shield-key"]!.sourceWreckId,
  state.shields["shield-key"]!.generationOrder, state.shields["shield-key"]!.sourceWreckIdInferred], ["1", "1", "1", false]);
assert.throws(() => shieldIdentityFromWreck(state, "first", "other"), /Missing wreck/);
const serialized = JSON.stringify(state);
let resumed = normalizeFieldObjectIdentities(JSON.parse(serialized), at)!;
resumed = registerWreckIdentity(resumed, "second");
resumed = shieldIdentityFromWreck(resumed, "second", "shield-two");
assert.equal(resumed.shields["shield-two"]!.generationOrder, "2");
// Removing all current field records (e.g. regeneration) keeps high-water counters.
const emptied = { ...resumed, wrecks: {}, shields: {} };
assert.equal(registerWreckIdentity(emptied, "after-reset").wrecks["after-reset"]!.wreckId, "3");
// Copy/rollback uses exactly the saved counter, not a global clock or unrelated branch.
assert.equal(registerWreckIdentity(JSON.parse(serialized), "copy").wrecks.copy!.wreckId, "2");
assert.equal(registerWreckIdentity(JSON.parse(serialized), "rollback").wrecks.rollback!.wreckId, "2");
assert.equal(JSON.stringify(state), serialized, "allocation doesn't mutate the caller's save");
const unusualKey = registerWreckIdentity(resumed, "__proto__");
assert(resolveFieldObjectIdentity(unusualKey, { kind: "wreck", key: "__proto__" }));
assert.throws(() => registerWreckIdentity(unusualKey, "__proto__"), /already exists/);

const corrupted = {
  nextWreckId: 1,
  nextShieldOrder: "20",
  wrecks: {
    a: { wreckId: 7, pos: { x: 8, y: 9 }, circuitIds: ["keep-me"] },
    b: { wreckId: 7, stripProgress: 3.5 },
    other: { wreckId: 10 },
  },
  shields: {
    newer: { shieldId: 7, sourceWreckId: 99, generationOrder: 3, hp: 12, maxHp: 50, carrierKey: "wing-1" },
    oldest: { shieldId: 7, generationOrder: 1, hp: 44, pos: { x: 50, y: 60 } },
  },
  repairLogs: [],
};
const fixed = normalizeFieldObjectIdentities(corrupted, at)!;
assert.equal(fixed.shields.oldest!.shieldId, "7", "oldest shield wins");
assert.equal(fixed.shields.newer!.shieldId, "11");
assert.equal(fixed.shields.newer!.sourceWreckId, "99", "provenance is not a live reference");
assert.equal(fixed.shields.oldest!.sourceWreckId, "7");
assert.equal(fixed.shields.oldest!.sourceWreckIdInferred, true);
assert.equal(fixed.wrecks.a!.wreckId, "12", "shield wins cross-kind collision");
assert.equal(fixed.wrecks.b!.wreckId, "13");
assert.equal(fixed.wrecks.other!.wreckId, "10");
assert.equal(fixed.nextWreckId, "14");
assert.deepEqual(fixed.wrecks.a!.circuitIds, ["keep-me"]);
assert.equal(fixed.wrecks.b!.stripProgress, 3.5);
assert.equal(fixed.shields.newer!.hp, 12);
assert.equal(fixed.shields.newer!.carrierKey, "wing-1");
const ref = { kind: "wreck" as const, key: "a" };
assert.equal(resolveFieldObjectIdentity(fixed, ref), fixed.wrecks.a, "references resolve same record after ID change");
assert.equal(resolveFieldObjectIdentity(fixed, { kind: "wreck", key: "toString" }), undefined);
assert.equal(fixed.repairLogs.length, 1);
assert.equal(fixed.repairLogs[0]!.at, at.toISOString());
assert.equal(fixed.repairLogs[0]!.severity, "error");
assert.deepEqual(fixed.repairLogs[0]!.counts, { counter: 1, duplicate: 3, source: 1 });
assert.deepEqual(normalizeFieldObjectIdentities(fixed, new Date("2030-01-01")), fixed, "normalization/reload is idempotent");
// Missing source on a reassigned shield comes from its repaired CURRENT shield ID.
const missingSource = normalizeFieldObjectIdentities({ nextWreckId: "20", nextShieldOrder: "4", wrecks: {}, shields: {
  a: { shieldId: "7", generationOrder: "1", sourceWreckId: "7" },
  b: { shieldId: "7", generationOrder: "2", hp: 1 },
} }, at)!;
assert.equal(missingSource.shields.b!.sourceWreckId, "20");
assert.equal(missingSource.shields.b!.sourceWreckIdInferred, true);
assert.equal(normalizeFieldObjectIdentities({ wrecks: {}, shields: {} }, at)!.nextWreckId, "1");
assert.equal(normalizeFieldObjectIdentities({ wrecks: {}, shields: { x: { shieldId: "9", generationOrder: "1" } } }, at)!.nextWreckId, "10");
assert.equal(normalizeFieldObjectIdentities({ ...emptyFieldObjectIdentities(), nextWreckId: "100" }, at)!.nextWreckId, "100");
// IDs past JS's safe-integer limit remain exact in JSON and increment monotonically.
const huge = registerWreckIdentity({ ...emptyFieldObjectIdentities(), nextWreckId: "90071992547409931234" }, "huge");
assert.equal(huge.wrecks.huge!.wreckId, "90071992547409931234");
assert.equal(huge.nextWreckId, "90071992547409931235");
assert.throws(() => normalizeFieldObjectIdentities({ shields: { a: { shieldId: "1" } } }), /generation order/,
  "don't invent which shield is oldest if the required historical order is absent");

function storage() {
  const map = new Map<string, string>();
  return { map, getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); } };
}
const store = storage();
const rawSave = { v: 3, savedAt: at.toISOString(), hub: { ...INITIAL_HUB, fieldObjectIdentities: corrupted } };
store.setItem(HUB_SAVE_STORAGE_KEY, JSON.stringify(rawSave));
const loaded = loadHubSaveWithStatus(store, at);
assert.equal(loaded.status, "ok");
assert.deepEqual(loaded.save!.hub.fieldObjectIdentities, fixed);
assert.equal(loaded.fieldIdentityRepairSaveFailed, undefined);
assert.equal(JSON.parse(store.getItem(HUB_SAVE_STORAGE_KEY)!).hub.fieldObjectIdentities.repairLogs.length, 1);
assert.equal(loadHubSaveWithStatus(store, new Date("2030-01-01")).save!.hub.fieldObjectIdentities!.repairLogs.length, 1);
const savedHub = normalizeHubSnapshot({ ...INITIAL_HUB, fieldObjectIdentities: fixed });
assert(saveHubSaveToLocalStorage(savedHub, store));
assert.deepEqual(loadHubSaveWithStatus(store).save!.hub.fieldObjectIdentities, fixed);
assert.equal(serializeHubSave(createHubSave(savedHub, at)), serializeHubSave(createHubSave(savedHub, at)));
// Quota / read-only failures don't destroy original save, and aren't claimed persisted.
const badStore = storage();const original = JSON.stringify(rawSave);badStore.setItem(HUB_SAVE_STORAGE_KEY, original);
const failure = loadHubSaveWithStatus({ getItem: badStore.getItem, setItem: () => { throw new Error("quota"); } }, at);
assert.equal(failure.fieldIdentityRepairSaveFailed, true);
assert.equal(badStore.getItem(HUB_SAVE_STORAGE_KEY), original);
assert.equal(failure.save!.hub.fieldObjectIdentities!.repairLogs.length, 1);
const readOnly = loadHubSaveWithStatus({ getItem: badStore.getItem }, at);
assert.equal(readOnly.fieldIdentityRepairSaveFailed, true);
// Future version is never auto-written. Legacy migration preserves its original key.
const future = storage();const futureRaw = JSON.stringify({ ...rawSave, v: 4 });future.setItem(HUB_SAVE_STORAGE_KEY, futureRaw);
assert.equal(loadHubSaveWithStatus(future, at).status, "newer_read_only");
assert.equal(future.getItem(HUB_SAVE_STORAGE_KEY), futureRaw);
assert.equal(saveHubSaveToLocalStorage(savedHub, future), false);
const legacy = storage();legacy.setItem(HUB_SAVE_LEGACY_STORAGE_KEY, JSON.stringify({ ...rawSave, v: 2 }));
assert.equal(loadHubSaveWithStatus(legacy, at).status, "migrated");
assert(legacy.getItem(HUB_SAVE_STORAGE_KEY));
assert.equal(JSON.parse(legacy.getItem(HUB_SAVE_LEGACY_STORAGE_KEY)!).v, 2);
const brokenFuture = storage();
brokenFuture.setItem(HUB_SAVE_STORAGE_KEY, JSON.stringify({ ...rawSave, v: 4, hub: { ...INITIAL_HUB, fieldObjectIdentities: "unknown-new-format" } }));
assert.equal(loadHubSaveWithStatus(brokenFuture, at).status, "newer_read_only");
const legacyReadOnly = storage();legacyReadOnly.setItem(HUB_SAVE_LEGACY_STORAGE_KEY, JSON.stringify({ ...rawSave, v: 2 }));
assert.equal(loadHubSaveWithStatus({ getItem: legacyReadOnly.getItem }, at).fieldIdentityRepairSaveFailed, true);
const broken = storage();const brokenText = JSON.stringify({ ...rawSave, hub: { ...INITIAL_HUB, fieldObjectIdentities: { shields: { key: { shieldId: "1", hp: 20 } } } } });
broken.setItem(HUB_SAVE_STORAGE_KEY, brokenText);
const backedUp = loadHubSaveWithStatus(broken, at);
assert.equal(backedUp.status, "corrupt_backed_up");
assert.equal(broken.getItem(backedUp.backupKey!), brokenText, "unrepairable historical order is backed up without guessing or dropping its payload");
assert.equal(broken.getItem(HUB_SAVE_STORAGE_KEY), brokenText);

assert.equal(parseHubSave(JSON.parse(brokenText), at), null, "malformed saves return null rather than throwing");

assert.equal(fixed.repairLogs[0]!.repairs.find(r => r.target === "nextWreckId")!.after, "14", "diagnostic counter value matches the stored result");
console.log("field object IDs: monotonic/copy/rollback/order, collision/payload/references/provenance, persisted repair/idempotency/legacy/read-only/quota PASS");
