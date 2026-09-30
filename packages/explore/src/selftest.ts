/**
 * Explore behavior selftest — run via `npm run test -w @estg/explore`
 */
import assert from "node:assert/strict";
import { nextPatrolOrbitTarget, decideWingman } from "./game/brain";
import {
  applyOrder,
  applyOrderToAllWingmen,
  campDamageTakenMul,
  campDefenseHudModel,
  campDrHudFragment,
  campDrPercent,
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
  shotHitChance,
  spawnContainersAt,
  toggleSquadCover,
  unloadAtCamp,
  unitMoveSpeedMul,
} from "./game/orders";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import {
  boardingCargoEta,
  boardingElapsed,
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
import { EXPLORE_TUNABLES } from "./game/constants";
import {
  EXPLORE_SHORTCUTS,
  SHORTCUTS_HIDDEN_KEY,
  buildKeyboardShortcutsOverlayHtml,
  isShortcutsOverlayHidden,
  setShortcutsOverlayHidden,
} from "./game/keyboardOverlay";
import { DEFAULT_EXPEDITION_LOADOUT } from "@estg/shared";
import { getCoverObjects } from "./game/coverObjects";
import { leftBehindResultHtml, leftBehindResultLines } from "./game/leftBehind";
import { buildSortieOutcome, hubWearHandoffUrl, sortHandoffUrl, toExploreResult } from "./game/outcome";
import { invadeIntelBannerText } from "./game/invadeIntelBanner";
import {
  QUIRK_LABEL,
  quirkForWingmanIndex,
  type Unit,
} from "./game/types";

// --- Determinism (test-only) ---
// The explore sim uses Math.random for cover layout, patrol angles, hit rolls
// and death drops. Seed it here so every selftest run sees the same sequence.
// Production code is untouched: this only replaces Math.random inside the
// selftest process.
const SELFTEST_SEED = 0x5eed_e5c0;
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SELFTEST_SEED);

/**
 * Test-only fixed layout: drop any cover the unit at `pos` would snap into
 * (cover radius + unit radius + snap margin, with slack). Mutates the cached
 * layout array for this world only; cover rules themselves are unchanged.
 * Root cause of the old ~10% flake: a random cover within snap range pulled
 * the captain off the crate, out of salvage range.
 */
function clearCoverNear(world: ReturnType<typeof createWorld>, pos: { x: number; y: number }): void {
  const covers = getCoverObjects(world);
  const reach = (c: { radius: number }) => c.radius + world.leader.radius + 8 + 40;
  for (let i = covers.length - 1; i >= 0; i--) {
    const c = covers[i]!;
    if (Math.hypot(c.pos.x - pos.x, c.pos.y - pos.y) <= reach(c)) covers.splice(i, 1);
  }
  assert.ok(covers.every((c) => Math.hypot(c.pos.x - pos.x, c.pos.y - pos.y) > reach(c)));
}

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
  clearCoverNear(world, crate.pos);
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
  clearCoverNear(world, crate.pos);
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
  // Keep the straight test path free of cover so a snap can't skew distances.
  clearCoverNear(world, { x: 400, y: 500 });
  clearCoverNear(world, { x: 450, y: 500 });
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
  clearCoverNear(world, crate.pos);
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


// --- cover: hit chance modifiers + toggle stack rules ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  const shooter = world.leader;
  const target = world.enemies[0]!;
  target.alive = true;
  // Baseline uncovered → always-hit feel
  assert.equal(shotHitChance(shooter, target, world), 1);
  // Target cover only
  target.inCover = true;
  assert.ok(
    Math.abs(shotHitChance(shooter, target, world) - world.balance.coverIncomingHitMul) < 1e-9,
  );
  // Both cover: incoming × accuracy, clamped ≤ 1
  shooter.inCover = true;
  const both =
    world.balance.coverIncomingHitMul * world.balance.coverAccuracyMul;
  assert.ok(Math.abs(shotHitChance(shooter, target, world) - Math.min(1, both)) < 1e-9);
  // Shooter cover vs uncovered target: still 1 (accuracy clamped)
  target.inCover = false;
  assert.equal(shotHitChance(shooter, target, world), 1);
  shooter.inCover = false;

  // Squad toggle syncs living friendlies; works after timeout
  assert.equal(toggleSquadCover(world), "entered");
  assert.equal(world.leader.inCover, true);
  for (const w of world.wingmen) {
    if (w.alive) assert.equal(w.inCover, true);
  }
  assert.equal(toggleSquadCover(world), "exited");
  assert.equal(world.leader.inCover, false);

  world.operationTimedOut = true;
  world.timeLeft = 0;
  assert.equal(toggleSquadCover(world), "entered");
  assert.equal(world.leader.inCover, true);
  assert.ok(world.logs.some((l) => l.text.includes("カバー")));
}

// --- stocked camp DR always visible (HUD fragment + percent) ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  assert.equal(campDrHudFragment(world), "");
  world.camp = { pos: { ...world.leader.pos }, stashedCount: 0 };
  assert.equal(campDrHudFragment(world), "");
  world.camp.stashedCount = 3;
  const pct = campDrPercent(world);
  assert.equal(pct, Math.round((1 - world.balance.campDamageTakenMul) * 100));
  assert.equal(campDrHudFragment(world), `被弾−${pct}%`);
  assert.ok(pct > 0);
}

