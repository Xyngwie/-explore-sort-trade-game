/**
 * Circuit sortie actions that do not depend on a browser (Issue #269).
 */
import assert from "node:assert/strict";
import type { ClassifiedCircuit, HubSnapshot } from "@estg/shared";
import {
  applyCircuitHubSide,
  applyCollectPress,
  applyLure,
  attachCircuitPlay,
  beginCircuitButton,
  circuitTryWeapon,
  consumeCircuitClick,
  noteCircuitExtract,
  noteCollectTap,
  noteDamageBreaksSuppress,
  pincerPoints,
  salvageSeconds,
  secondExtractPull,
  stepCircuitPlay,
} from "./game/circuitPlay";
import { requestExtract, tickWorld } from "./game/sim";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";

function classified(over: Partial<ClassifiedCircuit>): ClassifiedCircuit {
  return {
    circuitId: "c",
    effect: 1,
    r: 0,
    effectKey: null,
    trueBoard: false,
    oneByOne: null,
    side: 4,
    conductive: true,
    cargoSlots: 0,
    perfectPt: 0,
    false20: false,
    true20: false,
    ...over,
  };
}

const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };

{
  const points = pincerPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, [
    { id: "b", instanceId: "2", pos: { x: 0, y: 0 } },
    { id: "a", instanceId: "1", pos: { x: 0, y: 0 } },
  ] as never);
  const a = points.a!;
  const b = points.b!;
  assert.ok(Math.abs(a.x - 100) < 1e-6, "first holder is above the enemy");
  assert.ok(Math.abs(a.y - 160) < 1e-6);
  assert.ok(Math.abs(b.x - 100) < 1e-6);
  assert.ok(Math.abs(b.y - -160) < 1e-6);
}

{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  attachCircuitPlay(world, null, true);
  world.circuitPlay!.captainOneByOne = true;
  world.circuitPlay!.captainTrueOne = true;
  const enemy = world.enemies[0]!;
  enemy.alive = true;
  enemy.hp = 40;
  world.circuitPlay!.pending = { kind: "air_support", pick: "enemy" };
  assert.equal(consumeCircuitClick(world, { ...enemy.pos }), true);
  assert.equal(enemy.alive, true, "no hub credits: air support does not fire");
  assert.equal(enemy.hp, 40);
}

{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  assert.equal(requestExtract(world), true);
  assert.equal(requestExtract(world), false, "second press without circuit rules does not cancel");
  assert.ok(world.boarding, "circle stays");
  attachCircuitPlay(world, null, true);
  world.circuitPlay!.captainOneByOne = true;
  const outside = world.wingmen[0]!;
  outside.pos = {
    x: world.boarding!.center.x + world.boarding!.radius + 80,
    y: world.boarding!.center.y,
  };
  assert.equal(secondExtractPull(world), true);
  assert.ok(world.boarding, "circle is not cancelled");
  assert.equal(outside.moveTarget?.x, world.boarding!.center.x);
}

{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  const x0 = world.leader.pos.x;
  attachCircuitPlay(world, null, true);
  world.circuitPlay!.captainOneByOne = false;
  const idle = { move: { x: 1, y: 0 }, clickMove: null, fire: false, interact: false };
  for (let i = 0; i < 10; i++) tickWorld(world, 0.05, idle);
  assert.equal(world.leader.pos.x, x0, "captain without 1x1 does not walk");
}

{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  attachCircuitPlay(world, null, true);
  world.circuitPlay!.captainOneByOne = true;
  world.leader.instanceId = "leader-1";
  world.currentAmmo["leader-1"] = 3;
  world.leader.cooldown = 0;
  world.circuitPlay!.loadout.leader = [classified({ effectKey: "shotgun", r: 0.2 })];
  const enemy = world.enemies[0]!;
  enemy.alive = true;
  enemy.pos = { x: world.leader.pos.x + 40, y: world.leader.pos.y };
  const before = world.bullets.length;
  assert.equal(circuitTryWeapon(world, world.leader, enemy), true);
  const shots = world.bullets.slice(before);
  assert.equal(shots.length, 3, "pellets stop when ammo runs out");
  assert.equal(world.currentAmmo["leader-1"], 0);
  const dmg = world.balance.bulletDamage * (1 / 4) * (1 + 0.2);
  const expect = [-10, -5, 0].map((deg) => (deg * Math.PI) / 180);
  shots.forEach((b, i) => {
    assert.ok(Math.abs(b.damage - dmg) < 1e-6, "pellet damage is 1/4×(1+r)");
    const ang = Math.atan2(b.vel.y, b.vel.x);
    assert.ok(Math.abs(ang - expect[i]!) < 1e-6, "angles stay −10, −5, 0");
  });
}

{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  attachCircuitPlay(world, null, true);
  world.circuitPlay!.captainOneByOne = true;
  const before = new Map<string, string>();
  for (const u of [world.leader, ...world.wingmen]) before.set(u.id, u.stance);
  world.circuitPlay!.loadout.leader = [classified({ effectKey: "squad_haul", trueBoard: true, r: 0.1 })];
  beginCircuitButton(world, "haul");
  assert.equal(world.circuitPlay!.order?.kind, "haul");
  for (const u of [world.leader, ...world.wingmen]) u.stance = u.id === world.leader.id ? "escort" : "raid";
  const camp = world.camp!;
  for (const u of [world.leader, ...world.wingmen]) u.pos = { ...camp.pos };
  stepCircuitPlay(world, 0.05);
  assert.equal(world.circuitPlay!.order, null, "haul ends on arrival");
  for (const [id, stance] of before) {
    const u = [world.leader, ...world.wingmen].find((x) => x.id === id)!;
    assert.equal(u.stance, stance, "moved unit returns to the stance from before haul");
  }
}

