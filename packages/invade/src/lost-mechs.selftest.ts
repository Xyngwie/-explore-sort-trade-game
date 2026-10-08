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
  fieldDropSortieLineJa,
  fieldDropTitleJa,
  fieldDropsByCell,
  lostMechSortieLineJa,
  lostMechTitleJa,
  lostMechsByCell,
  placeLostOnFront,
  playableHalf,
  wreckSortieLineJa,
  wreckTitleJa,
  wrecksByCell,
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
      dropId: "drop_a", frontSeed: 9, cell: { sx: 4, sy: 4 }, cause: "left_behind", fromMechInstanceId: "x", droppedAt: "2026-10-03T00:00:00.000Z",
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

  // field drops marks
  const dropMarks = fieldDropsByCell(res.hub, 10);
  assert.deepEqual(dropMarks.get("4,4"), ["c1"]);
  assert.equal(fieldDropsByCell(res.hub, 11).size, 0, "other seed → no drop marks");
  // multiple field drops on same cell
  const hubMultiDrop = normalizeHubSnapshot({
    ...res.hub,
    fieldDrops: [
      ...res.hub.fieldDrops,
      {
        dropId: "drop_b",
        frontSeed: 10,
        cell: { sx: 4, sy: 4 },
        cause: "left_behind",
        droppedAt: "2026-10-03T00:00:00.000Z",
        circuit: {
          circuitId: "c2",
          circuitBoard: { v: 1, cols: 2, rows: 2, edgeState: "" },
          outcome: "offline",
          restoreState: "offline",
          equippedTo: null,
        },
      } as never,
    ],
  });
  assert.deepEqual(fieldDropsByCell(hubMultiDrop, 10).get("4,4"), ["c1", "c2"]);
  // field drop tooltip / bar text
  assert.equal(fieldDropTitleJa([]), "");
  assert.equal(fieldDropTitleJa(["c1"]), "落とし物 c1");
  assert.equal(fieldDropTitleJa(["c1", "c2"]), "落とし物 2: c1, c2");
  assert.equal(fieldDropTitleJa(["c1", "c2", "c3"]), "落とし物 3: c1, c2, c3");
  assert.equal(fieldDropSortieLineJa(1), "落とし物 1：出撃して離陸すれば回収");
  assert.equal(fieldDropSortieLineJa(2), "落とし物 2：出撃して離陸すれば回収");
  assert.equal(fieldDropSortieLineJa(3), "落とし物 3：出撃して離陸すれば回収");

  // null / empty / fallback handling
  assert.equal(fieldDropsByCell(null, 10).size, 0);
  assert.equal(fieldDropsByCell(res.hub, null).size, 0);
  assert.equal(fieldDropsByCell(res.hub, NaN).size, 0);
  const fallbackDrop = {
    fieldDrops: [{
      dropId: "fallback_id",
      frontSeed: 10,
      cell: { sx: 2, sy: 2 },
    } as never],
  };
  assert.deepEqual(fieldDropsByCell(fallbackDrop, 10).get("2,2"), ["fallback_id"]);
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
    fieldDrops: [{
      dropId: "drop_coexist",
      frontSeed: seed1,
      cell: { sx: 1, sy: 1 },
      cause: "left_behind",
      droppedAt: "2026-10-03T00:00:00.000Z",
      circuit: {
        circuitId: "c_placed",
        circuitBoard: { v: 1, cols: 2, rows: 2, edgeState: "" },
        outcome: "offline",
        restoreState: "offline",
        equippedTo: null,
      },
    }],
  });
  assert.ok(saveHubSaveToLocalStorage(hub0, st));
  const s1 = loadOrCreateFrontSession(st);
  assert.equal(s1.restored, true);
  assert.deepEqual(s1.placement.placed, ["legacy"]);
  assert.deepEqual(s1.lostByCell.get("0,0"), ["legacy"]);
  assert.deepEqual(s1.lostByCell.get("1,1"), ["placed"]);
  assert.deepEqual(s1.dropsByCell.get("1,1"), ["c_placed"], "fieldDrops on same cell as lostMech");
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
  assert.deepEqual(s2.dropsByCell.get("1,1"), ["c_placed"], "fieldDrops on same cell preserved after regen");
  const saved2 = load(st);
  assert.ok(saved2.lostMechs.every((m) => m.frontSeed === seed2), "frontSeed rewritten to the new board");
  assert.equal(saved2.frontProgress?.seed, seed2);
  // the new board's progress is the fresh one (only HQ open); marks did not open cells
  assert.equal(JSON.stringify(s2.board.cells), JSON.stringify(generateBoard(AOI_HALF, seed2).cells), "board = a fresh board of that seed");
  assert.ok(getCell(s2.board, 1, 1));
  persistFrontSession(s2.board, { sx: 0, sy: 0 }, st);
  assert.equal(deserializeHubSave(st.getItem(HUB_SAVE_STORAGE_KEY)!)!.hub.lostMechs.length, 2);
}