// --- timeout camp-defense HUD model ---
{
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  let model = campDefenseHudModel(world);
  assert.equal(model.active, false);

  world.timeLeft = 0;
  world.operationTimedOut = true;
  world.camp = { pos: { ...world.leader.pos }, stashedCount: 4 };
  model = campDefenseHudModel(world);
  assert.equal(model.active, true);
  assert.equal(model.title, "キャンプ防衛モード");
  assert.equal(model.drVisible, true);
  assert.equal(model.drPercent, campDrPercent(world));
  assert.ok(model.stockLine.includes(`被弾−${model.drPercent}%`));
  assert.ok(model.stockLine.includes("置場 4"));
  assert.ok(model.coverHint.includes("カバー"));

  world.leader.inCover = true;
  model = campDefenseHudModel(world);
  assert.ok(model.coverHint.includes("カバー中"));
}

// --- light wingman quirk assignment + raid bias ---
{
  const world = createWorld(bootstrapFromSearch("?deployableMechs=4"));
  assert.equal(quirkForWingmanIndex(0), "cling");
  assert.equal(quirkForWingmanIndex(1), "decoy");
  assert.equal(quirkForWingmanIndex(2), "sniper");
  assert.ok(world.wingmen.length >= 2);
  assert.equal(world.wingmen[0]!.quirk, "cling");
  assert.equal(world.wingmen[1]!.quirk, "decoy");
  assert.equal(QUIRK_LABEL.cling, "密着");

  startSortie(world);
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  // Place a live foe so raid stand-off differs by quirk
  const foe = world.enemies[0]!;
  foe.alive = true;
  foe.hp = foe.maxHp;
  foe.pos = { x: 500, y: 500 };
  const cling = world.wingmen[0]!;
  const decoy = world.wingmen[1]!;
  cling.stance = "raid";
  cling.waypoint = null;
  cling.pos = { x: 400, y: 500 };
  decoy.stance = "raid";
  decoy.waypoint = null;
  decoy.pos = { x: 400, y: 500 };
  world.leader.pos = { x: 300, y: 500 };

  const clingIntent = decideWingman(world, cling, 0.05);
  const decoyIntent = decideWingman(world, decoy, 0.05);
  assert.ok(clingIntent.moveTarget);
  assert.ok(decoyIntent.moveTarget);
  // Decoy rushes closer to foe (smaller stand-off) than cling's leader-biased post.
  const clingDist = Math.hypot(
    clingIntent.moveTarget!.x - foe.pos.x,
    clingIntent.moveTarget!.y - foe.pos.y,
  );
  const decoyDist = Math.hypot(
    decoyIntent.moveTarget!.x - foe.pos.x,
    decoyIntent.moveTarget!.y - foe.pos.y,
  );
  assert.ok(
    decoyDist < clingDist,
    `decoy should stand closer to foe than cling (${decoyDist} vs ${clingDist})`,
  );
}

// --- explore tunables constants aggregation (ISSUE-02) ---
{
  assert.equal(EXPLORE_TUNABLES.moveSpeed, BALANCE.moveSpeed);
  assert.equal(EXPLORE_TUNABLES.wingmanSpeed, BALANCE.wingmanSpeed);
  assert.equal(EXPLORE_TUNABLES.payloadPenalty, BALANCE.cargoSpeedMulMin);
  assert.equal(EXPLORE_TUNABLES.cargoSpeedMulMin, 0.45);
  assert.equal(EXPLORE_TUNABLES.weaponRange, BALANCE.weaponRange);
  assert.equal(EXPLORE_TUNABLES.engageRange, BALANCE.engageRange);
  assert.equal(EXPLORE_TUNABLES.visionRange, BALANCE.visionRange);
  assert.equal(EXPLORE_TUNABLES.startingAmmo, DEFAULT_EXPEDITION_LOADOUT.ammoStock);
  assert.equal(BALANCE.visionHuntMul, 1.25);
  assert.equal(BALANCE.recoverChannelFireMul, 0.7);
  assert.equal(BALANCE.waypointArriveDist, 24);
  assert.equal(BALANCE.bulletTtlSec, 1.2);
  assert.equal(BALANCE.wasdMoveLookahead, 40);
  console.log("explore tunables constants ok");
}

