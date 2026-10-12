/**
 * 項目4-1 積載と速度（feat/explore-carry-load）+ compat for old checkpoints / URLs.
 */
import assert from "node:assert/strict";
import type { ClassifiedCircuit } from "@estg/shared";
import {
  applyCollectPress,
  attachCircuitPlay,
  backfillCircuitPlayState,
  noteCollectTap,
  stepCircuitPlay,
  type CircuitPlayState,
} from "./game/circuitPlay";
import { tickWorld } from "./game/sim";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { IDENTITY_ABILITY_SCALE } from "./game/releaseAbility";
import { loadLineJa, loadSpeedValue, unitLoad, unitLoadCap, LOAD_SPEED_TABLE } from "./game/carry";
import { cargoSpeedMul, pickUpFromCamp } from "./game/orders";

const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };

function releaseWorld() {
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  attachCircuitPlay(world, null, true);
  for (const id of ["leader", "wing-a", "wing-b"]) world.circuitPlay!.ability[id] = { ...IDENTITY_ABILITY_SCALE };
  for (const e of world.enemies) { e.alive = false; e.hp = 0; }
  for (const c of world.containers) { c.discovered = false; c.pos = { x: 20, y: 20 }; }
  world.leader.pos = { x: 400, y: 400 };
  return world;
}

function cargoCircuit(slots: number): ClassifiedCircuit {
  return { circuitId: "cargo", effect: 4, r: 0, effectKey: "cargo_slots", trueBoard: false, oneByOne: null, side: 2, conductive: true, cargoSlots: slots, perfectPt: 0, false20: false, true20: false };
}

function wreckOf(world: ReturnType<typeof releaseWorld>, i: number, at: { x: number; y: number }) {
  const w = world.wingmen[i]!;
  w.alive = false;
  w.hp = 0;
  w.instanceId = w.instanceId ?? `wreck-${i}`;
  w.pos = { ...at };
  return w;
}

const run = (world: ReturnType<typeof releaseWorld>, sec: number) => { for (let t = 0; t < sec - 1e-9; t += 0.1) stepCircuitPlay(world, 0.1); };

// load / cap / speed table
{
  const world = releaseWorld();
  const leader = world.leader;
  assert.deepEqual([...LOAD_SPEED_TABLE], [120, 75, 60, 45, 30, 15, 0]);
  assert.equal(loadSpeedValue(9), 0);
  assert.equal(unitLoad(world, leader), 0);
  assert.equal(unitLoadCap(world, leader), 2, "C4: cap 2");
  leader.salvagedCount = 2;
  assert.equal(unitLoad(world, leader), 2, "2 containers fill the cap");
  assert.equal(loadLineJa(world, leader), "積載 2/2・速度 60");
  assert.equal(cargoSpeedMul(leader, world), 0.5);
  leader.salvagedCount = 0;
  world.circuitPlay!.loadout.leader = [cargoCircuit(2)];
  assert.equal(unitLoadCap(world, leader), 4, "cargo_slots raises the cap (existing bonus)");
  world.circuitPlay!.loadout.leader = [];
  // C5: the release ability multiplier scales the shown speed
  world.circuitPlay!.ability.leader = { ...IDENTITY_ABILITY_SCALE, moveSpeed: 0.5 };
  leader.salvagedCount = 1;
  assert.equal(loadLineJa(world, leader), "積載 1/2・速度 38", "75 × 0.5");
  console.log("explore 4-1 load / cap / speed table ok");
}

// empty-handed wreck pickup: 8 s, and a far wreck does not teleport
{
  const world = releaseWorld();
  const wreck = wreckOf(world, 0, { x: 600, y: 400 });
  noteCollectTap(world, { ...wreck.pos });
  applyCollectPress(world);
  run(world, 9);
  assert.equal(world.circuitPlay!.carry.leader, undefined, "far wreck: not taken");
  assert.deepEqual(wreck.pos, { x: 600, y: 400 }, "far wreck: does not teleport");
  wreck.pos = { x: 415, y: 400 };
  noteCollectTap(world, { ...wreck.pos });
  applyCollectPress(world);
  run(world, 7.8);
  assert.equal(world.circuitPlay!.carry.leader, undefined, "not before 8 s");
  run(world, 0.4);
  assert.deepEqual(world.circuitPlay!.carry.leader, [wreck.id], "empty-handed: wreck taken after 8 s");
  assert.equal(unitLoad(world, world.leader), 2, "one wreck fills the cap");
  assert.equal(loadLineJa(world, world.leader), "積載 2/2・速度 60");
  // full: a container is not picked up
  const crate = world.containers[0]!;
  crate.discovered = true; crate.taken = false; crate.pos = { ...world.leader.pos };
  for (let i = 0; i < 40; i++) tickWorld(world, 0.1, { ...idle, interact: true });
  assert.equal(crate.taken, false, "wreck 2/2: no container");
  crate.pos = { x: 20, y: 20 };
  // moving away cancels a running pickup
  const other = wreckOf(world, 1, { x: 420, y: 410 });
  noteCollectTap(world, { ...other.pos });
  applyCollectPress(world);
  run(world, 2);
  world.leader.pos = { x: 700, y: 700 };
  run(world, 7);
  assert.deepEqual(world.circuitPlay!.carry.leader, [wreck.id], "leaving cancels the pickup");
  // a wreck while carrying a wreck: the held one is set down (#269 swap)
  other.pos = { x: 710, y: 700 };
  noteCollectTap(world, { ...other.pos });
  applyCollectPress(world);
  run(world, 8.2);
  assert.deepEqual(world.circuitPlay!.carry.leader, [other.id], "swap: the new wreck is carried");
  assert.equal(wreck.pos.x, 700, "the old wreck stays where it was set down");
  console.log("explore 4-1 captain wreck pickup ok");
}

