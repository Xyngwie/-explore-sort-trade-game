// @ts-nocheck
/**
 * Piercing round (piercing_round) projectile hits — docs/PIERCING_ROUND_V0.md
 */
import assert from "node:assert/strict";
import { FALSE_BOARD_EFFECT_KEYS, SPECIAL_AMMO_EFFECT_KEYS, weaponCategory } from "@estg/shared";
import { attachCircuitPlay, circuitTryWeapon } from "./game/circuitPlay";
import { updateBullets } from "./game/sim";
import { equippedShield, resolvePiercingProjectileHit } from "./game/shields";
import { createWorld, bootstrapFromSearch, startSortie } from "./game/world";
import { getCoverObjects } from "./game/coverObjects";
import { emptyFieldObjectIdentities, registerWreckIdentity, shieldIdentityFromWreck } from "@estg/shared";

function shieldWorld(hp = 50) {
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  getCoverObjects(world).splice(0);
  const identities = shieldIdentityFromWreck(
    registerWreckIdentity(emptyFieldObjectIdentities(), "wreck"),
    "wreck",
    "shield",
    { hp, maxHp: 50 },
  );
  world.shieldState = { identities, equipped: { [world.leader.id]: { kind: "shield", key: "shield" } }, ground: {} };
  world.leader.heading = 0;
  world.leader.pos = { x: 300, y: 300 };
  attachCircuitPlay(world, null, false);
  return world;
}

function firePiercing(w: ReturnType<typeof shieldWorld>, pierce: number, damage = 100, fromAngle = 0) {
  const spawn = { x: w.leader.pos.x + 100 * Math.cos(fromAngle), y: w.leader.pos.y + 100 * Math.sin(fromAngle) };
  const dx = w.leader.pos.x - spawn.x;
  const dy = w.leader.pos.y - spawn.y;
  const len = Math.hypot(dx, dy) || 1;
  w.bullets = [{
    alive: true,
    pos: spawn,
    vel: { x: (dx / len) * 1000, y: (dy / len) * 1000 },
    ttl: 1,
    damage,
    ownerId: w.enemies[0]!.id,
    fromEnemy: true,
    pierce,
  }];
  updateBullets(w, 0.2);
}

assert.equal(SPECIAL_AMMO_EFFECT_KEYS.at(-1), "piercing_round");
assert.equal(FALSE_BOARD_EFFECT_KEYS.at(-1), "piercing_round");
assert.ok((FALSE_BOARD_EFFECT_KEYS as readonly string[]).includes("piercing_round"));
assert.equal(weaponCategory("piercing_round"), "special_ammo");

{
  const w = shieldWorld(100);
  const armor = w.leader.hp;
  firePiercing(w, 0.5, 100, 0);
  assert.equal(w.leader.hp, armor - 50);
  assert.equal(equippedShield(w, w.leader)!.shield.hp, 50);
}

{
  const w = shieldWorld(10);
  const armor = w.leader.hp;
  firePiercing(w, 0.5, 100, 0);
  assert.equal(w.leader.hp, armor - 50, "shield underflow does not spill to armor");
  assert.equal(equippedShield(w, w.leader), null);
}

{
  const w = shieldWorld();
  delete w.shieldState;
  const armor = w.leader.hp;
  firePiercing(w, 0.5, 100, 0);
  assert.equal(w.leader.hp, armor - 80);
}

{
  const w = shieldWorld();
  const armor = w.leader.hp;
  firePiercing(w, 0.5, 100, Math.PI);
  assert.equal(w.leader.hp, armor - 100);
  assert.equal(equippedShield(w, w.leader)!.shield.hp, 50);
}

{
  const w = shieldWorld();
  w.bullets = [{
    alive: true,
    pos: { x: w.leader.pos.x + 100, y: w.leader.pos.y },
    vel: { x: -1000, y: 0 },
    ttl: 1,
    damage: 100,
    ownerId: w.enemies[0]!.id,
    fromEnemy: true,
  }];
  const armor = w.leader.hp;
  updateBullets(w, 0.2);
  assert.equal(w.leader.hp, armor);
  assert.equal(equippedShield(w, w.leader), null);
}

{
  const w = shieldWorld();
  attachCircuitPlay(w, null, false);
  w.leader.instanceId = "p";
  w.currentAmmo.p = 5;
  w.leader.cooldown = 0;
  w.circuitPlay!.loadout.leader = [{
    circuitId: "p1", side: 4, effectKey: "piercing_round", effect: 50, r: 0.2,
    trueBoard: false, oneByOne: null, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false,
  }];
  const enemy = w.enemies[0]!;
  enemy.alive = true;
  enemy.pos = { x: w.leader.pos.x + 40, y: w.leader.pos.y };
  const before = w.bullets.length;
  assert.equal(circuitTryWeapon(w, w.leader, enemy), true);
  const shot = w.bullets[before]!;
  assert.equal(shot.pierce, 0.5);
}