{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  attachCircuitPlay(world, null, true);
  const enemy = world.enemies[0]!;
  enemy.alive = true;
  enemy.pos = { x: world.leader.pos.x + 200, y: world.leader.pos.y };
  world.circuitPlay!.order = { kind: "suppress", enemyId: enemy.id, left: 8 };
  world.circuitPlay!.loadout.leader = [classified({ effectKey: "lure", trueBoard: true, r: 0 })];
  stepCircuitPlay(world, 0.05);
  assert.equal(world.circuitPlay!.order?.kind, "suppress", "owning lure does not end suppress");
  assert.equal(applyLure(world, enemy, 0.05), true);
  assert.equal(world.circuitPlay!.order, null, "lure movement ends suppress on that enemy");
}

{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  attachCircuitPlay(world, null, true);
  const enemy = world.enemies[0]!;
  enemy.alive = true;
  world.circuitPlay!.order = { kind: "suppress", enemyId: enemy.id, left: 0.02 };
  stepCircuitPlay(world, 0.05);
  assert.equal(world.circuitPlay!.order, null, "suppress ends after 8 seconds elapse");
  world.circuitPlay!.order = { kind: "suppress", enemyId: enemy.id, left: 8 };
  noteDamageBreaksSuppress(world, enemy);
  assert.equal(world.circuitPlay!.order, null, "damage on that enemy ends suppress");
}

{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  attachCircuitPlay(world, null, true);
  world.circuitPlay!.captainOneByOne = true;
  for (const e of world.enemies) {
    e.alive = true;
    e.pos = { x: world.leader.pos.x + 800, y: world.leader.pos.y };
  }
  const enemy = world.enemies[0]!;
  world.circuitPlay!.order = { kind: "focus", enemyId: enemy.id };
  world.circuitPlay!.loadout.leader = [classified({ effectKey: "focus", trueBoard: true, r: 0.1 })];
  const x0 = world.leader.pos.x;
  const bullets = world.bullets.length;
  tickWorld(world, 0.2, { move: { x: 1, y: 0 }, clickMove: null, fire: true, interact: false });
  assert.ok(world.leader.pos.x > x0, "focus does not freeze movement");
  assert.equal(world.bullets.length, bullets, "focus does not fire outside range");
  assert.equal(world.circuitPlay!.order?.kind, "focus");
}

{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  attachCircuitPlay(world, null, true);
  world.circuitPlay!.captainOneByOne = true;
  world.circuitPlay!.loadout.leader = [classified({ effectKey: "scatter", trueBoard: true, r: 0.1 })];
  assert.equal(requestExtract(world), true);
  const outside = world.wingmen[0]!;
  outside.pos = {
    x: world.boarding!.center.x + world.boarding!.radius + 120,
    y: world.boarding!.center.y,
  };
  assert.equal(requestExtract(world), true);
  assert.ok(world.boarding, "re-press does not cancel the circle");
  tickWorld(world, 0.05, idle);
  assert.equal(outside.moveTarget?.x, world.boarding!.center.x, "scatter does not overwrite the pull");
  assert.equal(outside.moveTarget?.y, world.boarding!.center.y);
}

{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  attachCircuitPlay(world, null, true);
  world.circuitPlay!.captainOneByOne = true;
  assert.equal(salvageSeconds(world), 8);
  world.leader.pos = { x: 400, y: 400 };
  for (const c of world.containers) {
    c.discovered = false;
    c.pos = { x: 20, y: 20 };
  }
  world.leader.salvagedCount = 2;
  world.salvaged = 2;
  const wreck = world.wingmen[0]!;
  wreck.alive = false;
  wreck.instanceId = "wreck-1";
  wreck.pos = { x: 410, y: 400 };
  noteCollectTap(world, { ...wreck.pos });
  applyCollectPress(world);
  assert.equal(world.leader.salvagedCount, 0, "swap drops the container stack");
  assert.equal(world.salvaged, 0);
  assert.ok(world.circuitPlay!.carried.includes(wreck.id), "wreck enters inventory");
  world.leader.pos = { x: 500, y: 420 };
  stepCircuitPlay(world, 0.05);
  assert.equal(wreck.pos.x, 500);
  assert.equal(wreck.pos.y, 420);
  world.leader.salvagedCount = 1;
  world.salvaged = 1;
  world.circuitPlay!.collectTap = null;
  applyCollectPress(world);
  assert.equal(world.leader.salvagedCount, 0, "no tap and no nearby target dumps inventory");
  assert.equal(world.circuitPlay!.carried.length, 0, "dump releases carried wrecks");
  assert.equal(wreck.pos.x, 500);
  world.leader.salvagedCount = 3;
  world.salvaged = 3;
  const crate = world.containers[0]!;
  crate.discovered = true;
  crate.taken = false;
  crate.pos = { ...world.leader.pos };
  applyCollectPress(world);
  assert.equal(world.leader.salvagedCount, 3, "nearby salvage target keeps the current collect");
}

{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  attachCircuitPlay(world, null, true);
  world.invadeSector = { sectorX: 1, sectorY: 1, density: 1, intelFlags: [] };
  const hub = { fleet: [], circuits: [], credits: 0 } as unknown as HubSnapshot;
  noteCircuitExtract(world, true);
  const next = applyCircuitHubSide(world, hub);
  assert.equal(next.circuits.length, 0, "sortie success does not grant a true 1x1");
  assert.equal(world.circuitPlay!.grantTrue, false);
}

console.log("circuitPlay.selftest ok");