// C6: a destroyed carrier drops its cargo; another mech can pick it up
{
  const world = releaseWorld();
  const carrier = world.wingmen[0]!;
  carrier.pos = { x: 500, y: 500 };
  carrier.salvagedCount = 2;
  world.salvaged = 2;
  const w = wreckOf(world, 1, { x: 300, y: 300 });
  world.circuitPlay!.carry[carrier.id] = [w.id];
  stepCircuitPlay(world, 0.05);
  assert.deepEqual(w.pos, { x: 500, y: 500 }, "carried wreck rides on its carrier");
  carrier.alive = false; carrier.hp = 0;
  const before = world.containers.length;
  tickWorld(world, 0.05, idle);
  assert.equal(carrier.salvagedCount, 0);
  assert.equal(world.containers.length, before + 2, "containers drop on the spot");
  assert.ok(world.containers.slice(before).every((c) => c.discovered && !c.taken && Math.hypot(c.pos.x - 500, c.pos.y - 500) < 60));
  assert.equal(world.circuitPlay!.carry[carrier.id], undefined, "carried wreck is dropped");
  assert.ok(Math.hypot(w.pos.x - 500, w.pos.y - 500) < 1, "the wreck stays where the carrier fell");
  world.leader.pos = { x: 505, y: 500 };
  noteCollectTap(world, { ...w.pos });
  applyCollectPress(world);
  run(world, 8.2);
  assert.deepEqual(world.circuitPlay!.carry.leader, [w.id], "another mech picks the dropped wreck up");
  console.log("explore 4-1 destroyed carrier drops cargo ok");
}

// camp: 「キャンプから積込」 respects the cap
{
  const world = releaseWorld();
  world.camp = { pos: { ...world.leader.pos }, stashedCount: 5 } as never;
  for (const w of world.wingmen) w.pos = { x: 2000, y: 2000 };
  assert.equal(pickUpFromCamp(world), "picked");
  assert.equal(world.leader.salvagedCount, 2, "only 2 fit");
  assert.equal(world.camp!.stashedCount, 3);
  console.log("explore 4-1 camp pick-up cap ok");
}

// compat: an old 5-3 checkpoint (leader-only `carried`, no carry / wreckChannel) loads
{
  const play = { carried: ["wing-a"], loadout: {} } as unknown as Partial<CircuitPlayState>;
  backfillCircuitPlayState(play);
  assert.deepEqual(play.carry, { leader: ["wing-a"] });
  assert.deepEqual(play.wreckChannel, {});
  assert.equal((play as { carried?: unknown }).carried, undefined);
  const world = releaseWorld();
  const body = JSON.parse(JSON.stringify(snapshotSortieWorld(world))) as Record<string, unknown> & { circuitPlay: Record<string, unknown> };
  delete body.circuitPlay.carry;
  delete body.circuitPlay.wreckChannel;
  body.circuitPlay.carried = [];
  const restored = worldFromCheckpointBody(body)!;
  assert.ok(restored, "old checkpoint restores");
  assert.deepEqual(restored.circuitPlay!.carry, {});
  for (let i = 0; i < 5; i++) tickWorld(restored, 0.05, idle);
  console.log("explore 4-1 old checkpoint backfill ok");
}

// compat: an old sortie URL (startingAmmo, no ids) still loads; F1 shows the stock
{
  const boot = bootstrapFromSearch("?deployableMechs=3&startingAmmo=41");
  const world = createWorld(boot);
  assert.equal(world.ammoStock, 41);
  assert.match(world.note, /実弾 41/);
  const v2 = createWorld(bootstrapFromSearch("?v=2&deployedInstanceIds=a,b&startingAmmo=12&mechDurability=a:100;b:100"));
  assert.match(v2.note, /実弾 12/, "F1: 実弾 on the v2 briefing too");
  console.log("explore 4-1 old sortie URL / F1 ok");
}
