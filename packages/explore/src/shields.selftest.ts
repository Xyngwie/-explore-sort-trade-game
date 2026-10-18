import assert from "node:assert/strict";
import { emptyFieldObjectIdentities, registerWreckIdentity, shieldIdentityFromWreck, INITIAL_HUB, saveHubSaveToLocalStorage } from "@estg/shared";
import { attachCircuitPlay, beginCircuitButton, consumeCircuitClick, circuitTryWeapon, startWreckPickup } from "./game/circuitPlay";
import { updateBullets, tickWorld } from "./game/sim";
import { getCoverObjects } from "./game/coverObjects";
import { backfillEnemyState } from "./game/enemyBehavior";
import { createWorld, bootstrapFromSearch, startSortie } from "./game/world";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { absorbShieldHit, equippedShield, shieldHudText, dropEquippedShield, dropUnavailableShields } from "./game/shields";
import { unitLoad, shownSpeed, roomFor } from "./game/carry";

function fixture(hp = 50) {
  const world = createWorld(bootstrapFromSearch("")); startSortie(world); getCoverObjects(world).splice(0);
  const identities = shieldIdentityFromWreck(registerWreckIdentity(emptyFieldObjectIdentities(), "wreck"), "wreck", "shield",
    { hp, maxHp: 50 });
  world.shieldState = { identities, equipped: { [world.leader.id]: { kind: "shield", key: "shield" } }, ground: {} };
  world.leader.heading = 0;
  return world;
}
// Direct sector checks complement the real projectile/melee integration cases below.
{
  const w = fixture(); const hp = w.leader.hp;
  assert(absorbShieldHit(w, w.leader, 0, 10));
  assert.equal(equippedShield(w, w.leader)!.shield.hp, 40); assert.equal(w.leader.hp, hp);
  assert(absorbShieldHit(w, w.leader, Math.PI / 3, 1));
  assert(absorbShieldHit(w, w.leader, -Math.PI / 3, 1));
  assert.equal(absorbShieldHit(w, w.leader, Math.PI / 3 + .0001, 10), false);
  assert.equal(absorbShieldHit(w, w.leader, Math.PI, 10), false);
  w.leader.heading = Math.PI - .01;
  assert(absorbShieldHit(w, w.leader, -Math.PI + .01, 1));
  assert.equal(shieldHudText(w, w.leader), "盾 37/50");
}
{
  const w = fixture(1), armor = w.leader.hp;
  assert(absorbShieldHit(w, w.leader, 0, 1000));
  assert.equal(w.leader.hp, armor); assert.equal(equippedShield(w, w.leader), null);
  assert.equal(w.shieldState!.identities.shields.shield, undefined);
  assert.equal(w.shieldState!.ground.shield, undefined, "broken shield vanishes, not dropped");
  assert.equal(absorbShieldHit(w, w.leader, 0, 5), false, "following hit has no shield");
  assert.equal(w.shieldState!.identities.nextWreckId, "2", "destruction never recycles IDs");
}
{
  const w = fixture(); assert.equal(unitLoad(w, w.leader), 1); assert.equal(shownSpeed(w, w.leader), 75);
  w.leader.salvagedCount = 1; assert.equal(unitLoad(w, w.leader), 2); assert.equal(roomFor(w, w.leader), 0);
  const before = structuredClone(w.shieldState!.identities.shields.shield);
  assert(dropEquippedShield(w, w.leader)); assert.deepEqual(w.shieldState!.identities.shields.shield, before);
  assert.deepEqual(w.shieldState!.ground.shield, w.leader.pos);
  assert.equal(unitLoad(w, w.leader), 1);
}
{
  const w = fixture(); w.leader.alive = false; dropUnavailableShields(w);
  assert.deepEqual(w.shieldState!.ground.shield, w.leader.pos);
  assert.equal(w.shieldState!.equipped[w.leader.id], undefined);
}
{
  const w = fixture(35), restored = worldFromCheckpointBody(snapshotSortieWorld(w))!;
  assert.deepEqual(restored.shieldState, w.shieldState);
  assert.equal(equippedShield(restored, restored.leader)!.shield.hp, 35);
  const old = createWorld(bootstrapFromSearch(""));
  assert.equal(old.shieldState, undefined); assert.equal(equippedShield(old, old.leader), null);
  assert.equal(unitLoad(old, old.leader), 0, "old checkpoints gain no initial shield or load");
}
for (const passengerShield of [true, false]) {
  const w = fixture(35); attachCircuitPlay(w, null, false); getCoverObjects(w).splice(0);
  backfillEnemyState(w);
  for (const e of w.enemies) { e.alive = false; e.hp = 0; e.enemyState!.deathHandled = true; }
  const passenger = w.wingmen[0]!;
  for (const wing of w.wingmen) { wing.alive = wing === passenger; wing.holdOrder = true; }
  w.leader.instanceId = "a"; passenger.instanceId = "b";
  w.leader.pos = { x: 600, y: 600 }; passenger.pos = { x: 600, y: 610 };
  w.mechBattery = { a: { activity: 300, capacity: 300 }, b: { activity: 300, capacity: 300 } };
  if (passengerShield) w.shieldState!.equipped = { [passenger.id]: { kind: "shield", key: "shield" } };
  assert.equal(startWreckPickup(w, w.leader, passenger.id), "started");
  const idle = () => ({ move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false });
  for (let n = 0; n < 79; n++) tickWorld(w, .1, idle());
  assert(equippedShield(w, passengerShield ? passenger : w.leader), "shield remains until actual pickup completion");
  for (let n = 0; n < 3; n++) tickWorld(w, .1, idle());
  assert.equal(equippedShield(w, passengerShield ? passenger : w.leader), null);
  assert(w.shieldState!.ground.shield, "passenger drops all cargo; carrier makes capacity with the existing swap rule");
  assert.equal(w.shieldState!.identities.shields.shield!.hp, 35);
  assert.equal(unitLoad(w, w.leader), 2);
}

