/**
 * Explore behavior selftest — run via `npm run test -w @estg/explore`
 */
import assert from "node:assert/strict";
import { nextPatrolOrbitTarget, decideWingman } from "./game/brain";
import {
  applyOrder,
  applyOrderToAllWingmen,
  campDamageTakenMul,
  cargoSpeedMul,
  containerNearWaypoint,
  inCampAura,
  isOperationTimedOut,
  onSalvageCompleted,
  pickUpFromCamp,
  purgeCargo,
  rallyWingman,
  scatterSearch,
  setCampOrDeposit,
  spawnContainersAt,
  unloadAtCamp,
  unitMoveSpeedMul,
} from "./game/orders";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import {
  boardingCargoEta,
  boardingLiftOffEta,
  boardingRequirementsHud,
  isInsideBoarding,
  requestExtract,
  spawnEnemyDeathDrops,
  tickWorld,
} from "./game/sim";
import { BALANCE, threatFromDensity,
  ENGAGE_BRIEFING_LABEL,
  threatFromInvadeSector
} from "./game/balance";
import { buildSortieOutcome, hubWearHandoffUrl, sortHandoffUrl, toExploreResult } from "./game/outcome";
import { invadeIntelBannerText } from "./game/invadeIntelBanner";
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


// --- scatter search: captain + living wingmen → raid, fan ~120° ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  world.leader.heading = 0; // +x
  world.leader.pos = { x: 700, y: 500 };
  for (const w of world.wingmen) {
    w.alive = true;
    w.pos = { ...world.leader.pos };
    w.stance = "escort";
  }
  const before = world.logs.length;
  const r = scatterSearch(world);
  assert.equal(r, "applied");
  assert.equal(world.leader.stance, "raid");
  assert.ok(world.leader.moveTarget != null);
  const livingWings = world.wingmen.filter((w) => w.alive);
  assert.ok(livingWings.length >= 1);
  for (const w of livingWings) {
    assert.equal(w.stance, "raid");
    assert.ok(w.waypoint != null, "wingman should get scatter waypoint");
  }
  // Directions should diverge (not all the same point)
  const pts = [
    world.leader.moveTarget!,
    ...livingWings.map((w) => w.waypoint!),
  ];
  const uniq = new Set(pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
  assert.ok(uniq.size >= Math.min(3, pts.length), "fan-out targets should differ");
  assert.ok(world.logs.length > before);
  assert.ok(world.logs.some((l) => l.text.includes("散開捜索")));
  // Wingman intent should chase scatter waypoint when no nearby hunt
  world.enemies.forEach((e) => {
    e.alive = false;
  });
  const w0 = livingWings[0]!;
  const intent = decideWingman(world, w0, 0.016);
  assert.ok(intent.moveTarget != null);
  const dWp = Math.hypot(
    intent.moveTarget!.x - w0.waypoint!.x,
    intent.moveTarget!.y - w0.waypoint!.y,
  );
  assert.ok(dWp < 1, "raid with scatter waypoint should move toward it");
}

// --- scatter fan-out: 2+ wingmen get non-identical goals even with enemies ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  world.leader.heading = 0;
  world.leader.pos = { x: 700, y: 500 };
  assert.ok(world.wingmen.length >= 2, "need 2+ wingmen");
  for (const w of world.wingmen) {
    w.alive = true;
    w.pos = { ...world.leader.pos };
    w.stance = "escort";
    w.waypoint = null;
  }
  // Distant enemies that previously made all raid craft stack on one hunt vector.
  for (const e of world.enemies) {
    e.alive = true;
    e.pos = { x: 200, y: 200 };
  }
  assert.equal(scatterSearch(world), "applied");
  const living = world.wingmen.filter((w) => w.alive);
  const goals = living.map((w) => {
    assert.ok(w.waypoint, "scatter waypoint required");
    return `${Math.round(w.waypoint!.x)},${Math.round(w.waypoint!.y)}`;
  });
  assert.equal(new Set(goals).size, goals.length, "wingmen scatter goals must differ");
  const intents = living.map((w) => decideWingman(world, w, 0.016));
  const intentKeys = intents.map((intent, i) => {
    assert.ok(intent.moveTarget, "intent moveTarget");
    const wp = living[i]!.waypoint!;
    const d = Math.hypot(
      intent.moveTarget!.x - wp.x,
      intent.moveTarget!.y - wp.y,
    );
    assert.ok(d < 1, "scatter waypoint beats distant hunt so craft fan out");
    return `${Math.round(intent.moveTarget!.x)},${Math.round(intent.moveTarget!.y)}`;
  });
  assert.equal(
    new Set(intentKeys).size,
    intentKeys.length,
    "scatter intents must be non-identical headings/goals",
  );
  // Captain remains player-led (no AI waypoint); moveTarget seed only.
  assert.equal(world.leader.waypoint, null);
  assert.ok(world.leader.moveTarget != null);
}

