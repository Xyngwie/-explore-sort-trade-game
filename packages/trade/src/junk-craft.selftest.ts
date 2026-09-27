/** Impl B: junk craft size / cost / cap, perfectMaxSize import hook + backfill. */
import assert from "node:assert/strict";
import {
  HUB_SAVE_STORAGE_KEY,
  INITIAL_HUB,
  buildRestoreToTradeUrl,
  buildSizedTruePuzzleIdV2,
  createHubSave,
  deserializeHubSave,
  encodeEdgeState,
  normalizeHubSnapshot,
  resolveSizedTruePuzzle,
  serializeHubSave,
  upsertCircuitIntoHub,
  circuitActiveEffect,
  circuitEffectValue,
  equipCircuit,
  type CircuitBoardState,
  type HubSnapshot,
} from "@estg/shared";
import {
  JUNK_CRAFT_CONFIRM_MIN_CREDITS,
  backfillPerfectMaxSize,
  craftJunkCircuit,
  junkCraftConfirmText,
  junkCraftMaxSide,
  junkCraftOptions,
} from "./junk-craft";
import {
  circuitSellPerfectSide,
  createInitialHangar,
  formatCircuitHubBrief,
  ingestLocationSearch,
  sellCircuit,
} from "./hangar";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(k: string) {
      return map.has(k) ? map.get(k)! : null;
    },
    key(i: number) {
      return [...map.keys()][i] ?? null;
    },
    removeItem(k: string) {
      map.delete(k);
    },
    setItem(k: string, v: string) {
      map.set(k, String(v));
    },
  };
}

function hubWith(p: Partial<HubSnapshot>): HubSnapshot {
  return normalizeHubSnapshot({ ...INITIAL_HUB, ...p });
}

function perfectBoard(n: number, seed: string): CircuitBoardState {
  const id = buildSizedTruePuzzleIdV2(seed, n, n);
  const p = resolveSizedTruePuzzle(id)!;
  return {
    v: 1, cols: n, rows: n, edgeState: encodeEdgeState(p.solution), puzzleId: id,
    outcome: "fully_awakened", perfect: true, locked: true,
  };
}

// ---------------------------------------------------------------------------
// Size range / cap: 2..min(perfectMaxSize + 1, 20)
// ---------------------------------------------------------------------------
assert.equal(junkCraftMaxSide(hubWith({ perfectMaxSize: 0 })), 2);
assert.equal(junkCraftMaxSide(hubWith({ perfectMaxSize: 1 })), 2);
assert.equal(junkCraftMaxSide(hubWith({ perfectMaxSize: 5 })), 6);
assert.equal(junkCraftMaxSide(hubWith({ perfectMaxSize: 19 })), 20);
assert.equal(junkCraftMaxSide(hubWith({ perfectMaxSize: 20 })), 20);
{
  const rich = hubWith({ perfectMaxSize: 5, credits: 1_000_000, inventory: { junk: 1000 } });
  const capped = junkCraftOptions(rich);
  assert.deepEqual(capped.map((o) => o.side), [2, 3, 4, 5, 6]);
  assert.ok(capped.every((o) => o.enabled));
  const all = junkCraftOptions(rich, 20);
  assert.equal(all.length, 19);
  assert.deepEqual(all.filter((o) => o.enabled).map((o) => o.side), [2, 3, 4, 5, 6]);
  assert.ok(all.filter((o) => o.side > 6).every((o) => o.reason === "over_cap" && !o.withinCap));
  // Costs from the shared single source: 2N junk + round(4×1.5^N) c.
  const byside = new Map(all.map((o) => [o.side, o]));
  assert.deepEqual([byside.get(2)!.junk, byside.get(2)!.credits], [4, 9]);
  assert.deepEqual([byside.get(4)!.junk, byside.get(4)!.credits], [8, 20]);
  assert.deepEqual([byside.get(6)!.junk, byside.get(6)!.credits], [12, 46]);
  assert.deepEqual([byside.get(20)!.junk, byside.get(20)!.credits], [40, 13301]);
  // Unaffordable rows are disabled with a reason.
  const poor = hubWith({ perfectMaxSize: 5, credits: 20, inventory: { junk: 9 } });
  const po = new Map(junkCraftOptions(poor).map((o) => [o.side, o]));
  assert.equal(po.get(2)!.enabled, true);
  assert.equal(po.get(3)!.enabled, true); // 6 junk + 14c
  assert.equal(po.get(4)!.enabled, true); // 8 junk + 20c
  assert.equal(po.get(5)!.reason, "no_junk"); // 10 junk
  const noCred = hubWith({ perfectMaxSize: 5, credits: 19, inventory: { junk: 50 } });
  assert.equal(new Map(junkCraftOptions(noCred).map((o) => [o.side, o])).get(4)!.reason, "no_credits");
}

