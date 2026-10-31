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
  shellTabHref,
  hudItems,
  formatHudNumber,
  hudUnopenedEnabled,
  SHELL_CSS,
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

// Decision 1: SORT tab → DOCK #unopened-panel; others → own module.
assert.equal(shellTabHref("SORT", "/g/", "/g/sort/"), "/g/#unopened-panel");
assert.equal(shellTabHref("SORT", "/g/#x", "/g/sort/"), "/g/#unopened-panel");
assert.equal(shellTabHref("RESTORE", "/g/", "/g/restore/"), "/g/restore/");
// PR2 HUD: order, labels, colors, stock-only values, zero, formatting.
const h = { ...legacy, credits: 12345, unopenedContainers: 3, inventory: { ammo: 0, armor: 7, power: 1, junk: 99 } };
assert.deepEqual(hudItems(h).map((i) => [i.label, i.value, i.color]), [
  ["Cr", 12345, "#ffffff"], ["弾", 0, "#f85149"], ["装", 7, "#58a6ff"], ["電", 1, "#d4a72c"], ["箱", 3, "#ffffff"],
]);
assert.deepEqual(hudItems(null).map((i) => i.value), [0, 0, 0, 0, 0]);
assert.equal(hudItems({ ...h, credits: -5, inventory: { ammo: 2.9 } as any })[0].value, 0);
assert.equal(formatHudNumber(9999, true), "9999");
assert.equal(formatHudNumber(10000, true), "10k");
assert.equal(formatHudNumber(12345, true), "12.3k");
assert.equal(formatHudNumber(5_000_000, true), "5M");
assert.equal(formatHudNumber(1234567, false), "1,234,567");
// Unopened tap: onboarding OK, SORT handoff / no save / explore off.
assert.equal(hudUnopenedEnabled({ current: "trade", hub: fresh, handoffInProgress: false }), true);
assert.equal(hudUnopenedEnabled({ current: "sort", hub: fresh, handoffInProgress: true }), false);
assert.equal(hudUnopenedEnabled({ current: "trade", hub: null, handoffInProgress: false }), false);
// HUD reads the loaded save without mutating save or checkpoint.
const s3 = new Mem();
assert.ok(saveHubSaveToLocalStorage(h, s3 as any));
s3.setItem(SORTIE_CHECKPOINT_KEY, "{\"v\":1}");
const snap = JSON.stringify([...s3.m]);
assert.equal(hudItems(loadHubSaveFromLocalStorage(s3 as any)!.hub)[2].value, 7);
assert.equal(JSON.stringify([...s3.m]), snap);
// Tab bar ignores per-screen button styles (DOCK/SORT): reset + !important on every visual prop.
const tabRule = SHELL_CSS.match(/#wl-shell-tabs button\{([^}]*)\}/)![1];
assert.ok(tabRule.startsWith("all:unset"));
for (const prop of ["background", "border", "border-radius", "box-shadow", "color", "font", "padding", "margin"])
  assert.match(tabRule, new RegExp(`(^|;)${prop}:[^;]*!important`), prop);
assert.match(SHELL_CSS, /button:disabled\{color:#484f58!important\}/);
assert.match(SHELL_CSS, /aria-current=page\]\{color:#fff!important;box-shadow:inset 0 2px 0 #4f8fe8!important\}/);
console.log("shared fullscreen-shell.selftest ok");
