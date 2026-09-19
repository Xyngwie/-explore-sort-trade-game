/**
 * Explore behavior selftest — run via `npm run test -w @estg/explore`
 */
import assert from "node:assert/strict";
import { nextPatrolOrbitTarget, decideWingman } from "./game/brain";
import { applyOrder, onSalvageCompleted, rallyWingman } from "./game/orders";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import {
  boardingCargoEta,
  boardingLiftOffEta,
  isInsideBoarding,
  requestExtract,
  tickWorld,
} from "./game/sim";
import { BALANCE } from "./game/balance";
import { buildSortieOutcome, hubWearHandoffUrl, toExploreResult } from "./game/outcome";
import type { Unit } from "./game/types";

function wing(world: ReturnType<typeof createWorld>): Unit {
  const w = world.wingmen[0];
  assert.ok(w);
  return w;
}

// --- bootstrap / I/O v2 ids ---
{
  const boot = bootstrapFromSearch(
    "?deployableMechs=3&startingAmmo=40&deployedInstanceIds=owned_a,owned_b,owned_c",
  );
  assert.equal(boot.wingmanCount, 2);
  assert.deepEqual(boot.deployedInstanceIds, ["owned_a", "owned_b", "owned_c"]);
  assert.equal(boot.ammoStock, 40);
}

// --- patrol orbit coherence ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  const w = wing(world);
  applyOrder(world, w, "patrol", { waypoint: { x: 500, y: 500 } });
  assert.equal(w.stance, "patrol");
  assert.ok(w.waypoint);

  const samples: { x: number; y: number }[] = [];
  for (let i = 0; i < 12; i++) {
    samples.push(nextPatrolOrbitTarget(w, w.waypoint!, 0.2));
  }
  // All orbit points stay near center (radius ~ patrolRadius ± wobble)
  for (const p of samples) {
    const d = Math.hypot(p.x - 500, p.y - 500);
    assert.ok(d > 60 && d < 130, `orbit radius out of band: ${d}`);
  }
  // Angles should advance (not a single fixed weird destination)
  const a0 = Math.atan2(samples[0]!.y - 500, samples[0]!.x - 500);
  const a5 = Math.atan2(samples[5]!.y - 500, samples[5]!.x - 500);
  assert.ok(Math.abs(a5 - a0) > 0.3, "patrol angle should advance");
}

// --- raid: no waypoint / immediate ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  const w = wing(world);
  const r = applyOrder(world, w, "raid");
  assert.equal(r, "applied");
  assert.equal(w.stance, "raid");
  assert.equal(w.waypoint, null);
  const intent = decideWingman(world, w, 0.016);
  // Should produce some move target (hunt or loiter) without player click
  assert.ok(intent.moveTarget != null);
}

// --- salvage complete → auto escort ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  const w = wing(world);
  w.stance = "recover";
  w.waypoint = { x: 1, y: 1 };
  const beforeLogs = world.logs.length;
  onSalvageCompleted(world, w);
  assert.equal(w.stance, "escort");
  assert.equal(w.waypoint, null);
  assert.equal(world.salvaged, 1);
  assert.ok(world.logs.length > beforeLogs);
  assert.ok(world.logs.some((l) => l.text.includes("帯同")));
}

// --- containers unknown until discovered ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  assert.ok(world.containers.every((c) => !c.discovered));
  // Place leader on a crate
  const crate = world.containers[0]!;
  world.leader.pos = { ...crate.pos };
  tickWorld(world, 0.05, {
    move: { x: 0, y: 0 },
    clickMove: null,
    fire: false,
    interact: false,
  });
  assert.equal(crate.discovered, true);
  // Others farther away may still be unknown
  const far = world.containers.filter((c) => c.id !== crate.id);
  assert.ok(far.some((c) => !c.discovered) || far.length === 0);
}

// --- recover denied without discovered crates ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  const w = wing(world);
  const r = applyOrder(world, w, "recover");
  assert.equal(r, "denied");
  assert.equal(w.stance, "escort"); // unchanged
}

// --- off-screen rally changes AI state ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  const w = wing(world);
  w.stance = "raid";
  w.pos = {
    x: world.camera.x + world.camera.w + 200,
    y: world.camera.y + 50,
  };
  const r = rallyWingman(world, w);
  assert.equal(r, "applied");
  assert.equal(w.stance, "escort");
}