// --- recover fan-out: 2+ crates → distinct assigned crate ids ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  assert.ok(world.wingmen.length >= 2);
  const living = world.wingmen.filter((w) => w.alive);
  assert.ok(living.length >= 2);
  // Stack wingmen so naive nearest-picker would assign the same crate.
  const base = { x: 500, y: 500 };
  world.leader.pos = { ...base };
  for (const w of living) {
    w.pos = { ...base };
    w.stance = "escort";
    w.waypoint = null;
  }
  world.containers.forEach((c) => {
    c.discovered = false;
    c.taken = true;
  });
  const crates = [
    { id: "fan-a", pos: { x: 560, y: 500 } },
    { id: "fan-b", pos: { x: 500, y: 560 } },
    { id: "fan-c", pos: { x: 440, y: 500 } },
  ];
  for (const c of crates) {
    world.containers.push({
      id: c.id,
      pos: { ...c.pos },
      taken: false,
      discovered: true,
      glowT: 0,
    });
  }
  const n = applyOrderToAllWingmen(world, "recover");
  assert.equal(n, living.length);
  const assignedIds = living.map((w) => {
    assert.equal(w.stance, "recover");
    const c = containerNearWaypoint(world, w.waypoint);
    assert.ok(c, "each recover wingman should get a crate waypoint");
    return c!.id;
  });
  assert.equal(
    new Set(assignedIds).size,
    assignedIds.length,
    "recover must assign different crate ids",
  );
}

// --- recover with fewer crates than wingmen → distinct approach goals ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  const living = world.wingmen.filter((w) => w.alive);
  assert.ok(living.length >= 2);
  const base = { x: 600, y: 400 };
  for (const w of living) {
    w.pos = { ...base };
    w.stance = "escort";
    w.waypoint = null;
  }
  world.containers.forEach((c) => {
    c.discovered = false;
    c.taken = true;
  });
  world.containers.push({
    id: "solo-crate",
    pos: { x: 650, y: 400 },
    taken: false,
    discovered: true,
    glowT: 0,
  });
  assert.equal(applyOrderToAllWingmen(world, "recover"), living.length);
  const goals = living.map((w) => {
    assert.ok(w.waypoint);
    return `${Math.round(w.waypoint!.x)},${Math.round(w.waypoint!.y)}`;
  });
  assert.equal(new Set(goals).size, goals.length, "approach goals must differ");
  const crateHolders = living.filter((w) => containerNearWaypoint(world, w.waypoint));
  assert.equal(crateHolders.length, 1, "only one unit claims the sole crate");
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

// --- captain auto-salvage without holding E ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  const crate = world.containers[0]!;
  crate.discovered = true;
  crate.taken = false;
  world.leader.pos = { ...crate.pos };
  world.leader.salvagedCount = 0;
  const salvagedBefore = world.salvaged;
  // interact stays false for the whole channel
  advance(world, world.balance.salvageSeconds + 0.5);
  assert.equal(crate.taken, true, "crate should be taken without E");
  assert.equal(world.salvaged, salvagedBefore + 1);
  assert.equal(world.leader.salvagedCount, 1);
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
  // Keep field crates outside boarding circle so salvage count stays exact.
  for (const c of world.containers) {
    c.pos = { x: 50, y: 50 };
  }
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


