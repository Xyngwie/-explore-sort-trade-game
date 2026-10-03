import assert from "node:assert/strict";
import {
  HUB_SAVE_STORAGE_KEY,
  INITIAL_HUB,
  createOwnedMech,
  deserializeHubSave,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  saveHubSaveToLocalStorage,
  type HubSnapshot,
} from "@estg/shared";
import { AOI_HALF, generateBoard, getCell, openCell, toggleFlag } from "./board";
import { loadOrCreateFrontSession, persistFrontSession, regenerateFrontSession } from "./hub-persist";
import {
  FRONT_START_CELL,
  clampToFront,
  lostMechSortieLineJa,
  lostMechTitleJa,
  lostMechsByCell,
  placeLostOnFront,
  playableHalf,
} from "./lost-mechs";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}
const row = (id: string, place?: { frontSeed: number; cell: { sx: number; sy: number } }) => ({
  instanceId: id, currentAmmo: 5, battery: { capacity: 300, activity: 200 }, circuitIds: [] as string[], ...(place ?? {}),
});
const load = (st: Storage) => normalizeHubSnapshot(loadHubSaveFromLocalStorage(st)!.hub);

// clamp: playable range is inside the wall ring (Chebyshev d < 12) and the AOI
{
  assert.equal(playableHalf(AOI_HALF), 11);
  assert.deepEqual(clampToFront({ sx: 3, sy: -4 }, AOI_HALF), { sx: 3, sy: -4 });
  assert.deepEqual(clampToFront({ sx: 30, sy: -32 }, AOI_HALF), { sx: 11, sy: -11 });
  assert.deepEqual(clampToFront({ sx: 12, sy: 0 }, AOI_HALF), { sx: 11, sy: 0 }, "wall ring → inside");
}

// placeLostOnFront: same board kept; other board → same coords (clamped); no place → start cell; fieldDrops follow
{
  const hub = normalizeHubSnapshot({
    ...INITIAL_HUB,
    lostMechs: [
      row("here", { frontSeed: 10, cell: { sx: 2, sy: 3 } }),
      row("old", { frontSeed: 9, cell: { sx: -5, sy: 1 } }),
      row("far", { frontSeed: 9, cell: { sx: 20, sy: -20 } }),
      row("legacy"),
    ],
    fieldDrops: [{
      dropId: "drop_a", frontSeed: 9, cell: { sx: 4, sy: 4 }, cause: "wreck_not_carried", fromMechInstanceId: "x", droppedAt: "2026-10-03T00:00:00.000Z",
      circuit: { circuitId: "c1", circuitBoard: { v: 1, cols: 2, rows: 2, edgeState: "" }, outcome: "offline", restoreState: "offline", equippedTo: null },
    } as never],
  } as HubSnapshot);
  assert.equal(hub.lostMechs.length, 4);
  const res = placeLostOnFront(hub, 10, AOI_HALF);
  assert.equal(res.changed, true);
  assert.deepEqual(res.moved, ["old", "far"]);
  assert.deepEqual(res.placed, ["legacy"]);
  const byId = new Map(res.hub.lostMechs.map((m) => [m.instanceId, m]));
  assert.deepEqual([byId.get("here")!.frontSeed, byId.get("here")!.cell], [10, { sx: 2, sy: 3 }], "this board: unchanged");
  assert.deepEqual([byId.get("old")!.frontSeed, byId.get("old")!.cell], [10, { sx: -5, sy: 1 }], "same coordinates");
  assert.deepEqual(byId.get("far")!.cell, { sx: 11, sy: -11 }, "clamped into range");
  assert.deepEqual([byId.get("legacy")!.frontSeed, byId.get("legacy")!.cell], [10, FRONT_START_CELL], "no place → start cell");
  assert.equal(byId.get("legacy")!.lostAt, undefined, "only the place is added");
  assert.equal(hub.fieldDrops.length, 1, "fixture drop survives normalize");
  assert.deepEqual(res.movedDrops, ["drop_a"]);
  assert.deepEqual([res.hub.fieldDrops[0]!.frontSeed, res.hub.fieldDrops[0]!.cell], [10, { sx: 4, sy: 4 }], "circuit drop: same rule");
  // idempotent
  const again = placeLostOnFront(res.hub, 10, AOI_HALF);
  assert.equal(again.changed, false);
  assert.equal(again.hub, res.hub);
  // marks
  const marks = lostMechsByCell(res.hub, 10);
  assert.deepEqual(marks.get("0,0"), ["legacy"]);
  assert.deepEqual(marks.get("2,3"), ["here"]);
  assert.equal(lostMechsByCell(res.hub, 11).size, 0, "other seed → no marks");
  // tooltip / bar text
  assert.equal(lostMechTitleJa(["m2"]), "置き去り機 m2");
  assert.equal(lostMechTitleJa(["m2", "m3"]), "置き去り機 2 機: m2, m3");
  assert.equal(lostMechSortieLineJa(2), "置き去り機 2 機：出撃して離陸すれば回収");
}

