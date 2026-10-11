/**
 * #270 save compatibility (神宮 10/12 decisions Q2 / Q4 / Q5, 参謀 checks a–d).
 * Old saves go through `normalizeHubSnapshot`; nothing equipped moves.
 */
import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  circuitHEdgeIndex,
  circuitVEdgeIndex,
  createHubSave,
  deserializeHubSave,
  edgeCount,
  encodeEdgeState,
  normalizeHubSnapshot,
  readSortieCheckpoint,
  serializeHubSave,
  writeSortieCheckpoint,
  type CircuitBoardState,
  type EdgeMark,
  type HubCircuitRecord,
  type HubSnapshot,
  type OwnedMech,
} from "./index";
import {
  classifyCircuit,
  ensureCaptainFalseOneByOne,
  hangarEquippedCircuits,
  keyIsFalse,
  keyIsTrue,
  makeFalseOneByOne,
  makeTrueOneByOne,
  qualityBonusPt,
  readAirSupportCooldownSec,
  readBulletinUnlocked,
  sortYieldRate,
} from "./circuit-actions";

function perimeter(n: number): string {
  const m = Array.from({ length: edgeCount(n, n) }, () => 0 as EdgeMark);
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
  return { v: 1, cols: n, rows: n, edgeState: perimeter(n), puzzleId, ...extra };
}

function mech(instanceId: string, over: Partial<OwnedMech> = {}): OwnedMech {
  return { instanceId, catalogId: "mech_gen1", status: "operational", durability: 100, durabilityMax: 100, ...over } as OwnedMech;
}

function twoByTwo(circuitId: string, equippedTo: string | null, state: "bypass" | "fully_awakened" = "bypass"): HubCircuitRecord {
  return {
    circuitId,
    circuitBoard: board(2, "p0", { outcome: state }),
    restoreState: state,
    origin: "legacy",
    equippedTo,
    outcome: state,
  } as HubCircuitRecord;
}

/** A pre-#270 save: no effectKey, no airSupportCooldownSec, no bulletinUnlocked. */
function oldSave(): Record<string, unknown> {
  return {
    ...INITIAL_HUB,
    credits: 1234,
    fleet: [mech("cap"), mech("w1")],
    circuits: [twoByTwo("old-2x2", "cap")],
  };
}

// (a) compat: captain with a 2×2 keeps it; no false 1×1 is pushed in.
{
  const hub = normalizeHubSnapshot(oldSave() as unknown as HubSnapshot);
  const mine = hub.circuits.filter((c) => c.equippedTo === "cap");
  assert.deepEqual(mine.map((c) => c.circuitId), ["old-2x2"], "(a) the 2×2 stays on the captain");
  const granted = ensureCaptainFalseOneByOne(hub);
  assert.equal(granted, hub, "(a) Q2: a captain with a circuit gets no false 1×1");
  assert.equal(granted.circuits.filter((c) => c.equippedTo === "cap").length, 1);
}

// Q2: a captain with no circuit gets exactly one false 1×1; second call is a no-op.
{
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [mech("cap")], circuits: [] } as unknown as HubSnapshot);
  const once = ensureCaptainFalseOneByOne(hub);
  const mine = once.circuits.filter((c) => c.equippedTo === "cap");
  assert.equal(mine.length, 1);
  assert.equal(classifyCircuit(mine[0]!).oneByOne, "false", "Q2: the starter is the false 1×1 (digit 0)");
  assert.equal(ensureCaptainFalseOneByOne(normalizeHubSnapshot(once)).circuits.length, once.circuits.length);
}

// (b) compat: effectKey is assigned once and stays the same on re-normalize / save round trip.
{
  const first = normalizeHubSnapshot(oldSave() as unknown as HubSnapshot);
  const key = first.circuits.find((c) => c.circuitId === "old-2x2")!.effectKey;
  assert.ok(keyIsFalse(key), "(b) false 2×2 gets a normal-action key");
  const again = normalizeHubSnapshot(first);
  assert.equal(again.circuits.find((c) => c.circuitId === "old-2x2")!.effectKey, key, "(b) stable on re-normalize");
  const round = deserializeHubSave(serializeHubSave(createHubSave(again)));
  assert.ok(round);
  if (round) {
    assert.equal(round.hub.circuits.find((c) => c.circuitId === "old-2x2")!.effectKey, key, "(b) stable through save");
  }
}