// --- invade→explore density → threat ---
{
  const low = threatFromDensity(0);
  const high = threatFromDensity(1);
  const mid = threatFromDensity(0.5);
  const base = threatFromDensity(null);
  assert.equal(low.enemyCount, BALANCE.densityEnemyCountMin);
  assert.equal(high.enemyCount, BALANCE.densityEnemyCountMax);
  assert.equal(base.enemyCount, BALANCE.baselineEnemyCount);
  assert.ok(low.spawnDist > high.spawnDist, "higher density → closer spawn");
  assert.ok(high.enemySpeedMul > low.enemySpeedMul);
  assert.equal(mid.enemyCount, Math.round((BALANCE.densityEnemyCountMin + BALANCE.densityEnemyCountMax) / 2));

  const bootLow = bootstrapFromSearch("?sectorX=1&sectorY=0&density=0");
  assert.ok(bootLow.invadeSector);
  assert.equal(bootLow.invadeSector!.sectorX, 1);
  assert.equal(bootLow.invadeSector!.density, 0);
  const worldLow = createWorld(bootLow);
  assert.equal(worldLow.enemies.length, BALANCE.densityEnemyCountMin);
  assert.equal(worldLow.invadeSector?.sectorY, 0);
  assert.equal(worldLow.balance.enemySpeed, BALANCE.enemySpeed * low.enemySpeedMul);

  const bootHigh = bootstrapFromSearch(
    "?sectorX=3&sectorY=-2&density=1&intelFlags=routeHint,rareSignal&deployableMechs=2&startingAmmo=25",
  );
  assert.ok(bootHigh.invadeSector);
  assert.deepEqual(bootHigh.invadeSector!.intelFlags, ["routeHint", "rareSignal"]);
  assert.equal(bootHigh.ammoStock, 25);
  assert.equal(bootHigh.wingmanCount, 1);
  assert.ok(bootHigh.note.includes("戦線"));
  const worldHigh = createWorld(bootHigh);
  assert.equal(worldHigh.enemies.length, BALANCE.densityEnemyCountMax);
  assert.ok(
    Math.abs(worldHigh.balance.enemySpeed - BALANCE.enemySpeed * high.enemySpeedMul) < 1e-9,
  );

  const bootNone = bootstrapFromSearch("?deployableMechs=3&startingAmmo=10");
  assert.equal(bootNone.invadeSector, null);
  const worldNone = createWorld(bootNone);
  assert.equal(worldNone.enemies.length, BALANCE.baselineEnemyCount);
  assert.equal(worldNone.balance.enemySpeed, BALANCE.enemySpeed);
}


// --- circuit durability buffer reduces wear ---
{
  const world = createWorld(
    bootstrapFromSearch(
      "?deployedInstanceIds=owned_a&startingAmmo=10&mechDurability=owned_a:85&circuitBonuses=craft:1.100;repair:0.200;dur:10",
    ),
  );
  assert.equal(world.circuitDurabilityBuffer, 10);
  assert.ok(Math.abs(world.circuitCraftMultiplier - 1.1) < 0.001);
  assert.ok(world.note.includes("回路緩衝 10"));
  assert.ok(world.note.includes("craft×"));
  world.extracted = true;
  world.salvaged = 2;
  const sortUrl = sortHandoffUrl(world);
  assert.ok(sortUrl.includes("craftMultiplier=1.100"), "explore→sort forwards craft");
  world.extracted = false;
  world.salvaged = 0;
  startSortie(world);
  world.phase = "result";
  world.extracted = false;
  world.failReason = "timeout";
  const outcome = buildSortieOutcome(world)!;
  assert.equal(outcome.mechWear[0]!.durabilityBefore, 85);
  assert.equal(outcome.mechWear[0]!.durabilityAfter, 85 - (35 - 10)); // fail wear buffered
  assert.equal(outcome.mechWear[0]!.wearApplied, 25);
}