// --- battle report kind when off-screen combat ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  // Force a bullet kill off camera
  world.camera = { x: 0, y: 0, w: 100, h: 100 };
  const enemy = world.enemies[0]!;
  enemy.pos = { x: 900, y: 900 };
  enemy.hp = 5;
  world.bullets.push({
    alive: true,
    pos: { ...enemy.pos },
    vel: { x: 0, y: 0 },
    ttl: 1,
    damage: 20,
    fromEnemy: false,
    ownerId: world.leader.id,
  });
  tickWorld(world, 0.05, {
    move: { x: 0, y: 0 },
    clickMove: null,
    fire: false,
    interact: false,
  });
  assert.ok(!enemy.alive);
  assert.ok(
    world.logs.some((l) => l.kind === "battle" && l.text.includes("画面外")),
  );
}


// --- captain auto-combat without holding fire ---
{
  const world = createWorld(bootstrapFromSearch("?startingAmmo=30"));
  startSortie(world);
  const enemy = world.enemies[0]!;
  enemy.alive = true;
  enemy.hp = 40;
  // Place enemy inside weapon range of leader
  world.leader.pos = { x: 400, y: 400 };
  enemy.pos = {
    x: world.leader.pos.x + world.balance.weaponRange * 0.5,
    y: world.leader.pos.y,
  };
  const ammoBefore = world.ammo;
  const bulletsBefore = world.bullets.length;
  // fire: false — auto reaction should still shoot
  tickWorld(world, 0.05, {
    move: { x: 0, y: 0 },
    clickMove: null,
    fire: false,
    interact: false,
  });
  assert.ok(
    world.ammo < ammoBefore || world.bullets.length > bulletsBefore,
    "leader should auto-fire at in-range enemy without Space/F",
  );
  assert.equal(world.leader.cooldown > 0, true);
}

function idleInput() {
  return {
    move: { x: 0, y: 0 },
    clickMove: null,
    fire: false,
    interact: false,
  };
}

function advance(world: ReturnType<typeof createWorld>, seconds: number, step = 0.05): void {
  let left = seconds;
  while (left > 1e-9 && world.phase === "sortie") {
    const dt = Math.min(step, left);
    tickWorld(world, dt, idleInput());
    left -= dt;
  }
}

// --- boarding extract + wear scaffold ---
{
  const world = createWorld(
    bootstrapFromSearch("?deployedInstanceIds=owned_a,owned_b&startingAmmo=20"),
  );
  startSortie(world);
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  // Request from anywhere (not the legacy fixed pad)
  world.leader.pos = { x: 700, y: 400 };
  for (const w of world.wingmen) {
    w.pos = { x: 700, y: 400 };
  }
  world.salvaged = 2;
  assert.ok(requestExtract(world));
  assert.ok(world.boarding);
  assert.equal(world.boarding!.center.x, 700);
  {
    let left = world.balance.boardingLiftOffDelaySec + 0.05;
    while (left > 1e-9 && world.phase === "sortie") {
      world.leader.pos = { x: 700, y: 400 };
      for (const w of world.wingmen) w.pos = { x: 700, y: 400 };
      const dt = Math.min(0.05, left);
      tickWorld(world, dt, idleInput());
      left -= dt;
    }
  }
  assert.equal(world.phase, "result");
  assert.equal(world.extracted, true);
  const result = toExploreResult(world);
  assert.equal(result.isExtracted, true);
  assert.equal(result.salvagedContainers, 2);
  const outcome = buildSortieOutcome(world);
  assert.ok(outcome);
  assert.equal(outcome!.returnKind, "extract");
  assert.equal(outcome!.mechWear.length, 2);
  const wearUrl = hubWearHandoffUrl(world);
  assert.ok(wearUrl && wearUrl.includes("returnKind=extract"));
  assert.ok(wearUrl!.includes("mechWear="));
}

// --- wear uses deploy-time durability ---
{
  const world = createWorld(
    bootstrapFromSearch(
      "?deployedInstanceIds=owned_a&startingAmmo=10&mechDurability=owned_a:85",
    ),
  );
  assert.equal(world.deployedDurability["owned_a"], 85);
  startSortie(world);
  world.phase = "result";
  world.extracted = false;
  world.failReason = "timeout";
  const outcome = buildSortieOutcome(world)!;
  assert.equal(outcome.returnKind, "fail");
  assert.equal(outcome.mechWear[0]!.durabilityBefore, 85);
  assert.equal(outcome.mechWear[0]!.durabilityAfter, 85 - 35); // wearOnFail
  const wearUrl = hubWearHandoffUrl(world)!;
  assert.ok(wearUrl.includes("owned_a:50") || wearUrl.includes("owned_a%3A50"));
}


