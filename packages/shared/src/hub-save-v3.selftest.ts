/**
 * HubSave v3 contract selftest (docs/HUB_SAVE_CONTRACT.md §12,
 * docs/CIRCUIT_DATA_MODEL_V0.md impl A).
 */
import assert from "node:assert/strict";
import {
  HUB_SAVE_CORRUPT_KEY_PREFIX,
  HUB_SAVE_LEGACY_STORAGE_KEY,
  HUB_SAVE_STORAGE_KEY,
  HUB_LIMITS,
  HANDOFF_QUERY_KEYS,
  INITIAL_HUB,
  applySortieReport,
  buildMechCircuitsForDeploy,
  buildSizedTruePuzzleId,
  buildTradeToExploreUrl,
  buildVerifyPerfectLockedBoard,
  circuitActiveEffect,
  circuitEffectValue,
  circuitHEdgeIndex,
  circuitVEdgeIndex,
  clearHubSaveFromLocalStorage,
  computeCircuitEffectForBoard,
  craftMaxSize,
  createHubSave,
  deserializeHubSave,
  edgeCount,
  encodeEdgeState,
  encodeMechCircuitsCompact,
  equipCircuit,
  hashSeed,
  loadHubSaveFromLocalStorage,
  loadHubSaveWithStatus,
  normalizeHubSnapshot,
  parseHubSave,
  parseMechCircuitsCompact,
  parseTradeToExploreSearch,
  recordPerfectSize,
  recoverFieldDrops,
  resolveCluesForCircuitBoard,
  resolveSizedTruePuzzle,
  saveHubSaveToLocalStorage,
  serializeHubSave,
  unequipCircuit,
  upsertCircuitIntoHub,
  type CircuitBoardState,
  type EdgeMark,
  type HubSnapshot,
  type MechCircuitEntry,
  type OwnedMech,
} from "./index";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  keys(): string[] {
    return [...this.m.keys()];
  }
}

function emptyMarks(n: number): EdgeMark[] {
  return Array.from({ length: edgeCount(n, n) }, () => 0 as EdgeMark);
}

function perimeterEdgeState(n: number): string {
  const m = emptyMarks(n);
  for (let x = 0; x < n; x++) {
    m[circuitHEdgeIndex(n, n, x, 0)] = 1;
    m[circuitHEdgeIndex(n, n, x, n)] = 1;
  }
  for (let y = 0; y < n; y++) {
    m[circuitVEdgeIndex(n, n, 0, y)] = 1;
    m[circuitVEdgeIndex(n, n, n, y)] = 1;
  }
  return encodeEdgeState(m);
}

function board(n: number, puzzleId: string, extra: Partial<CircuitBoardState> = {}): CircuitBoardState {
  return { v: 1, cols: n, rows: n, edgeState: perimeterEdgeState(n), puzzleId, ...extra };
}

function mech(instanceId: string): OwnedMech {
  return { instanceId, catalogId: "mech_gen1", status: "operational", durability: 100, durabilityMax: 100 };
}

// ---------------------------------------------------------------------------
// Keys / constants
// ---------------------------------------------------------------------------
assert.equal(HUB_SAVE_STORAGE_KEY, "wreckline.hubSave.v3");
assert.equal(HUB_SAVE_LEGACY_STORAGE_KEY, "wreckline.hubSave.v1");
assert.equal(HUB_LIMITS.maxCircuits, 8, "maxCircuits kept (deprecated) for trade");
assert.ok((HANDOFF_QUERY_KEYS.tradeToExplore as readonly string[]).includes("mechCircuits"));
assert.equal(INITIAL_HUB.perfectMaxSize, 0);
assert.deepEqual(INITIAL_HUB.fieldDrops, []);