// inventoryFieldDrops: same rule as lostMechs / fieldDrops (same coordinates, clamped; this board kept)
{
  const inv = (dropId: string, frontSeed: number, cell: { sx: number; sy: number }) => ({
    dropId, frontSeed, cell, inventory: { iron: 2 }, cause: "wreck_not_carried", droppedAt: "2026-10-03T00:00:00.000Z",
  });
  const hub = normalizeHubSnapshot({
    ...INITIAL_HUB,
    inventoryFieldDrops: [inv("inv_here", 10, { sx: 1, sy: 1 }), inv("inv_old", 9, { sx: -3, sy: 2 }), inv("inv_far", 9, { sx: -25, sy: 18 })],
  } as never);
  assert.equal(hub.inventoryFieldDrops.length, 3, "fixture inventory drops survive normalize");
  const res = placeLostOnFront(hub, 10, AOI_HALF);
  assert.equal(res.changed, true);
  assert.deepEqual(res.movedInventoryDrops, ["inv_old", "inv_far"]);
  const byId = new Map(res.hub.inventoryFieldDrops.map((d) => [d.dropId, d]));
  assert.deepEqual([byId.get("inv_here")!.frontSeed, byId.get("inv_here")!.cell], [10, { sx: 1, sy: 1 }], "inventory drop on this board: unchanged");
  assert.deepEqual([byId.get("inv_old")!.frontSeed, byId.get("inv_old")!.cell], [10, { sx: -3, sy: 2 }], "inventory drop: same coordinates");
  assert.deepEqual(byId.get("inv_far")!.cell, { sx: -11, sy: 11 }, "inventory drop: clamped into range");
  assert.deepEqual(byId.get("inv_old")!.inventory, hub.inventoryFieldDrops.find((d) => d.dropId === "inv_old")!.inventory, "contents kept");
  assert.equal(placeLostOnFront(res.hub, 10, AOI_HALF).changed, false, "idempotent");
}

// hub-persist: Invade open puts legacy rows on the start cell and saves; regenerate moves rows to the same coords
{
  const st = memStorage();
  const first = loadOrCreateFrontSession(st); // creates + persists a board
  const seed1 = first.board.seed!;
  const mech = createOwnedMech("mech_gen1", { instanceId: "keep" });
  const hub0 = normalizeHubSnapshot({
    ...load(st),
    fleet: [mech],
    lostMechs: [row("legacy"), row("placed", { frontSeed: seed1, cell: { sx: 1, sy: 1 } })],
  });
  assert.ok(saveHubSaveToLocalStorage(hub0, st));
  const s1 = loadOrCreateFrontSession(st);
  assert.equal(s1.restored, true);
  assert.deepEqual(s1.placement.placed, ["legacy"]);
  assert.deepEqual(s1.lostByCell.get("0,0"), ["legacy"]);
  assert.deepEqual(s1.lostByCell.get("1,1"), ["placed"]);
  const saved1 = load(st);
  assert.deepEqual(saved1.lostMechs.find((m) => m.instanceId === "legacy")!.cell, FRONT_START_CELL, "written back to HubSave");
  assert.equal(saved1.lostMechs.find((m) => m.instanceId === "legacy")!.frontSeed, seed1);
  assert.deepEqual(saved1.fleet.map((m) => m.instanceId), ["keep"], "other hub fields untouched");
  // re-open: nothing to change
  assert.equal(loadOrCreateFrontSession(st).placement.changed, false);

  // the mark is display only: opening / flagging behave the same with or without marks
  const a = generateBoard(AOI_HALF, seed1);
  const b = generateBoard(AOI_HALF, seed1);
  const ra = openCell(a, 1, 1);
  const rb = openCell(b, 1, 1);
  assert.deepEqual(ra, rb);
  assert.deepEqual(toggleFlag(a, 2, 2), toggleFlag(b, 2, 2));
  assert.deepEqual(JSON.stringify(a.cells), JSON.stringify(b.cells));

  // regenerate → same coordinates on the new board
  const s2 = regenerateFrontSession(st);
  const seed2 = s2.board.seed!;
  assert.notEqual(seed2, seed1);
  assert.deepEqual(s2.placement.moved.sort(), ["legacy", "placed"]);
  assert.deepEqual(s2.lostByCell.get("0,0"), ["legacy"]);
  assert.deepEqual(s2.lostByCell.get("1,1"), ["placed"]);
  const saved2 = load(st);
  assert.ok(saved2.lostMechs.every((m) => m.frontSeed === seed2), "frontSeed rewritten to the new board");
  assert.equal(saved2.frontProgress?.seed, seed2);
  // the new board's progress is the fresh one (only HQ open); marks did not open cells
  assert.equal(JSON.stringify(s2.board.cells), JSON.stringify(generateBoard(AOI_HALF, seed2).cells), "board = a fresh board of that seed");
  assert.ok(getCell(s2.board, 1, 1));
  persistFrontSession(s2.board, { sx: 0, sy: 0 }, st);
  assert.equal(deserializeHubSave(st.getItem(HUB_SAVE_STORAGE_KEY)!)!.hub.lostMechs.length, 2);
}

console.log("invade lost-mechs selftest: ok");
