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
  AOI_HALF,
  captureFrontProgress,
  generateBoard,
  getCell,
  openCell,
  restoreBoardFromProgress,
} from "./board";
import {
  clearPersistedFrontProgress,
  loadOrCreateFrontSession,
  persistFrontSession,
} from "./hub-persist";
import {
  ALL_DESTROYED_INTEL,
  armForcedLockHistory,
  clearForcedHandoffIntent,
  clearPendingForcedCombat,
  isForcedCombatLock,
  markForcedHandoffIntent,
  readHandoffIntent,
  releaseForcedCombatLock,
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

{
  // hitMine → lock on; clear pending → lock off on re-entry (opened mine remains)
  const store = memStorage();
  clearPersistedFrontProgress(store);
  const session = loadOrCreateFrontSession(store);
  const board = session.board;
  let mine: { sx: number; sy: number } | null = null;
  for (let sy = -AOI_HALF; sy <= AOI_HALF && !mine; sy++) {
    for (let sx = -AOI_HALF; sx <= AOI_HALF && !mine; sx++) {
      const c = getCell(board, sx, sy);
      if (c && c.mine && !c.blocked && !c.open) mine = { sx, sy };
    }
  }
  assert.ok(mine, "expected a mine cell");
  const opened = openCell(board, mine!.sx, mine!.sy);
  assert.equal(opened.ok, true);
  assert.equal(board.hitMine, true);
  assert.equal(isForcedCombatLock(board), true);
  persistFrontSession(board, mine, store);

  const pending = loadOrCreateFrontSession(store);
  assert.equal(pending.restored, true);
  assert.equal(isForcedCombatLock(pending.board), true);
  assert.equal(getCell(pending.board, mine!.sx, mine!.sy)?.open, true);

  assert.equal(clearPendingForcedCombat(store), true);
  assert.equal(clearPendingForcedCombat(store), false);

  const after = loadOrCreateFrontSession(store);
  assert.equal(after.restored, true);
  assert.equal(after.board.hitMine, false);
  assert.equal(isForcedCombatLock(after.board), false);
  assert.equal(getCell(after.board, mine!.sx, mine!.sy)?.open, true);

  const snap = captureFrontProgress(after.board, mine);
  assert.ok(snap);
  assert.equal(snap!.hitMine, false);
  const restored = restoreBoardFromProgress(snap!, AOI_HALF);
  assert.ok(restored);
  assert.equal(restored!.board.hitMine, false);
  assert.equal(isForcedCombatLock(restored!.board), false);

  releaseForcedCombatLock(board);
  assert.equal(isForcedCombatLock(board), false);
}

{
  // Back-wipe also clears pending forced lock in HubSave
  const fleet = [
    createOwnedMech("mech_gen1", { instanceId: "w1", durability: 70 }),
  ];
  const board = generateBoard(AOI_HALF, 99);
  let mine: { sx: number; sy: number } | null = null;
  for (let sy = -AOI_HALF; sy <= AOI_HALF && !mine; sy++) {
    for (let sx = -AOI_HALF; sx <= AOI_HALF && !mine; sx++) {
      const c = getCell(board, sx, sy);
      if (c && c.mine && !c.blocked) mine = { sx, sy };
    }
  }
  assert.ok(mine);
  openCell(board, mine!.sx, mine!.sy);
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet });
  const storage = memStorage({
    [HUB_SAVE_STORAGE_KEY]: serializeHubSave(createHubSave(hub)),
  });
  persistFrontSession(board, mine, storage);
  assert.equal(
    deserializeHubSave(storage.getItem(HUB_SAVE_STORAGE_KEY)!)!.hub
      .frontProgress!.hitMine,
    true,
  );
  wipeAllMechsDestroyed(storage);
  const saved = deserializeHubSave(storage.getItem(HUB_SAVE_STORAGE_KEY)!);
  assert.ok(saved);
  assert.equal(saved!.hub.frontProgress!.hitMine, false);
  assert.ok((saved!.hub.frontProgress!.opened?.length ?? 0) >= 1);
}

console.log("invade forced-combat.selftest ok");