// ---------------------------------------------------------------------------
// v2 sample → v3 migration (from the legacy key)
// ---------------------------------------------------------------------------
const v2Circuits = [
  { circuitId: "c_fa4", circuitBoard: board(4, "p-fa4", { outcome: "fully_awakened", perfect: true, locked: true }), outcome: "fully_awakened", locked: true, lastEditorName: "職人" },
  { circuitId: "c_by6", circuitBoard: board(6, "p-by6", { outcome: "bypass" }), outcome: "bypass" },
  { circuitId: "c_off3", circuitBoard: board(3, "p-off3", { outcome: "offline" }), outcome: "offline" },
  { circuitId: "c_fa8_unlocked", circuitBoard: board(8, "p-fa8", { outcome: "fully_awakened" }), outcome: "fully_awakened" },
  { circuitId: "c_broken", circuitBoard: { v: 1, cols: 0, rows: 0, edgeState: "" }, outcome: "bypass" },
  ...Array.from({ length: 6 }, (_, i) => ({
    circuitId: `c_extra_${i}`,
    circuitBoard: board(2, `p-extra-${i}`, { outcome: "bypass" }),
    outcome: "bypass",
  })),
];
const v2Hub = {
  credits: 321,
  materials: 7,
  fleet: [mech("owned_a"), mech("owned_b")],
  circuits: v2Circuits,
  unopenedContainers: 2,
  frontProgress: { seed: 99, cols: 8, rows: 8, cleared: [], mined: [] },
};
const v2Save = { v: 2, savedAt: "2026-09-01T00:00:00.000Z", hub: v2Hub };
const v2Text = JSON.stringify(v2Save);

{
  const store = new MemStorage();
  store.setItem(HUB_SAVE_LEGACY_STORAGE_KEY, v2Text);
  const res = loadHubSaveWithStatus(store);
  assert.equal(res.status, "migrated");
  assert.equal(res.save!.v, 3);
  const hub = res.save!.hub;
  // 10 valid circuits kept (no 8-cap), broken one dropped singly.
  assert.equal(hub.circuits.length, 10);
  assert.equal(res.droppedCircuits, 1);
  assert.ok(!hub.circuits.some((c) => c.circuitId === "c_broken"));
  for (const c of hub.circuits) {
    assert.equal(c.origin, "legacy");
    assert.equal(c.equippedTo, null);
  }
  const off = hub.circuits.find((c) => c.circuitId === "c_off3")!;
  assert.equal(off.restoreState, "offline", "U2: offline stays offline");
  const fa = hub.circuits.find((c) => c.circuitId === "c_fa4")!;
  assert.equal(fa.restoreState, "fully_awakened");
  assert.equal(fa.locked, true);
  assert.equal(fa.lastEditorName, "職人");
  // U11: perfectMaxSize from FA + locked only (unlocked 8×8 FA does not count).
  assert.equal(hub.perfectMaxSize, 4);
  assert.deepEqual(hub.fieldDrops, []);
  assert.equal(hub.credits, 321);
  assert.equal(hub.unopenedContainers, 2);
  // ③ migrated save written to the v3 key; legacy key untouched.
  assert.equal(store.getItem(HUB_SAVE_LEGACY_STORAGE_KEY), v2Text);
  const v3Text = store.getItem(HUB_SAVE_STORAGE_KEY);
  assert.ok(v3Text);
  assert.equal(JSON.parse(v3Text!).v, 3);
  // Idempotent migration.
  assert.deepEqual(parseHubSave(v2Save)!.hub, parseHubSave(v2Save)!.hub);
  // Next load reads the v3 key.
  assert.equal(loadHubSaveWithStatus(store).status, "ok");

  // Old-build tab writes the legacy key after v3 started → v3 unaffected.
  store.setItem(
    HUB_SAVE_LEGACY_STORAGE_KEY,
    JSON.stringify({ v: 2, savedAt: "2026-09-02T00:00:00.000Z", hub: { credits: 1, circuits: [] } }),
  );
  const after = loadHubSaveFromLocalStorage(store)!;
  assert.equal(after.hub.credits, 321);
  assert.equal(after.hub.circuits.length, 10);
  // New build saves never touch the legacy key.
  const legacyBefore = store.getItem(HUB_SAVE_LEGACY_STORAGE_KEY);
  assert.ok(saveHubSaveToLocalStorage({ ...after.hub, credits: 400 }, store));
  assert.equal(store.getItem(HUB_SAVE_LEGACY_STORAGE_KEY), legacyBefore);
  assert.equal(loadHubSaveFromLocalStorage(store)!.hub.credits, 400);

  // Reset clears both keys → no re-migration.
  clearHubSaveFromLocalStorage(store);
  assert.equal(store.getItem(HUB_SAVE_STORAGE_KEY), null);
  assert.equal(store.getItem(HUB_SAVE_LEGACY_STORAGE_KEY), null);
  assert.equal(loadHubSaveWithStatus(store).status, "empty");
}