{
  const w = fixture();
  assert.equal(absorbShieldHit(w, w.leader, Math.PI * 2 / 3, 1), false, "projectile defense remains 120 degrees");
  assert(absorbShieldHit(w, w.leader, Math.PI * 2 / 3, 1, "melee"));
  assert(absorbShieldHit(w, w.leader, Math.PI * 3 / 4, 1, "melee"));
  assert(absorbShieldHit(w, w.leader, -Math.PI * 3 / 4, 1, "melee"));
  assert.equal(absorbShieldHit(w, w.leader, Math.PI * 3 / 4 + .0001, 1, "melee"), false);
  assert.equal(absorbShieldHit(w, w.leader, Math.PI, 1, "melee"), false, "rear 90-degree sector is unprotected");
}



{
  const shieldWorld = fixture(), containerWorld = fixture();
  delete containerWorld.shieldState; containerWorld.leader.salvagedCount = 1;
  for (const w of [shieldWorld, containerWorld]) {
    getCoverObjects(w).splice(0); backfillEnemyState(w);
    for (const enemy of w.enemies) { enemy.alive = false; enemy.hp = 0; enemy.enemyState!.deathHandled = true; }
    for (const wing of w.wingmen) wing.alive = false;
    w.leader.instanceId = "a"; w.leader.pos = { x: 600, y: 600 }; w.leader.heading = Math.PI / 2;
    w.mechBattery = { a: { activity: 300, capacity: 300 } };
    w.containers = [];
    for (let n = 0; n < 10; n++) tickWorld(w, .1, { move: { x: 1, y: 0 }, clickMove: null, fire: false, interact: false });
  }
  assert.deepEqual(shieldWorld.leader.pos, containerWorld.leader.pos, "shield1 and container1 share the existing movement penalty");
  assert.deepEqual(shieldWorld.mechBattery, containerWorld.mechBattery, "same load uses the same movement power cost");
  assert.equal(shieldWorld.leader.heading, containerWorld.leader.heading, "same load also uses the existing turn-rate penalty");
}


