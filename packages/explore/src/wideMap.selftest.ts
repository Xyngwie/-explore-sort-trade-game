/**
 * Stage 3 selftest: negative coordinates, walls, mine and safe placement,
 * a stable frontSeed, distant enemies, the chase leash, and entry points.
 */
import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  cellCenterToWorld,
  chebyshevDistance,
  emptyFieldObjectIdentities,
  generateBoard,
  normalizeHubSnapshot,
  registerWreckIdentity,
  shieldIdentityFromWreck,
  worldToCell,
  type InvadeFrontProgress,
} from "@estg/shared";
import { enemyMoveRect, initializeEnemy, lootEnemy, scheduleRecall, spawnRecall } from "./game/enemyBehavior";
import { tickWorld } from "./game/sim";
import { fogGrey, fogIndexAt } from "./game/vision";
import { isEnemySeen } from "./game/render";
import { enemyPresenceMarks, liveCellGlyph, syncWideBoard } from "./game/boardWatch";
import { settleLegacyPos } from "./game/fieldBounds";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { fieldRectOf } from "./game/fieldBounds";
import {
  CAPTAIN_ENEMY_CELLS,
  ENEMY_CHASE_CELLS,
  MINE_ENEMY_COUNT,
  SAFE_CONTAINER_MOD,
  boardFromProgress,
  isKnownSafeCell,
  isMineCell,
  playableCellAt,
  safeCellGetsContainer,
  wideSpots,
} from "./game/wideField";

const boot = () => bootstrapFromSearch("");
const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };
const progress = (seed: number): InvadeFrontProgress => ({
  seed,
  aoiHalf: 12,
  opened: [],
  flagged: [],
  focus: null,
  hitMine: false,
});

{
  const w = createWorld(boot());
  startSortie(w);
  w.coverObjects = [];
  for (const e of w.enemies) e.alive = false;
  w.leader.pos = { x: -650, y: 0 };
  tickWorld(w, 2, { ...idle, clickMove: { x: -8000, y: 0 } });
  assert.ok(w.leader.pos.x < -700, "can move past the HQ cell into negative x");
  const rect = fieldRectOf(w.balance);
  assert.ok(w.leader.pos.x > rect.minX, "still inside the field");
  const cell = worldToCell(w.leader.pos.x, w.leader.pos.y);
  assert.ok(cell && cell.sx < 0, "the cell is on the negative side of HQ");
}

{
  const w = createWorld(boot());
  startSortie(w);
  w.coverObjects = [];
  for (const e of w.enemies) e.alive = false;
  const rect = fieldRectOf(w.balance);
  w.leader.pos = { x: rect.maxX - 30, y: 0 };
  tickWorld(w, 1, { ...idle, clickMove: { x: rect.maxX + 5000, y: 0 } });
  assert.ok(w.leader.pos.x <= rect.maxX - 20 + 1e-6, "stops at the wall edge");
  const cell = worldToCell(w.leader.pos.x, w.leader.pos.y);
  assert.ok(cell, "still on the board");
  assert.ok(chebyshevDistance(cell!.sx, cell!.sy, 0, 0) < 12, "not inside a wall cell");
  w.leader.pos = { x: rect.minX + 30, y: rect.minY + 30 };
  tickWorld(w, 1, { ...idle, clickMove: { x: rect.minX - 5000, y: rect.minY - 5000 } });
  assert.ok(w.leader.pos.x >= rect.minX + 20 - 1e-6 && w.leader.pos.y >= rect.minY + 20 - 1e-6);
  const corner = worldToCell(w.leader.pos.x, w.leader.pos.y);
  assert.ok(corner && chebyshevDistance(corner.sx, corner.sy, 0, 0) < 12);
}