// 項目5-1b W3 C (2026-10-07 神宮): a wreck stays on its own board (same cell,
// same Explore coordinates) and vanishes with its circuits when the board is
// regenerated. Left-behind mechs still move to the new board.
{
  const st = memStorage();
  const first = loadOrCreateFrontSession(st);
  const seed1 = first.board.seed!;
  const circuit = (id: string, equippedTo: string) => ({
    circuitId: id, circuitBoard: { v: 1, cols: 2, rows: 2, edgeState: "" }, outcome: "offline", restoreState: "offline", equippedTo,
  });
  const hub0 = normalizeHubSnapshot({
    ...load(st),
    fleet: [createOwnedMech("mech_gen1", { instanceId: "keep" })],
    circuits: [circuit("c_wreck", "wreck-1"), circuit("c_left", "left-1")] as never,
    lostMechs: [
      { ...row("wreck-1", { frontSeed: seed1, cell: { sx: 2, sy: 1 } }), circuitIds: ["c_wreck"], kind: "wreck", pos: { x: 640, y: 410 } },
      { ...row("left-1", { frontSeed: seed1, cell: { sx: 1, sy: 1 } }), circuitIds: ["c_left"] },
    ],
  } as never);
  assert.ok(saveHubSaveToLocalStorage(hub0, st));
  // same board re-opened: the wreck is kept as it is
  const s1 = loadOrCreateFrontSession(st);
  assert.equal(s1.placement.removedWrecks, undefined);
  const h1 = load(st);
  const w = h1.lostMechs.find((m) => m.instanceId === "wreck-1")!;
  assert.equal(w.kind, "wreck");
  assert.deepEqual(w.pos, { x: 640, y: 410 });
  assert.deepEqual(w.cell, { sx: 2, sy: 1 });
  assert.equal(h1.circuits.find((c) => c.circuitId === "c_wreck")!.equippedTo, "wreck-1");
  // regenerate: the wreck and its circuit are gone; the left-behind mech moves
  const s2 = regenerateFrontSession(st);
  assert.notEqual(s2.board.seed, seed1);
  assert.deepEqual(s2.placement.removedWrecks, ["wreck-1"]);
  const h2 = load(st);
  assert.deepEqual(h2.lostMechs.map((m) => m.instanceId), ["left-1"]);
  assert.equal(h2.lostMechs[0]!.frontSeed, s2.board.seed! >>> 0);
  assert.equal(h2.circuits.some((c) => c.circuitId === "c_wreck"), false, "wreck circuit gone (not stashed)");
  assert.equal(h2.circuits.find((c) => c.circuitId === "c_left")!.equippedTo, "left-1");
  assert.deepEqual(h2.fleet.map((m) => m.instanceId), ["keep"]);
  // a wreck without a place (cannot happen from Explore) is removed too, never put on HQ
  const odd = placeLostOnFront(normalizeHubSnapshot({ ...h2, lostMechs: [...h2.lostMechs, { ...row("wreck-x"), kind: "wreck" }] } as never), s2.board.seed!, AOI_HALF);
  assert.deepEqual(odd.removedWrecks, ["wreck-x"]);
  assert.deepEqual(odd.placed, []);
}