for (const angle of [0, Math.PI * 2 / 3, Math.PI]) {
  for (const shielded of [true, false]) {
    const w = fixture(); attachCircuitPlay(w, null, false);
    const from = w.wingmen[0]!, target = w.leader;
    from.instanceId = "melee"; w.currentAmmo.melee = 0;
    w.circuitPlay!.loadout[from.id] = [{ circuitId: "melee-circuit", side: 2, effectKey: "melee", effect: 100, r: .2,
      trueBoard: false, oneByOne: null, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false }];
    target.pos = { x: 300, y: 300 }; target.inCover = true;
    getCoverObjects(w).push({ id: "cover", pos: { x: 300, y: 344 }, radius: 30 });
    from.pos = { x: 300 + Math.cos(angle) * 24, y: 300 + Math.sin(angle) * 24 };
    from.heading = Math.atan2(target.pos.y - from.pos.y, target.pos.x - from.pos.x);
    if (!shielded) delete w.shieldState;
    const hp = target.hp, damage = w.balance.bulletDamage * 1.2 * .7;
    assert.equal(circuitTryWeapon(w, from, target), true);
    const blocked = shielded && angle !== Math.PI;
    assert(Math.abs(target.hp - (blocked ? hp : hp - damage)) < 1e-8, "melee uses the common post-hit mitigation even without a shield");
    if (shielded) assert(Math.abs(equippedShield(w, target)!.shield.hp - (blocked ? 50 - damage : 50)) < 1e-8);
  }
}


function projectileFixture(hp = 50) {
  const w = fixture(hp); attachCircuitPlay(w, null, false);
  w.leader.pos = { x: 300, y: 300 };
  for (const u of [...w.wingmen, ...w.enemies]) { u.pos = { x: 1200, y: 900 }; u.cooldown = 100; }
  for (const e of w.enemies) e.enemyIdentity!.circuits = [];
  return w;
}
function shoot(w: ReturnType<typeof fixture>, damage = 10, angle = 0, friendly = false, emp = false) {
  const target = w.leader, owner = friendly ? w.wingmen[0]! : w.enemies[0]!;
  owner.pos = { x: target.pos.x + 100 * Math.cos(angle), y: target.pos.y + 100 * Math.sin(angle) };
  w.bullets = [{ alive: true, pos: { ...owner.pos }, vel: { x: -1000 * Math.cos(angle), y: -1000 * Math.sin(angle) },
    ttl: 1, damage, ownerId: owner.id, fromEnemy: !friendly, ...(emp ? { emp: true, empSlow: .4 } : {}) }];
  updateBullets(w, .2);
}
for (const heading of [0, Math.PI / 3, -Math.PI / 3, Math.PI / 3 + .0001, Math.PI]) {
  const w = projectileFixture(), armor = w.leader.hp; w.leader.heading = heading;
  shoot(w);
  const blocked = Math.abs(heading) <= Math.PI / 3;
  assert.equal(w.leader.hp, blocked ? armor : armor - 10);
  assert.equal(equippedShield(w, w.leader)!.shield.hp, blocked ? 40 : 50);
  assert.equal(w.bullets.length, 0); assert.equal(w.combatHitsTaken, 1, "contact statistics retain their existing meaning");
}
{
  const w = projectileFixture(1), armor = w.leader.hp; shoot(w, 1000);
  assert.equal(w.leader.hp, armor); assert(w.leader.alive); assert.equal(equippedShield(w, w.leader), null);
  shoot(w); assert.equal(w.leader.hp, armor - 10, "only the following hit reaches armor");
}
{
  const w = projectileFixture(), armor = w.leader.hp;
  w.circuitPlay!.loadout[w.leader.id] = [{ circuitId: "armor", side: 2, effectKey: "armor_tune", effect: 100, r: .2,
    trueBoard: true, oneByOne: null, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false }];
  w.leader.inCover = true;
  getCoverObjects(w).push({ id: "side-cover", pos: { x: 300, y: 344 }, radius: 30 });
  w.camp = { pos: { ...w.leader.pos }, stashedCount: 1 };
  shoot(w);
  assert.equal(w.leader.hp, armor);
  assert(Math.abs(equippedShield(w, w.leader)!.shield.hp - (50 - 10 * .72 * .5)) < 1e-8,
    "same camp multiplier and summed cover/armor mitigation apply before shield HP");
}
{
  const w = projectileFixture(), hp = w.leader.hp; shoot(w, 10, 0, false, true);
  assert.equal(w.leader.hp, hp); assert.equal(equippedShield(w, w.leader)!.shield.hp, 40);
  assert.equal(w.circuitPlay!.emp[w.leader.id]!.slow, .4, "Q4=B: EMP status reaches the mech through the shield");
}
{
  const w = projectileFixture(), armor = w.leader.hp; shoot(w, 10, 0, true);
  assert.equal(w.leader.hp, armor); assert.equal(equippedShield(w, w.leader)!.shield.hp, 40);
  assert.equal(w.friendlyFire?.count, 1); assert.equal(w.combatHitsTaken, 0);
  assert(w.logs.some(l => l.text.startsWith("誤射：")));
}
{
  const w = projectileFixture(), armor = w.leader.hp;
  getCoverObjects(w).push({ id: "wall", pos: { x: 350, y: 300 }, radius: 20 });
  shoot(w); assert.equal(w.leader.hp, armor); assert.equal(equippedShield(w, w.leader)!.shield.hp, 50);
  assert.equal(w.combatHitsTaken, 0, "obstacle contact stops the shot before shield/body contact");
}


