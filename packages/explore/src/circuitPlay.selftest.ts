/**
 * Circuit sortie actions that do not depend on a browser (Issue #269).
 */
import assert from "node:assert/strict";
import { attachCircuitPlay, consumeCircuitClick, pincerPoints, secondExtractPull } from "./game/circuitPlay";
import { requestExtract, tickWorld } from "./game/sim";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";

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

console.log("circuitPlay.selftest ok");