{
  const seed = 424242;
  const { board, layout } = boardFromProgress(progress(seed));
  const spots = wideSpots(board, layout.seed);
  let safe = 0;
  let safeCrates = 0;
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.blocked) {
        assert.equal(spots.filter((s) => s.sx === cell.sx && s.sy === cell.sy).length, 0);
        continue;
      }
      const here = spots.filter((s) => s.sx === cell.sx && s.sy === cell.sy);
      if (isMineCell(cell)) {
        assert.equal(here.filter((s) => s.kind === "enemy").length, MINE_ENEMY_COUNT);
        assert.equal(here.filter((s) => s.kind === "mine-container").length, 1);
        assert.equal(here.filter((s) => s.kind === "safe-container").length, 0);
        for (const spot of here) {
          const at = worldToCell(spot.x, spot.y);
          assert.deepEqual(at, { sx: cell.sx, sy: cell.sy });
        }
        continue;
      }
      assert.equal(here.filter((s) => s.kind === "enemy").length, 0, "safe or unopened ground has no enemies");
      if (isKnownSafeCell(cell)) {
        safe += 1;
        const want = safeCellGetsContainer(seed, cell.sx, cell.sy);
        assert.equal(here.filter((s) => s.kind === "safe-container").length, want ? 1 : 0);
        if (want) safeCrates += 1;
        continue;
      }
      assert.equal(here.length, 0, "unopened non-mine cells stay empty");
    }
  }
  assert.ok(safe >= 1 && safeCrates >= 0);
  const full = generateBoard(12, seed);
  for (const row of full.cells) for (const cell of row) if (!cell.blocked && !cell.mine) cell.open = true;
  let openedSafe = 0;
  let openedCrates = 0;
  for (const row of full.cells) {
    for (const cell of row) {
      if (!isKnownSafeCell(cell)) continue;
      openedSafe += 1;
      if (safeCellGetsContainer(seed, cell.sx, cell.sy)) openedCrates += 1;
    }
  }
  const ratio = openedCrates / openedSafe;
  assert.ok(openedSafe >= 200, "enough known-safe cells to judge the rate");
  assert.ok(Math.abs(ratio - 1 / SAFE_CONTAINER_MOD) < 0.04, `safe containers about 1/10, got ${ratio}`);
  const fullSpots = wideSpots(full, seed);
  assert.equal(fullSpots.filter((s) => s.kind === "enemy").length, MINE_ENEMY_COUNT * full.mineCount);
  assert.equal(fullSpots.filter((s) => s.kind === "safe-container").length, openedCrates);
  const again = wideSpots(generateBoard(12, seed), seed);
  assert.deepEqual(again.map((s) => [s.kind, s.sx, s.sy, s.x, s.y]), spots.map((s) => [s.kind, s.sx, s.sy, s.x, s.y]));
  const first = createWorld(boot(), { frontProgress: progress(seed) });
  const second = createWorld(boot(), { frontProgress: progress(seed) });
  assert.deepEqual(first.enemies.map((e) => e.pos), second.enemies.map((e) => e.pos), "same frontSeed, same enemies");
  assert.deepEqual(first.containers.map((c) => c.pos), second.containers.map((c) => c.pos), "same frontSeed, same containers");
  assert.notDeepEqual(
    createWorld(boot(), { frontProgress: progress(seed + 1) }).enemies.map((e) => e.pos),
    first.enemies.map((e) => e.pos),
  );
}

{
  const w = createWorld(boot());
  startSortie(w);
  w.coverObjects = [];
  const far = w.enemies.find((e) => e.homeCell && chebyshevDistance(e.homeCell.sx, e.homeCell.sy, 0, 0) > CAPTAIN_ENEMY_CELLS);
  assert.ok(far, "some enemies stand more than 2 cells from HQ");
  initializeEnemy(far!);
  far!.enemyState!.activity = far!.enemyState!.capacity;
  far!.enemyState!.dormant = false;
  const before = { ...far!.pos };
  for (const other of w.enemies) if (other !== far) other.alive = false;
  tickWorld(w, 2, idle);
  assert.deepEqual(far!.pos, before, "an enemy more than 2 cells away does not move");
}

{
  const w = createWorld(boot());
  startSortie(w);
  w.coverObjects = [];
  for (const u of w.wingmen) u.alive = false;
  for (const e of w.enemies) e.alive = false;
  const e = w.enemies[0]!;
  e.alive = true;
  initializeEnemy(e);
  e.homeCell = { sx: 0, sy: 0 };
  e.pos = { x: 2050, y: 0 };
  e.heading = 0;
  e.enemyState!.activity = e.enemyState!.capacity;
  e.enemyState!.dormant = false;
  w.leader.pos = { x: 2300, y: 0 };
  w.leader.heading = Math.PI;
  tickWorld(w, 0.5, idle);
  assert.ok(e.pos.x < 2050, "a target past the next cell sends the enemy home");
  const back = worldToCell(e.pos.x, e.pos.y);
  assert.ok(back && chebyshevDistance(back.sx, back.sy, 0, 0) <= ENEMY_CHASE_CELLS);
}