// ---------------------------------------------------------------------------
// Cost deduction / crafted record
// ---------------------------------------------------------------------------
{
  const hub = hubWith({ perfectMaxSize: 3, credits: 100, inventory: { junk: 10, scrap: 2 } as never });
  const r = craftJunkCircuit(hub, 4, { circuitId: "junk_craft_t4", at: new Date("2026-09-28T00:00:00Z") });
  assert.equal(r.ok, true);
  assert.equal(r.hub.credits, 80);
  assert.equal(r.hub.inventory.junk, 2);
  const rec = r.hub.circuits[0]!;
  assert.equal(rec.circuitId, "junk_craft_t4");
  assert.equal(rec.circuitBoard.cols, 4);
  assert.equal(rec.circuitBoard.rows, 4);
  assert.equal(rec.restoreState, "unrestored");
  assert.equal(rec.outcome, "offline", "deprecated mirror of unrestored");
  assert.equal(rec.circuitBoard.outcome, undefined, "unrestored → no board outcome");
  assert.equal(rec.origin, "crafted");
  assert.equal(rec.equippedTo, null);
  assert.equal(rec.acquiredAt, "2026-09-28T00:00:00.000Z");
  // Exact junk → key removed (same as the old craft).
  const exact = craftJunkCircuit(hubWith({ credits: 9, inventory: { junk: 4 } }), 2, { circuitId: "junk_craft_e" });
  assert.equal(exact.ok, true);
  assert.equal(exact.hub.credits, 0);
  assert.equal(exact.hub.inventory.junk, undefined);
  // 20×20 at the top of the range.
  const big = craftJunkCircuit(hubWith({ perfectMaxSize: 20, credits: 13301, inventory: { junk: 40 } }), 20, { circuitId: "junk_craft_20" });
  assert.equal(big.ok, true);
  assert.equal(big.record!.circuitBoard.cols, 20);
  assert.equal(big.hub.credits, 0);
  // Persisted round-trip keeps it.
  const rt = deserializeHubSave(serializeHubSave(createHubSave(big.hub)))!.hub;
  assert.equal(rt.circuits[0]!.circuitBoard.cols, 20);
  assert.equal(rt.circuits[0]!.origin, "crafted");
}

// ---------------------------------------------------------------------------
// Insufficient funds / over cap / bad size → unchanged
// ---------------------------------------------------------------------------
{
  const hub = hubWith({ perfectMaxSize: 3, credits: 19, inventory: { junk: 7 } });
  for (const [side, reason] of [
    [4, "no_junk"],
    [5, "over_cap"],
    [1, "bad_size"],
    [21, "bad_size"],
    [2.5, "bad_size"],
  ] as const) {
    const r = craftJunkCircuit(hub, side, { circuitId: `x_${String(side).replace(".", "_")}` });
    assert.equal(r.ok, false, `side ${side}`);
    assert.equal(r.reason, reason, `side ${side}`);
    assert.equal(r.hub, hub);
  }
  const noCredits = craftJunkCircuit(hubWith({ perfectMaxSize: 3, credits: 13, inventory: { junk: 50 } }), 3, { circuitId: "x_c" });
  assert.equal(noCredits.reason, "no_credits");
}