{
  const w = shieldWorld();
  w.leader.instanceId = "p";
  w.currentAmmo.p = 5;
  w.leader.cooldown = 0;
  w.circuitPlay!.loadout.leader = [
    {
      circuitId: "fast", side: 4, effectKey: "fast_round", effect: 50, r: 0.2,
      trueBoard: false, oneByOne: null, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false,
    },
    {
      circuitId: "pierce", side: 4, effectKey: "piercing_round", effect: 50, r: 0.2,
      trueBoard: false, oneByOne: null, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false,
    },
  ];
  const enemy = w.enemies[0]!;
  enemy.alive = true;
  enemy.pos = { x: w.leader.pos.x + 40, y: w.leader.pos.y };
  const before = w.bullets.length;
  assert.equal(circuitTryWeapon(w, w.leader, enemy), true);
  const shot = w.bullets[before]!;
  assert.equal(shot.pierce, undefined);
  assert.ok(Math.hypot(shot.vel.x, shot.vel.y) > w.balance.bulletSpeed * 1.4);
}

{
  const w = shieldWorld();
  w.leader.instanceId = "p";
  w.currentAmmo.p = 5;
  w.leader.cooldown = 0;
  w.circuitPlay!.loadout.leader = [
    {
      circuitId: "p1", side: 4, effectKey: "piercing_round", effect: 8, r: 0.06,
      trueBoard: false, oneByOne: null, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false,
    },
    {
      circuitId: "p2", side: 4, effectKey: "piercing_round", effect: 100, r: 0.2,
      trueBoard: false, oneByOne: null, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false,
    },
  ];
  const enemy = w.enemies[0]!;
  enemy.pos = { x: w.leader.pos.x + 40, y: w.leader.pos.y };
  const before = w.bullets.length;
  circuitTryWeapon(w, w.leader, enemy);
  assert.equal(w.bullets[before]!.pierce, 0.08);
}

{
  const inArc = shieldWorld(100);
  assert.equal(resolvePiercingProjectileHit(inArc, inArc.leader, 0, 100, 0.5), 50);
  const outArc = shieldWorld();
  assert.equal(resolvePiercingProjectileHit(outArc, outArc.leader, Math.PI, 100, 0.5), 100);
  const bare = shieldWorld();
  delete bare.shieldState;
  assert.equal(resolvePiercingProjectileHit(bare, bare.leader, 0, 100, 0.5), 80);
}

{
  const w = shieldWorld();
  const identities = w.shieldState!.identities;
  identities.shields.spare = shieldIdentityFromWreck(
    registerWreckIdentity(identities, "wreck2"),
    "wreck2",
    "spare",
    { hp: 50, maxHp: 50 },
  ).shields.spare!;
  delete w.shieldState!.equipped[w.leader.id];
  w.shieldState!.spares = { [w.leader.id]: [{ kind: "shield", key: "spare" }] };
  assert.equal(resolvePiercingProjectileHit(w, w.leader, 0, 100, 0.5), 80, "reserve-only (no equipped shield) uses 0.8");
}

{
  const w = shieldWorld();
  w.shieldState!.exchanges = { [w.leader.id]: { key: "shield", until: w.elapsed + 999 } };
  delete w.shieldState!.equipped[w.leader.id];
  assert.equal(resolvePiercingProjectileHit(w, w.leader, 0, 100, 0.5), 80, "shield exchange with no equipped uses 0.8");
}

{
  const w = shieldWorld(10);
  assert.equal(resolvePiercingProjectileHit(w, w.leader, 0, 100, 0.5), 50, "first hit pierces armor while shield breaks");
  assert.equal(equippedShield(w, w.leader), null);
  assert.equal(resolvePiercingProjectileHit(w, w.leader, 0, 100, 0.5), 80, "second hit after shield gone uses 0.8");
}

{
  const w = shieldWorld(100);
  const armor = w.leader.hp;
  firePiercing(w, 0.5, 100, 0);
  assert.equal(w.leader.hp, armor - 50, "armor takes full pierce share while shield keeps durability");
  assert.equal(equippedShield(w, w.leader)!.shield.hp, 50);
}

console.log("piercingRound.selftest ok");
