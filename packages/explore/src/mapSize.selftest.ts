/**
 * 段階1: map size is an argument to createWorld. The default 1400×1000
 * keeps today's spawn, camera, containers, and (under a fixed RNG) enemies
 * and cover. A passed size is used by the camera, zoom, movement, fog, and
 * container bounds. BALANCE itself is not mutated.
 */
import assert from "node:assert/strict";
import { BALANCE, SPAWN_POINT } from "./game/balance";
import { getCoverObjects } from "./game/coverObjects";
import { wrapAngle } from "./game/facing";
import { viewCamera, withViewCamera } from "./game/mapZoom";
import { tickWorld } from "./game/sim";
import { fogCols, fogRows } from "./game/vision";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";

const boot = () => bootstrapFromSearch("");
const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };
const near = (a: number, b: number) => Math.abs(wrapAngle(a - b)) < 1e-6;

const DEFAULT_CONTAINERS = [
  { x: 420, y: 280 }, { x: 780, y: 360 }, { x: 980, y: 620 }, { x: 560, y: 720 },
  { x: 1100, y: 240 }, { x: 300, y: 520 }, { x: 640, y: 180 }, { x: 200, y: 780 },
  { x: 1250, y: 480 }, { x: 880, y: 820 }, { x: 164, y: 144.5 }, { x: 426, y: 156.5 },
  { x: 950, y: 180.5 }, { x: 1212, y: 192.5 }, { x: 254, y: 409.5 }, { x: 414, y: 421.5 },
  { x: 938, y: 445.5 }, { x: 1200, y: 355.5 }, { x: 242, y: 572.5 }, { x: 504, y: 584.5 },
];
const SEEDED_ENEMIES = [
  { x: 294.09558119191394, y: 607.8962593979509 },
  { x: 978.3583774438646, y: 814.5101170182273 },
  { x: 1079.6898234370174, y: 320.4571416670475 },
  { x: 603.8202021359336, y: 908.839144998161 },
  { x: 297.4818532716945, y: 619.9130583148071 },
];
const SEEDED_COVERS = [
  { x: 111.70386724332707, y: 712.4736960162163 },
  { x: 476.70449356241573, y: 619.3747109448302 },
  { x: 1033.333631589388, y: 941.9336469768859 },
  { x: 524.9402715591158, y: 272.3349967248132 },
  { x: 1327.3153720677974, y: 700.3943605817802 },
  { x: 1029.3625853297885, y: 636.3667171321499 },
  { x: 1200.1192670782275, y: 295.43896978296243 },
  { x: 617.3348270052437, y: 739.8452999907036 },
  { x: 671.0512941899256, y: 263.99698999151303 },
  { x: 407.37889195548263, y: 373.3384811071106 },
];

function withSeed<T>(run: () => T): T {
  const orig = Math.random;
  let s = 1;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  try {
    return run();
  } finally {
    Math.random = orig;
  }
}

const globalBefore = { worldW: BALANCE.worldW, worldH: BALANCE.worldH, captain: BALANCE.commandRangeCaptain, platoon: BALANCE.commandRangePlatoonLeader };

{
  const world = withSeed(() => {
    const w = createWorld(boot());
    assert.equal(w.balance.worldW, 1400);
    assert.equal(w.balance.worldH, 1000);
    assert.deepEqual(w.leader.pos, { x: SPAWN_POINT.x, y: SPAWN_POINT.y });
    assert.deepEqual(w.leader.pos, { x: 700, y: 500 });
    assert.deepEqual(w.extract.pos, { x: 700, y: 500 });
    assert.deepEqual(w.camera, { x: 340, y: 290, w: 720, h: 420 });
    assert.deepEqual(w.wingmen.map((u) => ({ x: u.pos.x, y: u.pos.y })), [{ x: 750, y: 500 }, { x: 650, y: 500 }]);
    assert.deepEqual(w.containers.map((c) => c.pos), DEFAULT_CONTAINERS);
    assert.deepEqual(w.enemies.map((e) => ({ x: e.pos.x, y: e.pos.y })), SEEDED_ENEMIES);
    assert.deepEqual(getCoverObjects(w).map((c) => c.pos), SEEDED_COVERS);
    return w;
  });
  assert.equal(fogCols(world), 35);
  assert.equal(fogRows(world), 25);
  assert.notStrictEqual(world.balance, BALANCE);
  const same = createWorld(boot(), { worldW: 1400, worldH: 1000 });
  assert.deepEqual(same.containers.map((c) => c.pos), DEFAULT_CONTAINERS);
  assert.deepEqual(same.leader.pos, { x: 700, y: 500 });
  assert.deepEqual(same.camera, { x: 340, y: 290, w: 720, h: 420 });
}

