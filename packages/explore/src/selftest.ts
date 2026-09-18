/**
 * Explore behavior selftest — run via `npm run test -w @estg/explore`
 */
import assert from "node:assert/strict";
import { nextPatrolOrbitTarget, decideWingman } from "./game/brain";
import { applyOrder, onSalvageCompleted, rallyWingman } from "./game/orders";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { tickWorld, tryExtract } from "./game/sim";
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

// --- extract + wear scaffold ---
{
  const world = createWorld(
    bootstrapFromSearch("?deployedInstanceIds=owned_a,owned_b&startingAmmo=20"),
  );
  startSortie(world);
  world.leader.pos = { ...world.extract.pos };
  world.salvaged = 2;
  assert.ok(tryExtract(world));
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

console.log("explore selftest: ok");
