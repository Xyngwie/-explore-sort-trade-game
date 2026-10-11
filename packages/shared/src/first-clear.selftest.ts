/**
 * First Invade clear + the "4" 1×1 discovery (神宮 10/12 Go; S1–S3 of 10/7).
 * Save compatibility: HubSave, the 5-3 checkpoint, circuits and wrecks.
 */
import assert from "node:assert/strict";
import {
  FIRST_CLEAR_CIRCUIT_ID,
  FIRST_CLEAR_DISCOVERY_LINE_JA,
  INITIAL_HUB,
  TRUE_ONE_BY_ONE_PUZZLE_ID,
  createHubSave,
  deserializeHubSave,
  equipCircuit,
  firstClearDiscoveredOnBoard,
  isFirstInvadeCleared,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  readSortieCheckpoint,
  recordFirstInvadeClear,
  resolveCluesForCircuitBoard,
  resolvePerfectCircuitInjectRate,
  resolveTrueBoardClues,
  saveHubSaveToLocalStorage,
  serializeHubSave,
  upsertCircuitIntoHub,
  writeSortieCheckpoint,
  type HubSnapshot,
  type OwnedMech,
} from "./index";
import {
  classifyCircuit,
  isFoundTrueOneByOne,
  isTrueOneByOne,
  makeFalseOneByOne,
  makeRestoredTrueOneByOne,
  makeTrueOneByOne,
  slotCapacity,
} from "./circuit-actions";

function mech(instanceId: string, over: Partial<OwnedMech> = {}): OwnedMech {
  return { instanceId, catalogId: "mech_gen1", status: "operational", durability: 100, durabilityMax: 100, ...over } as OwnedMech;
}