// (c) compat: saves without airSupportCooldownSec / bulletinUnlocked load as 0 / false.
{
  const hub = normalizeHubSnapshot(oldSave() as unknown as HubSnapshot);
  assert.equal("airSupportCooldownSec" in hub, false);
  assert.equal("bulletinUnlocked" in hub, false);
  assert.equal(readAirSupportCooldownSec(hub), 0);
  assert.equal(readBulletinUnlocked(hub), false);
  assert.equal(hub.credits, 1234);
  const withKeys = normalizeHubSnapshot({ ...oldSave(), airSupportCooldownSec: 120, bulletinUnlocked: true } as unknown as HubSnapshot);
  assert.equal(readAirSupportCooldownSec(withKeys), 120);
  assert.equal(readBulletinUnlocked(withKeys), true);
  const junk = normalizeHubSnapshot({ ...oldSave(), airSupportCooldownSec: "x", bulletinUnlocked: "yes" } as unknown as HubSnapshot);
  assert.equal(readAirSupportCooldownSec(junk), 0);
  assert.equal(readBulletinUnlocked(junk), false);
}

// (d) compat: the 5-3 checkpoint key is independent of HubSave and still round-trips.
{
  const mem = new Map<string, string>();
  const store = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  const body = { phase: "sortie", leader: { id: "leader" }, balance: {}, circuitPlay: { rules: true, release: false, cooldownSec: 150 } };
  assert.equal(writeSortieCheckpoint({ v: 1, kind: "sortie", body }, store), true);
  normalizeHubSnapshot(oldSave() as unknown as HubSnapshot);
  const read = readSortieCheckpoint(store);
  assert.equal(read.status, "ok");
  if (read.status === "ok" && read.record.kind === "sortie") {
    assert.deepEqual(read.record.body, body, "(d) checkpoint body is unchanged");
  }
}

// Technical check: Restore turns the false board into a true board → the key is redrawn from the squad list once.
{
  const first = normalizeHubSnapshot(oldSave() as unknown as HubSnapshot);
  const rec = first.circuits.find((c) => c.circuitId === "old-2x2")!;
  assert.ok(keyIsFalse(rec.effectKey));
  const restored = {
    ...first,
    circuits: first.circuits.map((c) =>
      c.circuitId === "old-2x2"
        ? { ...c, restoreState: "fully_awakened" as const, outcome: "fully_awakened" as const, circuitBoard: { ...c.circuitBoard, outcome: "fully_awakened" as const } }
        : c,
    ),
  } as HubSnapshot;
  assert.equal(classifyCircuit(restored.circuits.find((c) => c.circuitId === "old-2x2")!).effectKey, null, "stale normal key gives no effect");
  const norm = normalizeHubSnapshot(restored);
  const key = norm.circuits.find((c) => c.circuitId === "old-2x2")!.effectKey;
  assert.ok(keyIsTrue(key), "true board gets a squad-action key");
  assert.equal(normalizeHubSnapshot(norm).circuits.find((c) => c.circuitId === "old-2x2")!.effectKey, key, "then stable");
}

// Q4: circuits on a destroyed hangar mech do not count (equipped-only aggregation, Q5).
{
  const hub = normalizeHubSnapshot({
    ...INITIAL_HUB,
    fleet: [mech("cap"), mech("dead", { status: "destroyed", durability: 0 })],
    circuits: [
      { ...twoByTwo("sy", "dead", "fully_awakened"), effectKey: "sort_yield" },
      { ...twoByTwo("pr", "dead", "fully_awakened"), effectKey: "perfect_rate" },
      { ...twoByTwo("stash", null, "fully_awakened"), effectKey: "sort_yield" },
    ],
  } as unknown as HubSnapshot);
  assert.deepEqual(hangarEquippedCircuits(hub).map((c) => c.circuitId), [], "Q4: destroyed mech circuits excluded");
  assert.equal(sortYieldRate(hub), 0, "Q4/Q5: stash and destroyed do not count");
  assert.equal(qualityBonusPt(hub), 0);
  const repaired = { ...hub, fleet: hub.fleet.map((m) => (m.instanceId === "dead" ? mech("dead") : m)) } as HubSnapshot;
  assert.ok(sortYieldRate(repaired) > 0, "repaired mech counts again");
  const t1 = { ...makeTrueOneByOne("t1"), equippedTo: "dead" };
  const withFour = { ...hub, circuits: [t1, ...hub.circuits] } as HubSnapshot;
  assert.equal(hangarEquippedCircuits(withFour).some((c) => c.circuitId === "t1"), false, "Q4: a 「4」 on a destroyed mech counts for nothing");
  assert.equal(classifyCircuit(makeFalseOneByOne("f")).oneByOne, "false");
}

console.log("circuit-compat.selftest ok");