{
  const w = createWorld(boot());
  startSortie(w);
  w.coverObjects = [];
  for (const u of w.wingmen) u.alive = false;
  for (const e of w.enemies) e.alive = false;
  const e = w.enemies[0]!;
  e.alive = true;
  initializeEnemy(e);
  e.homeCell = { sx: 0, sy: 0 };
  e.pos = { x: 650, y: 0 };
  e.heading = 0;
  e.enemyState!.activity = e.enemyState!.capacity;
  e.enemyState!.dormant = false;
  w.leader.pos = { x: 820, y: 0 };
  w.leader.heading = Math.PI;
  tickWorld(w, 2, idle);
  assert.ok(e.pos.x > 650, "a seen target in the next cell is chased");
  const at = worldToCell(e.pos.x, e.pos.y);
  assert.ok(at && at.sx <= 1 && at.sx >= 0, "the chase stays in the home cell or the next one");
}

{
  assert.deepEqual(createWorld(boot()).leader.pos, { x: 0, y: 0 }, "direct sortie");
  assert.deepEqual(createWorld(bootstrapFromSearch("?sectorX=0&sectorY=0")).leader.pos, { x: 0, y: 0 });
  const picked = createWorld(bootstrapFromSearch("?sectorX=2&sectorY=-3"));
  assert.deepEqual(picked.leader.pos, cellCenterToWorld(2, -3), "selected cell centre");
  assert.deepEqual(picked.extract.pos, cellCenterToWorld(2, -3));
  assert.deepEqual(createWorld(bootstrapFromSearch("?sectorX=12&sectorY=0")).leader.pos, { x: 0, y: 0 }, "a wall cell is not an entry");
}

{
  const w = createWorld(boot());
  const outside = { x: 40000, y: -40000 };
  w.leader.pos = outside;
  startSortie(w);
  tickWorld(w, 0.05, { ...idle, clickMove: { x: 0, y: 0 } });
  const rect = fieldRectOf(w.balance);
  assert.ok(w.leader.pos.x < rect.maxX && w.leader.pos.x > rect.minX);
  assert.ok(Number.isFinite(w.leader.pos.x) && Number.isFinite(w.leader.pos.y));
}

{
  const w = createWorld(boot());
  startSortie(w);
  const template = w.enemies[0]!;
  template.homeCell = { sx: 0, sy: 0 };
  w.boarding = { center: { x: 1400, y: 0 }, radius: 60, requestedAt: 0, cargoArrived: false };
  w.invadeSector = { sectorX: 0, sectorY: 0, density: 0, intelFlags: [], neighborCount: 1 };
  w.sortieNonce = "recall-home";
  scheduleRecall(w, () => 0);
  w.elapsed = 20;
  spawnRecall(w);
  const stray = w.enemies.find((e) => e.id.startsWith("stray-"));
  assert.ok(stray, "recall spawns a stray");
  const born = playableCellAt(stray!.pos.x, stray!.pos.y);
  assert.ok(born, "the stray appears on a playable cell");
  assert.deepEqual(stray!.homeCell, born, "the stray's home is the cell it appeared in");
  assert.notDeepEqual(stray!.homeCell, template.homeCell, "it does not keep the copied enemy's home");
}

{
  const w = createWorld(boot());
  startSortie(w);
  w.coverObjects = [];
  for (const u of w.wingmen) u.alive = false;
  for (const e of w.enemies) e.alive = false;
  const e = w.enemies[0]!;
  e.alive = true;
  e.homeCell = { sx: 0, sy: 0 };
  e.pos = { x: 650, y: 0 };
  e.heading = 0;
  initializeEnemy(e);
  e.enemyState!.activity = e.enemyState!.capacity;
  e.enemyState!.ammo = 0;
  e.enemyState!.dormant = false;
  e.enemyIdentity = {
    modelId: "mech_gen1",
    durability: 1,
    circuits: [{ circuitId: "rec", side: 2, effectKey: "recover", effect: 1, trueBoard: false }],
  };
  w.containers = [
    { id: "outside", pos: { x: 900, y: 0 }, taken: false, discovered: false, glowT: 0 },
    { id: "inside", pos: { x: 200, y: 0 }, taken: false, discovered: false, glowT: 0 },
  ];
  w.leader.pos = { x: 400, y: 0 };
  w.leader.heading = 0;
  tickWorld(w, 1, idle);
  assert.equal(e.enemyState!.targetCrate, "inside", "a nearer crate outside the leash is ignored");
  assert.ok(e.pos.x < 650, "the enemy walks toward the crate in its own cell");
  const at = worldToCell(e.pos.x, e.pos.y);
  assert.deepEqual(at, { sx: 0, sy: 0 });
}