{
  const wide = createWorld(boot(), { worldW: 2800, worldH: 2000 });
  assert.equal(wide.balance.worldW, 2800);
  assert.equal(wide.balance.worldH, 2000);
  assert.equal(BALANCE.worldW, 1400);
  assert.equal(BALANCE.worldH, 1000);
  assert.notStrictEqual(wide.balance, BALANCE);
  assert.equal(wide.balance.commandRangeCaptain, 7500);
  assert.equal(wide.balance.commandRangePlatoonLeader, 1500);
  assert.deepEqual(wide.leader.pos, { x: 1400, y: 1000 });
  assert.deepEqual(wide.extract.pos, { x: 1400, y: 1000 });
  assert.deepEqual(wide.camera, { x: 1040, y: 790, w: 720, h: 420 });
  assert.deepEqual(wide.wingmen.map((u) => u.pos), [{ x: 1450, y: 1000 }, { x: 1350, y: 1000 }]);
  assert.equal(wide.containers.length, BALANCE.fieldContainerCount);
  assert.equal(wide.containers.length, DEFAULT_CONTAINERS.length);
  assert.deepEqual(wide.containers.slice(0, 10).map((c) => c.pos), DEFAULT_CONTAINERS.slice(0, 10));
  assert.notDeepEqual(wide.containers.map((c) => c.pos), DEFAULT_CONTAINERS);
  for (const c of wide.containers) {
    assert.ok(c.pos.x >= 90 && c.pos.x <= 2800 - 90, `container x ${c.pos.x}`);
    assert.ok(c.pos.y >= 90 && c.pos.y <= 2000 - 90, `container y ${c.pos.y}`);
  }
  assert.ok(wide.containers.some((c) => c.pos.x > 1400 || c.pos.y > 1000), "grid uses the passed size");
  assert.equal(fogCols(wide), 70);
  assert.equal(fogRows(wide), 50);
  assert.equal(fogCols(wide), Math.ceil(wide.balance.worldW / wide.balance.fogCell));
  assert.equal(fogRows(wide), Math.ceil(wide.balance.worldH / wide.balance.fogCell));

  const base = { x: 2400, y: 1800, w: 720, h: 420 };
  wide.camera = { ...base };
  const zoomed = withViewCamera(wide, 2, () => ({ ...wide.camera }));
  assert.deepEqual(zoomed, viewCamera(base, 2, wide.balance.worldW, wide.balance.worldH));
  assert.deepEqual(zoomed, { x: 2440, y: 1790, w: 360, h: 210 });
  assert.deepEqual(wide.camera, base, "view camera is restored");
  assert.notEqual(viewCamera(base, 2, BALANCE.worldW, BALANCE.worldH).x, zoomed.x);

  startSortie(wide);
  assert.ok(near(wide.leader.heading, -Math.PI / 2), "leader faces up from the new centre");
  for (const u of wide.wingmen) {
    assert.ok(near(u.heading, Math.atan2(u.pos.y - 1000, u.pos.x - 1400)), "wingman faces out from the passed-size spawn");
  }
}

{
  const partial = createWorld(boot(), { worldW: 2800 });
  assert.equal(partial.balance.worldW, 2800);
  assert.equal(partial.balance.worldH, 1000);
  assert.deepEqual(partial.leader.pos, { x: 1400, y: 500 });
  const ignored = createWorld(boot(), { worldW: Number.NaN, worldH: 0 });
  assert.equal(ignored.balance.worldW, 1400);
  assert.equal(ignored.balance.worldH, 1000);
  assert.deepEqual(ignored.leader.pos, { x: 700, y: 500 });
}