// --- request extract anywhere; wingmen get patrol waypoint at circle center ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  world.leader.pos = { x: 640, y: 320 };
  for (const w of world.wingmen) {
    w.stance = "raid";
    w.waypoint = null;
    w.pos = { x: 200, y: 200 };
  }
  assert.equal(world.boarding, null);
  assert.ok(requestExtract(world));
  assert.ok(world.boarding);
  assert.equal(world.boarding!.radius, BALANCE.boardingRadius);
  assert.deepEqual(
    { x: world.boarding!.center.x, y: world.boarding!.center.y },
    { x: 640, y: 320 },
  );
  for (const w of world.wingmen) {
    assert.equal(w.alive, true);
    assert.equal(w.stance, "patrol");
    assert.ok(w.waypoint);
    assert.equal(w.waypoint!.x, 640);
    assert.equal(w.waypoint!.y, 320);
  }
  // Second request while active denied
  assert.equal(requestExtract(world), false);
  assert.ok(world.logs.some((l) => l.text.includes("進行中")));
}

function advancePinned(
  world: ReturnType<typeof createWorld>,
  seconds: number,
  pin: () => void,
  step = 0.05,
): void {
  let left = seconds;
  while (left > 1e-9 && world.phase === "sortie") {
    pin();
    const dt = Math.min(step, left);
    tickWorld(world, dt, idleInput());
    pin();
    left -= dt;
  }
}

// --- cargo at +10s; lift-off at +15s only recovers units in circle ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  // Neutralize enemies so combat does not move units off pins
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  world.leader.pos = { x: 500, y: 500 };
  const w0 = world.wingmen[0]!;
  const w1 = world.wingmen[1]!;
  const pin = () => {
    world.leader.pos = { x: 500, y: 500 };
    w0.pos = { x: 505, y: 505 };
    w1.pos = { x: 900, y: 900 };
  };
  pin();
  assert.ok(requestExtract(world));
  assert.equal(world.boarding!.cargoArrived, false);
  assert.ok((boardingCargoEta(world) ?? 0) > 9.5);

  advancePinned(world, world.balance.boardingCargoDelaySec + 0.02, pin);
  assert.equal(world.phase, "sortie");
  assert.ok(world.boarding);
  assert.equal(world.boarding!.cargoArrived, true);
  assert.equal(boardingCargoEta(world), null);
  assert.ok(world.logs.some((l) => l.text.includes("貨物到着")));
  assert.ok((boardingLiftOffEta(world) ?? 0) > 4);

  advancePinned(world, world.balance.boardingLiftOffDelaySec, pin);
  assert.equal(world.phase, "result");
  assert.equal(world.extracted, true);
  assert.ok(world.logs.some((l) => l.text.includes(w1.name) && l.text.includes("置き去り")));
  assert.ok(world.logs.some((l) => l.text.includes("脱出成功")));
}

// --- captain outside at lift-off → fail ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  world.leader.pos = { x: 400, y: 400 };
  world.salvaged = 3;
  assert.ok(requestExtract(world));
  const center = { ...world.boarding!.center };
  const w = world.wingmen[0]!;
  const pin = () => {
    w.pos = { ...center };
    world.leader.pos = {
      x: center.x + world.balance.boardingRadius + 40,
      y: center.y,
    };
  };
  pin();
  assert.equal(isInsideBoarding(world, world.leader), false);
  assert.equal(isInsideBoarding(world, w), true);

  advancePinned(world, world.balance.boardingLiftOffDelaySec + 0.1, pin);
  assert.equal(world.phase, "result");
  assert.equal(world.extracted, false);
  assert.equal(world.failReason, "extract_missed");
  assert.equal(world.salvaged, 0);
  assert.ok(world.logs.some((l) => l.text.includes("隊長") && l.text.includes("円外")));
  const result = toExploreResult(world);
  assert.equal(result.isExtracted, false);
  assert.equal(result.salvagedContainers, 0);
}

console.log("explore selftest: ok");