// ---------------------------------------------------------------------------
// No 8-circuit truncation
// ---------------------------------------------------------------------------
{
  let hub = hubWith({ credits: 1000, inventory: { junk: 100 } });
  for (let i = 0; i < 12; i++) {
    const r = craftJunkCircuit(hub, 2, { circuitId: `junk_craft_n${i}` });
    assert.equal(r.ok, true);
    hub = r.hub;
  }
  assert.equal(hub.circuits.length, 12);
  assert.equal(hub.credits, 1000 - 12 * 9);
  assert.equal(hub.inventory.junk, 100 - 12 * 4);
}

// ---------------------------------------------------------------------------
// Backfill: max(saved, largest held FA + locked side), cap 20, never lowers
// ---------------------------------------------------------------------------
{
  const withPerfect = (saved: number, n: number) =>
    normalizeHubSnapshot({
      ...INITIAL_HUB,
      perfectMaxSize: saved,
      circuits: [
        { circuitId: "p", circuitBoard: perfectBoard(n, `bf-${n}`), restoreState: "fully_awakened", origin: "legacy", equippedTo: null, outcome: "fully_awakened", locked: true },
      ],
    } as unknown as HubSnapshot);
  assert.equal(backfillPerfectMaxSize(withPerfect(3, 7)).perfectMaxSize, 7);
  assert.equal(backfillPerfectMaxSize(withPerfect(9, 7)).perfectMaxSize, 9, "never lowers");
  const same = withPerfect(7, 7);
  assert.equal(backfillPerfectMaxSize(same), same, "unchanged → same object");
  // Bypass / unlocked FA do not count.
  const byp = normalizeHubSnapshot({
    ...INITIAL_HUB,
    perfectMaxSize: 0,
    circuits: [
      { circuitId: "b", circuitBoard: { ...perfectBoard(6, "bf-b"), outcome: "bypass", perfect: false, locked: false }, restoreState: "bypass", origin: "legacy", equippedTo: null, outcome: "bypass" },
    ],
  } as unknown as HubSnapshot);
  assert.equal(backfillPerfectMaxSize(byp).perfectMaxSize, 0);

  // On hangar load: a v3 save written between A and B (perfectMaxSize 0 but a
  // held 5×5 perfect) is corrected and persisted.
  const store = memoryStorage();
  store.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(createHubSave(withPerfect(0, 5))));
  const hs = createInitialHangar(store);
  assert.equal(hs.hub.perfectMaxSize, 5);
  assert.ok(hs.log.some((l) => l.includes("パーフェクト最大サイズを補正")));
  assert.equal(deserializeHubSave(store.getItem(HUB_SAVE_STORAGE_KEY)!)!.hub.perfectMaxSize, 5);
  assert.equal(junkCraftMaxSide(hs.hub), 6);
}