{
  const w = createWorld(boot());
  startSortie(w);
  w.coverObjects = [];
  for (const u of [...w.wingmen, ...w.enemies]) u.alive = false;
  const e = w.enemies[0]!;
  e.alive = true;
  e.homeCell = { sx: 0, sy: 0 };
  e.pos = { x: 0, y: 0 };
  initializeEnemy(e);
  e.enemyState!.activity = e.enemyState!.capacity;
  e.enemyState!.ammo = 0;
  e.enemyState!.dormant = false;
  e.enemyState!.targetCrate = "outside";
  e.enemyIdentity = {
    modelId: "mech_gen1",
    durability: 1,
    circuits: [{ circuitId: "rec", side: 2, effectKey: "recover", effect: 1, trueBoard: false }],
  };
  w.containers = [{ id: "outside", pos: { x: 900, y: 0 }, taken: false, discovered: false, glowT: 0 }];
  const before = { ...e.pos };
  assert.equal(lootEnemy(w, e, 1, 70, enemyMoveRect(w, e, null)), false, "no crate inside the leash means no loot");
  assert.equal(e.enemyState!.targetCrate, null);
  assert.deepEqual(e.pos, before, "the enemy does not walk to an unreachable crate");
}

{
  const seed = 99;
  const laid = boardFromProgress(progress(seed));
  let openedSafe: { sx: number; sy: number } | null = null;
  let openedMine: { sx: number; sy: number } | null = null;
  let closed: { sx: number; sy: number } | null = null;
  for (const row of laid.board.cells) {
    for (const cell of row) {
      if (cell.blocked) continue;
      if (cell.open && cell.mine && !openedMine) openedMine = { sx: cell.sx, sy: cell.sy };
      if (cell.open && !cell.mine && !openedSafe) openedSafe = { sx: cell.sx, sy: cell.sy };
      if (!cell.open && !cell.mine && !closed) closed = { sx: cell.sx, sy: cell.sy };
    }
  }
  assert.ok(openedSafe, "the fresh board has an opened safe cell");
  assert.ok(closed, "the fresh board has an unopened cell");
  const mine = laid.board.cells.flat().find((cell) => cell.mine && !cell.blocked);
  assert.ok(mine);
  const withMine = progress(seed);
  withMine.opened = [{ sx: mine!.sx, sy: mine!.sy }];
  const w = createWorld(boot(), { frontProgress: withMine });
  startSortie(w);
  const greyAt = (sx: number, sy: number) => {
    const p = cellCenterToWorld(sx, sy);
    const i = fogIndexAt(w, p.x, p.y);
    assert.ok(i != null);
    return fogGrey(w, i!);
  };
  assert.equal(greyAt(openedSafe!.sx, openedSafe!.sy), 0, "an opened cell starts clear");
  assert.equal(greyAt(0, 0), 0, "HQ starts clear");
  assert.equal(greyAt(mine!.sx, mine!.sy), 0, "an opened mine (済 or ✕) starts clear");
  assert.equal(greyAt(closed!.sx, closed!.sy), 1, "an unopened cell stays in fog");
  void openedMine;
}

{
  const seed = 424242;
  const laid = boardFromProgress(progress(seed));
  const mine = laid.board.cells.flat().find((cell) => cell.mine && !cell.blocked && !cell.open);
  const other = laid.board.cells.flat().find((cell) => cell.mine && !cell.blocked && !cell.open && cell !== mine);
  assert.ok(mine && other);
  const cleared = progress(seed);
  cleared.opened = [{ sx: mine!.sx, sy: mine!.sy }];
  cleared.hitMine = false;
  const asResolved = wideSpots(boardFromProgress(cleared).board, seed).filter((s) => s.sx === mine!.sx && s.sy === mine!.sy);
  assert.equal(asResolved.length, 0, "a 済 mine cell gets no enemies and no container");
  cleared.hitMine = true;
  const asLocked = wideSpots(boardFromProgress(cleared).board, seed).filter((s) => s.sx === mine!.sx && s.sy === mine!.sy);
  assert.equal(asLocked.length, 0, "a ✕ mine cell gets no enemies and no container");
  const still = wideSpots(laid.board, seed).filter((s) => s.sx === other!.sx && s.sy === other!.sy);
  assert.equal(still.filter((s) => s.kind === "enemy").length, MINE_ENEMY_COUNT);
  assert.equal(still.filter((s) => s.kind === "mine-container").length, 1);
}