// v1 sample (no circuits) and read-only storage (no setItem) migration.
{
  const v1 = { v: 1, savedAt: "2026-08-01T00:00:00.000Z", hub: { credits: 50, materials: 3 } };
  const ro = { getItem: (k: string) => (k === HUB_SAVE_LEGACY_STORAGE_KEY ? JSON.stringify(v1) : null) };
  const res = loadHubSaveWithStatus(ro);
  assert.equal(res.status, "migrated");
  assert.equal(res.save!.hub.credits, 50);
  assert.deepEqual(res.save!.hub.circuits, []);
  assert.equal(res.save!.hub.perfectMaxSize, 0);
}

// v3 key present → legacy never read.
{
  const store = new MemStorage();
  store.setItem(HUB_SAVE_LEGACY_STORAGE_KEY, v2Text);
  store.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(createHubSave({ ...INITIAL_HUB, credits: 9 })));
  const res = loadHubSaveWithStatus(store);
  assert.equal(res.status, "ok");
  assert.equal(res.save!.hub.credits, 9);
}

// Stored perfectMaxSize is kept (not re-derived downward after selling).
{
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, perfectMaxSize: 6, circuits: [] });
  assert.equal(hub.perfectMaxSize, 6);
  const round = deserializeHubSave(serializeHubSave(createHubSave(hub)))!;
  assert.equal(round.hub.perfectMaxSize, 6);
}

// ---------------------------------------------------------------------------
// Corrupt save → backed up, returns null
// ---------------------------------------------------------------------------
{
  const store = new MemStorage();
  store.setItem(HUB_SAVE_STORAGE_KEY, "{not json");
  const at = new Date("2026-09-28T01:02:03.000Z");
  const res = loadHubSaveWithStatus(store, at);
  assert.equal(res.status, "corrupt_backed_up");
  assert.equal(res.save, null);
  assert.equal(res.backupKey, `${HUB_SAVE_CORRUPT_KEY_PREFIX}2026-09-28T01:02:03.000Z`);
  assert.equal(store.getItem(res.backupKey!), "{not json");
  // Same corrupt text again → no second backup.
  const res2 = loadHubSaveWithStatus(store, new Date("2026-09-28T02:00:00.000Z"));
  assert.equal(res2.backupKey, res.backupKey);
  assert.equal(store.keys().filter((k) => k.startsWith(HUB_SAVE_CORRUPT_KEY_PREFIX) && !k.endsWith("lastKey")).length, 1);
  assert.equal(loadHubSaveFromLocalStorage(store), null);
  // Structurally wrong JSON (unknown v) is also backed up.
  const s2 = new MemStorage();
  s2.setItem(HUB_SAVE_STORAGE_KEY, JSON.stringify({ v: "x", hub: 1 }));
  assert.equal(loadHubSaveWithStatus(s2).status, "corrupt_backed_up");
  // Corrupt legacy key: backed up, legacy key itself kept, v3 key not created.
  const s3 = new MemStorage();
  s3.setItem(HUB_SAVE_LEGACY_STORAGE_KEY, "garbage");
  assert.equal(loadHubSaveWithStatus(s3).status, "corrupt_backed_up");
  assert.equal(s3.getItem(HUB_SAVE_LEGACY_STORAGE_KEY), "garbage");
  assert.equal(s3.getItem(HUB_SAVE_STORAGE_KEY), null);
}

