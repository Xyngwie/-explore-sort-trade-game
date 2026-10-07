/**
 * Explore behavior selftest — run via `npm run test -w @estg/explore`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPhaseWatcher } from "./game/phaseWatch";
import * as shared from "@estg/shared";
import { saveSortieResultToHub } from "./game/hubDirectSave";
import { hubForResortie, resortiePlan, resortieSearch } from "./game/resortie";
import { nextPatrolOrbitTarget, decideWingman } from "./game/brain";
import {
  HOLD_LABEL_JA,
  LOCKED_ORDER_STOP_CHANCE,
  QUESTION_COLOR,
  QUESTION_FONT,
  QUESTION_MARK_SEC,
  questionAlpha,
  reactToLockedOrder,
  setLockedOrderRng,
  wingStanceTagJa,
} from "./game/lockedOrder";
// C20-b: existing tests keep the old no-op behaviour of orders a wingman cannot
// follow ("ignore"); the C20-b block injects its own deterministic rolls.
setLockedOrderRng(() => 0.99);
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
import {
  DEFAULT_EXPEDITION_LOADOUT,
  MECH_AMMO_BASE_CAPACITY,
  buildTradeToExplorePayloadFromFleet,
  buildTradeToExploreUrl,
  createOwnedMech,
  parseExploreToHubWearSearch,
} from "@estg/shared";
import { getCoverObjects } from "./game/coverObjects";
import { leftBehindResultHtml, leftBehindResultLines } from "./game/leftBehind";
import { attachLostMechContext, recoverStrandedAtLiftOff, sortieLocationFor, strandedMechsFor, STRANDED_RING_RADIUS } from "./game/lostMechs";
import { recoverStrandedDropsAtLiftOff, recoveredCircuitResultHtml, recoveredCircuitResultLines, strandedDropsFor, STRANDED_DROP_RING_RADIUS } from "./game/circuitDrops";
import { invadeSquadSearch } from "./game/invadeSquad";
import { buildSortieOutcome, exploreReturnPayload, hubWearHandoffUrl, returnKindFromWorld, sortHandoffUrl, toExploreResult, wreckCircuitResultHtml, wreckCircuitResultLines } from "./game/outcome";
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

// --- per-mech current ammo: canonical instanceId state, no shared-ammo fallback ---
{
  const world = createWorld(
    bootstrapFromSearch(
      "?deployableMechs=3&startingAmmo=99&deployedInstanceIds=owned_a,owned_b,owned_c&mechCurrentAmmo=owned_a:10;owned_b:20;owned_c:28",
    ),
  );
  assert.deepEqual(world.currentAmmo, { owned_a: 10, owned_b: 20, owned_c: 28 });
  assert.equal(world.ammoStock, 99);

  startSortie(world);
  for (const w of world.wingmen) w.alive = false;
  const enemy = world.enemies[0]!;
  enemy.alive = true;
  enemy.pos = { x: world.leader.pos.x + world.balance.weaponRange * 0.5, y: world.leader.pos.y };
  const beforeB = world.currentAmmo.owned_b;
  const beforeC = world.currentAmmo.owned_c;
  tickWorld(world, 0.05, idleInput());
  assert.equal(world.currentAmmo.owned_a, 9, "only firing mech A should consume one round");
  assert.equal(world.currentAmmo.owned_b, beforeB, "mech B ammo must not change");
  assert.equal(world.currentAmmo.owned_c, beforeC, "mech C ammo must not change");
  assert.equal(world.ammoStock, 99, "shared ammoStock must not be consumed by firing");
}

// --- unset currentAmmo sorties full (interim rule, pending 神宮's economy decision) ---
// Every deployed unit (leader + wingmen) must be able to fire at an in-range enemy.
function assertEveryDeployedUnitFires(search: string, label: string): void {
  const probe = createWorld(bootstrapFromSearch(search));
  const unitIds = [probe.leader.id, ...probe.wingmen.map((w) => w.id)];
  assert.equal(unitIds.length, probe.deployedInstanceIds.length, `${label}: one unit per deployed mech`);
  for (const unitId of unitIds) {
    const world = createWorld(bootstrapFromSearch(search));
    startSortie(world);
    const units = [world.leader, ...world.wingmen];
    const shooter = units.find((u) => u.id === unitId)!;
    const instanceId = shooter.instanceId!;
    assert.ok(instanceId, `${label}: ${unitId} has an instanceId`);
    // Keep everyone else out of the exchange.
    for (const other of units) {
      if (other.id !== unitId) other.pos = { x: shooter.pos.x + 5000, y: shooter.pos.y + 5000 };
    }
    for (const e of world.enemies) e.alive = false;
    const foe = world.enemies[0]!;
    foe.alive = true;
    foe.hp = foe.maxHp;
    foe.pos = { x: shooter.pos.x + world.balance.weaponRange * 0.5, y: shooter.pos.y };
    shooter.cooldown = 0;
    const ammo0 = world.currentAmmo[instanceId];
    assert.equal(ammo0, MECH_AMMO_BASE_CAPACITY, `${label}: ${unitId} sorties full`);
    tickWorld(world, 0.02, idleInput());
    assert.ok(
      world.bullets.some((b) => !b.fromEnemy && b.ownerId === unitId),
      `${label}: ${unitId} fires at an in-range enemy`,
    );
    assert.equal(world.currentAmmo[instanceId], ammo0! - 1, `${label}: ${unitId} spends one round`);
  }
}

{
  // Exact deploy URL emitted by trade's buildDeployUrl on main d6ca6ff for a
  // 3-mech fleet without currentAmmo (no mechCurrentAmmo key).
  const tradeD6ca6ffFixture =
    "?deployableMechs=3&mechBattery=owned_a%3A300%3A300%3Bowned_b%3A300%3A300%3Bowned_c%3A300%3A300" +
    "&startingAmmo=20&deployedInstanceIds=owned_a%2Cowned_b%2Cowned_c" +
    "&mechDurability=owned_a%3A100%3Bowned_b%3A100%3Bowned_c%3A100";
  const world = createWorld(bootstrapFromSearch(tradeD6ca6ffFixture));
  assert.deepEqual(world.currentAmmo, { owned_a: 28, owned_b: 28, owned_c: 28 });
  assert.equal(world.ammoStock, 20, "startingAmmo stays the shared stock only");
  assertEveryDeployedUnitFires(tradeD6ca6ffFixture, "trade d6ca6ff fixture");

  // Same path through the shared builders trade's buildDeployUrl uses.
  const fleet = [
    createOwnedMech("mech_gen1", { instanceId: "owned_x" }),
    createOwnedMech("mech_gen2", { instanceId: "owned_y" }),
    createOwnedMech("mech_gen1", { instanceId: "owned_z" }),
  ];
  const built = buildTradeToExploreUrl(
    buildTradeToExplorePayloadFromFleet(fleet, 40, ["owned_x", "owned_y", "owned_z"]),
    "https://example.invalid/explore/",
  );
  const builtSearch = new URL(built).search;
  assert.ok(!builtSearch.includes("mechCurrentAmmo"), "fleet without currentAmmo emits no mechCurrentAmmo");
  assertEveryDeployedUnitFires(builtSearch, "shared builder");
}

// --- given currentAmmo is used as-is; only unset mechs are filled ---
{
  const world = createWorld(
    bootstrapFromSearch(
      "?deployedInstanceIds=owned_a,owned_b,owned_c&mechCurrentAmmo=owned_a:5;owned_c:0&startingAmmo=40",
    ),
  );
  assert.deepEqual(world.currentAmmo, { owned_a: 5, owned_b: MECH_AMMO_BASE_CAPACITY, owned_c: 0 });
}

// --- zero currentAmmo rejects firing without borrowing from ammoStock ---
{
  const world = createWorld(
    bootstrapFromSearch("?deployedInstanceIds=owned_a&mechCurrentAmmo=owned_a:0&startingAmmo=40"),
  );
  assert.equal(world.currentAmmo.owned_a, 0);
  startSortie(world);
  const enemy = world.enemies[0]!;
  enemy.alive = true;
  enemy.pos = { x: world.leader.pos.x + world.balance.weaponRange * 0.5, y: world.leader.pos.y };
  const leaderBulletCountBefore = world.bullets.filter(
    (b) => !b.fromEnemy && b.ownerId === world.leader.id,
  ).length;
  tickWorld(world, 0.05, idleInput());
  const leaderBulletCountAfter = world.bullets.filter(
    (b) => !b.fromEnemy && b.ownerId === world.leader.id,
  ).length;
  assert.equal(world.currentAmmo.owned_a, 0);
  assert.equal(
    leaderBulletCountAfter,
    leaderBulletCountBefore,
    "zero CurrentAmmo leader must not generate a bullet",
  );
  assert.equal(world.ammoStock, 40);
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
  const world = createWorld(bootstrapFromSearch("?deployedInstanceIds=owned_a&mechCurrentAmmo=owned_a:30&startingAmmo=999"));
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
  const ammoBefore = world.currentAmmo.owned_a;
  const bulletsBefore = world.bullets.length;
  // fire: false — auto reaction should still shoot
  tickWorld(world, 0.05, {
    move: { x: 0, y: 0 },
    clickMove: null,
    fire: false,
    interact: false,
  });
  assert.ok(
    world.currentAmmo.owned_a! < ammoBefore! || world.bullets.length > bulletsBefore,
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
    bootstrapFromSearch("?deployedInstanceIds=owned_a,owned_b&startingAmmo=20&mechCurrentAmmo=owned_a:17;owned_b:9"),
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
  assert.deepEqual(outcome!.mechCurrentAmmo, [
    { instanceId: "owned_a", currentAmmo: 17 },
    { instanceId: "owned_b", currentAmmo: 9 },
  ]);
  const wearUrl = hubWearHandoffUrl(world);
  assert.ok(wearUrl && wearUrl.includes("returnKind=extract"));
  assert.ok(wearUrl!.includes("mechWear="));
  assert.ok(wearUrl!.includes("mechCurrentAmmo="));
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
  assert.ok(world.logs.some((l) => l.text.includes("帰還成功")));
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
  assert.equal(hud.lines[0], "帰還要件");
  assert.ok(hud.lines.every((l) => !l.includes("EXTRACT")), "no English EXTRACT in the HUD");
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
  const world = createWorld(bootstrapFromSearch("?deployedInstanceIds=owned_a&mechCurrentAmmo=owned_a:40&startingAmmo=999"));
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
  const ammoBefore = world.currentAmmo.owned_a;
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
    world.currentAmmo.owned_a! < ammoBefore! || foe.hp < foeHpBefore || world.bullets.length > 0 ||
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
  assert.ok(html.includes("帰還要請"), "extract label JA");
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

// --- return SortieReport: severe damage is a retained, non-deployable wreck ---
{
  const world = createWorld(
    bootstrapFromSearch(
      "?deployedInstanceIds=owned_wreck&startingAmmo=10&mechDurability=owned_wreck:20",
    ),
  );
  startSortie(world);
  world.phase = "result";
  world.extracted = false;
  world.failReason = "timeout";
  const url = hubWearHandoffUrl(world)!;
  assert.ok(url.includes("sortieId="));
  assert.ok(url.includes("wreckedMechInstanceIds="));
}

// --- lostMechs: missing Battery snapshot is omitted; no fabricated 300/300 fallback ---
{
  const world = createWorld(
    bootstrapFromSearch(
      "?deployedInstanceIds=lost_leader,lost_wing_a,lost_wing_b&deployableMechs=3&startingAmmo=30&mechBattery=lost_leader:300:300;lost_wing_a:300:212;lost_wing_b:300:180",
    ),
  );
  startSortie(world);
  const leftBehind = world.wingmen[0]!;
  world.leftBehind = [
    { id: leftBehind.id, name: leftBehind.name, reason: "outside_circle" },
  ];
  delete world.mechBattery[leftBehind.instanceId!];
  world.phase = "result";
  world.extracted = true;

  const returnPayload = parseExploreToHubWearSearch(new URL(hubWearHandoffUrl(world)!).search);
  assert.ok(returnPayload);
  assert.equal(
    returnPayload!.lostMechs,
    undefined,
    "lostMech without a real Battery snapshot must be omitted",
  );
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
  "test-circuit-squad": ["wing_escort", "wing_patrol", "wing_recover", "wing_raid", "scatter_search", "purge", "wing_mobility"],
  // C20-a: the four squad stances without wing_mobility (they stay locked).
  "test-circuit-stances-only": ["wing_escort", "wing_patrol", "wing_recover", "wing_raid"],
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
  const w = createWorld(bootstrapFromSearch("?deployedInstanceIds=release_leader,release_wing_a,release_wing_b&deployableMechs=3&startingAmmo=40"));
  startSortie(w);
  w.commandUnlock = { mode: "release", equippedByUnit: {} };
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
  // Key input path — C20-a (2026-10-07 神宮): a locked key does nothing and logs nothing.
  const logsBeforeKeys = w.logs.length;
  for (const key of ["c", "u", "g", "p", "1", "2", "3", "4"]) {
    const r = dispatchExploreKey(w, key);
    assert.equal(r, null, `key ${key} does nothing in release`);
  }
  assert.equal(w.camp, null);
  assert.equal(w.logs.length, logsBeforeKeys, "locked keys add no log line");
  assert.ok(!w.logs.some((l) => l.text.includes("🔒") || l.text.includes("ロック中")), "no lock message logged (commands or keys)");
  assert.deepEqual(w.wingmen.map((x) => x.stance), stances, "stances unchanged after locked keys");
  assert.equal(commandRequestForKey("v"), null, "V cover not a command (object-based cover)");
  assert.equal(commandRequestForKey("?"), null, "overlay toggle out of scope");
  // Basic 4 still work in release w/o circuits
  const startX = w.leader.pos.x;
  tickWorld(w, 0.2, { move: { x: 1, y: 0 }, clickMove: null, fire: false, interact: false });
  assert.ok(w.leader.pos.x > startX, "move works in release");
  const foe = w.enemies.find((e) => e.alive)!;
  foe.pos = { x: w.leader.pos.x + w.balance.weaponRange * 0.5, y: w.leader.pos.y };
  w.leader.cooldown = 0;
  const leaderInstanceId = w.deployedInstanceIds[0];
  assert.ok(leaderInstanceId, "release fixture must have a leader instanceId");
  w.currentAmmo[leaderInstanceId] = 28;
  const ammo0 = w.currentAmmo[leaderInstanceId];
  tickWorld(w, 0.02, { move: { x: 0, y: 0 }, clickMove: null, fire: true, interact: false });
  assert.ok(w.currentAmmo[leaderInstanceId]! < ammo0!, "fire works in release");
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
  assert.equal(dispatchExploreKey(w, "3"), null, "locked key 3 does nothing");
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

// C20-a (2026-10-07 神宮): 帯同・哨戒・回収・遊撃・召還 need wing_mobility on the
// same wingman; the squad-level check counts only alive wingmen; nothing is logged.
{
  const w = unlockWorld("release", ["test-circuit-stances-only"], TEST_ONLY_TABLE);
  const [wa, wb] = [w.wingmen[0]!, w.wingmen[1]!];
  assert.equal(wa.id, "wing-a");
  assert.equal(wb.id, "wing-b");
  const SQUAD = ["wing_escort", "wing_patrol", "wing_recover", "wing_raid"] as const;
  for (const id of SQUAD) {
    assert.equal(isCommandUnlockedFor(w, id), false, `${id}: stance circuit without mobility stays locked (squad)`);
    assert.equal(isCommandUnlockedFor(w, id, wa.id), false, `${id}: stance circuit without mobility stays locked (wing)`);
  }
  const logs0 = w.logs.length;
  assert.equal(executeExploreCommand(w, { id: "wing_escort", wingId: wa.id, rally: true }).status, "locked", "召還 needs mobility");
  assert.equal(executeExploreCommand(w, { id: "wing_recover", wingId: wa.id }).status, "locked", "回収 needs mobility");
  assert.equal(w.logs.length, logs0, "locked commands log nothing");
  // wing A gets mobility (+ stances) → A only
  w.commandUnlock.equippedByUnit["wing-a"]!.push("test-circuit-squad");
  for (const id of SQUAD) {
    assert.equal(isCommandUnlockedFor(w, id, wa.id), true, `${id}: unlocked for mobile wing A`);
    assert.equal(isCommandUnlockedFor(w, id, wb.id), false, `${id}: still locked for immobile wing B`);
    assert.equal(isCommandUnlockedFor(w, id), true, `${id}: squad-level open via alive wing A`);
  }
  // mixed squad order: main's behaviour (A applies, B silently unchanged), no lock-ish line
  wb.stance = "escort";
  const logs1 = w.logs.length;
  assert.equal(executeExploreCommand(w, { id: "wing_patrol" }).status, "done");
  assert.equal(wa.stance, "patrol");
  assert.equal(wb.stance, "escort", "locked wing B unchanged");
  const added = w.logs.slice(0, w.logs.length - logs1).map((l) => l.text);
  assert.ok(added.some((t) => t.startsWith(`${wa.name}：哨戒`)), "A keeps its own line");
  assert.ok(!added.some((t) => /🔒|ロック|未解放|対象外|回路/.test(t)), `no lock wording: ${JSON.stringify(added)}`);
  // only ALIVE wingmen count for the squad-level check
  wa.alive = false;
  for (const id of SQUAD) assert.equal(isCommandUnlockedFor(w, id), false, `${id}: dead wing A no longer opens the squad order`);
  const logs2 = w.logs.length;
  assert.equal(dispatchExploreKey(w, "2"), null, "key 2 does nothing once the only unlocked wing is dead");
  assert.equal(executeExploreCommand(w, { id: "wing_patrol" }).status, "locked");
  assert.equal(w.logs.length, logs2, "nothing logged");
  // holders without wingmen keep the circuit-list fallback
  assert.equal(isCommandUnlockedFor({ commandUnlock: w.commandUnlock }, "wing_patrol"), true, "no wingmen → circuit lists");
  console.log("explore C20-a mobility prerequisite + alive-only squad check ok");
}

// C20-b (2026-10-07 神宮): a mixed squad given a squad policy — the wingmen that
// cannot follow show 「？」 and roll 50/50 stop (hold) / ignore, rerolled on every
// order. Nothing is logged. Individual orders / 召還 keep it as an API safety net.
{
  const w = unlockWorld("release", [], TEST_ONLY_TABLE);
  w.commandUnlock.equippedByUnit["wing-a"] = ["test-circuit-squad"]; // stances + mobility
  w.commandUnlock.equippedByUnit["wing-b"] = [];
  const [wa, wb] = [w.wingmen[0]!, w.wingmen[1]!];
  const texts = () => w.logs.map((l) => l.text);
  const STOP = () => LOCKED_ORDER_STOP_CHANCE - 1e-9;
  const IGNORE = () => LOCKED_ORDER_STOP_CHANCE; // boundary = ignore
  const seq = (values: number[]) => {
    let i = 0;
    return { rng: () => values[i++ % values.length]!, calls: () => i };
  };
  // reactToLockedOrder directly
  assert.equal(reactToLockedOrder(w, wb, IGNORE), "ignore");
  assert.equal(wb.holdOrder ?? false, false, "ignore keeps the current action");
  assert.equal(wb.questionT, QUESTION_MARK_SEC, "「？」 on ignore too");
  assert.equal(reactToLockedOrder(w, wb, STOP), "stop");
  assert.equal(wb.holdOrder, true);
  assert.equal(reactToLockedOrder(w, wb, IGNORE), "ignore");
  assert.equal(wb.holdOrder, true, "another order it cannot follow does not clear a hold");
  assert.equal(isWingmanMobileFor(w, wb.id), false, "wing B is immobile");
  assert.equal(reactToLockedOrder(w, wb, STOP), "stop", "immobile wingmen still roll");
  assert.equal(reactToLockedOrder(w, w.leader, STOP), "none", "leader never reacts");
  wb.holdOrder = false;

  // squad policy to the mixed squad: A obeys, B reacts; one roll per order, no log
  const s1 = seq([0.1, 0.9, 0.2, 0.7]);
  setLockedOrderRng(s1.rng);
  const logs0 = w.logs.length;
  const holds: boolean[] = [];
  for (let k = 0; k < 4; k++) {
    wb.holdOrder = false; wb.questionT = 0; wa.questionT = 0;
    const before = w.logs.length;
    assert.equal(executeExploreCommand(w, { id: "wing_patrol" }).status, "done");
    holds.push(wb.holdOrder === true);
    assert.equal(wb.questionT, QUESTION_MARK_SEC, "「？」 on the wingman that cannot follow");
    assert.equal(wa.questionT, 0, "no 「？」 on the wingman that obeys");
    assert.equal(wa.holdOrder ?? false, false);
    assert.equal(wa.stance, "patrol");
    const added = texts().slice(0, w.logs.length - before);
    assert.deepEqual(added.map((t) => t.split("：")[0]), [wa.name], `only A's own line: ${JSON.stringify(added)}`);
  }
  assert.equal(s1.calls(), 4, "rerolled on every order, even the same order repeated");
  assert.deepEqual(holds, [true, false, true, false]);
  assert.equal(w.logs.length, logs0 + 4, "one line per order (A's), nothing for B");
  assert.ok(!texts().some((t) => /対象外|未解放|🔒|ロック|停止|無視/.test(t)), "no exempt / lock / stop / ignore wording");
  // the squad key path does the same
  setLockedOrderRng(STOP);
  wb.holdOrder = false;
  assert.equal(dispatchExploreKey(w, "4")?.status, "done");
  assert.equal(wa.stance, "raid");
  assert.equal(wb.holdOrder, true, "key 4 → B reacts");
  // dead wingmen do not react
  wb.questionT = 0; wb.alive = false;
  executeExploreCommand(w, { id: "wing_escort" });
  assert.equal(wb.questionT, 0, "dead wingman: no 「？」");
  wb.alive = true;
  // individual order / 召還 (API safety net, not reachable from the UI): react, no log
  const logs1 = w.logs.length;
  wb.holdOrder = false; wb.questionT = 0;
  assert.equal(executeExploreCommand(w, { id: "wing_patrol", wingId: wb.id }).status, "locked");
  assert.equal(wb.holdOrder, true);
  assert.equal(wb.questionT, QUESTION_MARK_SEC);
  wb.holdOrder = false;
  assert.equal(executeExploreCommand(w, { id: "wing_escort", wingId: wb.id, rally: true }).status, "locked");
  assert.equal(wb.holdOrder, true, "召還 reacts too");
  assert.equal(w.logs.length, logs1, "individual / 召還: no log");
  // no wingman can follow → nothing happens (bar / keys are hidden in the UI)
  wa.alive = false;
  wb.holdOrder = false; wb.questionT = 0;
  assert.equal(executeExploreCommand(w, { id: "wing_patrol" }).status, "locked");
  assert.equal(wb.questionT, 0, "all locked: no 「？」");
  assert.equal(wb.holdOrder, false, "all locked: no roll");
  wa.alive = true;
  // all_unlocked: nobody reacts
  w.commandUnlock.mode = "all_unlocked";
  wb.questionT = 0;
  executeExploreCommand(w, { id: "wing_escort" });
  assert.equal(wb.questionT, 0, "all_unlocked: no 「？」");
  w.commandUnlock.mode = "release";
  setLockedOrderRng(() => 0.99);

  // hold = stop in place, shoot only enemies in weapon range (mobile wing A)
  assert.ok(w.enemies.length > 0, "fixture has enemies");
  const saved = w.enemies.map((e) => ({ e, pos: { ...e.pos }, alive: e.alive }));
  for (const e of w.enemies) e.alive = false;
  const foe = w.enemies[0]!;
  foe.alive = true;
  foe.pos = { x: wa.pos.x + w.balance.weaponRange * 1.3, y: wa.pos.y };
  wa.holdOrder = true;
  let intent = decideWingman(w, wa, 0.05);
  assert.equal(intent.moveTarget, null, "hold: no movement");
  assert.equal(intent.fireAt, null, "hold: no chase / fire beyond weapon range");
  assert.equal(intent.trySalvage, false, "hold: no salvage");
  foe.pos = { x: wa.pos.x + w.balance.weaponRange * 0.5, y: wa.pos.y };
  intent = decideWingman(w, wa, 0.05);
  assert.equal(intent.moveTarget, null);
  assert.equal(intent.fireAt, foe, "hold: shoots an enemy in range");
  for (const r of saved) { r.e.pos = r.pos; r.e.alive = r.alive; }
  // the next order clears the hold: individual / 召還 / squad / 散開捜索 / 帰還要請
  assert.equal(executeExploreCommand(w, { id: "wing_escort", wingId: wa.id }).status, "done");
  assert.equal(wa.holdOrder, false, "individual order clears hold");
  wa.holdOrder = true; rallyWingman(w, wa);
  assert.equal(wa.holdOrder, false, "召還 clears hold");
  wa.holdOrder = true; executeExploreCommand(w, { id: "wing_patrol" });
  assert.equal(wa.holdOrder, false, "squad policy clears hold");
  wa.holdOrder = true; wb.holdOrder = true;
  assert.equal(scatterSearch(w), "applied");
  assert.equal(wa.holdOrder, false, "散開捜索 clears hold");
  assert.equal(wb.holdOrder, false, "散開捜索 clears hold (immobile too)");
  // 「？」 fades over 1.5 s via tickWorld
  wb.questionT = QUESTION_MARK_SEC;
  assert.equal(questionAlpha(wb), 1);
  tickWorld(w, 0.05, idleInput());
  assert.ok(Math.abs((wb.questionT ?? 0) - (QUESTION_MARK_SEC - 0.05)) < 1e-9, "questionT decays");
  assert.ok(Math.abs(questionAlpha({ questionT: 0.75 }) - 0.5) < 1e-9);
  assert.equal(questionAlpha({ questionT: 0 }), 0);
  assert.equal(questionAlpha({}), 0);
  assert.equal(QUESTION_COLOR, "#9ecbff");
  assert.equal(QUESTION_FONT, "bold 16px sans-serif");
  // map label while holding: 「僚機A·待機」
  assert.equal(HOLD_LABEL_JA, "待機");
  assert.equal(wingStanceTagJa({ holdOrder: true }, "帯同"), "待機");
  assert.equal(wingStanceTagJa({ holdOrder: false }, "帯同"), "帯同");
  assert.equal(wingStanceTagJa({}, "哨戒"), "哨戒");
  // 帰還要請 (requestExtract) reassigns every alive wingman via applyOrder → clears holds
  wa.holdOrder = true; wb.holdOrder = true;
  if (requestExtract(w)) {
    assert.equal(wa.holdOrder, false, "帰還要請 clears hold");
    assert.equal(wb.holdOrder, false, "帰還要請 clears hold (immobile too)");
  } else {
    assert.fail("requestExtract should start in this fixture");
  }
  console.log("explore C20-b mixed squad 「？」 reaction ok");
}

// UI: keyboard overlay marks locked rows only when locked
{
  const all = unlockWorld("all_unlocked");
  const rel = unlockWorld("release");
  const htmlAll = buildKeyboardShortcutsOverlayHtml({ hidden: false, isLocked: (id: ExploreCommandId) => !isCommandUnlockedFor(all, id) });
  const htmlRel = buildKeyboardShortcutsOverlayHtml({ hidden: false, isLocked: (id: ExploreCommandId) => !isCommandUnlockedFor(rel, id) });
  // C20-a (2026-10-07 神宮): locked rows are not shown at all.
  assert.ok(!htmlAll.includes("🔒") && !htmlRel.includes("🔒"), "no lock marks in either mode");
  assert.equal(htmlAll, buildKeyboardShortcutsOverlayHtml({ hidden: false }), "all_unlocked overlay unchanged");
  for (const label of ["キャンプ", "荷下ろし", "積込", "パージ", "僚機方針"]) {
    assert.ok(htmlAll.includes(`>${label}<`), `${label} row in all_unlocked`);
    assert.ok(!htmlRel.includes(`>${label}<`), `${label} row hidden in release`);
  }
  assert.ok(htmlAll.includes("<kbd>1–4</kbd>"));
  for (const label of ["移動", "射撃", "回収（任意）", "帰還要請", "この表示"]) {
    assert.ok(htmlRel.includes(`>${label}<`), `basic row ${label} always shown`);
  }
  // partly unlocked squad row lists only the unlocked keys
  const part = unlockWorld("release", ["test-circuit-part"], {
    "test-circuit-part": ["wing_patrol", "wing_raid", "wing_mobility"],
  });
  const htmlPart = buildKeyboardShortcutsOverlayHtml({ hidden: false, isLocked: (id: ExploreCommandId) => !isCommandUnlockedFor(part, id) });
  assert.ok(htmlPart.includes("<kbd>2</kbd><kbd>4</kbd></span><span class=\"kb-label\">僚機方針<"), `partial squad keys: ${htmlPart}`);
  console.log("explore command unlock overlay ok");
}

// Camp texts follow the camp command (2026-10-07 神宮): camp locked → no 「キャンプ」
// text (top HUD status, help sentence, time-up banner = just 「時間切れ」, briefing
// help keys). Camp unlocked (all_unlocked) → the same texts as before.
import {
  briefingHelpText,
  campHudText,
  isCampUnlocked,
  timeUpHelpSentence,
  timeoutLockBannerHtmlFor,
} from "./game/campVisibility";
{
  const rel = unlockWorld("release");
  const all = unlockWorld("all_unlocked");
  const relLocked = (id: ExploreCommandId) => !isCommandUnlockedFor(rel, id);
  const allLocked = (id: ExploreCommandId) => !isCommandUnlockedFor(all, id);
  assert.equal(isCampUnlocked(relLocked), false, "release, no circuit → camp locked");
  assert.equal(isCampUnlocked(allLocked), true);
  // equipping a circuit that unlocks camp_set (test-only table) shows camp again
  const campOn = unlockWorld("release", ["test-camp"], { "test-camp": ["camp_set"] });
  assert.equal(isCampUnlocked((id) => !isCommandUnlockedFor(campOn, id)), true, "camp unlocked by circuit");

  // (1) top HUD status
  assert.equal(campHudText(rel, false), null, "no camp HUD item when locked");
  assert.equal(campHudText(all, true), "キャンプ 未設置", "unlocked: unchanged 「キャンプ 未設置」");
  // (2) help sentence
  assert.equal(timeUpHelpSentence(false), "");
  assert.equal(timeUpHelpSentence(true), "時間切れ後はキャンプ防衛フォーカス（移動ロック・戦闘継続）。");
  // briefing help: camp keys only while unlocked; all-unlocked text is the old line (wording aside)
  assert.equal(
    briefingHelpText(allLocked),
    "WASD 移動 · クリック移動 · Space/F 射撃 · 発見コンテナ上で自動回収（E 任意） · X 帰還要請 · C キャンプ設置 · U 荷下ろし · G キャンプから積込 · V カバー · 右パネルで僚機命令（画面外も可）",
  );
  assert.ok(!briefingHelpText(relLocked).includes("キャンプ"), "release briefing help: no camp");
  assert.ok(briefingHelpText(relLocked).includes("X 帰還要請"));
  // (3) time-up banner
  assert.equal(timeoutLockBannerHtmlFor(rel, false), "", "no banner before time-up");
  rel.operationTimedOut = true;
  all.operationTimedOut = true;
  const relBanner = timeoutLockBannerHtmlFor(rel, false);
  const relText = relBanner.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  assert.equal(relText, "時間切れ", `camp locked: banner shows just 時間切れ: ${relBanner}`);
  assert.ok(relBanner.includes('id="timeout-lock-banner"'));
  const allBanner = timeoutLockBannerHtmlFor(all, true);
  assert.ok(allBanner.includes("<strong>キャンプ防衛モード</strong>"), "unlocked: title unchanged");
  assert.ok(allBanner.includes("時間切れ · 移動・積み下ろしロック · 戦闘継続"));
  assert.ok(allBanner.includes("キャンプ未設置 — その場でカバーし戦闘決着を目指せ"));
  assert.ok(allBanner.includes("円外なら移動不可のため新規の帰還要請は不可 — キャンプ防衛／カバー／撤退で決着。"));
  // a camp-locked sortie that times out shows no camp text anywhere in these strings
  for (const t of [campHudText(rel, false) ?? "", timeUpHelpSentence(false), relBanner, briefingHelpText(relLocked)]) {
    assert.ok(!t.includes("キャンプ"), `no キャンプ: ${t}`);
  }
  console.log("explore camp texts follow camp unlock ok");
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
    const w = createWorld(
      bootstrapFromSearch(
        "?deployedInstanceIds=selfdef_leader,selfdef_wing_a,selfdef_wing_b&deployableMechs=3&startingAmmo=40",
      ),
    );
    startSortie(w);
    w.commandUnlock = { mode: "release", equippedByUnit: {} };
    clearFoes(w);
    const wa = w.wingmen[0]!;
    const wingmanInstanceId = wa.instanceId;
    assert.equal(wingmanInstanceId, "selfdef_wing_a", "self-defense wingman instanceId");
    w.currentAmmo[wingmanInstanceId!] = 28;
    const ammo0 = w.currentAmmo[wingmanInstanceId!];
    w.leader.pos = { x: wa.pos.x + 600, y: wa.pos.y }; // keep captain out of it
    const foe = w.enemies[0]!;
    foe.alive = true; foe.hp = foe.maxHp;
    foe.pos = { x: wa.pos.x + w.balance.weaponRange * 0.6, y: wa.pos.y };
    wa.cooldown = 0;
    const start = { ...wa.pos };
    const intent = decideWingman(w, wa, 0.05);
    assert.equal(intent.fireAt?.id, foe.id, "targets in-range enemy");
    tickWorld(w, 0.02, idle);
    assert.ok(
      w.currentAmmo[wingmanInstanceId!]! < ammo0!,
      "immobile wingman fires in self-defense",
    );
    assert.ok(w.bullets.some((b) => b.ownerId === wa.id) || w.currentAmmo[wingmanInstanceId!]! < ammo0!);
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
      assert.ok(!blob.includes("leftBehind") && !blob.includes("置き去り") && !blob.includes("no_circuit"), "left-behind UI state stays Explore-internal");
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
      "僚機Aを置き去り（搭乗円の外・自衛のみ）",
      "僚機Bを置き去り（搭乗円の外・自衛のみ）",
    ]);
    const html = leftBehindResultHtml(w);
    assert.ok(html.includes('id="result-left-behind"') && (html.match(/<li>/g) ?? []).length === 3);
    assert.ok(html.includes("Invade を通らない出撃のため、置き去りの機体は回路ごと失われる"), "direct sortie: fate line");
    noLeak(w);
  }

  // (1b) release, no circuit, but one immobile wingman happens to be inside → only the other listed
  {
    const w = setup("release");
    w.leader.pos = { x: w.leader.pos.x + 400, y: w.leader.pos.y };
    w.wingmen[1]!.pos = { x: w.leader.pos.x + 20, y: w.leader.pos.y };
    extract(w);
    assert.deepEqual(leftBehindResultLines(w), ["僚機Aを置き去り（搭乗円の外・自衛のみ）"]);
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
    assert.ok(!lines[0]!.includes("自衛のみ"), `${label}: distinguished from the immobile (self-defense only) case`);
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
  // Return contract captures the existing left-behind source state without changing
  // the Explore-local display record or inventing wreck/enemy semantics.
  {
    const w = createWorld(
      bootstrapFromSearch(
        "?deployedInstanceIds=m1,m2,m3&deployableMechs=3&startingAmmo=30&mechCurrentAmmo=m1:12;m2:7;m3:9&mechBattery=m1:300:250;m2:300:212;m3:300:180&mechCircuits=m2~circuit_lost*fa*5",
      ),
    );
    startSortie(w);
    for (const e of w.enemies) {
      e.alive = false;
      e.hp = 0;
    }
    w.leader.pos = { x: 700, y: 400 };
    w.wingmen[0]!.pos = { x: 700, y: 400 };
    w.wingmen[1]!.pos = { x: 700, y: 400 };
    extract(w, () => {
      w.wingmen[0]!.pos = { x: 1300, y: 400 };
    });
    assert.equal(w.extracted, true);
    assert.deepEqual(w.leftBehind, [
      { id: w.wingmen[0]!.id, name: "僚機A", reason: "outside_circle" },
    ]);
    const returnPayload = parseExploreToHubWearSearch(new URL(hubWearHandoffUrl(w)!).search);
    assert.ok(returnPayload);
    // not via Invade (#206 leftover): lost outright with its circuits, not kept in lostMechs
    assert.equal(returnPayload!.lostMechs, undefined, "direct sortie: no lostMechs row");
    assert.deepEqual(returnPayload!.abandonedMechInstanceIds, ["m2"], "direct sortie: abandoned");
    assert.equal(returnPayload!.frontSeed, undefined, "direct sortie: no drop place");
    assert.equal(returnPayload!.cell, undefined, "direct sortie: no drop cell");
  }
  // Via Invade (sector + HubSave front seed): the left-behind wingman keeps its place.
  {
    const w = attachLostMechContext(
      createWorld(
        bootstrapFromSearch(
          "?sectorX=2&sectorY=-1&density=0.3&deployedInstanceIds=m1,m2,m3&deployableMechs=3&startingAmmo=30&mechCurrentAmmo=m1:12;m2:7;m3:9&mechBattery=m1:300:250;m2:300:212;m3:300:180&mechCircuits=m2~circuit_lost*fa*5",
        ),
      ),
      normalizeHubSnapshot({ ...INITIAL_HUB, frontProgress: { seed: 4242, cols: 8, rows: 8, cleared: [], mined: [] } }),
    );
    assert.deepEqual(w.sortieLocation, { frontSeed: 4242, cell: { sx: 2, sy: -1 } });
    startSortie(w);
    for (const e of w.enemies) {
      e.alive = false;
      e.hp = 0;
    }
    w.leader.pos = { x: 700, y: 400 };
    w.wingmen[0]!.pos = { x: 700, y: 400 };
    w.wingmen[1]!.pos = { x: 700, y: 400 };
    extract(w, () => {
      w.wingmen[0]!.pos = { x: 1300, y: 400 };
    });
    const returnPayload = parseExploreToHubWearSearch(new URL(hubWearHandoffUrl(w)!).search);
    assert.deepEqual(returnPayload!.lostMechs, [{
      instanceId: "m2",
      currentAmmo: 7,
      battery: { capacity: 300, activity: 212 },
      circuitIds: ["circuit_lost"],
      frontSeed: 4242,
      cell: { sx: 2, sy: -1 },
    }]);
    assert.equal(returnPayload!.abandonedMechInstanceIds, undefined, "via Invade: nothing abandoned");
    assert.equal(returnPayload!.frontSeed, 4242, "via Invade: drop place on the return");
    assert.deepEqual(returnPayload!.cell, { sx: 2, sy: -1 });
    assert.ok(new URL(hubWearHandoffUrl(w)!).searchParams.get("dropCell") === "2,-1");
    assert.ok(leftBehindResultHtml(w).includes("前線マス (2, -1) に残る"), "via Invade: fate line");
  }
  console.log("explore left-behind result line ok");
}


// 撤退 button → result screen. The button sets phase between frames; the frame
// loop must still see the change (same path as X lift-off) and draw the result.
{
  const search = "?deployedInstanceIds=m1,m2&deployableMechs=2&mechDurability=m1:100;m2:80";
  // (a) 撤退 between frames
  {
    const w = createWorld(bootstrapFromSearch(search));
    const watch = createPhaseWatcher(w.phase);
    startSortie(w);
    watch.markRendered(w.phase); // btn-start renders the sortie screen
    tickWorld(w, 0.05, idleInput());
    assert.equal(watch.takeChange(w.phase), null, "no change while in sortie");
    assert.equal(executeExploreCommand(w, { id: "abort" }).status, "done"); // 撤退 click
    assert.equal(w.phase, "result");
    // next frame: sortie branch is skipped (phase is result), the change is still seen once
    assert.equal(watch.takeChange(w.phase), "result", "撤退 → frame sees the switch to result");
    assert.equal(watch.takeChange(w.phase), null, "handled once");
    assert.ok(toExploreResult(w), "result screen has a result");
    assert.equal(toExploreResult(w)!.isExtracted, false);
    assert.ok(hubWearHandoffUrl(w)?.includes("returnKind=abort"), "result screen offers the hangar return (abort)");
  }
  // (b) X lift-off inside a tick goes through the same watcher
  {
    const w = createWorld(bootstrapFromSearch(search));
    const watch = createPhaseWatcher(w.phase);
    startSortie(w);
    watch.markRendered(w.phase);
    for (const e of w.enemies) { e.alive = false; e.hp = 0; }
    assert.equal(executeExploreCommand(w, { id: "extract" }).status, "done");
    let seen: string | null = null;
    for (let t = 0; t < w.balance.boardingLiftOffDelaySec + 2 && seen == null; t += 0.1) {
      if (w.phase === "sortie") tickWorld(w, 0.1, idleInput());
      seen = watch.takeChange(w.phase);
    }
    assert.equal(seen, "result", "X lift-off → result through the same path");
  }
  // (c) main.ts frame uses the watcher (not a per-frame phase snapshot)
  {
    const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    assert.ok(main.includes("phaseWatch.takeChange(world.phase)"), "frame checks the last rendered phase");
    assert.ok(main.includes("phaseWatch.markRendered(world.phase)"), "renderDom records the rendered phase");
    assert.ok(!main.includes("phaseBefore"), "no per-frame phase snapshot");
  }
  console.log("explore retreat → result screen ok");
}

// U9: Explore writes the sortie result to HubSave at sortie end (direct save);
// re-sortie (案 A) rebuilds the squad from HubSave.
{
  const memStore = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  const makeHub = () => {
    const mk = (id: string, durability: number, currentAmmo?: number, activity = 300) => ({
      ...shared.createOwnedMech("mech_gen1", { instanceId: id, durability, ...(currentAmmo != null ? { currentAmmo } : {}) }),
      battery: { capacity: 300, activity },
    });
    let hub = shared.normalizeHubSnapshot({
      ...shared.INITIAL_HUB,
      fleet: [mk("m1", 100, undefined, 250), mk("m2", 90, 12, 212), mk("m3", 60, 5, 180)],
    });
    hub = shared.upsertCircuitIntoHub(hub, {
      circuitId: "c_wing",
      circuitBoard: shared.createEmptyCircuitBoard(4, 4, "u9_wing") as never,
      outcome: "bypass",
    } as never);
    const eq = shared.equipCircuit(hub, "c_wing", "m2") as unknown as { hub?: typeof hub };
    return eq.hub ?? hub;
  };
  const deploySearch = (hub: ReturnType<typeof makeHub>) => {
    const payload = shared.buildTradeToExplorePayloadFromFleet(hub.fleet, 20, ["m1", "m2", "m3"]);
    payload.mechCircuits = { m2: [{ circuitId: "c_wing", restoreState: "bypass" } as never] };
    const url = new URL(shared.buildTradeToExploreUrl(payload, "https://estg.invalid/explore/"));
    // Flat wear cannot wreck an operational mech; the deploy-time durability
    // says 10 for m3 so extract wear (15) wrecks it (wreckedMechInstanceIds).
    url.searchParams.set("mechDurability", url.searchParams.get("mechDurability")!.replace("m3:60", "m3:10"));
    return url.search;
  };
  /** Sortie with m2 (wing-a) left outside the circle, m3 wrecked by extract wear. */
  const runSortie = (search: string) => {
    const w = createWorld(bootstrapFromSearch(search));
    startSortie(w);
    for (const e of w.enemies) { e.alive = false; e.hp = 0; }
    w.currentAmmo.m1 = 21; // leader fired 7 of 28 (unset → full)
    w.leader.pos = { x: 700, y: 400 };
    for (const u of w.wingmen) u.pos = { x: 700, y: 400 };
    assert.equal(executeExploreCommand(w, { id: "extract" }).status, "done");
    for (let t = 0; t < w.balance.boardingLiftOffDelaySec + 2 && w.phase === "sortie"; t += 0.1) {
      if (w.balance.boardingLiftOffDelaySec - boardingElapsed(w) <= 0.3) w.wingmen[0]!.pos = { x: 1300, y: 400 };
      tickWorld(w, 0.1, idleInput());
    }
    assert.equal(w.phase, "result");
    assert.equal(w.extracted, true);
    return w;
  };

  const store = memStore();
  const hub0 = makeHub();
  assert.ok(shared.saveHubSaveToLocalStorage(hub0, store));
  const search = deploySearch(hub0);
  const w = runSortie(search);
  assert.equal(saveSortieResultToHub({ ...w, phase: "sortie" } as typeof w, store).status, "skipped", "only at result");

  // (1) direct save writes the correct save
  const res = saveSortieResultToHub(w, store);
  assert.equal(res.status, "saved");
  const payload = (res as { payload: shared.ExploreToHubWearPayload }).payload;
  const saved = shared.normalizeHubSnapshot(shared.loadHubSaveFromLocalStorage(store)!.hub);
  const m1 = saved.fleet.find((m) => m.instanceId === "m1")!;
  assert.equal(m1.durability, 100 - 15, "extract wear");
  assert.equal(m1.currentAmmo, 21, "carried ammo written");
  assert.deepEqual(m1.battery, { capacity: 300, activity: 250 }, "deployed battery carried through, not 300/300");
  assert.equal(saved.fleet.some((m) => m.instanceId === "m2"), false, "left-behind mech leaves the fleet");
  // direct sortie (not via Invade, #206 leftover): lost outright with its circuit
  assert.deepEqual(saved.lostMechs, [], "direct sortie: not kept in lostMechs");
  assert.deepEqual(payload.abandonedMechInstanceIds, ["m2"]);
  assert.equal(saved.circuits.some((c) => c.circuitId === "c_wing"), false, "its circuit is lost too (not stashed)");
  assert.equal(saved.circuits.length, hub0.circuits.length - 1, "circuit count drops only by the lost one");
  const m3 = saved.fleet.find((m) => m.instanceId === "m3")!;
  assert.equal(m3.status, "destroyed", "wrecked mech kept as destroyed");
  assert.ok(saved.appliedSortieIds?.includes(payload.sortieId!), "sortieId recorded");
  assert.deepEqual(
    payload.mechBattery?.map((r) => [r.instanceId, r.battery.activity]),
    [["m1", 250], ["m2", 212], ["m3", 180]],
    "return carries the deployed battery",
  );
  // the 格納庫 URL carries the same return
  assert.deepEqual(parseExploreToHubWearSearch(new URL(hubWearHandoffUrl(w)!).search)?.sortieId, payload.sortieId);

  // second save (re-render) → already applied, save unchanged
  const before = store.getItem(shared.HUB_SAVE_STORAGE_KEY);
  assert.equal(saveSortieResultToHub(w, store).status, "already_applied");
  assert.equal(store.getItem(shared.HUB_SAVE_STORAGE_KEY), before);

  // (2) each result button after the direct save:
  //  - Sort へ: a plain link; lostMechs is already in the save (above)
  //  - 格納庫へ: the same return applied again by trade's path → nothing changes
  assert.equal(shared.applyExploreReturnToHub(saved, payload).applied, false);
  //  - 再出撃: rebuild from HubSave → m2 (lost) and m3 (wrecked) excluded, saved ammo used
  const hubRe = hubForResortie(search, w, payload, store);
  assert.deepEqual(hubRe.fleet, saved.fleet, "re-sortie reads the saved hub");
  const re = resortieSearch(search, hubRe, w.deployedInstanceIds);
  assert.ok(re);
  assert.deepEqual(re!.deployedInstanceIds, ["m1"]);
  const w2 = createWorld(bootstrapFromSearch(re!.search));
  assert.deepEqual(w2.deployedInstanceIds, ["m1"]);
  assert.equal(w2.wingmen.length, 0, "no left-behind / wrecked wingman in the next sortie");
  assert.equal(w2.currentAmmo.m1, 21, "saved ammo, not refilled");
  assert.equal(w2.deployedDurability.m1, 85, "saved durability");
  assert.deepEqual(w2.mechBattery.m1, { capacity: 300, activity: 250 });
  assert.equal(shared.normalizeHubSnapshot(shared.loadHubSaveFromLocalStorage(store)!.hub).lostMechs.length, 0, "re-sortie: still nothing in lostMechs");
  // item 15: 再出撃 follows the hangar's saved selection (same resolver as the hangar)
  {
    const plan0 = resortiePlan(search, w, payload, store);
    assert.equal(plan0.fromSave, true);
    assert.deepEqual(plan0.ids, ["m1"], "no selection → first 3 deployable (m2 lost, m3 wrecked)");
    const mk = (id: string) => shared.createOwnedMech("mech_gen1", { instanceId: id, durability: 100 });
    const wide = shared.normalizeHubSnapshot({ ...saved, fleet: [...saved.fleet, mk("m4"), mk("m5"), mk("m6")] });
    const sel = { ...wide, sortieSelection: ["m5", "m2", "m3", "m1"] };
    const selStore = memStore();
    assert.ok(shared.saveHubSaveToLocalStorage(sel, selStore));
    const plan = resortiePlan(search, w, payload, selStore);
    assert.deepEqual(plan.ids, ["m1", "m5"], "selection, fleet order, lost/wrecked dropped");
    assert.deepEqual(plan.ids, shared.resolveSortieSelection(shared.normalizeHubSnapshot(shared.loadHubSaveFromLocalStorage(selStore)!.hub)), "same value the hangar reads");
    const reSel = resortieSearch(search, plan.hub, plan.ids);
    assert.deepEqual(reSel?.deployedInstanceIds, ["m1", "m5"]);
    assert.deepEqual(createWorld(bootstrapFromSearch(reSel!.search)).deployedInstanceIds, ["m1", "m5"]);
    // nothing selected can sortie → default first 3 deployable
    const gone = memStore();
    assert.ok(shared.saveHubSaveToLocalStorage({ ...wide, sortieSelection: ["m3"] }, gone));
    assert.deepEqual(resortiePlan(search, w, payload, gone).ids, ["m1", "m4", "m5"]);
    // no save holding this return → previous deploy's mechs
    assert.equal(resortiePlan(search, w, payload, memStore()).fromSave, false);
  }

  // (3) no HubSave (local dev cross-origin): nothing written; re-sortie still
  // rebuilds from the previous deploy with this return applied in memory
  const empty = memStore();
  assert.deepEqual(saveSortieResultToHub(w, empty), { status: "skipped", reason: "no_save" });
  assert.equal(empty.getItem(shared.HUB_SAVE_STORAGE_KEY), null);
  const reFallback = resortieSearch(search, hubForResortie(search, w, payload, empty), w.deployedInstanceIds);
  assert.deepEqual(reFallback?.deployedInstanceIds, ["m1"]);
  assert.equal(createWorld(bootstrapFromSearch(reFallback!.search)).currentAmmo.m1, 21);

  // (4) nobody left to sortie → null (button shows a note instead)
  const allGone = shared.normalizeHubSnapshot({ ...saved, fleet: saved.fleet.filter((m) => m.instanceId !== "m1") });
  assert.equal(resortieSearch(search, allGone, w.deployedInstanceIds), null);

  // (5) deploy URL without mechBattery → return omits battery (no fake 300/300)
  {
    const wb = createWorld(bootstrapFromSearch("?deployedInstanceIds=x1&deployableMechs=1&mechDurability=x1:100"));
    startSortie(wb);
    assert.equal(executeExploreCommand(wb, { id: "abort" }).status, "done");
    assert.equal(exploreReturnPayload(wb)?.mechBattery, undefined);
  }
  // (6) two sorties never share a sortieId (per-sortie nonce)
  {
    const a = createWorld(bootstrapFromSearch(search)); startSortie(a); executeExploreCommand(a, { id: "abort" });
    const b = createWorld(bootstrapFromSearch(search)); startSortie(b); executeExploreCommand(b, { id: "abort" });
    assert.notEqual(exploreReturnPayload(a)?.sortieId, exploreReturnPayload(b)?.sortieId);
  }
  // (7) main.ts saves when the result screen renders (before any result button)
  {
    const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const render = main.slice(main.indexOf("function renderDom(): void {"));
    assert.ok(render.indexOf("ensureDirectSave()") > -1 && render.indexOf("ensureDirectSave()") < render.indexOf('if (world.phase === "briefing")'), "renderDom saves first");
    assert.ok(main.includes("resortiePlan(bootSearch, world, payload)") && main.includes("resortieSearch(bootSearch, plan.hub, plan.ids)"), "再出撃 rebuilds from HubSave (hangar selection)");
  }
  console.log("explore U9 direct save / re-sortie ok");
}