{
  const w = createWorld(boot());
  startSortie(w);
  const home = w.enemies.find((e) => e.placedCell)?.placedCell;
  assert.ok(home);
  const pair = w.enemies.filter((e) => e.placedCell && e.placedCell.sx === home!.sx && e.placedCell.sy === home!.sy);
  assert.equal(pair.length, MINE_ENEMY_COUNT);
  pair[0]!.alive = false;
  pair[0]!.hp = 0;
  syncWideBoard(w);
  assert.notEqual(liveCellGlyph(w, home!.sx, home!.sy), "済", "one enemy does not clear the mine");
  assert.equal(w.boardProgress!.opened.some((c) => c.sx === home!.sx && c.sy === home!.sy), false);
  pair[1]!.alive = false;
  pair[1]!.hp = 0;
  for (const u of [w.leader, ...w.wingmen]) {
    u.alive = false;
    u.hp = 0;
  }
  tickWorld(w, 0.05, idle);
  assert.equal(w.phase, "result", "the squad is wiped");
  assert.equal(liveCellGlyph(w, home!.sx, home!.sy), "済", "済 remains after the wipe");
  assert.equal(w.boardProgress!.hitMine, false);
}

{
  const seed = 77;
  const laid = boardFromProgress(progress(seed));
  const closed = laid.board.cells.flat().find((cell) => !cell.blocked && !cell.mine && !cell.open);
  assert.ok(closed, "an unopened non-mine cell");
  const w = createWorld(bootstrapFromSearch(`?sectorX=${closed!.sx}&sectorY=${closed!.sy}`), { frontProgress: progress(seed) });
  startSortie(w);
  assert.equal(w.boardProgress!.opened.some((c) => c.sx === closed!.sx && c.sy === closed!.sy), true, "stepping into a non-mine cell opens it");
  assert.equal(w.securedThisSortie?.some((c) => c.sx === closed!.sx && c.sy === closed!.sy), true);
  const center = cellCenterToWorld(closed!.sx, closed!.sy);
  const i = fogIndexAt(w, center.x, center.y);
  assert.ok(i != null);
  assert.equal(fogGrey(w, i!), 1, "fog of a cell secured this sortie stays");
  tickWorld(w, 0.2, idle);
  assert.equal(fogGrey(w, i!), 1, "standing in the cell does not clear its fog this sortie");
  startSortie(w);
  assert.equal(fogGrey(w, fogIndexAt(w, center.x, center.y)!), 0, "the next sortie starts with that cell clear");
}

{
  const seed = 81;
  const laid = boardFromProgress(progress(seed));
  const secure = laid.board.cells.flat().find((cell) => !cell.blocked && chebyshevDistance(cell.sx, cell.sy, 0, 0) === 6);
  const closed = laid.board.cells.flat().find((cell) => !cell.blocked && !cell.open && chebyshevDistance(cell.sx, cell.sy, 0, 0) === 8);
  assert.ok(secure && closed);
  const prog = progress(seed);
  prog.opened = [...laid.layout.opened, { sx: secure!.sx, sy: secure!.sy }];
  const w = createWorld(boot(), { frontProgress: prog });
  startSortie(w);
  for (const u of [w.leader, ...w.wingmen]) u.alive = false;
  w.leader.alive = true;
  w.leader.pos = { x: 0, y: 0 };
  w.leader.heading = -Math.PI / 2;
  const watched = w.enemies[0]!;
  const hidden = w.enemies[1]!;
  watched.alive = true;
  hidden.alive = true;
  for (const e of w.enemies) if (e !== watched && e !== hidden) e.alive = false;
  watched.pos = cellCenterToWorld(secure!.sx, secure!.sy);
  hidden.pos = cellCenterToWorld(closed!.sx, closed!.sy);
  assert.equal(isEnemySeen(w, watched), true, "an enemy on a cell secured in invade is visible from the start");
  assert.equal(isEnemySeen(w, hidden), false, "an enemy outside a secure cell is not watched");
  hidden.pos = { ...watched.pos };
  syncWideBoard(w);
  assert.equal(isEnemySeen(w, hidden), true, "an enemy that enters a secure cell is visible during the sortie");
  const marks = enemyPresenceMarks(w);
  assert.deepEqual(marks, [{ sx: secure!.sx, sy: secure!.sy }]);
  assert.deepEqual(w.boardProgress!.enemyHere, marks);
  assert.equal("x" in marks[0]!, false);
  assert.equal("y" in marks[0]!, false);
  const entered = laid.board.cells.flat().find((cell) => !cell.blocked && !cell.open && !cell.mine && cell.sx !== secure!.sx);
  assert.ok(entered);
  w.leader.alive = true;
  w.leader.pos = cellCenterToWorld(entered!.sx, entered!.sy);
  const visitor = w.enemies[2]!;
  visitor.alive = true;
  visitor.pos = cellCenterToWorld(entered!.sx + 1, entered!.sy);
  syncWideBoard(w);
  assert.equal(isEnemySeen(w, visitor), false, "the watch does not reach the next cell");
  visitor.pos = { ...w.leader.pos };
  syncWideBoard(w);
  assert.equal(isEnemySeen(w, visitor), true, "an enemy that enters a cell secured this sortie is visible");
  assert.ok(w.boardProgress!.enemyHere?.some((c) => c.sx === entered!.sx && c.sy === entered!.sy));
  assert.equal(fogGrey(w, fogIndexAt(w, w.leader.pos.x, w.leader.pos.y)!), 1, "securing the cell does not clear its fog");
}

