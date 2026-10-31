/** Fullscreen shell PR1: tab model + save/checkpoint compat (read-only shell). */
import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  createNewGameHub,
  loadHubSaveFromLocalStorage,
  saveHubSaveToLocalStorage,
  readSortieCheckpoint,
  SORTIE_CHECKPOINT_KEY,
  computeShellModel,
  SHELL_TABS,
  SHELL_TAB_MODULE,
  type HubSnapshot,
} from "./index";

class Mem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
}
const ids = (hub: HubSnapshot | null, current: any, handoff = false) =>
  computeShellModel({ current, hub, handoffInProgress: handoff });
const enabled = (m: ReturnType<typeof ids>) => m.tabs.filter((t) => t.enabled).map((t) => t.id);

assert.deepEqual([...SHELL_TABS], ["DOCK", "INVADE", "SORT", "RESTORE", "SORTIE"]);
assert.equal(new Set(Object.values(SHELL_TAB_MODULE)).size, 5);

// Existing (pre-#332) save: no newGameIntro → all non-current tabs open.
const legacy = { ...INITIAL_HUB };
assert.equal(legacy.newGameIntro, undefined);
let m = ids(legacy, "trade");
assert.equal(m.hidden, false);
assert.deepEqual(enabled(m), ["INVADE", "SORT", "RESTORE", "SORTIE"]);
assert.equal(m.tabs.find((t) => t.active)?.id, "DOCK");

// Q4: sortie (explore) hides the bar.
assert.equal(ids(legacy, "explore").hidden, true);

// Q11: new game before first sortie → only DOCK (hub owns the route).
const fresh = createNewGameHub();
assert.ok(fresh.newGameIntro && !fresh.newGameIntro.firstSortie);
assert.deepEqual(enabled(ids(fresh, "trade")), []);
assert.deepEqual(enabled(ids(fresh, "restore")), ["DOCK"]);
const done = { ...fresh, newGameIntro: { ...fresh.newGameIntro!, firstSortie: { nonce: "n", leaderId: "l", circuitId: "c" } } };
assert.deepEqual(enabled(ids(done, "trade")), ["INVADE", "SORT", "RESTORE", "SORTIE"]);

// #332 guard: mid-handoff SORT cannot be left via tabs.
assert.deepEqual(enabled(ids(legacy, "sort", true)), []);
// No save: only DOCK.
assert.deepEqual(enabled(ids(null, "restore")), ["DOCK"]);

// Save/checkpoint compat: reading for the shell never mutates storage.
const store = new Mem();
assert.ok(saveHubSaveToLocalStorage(legacy, store as any));
store.setItem(SORTIE_CHECKPOINT_KEY, "{\"v\":1,\"probe\":true}");
const before = JSON.stringify([...store.m]);
const cpBefore = JSON.stringify(readSortieCheckpoint(store as any));
const loaded = loadHubSaveFromLocalStorage(store as any)!.hub;
computeShellModel({ current: "trade", hub: loaded, handoffInProgress: false });
assert.equal(JSON.stringify([...store.m]), before);
assert.equal(JSON.stringify(readSortieCheckpoint(store as any)), cpBefore);
assert.equal(loaded.newGameIntro, undefined);
const s2 = new Mem();
assert.ok(saveHubSaveToLocalStorage(fresh, s2 as any));
assert.deepEqual(enabled(ids(loadHubSaveFromLocalStorage(s2 as any)!.hub, "trade")), []);

console.log("shared fullscreen-shell.selftest ok");