// ---------------------------------------------------------------------------
// Restore → trade import raises perfectMaxSize (recordPerfectSize)
// ---------------------------------------------------------------------------
{
  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  let hs = createInitialHangar(store);
  assert.equal(hs.hub.perfectMaxSize, 0);
  // Import a Perfect 6×6 Restore result.
  const url = buildRestoreToTradeUrl({
    circuitId: "imp6",
    circuitBoard: perfectBoard(6, "imp-6"),
    outcome: "fully_awakened",
    perfect: true,
    locked: true,
  });
  hs = ingestLocationSearch(hs, new URL(url).search).state;
  assert.equal(hs.hub.perfectMaxSize, 6);
  assert.equal(junkCraftMaxSide(hs.hub), 7);
  assert.equal(deserializeHubSave(store.getItem(HUB_SAVE_STORAGE_KEY)!)!.hub.perfectMaxSize, 6);
  // A smaller Perfect does not lower it; Bypass does not raise it.
  const url4 = buildRestoreToTradeUrl({ circuitId: "imp4", circuitBoard: perfectBoard(4, "imp-4"), outcome: "fully_awakened", perfect: true, locked: true });
  hs = ingestLocationSearch(hs, new URL(url4).search).state;
  assert.equal(hs.hub.perfectMaxSize, 6);
  const url8b = buildRestoreToTradeUrl({
    circuitId: "imp8b",
    circuitBoard: { ...perfectBoard(8, "imp-8"), outcome: "bypass", perfect: false, locked: false },
    outcome: "bypass",
  });
  hs = ingestLocationSearch(hs, new URL(url8b).search).state;
  assert.equal(hs.hub.perfectMaxSize, 6);
  // Unlocked Fully Awakened (no perfect flag) does not raise it (U10).
  const hub2 = upsertCircuitIntoHub(hs.hub, { circuitId: "fa_plain", circuitBoard: { ...perfectBoard(9, "imp-9"), perfect: false, locked: false }, outcome: "fully_awakened" });
  assert.equal(backfillPerfectMaxSize(hub2).perfectMaxSize, 6);
  // Crafted circuit kept its origin through a restore import.
  const crafted = craftJunkCircuit({ ...hs.hub, credits: 100, inventory: { junk: 10 } }, 2, { circuitId: "junk_craft_imp" });
  assert.equal(crafted.ok, true);
  store.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(createHubSave(crafted.hub)));
  hs = createInitialHangar(store);
  const back = buildRestoreToTradeUrl({ circuitId: "junk_craft_imp", circuitBoard: { ...crafted.record!.circuitBoard }, outcome: "bypass" });
  hs = ingestLocationSearch(hs, new URL(back).search).state;
  const rec = hs.hub.circuits.find((c) => c.circuitId === "junk_craft_imp")!;
  assert.equal(rec.origin, "crafted");
  assert.equal(rec.restoreState, "bypass");
}

// ---------------------------------------------------------------------------
// Unrestored crafted circuit through display / sell / equip paths
// ---------------------------------------------------------------------------
{
  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  const base = createInitialHangar(store);
  const hub0 = normalizeHubSnapshot({
    ...base.hub,
    credits: 100,
    inventory: { junk: 10 },
    fleet: [{ instanceId: "owned_a", catalogId: "mech_gen1", status: "operational", durability: 100, durabilityMax: 100 }],
  } as unknown as HubSnapshot);
  const r = craftJunkCircuit(hub0, 2, { circuitId: "junk_craft_u" });
  assert.equal(r.ok, true);
  const rec = r.record!;
  // Effect 0 (display + active effect), sells at 25c + 0, no perfect bonus.
  assert.equal(circuitEffectValue(rec), 0);
  assert.equal(circuitActiveEffect(rec), 0);
  assert.equal(circuitSellPerfectSide(rec), null);
  const brief = formatCircuitHubBrief(r.hub.circuits);
  const line = brief.lines.find((l) => l.circuitId === "junk_craft_u")!;
  assert.equal(line.outcomeJa, "未Restore");
  assert.equal(line.effect, 0);
  const hs = { ...base, hub: r.hub };
  const creditsBefore = hs.hub.credits;
  const sold = sellCircuit(hs, "junk_craft_u");
  assert.equal(sold.hub.credits, creditsBefore + 25);
  assert.ok(!sold.hub.circuits.some((c) => c.circuitId === "junk_craft_u"));
  // Equip helper accepts it (effect stays 0 until Restore).
  const eq = equipCircuit(r.hub, "junk_craft_u", "owned_a");
  assert.equal(eq.ok, true);
  assert.equal(eq.hub.circuits.find((c) => c.circuitId === "junk_craft_u")!.restoreState, "unrestored");
}

// ---------------------------------------------------------------------------
// Confirm dialog: only when the credit cost is ≥ 100c (8×8 and up)
// ---------------------------------------------------------------------------
assert.equal(JUNK_CRAFT_CONFIRM_MIN_CREDITS, 100);
assert.equal(junkCraftConfirmText(2), null);
assert.equal(junkCraftConfirmText(7), null); // 68c
assert.equal(junkCraftConfirmText(8), "回路を作成しますか？\n8×8\nジャンク 16個・103c");
assert.ok(junkCraftConfirmText(20)!.includes("13301c"));

console.log("trade junk-craft selftest: ok");