// Uncarried wreck: its circuits fall on the Invade cell, or are lost when the
// sortie did not go through Invade (U7). A wreck that was also left behind
// keeps its circuits on the lostMechs row. The hull of an uncarried wreck
// stays in the fleet as destroyed (#199). Carry is unimplemented.
{
  const memStore = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  const makeHub = () => {
    const mk = (id: string, durability: number) => ({
      ...shared.createOwnedMech("mech_gen1", { instanceId: id, durability }),
      battery: { capacity: 300, activity: 200 },
    });
    let hub = shared.normalizeHubSnapshot({
      ...shared.INITIAL_HUB,
      fleet: [mk("m1", 100), mk("m3", 10)],
      frontProgress: { seed: 4242, cols: 8, rows: 8, cleared: [], mined: [] },
    });
    hub = shared.upsertCircuitIntoHub(hub, {
      circuitId: "c_wreck",
      circuitBoard: shared.createEmptyCircuitBoard(4, 4, "wreck_drop") as never,
      outcome: "bypass",
    } as never);
    const eq = shared.equipCircuit(hub, "c_wreck", "m3") as unknown as { hub?: typeof hub };
    return eq.hub ?? hub;
  };
  const deploySearch = (viaInvade: boolean) => {
    const url = new URL("https://estg.invalid/explore/");
    if (viaInvade) {
      url.searchParams.set("sectorX", "2");
      url.searchParams.set("sectorY", "-1");
      url.searchParams.set("density", "0.3");
    }
    url.searchParams.set("deployedInstanceIds", "m1,m3");
    url.searchParams.set("deployableMechs", "2");
    url.searchParams.set("mechDurability", "m1:100;m3:10");
    url.searchParams.set("mechBattery", "m1:300:200;m3:300:200");
    url.searchParams.set("mechCircuits", "m3~c_wreck*by*4");
    return url.search;
  };
  const extractHome = (search: string, hub: ReturnType<typeof makeHub>, leaveWingman: boolean) => {
    const w = attachLostMechContext(createWorld(bootstrapFromSearch(search)), hub);
    startSortie(w);
    for (const e of w.enemies) {
      e.alive = false;
      e.hp = 0;
    }
    w.leader.pos = { x: 700, y: 400 };
    for (const u of w.wingmen) u.pos = { x: 700, y: 400 };
    assert.equal(executeExploreCommand(w, { id: "extract" }).status, "done");
    for (let t = 0; t < w.balance.boardingLiftOffDelaySec + 2 && w.phase === "sortie"; t += 0.1) {
      if (leaveWingman && w.balance.boardingLiftOffDelaySec - boardingElapsed(w) <= 0.3) {
        w.wingmen[0]!.pos = { x: 1300, y: 400 };
      }
      tickWorld(w, 0.1, idleInput());
    }
    assert.equal(w.phase, "result");
    return w;
  };

  const directHub = makeHub();
  const directStore = memStore();
  assert.ok(shared.saveHubSaveToLocalStorage(directHub, directStore));
  const direct = extractHome(deploySearch(false), directHub, false);
  assert.equal(direct.sortieLocation, null);
  assert.deepEqual(wreckCircuitResultLines(direct), [
    "Invade を通らない出撃のため、大破した m3 の回路（c_wreck）は失われた",
  ]);
  assert.ok(wreckCircuitResultHtml(direct).includes('id="result-wreck-circuits"'));
  const directSave = saveSortieResultToHub(direct, directStore);
  assert.equal(directSave.status, "saved");
  const directSaved = shared.normalizeHubSnapshot(shared.loadHubSaveFromLocalStorage(directStore)!.hub);
  assert.equal(directSaved.fieldDrops.length, 0, "no cell → no field drop");
  assert.equal(directSaved.circuits.some((c) => c.circuitId === "c_wreck"), false, "circuit lost (U7)");
  assert.equal(directSaved.fleet.find((m) => m.instanceId === "m3")!.status, "destroyed");
  assert.equal(exploreReturnPayload(direct)?.frontSeed, undefined);

  const viaHub = makeHub();
  const viaStore = memStore();
  assert.ok(shared.saveHubSaveToLocalStorage(viaHub, viaStore));
  const via = extractHome(deploySearch(true), viaHub, false);
  assert.deepEqual(via.sortieLocation, { frontSeed: 4242, cell: { sx: 2, sy: -1 } });
  assert.deepEqual(wreckCircuitResultLines(via), [
    "大破した m3 の回路（c_wreck）は前線マス (2, -1) に落ちた",
  ]);
  const viaPayload = exploreReturnPayload(via)!;
  assert.equal(viaPayload.frontSeed, 4242);
  assert.deepEqual(viaPayload.cell, { sx: 2, sy: -1 });
  assert.deepEqual(viaPayload.wreckedMechInstanceIds, ["m3"]);
  const viaSave = saveSortieResultToHub(via, viaStore);
  assert.equal(viaSave.status, "saved");
  const viaSaved = shared.normalizeHubSnapshot(shared.loadHubSaveFromLocalStorage(viaStore)!.hub);
  const hull = viaSaved.fleet.find((m) => m.instanceId === "m3")!;
  assert.equal(hull.status, "destroyed", "hull stays");
  assert.equal(hull.durability, 0);
  assert.equal(viaSaved.circuits.some((c) => c.circuitId === "c_wreck"), false);
  assert.equal(viaSaved.fieldDrops.length, 1);
  assert.equal(viaSaved.fieldDrops[0]!.cause, "wreck_not_carried");
  assert.equal(viaSaved.fieldDrops[0]!.fromMechInstanceId, "m3");
  assert.equal(viaSaved.fieldDrops[0]!.frontSeed, 4242);
  assert.deepEqual(viaSaved.fieldDrops[0]!.cell, { sx: 2, sy: -1 });
  assert.equal(viaSaved.fieldDrops[0]!.circuit.equippedTo, null);
  assert.equal(viaSaved.fieldDrops[0]!.circuit.circuitId, "c_wreck");

  const leftHub = makeHub();
  const leftStore = memStore();
  assert.ok(shared.saveHubSaveToLocalStorage(leftHub, leftStore));
  const left = extractHome(deploySearch(true), leftHub, true);
  assert.equal(wreckCircuitResultLines(left).length, 0, "left-behind wreck keeps its circuits");
  const leftSave = saveSortieResultToHub(left, leftStore);
  assert.equal(leftSave.status, "saved");
  const leftSaved = shared.normalizeHubSnapshot(shared.loadHubSaveFromLocalStorage(leftStore)!.hub);
  assert.equal(leftSaved.fieldDrops.length, 0);
  assert.equal(leftSaved.fleet.some((m) => m.instanceId === "m3"), false);
  assert.equal(leftSaved.lostMechs[0]!.instanceId, "m3");
  assert.equal(leftSaved.circuits.find((c) => c.circuitId === "c_wreck")!.equippedTo, "m3");
  console.log("explore wreck circuit drops ok");
}