// ---------------------------------------------------------------------------
// Newer version → read-only
// ---------------------------------------------------------------------------
{
  const store = new MemStorage();
  const newer = JSON.stringify({ v: 4, savedAt: "2027-01-01T00:00:00.000Z", hub: { credits: 777, futureField: { x: 1 } } });
  store.setItem(HUB_SAVE_STORAGE_KEY, newer);
  const res = loadHubSaveWithStatus(store);
  assert.equal(res.status, "newer_read_only");
  assert.equal(res.storedVersion, 4);
  assert.equal(res.save!.hub.credits, 777);
  assert.equal(parseHubSave(JSON.parse(newer)), null, "parseHubSave rejects v4");
  assert.equal(saveHubSaveToLocalStorage({ ...res.save!.hub, credits: 1 }, store), false);
  assert.equal(store.getItem(HUB_SAVE_STORAGE_KEY), newer, "newer save untouched");
}

// ---------------------------------------------------------------------------
// Equip integrity / helpers
// ---------------------------------------------------------------------------
{
  const recs = [
    { circuitId: "e1", circuitBoard: board(2, "e1", { outcome: "bypass" }), restoreState: "bypass", origin: "bought", equippedTo: "owned_a", updatedAt: "2026-09-01T00:00:00.000Z" },
    { circuitId: "e2", circuitBoard: board(2, "e2", { outcome: "bypass" }), restoreState: "bypass", origin: "bought", equippedTo: "owned_a", updatedAt: "2026-09-05T00:00:00.000Z" },
    { circuitId: "e3", circuitBoard: board(2, "e3"), restoreState: "unrestored", origin: "crafted", equippedTo: "ghost" },
  ];
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("owned_a"), mech("owned_b")], circuits: recs } as unknown as HubSnapshot);
  const byId = new Map(hub.circuits.map((c) => [c.circuitId, c]));
  assert.equal(byId.get("e2")!.equippedTo, "owned_a", "newest updatedAt kept");
  assert.equal(byId.get("e1")!.equippedTo, null, "over slot → stash");
  assert.equal(byId.get("e3")!.equippedTo, null, "missing mech → stash");
  assert.equal(byId.get("e3")!.restoreState, "unrestored");
  assert.equal(byId.get("e3")!.outcome, "offline", "deprecated mirror");
  assert.equal(byId.get("e3")!.circuitBoard.outcome, undefined, "unrestored → board outcome empty");
  assert.equal(byId.get("e3")!.origin, "crafted");

  const full = equipCircuit(hub, "e1", "owned_a");
  assert.equal(full.ok, false);
  assert.equal(full.reason, "slot_full");
  const eq = equipCircuit(hub, "e1", "owned_b");
  assert.equal(eq.ok, true);
  assert.equal(eq.hub.circuits.find((c) => c.circuitId === "e1")!.equippedTo, "owned_b");
  assert.equal(equipCircuit(hub, "e1", "nobody").reason, "no_mech");
  const un = unequipCircuit(eq.hub, "e1");
  assert.equal(un.circuits.find((c) => c.circuitId === "e1")!.equippedTo, null);

  // upsert (restore→trade import) keeps equip / origin / acquiredAt.
  const up = upsertCircuitIntoHub(eq.hub, {
    circuitId: "e1",
    circuitBoard: board(2, "e1", { outcome: "fully_awakened" }),
    outcome: "fully_awakened",
  });
  const e1 = up.circuits.find((c) => c.circuitId === "e1")!;
  assert.equal(e1.equippedTo, "owned_b");
  assert.equal(e1.origin, "bought");
  assert.equal(e1.restoreState, "fully_awakened");
  assert.equal(up.perfectMaxSize, hub.perfectMaxSize, "upsert does not touch perfectMaxSize (impl B)");
  const fresh = upsertCircuitIntoHub(INITIAL_HUB, {
    circuitId: "new1",
    circuitBoard: board(3, "new1", { outcome: "bypass" }),
    outcome: "bypass",
  });
  assert.equal(fresh.circuits[0]!.origin, "legacy");
  assert.equal(fresh.circuits[0]!.equippedTo, null);
  assert.ok(fresh.circuits[0]!.acquiredAt);

  // More than 8 circuits via upsert: no truncation.
  let many: HubSnapshot = INITIAL_HUB;
  for (let i = 0; i < 12; i++) {
    many = upsertCircuitIntoHub(many, { circuitId: `m${i}`, circuitBoard: board(2, `m${i}`), outcome: "offline" });
  }
  assert.equal(many.circuits.length, 12);

  // perfectMaxSize / craftMaxSize helpers (§7).
  assert.equal(craftMaxSize(INITIAL_HUB), 2);
  const p5 = recordPerfectSize(INITIAL_HUB, { restoreState: "fully_awakened", locked: true, circuitBoard: board(5, "p5") });
  assert.equal(p5.perfectMaxSize, 5);
  assert.equal(craftMaxSize(p5), 6);
  assert.equal(craftMaxSize(p5, 4), 4);
  assert.equal(recordPerfectSize(p5, { restoreState: "fully_awakened", locked: true, circuitBoard: board(3, "p3") }).perfectMaxSize, 5, "never lowers");
  assert.equal(recordPerfectSize(INITIAL_HUB, { restoreState: "bypass", locked: false, circuitBoard: board(6, "b6") }).perfectMaxSize, 0, "U10");
  assert.equal(recordPerfectSize(INITIAL_HUB, { restoreState: "fully_awakened", locked: false, circuitBoard: board(6, "b6") }).perfectMaxSize, 0, "U10 needs locked");
}