// --- invade→explore engage handoff (forced vs raid) ---
{
  const forced = threatFromInvadeSector({
    density: 0.5,
    engage: "forced",
    enemyCells: [
      { sx: 3, sy: -2 },
      { sx: 4, sy: -2 },
      { sx: 3, sy: -1 },
      { sx: 2, sy: -2 },
      { sx: 3, sy: -3 },
    ],
  });
  assert.equal(forced.enemyCount, 5);
  assert.ok(forced.enemySpeedMul >= BALANCE.engageForcedSpeedMul - 1e-9);
  assert.ok(forced.enemyHpMul >= BALANCE.engageForcedHpMul - 1e-9);
  assert.ok(forced.spawnDist <= BALANCE.engageForcedSpawnDist + 1e-9);

  const forcedFallback = threatFromInvadeSector({
    density: 0.2,
    engage: "forced",
    neighborCount: 3,
  });
  assert.equal(forcedFallback.enemyCount, Math.max(BALANCE.engageForcedEnemyCountMin, 1 + 3));

  const raid = threatFromInvadeSector({
    density: 0.8,
    engage: "raid",
    enemyCells: [{ sx: 5, sy: 1 }],
  });
  assert.equal(raid.enemyCount, 1);
  assert.equal(raid.spawnDist, BALANCE.engageRaidSpawnDist);
  assert.ok(raid.enemyCount < forced.enemyCount);

  const bootForced = bootstrapFromSearch(
    "?sectorX=3&sectorY=-2&density=0.500&engage=forced&enemyCells=3,-2;4,-2;3,-1;2,-2;3,-3",
  );
  assert.equal(bootForced.invadeSector?.engage, "forced");
  assert.equal(bootForced.invadeSector?.enemyCells?.length, 5);
  assert.ok(bootForced.note.includes("強制交戦") || bootForced.note.includes(ENGAGE_BRIEFING_LABEL.forced));
  const worldForced = createWorld(bootForced);
  assert.equal(worldForced.enemies.length, 5);
  assert.ok(worldForced.enemies[0]!.maxHp > BALANCE.enemyHp); // hp mul
  assert.equal(worldForced.invadeSector?.engage, "forced");

  const bootRaid = bootstrapFromSearch(
    "?sectorX=5&sectorY=1&density=0.200&engage=raid&enemyCells=5,1",
  );
  assert.equal(bootRaid.invadeSector?.engage, "raid");
  assert.deepEqual(bootRaid.invadeSector?.enemyCells, [{ sx: 5, sy: 1 }]);
  assert.ok(bootRaid.note.includes("任意侵入") || bootRaid.note.includes(ENGAGE_BRIEFING_LABEL.raid));
  const worldRaid = createWorld(bootRaid);
  assert.equal(worldRaid.enemies.length, 1);
  assert.ok(worldRaid.enemies.length < worldForced.enemies.length);
}





// --- invade intel banner helper (HUD / briefing note) ---
{
  assert.equal(invadeIntelBannerText(null), null);
  const banner = invadeIntelBannerText({
    sectorX: 3,
    sectorY: -2,
    density: 0.5,
    intelFlags: ["routeHint", "scoutHazard"],
    engage: "forced",
    enemyCells: [
      { sx: 3, sy: -2 },
      { sx: 4, sy: -2 },
    ],
  });
  assert.ok(banner);
  assert.ok(banner!.includes("漁場 (3,-2)"));
  assert.ok(banner!.includes("dens 0.500"));
  assert.ok(banner!.includes(ENGAGE_BRIEFING_LABEL.forced));
  assert.ok(banner!.includes("敵セル 2"));
  assert.ok(banner!.includes("routeHint"));

  const raidBan = invadeIntelBannerText({
    sectorX: 5,
    sectorY: 1,
    density: 0.2,
    intelFlags: [],
    engage: "raid",
    enemyCells: [{ sx: 5, sy: 1 }],
  });
  assert.ok(raidBan!.includes(ENGAGE_BRIEFING_LABEL.raid));
  assert.ok(raidBan!.includes("敵セル 1"));
}

// --- cargo slowdown scales with salvagedCount / soft ref (no hard MAX) ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  const leader = world.leader;
  const ref = BALANCE.cargoSpeedRefSlots;
  assert.ok(Math.abs(cargoSpeedMul(leader, world.balance) - 1) < 1e-9);
  leader.salvagedCount = ref;
  assert.ok(
    Math.abs(cargoSpeedMul(leader, world.balance) - BALANCE.cargoSpeedMulMin) < 1e-9,
  );
  leader.salvagedCount = ref / 2;
  const mid = cargoSpeedMul(leader, world.balance);
  assert.ok(mid < 1 && mid > BALANCE.cargoSpeedMulMin);
  // Beyond soft ref still allowed (no hard MAX) and stays at min mul
  leader.salvagedCount = ref * 5;
  assert.ok(
    Math.abs(cargoSpeedMul(leader, world.balance) - BALANCE.cargoSpeedMulMin) < 1e-9,
  );

  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  leader.salvagedCount = 0;
  leader.pos = { x: 400, y: 500 };
  leader.moveTarget = null;
  const emptyStart = { ...leader.pos };
  for (let i = 0; i < 10; i++) {
    tickWorld(world, 0.05, {
      move: { x: 1, y: 0 },
      clickMove: null,
      fire: false,
      interact: false,
    });
  }
  const emptyDist = Math.hypot(leader.pos.x - emptyStart.x, leader.pos.y - emptyStart.y);

  leader.salvagedCount = ref;
  leader.pos = { x: 400, y: 500 };
  leader.moveTarget = null;
  const fullStart = { ...leader.pos };
  for (let i = 0; i < 10; i++) {
    tickWorld(world, 0.05, {
      move: { x: 1, y: 0 },
      clickMove: null,
      fire: false,
      interact: false,
    });
  }
  const fullDist = Math.hypot(leader.pos.x - fullStart.x, leader.pos.y - fullStart.y);
  assert.ok(
    fullDist < emptyDist * 0.7,
    `full ${fullDist} should be << empty ${emptyDist}`,
  );
}