// lostMechs recovery PR 2: via Invade the left-behind mech stays on its front
// cell, reappears on the next sortie there and is recovered at lift-off when
// inside the boarding circle; not recovered → the same row is updated.
{
  const memStore = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  const mk = (id: string, durability: number, currentAmmo: number, activity: number) => ({
    ...shared.createOwnedMech("mech_gen1", { instanceId: id, durability, currentAmmo }),
    battery: { capacity: 300, activity },
  });
  let hub0 = shared.normalizeHubSnapshot({
    ...shared.INITIAL_HUB,
    fleet: [mk("m1", 100, 20, 250), mk("m2", 90, 12, 212)],
    ammoLoad: { ...shared.INITIAL_HUB.ammoLoad, standard: 30 } as never,
    frontProgress: { seed: 777, cols: 8, rows: 8, cleared: [], mined: [] },
  });
  hub0 = shared.upsertCircuitIntoHub(hub0, {
    circuitId: "c_wing",
    circuitBoard: shared.createEmptyCircuitBoard(4, 4, "lm_wing") as never,
    outcome: "bypass",
  } as never);
  hub0 = ((shared.equipCircuit(hub0, "c_wing", "m2") as unknown as { hub?: typeof hub0 }).hub) ?? hub0;
  const store = memStore();
  assert.ok(shared.saveHubSaveToLocalStorage(hub0, store));
  const load = () => shared.normalizeHubSnapshot(shared.loadHubSaveFromLocalStorage(store)!.hub);

  // Invade's link carries only the sector → the squad comes from HubSave
  const invadeLink = "?sectorX=3&sectorY=-2&density=0.3&engage=voluntary";
  const search = invadeSquadSearch(invadeLink, hub0);
  assert.ok(search, "Invade link without deploy keys → squad from HubSave");
  const inbound = shared.parseTradeToExploreSearch(search!);
  assert.deepEqual(inbound?.deployedInstanceIds, ["m1", "m2"], "hangar selection (default first 3 deployable)");
  assert.deepEqual(inbound?.mechCircuits?.m2?.map((c) => c.circuitId), ["c_wing"], "equipped circuits go along");
  assert.deepEqual(shared.parseInvadeToExploreSearch(search!)?.sectorX, 3, "sector kept");
  assert.equal(invadeSquadSearch("?deployedInstanceIds=m1&deployableMechs=1", hub0), null, "trade deploy link untouched");
  assert.equal(invadeSquadSearch(`${invadeLink}&deployedInstanceIds=m1&deployableMechs=1`, hub0), null, "link with a squad untouched");
  assert.equal(invadeSquadSearch(invadeLink, null), null, "no save → unchanged");

  const world = (q: string) => attachLostMechContext(createWorld(bootstrapFromSearch(q)), load());
  /** Sortie; `leftOut` wingmen are pulled out of the circle just before lift-off; `leaderAt` is where X is pressed. */
  const run = (q: string, leftOut: boolean, leaderAt?: { x: number; y: number }) => {
    const w = world(q);
    startSortie(w);
    for (const e of w.enemies) { e.alive = false; e.hp = 0; }
    if (leaderAt) w.leader.pos = { ...leaderAt };
    for (const u of w.wingmen) u.pos = { ...w.leader.pos };
    assert.equal(executeExploreCommand(w, { id: "extract" }).status, "done");
    for (let t = 0; t < w.balance.boardingLiftOffDelaySec + 2 && w.phase === "sortie"; t += 0.1) {
      if (leftOut && w.balance.boardingLiftOffDelaySec - boardingElapsed(w) <= 0.3) {
        for (const u of w.wingmen) u.pos = { x: w.leader.pos.x + 600, y: w.leader.pos.y };
      }
      tickWorld(w, 0.1, idleInput());
    }
    assert.equal(w.phase, "result");
    assert.equal(w.extracted, true);
    const res = saveSortieResultToHub(w, store);
    assert.equal(res.status, "saved");
    return { w, payload: (res as { payload: shared.ExploreToHubWearPayload }).payload };
  };

  // (1) via Invade: m2 left behind → lostMechs row with its place, copy, time and sortie id
  const first = run(search!, true);
  assert.deepEqual(first.w.sortieLocation, { frontSeed: 777, cell: { sx: 3, sy: -2 } });
  let saved = load();
  assert.equal(saved.fleet.some((m) => m.instanceId === "m2"), false);
  assert.equal(saved.lostMechs.length, 1);
  const row = saved.lostMechs[0]!;
  assert.equal(row.instanceId, "m2");
  assert.equal(row.frontSeed, 777);
  assert.deepEqual(row.cell, { sx: 3, sy: -2 });
  assert.equal(row.lostSortieId, first.payload.sortieId);
  assert.ok(typeof row.lostAt === "string" && row.lostAt.length > 0, "lostAt");
  assert.equal(row.catalogId, "mech_gen1", "copy kept");
  assert.equal(row.currentAmmo, 12);
  assert.deepEqual(row.battery, { capacity: 300, activity: 212 });
  assert.deepEqual(row.circuitIds, ["c_wing"]);
  assert.equal(saved.circuits.find((c) => c.circuitId === "c_wing")?.equippedTo, "m2", "circuit stays on the lost mech");
  assert.equal(first.payload.abandonedMechInstanceIds, undefined);

  // a different cell / another front seed → nothing reappears
  assert.deepEqual(world(search!.replace("sectorX=3", "sectorX=4")).strandedMechs, []);
  assert.deepEqual(strandedMechsFor(saved, { frontSeed: 778, cell: { sx: 3, sy: -2 } }, [], { x: 0, y: 0 }), []);
  // not via Invade → no location, nothing reappears
  assert.equal(sortieLocationFor(null, saved), null);
  assert.equal(sortieLocationFor({ sectorX: 3, sectorY: -2 }, { frontProgress: null }), null, "no saved front seed");
  assert.equal(sortieLocationFor({ sectorX: 40, sectorY: 0 }, saved), null, "out of the front coord bound");

  // (2) same cell, X far from the drop zone → m2 reappears but is not recovered:
  // the same row is updated (latest sortie id / time), never duplicated
  const search2 = invadeSquadSearch(invadeLink, saved)!;
  assert.deepEqual(shared.parseTradeToExploreSearch(search2)?.deployedInstanceIds, ["m1"]);
  const w2 = world(search2);
  assert.deepEqual(w2.strandedMechs?.map((m) => m.instanceId), ["m2"], "reappears on the same cell");
  const sm = w2.strandedMechs![0]!;
  assert.ok(Math.hypot(sm.pos.x - w2.leader.pos.x, sm.pos.y - w2.leader.pos.y) <= STRANDED_RING_RADIUS + 0.001, "waits near the drop zone");
  const second = run(search2, false, { x: 900, y: 300 });
  assert.deepEqual(second.w.recoveredLostMechIds, []);
  saved = load();
  assert.equal(saved.lostMechs.length, 1, "no new row");
  assert.equal(saved.lostMechs[0]!.instanceId, "m2");
  assert.equal(saved.lostMechs[0]!.lostSortieId, second.payload.sortieId, "updated to the latest sortie");
  assert.notEqual(second.payload.sortieId, first.payload.sortieId);
  assert.deepEqual(saved.lostMechs[0]!.cell, { sx: 3, sy: -2 });
  assert.deepEqual(saved.lostMechs[0]!.circuitIds, ["c_wing"]);
  assert.equal(saved.lostMechs[0]!.currentAmmo, 12);
  assert.ok(leftBehindResultHtml(second.w).includes("置き去りだった機体 m2 は回収できず"));

  // recovery needs the captain aboard
  {
    const wn = world(invadeSquadSearch(invadeLink, saved)!);
    const boarding = { center: { ...wn.leader.pos }, radius: 110 } as never;
    assert.deepEqual(recoverStrandedAtLiftOff(wn, boarding, false), []);
    assert.deepEqual(recoverStrandedAtLiftOff(wn, boarding, true), ["m2"]);
  }

  // (3) same cell, X at the drop zone → m2 inside the circle at lift-off → recovered
  const search3 = invadeSquadSearch(invadeLink, saved)!;
  assert.deepEqual(shared.parseTradeToExploreSearch(search3)?.deployedInstanceIds, ["m1"]);
  const third = run(search3, false);
  assert.deepEqual(third.w.recoveredLostMechIds, ["m2"]);
  assert.deepEqual(third.payload.recoveredLostMechInstanceIds, ["m2"]);
  saved = load();
  assert.deepEqual(saved.lostMechs, [], "gone from lostMechs");
  const back = saved.fleet.find((m) => m.instanceId === "m2");
  assert.ok(back, "back in the fleet");
  assert.equal(back!.currentAmmo, 12, "ammo as left");
  assert.deepEqual(back!.battery, { capacity: 300, activity: 212 }, "battery as left");
  assert.equal(saved.circuits.find((c) => c.circuitId === "c_wing")?.equippedTo, "m2", "circuit still equipped");
  assert.ok(shared.resolveSortieSelection(saved).includes("m2"), "selectable in the hangar");
  assert.ok(leftBehindResultHtml(third.w).includes("置き去りだった機体 m2 を回収"));
  // 再出撃 right after the recovery: m2 goes out with its circuit (from the hub)
  {
    const plan = resortiePlan(search3, third.w, third.payload, store);
    assert.equal(plan.fromSave, true);
    const re = resortieSearch(search3, plan.hub, plan.ids);
    assert.deepEqual(re?.deployedInstanceIds, ["m1", "m2"]);
    assert.deepEqual(shared.parseTradeToExploreSearch(re!.search)?.mechCircuits?.m2?.map((c) => c.circuitId), ["c_wing"]);
    assert.equal(shared.parseInvadeToExploreSearch(re!.search)?.sectorX, 3, "same sector");
  }
  // the next sortie there: nothing left on the cell
  assert.deepEqual(world(invadeSquadSearch(invadeLink, saved)!).strandedMechs, []);
  console.log("explore lostMechs reappear / recover ok");
}

