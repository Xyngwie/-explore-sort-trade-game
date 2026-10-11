/**
 * Invade side of the first clear (神宮 10/12 Go): only the action that turns
 * the board "won" records it; a board already won on load does not (S2).
 */
import assert from "node:assert/strict";
import {
  FIRST_CLEAR_CIRCUIT_ID,
  INITIAL_HUB,
  firstClearDiscoveredOnBoard,
  isFoundTrueOneByOne,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  saveHubSaveToLocalStorage,
} from "@estg/shared";
import { AOI_HALF, captureFrontProgress, generateBoard, getCell, openCell, type MsBoard } from "./board";
import { loadOrCreateFrontSession, persistFrontSessionWithClear, regenerateFrontSession } from "./hub-persist";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

function sweep(board: MsBoard): void {
  for (const row of board.cells) for (const c of row) {
    if (c.blocked || c.mine || c.open) continue;
    openCell(board, c.sx, c.sy);
  }
}

// (1) sweep → record once; second save of the won board → nothing new.
{
  const st = memStorage();
  saveHubSaveToLocalStorage(normalizeHubSnapshot(INITIAL_HUB), st);
  const s = loadOrCreateFrontSession(st);
  sweep(s.board);
  assert.equal(s.board.status, "won");
  const r = persistFrontSessionWithClear(s.board, s.focus, st, { justWon: true });
  assert.deepEqual(r, { saved: true, discovered: true });
  const hub = loadHubSaveFromLocalStorage(st)!.hub;
  assert.equal(hub.firstInvadeClear?.boardSeed, s.board.seed);
  assert.equal(hub.circuits.filter(isFoundTrueOneByOne).length, 1);
  assert.equal(hub.circuits.find((c) => c.circuitId === FIRST_CLEAR_CIRCUIT_ID)?.restoreState, "unrestored");
  assert.equal(firstClearDiscoveredOnBoard(hub, s.board.seed), true);
  const again = persistFrontSessionWithClear(s.board, s.focus, st, { justWon: true });
  assert.equal(again.discovered, false, "double save: no second discovery");
  assert.equal(loadHubSaveFromLocalStorage(st)!.hub.circuits.filter(isFoundTrueOneByOne).length, 1);
  // reload the won board: nothing new
  const reload = loadOrCreateFrontSession(st);
  assert.equal(reload.board.status, "won");
  assert.equal(loadHubSaveFromLocalStorage(st)!.hub.circuits.filter(isFoundTrueOneByOne).length, 1);
  // second board swept: nothing, and the banner line does not belong to it
  const next = regenerateFrontSession(st);
  sweep(next.board);
  const r2 = persistFrontSessionWithClear(next.board, next.focus, st, { justWon: true });
  assert.equal(r2.discovered, false, "second sweep shows nothing");
  const hub2 = loadHubSaveFromLocalStorage(st)!.hub;
  assert.equal(firstClearDiscoveredOnBoard(hub2, next.board.seed), false);
  assert.equal(hub2.circuits.filter(isFoundTrueOneByOne).length, 1);
}
console.log("invade first-clear (1) sweep records once ok");

// (2) S2: an old save whose stored board is already won does not record on load or on a plain save.
{
  const st = memStorage();
  const board = generateBoard(AOI_HALF, 0x1234);
  sweep(board);
  assert.equal(board.status, "won");
  const old = normalizeHubSnapshot({ ...INITIAL_HUB, frontProgress: captureFrontProgress(board, { sx: 0, sy: 0 }) });
  assert.equal("firstInvadeClear" in old, false);
  saveHubSaveToLocalStorage(old, st);
  const s = loadOrCreateFrontSession(st);
  assert.equal(s.restored, true);
  assert.equal(s.board.status, "won");
  persistFrontSessionWithClear(s.board, s.focus, st, { justWon: false });
  const hub = loadHubSaveFromLocalStorage(st)!.hub;
  assert.equal(hub.firstInvadeClear, undefined, "already-won board on load is not a first clear");
  assert.equal(hub.circuits.some(isFoundTrueOneByOne), false);
  // a plain non-won save never records either
  const fresh = regenerateFrontSession(st);
  const c = getCell(fresh.board, 0, 0);
  assert.ok(c);
  persistFrontSessionWithClear(fresh.board, fresh.focus, st, { justWon: true });
  assert.equal(loadHubSaveFromLocalStorage(st)!.hub.firstInvadeClear, undefined, "not won → nothing");
}
console.log("invade first-clear (2) S2 already-won old board ok");