{
  const def = createWorld(boot());
  startSortie(def);
  def.coverObjects = [];
  def.leader.pos = { x: 1370, y: 970 };
  tickWorld(def, 1, { ...idle, clickMove: { x: 4000, y: 4000 } });
  assert.equal(def.leader.pos.x, 1400 - 20);
  assert.equal(def.leader.pos.y, 1000 - 20);
  def.leader.pos = { x: 1380, y: 980 };
  tickWorld(def, 0.05, idle);
  assert.equal(def.leader.pos.x, 1380);
  assert.equal(def.leader.pos.y, 980);
  assert.equal(def.camera.x, 1400 - def.camera.w);
  assert.equal(def.camera.y, 1000 - def.camera.h);
}

{
  const wide = createWorld(boot(), { worldW: 2800, worldH: 2000 });
  startSortie(wide);
  wide.coverObjects = [];
  wide.leader.pos = { x: 2770, y: 1970 };
  tickWorld(wide, 1, { ...idle, clickMove: { x: 4000, y: 4000 } });
  assert.equal(wide.leader.pos.x, 2800 - 20);
  assert.equal(wide.leader.pos.y, 2000 - 20);
  assert.ok(wide.leader.pos.x > 1400 - 20, "movement is not clamped to the default width");
  wide.leader.pos = { x: 2700, y: 1900 };
  tickWorld(wide, 0.05, idle);
  assert.equal(wide.leader.pos.x, 2700);
  assert.equal(wide.leader.pos.y, 1900);
  assert.equal(wide.camera.x, 2800 - wide.camera.w);
  assert.equal(wide.camera.y, 2000 - wide.camera.h);
}

{
  const margin = 50;
  const worldW = 2800;
  const worldH = 2000;
  const samples = [
    { x: 1400, y: 1000 },
    { x: 700, y: 500 },
    { x: 2500, y: 1800 },
    { x: 200, y: 200 }, { x: 400, y: 200 }, { x: 600, y: 200 },
    { x: 200, y: 400 }, { x: 400, y: 400 },
    { x: 200, y: 800 }, { x: 400, y: 800 },
    { x: 200, y: 1200 }, { x: 400, y: 1200 },
  ];
  const spanX = worldW - margin * 2;
  const spanY = worldH - margin * 2;
  const w = createWorld(boot(), { worldW, worldH });
  let i = 0;
  const orig = Math.random;
  Math.random = () => {
    const p = samples[Math.floor(i / 2)]!;
    const v = i % 2 === 0 ? (p.x - margin) / spanX : (p.y - margin) / spanY;
    i += 1;
    return v;
  };
  try {
    const covers = getCoverObjects(w);
    assert.equal(covers.length, 10);
    assert.ok(covers.some((c) => Math.hypot(c.pos.x - 700, c.pos.y - 500) < 1), "old centre is not a hole on the wide map");
    assert.ok(covers.every((c) => Math.hypot(c.pos.x - 1400, c.pos.y - 1000) >= 170 - 1e-6), "cover avoids the passed-size spawn");
    assert.ok(covers.some((c) => c.pos.x > 1400 && c.pos.y > 1000));
    for (const c of covers) {
      assert.ok(c.pos.x >= margin - 1e-6 && c.pos.x <= worldW - margin + 1e-6);
      assert.ok(c.pos.y >= margin - 1e-6 && c.pos.y <= worldH - margin + 1e-6);
    }
  } finally {
    Math.random = orig;
  }
}

assert.equal(BALANCE.worldW, globalBefore.worldW);
assert.equal(BALANCE.worldH, globalBefore.worldH);
assert.equal(BALANCE.worldW, 1400);
assert.equal(BALANCE.worldH, 1000);
assert.equal(BALANCE.commandRangeCaptain, globalBefore.captain);
assert.equal(BALANCE.commandRangePlatoonLeader, globalBefore.platoon);
assert.deepEqual(createWorld(boot()).containers.map((c) => c.pos), DEFAULT_CONTAINERS);

console.log("map size (default 1400×1000 unchanged, passed size used, BALANCE untouched) PASS");