// --- keyboard shortcuts overlay (EXPLORE-01 / run-20260924-all-modules-001) ---
{
  const keysFlat = EXPLORE_SHORTCUTS.flatMap((r) => [...r.keys]).join(" ");
  assert.ok(keysFlat.includes("WASD"), "lists WASD");
  assert.ok(keysFlat.includes("Space"), "lists Space");
  assert.ok(keysFlat.includes("X"), "lists extract X");
  assert.ok(keysFlat.includes("C"), "lists camp C");
  // #120: cover became object-based; the global V toggle is no longer listed.
  assert.ok(!keysFlat.includes("V"), "no legacy cover V");
  assert.ok(!keysFlat.includes("Q"), "no unused Q");
  assert.ok(!keysFlat.includes("Z"), "no unused Z");

  const html = buildKeyboardShortcutsOverlayHtml({ hidden: false });
  assert.ok(html.includes('id="kb-overlay"'), "overlay root");
  assert.ok(html.includes("<kbd>WASD</kbd>"), "WASD kbd");
  assert.ok(html.includes("<kbd>Space</kbd>"), "Space kbd");
  assert.ok(html.includes("<kbd>X</kbd>"), "X kbd");
  assert.ok(html.includes("抽出要請"), "extract label JA");
  assert.ok(html.includes("kb-overlay-toggle"), "toggle control");

  const collapsed = buildKeyboardShortcutsOverlayHtml({ hidden: true });
  assert.ok(collapsed.includes("collapsed"), "collapsed class");
  assert.ok(collapsed.includes(">キー<"), "show chip JA");
  assert.ok(!collapsed.includes("<kbd>"), "no key rows when hidden");

  const map = new Map<string, string>();
  const store = {
    getItem(k: string) { return map.has(k) ? map.get(k)! : null; },
    setItem(k: string, v: string) { map.set(k, String(v)); },
  };
  assert.equal(isShortcutsOverlayHidden(store), false);
  setShortcutsOverlayHidden(true, store);
  assert.equal(store.getItem(SHORTCUTS_HIDDEN_KEY), "1");
  assert.equal(isShortcutsOverlayHidden(store), true);
  setShortcutsOverlayHidden(false, store);
  assert.equal(isShortcutsOverlayHidden(store), false);
  console.log("explore keyboard shortcuts overlay ok");
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

// --- wingman off-screen combat UX warn timers ---
{
  const world = createWorld(bootstrapFromSearch("?deployableMechs=3&startingAmmo=40"));
  startSortie(world);
  const w = world.wingmen[0]!;
  assert.equal(w.hitWarnT, 0);
  assert.equal(w.engageWarnT, 0);

  // Simulate engage intent path: fire at nearby foe
  for (const e of world.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  const foe = world.enemies[0]!;
  foe.alive = true;
  foe.hp = foe.maxHp;
  w.pos = { ...world.leader.pos };
  foe.pos = {
    x: w.pos.x + world.balance.weaponRange * 0.4,
    y: w.pos.y,
  };
  w.stance = "raid";
  w.waypoint = null;
  w.cooldown = 0;
  tickWorld(world, 0.05, {
    move: { x: 0, y: 0 },
    clickMove: null,
    fire: false,
    interact: false,
  });
  assert.ok(
    w.engageWarnT > 0,
    `expected engageWarnT after combat tick, got ${w.engageWarnT}`,
  );

  // Hit-warn arm + decay (deterministic; skip RNG cover miss path)
  w.hitWarnT = world.balance.wingHitWarnSec;
  w.engageWarnT = world.balance.wingEngageWarnSec;
  const hitBefore = w.hitWarnT;
  const engBefore = w.engageWarnT;
  // Clear foes so engage intent does not re-arm engageWarnT
  foe.alive = false;
  foe.hp = 0;
  w.stance = "escort";
  tickWorld(world, 0.5, {
    move: { x: 0, y: 0 },
    clickMove: null,
    fire: false,
    interact: false,
  });
  assert.ok(w.hitWarnT < hitBefore, "hitWarnT should decay");
  assert.ok(w.hitWarnT > 0, "hitWarnT should still be active after 0.5s");
  assert.ok(w.engageWarnT < engBefore, "engageWarnT should decay");
  console.log("explore wingman offscreen combat UX warn ok");
}

}

// ---------------------------------------------------------------------------
// Circuit command unlock foundation (game/commandUnlock.ts, game/commands.ts,
// game/unlockMode.ts). Provisional table below is TEST-ONLY — not game design.
// ---------------------------------------------------------------------------
import {
  BASIC_COMMAND_IDS,
  CIRCUIT_COMMAND_UNLOCKS,
  EXPLORE_COMMANDS,
  isCommandUnlocked,
  isCommandUnlockedFor,
  isWingmanMobilityUnlocked,
  isWingmanMobileFor,
  type CircuitCommandUnlockTable,
  type CommandUnlockMode,
  type ExploreCommandId,
} from "./game/commandUnlock";
import {
  commandRequestForKey,
  dispatchExploreKey,
  executeExploreCommand,
} from "./game/commands";
import {
  COMMAND_UNLOCK_MODE_STORAGE_KEY,
  EXPLORE_RELEASE_LOCKS,
  isDebugUnlockToggleVisible,
  parseReleaseLocksFlag,
  readDebugCommandUnlockMode,
  resolveCommandUnlockMode,
  writeDebugCommandUnlockMode,
} from "./game/unlockMode";

const TEST_ONLY_TABLE: CircuitCommandUnlockTable = {
  "test-circuit-camp": ["camp_set", "camp_unload", "camp_pickup"],
  "test-circuit-squad": ["wing_escort", "wing_patrol", "wing_recover", "wing_raid", "scatter_search", "purge"],
};
const CIRCUIT_IDS = EXPLORE_COMMANDS.filter((d) => d.tier === "circuit").map((d) => d.id);

function unlockWorld(mode: CommandUnlockMode, equipped: string[] = [], table?: CircuitCommandUnlockTable) {
  const w = createWorld(bootstrapFromSearch(""));
  startSortie(w);
  const equippedByUnit = {
    leader: [...equipped],
    "wing-a": [...equipped],
    "wing-b": [...equipped],
  };
  w.commandUnlock = { mode, equippedByUnit, ...(table ? { table } : {}) };
  return w;
}

// Pure check
{
  assert.deepEqual([...BASIC_COMMAND_IDS].sort(), ["abort", "collect", "extract", "fire", "move"]);
  assert.deepEqual(Object.keys(CIRCUIT_COMMAND_UNLOCKS), [], "production mapping stays empty (Phase 3)");
  for (const id of BASIC_COMMAND_IDS) {
    assert.equal(isCommandUnlocked(id, []), true, `basic ${id} on w/o circuits`);
    assert.equal(isCommandUnlocked(id, null, { mode: "release" }), true);
    assert.equal(isCommandUnlocked(id, [], { mode: "all_unlocked" }), true);
  }
  for (const id of CIRCUIT_IDS) {
    assert.equal(isCommandUnlocked(id, []), false, `${id} locked w/o circuit (release)`);
    assert.equal(isCommandUnlocked(id, ["unknown-circuit"], { table: TEST_ONLY_TABLE }), false);
    assert.equal(isCommandUnlocked(id, ["test-circuit-camp"]), false, `${id} not unlocked by empty prod table`);
    assert.equal(isCommandUnlocked(id, [], { mode: "all_unlocked" }), true, `${id} on in all_unlocked`);
  }
  assert.equal(isCommandUnlocked("camp_set", ["test-circuit-camp"], { table: TEST_ONLY_TABLE }), true);
  assert.equal(isCommandUnlocked("purge", ["test-circuit-camp"], { table: TEST_ONLY_TABLE }), false);
  assert.equal(isCommandUnlocked("purge", ["test-circuit-camp", "test-circuit-squad"], { table: TEST_ONLY_TABLE }), true);
  assert.equal(isCommandUnlocked("camp_set", ["__proto__", "toString"], { table: TEST_ONLY_TABLE }), false);
  assert.equal(isCommandUnlockedFor({}, "camp_set"), true, "missing state → legacy all unlocked");
  console.log("explore command unlock pure check ok");
}

// Mode resolution / flag / debug storage
{
  assert.equal(EXPLORE_RELEASE_LOCKS, false, "no build flag under node → preview default");
  assert.equal(parseReleaseLocksFlag(undefined), false);
  assert.equal(parseReleaseLocksFlag("0"), false);
  assert.equal(parseReleaseLocksFlag("1"), true);
  assert.equal(parseReleaseLocksFlag("TRUE"), true);
  assert.equal(isDebugUnlockToggleVisible(false), true);
  assert.equal(isDebugUnlockToggleVisible(true), false, "release build hides debug toggle");
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.equal(resolveCommandUnlockMode({ releaseLocks: false, store }), "all_unlocked", "preview default all unlocked");
  writeDebugCommandUnlockMode("release", store);
  assert.equal(mem.get(COMMAND_UNLOCK_MODE_STORAGE_KEY), "release");
  assert.equal(readDebugCommandUnlockMode(store), "release");
  assert.equal(resolveCommandUnlockMode({ releaseLocks: false, store }), "release", "debug choice persists");
  writeDebugCommandUnlockMode("all_unlocked", store);
  assert.equal(resolveCommandUnlockMode({ releaseLocks: false, store }), "all_unlocked");
  assert.equal(resolveCommandUnlockMode({ releaseLocks: true, store }), "release", "release build always locks");
  mem.set(COMMAND_UNLOCK_MODE_STORAGE_KEY, "garbage");
  assert.equal(readDebugCommandUnlockMode(store), "all_unlocked");
  assert.equal(resolveCommandUnlockMode({ releaseLocks: false, store: null }), "all_unlocked");
  const fresh = createWorld(bootstrapFromSearch(""));
  assert.equal(fresh.commandUnlock.mode, "all_unlocked", "new world in preview/test = all unlocked");
  assert.deepEqual(fresh.commandUnlock.equippedByUnit, {}, "no circuit equip source yet");
  assert.equal(fresh.wingmen.length, 2, "wingmen still deploy in every mode");
  console.log("explore command unlock mode resolution ok");
}

// Execution side — all_unlocked: everything runs as before
{
  const w = unlockWorld("all_unlocked");
  assert.equal(executeExploreCommand(w, { id: "camp_set" }).status, "done");
  assert.ok(w.camp, "camp set in all_unlocked");
  assert.equal(executeExploreCommand(w, { id: "wing_patrol" }).status, "done");
  assert.ok(w.wingmen.every((x) => x.stance === "patrol"));
  assert.equal(executeExploreCommand(w, { id: "wing_escort", wingId: w.wingmen[0]!.id, rally: true }).status, "done");
  assert.equal(w.wingmen[0]!.stance, "escort");
  assert.equal(executeExploreCommand(w, { id: "scatter_search" }).status, "done");
  assert.equal(executeExploreCommand(w, { id: "purge" }).status, "done");
  assert.equal(executeExploreCommand(w, { id: "camp_pickup" }).status, "done");
  assert.equal(executeExploreCommand(w, { id: "camp_unload" }).status, "done");
  const k = dispatchExploreKey(w, "4");
  assert.equal(k?.status, "done");
  assert.ok(w.wingmen.every((x) => x.stance === "raid"), "key 4 raid in all_unlocked");
  assert.equal(dispatchExploreKey(w, "2", { repeat: true }), null, "squad key repeat ignored (unchanged)");
  assert.equal(executeExploreCommand(w, { id: "extract" }).status, "done");
  assert.ok(w.boarding, "extract runs");
  console.log("explore command unlock all_unlocked execution ok");
}

// Execution side — release mode, no circuits: circuit tier blocked (buttons + keys), world unchanged
{
  const w = unlockWorld("release");
  const stances = w.wingmen.map((x) => x.stance);
  for (const id of ["camp_set", "camp_unload", "camp_pickup", "purge", "scatter_search"] as const) {
    const r = executeExploreCommand(w, { id });
    assert.equal(r.status, "locked", `${id} locked`);
  }
  assert.equal(w.camp, null, "camp not set when locked");
  for (const id of ["wing_escort", "wing_patrol", "wing_recover", "wing_raid"] as const) {
    assert.equal(executeExploreCommand(w, { id }).status, "locked");
    assert.equal(executeExploreCommand(w, { id, wingId: w.wingmen[0]!.id }).status, "locked");
  }
  assert.equal(executeExploreCommand(w, { id: "wing_escort", wingId: w.wingmen[0]!.id, rally: true }).status, "locked", "召還 locked");
  assert.deepEqual(w.wingmen.map((x) => x.stance), stances, "stances unchanged when locked");
  // Key input path
  for (const key of ["c", "u", "g", "p", "1", "2", "3", "4"]) {
    const r = dispatchExploreKey(w, key);
    assert.equal(r?.status, "locked", `key ${key} blocked in release`);
  }
  assert.equal(w.camp, null);
  assert.ok(w.logs.some((l) => l.text.includes("🔒")), "lock message logged");
  const lockLogs = w.logs.filter((l) => l.text.includes("🔒 キャンプ設置")).length;
  dispatchExploreKey(w, "c");
  dispatchExploreKey(w, "c");
  assert.equal(w.logs.filter((l) => l.text.includes("🔒 キャンプ設置")).length, lockLogs + 1, "repeat lock log deduped");
  assert.equal(commandRequestForKey("v"), null, "V cover not a command (object-based cover)");
  assert.equal(commandRequestForKey("?"), null, "overlay toggle out of scope");
  // Basic 4 still work in release w/o circuits
  const startX = w.leader.pos.x;
  tickWorld(w, 0.2, { move: { x: 1, y: 0 }, clickMove: null, fire: false, interact: false });
  assert.ok(w.leader.pos.x > startX, "move works in release");
  const foe = w.enemies.find((e) => e.alive)!;
  foe.pos = { x: w.leader.pos.x + w.balance.weaponRange * 0.5, y: w.leader.pos.y };
  w.leader.cooldown = 0;
  const ammo0 = w.ammo;
  tickWorld(w, 0.02, { move: { x: 0, y: 0 }, clickMove: null, fire: true, interact: false });
  assert.ok(w.ammo < ammo0, "fire works in release");
  foe.alive = false;
  const crate = w.containers[0]!;
  crate.discovered = true;
  crate.taken = false;
  crate.pos = { ...w.leader.pos };
  const salv0 = w.salvaged;
  for (let t = 0; t < w.balance.salvageSeconds + 0.5; t += 0.05) {
    tickWorld(w, 0.05, { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: true });
  }
  assert.ok(w.salvaged > salv0, "collect works in release");
  const ex = dispatchExploreKey(w, "x");
  assert.equal(ex?.status, "done", "X extract works in release");
  assert.ok(w.boarding, "boarding requested in release");
  const ab = executeExploreCommand(w, { id: "abort" });
  assert.equal(ab.status, "done", "abort works in release");
  assert.equal(w.phase, "result");
  console.log("explore command unlock release (no circuit) execution ok");
}

// Execution side — release mode WITH provisional test circuit: gate opens only listed commands
{
  const w = unlockWorld("release", ["test-circuit-camp"], TEST_ONLY_TABLE);
  assert.equal(dispatchExploreKey(w, "c")?.status, "done", "key C unlocked by test circuit");
  assert.ok(w.camp, "camp set via unlocked key");
  assert.equal(executeExploreCommand(w, { id: "camp_unload" }).status, "done");
  assert.equal(executeExploreCommand(w, { id: "purge" }).status, "locked", "purge still locked (not in row)");
  assert.equal(dispatchExploreKey(w, "3")?.status, "locked");
  for (const unitId of ["leader", "wing-a", "wing-b"] as const) {
    w.commandUnlock.equippedByUnit[unitId]!.push("test-circuit-squad");
  }
  assert.equal(dispatchExploreKey(w, "4")?.status, "done");
  assert.ok(w.wingmen.every((x) => x.stance === "raid"), "squad key unlocked by second test circuit");
  assert.equal(executeExploreCommand(w, { id: "scatter_search" }).status, "done");
  // Switching mode at runtime (debug toggle) takes effect immediately on execution
  const w2 = unlockWorld("release");
  assert.equal(executeExploreCommand(w2, { id: "camp_set" }).status, "locked");
  w2.commandUnlock.mode = "all_unlocked";
  assert.equal(executeExploreCommand(w2, { id: "camp_set" }).status, "done");
  console.log("explore command unlock provisional circuit execution ok");
}

// UI: keyboard overlay marks locked rows only when locked
{
  const all = unlockWorld("all_unlocked");
  const rel = unlockWorld("release");
  const htmlAll = buildKeyboardShortcutsOverlayHtml({ hidden: false, isLocked: (id: ExploreCommandId) => !isCommandUnlockedFor(all, id) });
  const htmlRel = buildKeyboardShortcutsOverlayHtml({ hidden: false, isLocked: (id: ExploreCommandId) => !isCommandUnlockedFor(rel, id) });
  assert.ok(!htmlAll.includes("🔒"), "no lock marks in all_unlocked");
  assert.ok(htmlRel.includes("🔒 キャンプ"), "camp row locked in release");
  assert.ok(htmlRel.includes("🔒 僚機方針"), "squad row locked in release");
  assert.ok(!htmlRel.includes("🔒 移動") && !htmlRel.includes("🔒 射撃") && !htmlRel.includes("🔒 抽出要請"), "basic rows never locked");
  console.log("explore command unlock overlay ok");
}

// ---------------------------------------------------------------------------
// Implementation E: handoff → per-unit circuit judgement.
// ---------------------------------------------------------------------------
{
  const boot = bootstrapFromSearch(
    "?deployedInstanceIds=cap,wingA,wingB&mechCircuits=cap~cap-fa*fa*8,cap-off*off*9;wingA~wingA-by*by*3,wingA-un*un*7;wingB~wingB-un*un*5",
  );
  assert.deepEqual(boot.equippedByUnit, {
    leader: ["cap-fa"],
    "wing-a": ["wingA-by"],
  }, "only FA / Bypass circuits become active per unit");
  const w = createWorld(boot);
  startSortie(w);
  const table: CircuitCommandUnlockTable = {
    "cap-fa": ["camp_set"],
    "wingA-by": ["wing_patrol", "wing_mobility"],
    "wingB-un": ["wing_raid"],
  };
  w.commandUnlock = {
    mode: "release",
    equippedByUnit: boot.equippedByUnit,
    table,
  };

  assert.equal(executeExploreCommand(w, { id: "camp_set" }).status, "done", "captain uses captain circuit");
  assert.equal(executeExploreCommand(w, { id: "purge" }).status, "locked", "captain cannot use wing-only circuit");
  const wingA = w.wingmen[0]!;
  const wingB = w.wingmen[1]!;
  wingA.stance = "escort";
  wingB.stance = "escort";
  assert.equal(
    executeExploreCommand(w, { id: "wing_patrol", wingId: wingA.id }).status,
    "done",
    "wing A uses its own Bypass circuit",
  );
  assert.equal(
    executeExploreCommand(w, { id: "wing_patrol", wingId: wingB.id }).status,
    "locked",
    "wing B cannot use wing A circuit",
  );
  assert.equal(executeExploreCommand(w, { id: "wing_patrol" }).status, "done", "squad policy runs for an unlocked wing");
  assert.equal(wingA.stance, "patrol");
  assert.equal(wingB.stance, "escort", "unlocked squad policy excludes locked wing");
  assert.equal(isWingmanMobileFor(w, wingA.id), true);
  assert.equal(isWingmanMobileFor(w, wingB.id), false, "unrestored/offline are inactive");
  assert.equal(isCommandUnlockedFor(w, "wing_raid"), false, "inactive wing circuit does not unlock policy");
  console.log("explore implementation E per-unit circuit judgement ok");
}

// ---------------------------------------------------------------------------
// mechCircuits omitted: preserve the existing no-handoff behavior.
// ---------------------------------------------------------------------------
{
  const w = createWorld(bootstrapFromSearch("?deployedInstanceIds=cap,wingA,wingB"));
  assert.deepEqual(w.commandUnlock.equippedByUnit, {});
  assert.equal(isCommandUnlockedFor(w, "camp_set"), true, "preview legacy URL remains unlocked");
  assert.equal(isWingmanMobileFor(w, "wing-a"), true, "legacy URL keeps wing mobility behavior");
}

// ---------------------------------------------------------------------------
// wing_mobility: no-circuit wingmen in release mode stand still + self-defense.
// ---------------------------------------------------------------------------
{
  const MOBILITY_TABLE: CircuitCommandUnlockTable = { "test-circuit-mobility": ["wing_mobility"] };
  // Pure check (per-wingman id signature; same result for all wingmen today)
  assert.equal(isWingmanMobilityUnlocked("wing-a", [], { mode: "release" }), false);
  assert.equal(isWingmanMobilityUnlocked("wing-b", [], { mode: "release" }), false);
  assert.equal(isWingmanMobilityUnlocked("wing-a", [], { mode: "all_unlocked" }), true);
  assert.equal(isWingmanMobilityUnlocked("wing-a", ["test-circuit-mobility"], { mode: "release" }), false, "empty prod table");
  assert.equal(isWingmanMobilityUnlocked("wing-a", ["test-circuit-mobility"], { mode: "release", table: MOBILITY_TABLE }), true);
  assert.equal(isWingmanMobilityUnlocked("wing-b", ["test-circuit-mobility"], { mode: "release", table: MOBILITY_TABLE }), true);
  assert.equal(isWingmanMobilityUnlocked("wing-a", ["test-circuit-camp"], { mode: "release", table: TEST_ONLY_TABLE }), false);
  assert.equal(isWingmanMobileFor({}, "wing-a"), true, "missing state → mobile (legacy)");

  const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };
  const clearFoes = (w: ReturnType<typeof createWorld>) => { for (const e of w.enemies) { e.alive = false; e.hp = 0; } };

  // all_unlocked: escort wingman follows the captain (unchanged behavior)
  {
    const w = unlockWorld("all_unlocked");
    clearFoes(w);
    const wa = w.wingmen[0]!;
    const start = { ...wa.pos };
    for (let i = 0; i < 20; i++) tickWorld(w, 0.05, { ...idle, move: { x: 1, y: 0 } });
    assert.ok(Math.hypot(wa.pos.x - start.x, wa.pos.y - start.y) > 5, "mobile wingman follows in all_unlocked");
  }

  // release, no circuit: wingmen accompany but do not move / follow / collect
  {
    const w = unlockWorld("release");
    assert.equal(w.wingmen.length, 2, "wingmen still accompany in release");
    clearFoes(w);
    const starts = w.wingmen.map((x) => ({ ...x.pos }));
    for (let i = 0; i < 40; i++) tickWorld(w, 0.05, { ...idle, move: { x: 1, y: 0 } });
    w.wingmen.forEach((x, i) => {
      assert.deepEqual(x.pos, starts[i], `${x.id} stays at sortie start`);
      assert.deepEqual(x.vel, { x: 0, y: 0 });
    });
    assert.ok(w.leader.pos.x > starts[0]!.x + 20, "captain still moves");
    // stance forced to every value: still no movement
    for (const st of ["escort", "patrol", "recover", "raid"] as const) {
      const wa = w.wingmen[0]!;
      wa.stance = st;
      const intent = decideWingman(w, wa, 0.05);
      assert.equal(intent.moveTarget, null, `${st}: no move target`);
      assert.equal(intent.trySalvage, false, `${st}: no collect`);
    }
    // no collecting even with a discovered crate on top of it
    const wa = w.wingmen[0]!;
    wa.stance = "recover";
    const crate = w.containers[1]!;
    crate.discovered = true; crate.taken = false; crate.pos = { ...wa.pos };
    for (let t = 0; t < w.balance.salvageSeconds + 0.5; t += 0.05) tickWorld(w, 0.05, idle);
    assert.equal(crate.taken, false, "immobile wingman does not collect");
    assert.equal(wa.salvagedCount, 0);
  }

  // release, no circuit: self-defense — shoots in-range enemy, never chases
  {
    const w = unlockWorld("release");
    clearFoes(w);
    const wa = w.wingmen[0]!;
    w.leader.pos = { x: wa.pos.x + 600, y: wa.pos.y }; // keep captain out of it
    const foe = w.enemies[0]!;
    foe.alive = true; foe.hp = foe.maxHp;
    foe.pos = { x: wa.pos.x + w.balance.weaponRange * 0.6, y: wa.pos.y };
    wa.cooldown = 0;
    const start = { ...wa.pos };
    const ammo0 = w.ammo;
    const intent = decideWingman(w, wa, 0.05);
    assert.equal(intent.fireAt?.id, foe.id, "targets in-range enemy");
    tickWorld(w, 0.02, idle);
    assert.ok(w.ammo < ammo0, "immobile wingman fires in self-defense");
    assert.ok(w.bullets.some((b) => b.ownerId === wa.id) || w.ammo < ammo0);
    assert.deepEqual(wa.pos, start, "fires from where it stands");
    // enemy beyond weapon range (but within hunt vision): no fire, no chase
    foe.pos = { x: wa.pos.x + w.balance.weaponRange * 1.6, y: wa.pos.y };
    const far = decideWingman(w, wa, 0.05);
    assert.equal(far.fireAt, null, "no fire beyond weapon range");
    assert.equal(far.moveTarget, null, "no chase");
    const mobileWorld = unlockWorld("all_unlocked");
    const mw = mobileWorld.wingmen[0]!;
    mw.stance = "raid";
    clearFoes(mobileWorld);
    const mfoe = mobileWorld.enemies[0]!;
    mfoe.alive = true; mfoe.hp = mfoe.maxHp;
    mfoe.pos = { x: mw.pos.x + mobileWorld.balance.weaponRange * 1.6, y: mw.pos.y };
    assert.ok(decideWingman(mobileWorld, mw, 0.05).moveTarget != null, "mobile raid wingman does chase (unchanged)");
  }

  // provisional test-only circuit unlocks mobility in release
  {
    const w = unlockWorld("release", ["test-circuit-mobility"], MOBILITY_TABLE);
    clearFoes(w);
    const wa = w.wingmen[0]!;
    const start = { ...wa.pos };
    for (let i = 0; i < 20; i++) tickWorld(w, 0.05, { ...idle, move: { x: 1, y: 0 } });
    assert.ok(Math.hypot(wa.pos.x - start.x, wa.pos.y - start.y) > 5, "test circuit unlocks wingman movement");
    assert.equal(executeExploreCommand(w, { id: "wing_patrol" }).status, "locked", "stance commands remain separately locked");
  }

  // mid-sortie mode switch applies immediately; release aborts an in-progress salvage
  {
    const w = unlockWorld("all_unlocked");
    clearFoes(w);
    const wa = w.wingmen[0]!;
    wa.salvageId = w.containers[2]!.id;
    wa.salvageT = 0.5;
    w.commandUnlock.mode = "release";
    const start = { ...wa.pos };
    tickWorld(w, 0.05, { ...idle, move: { x: 1, y: 0 } });
    assert.equal(wa.salvageId, null, "switch to release aborts salvage channel");
    assert.deepEqual(wa.pos, start, "stops immediately");
    w.commandUnlock.mode = "all_unlocked";
    for (let i = 0; i < 20; i++) tickWorld(w, 0.05, { ...idle, move: { x: 1, y: 0 } });
    assert.ok(Math.hypot(wa.pos.x - start.x, wa.pos.y - start.y) > 5, "switch back → moves again");
  }

  // Extraction under EXISTING rules: immobile wingmen outside the circle are left behind;
  // outputs keep their shape (flat returnKind wear for every deployed id).
  {
    const w = createWorld(bootstrapFromSearch("?deployedInstanceIds=m1,m2,m3&deployableMechs=3&startingAmmo=30"));
    startSortie(w);
    w.commandUnlock = { mode: "release", equippedByUnit: {} };
    clearFoes(w);
    w.leader.pos = { x: w.leader.pos.x + 400, y: w.leader.pos.y };
    assert.equal(executeExploreCommand(w, { id: "extract" }).status, "done");
    for (let t = 0; t < w.balance.boardingLiftOffDelaySec + 1 && w.phase === "sortie"; t += 0.1) tickWorld(w, 0.1, idle);
    assert.equal(w.phase, "result");
    assert.equal(w.extracted, true, "captain extracts");
    assert.ok(w.logs.some((l) => l.text.startsWith("置き去り：")), "wingmen left behind by existing rule");
    const outcome = buildSortieOutcome(w)!;
    assert.deepEqual(outcome.mechWear.map((m) => m.instanceId), ["m1", "m2", "m3"], "wear shape unchanged");
    assert.ok(hubWearHandoffUrl(w)!.includes("returnKind=extract"));
  }
  console.log("explore wing_mobility gate ok");
}