// ---------------------------------------------------------------------------
// Sortie report (U7 / U9 / U18)
// ---------------------------------------------------------------------------
{
  const base = normalizeHubSnapshot({
    ...INITIAL_HUB,
    fleet: [mech("owned_a"), mech("owned_b")],
    circuits: [
      { circuitId: "sa", circuitBoard: board(4, "sa", { outcome: "bypass" }), restoreState: "bypass", origin: "crafted", equippedTo: "owned_a", lastEditorName: "刻" },
      { circuitId: "sb", circuitBoard: board(2, "sb"), restoreState: "unrestored", origin: "picked_up", equippedTo: "owned_b" },
    ],
  } as unknown as HubSnapshot);
  const report = {
    sortieId: "s1",
    cell: { sx: 3, sy: 4 },
    frontSeed: 99,
    lostMechInstanceIds: ["owned_a"],
    lostCause: { owned_a: "left_behind" as const },
    recoveredDropIds: [],
    acquiredCircuits: [],
  };
  const r1 = applySortieReport(base, report, new Date("2026-09-28T00:00:00.000Z"));
  assert.equal(r1.applied, true);
  assert.deepEqual(r1.hub.fleet.map((m) => m.instanceId), ["owned_b"]);
  assert.deepEqual(r1.hub.circuits.map((c) => c.circuitId), ["sb"]);
  assert.equal(r1.hub.fieldDrops.length, 1);
  const drop = r1.hub.fieldDrops[0]!;
  assert.equal(drop.dropId, "drop_s1_sa");
  assert.equal(drop.cause, "left_behind");
  assert.equal(drop.fromMechInstanceId, "owned_a");
  assert.deepEqual(drop.cell, { sx: 3, sy: 4 });
  assert.equal(drop.circuit.equippedTo, null);
  // Idempotent.
  const again = applySortieReport(r1.hub, report);
  assert.equal(again.applied, false);
  assert.equal(again.hub, r1.hub);
  // Persisted round-trip keeps fieldDrops.
  const rt = deserializeHubSave(serializeHubSave(createHubSave(r1.hub)))!.hub;
  assert.deepEqual(rt.fieldDrops, r1.hub.fieldDrops);
  assert.deepEqual(rt.appliedSortieIds, ["s1"]);
  // Recovery: back to stash exactly as before (except equippedTo null).
  const before = base.circuits.find((c) => c.circuitId === "sa")!;
  const rec = recoverFieldDrops(rt, ["drop_s1_sa"]);
  assert.deepEqual(rec.recovered, ["sa"]);
  const back = rec.hub.circuits.find((c) => c.circuitId === "sa")!;
  assert.deepEqual(back, { ...before, equippedTo: null });
  assert.equal(rec.hub.fieldDrops.length, 0);
  assert.equal(circuitEffectValue(back), circuitEffectValue(before));
  // U7: no Invade cell → lost forever, not recorded.
  const r2 = applySortieReport(base, { ...report, sortieId: "s2", cell: null, frontSeed: null });
  assert.equal(r2.hub.fieldDrops.length, 0);
  assert.deepEqual(r2.lostForever.map((c) => c.circuitId), ["sa"]);
  assert.ok(!r2.hub.circuits.some((c) => c.circuitId === "sa"));
  // Acquired circuits land in the stash.
  const r3 = applySortieReport(base, {
    ...report,
    sortieId: "s3",
    lostMechInstanceIds: [],
    acquiredCircuits: [
      { circuitId: "drop_new", circuitBoard: board(3, "drop_new"), restoreState: "unrestored", origin: "enemy_drop", equippedTo: "owned_b", outcome: "offline" },
    ],
  });
  const acq = r3.hub.circuits.find((c) => c.circuitId === "drop_new")!;
  assert.equal(acq.origin, "enemy_drop");
  assert.equal(acq.equippedTo, null);
}