{
  const battery = { capacity: 300, activity: 20 };
  const once = normalizeHubSnapshot({
    ...INITIAL_HUB,
    lostMechs: [{
      instanceId: "old-wreck",
      currentAmmo: 0,
      battery,
      circuitIds: [],
      kind: "wreck",
      pos: { x: 700, y: 500 },
    }],
  });
  assert.deepEqual(once.lostMechs[0]!.pos, { x: 0, y: 0, wide: true }, "old HQ spawn moves by −700, −500");
  const twice = normalizeHubSnapshot(once);
  assert.deepEqual(twice.lostMechs[0]!.pos, once.lostMechs[0]!.pos, "reading twice does not shift again");
  const outside = normalizeHubSnapshot({
    ...INITIAL_HUB,
    lostMechs: [{ instanceId: "far", currentAmmo: 0, battery, circuitIds: [], kind: "wreck", pos: { x: 40000, y: -40000 } }],
  });
  assert.deepEqual(outside.lostMechs[0]!.pos, { x: 40000, y: -40000 }, "a point outside the old map is not shifted");
  assert.equal(normalizeHubSnapshot({
    ...INITIAL_HUB,
    lostMechs: [{ instanceId: "bad", currentAmmo: 0, battery, circuitIds: [], kind: "wreck", pos: { x: Number.NaN, y: 10 } }],
  }).lostMechs[0]!.pos, undefined, "a non-finite position is still dropped");
  const clamped = settleLegacyPos({ worldW: 1400, worldH: 1000, minX: -16100, maxX: 16100, minY: -11500, maxY: 11500 }, { x: 40000, y: -40000 });
  assert.ok(clamped.x < 16100 && clamped.y > -11500, "out-of-range display clamp stays the stage 3 pull-inside");
  let identities = registerWreckIdentity(emptyFieldObjectIdentities(), "ground-w");
  identities = shieldIdentityFromWreck(identities, "ground-w", "shield", { hp: 20, maxHp: 50 });
  identities = registerWreckIdentity(identities, "wreck-w");
  const field = normalizeHubSnapshot({
    ...INITIAL_HUB,
    fieldObjectIdentities: identities,
    fieldCells: [{
      location: { frontSeed: 5, cell: { sx: 0, sy: 0 } },
      ground: { shield: { x: 1400, y: 0 } },
      wrecks: [{
        targetId: "enemy-field-test",
        wreckKey: "wreck-w",
        pos: { x: 0, y: 1000 },
        sourceInstanceId: null,
        seconds: 1,
        circuits: [],
        enemy: {
          name: "敵",
          maxHp: 10,
          radius: 13,
          heading: 0,
          identity: { modelId: "mech_gen1", durability: 10, circuits: [] },
        },
      }],
    }],
  });
  const cell = field.fieldCells![0]!;
  assert.deepEqual(cell.ground.shield, { x: 700, y: -500, wide: true }, "ground in the old map shifts once");
  assert.deepEqual(cell.wrecks[0]!.pos, { x: -700, y: 500, wide: true }, "a wreck in the old map shifts once");
  const fieldAgain = normalizeHubSnapshot(field);
  assert.deepEqual(fieldAgain.fieldCells![0]!.ground.shield, cell.ground.shield);
  assert.deepEqual(fieldAgain.fieldCells![0]!.wrecks[0]!.pos, cell.wrecks[0]!.pos);
}

console.log("wide map (stage 3 move/walls/mines plus stage 4 clear, fog, watch, migrate) PASS");
