import assert from "node:assert/strict";
import {
  HUB_SAVE_STORAGE_KEY,
  deserializeHubSave,
  normalizeFrontProgress,
} from "@estg/shared";
import {
  AOI_HALF,
  captureFrontProgress,
  generateBoard,
  getCell,
  openCell,
  restoreBoardFromProgress,
  toggleFlag,
} from "./board";
import {
  clearPersistedFrontProgress,
  loadOrCreateFrontSession,
  persistFrontSession,
  regenerateFrontSession,
} from "./hub-persist";

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

// --- capture / restore round-trip ---
{
  const seed = 0xabcd;
  const board = generateBoard(AOI_HALF, seed);
  assert.equal(board.seed, seed);

  let openedExtra = 0;
  for (let sy = -2; sy <= 2 && openedExtra < 3; sy++) {
    for (let sx = -2; sx <= 2 && openedExtra < 3; sx++) {
      if (sx === 0 && sy === 0) continue;
      const r = openCell(board, sx, sy);
      if (r.ok && !getCell(board, sx, sy)?.mine) openedExtra++;
    }
  }

  let flagged = false;
  for (let sy = -AOI_HALF; sy <= AOI_HALF && !flagged; sy++) {
    for (let sx = -AOI_HALF; sx <= AOI_HALF && !flagged; sx++) {
      const c = getCell(board, sx, sy);
      if (!c || c.blocked || c.open || c.isHq) continue;
      const r = toggleFlag(board, sx, sy);
      if (r.ok && r.flagged) flagged = true;
    }
  }
  assert.ok(flagged, "expected to place at least one flag");

  const focus = { sx: 1, sy: 0 };
  const snap = captureFrontProgress(board, focus);
  assert.ok(snap);
  assert.equal(snap!.seed, seed);
  assert.ok(snap!.opened.length >= 1);
  assert.ok(snap!.flagged.length >= 1);
  assert.equal(snap!.focus?.sx, 1);

  const restored = restoreBoardFromProgress(snap!, AOI_HALF);
  assert.ok(restored);
  assert.equal(restored!.board.seed, seed);
  assert.equal(restored!.board.mineCount, board.mineCount);
  assert.equal(restored!.focus?.sx, 1);

  for (let sy = -AOI_HALF; sy <= AOI_HALF; sy++) {
    for (let sx = -AOI_HALF; sx <= AOI_HALF; sx++) {
      const a = getCell(board, sx, sy)!;
      const b = getCell(restored!.board, sx, sy)!;
      assert.equal(a.mine, b.mine, `mine mismatch at ${sx},${sy}`);
      assert.equal(a.open, b.open, `open mismatch at ${sx},${sy}`);
      assert.equal(a.flagged, b.flagged, `flag mismatch at ${sx},${sy}`);
    }
  }
}

// --- HubSave persist via memory storage ---
{
  const store = memStorage();
  const session = loadOrCreateFrontSession(store);
  assert.equal(session.restored, false);
  assert.ok(session.board.seed != null);

  const raw = store.getItem(HUB_SAVE_STORAGE_KEY);
  assert.ok(raw);
  const parsed = deserializeHubSave(raw!);
  assert.ok(parsed?.hub.frontProgress);
  assert.equal(parsed!.hub.frontProgress!.seed, session.board.seed);

  toggleFlag(session.board, 4, 4);
  openCell(session.board, 2, 1);
  persistFrontSession(session.board, { sx: 2, sy: 1 }, store);

  const again = loadOrCreateFrontSession(store);
  assert.equal(again.restored, true);
  assert.equal(again.board.seed, session.board.seed);
  assert.equal(again.focus?.sx, 2);
  assert.equal(getCell(again.board, 4, 4)?.flagged, true);

  const regen = regenerateFrontSession(store);
  assert.notEqual(regen.board.seed, session.board.seed);
  const afterRegen = deserializeHubSave(store.getItem(HUB_SAVE_STORAGE_KEY)!);
  assert.equal(afterRegen!.hub.frontProgress!.seed, regen.board.seed);

  clearPersistedFrontProgress(store);
  const cleared = deserializeHubSave(store.getItem(HUB_SAVE_STORAGE_KEY)!);
  assert.equal(cleared!.hub.frontProgress, null);

  const n = normalizeFrontProgress({
    seed: 1,
    opened: [],
    flagged: [],
    focus: null,
  });
  assert.equal(n?.seed, 1);
}

console.log("invade hub-persist selftest: ok");