// ---------------------------------------------------------------------------
// mechCircuits handoff
// ---------------------------------------------------------------------------
{
  const mc: Record<string, MechCircuitEntry[]> = {
    owned_a: [
      { circuitId: "junk_craft_x", restoreState: "fully_awakened", effect: 8 },
      { circuitId: "c.2:x", restoreState: "unrestored", effect: 0, effectKey: "k1" },
    ],
    owned_b: [{ circuitId: "c_2", restoreState: "bypass", effect: 3.7 }],
    owned_c: [{ circuitId: "c_3", restoreState: "offline", effect: 5 }],
    "bad~id": [{ circuitId: "c_4", restoreState: "bypass", effect: 1 }],
  };
  const enc = encodeMechCircuitsCompact(mc);
  assert.equal(
    enc,
    "owned_a~junk_craft_x*fa*8,c.2:x*un*0*k1;owned_b~c_2*by*3;owned_c~c_3*off*5",
  );
  const dec = parseMechCircuitsCompact(enc);
  assert.deepEqual(dec, {
    owned_a: mc.owned_a,
    owned_b: [{ circuitId: "c_2", restoreState: "bypass", effect: 3 }],
    owned_c: mc.owned_c,
  });
  assert.deepEqual(parseMechCircuitsCompact("x~a*zz*1;~b*fa*1;y~c*fa*-1,d*fa*2"), {
    y: [{ circuitId: "d", restoreState: "fully_awakened", effect: 2 }],
  });

  // URL round-trip: only deployed mechs are sent.
  const url = buildTradeToExploreUrl(
    { deployableMechs: 2, startingAmmo: 30, deployedInstanceIds: ["owned_a", "owned_b"], mechCircuits: mc },
    "https://example.test/explore/",
  );
  const parsed = parseTradeToExploreSearch(new URL(url).search)!;
  assert.deepEqual(Object.keys(parsed.mechCircuits!), ["owned_a", "owned_b"]);
  assert.deepEqual(parsed.mechCircuits!.owned_a, mc.owned_a);

  // No key → identical to before (no mechCircuits field at all).
  const plainUrl = buildTradeToExploreUrl(
    { deployableMechs: 2, startingAmmo: 30, deployedInstanceIds: ["owned_a", "owned_b"] },
    "https://example.test/explore/",
  );
  assert.ok(!plainUrl.includes("mechCircuits"));
  const plain = parseTradeToExploreSearch(new URL(plainUrl).search)!;
  assert.equal("mechCircuits" in plain, false);
  assert.deepEqual(plain, {
    deployableMechs: 2,
    startingAmmo: 30,
    deployedInstanceIds: ["owned_a", "owned_b"],
  });
  assert.equal(parseTradeToExploreSearch(""), null);
  // Empty mechCircuits → key omitted.
  const emptyUrl = buildTradeToExploreUrl(
    { deployableMechs: 1, startingAmmo: 1, deployedInstanceIds: ["owned_a"], mechCircuits: {} },
    "https://example.test/explore/",
  );
  assert.ok(!emptyUrl.includes("mechCircuits"));

  // Builder from hub: stash circuits never sent.
  const hub = normalizeHubSnapshot({
    ...INITIAL_HUB,
    fleet: [mech("owned_a"), mech("owned_b")],
    circuits: [
      { circuitId: "ha", circuitBoard: board(4, "u17-flawed-4", { outcome: "bypass" }), restoreState: "bypass", origin: "legacy", equippedTo: "owned_a" },
      { circuitId: "hs", circuitBoard: board(2, "hs"), restoreState: "unrestored", origin: "crafted", equippedTo: null },
    ],
  } as unknown as HubSnapshot);
  const built = buildMechCircuitsForDeploy(hub, ["owned_a", "owned_b"]);
  assert.deepEqual(built, { owned_a: [{ circuitId: "ha", restoreState: "bypass", effect: 1 }] });
}