// ---------------------------------------------------------------------------
// Left-behind wingmen: one result-screen line each (display only).
// No rescue / wreck recovery; handoff + Hub outputs keep their shape.
// ---------------------------------------------------------------------------
{
  const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };
  const QS = "?deployedInstanceIds=m1,m2,m3&deployableMechs=3&startingAmmo=30";
  const MOBILITY_TABLE: CircuitCommandUnlockTable = { "test-circuit-mobility": ["wing_mobility"] };
  const setup = (mode: "release" | "all_unlocked", circuits: string[] = [], table?: CircuitCommandUnlockTable) => {
    const w = createWorld(bootstrapFromSearch(QS));
    startSortie(w);
    w.commandUnlock = {
      mode,
      equippedByUnit: {
        leader: [...circuits],
        "wing-a": [...circuits],
        "wing-b": [...circuits],
      },
      ...(table ? { table } : {}),
    };
    for (const e of w.enemies) { e.alive = false; e.hp = 0; }
    return w;
  };
  /** Run the existing extract flow; `beforeLiftOff` runs on the last tick before lift-off. */
  const extract = (w: ReturnType<typeof createWorld>, beforeLiftOff?: () => void) => {
    assert.equal(executeExploreCommand(w, { id: "extract" }).status, "done");
    const dt = 0.1;
    for (let t = 0; t < w.balance.boardingLiftOffDelaySec + 1 && w.phase === "sortie"; t += dt) {
      if (beforeLiftOff && w.balance.boardingLiftOffDelaySec - boardingElapsed(w) <= dt * 1.5) {
        beforeLiftOff();
        beforeLiftOff = undefined;
      }
      tickWorld(w, dt, idle);
    }
    assert.equal(w.phase, "result");
  };
  const noLeak = (w: ReturnType<typeof createWorld>) => {
    const res = JSON.stringify(toExploreResult(w));
    const out = JSON.stringify(buildSortieOutcome(w));
    for (const blob of [res, out, hubWearHandoffUrl(w) ?? "", sortHandoffUrl(w)]) {
      assert.ok(!blob.includes("leftBehind") && !blob.includes("置き去り") && !blob.includes("no_circuit"), "left-behind stays explore-internal");
    }
    assert.deepEqual(buildSortieOutcome(w)!.mechWear.map((m) => m.instanceId), ["m1", "m2", "m3"], "wear shape unchanged");
  };

  // (1) release, no circuit: immobile wingmen outside the circle → "回路なし" lines
  {
    const w = setup("release");
    w.leader.pos = { x: w.leader.pos.x + 400, y: w.leader.pos.y };
    extract(w);
    assert.equal(w.extracted, true);
    assert.deepEqual(w.leftBehind, [
      { id: w.wingmen[0]!.id, name: "僚機A", reason: "no_circuit" },
      { id: w.wingmen[1]!.id, name: "僚機B", reason: "no_circuit" },
    ]);
    assert.deepEqual(leftBehindResultLines(w), [
      "僚機Aを置き去り（回路なし・搭乗円の外）",
      "僚機Bを置き去り（回路なし・搭乗円の外）",
    ]);
    const html = leftBehindResultHtml(w);
    assert.ok(html.includes('id="result-left-behind"') && (html.match(/<li>/g) ?? []).length === 2);
    noLeak(w);
  }

  // (1b) release, no circuit, but one immobile wingman happens to be inside → only the other listed
  {
    const w = setup("release");
    w.leader.pos = { x: w.leader.pos.x + 400, y: w.leader.pos.y };
    w.wingmen[1]!.pos = { x: w.leader.pos.x + 20, y: w.leader.pos.y };
    extract(w);
    assert.deepEqual(leftBehindResultLines(w), ["僚機Aを置き去り（回路なし・搭乗円の外）"]);
  }

  // (2) circuit present (mobile), but outside the circle at lift-off → plain "搭乗円の外"
  for (const [label, w] of [
    ["release+test circuit", setup("release", ["test-circuit-mobility"], MOBILITY_TABLE)],
    ["all_unlocked", setup("all_unlocked")],
  ] as const) {
    const wa = w.wingmen[0]!;
    extract(w, () => { wa.pos = { x: w.leader.pos.x + 600, y: w.leader.pos.y }; });
    assert.equal(w.extracted, true, label);
    assert.deepEqual(w.leftBehind, [{ id: wa.id, name: "僚機A", reason: "outside_circle" }], label);
    const lines = leftBehindResultLines(w);
    assert.deepEqual(lines, ["僚機Aを置き去り（搭乗円の外）"], label);
    assert.ok(!lines[0]!.includes("回路なし"), `${label}: distinguished from no-circuit`);
    noLeak(w);
  }

  // (3) nobody left behind → no line, no fragment
  {
    const w = setup("all_unlocked");
    extract(w);
    assert.equal(w.extracted, true);
    assert.deepEqual(w.leftBehind, []);
    assert.deepEqual(leftBehindResultLines(w), []);
    assert.equal(leftBehindResultHtml(w), "");
    noLeak(w);
    // a new sortie clears any previous record
    w.leftBehind = [{ id: "x", name: "僚機A", reason: "no_circuit" }];
    startSortie(w);
    assert.deepEqual(w.leftBehind, []);
  }

  // (4) abort (existing rule, not a lift-off) → no line
  {
    const w = setup("release");
    w.leader.pos = { x: w.leader.pos.x + 400, y: w.leader.pos.y };
    assert.equal(executeExploreCommand(w, { id: "abort" }).status, "done");
    assert.equal(w.phase, "result");
    assert.deepEqual(leftBehindResultLines(w), []);
    assert.equal(leftBehindResultHtml({}), "", "missing field → no line");
  }
  console.log("explore left-behind result line ok");
}