// --- camp set / unload（荷下ろし）/ pick up ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  world.leader.pos = { x: 600, y: 400 };
  world.leader.salvagedCount = 2;
  world.salvaged = 2;
  assert.equal(world.camp, null);
  const set = setCampOrDeposit(world);
  assert.equal(set, "camp_set");
  assert.ok(world.camp);
  assert.equal(world.camp!.stashedCount, 2);
  assert.equal(world.leader.salvagedCount, 0);
  assert.equal(world.salvaged, 2); // accounting unchanged
  assert.ok(Math.abs(cargoSpeedMul(world.leader, world.balance) - 1) < 1e-9);

  // Far relocate denied while stash remains
  world.leader.pos = { x: 100, y: 100 };
  world.leader.salvagedCount = 1;
  world.salvaged = 3;
  assert.equal(setCampOrDeposit(world), "denied");
  assert.equal(unloadAtCamp(world), "denied"); // too far
  assert.equal(world.camp!.stashedCount, 2);

  // Return and pick up
  world.leader.pos = { ...world.camp!.pos };
  world.leader.salvagedCount = 0;
  const picked = pickUpFromCamp(world);
  assert.equal(picked, "picked");
  assert.equal(world.leader.salvagedCount, 2);
  assert.equal(world.camp!.stashedCount, 0);

  // C near existing camp does not deposit (use unload)
  assert.equal(setCampOrDeposit(world), "denied");
  assert.equal(world.leader.salvagedCount, 2);
  assert.equal(world.camp!.stashedCount, 0);

  // Explicit 小隊荷下ろし near camp — whole squad, including far wingman
  world.leader.salvagedCount = 2;
  const far = world.wingmen[0]!;
  far.alive = true;
  far.pos = { x: 50, y: 50 }; // far from camp
  far.salvagedCount = 3;
  world.salvaged = 5;
  assert.equal(unloadAtCamp(world), "unloaded");
  assert.equal(world.leader.salvagedCount, 0);
  assert.equal(far.salvagedCount, 0);
  assert.equal(world.camp!.stashedCount, 5);
  assert.ok(world.logs.some((l) => l.text.includes("小隊荷下ろし")));
  assert.ok(inCampAura(world, world.leader));
  assert.ok(campDamageTakenMul(world, world.leader) < 1);

  // Unload with no cargo denied
  assert.equal(unloadAtCamp(world), "denied");
}


// --- field containers: many more than the old ~6 cap ---
{
  const world = createWorld(bootstrapFromSearch(""));
  assert.ok(
    world.containers.length >= BALANCE.fieldContainerCount,
    `expected >= ${BALANCE.fieldContainerCount} field crates, got ${world.containers.length}`,
  );
  assert.equal(world.containers.length, BALANCE.fieldContainerCount);
  assert.ok(BALANCE.fieldContainerCount > 6);
  const ids = new Set(world.containers.map((c) => c.id));
  assert.equal(ids.size, world.containers.length);
}

// --- enemy death drops 0–2 at death site ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  const before = world.containers.length;
  const at = { x: 900, y: 400 };
  assert.equal(spawnEnemyDeathDrops(world, at, 0), 0);
  assert.equal(world.containers.length, before);
  assert.equal(spawnEnemyDeathDrops(world, at, 2), 2);
  assert.equal(world.containers.length, before + 2);
  const drops = world.containers.slice(-2);
  for (const c of drops) {
    assert.equal(c.taken, false);
    assert.equal(c.discovered, true);
    assert.ok(c.glowT > 0);
    assert.ok(Math.hypot(c.pos.x - at.x, c.pos.y - at.y) < 40);
  }
  assert.ok(world.logs.some((l) => l.text.includes("敵撃破ドロップ")));
  // Forced count clamps to enemyDeathDropMax
  assert.equal(spawnEnemyDeathDrops(world, at, 99), BALANCE.enemyDeathDropMax);
}