// lostMechs recovery follow-up 2 (2026-10-03 神宮): an Invade sortie built from
// HubSave leaves circuits on a left-behind mech out of the circuit bonuses
// (same as trade's hubCircuitBonuses).
{
  const mk = (id: string) => ({ ...shared.createOwnedMech("mech_gen1", { instanceId: id, durability: 100, currentAmmo: 20 }), battery: { capacity: 300, activity: 250 } });
  let hub = shared.normalizeHubSnapshot({ ...shared.INITIAL_HUB, fleet: [mk("m1"), mk("m2")], frontProgress: { seed: 777, cols: 8, rows: 8, cleared: [], mined: [] } });
  hub = shared.upsertCircuitIntoHub(hub, {
    circuitId: "c_awake",
    circuitBoard: { ...shared.createEmptyCircuitBoard(8, 8, "c_awake"), outcome: "fully_awakened" } as never,
    outcome: "fully_awakened",
  } as never);
  const eq = shared.equipCircuit(hub, "c_awake", "m2");
  assert.equal(eq.ok, true);
  hub = eq.hub;
  const link = "?sectorX=1&sectorY=1&density=0.3&engage=voluntary";
  const home = shared.parseTradeToExploreSearch(invadeSquadSearch(link, hub)!);
  assert.ok((home?.circuitBonuses?.durabilityBuffer ?? 0) >= 10, "mech home → its circuit counts");
  const lost = shared.applyExploreReturnToHub(hub, {
    returnKind: "extract", mechWear: [], sortieId: "ex_bonus_lost",
    lostMechs: [{ instanceId: "m2", currentAmmo: 9, battery: { capacity: 300, activity: 200 }, circuitIds: ["c_awake"], frontSeed: 777, cell: { sx: 1, sy: 1 } }],
  } as never);
  assert.equal(lost.applied, true);
  assert.equal(lost.hub.circuits.find((c) => c.circuitId === "c_awake")?.equippedTo, "m2", "kept on the lost mech");
  const away = shared.parseTradeToExploreSearch(invadeSquadSearch(link, lost.hub)!);
  assert.equal(away?.circuitBonuses, undefined, "mech left behind → no circuit bonuses from its circuit");
  console.log("explore invade sortie bonuses exclude lost-mech circuits ok");
}