// 項目5-1b③ (W6, 2026-10-07 神宮): wrecks get their own cell mark 「残骸」;
// the left-behind mark / tooltip / line count only rows that are not wrecks.
// Older rows without `kind` stay left-behind mechs (save compat).
{
  const seed = 31337;
  const hub = normalizeHubSnapshot({
    ...INITIAL_HUB,
    lostMechs: [
      row("legacy-left", { frontSeed: seed, cell: { sx: 1, sy: 1 } }),
      { ...row("left-k", { frontSeed: seed, cell: { sx: 1, sy: 1 } }), kind: "left_behind" },
      { ...row("w1", { frontSeed: seed, cell: { sx: 1, sy: 1 } }), kind: "wreck", pos: { x: 100, y: 200 } },
      { ...row("w2", { frontSeed: seed, cell: { sx: -2, sy: 3 } }), kind: "wreck", pos: { x: 300, y: 400 } },
      { ...row("w3", { frontSeed: seed, cell: { sx: -2, sy: 3 } }), kind: "wreck", pos: { x: 310, y: 410 } },
      { ...row("w-other", { frontSeed: seed + 1, cell: { sx: 0, sy: 0 } }), kind: "wreck", pos: { x: 1, y: 1 } },
    ],
  } as never);
  const lost = lostMechsByCell(hub, seed);
  const wr = wrecksByCell(hub, seed);
  assert.deepEqual([...lost.entries()], [["1,1", ["legacy-left", "left-k"]]], "left-behind mark: no wrecks");
  assert.deepEqual(wr.get("1,1"), ["w1"]);
  assert.deepEqual(wr.get("-2,3"), ["w2", "w3"]);
  assert.equal(wr.size, 2, "wrecks of another board are not marked");
  assert.equal(wrecksByCell(hub, null).size, 0);
  assert.equal(wrecksByCell(null, seed).size, 0);
  assert.equal(wreckTitleJa([]), "");
  assert.equal(wreckTitleJa(["w1"]), "残骸 w1");
  assert.equal(wreckTitleJa(["w2", "w3"]), "残骸 2 機: w2, w3");
  assert.equal(wreckSortieLineJa(2), "残骸 2 機：出撃して離陸すれば回収");
  assert.equal(lostMechTitleJa(lost.get("1,1")!), "置き去り機 2 機: legacy-left, left-k");

  // the session carries the wreck marks (same board kept, wrecks stay)
  const st = memStorage();
  const s0 = loadOrCreateFrontSession(st);
  const seed0 = s0.board.seed!;
  assert.ok(s0.wrecksByCell instanceof Map);
  assert.equal(s0.wrecksByCell.size, 0, "no wrecks → no mark");
  saveHubSaveToLocalStorage(normalizeHubSnapshot({
    ...load(st),
    lostMechs: [
      { ...row("w1", { frontSeed: seed0, cell: { sx: 2, sy: 2 } }), kind: "wreck", pos: { x: 100, y: 200 } },
      row("left-1", { frontSeed: seed0, cell: { sx: 2, sy: 2 } }),
    ],
  } as never), st);
  const s1 = loadOrCreateFrontSession(st);
  assert.deepEqual(s1.wrecksByCell.get("2,2"), ["w1"]);
  assert.deepEqual(s1.lostByCell.get("2,2"), ["left-1"]);
  // board regenerated: the wreck vanishes (W3 C), so its mark goes too
  const s2 = regenerateFrontSession(st);
  assert.equal(s2.wrecksByCell.size, 0);
  assert.deepEqual([...s2.lostByCell.values()], [["left-1"]]);

  // view wiring: legend swatch, cell class / dot, tooltip, sortie-bar line
  const { readFileSync } = await import("node:fs");
  const mainSrc = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  assert.ok(mainSrc.includes(`<span class="danger-swatch wreck"><span class="chip" aria-hidden="true"></span>残骸</span>`), "legend swatch");
  assert.ok(mainSrc.includes(`wreckCount > 0 ? "wreck" : ""`), "cell class");
  assert.ok(mainSrc.includes(`<span class="wreck-dot" aria-hidden="true"></span>`), "cell dot");
  assert.ok(mainSrc.includes("wreckTitleJa(wreckIdsAt(cell.sx, cell.sy))"), "tooltip");
  assert.ok(mainSrc.includes("wreckSortieLineJa(wreckN)"), "sortie-bar line");
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
  assert.match(css, /\.cell\.wreck \.wreck-dot,[\s\S]*?bottom: 0;[\s\S]*?right: 0;[\s\S]*?background: #a8604a;/, "bottom-right rust dot");
  console.log("invade wreck marks ok");
}

console.log("invade lost-mechs selftest: ok");
