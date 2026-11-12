/**
 * Stage 3 selftest: negative coordinates, walls, mine and safe placement,
 * a stable frontSeed, distant enemies, the chase leash, and entry points.
 */
import assert from "node:assert/strict";
import {
  cellCenterToWorld,
  chebyshevDistance,
  generateBoard,
  worldToCell,
  type InvadeFrontProgress,
} from "@estg/shared";
import { enemyMoveRect, initializeEnemy, lootEnemy, scheduleRecall, spawnRecall } from "./game/enemyBehavior";
import { tickWorld } from "./game/sim";
import { fogGrey, fogIndexAt } from "./game/vision";
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

console.log("wide map (negative move, walls, mines, safe crates, leash, entry, recall home, loot leash, opened fog) PASS");