// --- purge: camp deposit + field drop ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  world.leader.pos = { x: 500, y: 500 };
  assert.equal(setCampOrDeposit(world), "camp_set");
  const campPos = { ...world.camp!.pos };

  // Wingman at camp deposits via purge
  const w0 = world.wingmen[0]!;
  w0.pos = { ...campPos };
  w0.salvagedCount = 2;
  world.salvaged = 2;
  // Wingman far from camp drops to field
  const w1 = world.wingmen[1]!;
  w1.pos = { x: 200, y: 200 };
  w1.salvagedCount = 1;
  world.salvaged = 3;
  const cratesBefore = world.containers.length;

  assert.equal(purgeCargo(world), "purged");
  assert.equal(w0.salvagedCount, 0);
  assert.equal(world.camp!.stashedCount, 2);
  assert.equal(w1.salvagedCount, 0);
  assert.equal(world.salvaged, 2); // field drop removed 1 from salvaged; camp deposit kept theirs
  assert.equal(world.containers.length, cratesBefore + 1);
  assert.ok(world.logs.some((l) => l.text.includes("パージ")));

  // No cargo → denied
  assert.equal(purgeCargo(world), "denied");
}

// --- boarding requirements HUD clarity ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  const idle = boardingRequirementsHud(world);
  assert.equal(idle.active, false);
  assert.ok(idle.lines.some((l) => l.includes("必須")));
  assert.ok(idle.mustBeIn.includes("隊長"));

  world.leader.pos = { x: 500, y: 500 };
  const w0 = world.wingmen[0]!;
  const w1 = world.wingmen[1]!;
  w0.pos = { x: 505, y: 505 };
  w1.pos = { x: 900, y: 900 };
  assert.ok(requestExtract(world));
  // Pin after request
  world.leader.pos = { x: 500, y: 500 };
  w0.pos = { x: 505, y: 505 };
  w1.pos = { x: 900, y: 900 };

  const hud = boardingRequirementsHud(world);
  assert.equal(hud.active, true);
  assert.ok(hud.liftOffEta != null && hud.liftOffEta > 14);
  assert.equal(hud.captainInside, true);
  assert.equal(hud.insideCount, 2);
  assert.equal(hud.outsideCount, 1);
  assert.deepEqual(hud.outsideNames, [w1.name]);
  assert.ok(hud.lines[0]!.includes("EXTRACT"));
  assert.ok(hud.lines.some((l) => l.includes("離昇まで")));
  assert.ok(hud.lines.some((l) => l.includes("必須") && l.includes("隊長")));
  assert.ok(hud.lines.some((l) => l.includes("円内") && l.includes("生存")));
}



// --- unlimited carry: salvaged beyond soft ref / former MAX ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  assert.equal(world.carrierCapacity, BALANCE.carrierCapacityUnlimited);
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  const crate = world.containers[0]!;
  crate.discovered = true;
  crate.taken = false;
  world.leader.pos = { ...crate.pos };
  world.leader.salvagedCount = BALANCE.cargoSpeedRefSlots + 3;
  world.salvaged = world.leader.salvagedCount;
  // Must still be able to channel another crate (no hard gate)
  for (let i = 0; i < 50; i++) {
    tickWorld(world, 0.1, {
      move: { x: 0, y: 0 },
      clickMove: null,
      fire: false,
      interact: true,
    });
    if (crate.taken) break;
  }
  assert.equal(crate.taken, true);
  assert.ok(world.leader.salvagedCount > BALANCE.cargoSpeedRefSlots + 3);
}

// --- escape-circle recovers ALL ground containers inside boarding circle ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  const pin = { x: 600, y: 500 };
  world.leader.pos = { ...pin };
  world.salvaged = 1;
  world.leader.salvagedCount = 1;
  // Park every crate far away first, then place exactly 3 inside the circle
  // but outside interactRadius so auto-salvage does not pick them up early.
  for (const c of world.containers) {
    c.discovered = true;
    c.taken = false;
    c.pos = { x: 40, y: 40 };
  }
  const inside = world.containers.slice(0, 3);
  const outside = world.containers[3]!;
  for (let i = 0; i < inside.length; i++) {
    // ~80 units from center: inside boardingRadius(110), outside interactRadius(28)
    inside[i]!.pos = { x: pin.x + 80, y: pin.y + i * 2 };
  }
  outside.pos = { x: 100, y: 100 };
  assert.ok(requestExtract(world));
  function advancePinnedLocal(dtBudget: number): void {
    let left = dtBudget;
    while (left > 1e-9 && world.phase === "sortie") {
      world.leader.pos = { ...pin };
      world.leader.moveTarget = null;
      for (const w of world.wingmen) {
        w.pos = { ...pin };
        w.moveTarget = null;
      }
      const dt = Math.min(0.05, left);
      tickWorld(world, dt, idleInput());
      left -= dt;
    }
  }
  advancePinnedLocal(world.balance.boardingLiftOffDelaySec + 0.1);
  assert.equal(world.phase, "result");
  assert.equal(world.extracted, true);
  for (const c of inside) assert.equal(c.taken, true);
  assert.equal(outside.taken, false);
  assert.equal(world.salvaged, 1 + inside.length);
  assert.ok(world.logs.some((l) => l.text.includes("搭乗円内コンテナ")));
}