// ---------------------------------------------------------------------------
// U17: existing circuits' clues / 評価値 are fixed (effect is never stored).
// Any change to clue generation that alters these values breaks old saves.
// ---------------------------------------------------------------------------
{
  const clueHash = (b: CircuitBoardState) => hashSeed(JSON.stringify(resolveCluesForCircuitBoard(b)));
  const flawed: Array<[string, number, number, number]> = [
    // puzzleId, side, clue hash, effect of the perimeter loop
    ["u17-flawed-2", 2, 773679293, 0],
    ["u17-flawed-3", 3, 3711476072, 0],
    ["u17-flawed-4", 4, 1243726887, 1],
    ["u17-flawed-6", 6, 3116458031, 2],
    ["u17-flawed-8", 8, 3151410516, 2],
  ];
  for (const [id, n, hash, effect] of flawed) {
    const b = board(n, id, { outcome: "bypass" });
    assert.equal(clueHash(b), hash, `U17 clue hash ${id}`);
    assert.equal(computeCircuitEffectForBoard(b, { perfect: b.perfect }).effect, effect, `U17 effect ${id}`);
    // Through a v2 → v3 migration the value is unchanged.
    const migrated = parseHubSave({ v: 2, savedAt: "x", hub: { circuits: [{ circuitId: "u", circuitBoard: b, outcome: "bypass" }] } })!.hub.circuits[0]!;
    assert.equal(circuitEffectValue(migrated), effect);
    assert.equal(circuitActiveEffect(migrated), effect);
    assert.equal(circuitActiveEffect({ ...migrated, restoreState: "offline" }), 0);
    assert.equal(circuitActiveEffect({ ...migrated, restoreState: "unrestored" }), 0);
  }
  assert.deepEqual(resolveCluesForCircuitBoard(board(2, "u17-flawed-2")), [[3, 3], [3, 3]]);
  const verify = buildVerifyPerfectLockedBoard();
  assert.equal(clueHash(verify), 72204997, "U17 verify-true clues");
  assert.equal(circuitEffectValue({ circuitBoard: verify, locked: true }), 8, "U17 verify-true effect");
  const sid = buildSizedTruePuzzleId("u17-sized", 5, 5);
  assert.equal(sid, "perfect-true-5x5-1gyztvs");
  const sz = resolveSizedTruePuzzle(sid)!;
  const sized: CircuitBoardState = {
    v: 1, cols: 5, rows: 5, edgeState: encodeEdgeState(sz.solution), puzzleId: sid,
    outcome: "fully_awakened", perfect: true, locked: true,
  };
  assert.equal(clueHash(sized), 3867672244, "U17 sized true clues");
  assert.equal(circuitEffectValue({ circuitBoard: sized, locked: true }), 59, "U17 sized true effect");
}

console.log("shared hub-save-v3 selftest: ok");