function memStore() {
  const mem = new Map<string, string>();
  return {
    mem,
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
}

/** A pre-first-clear save: swept board, a wreck with circuits inside, the false 1×1 on the captain. */
function oldSave(): Record<string, unknown> {
  return {
    ...INITIAL_HUB,
    credits: 777,
    fleet: [mech("cap")],
    circuits: [
      { ...makeFalseOneByOne("false-1x1-cap"), equippedTo: "cap" },
      { ...makeFalseOneByOne("wreck-c"), equippedTo: "w-dead" },
    ],
    lostMechs: [
      {
        instanceId: "w-dead",
        currentAmmo: 3,
        battery: { capacity: 300, activity: 200 },
        lostAt: "2026-10-11T00:00:00.000Z",
        lostSortieId: "s-w",
        circuitIds: ["wreck-c"],
        frontSeed: 4242,
        cell: { sx: 1, sy: 0 },
        catalogId: "mech_gen1",
        durability: 0,
        durabilityMax: 100,
        status: "destroyed",
        kind: "wreck",
        pos: { x: 100, y: 200 },
      },
    ],
    frontProgress: { v: 1, seed: 4242, opened: [{ sx: 0, sy: 0 }], flagged: [], hitMine: false, focus: null },
  };
}

// (1) S2: an old save without the key is not cleared, even with a (swept-looking) board.
{
  const hub = normalizeHubSnapshot(oldSave() as unknown as HubSnapshot);
  assert.equal(isFirstInvadeCleared(hub), false, "(1) missing key → not cleared");
  assert.equal("firstInvadeClear" in hub, false, "(1) normalize does not invent the key");
  assert.equal(hub.credits, 777);
  assert.equal(hub.lostMechs.length, 1, "(1) wreck row kept");
  assert.equal(hub.lostMechs[0]!.kind, "wreck");
  assert.deepEqual(
    hub.circuits.filter((c) => c.equippedTo === "w-dead").map((c) => c.circuitId),
    ["wreck-c"],
    "(1) circuit stays inside the wreck",
  );
  const round = deserializeHubSave(serializeHubSave(createHubSave(hub)));
  assert.ok(round);
  assert.equal("firstInvadeClear" in round!.hub, false, "(1) still absent after a save round trip");
}
console.log("first-clear (1) old save loads as not cleared ok");

// (2) first sweep: key + one unrestored "4" in the stash.
let afterFirst: HubSnapshot;
{
  const hub = normalizeHubSnapshot(oldSave() as unknown as HubSnapshot);
  const r = recordFirstInvadeClear(hub, 4242, new Date("2026-10-12T00:00:00Z"));
  assert.equal(r.discovered, true);
  assert.deepEqual(r.hub.firstInvadeClear, { boardSeed: 4242, at: "2026-10-12T00:00:00.000Z" });
  const fours = r.hub.circuits.filter(isFoundTrueOneByOne);
  assert.equal(fours.length, 1, "(2) exactly one 「4」");
  const four = fours[0]!;
  assert.equal(four.circuitId, FIRST_CLEAR_CIRCUIT_ID);
  assert.equal(four.restoreState, "unrestored", "(2) unrestored");
  assert.equal(four.equippedTo, null, "(2) in the stash");
  assert.equal(four.locked, undefined, "(2) editable in Restore");
  assert.equal(four.circuitBoard.puzzleId, TRUE_ONE_BY_ONE_PUZZLE_ID);
  assert.equal(resolveCluesForCircuitBoard(four.circuitBoard)[0]?.[0], 4, "(2) clue 4");
  assert.equal(isTrueOneByOne(four), false, "(2) not a true 1×1 until restored");
  assert.equal(classifyCircuit(four).effect, 0);
  assert.equal(slotCapacity([four]), 1, "(2) no extra slot before Restore");
  assert.equal(r.hub.lostMechs.length, 1, "(2) wreck untouched");
  assert.equal(r.hub.credits, 777, "(2) no money reward");
  assert.equal(firstClearDiscoveredOnBoard(r.hub, 4242), true);
  assert.equal(firstClearDiscoveredOnBoard(r.hub, 99), false, "(2) another board shows nothing");
  assert.equal(FIRST_CLEAR_DISCOVERY_LINE_JA, "盤の奥で、小さな回路を1枚見つけた");
  afterFirst = r.hub;
}
console.log("first-clear (2) first sweep records + discovers once ok");

// (3) never a second time: second sweep, reload, double save/apply, sold 「4」.
{
  const again = recordFirstInvadeClear(afterFirst, 9999);
  assert.equal(again.discovered, false, "(3) second sweep discovers nothing");
  assert.equal(again.hub, afterFirst);
  const store = memStore();
  assert.equal(saveHubSaveToLocalStorage(afterFirst, store), true);
  const loaded = loadHubSaveFromLocalStorage(store);
  assert.ok(loaded?.hub);
  assert.deepEqual(loaded!.hub.firstInvadeClear, afterFirst.firstInvadeClear, "(3) key survives reload");
  const reapplied = recordFirstInvadeClear(normalizeHubSnapshot(loaded!.hub), 4242);
  assert.equal(reapplied.discovered, false, "(3) reload + same board: nothing new");
  assert.equal(reapplied.hub.circuits.filter(isFoundTrueOneByOne).length, 1);
  // double save of the same result
  saveHubSaveToLocalStorage(reapplied.hub, store);
  saveHubSaveToLocalStorage(normalizeHubSnapshot(reapplied.hub), store);
  assert.equal(loadHubSaveFromLocalStorage(store)!.hub.circuits.filter(isFoundTrueOneByOne).length, 1, "(3) double save: one 「4」");
  // a stale copy (from before the clear) applied after the clear writes the same single 「4」
  const stale = normalizeHubSnapshot(oldSave() as unknown as HubSnapshot);
  const fromStale = recordFirstInvadeClear(stale, 4242);
  assert.equal(fromStale.hub.circuits.filter(isFoundTrueOneByOne).length, 1);
  // the 「4」 sold / gone: the key alone stops a re-grant
  const sold = normalizeHubSnapshot({ ...afterFirst, circuits: afterFirst.circuits.filter((c) => !isFoundTrueOneByOne(c)) });
  const r2 = recordFirstInvadeClear(sold, 1);
  assert.equal(r2.discovered, false);
  assert.equal(r2.hub.circuits.some(isFoundTrueOneByOne), false, "(3) no re-grant after selling");
  // an odd stored value counts as cleared (never re-grants)
  const odd = normalizeHubSnapshot({ ...oldSave(), firstInvadeClear: true } as unknown as HubSnapshot);
  assert.equal(isFirstInvadeCleared(odd), true);
  assert.deepEqual(odd.firstInvadeClear, { boardSeed: null });
  assert.equal(recordFirstInvadeClear(odd, 1).discovered, false);
  const nul = normalizeHubSnapshot({ ...oldSave(), firstInvadeClear: null } as unknown as HubSnapshot);
  assert.equal(isFirstInvadeCleared(nul), false, "(3) null reads as not cleared");
  // a save that already owns a restored 「4」 (older test fixture) gets the key but no second 「4」
  const owned = normalizeHubSnapshot({ ...oldSave(), circuits: [makeRestoredTrueOneByOne("old-four")] } as unknown as HubSnapshot);
  const r3 = recordFirstInvadeClear(owned, 5);
  assert.equal(r3.discovered, true);
  assert.equal(r3.hub.circuits.filter(isFoundTrueOneByOne).length, 1, "(3) owned 「4」: no duplicate");
}
console.log("first-clear (3) no second discovery (sweep / reload / double save / sold) ok");

// (4) S3: Restore fixes the 「4」, then it can be equipped (+1 slot on the captain).
{
  assert.deepEqual(resolveTrueBoardClues(TRUE_ONE_BY_ONE_PUZZLE_ID)?.clues, [[4]]);
  const solved = makeRestoredTrueOneByOne("x").circuitBoard;
  const back = upsertCircuitIntoHub(afterFirst, {
    circuitId: FIRST_CLEAR_CIRCUIT_ID,
    circuitBoard: { ...solved, locked: undefined, perfect: true, outcome: "fully_awakened" },
    outcome: "fully_awakened",
    perfect: true,
    digitRate: 1,
    loopClosed: true,
    lastEditorName: "神宮",
  });
  const four = back.circuits.find((c) => c.circuitId === FIRST_CLEAR_CIRCUIT_ID)!;
  assert.equal(four.restoreState, "fully_awakened");
  assert.equal(four.locked, true, "(4) Perfect lock after Restore");
  assert.equal(isTrueOneByOne(four), true, "(4) now the true 1×1");
  const eq = equipCircuit(back, FIRST_CLEAR_CIRCUIT_ID, "cap");
  assert.equal(eq.ok, true, "(4) equips next to the false 1×1 (true 1×1 adds a slot)");
  const mine = eq.hub.circuits.filter((c) => c.equippedTo === "cap");
  assert.equal(mine.length, 2);
  const unrestored = equipCircuit(
    normalizeHubSnapshot({ ...afterFirst, circuits: afterFirst.circuits }),
    FIRST_CLEAR_CIRCUIT_ID,
    "cap",
  );
  assert.equal(unrestored.ok, false, "(4) the unrestored 「4」 does not fit next to the false 1×1");
  assert.equal(makeTrueOneByOne("y").restoreState, "unrestored");
}
console.log("first-clear (4) Restore then equip ok");

// (5) S1: true-board rate reads the stored key (0% before, base after).
{
  const store = memStore();
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  g.localStorage = store;
  try {
    saveHubSaveToLocalStorage(normalizeHubSnapshot(oldSave() as unknown as HubSnapshot), store);
    assert.equal(resolvePerfectCircuitInjectRate({ hostname: "example.com" }), 0, "(5) before the first clear: 0%");
    saveHubSaveToLocalStorage(afterFirst, store);
    assert.equal(resolvePerfectCircuitInjectRate({ hostname: "example.com" }), 0.01, "(5) after: 1%");
  } finally {
    g.localStorage = prev;
  }
}
console.log("first-clear (5) S1 rate gate ok");

// (6) the 5-3 checkpoint is a separate key; recording the clear leaves it as it was.
{
  const store = memStore();
  const body = { phase: "sortie", leader: { id: "leader" } };
  assert.equal(writeSortieCheckpoint({ v: 1, kind: "sortie", body }, store), true);
  saveHubSaveToLocalStorage(afterFirst, store);
  const read = readSortieCheckpoint(store);
  assert.equal(read.status, "ok");
  if (read.status === "ok" && read.record.kind === "sortie") assert.deepEqual(read.record.body, body);
}
console.log("first-clear (6) sortieCheckpoint untouched ok");