// --- squad order applies to all living wingmen ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  assert.equal(applyOrderToAllWingmen(world, "raid"), world.wingmen.length);
  for (const w of world.wingmen) {
    assert.equal(w.stance, "raid");
  }
  world.wingmen[0]!.alive = false;
  assert.equal(applyOrderToAllWingmen(world, "escort"), 1);
  assert.equal(world.wingmen[1]!.stance, "escort");
}

// --- camp light-speed tip when empty in aura ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  world.leader.pos = { x: 400, y: 400 };
  assert.equal(setCampOrDeposit(world), "camp_set");
  world.camp!.stashedCount = 2;
  world.leader.salvagedCount = 0;
  world.leader.pos = { ...world.camp!.pos };
  assert.ok(inCampAura(world, world.leader));
  assert.ok(unitMoveSpeedMul(world.leader, world) > 1);
}


// --- operation timeout: lock move/cargo, no auto-fail, combat continues ---
{
  const world = createWorld(bootstrapFromSearch("?startingAmmo=40"));
  startSortie(world);
  // Keep one enemy alive near captain for combat; park others far.
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  const foe = world.enemies[0]!;
  foe.alive = true;
  foe.hp = foe.maxHp;
  world.leader.pos = { x: 400, y: 400 };
  foe.pos = { x: 410, y: 400 }; // in weapon range
  world.ammo = 40;
  world.leader.cooldown = 0;

  // Near-exhaust the clock then step over zero.
  world.timeLeft = 0.04;
  const posBefore = { ...world.leader.pos };
  tickWorld(world, 0.05, {
    move: { x: 1, y: 0 },
    clickMove: null,
    fire: true,
    interact: false,
  });
  assert.equal(world.phase, "sortie", "timer→0 must not end sortie");
  assert.equal(world.operationTimedOut, true);
  assert.equal(isOperationTimedOut(world), true);
  assert.equal(world.failReason, null);
  assert.equal(world.extracted, false);
  assert.ok(world.logs.some((l) => l.text.includes("時間切れ") && l.text.includes("戦闘は継続")));

  // Movement blocked after timeout
  const pinned = { ...world.leader.pos };
  for (let i = 0; i < 20; i++) {
    tickWorld(world, 0.05, {
      move: { x: 1, y: 0 },
      clickMove: { x: pinned.x + 200, y: pinned.y },
      fire: false,
      interact: false,
    });
  }
  assert.ok(
    Math.abs(world.leader.pos.x - pinned.x) < 0.5 &&
      Math.abs(world.leader.pos.y - pinned.y) < 0.5,
    "captain must not move after timeout",
  );
  assert.equal(world.phase, "sortie");

  // Cargo unload / load / purge / camp set denied
  world.camp = { pos: { ...world.leader.pos }, stashedCount: 2 };
  world.leader.salvagedCount = 3;
  world.salvaged = 5;
  assert.equal(unloadAtCamp(world), "denied");
  assert.equal(world.camp.stashedCount, 2);
  assert.equal(world.leader.salvagedCount, 3);
  assert.equal(pickUpFromCamp(world), "denied");
  assert.equal(world.camp.stashedCount, 2);
  assert.equal(purgeCargo(world), "denied");
  assert.equal(setCampOrDeposit(world), "denied");
  assert.equal(requestExtract(world), false);

  // Combat tick still runs (enemy may fire / bullets update / cooldowns tick)
  const ammoBefore = world.ammo;
  const foeHpBefore = foe.hp;
  world.leader.cooldown = 0;
  foe.cooldown = 0;
  for (let i = 0; i < 30; i++) {
    tickWorld(world, 0.05, {
      move: { x: 0, y: 0 },
      clickMove: null,
      fire: true,
      interact: false,
    });
  }
  assert.equal(world.phase, "sortie");
  assert.ok(
    world.ammo < ammoBefore || foe.hp < foeHpBefore || world.bullets.length > 0 ||
      world.combatHitsTaken > 0 ||
      !foe.alive,
    "combat must still progress after timeout",
  );
  void posBefore;
}