{
  const w = projectileFixture(); const from = w.leader, target = w.enemies[0]!;
  from.instanceId = "melee"; w.currentAmmo.melee = 0;
  w.circuitPlay!.loadout[from.id] = [{ circuitId: "melee", side: 2, effectKey: "melee", effect: 100, r: .2,
    trueBoard: false, oneByOne: null, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false }];
  target.enemyIdentity!.circuits = [{ circuitId: "enemy-armor", side: 2, effectKey: "point_defense_armor", effect: 100, trueBoard: false }];
  target.pos = { x: 300, y: 300 }; target.heading = 0; from.pos = { x: 324, y: 300 }; from.heading = Math.PI;
  w.shieldState!.equipped = { [target.id]: { kind: "shield", key: "shield" } };
  const hp = target.hp; assert(circuitTryWeapon(w, from, target));
  assert.equal(target.hp, hp);
  assert(Math.abs(equippedShield(w, target)!.shield.hp - 40) < 1e-8, "melee also uses enemy armor before shield damage");
}
{
  const store = new Map<string, string>(), g = globalThis as { localStorage?: unknown }, previous = g.localStorage;
  g.localStorage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
  try {
    assert(saveHubSaveToLocalStorage({ ...INITIAL_HUB, credits: 1000 }));
    const w = projectileFixture(45), target = w.enemies[0]!;
    w.leader.pos = { x: 400, y: 300 }; w.leader.heading = Math.PI;
    target.pos = { x: 300, y: 300 }; target.heading = 0;
    w.shieldState!.equipped = { [target.id]: { kind: "shield", key: "shield" } };
    w.circuitPlay!.captainTrueOne = true;
    beginCircuitButton(w, "air_support"); consumeCircuitClick(w, { ...target.pos });
    assert.equal(target.alive, false, "aerial support bypasses frontal shield defense");
    assert.equal(w.shieldState!.identities.shields.shield!.hp, 45);
    dropUnavailableShields(w);
    assert.deepEqual(w.shieldState!.ground.shield, target.pos);
    assert.equal(w.shieldState!.identities.shields.shield!.hp, 45, "destroyed mech drops the surviving shield intact");
  } finally { if (previous === undefined) delete g.localStorage; else g.localStorage = previous; }
}
console.log("shield core: real projectile120/melee270, post-hit mitigation, breaking hit, EMP-through/FF, weight/power, 8s pickup and checkpoint PASS");