// circuit field drops recovery PR: fieldDrops on this front cell appear near drop zone
// and are recovered inside the boarding circle at lift-off, returning to the stash.
{
  const mkMech = (instanceId: string) => shared.createOwnedMech("mech_gen1", { instanceId, durability: 100, currentAmmo: 10 });
  const mkCircuit = (circuitId: string): shared.HubCircuitRecord => ({
    circuitId,
    circuitBoard: { ...shared.createEmptyCircuitBoard(4, 4, circuitId), outcome: "fully_awakened" } as never,
    restoreState: "fully_awakened",
    outcome: "fully_awakened",
    origin: "crafted",
    locked: true,
  });

  const cField1 = mkCircuit("c_field_1");
  const cField2 = mkCircuit("c_field_2");
  const cOtherCell = mkCircuit("c_other_cell");
  const cDup = mkCircuit("c_already_owned");

  let hub = shared.normalizeHubSnapshot({
    ...shared.INITIAL_HUB,
    fleet: [mkMech("m1"), mkMech("m2")],
    circuits: [cDup],
    frontProgress: { seed: 555, cols: 8, rows: 8, cleared: [], mined: [] },
    fieldDrops: [
      {
        dropId: "drop_f1",
        frontSeed: 555,
        cell: { sx: 2, sy: 3 },
        circuit: cField1,
        cause: "wreck_not_carried",
        droppedAt: "2026-10-04T00:00:00.000Z",
      },
      {
        dropId: "drop_dup",
        frontSeed: 555,
        cell: { sx: 2, sy: 3 },
        circuit: { ...cDup, customName: "重複" },
        cause: "wreck_not_carried",
        droppedAt: "2026-10-04T00:00:00.000Z",
      },
      {
        dropId: "drop_other",
        frontSeed: 555,
        cell: { sx: 0, sy: 0 },
        circuit: cOtherCell,
        cause: "wreck_not_carried",
        droppedAt: "2026-10-04T00:00:00.000Z",
      },
    ],
  });

  // (1) Filtered to this front cell only; other cells are excluded
  const loc = { frontSeed: 555, cell: { sx: 2, sy: 3 } };
  const spawn = { x: 100, y: 100 };
  const drops = strandedDropsFor(hub, loc, spawn);
  assert.equal(drops.length, 2, "only 2 drops on cell (2, 3)");
  assert.deepEqual(drops.map((d) => d.dropId), ["drop_f1", "drop_dup"]);
  for (const d of drops) {
    const dFromSpawn = Math.hypot(d.pos.x - spawn.x, d.pos.y - spawn.y);
    assert.ok(dFromSpawn >= STRANDED_DROP_RING_RADIUS - 1 && dFromSpawn <= STRANDED_DROP_RING_RADIUS + 20, "near spawn");
  }

  // Without Invade sector (direct sortie): no drops
  assert.equal(strandedDropsFor(hub, null, spawn).length, 0);

  // (2) World creation attaches stranded drops and initialOwnedCircuitIds
  const boot = bootstrapFromSearch("?sectorX=2&sectorY=3&density=0.2&deployedInstanceIds=m1,m2&deployableMechs=2");
  const w = attachLostMechContext(createWorld(boot), hub);
  assert.equal(w.strandedDrops?.length, 2);
  assert.deepEqual(w.recoveredDropIds, []);
  assert.deepEqual(w.initialOwnedCircuitIds, ["c_already_owned"]);

  // (3) Lift-off: inside boarding circle recovers, but captain must be aboard
  const boardingInside = { center: { ...w.leader.pos }, radius: 110, requestedAt: 0, cargoArrived: true };
  // Captain outside circle -> nothing recovered
  assert.deepEqual(recoverStrandedDropsAtLiftOff(w, boardingInside, false), []);
  // Captain aboard -> recovered
  assert.deepEqual(recoverStrandedDropsAtLiftOff(w, boardingInside, true), ["drop_f1", "drop_dup"]);
  assert.deepEqual(w.recoveredDropIds, ["drop_f1", "drop_dup"]);

  // (4) Return payload includes recoveredDropIds
  w.phase = "result";
  w.extracted = true;
  const payload = exploreReturnPayload(w);
  assert.ok(payload);
  assert.deepEqual(payload.recoveredDropIds, ["drop_f1", "drop_dup"]);

  // (5) Result lines: c_field_1 is recovered to stash, c_already_owned is already owned so not returned
  const lines = recoveredCircuitResultLines(w);
  assert.deepEqual(lines, ["落とし物の回路 c_field_1 を回収（倉庫へ戻る）"]);
  const html = recoveredCircuitResultHtml(w);
  assert.ok(html.includes("result-recovered-circuits"));
  assert.ok(html.includes("落とし物の回路 c_field_1 を回収（倉庫へ戻る）"));
  assert.ok(!html.includes("c_already_owned"), "already owned circuit is not shown as recovered");

  // (6) Direct save to Hub: c_field_1 returns to stash (equippedTo null), drop_f1 removed, drop_dup stays
  const mStore = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mStore.get(k) ?? null,
    setItem: (k: string, v: string) => void mStore.set(k, v),
    removeItem: (k: string) => void mStore.delete(k),
  };
  assert.ok(shared.saveHubSaveToLocalStorage(hub, storage));
  const saveResult = saveSortieResultToHub(w, storage);
  assert.equal(saveResult.status, "saved");
  const savedHub = shared.normalizeHubSnapshot(shared.loadHubSaveFromLocalStorage(storage)!.hub);
  assert.equal(savedHub.circuits.length, 2);
  const recInHub = savedHub.circuits.find((c) => c.circuitId === "c_field_1")!;
  assert.ok(recInHub);
  assert.equal(recInHub.equippedTo, null);
  assert.equal(recInHub.restoreState, "fully_awakened");
  assert.equal(recInHub.origin, "crafted");
  assert.equal(recInHub.locked, true);

  // drop_dup stayed on the field; drop_f1 was recovered
  assert.equal(savedHub.fieldDrops.length, 2);
  assert.ok(savedHub.fieldDrops.some((d) => d.dropId === "drop_dup"));
  assert.ok(savedHub.fieldDrops.some((d) => d.dropId === "drop_other"));
  assert.ok(!savedHub.fieldDrops.some((d) => d.dropId === "drop_f1"));

  console.log("explore field drops reappear / recover ok");
}