// --- timeout while boarding already active: lift-off can still succeed ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  world.leader.pos = { x: 600, y: 400 };
  for (const w of world.wingmen) w.pos = { x: 600, y: 400 };
  for (const c of world.containers) {
    c.pos = { x: 20, y: 20 };
  }
  world.salvaged = 1;
  assert.ok(requestExtract(world));
  // Expire clock mid-boarding; stay in circle.
  world.timeLeft = 0.02;
  const pin = () => {
    world.leader.pos = { x: 600, y: 400 };
    for (const w of world.wingmen) w.pos = { x: 600, y: 400 };
  };
  advancePinned(world, world.balance.boardingLiftOffDelaySec + 0.2, pin);
  assert.equal(world.operationTimedOut, true);
  assert.equal(world.phase, "result");
  assert.equal(world.extracted, true);
  assert.equal(world.failReason, null);
}

console.log("explore selftest: ok");

// --- forced engage browser-back wipe helper ---
import {
  ALL_DESTROYED_INTEL,
  resolveExploreForcedBackWipe,
  clearInvadeForcedLockAfterResolve,
wipeFleetAndBuildTradeUrl,
} from "./game/forcedBackWipe";
import {
  HUB_SAVE_STORAGE_KEY,
  INITIAL_HUB,
  createHubSave,
  createOwnedMech,
  deserializeHubSave,
  normalizeHubSnapshot,
  serializeHubSave,
  setFrontProgressInHub,
} from "@estg/shared";

{
  const map = new Map<string, string>();
  const storage = {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem(k: string) { return map.has(k) ? map.get(k)! : null; },
    key(i: number) { return [...map.keys()][i] ?? null; },
    removeItem(k: string) { map.delete(k); },
    setItem(k: string, v: string) { map.set(k, String(v)); },
  } as Storage;
  const fleet = [createOwnedMech("mech_gen1", { instanceId: "e1", durability: 70 })];
  storage.setItem(
    HUB_SAVE_STORAGE_KEY,
    serializeHubSave(createHubSave(normalizeHubSnapshot({ ...INITIAL_HUB, fleet }))),
  );
  const url = wipeFleetAndBuildTradeUrl(
    { sectorX: 1, sectorY: 2, density: 0.3, intelFlags: [] },
    "http://localhost:5175/",
    storage,
  );
  assert.ok(url.includes("allDestroyed") || url.includes(ALL_DESTROYED_INTEL));
  assert.ok(url.includes("returnKind=fail"));
  const saved = deserializeHubSave(storage.getItem(HUB_SAVE_STORAGE_KEY)!);
  assert.equal(saved!.hub.fleet[0]!.durability, 0);
  assert.equal(saved!.hub.fleet[0]!.status, "destroyed");

  const session = {
    getItem: () => "1",
    setItem() {},
    removeItem() {},
  } as Pick<Storage, "getItem" | "setItem" | "removeItem">;
  const suppressed = resolveExploreForcedBackWipe({
    sector: null,
    session,
    storage,
  });
  assert.equal(suppressed, null);
  console.log("explore forcedBackWipe helper ok");

{
  // wipe / resolve clear clears invade forced lock flag
  const map = new Map<string, string>();
  const storage = {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem(k: string) { return map.has(k) ? map.get(k)! : null; },
    key(i: number) { return [...map.keys()][i] ?? null; },
    removeItem(k: string) { map.delete(k); },
    setItem(k: string, v: string) { map.set(k, String(v)); },
  } as Storage;
  const fleet = [createOwnedMech("mech_gen1", { instanceId: "e2", durability: 60 })];
  let hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet });
  hub = setFrontProgressInHub(hub, {
    seed: 3,
    aoiHalf: 12,
    opened: [{ sx: 1, sy: 1 }],
    flagged: [],
    focus: { sx: 1, sy: 1 },
    hitMine: true,
  });
  storage.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(createHubSave(hub)));
  assert.equal(clearInvadeForcedLockAfterResolve(storage), true);
  const saved = deserializeHubSave(storage.getItem(HUB_SAVE_STORAGE_KEY)!);
  assert.equal(saved!.hub.frontProgress!.hitMine, false);
  assert.equal(saved!.hub.frontProgress!.opened.length, 1);
  assert.equal(clearInvadeForcedLockAfterResolve(storage), false);
  console.log("explore clearInvadeForcedLockAfterResolve ok");
}

}
