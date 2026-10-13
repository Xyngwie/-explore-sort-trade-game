import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  normalizeHubSnapshot,
  saveHubSaveToLocalStorage,
  loadHubSaveFromLocalStorage,
  invadeRankOf,
  unlockedInvadeRank,
} from "@estg/shared";
import {
  loadOrCreateFrontSession,
  persistFrontSessionWithClear,
  changeFrontRank,
} from "./hub-persist";
import { openCell } from "./board";
const map = new Map<string, string>();
let refuse = false;
const store = {
  getItem: (k: string) => map.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (refuse) throw Error("test refused write");
    map.set(k, v);
  },
};
saveHubSaveToLocalStorage(
  normalizeHubSnapshot({ ...INITIAL_HUB, credits: 20000 }),
  store,
);
const session = loadOrCreateFrontSession(store);
for (const row of session.board.cells)
  for (const c of row)
    if (!c.mine && !c.blocked && !c.open) openCell(session.board, c.sx, c.sy);
assert.equal(session.board.status, "won");
refuse = true;
const failed = persistFrontSessionWithClear(
  session.board,
  session.focus,
  store,
  { justWon: true },
);
assert.equal(failed.saved, false);
assert.equal(failed.discovered, false);
assert.equal(unlockedInvadeRank(loadHubSaveFromLocalStorage(store)!.hub), 0);
refuse = false;
const success = persistFrontSessionWithClear(
  session.board,
  session.focus,
  store,
  { justWon: true },
);
assert.equal(success.saved, true);
assert.equal(unlockedInvadeRank(loadHubSaveFromLocalStorage(store)!.hub), 1);
assert.equal(
  persistFrontSessionWithClear(session.board, session.focus, store, {
    justWon: true,
  }).discovered,
  false,
);
const hub = loadHubSaveFromLocalStorage(store)!.hub;
assert.equal(hub.credits, 20000);
refuse = true;
assert.equal(changeFrontRank(1, store), null);
assert.equal(invadeRankOf(loadHubSaveFromLocalStorage(store)!.hub).current, 0);
refuse = false;
const upper = changeFrontRank(1, store)!;
assert.equal(invadeRankOf(loadHubSaveFromLocalStorage(store)!.hub).current, 1);
assert.notEqual(upper.board.seed, session.board.seed);
assert.equal(changeFrontRank(2, store), null);
assert.equal(changeFrontRank(0, store)!.board.status, "playing");
assert.equal(unlockedInvadeRank(loadHubSaveFromLocalStorage(store)!.hub), 1);
console.log(
  "Invade rank saves, first clear, switching, withdrawal and refused writes PASS",
);