// 項目5-1: a mech shot down during the sortie (Unit.alive=false at the end)
// comes back destroyed whatever the ending (extract / abort / fail). The flat
// returnKind wear applies to the surviving mechs only, with today's values.
// Its circuits follow the wreck rule (Invade cell drop, or lost); applied to
// the hub once per sortieId.
{
  const memStore = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  const makeHub = () => {
    const mk = (id: string) => ({
      ...shared.createOwnedMech("mech_gen1", { instanceId: id, durability: 100 }),
      battery: { capacity: 300, activity: 200 },
    });
    let hub = shared.normalizeHubSnapshot({
      ...shared.INITIAL_HUB,
      fleet: [mk("m1"), mk("m2"), mk("m3")],
      frontProgress: { seed: 4242, cols: 8, rows: 8, cleared: [], mined: [] },
    });
    hub = shared.upsertCircuitIntoHub(hub, {
      circuitId: "c_down",
      circuitBoard: shared.createEmptyCircuitBoard(4, 4, "item5_1_down") as never,
      outcome: "bypass",
    } as never);
    const eq = shared.equipCircuit(hub, "c_down", "m2") as unknown as { hub?: typeof hub };
    return eq.hub ?? hub;
  };
  const deploySearch = (viaInvade: boolean) => {
    const url = new URL("https://estg.invalid/explore/");
    if (viaInvade) {
      url.searchParams.set("sectorX", "2");
      url.searchParams.set("sectorY", "-1");
      url.searchParams.set("density", "0.3");
    }
    url.searchParams.set("deployedInstanceIds", "m1,m2,m3");
    url.searchParams.set("deployableMechs", "3");
    url.searchParams.set("mechDurability", "m1:100;m2:100;m3:100");
    url.searchParams.set("mechBattery", "m1:300:200;m2:300:200;m3:300:200");
    url.searchParams.set("mechCircuits", "m2~c_down*by*4");
    return url.search;
  };
  const begin = (viaInvade: boolean, hub = makeHub()) => {
    const w = attachLostMechContext(createWorld(bootstrapFromSearch(deploySearch(viaInvade))), hub);
    startSortie(w);
    for (const e of w.enemies) { e.alive = false; e.hp = 0; }
    return w;
  };
  const shootDown = (u: Unit) => { u.alive = false; u.hp = 0; };
  const wear = (w: ReturnType<typeof createWorld>) =>
    Object.fromEntries(exploreReturnPayload(w)!.mechWear.map((r) => [r.instanceId, r.durabilityAfter]));
  const extractHome = (w: ReturnType<typeof createWorld>) => {
    w.leader.pos = { x: 700, y: 400 };
    for (const u of w.wingmen) u.pos = { x: 700, y: 400 };
    assert.equal(executeExploreCommand(w, { id: "extract" }).status, "done");
    for (let t = 0; t < w.balance.boardingLiftOffDelaySec + 2 && w.phase === "sortie"; t += 0.1) tickWorld(w, 0.1, idleInput());
    assert.equal(w.phase, "result");
  };
  assert.deepEqual(begin(false).wingmen.map((u) => u.instanceId), ["m2", "m3"], "wing-a = m2, wing-b = m3");

  // (1) wingman shot down, then 撤退 (abort): it is destroyed, the others keep today's flat wear
  const baseAbort = begin(false);
  assert.equal(executeExploreCommand(baseAbort, { id: "abort" }).status, "done");
  assert.deepEqual(wear(baseAbort), { m1: 80, m2: 80, m3: 80 }, "no death: flat abort wear (20) as today");
  const abortW = begin(false);
  shootDown(abortW.wingmen[0]!);
  assert.equal(executeExploreCommand(abortW, { id: "abort" }).status, "done");
  const abortPayload = exploreReturnPayload(abortW)!;
  assert.equal(abortPayload.returnKind, "abort");
  assert.deepEqual(wear(abortW), { m1: 80, m2: 0, m3: 80 }, "survivors unchanged vs today");
  assert.deepEqual(abortPayload.wreckedMechInstanceIds, ["m2"]);
  const m2Wear = buildSortieOutcome(abortW)!.mechWear.find((r) => r.instanceId === "m2")!;
  assert.deepEqual(
    [m2Wear.durabilityBefore, m2Wear.durabilityAfter, m2Wear.wearApplied, m2Wear.statusAfter],
    [100, 0, 100, "destroyed"],
  );

  // (2) leader shot down: today's immediate fail stays, and the leader mech comes back destroyed
  const leaderW = begin(false);
  shootDown(leaderW.leader);
  tickWorld(leaderW, 0.05, idleInput());
  assert.equal(leaderW.phase, "result");
  assert.equal(leaderW.failReason, "leader_down");
  assert.equal(returnKindFromWorld(leaderW), "fail");
  assert.deepEqual(wear(leaderW), { m1: 0, m2: 65, m3: 65 }, "leader destroyed, survivors flat fail wear (35)");
  assert.deepEqual(exploreReturnPayload(leaderW)!.wreckedMechInstanceIds, ["m1"]);
  assert.ok(leaderW.logs.some((l) => l.text === "隊長撃破。作戦失敗。"), "same fail log as today");

  // (3) 帰還 (extract) with a shot-down wingman: destroyed; not a left-behind row
  const baseExtract = begin(false);
  extractHome(baseExtract);
  assert.deepEqual(wear(baseExtract), { m1: 85, m2: 85, m3: 85 }, "no death: flat extract wear (15) as today");
  const extractW = begin(false);
  shootDown(extractW.wingmen[1]!);
  extractHome(extractW);
  assert.equal(extractW.extracted, true);
  assert.deepEqual(wear(extractW), { m1: 85, m2: 85, m3: 0 });
  assert.deepEqual(exploreReturnPayload(extractW)!.wreckedMechInstanceIds, ["m3"]);
  assert.deepEqual(extractW.leftBehind ?? [], [], "a wreck is not left behind");

  // (4) circuit durability buffer still only softens the survivors' wear
  const bufW = begin(false);
  bufW.circuitDurabilityBuffer = 10;
  const bufBase = begin(false);
  bufBase.circuitDurabilityBuffer = 10;
  assert.equal(executeExploreCommand(bufBase, { id: "abort" }).status, "done");
  shootDown(bufW.wingmen[0]!);
  assert.equal(executeExploreCommand(bufW, { id: "abort" }).status, "done");
  const bufBaseWear = wear(bufBase);
  assert.deepEqual(wear(bufW), { m1: bufBaseWear.m1, m2: 0, m3: bufBaseWear.m3 }, "buffer: survivors as today, wreck 0");
  assert.ok(bufBaseWear.m1! > 80, "buffer reduced the flat wear");

  // (5) via Invade: the destroyed mech's circuit drops on the sortie cell, hull stays destroyed
  const viaStore = memStore();
  const viaHub = makeHub();
  assert.ok(shared.saveHubSaveToLocalStorage(viaHub, viaStore));
  const via = begin(true, viaHub);
  assert.deepEqual(via.sortieLocation, { frontSeed: 4242, cell: { sx: 2, sy: -1 } });
  shootDown(via.wingmen[0]!);
  assert.equal(executeExploreCommand(via, { id: "abort" }).status, "done");
  assert.deepEqual(wreckCircuitResultLines(via), ["大破した m2 の回路（c_down）は前線マス (2, -1) に落ちた"]);
  const viaSave = saveSortieResultToHub(via, viaStore);
  assert.equal(viaSave.status, "saved");
  const viaSaved = shared.normalizeHubSnapshot(shared.loadHubSaveFromLocalStorage(viaStore)!.hub);
  const hull = viaSaved.fleet.find((m) => m.instanceId === "m2")!;
  assert.equal(hull.status, "destroyed");
  assert.equal(hull.durability, 0);
  assert.equal(viaSaved.fleet.find((m) => m.instanceId === "m1")!.durability, 80);
  assert.equal(viaSaved.fleet.find((m) => m.instanceId === "m3")!.status, "operational");
  assert.equal(viaSaved.circuits.some((c) => c.circuitId === "c_down"), false);
  assert.equal(viaSaved.fieldDrops.length, 1);
  assert.equal(viaSaved.fieldDrops[0]!.cause, "wreck_not_carried");
  assert.equal(viaSaved.fieldDrops[0]!.fromMechInstanceId, "m2");
  assert.equal(viaSaved.fieldDrops[0]!.frontSeed, 4242);
  assert.deepEqual(viaSaved.fieldDrops[0]!.cell, { sx: 2, sy: -1 });
  assert.equal(viaSaved.fieldDrops[0]!.circuit.circuitId, "c_down");
  assert.deepEqual(viaSaved.lostMechs, []);

  // not via Invade: the circuit is lost (U7), hull destroyed
  const directStore = memStore();
  assert.ok(shared.saveHubSaveToLocalStorage(makeHub(), directStore));
  const direct = begin(false);
  shootDown(direct.wingmen[0]!);
  assert.equal(executeExploreCommand(direct, { id: "abort" }).status, "done");
  assert.deepEqual(wreckCircuitResultLines(direct), ["Invade を通らない出撃のため、大破した m2 の回路（c_down）は失われた"]);
  assert.equal(saveSortieResultToHub(direct, directStore).status, "saved");
  const directSaved = shared.normalizeHubSnapshot(shared.loadHubSaveFromLocalStorage(directStore)!.hub);
  assert.equal(directSaved.fleet.find((m) => m.instanceId === "m2")!.status, "destroyed");
  assert.equal(directSaved.fieldDrops.length, 0);
  assert.equal(directSaved.circuits.some((c) => c.circuitId === "c_down"), false);

  // (6) once per sortieId: direct save again, then trade's 格納庫 URL path → no change
  const before = viaStore.getItem(shared.HUB_SAVE_STORAGE_KEY);
  assert.equal(saveSortieResultToHub(via, viaStore).status, "already_applied");
  assert.equal(viaStore.getItem(shared.HUB_SAVE_STORAGE_KEY), before);
  const viaPayload = exploreReturnPayload(via)!;
  const urlPayload = parseExploreToHubWearSearch(new URL(hubWearHandoffUrl(via)!).search)!;
  assert.equal(urlPayload.sortieId, viaPayload.sortieId);
  assert.deepEqual(urlPayload.wreckedMechInstanceIds, ["m2"]);
  assert.equal(shared.applyExploreReturnToHub(viaSaved, urlPayload).applied, false);
  // trade path first on a fresh hub: applied once, then skipped
  const fresh = makeHub();
  const first = shared.applyExploreReturnToHub(fresh, urlPayload);
  assert.equal(first.applied, true);
  assert.equal(first.hub.fleet.find((m) => m.instanceId === "m2")!.status, "destroyed");
  assert.equal(shared.applyExploreReturnToHub(first.hub, urlPayload).applied, false);

  // (7) re-sortie from the save leaves the destroyed mech out (existing rule)
  const re = resortieSearch(deploySearch(true), viaSaved, via.deployedInstanceIds);
  assert.ok(re);
  assert.equal(re!.deployedInstanceIds.includes("m2"), false);
  console.log("explore 項目5-1 sortie wrecks ok");
}
