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
  circuitButtons,
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
import { isCommandUnlockedFor, isWingmanMobileFor } from "./game/commandUnlock";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import {
  INITIAL_HUB,
  circuitHEdgeIndex,
  circuitVEdgeIndex,
  edgeCount,
  encodeEdgeState,
  makeFalseOneByOne,
  makeRestoredTrueOneByOne,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  saveHubSaveToLocalStorage,
  type EdgeMark,
  type HubCircuitRecord,
  type OwnedMech,
} from "@estg/shared";
import { attackMul, rangeMul, visionMul } from "./game/circuitPlay";
import { rescueAbortFromHub } from "./game/rescue";
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
  assert.ok(world.leader.pos.x > x0, "Q3: captain without any circuit still walks (release)");
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

// ---------------------------------------------------------------------------
// #270 decisions (神宮 10/11–12): Q1 / Q3 / Q3a–c / Q4 and save compat.
// ---------------------------------------------------------------------------
function perimeter(n: number): string {
  const m = Array.from({ length: edgeCount(n, n) }, () => 0 as EdgeMark);
  for (let x = 0; x < n; x++) {
    m[circuitHEdgeIndex(n, n, x, 0)] = 1;
    m[circuitHEdgeIndex(n, n, x, n)] = 1;
  }
  for (let y = 0; y < n; y++) {
    m[circuitVEdgeIndex(n, n, 0, y)] = 1;
    m[circuitVEdgeIndex(n, n, n, y)] = 1;
  }
  return encodeEdgeState(m);
}
function mech(id: string, over: Partial<OwnedMech> = {}): OwnedMech {
  return { instanceId: id, catalogId: "mech_gen1", status: "operational", durability: 100, durabilityMax: 100, ...over } as OwnedMech;
}
function old2x2(id: string, to: string): HubCircuitRecord {
  return {
    circuitId: id,
    circuitBoard: { v: 1, cols: 2, rows: 2, edgeState: perimeter(2), puzzleId: "p0", outcome: "bypass" },
    restoreState: "bypass",
    origin: "legacy",
    equippedTo: to,
    outcome: "bypass",
  } as HubCircuitRecord;
}
function sortieWith(hubCircuits: HubCircuitRecord[], release: boolean, fleet: OwnedMech[] = [mech("cap"), mech("wa"), mech("wb")]) {
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  world.deployedInstanceIds = fleet.map((m) => m.instanceId);
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet, circuits: hubCircuits } as never);
  attachCircuitPlay(world, hub, release);
  return world;
}

// (a) compat: an old save with a 2×2 on the captain keeps it, and the captain walks (both modes).
for (const release of [true, false]) {
  const world = sortieWith([old2x2("old", "cap")], release);
  assert.equal(world.circuitPlay!.loadout.leader!.length, 1, "(a) captain keeps the 2×2");
  assert.ok(world.circuitPlay!.loadout.leader![0]!.effectKey, "(a) the 2×2 has an effectKey after normalize");
  const x0 = world.leader.pos.x;
  for (let i = 0; i < 10; i++) tickWorld(world, 0.05, { ...idle, move: { x: 1, y: 0 } });
  assert.ok(world.leader.pos.x > x0, `(a) captain with only a 2×2 walks (release=${release})`);
}

// Q1: effects are attached in all_unlocked too; the release-only extras stay off.
{
  const world = sortieWith([], false);
  assert.equal(world.circuitPlay!.rules, true);
  assert.equal(world.circuitPlay!.release, false);
  assert.equal(salvageSeconds(world), null, "all_unlocked keeps the current collect time");
  for (const id of ["move", "fire", "collect", "extract", "abort", "camp_set", "wing_escort", "wing_patrol", "wing_mobility"] as const) {
    assert.equal(isCommandUnlockedFor(world, id, id.startsWith("wing") ? "wing-a" : undefined), true, `all_unlocked: ${id}`);
  }
  assert.equal(isWingmanMobileFor(world, "wing-a"), true);
}

// 2×2+ effects are live in all_unlocked (e.g. a raid_attack normal action).
{
  const world = sortieWith([], false);
  world.circuitPlay!.loadout.leader = [classified({ effectKey: "raid_attack", r: 0.2, effect: 100 })];
  assert.ok(Math.abs(attackMul(world, "leader") - 1.2) < 1e-9, "2×2+ effect works without release");
}

// Q3: release — basic commands open with no circuit; the false 1×1 opens nothing.
{
  const world = sortieWith([{ ...makeFalseOneByOne("f1"), equippedTo: "cap" }], true);
  assert.equal(world.circuitPlay!.captainTrueOne, false);
  for (const id of ["move", "fire", "collect", "extract", "abort"] as const) {
    assert.equal(isCommandUnlockedFor(world, id), true, `Q3: ${id} needs no circuit`);
  }
  for (const id of ["wing_mobility", "camp_set", "wing_patrol", "wing_recover"] as const) {
    assert.equal(isCommandUnlockedFor(world, id, "wing-a"), false, `Q3: false 1×1 does not open ${id}`);
  }
  assert.equal(isWingmanMobileFor(world, "wing-a"), false);
  assert.equal(world.circuitPlay!.loadout.leader!.length, 1);
  const none = sortieWith([], true);
  assert.equal(isCommandUnlockedFor(none, "move"), true, "Q3: no circuit at all still moves");
  assert.equal(isCommandUnlockedFor(none, "extract"), true);
}

// Q3: a true 「4」 on the captain opens wing_mobility (and air support, Q3b); a 「4」 on a wingman makes it autonomous.
{
  const world = sortieWith([{ ...makeRestoredTrueOneByOne("t-cap"), equippedTo: "cap" }], true);
  assert.equal(world.circuitPlay!.captainTrueOne, true);
  assert.equal(isCommandUnlockedFor(world, "wing_mobility", "wing-a"), true, "Q3: captain 4 → wing_mobility");
  assert.equal(isWingmanMobileFor(world, "wing-a"), false, "captain 4 alone does not make wingmen autonomous");
  world.enemies[0]!.alive = true;
  assert.ok(circuitButtonsIds(world).includes("air_support"), "Q3b: captain 4 → air support button");
  world.leader.alive = false;
  assert.equal(isCommandUnlockedFor(world, "wing_mobility", "wing-a"), true, "5-2 9A: wing orders stay after the captain is wrecked");
  const wing = sortieWith([{ ...makeRestoredTrueOneByOne("t-wa"), equippedTo: "wa" }], true);
  assert.equal(isWingmanMobileFor(wing, "wing-a"), true, "Q3: wingman 4 → autonomous");
  assert.equal(isWingmanMobileFor(wing, "wing-b"), false);
  assert.equal(isCommandUnlockedFor(wing, "wing_mobility", "wing-a"), false, "wingman 4 does not open captain orders");
}

// Q3a / Q3c: false 1×1 on a wingman doubles attack / range / vision only in release.
{
  const fl = { ...makeFalseOneByOne("f-wa"), equippedTo: "wa" };
  const rel = sortieWith([fl], true);
  assert.equal(attackMul(rel, "wing-a"), 2);
  assert.equal(rangeMul(rel, "wing-a"), 2);
  assert.equal(visionMul(rel, "wing-a"), 2);
  const all = sortieWith([fl], false);
  assert.equal(attackMul(all, "wing-a"), 1, "Q3c: ×1 in all_unlocked");
  assert.equal(rangeMul(all, "wing-a"), 1);
  assert.equal(visionMul(all, "wing-a"), 1);
}

// Q4: a destroyed mech's circuits (even a 「4」) never load.
{
  const fleet = [mech("cap", { status: "destroyed", durability: 0 }), mech("wa")];
  const world = sortieWith([{ ...makeRestoredTrueOneByOne("t-dead"), equippedTo: "cap" }], true, fleet);
  assert.equal(world.circuitPlay!.captainTrueOne, false, "Q4: 4 on a destroyed mech opens nothing");
  assert.equal(isCommandUnlockedFor(world, "wing_mobility", "wing-a"), false);
}

// (d) compat: the 5-3 mid-sortie checkpoint keeps circuit state and the fog array survives JSON.
{
  const world = sortieWith([old2x2("old", "cap")], true);
  stepCircuitPlay(world, 0.05);
  world.circuitPlay!.cooldownSec = 123;
  const fogLen = world.circuitPlay!.fogOpen!.length;
  const restored = worldFromCheckpointBody(JSON.parse(JSON.stringify({ v: 1, kind: "sortie", body: snapshotSortieWorld(world) })).body)!;
  assert.ok(restored, "(d) checkpoint body restores");
  assert.ok(restored.circuitPlay!.fogOpen instanceof Uint8Array, "(d) fog is a Uint8Array again");
  assert.equal(restored.circuitPlay!.fogOpen!.length, fogLen);
  assert.equal(restored.circuitPlay!.cooldownSec, 123, "(d) air support cooldown survives");
  assert.equal(restored.circuitPlay!.release, true);
  for (let i = 0; i < 5; i++) tickWorld(restored, 0.05, idle);
  const legacy = snapshotSortieWorld(createWorld(bootstrapFromSearch(""))) as Record<string, unknown>;
  delete legacy.circuitPlay;
  const back = worldFromCheckpointBody(legacy)!;
  assert.ok(back, "(d) a pre-#270 checkpoint without circuitPlay restores");
  back.phase = "sortie";
  for (let i = 0; i < 5; i++) tickWorld(back, 0.05, idle);
}

// Technical check: air support charges HubSave mid-sortie; the rescue fees read the wallet afterwards.
{
  const mem = new Map<string, string>();
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  try {
    const fleet = [mech("cap"), mech("wa"), mech("wb")];
    const t4 = { ...makeRestoredTrueOneByOne("t-cap"), equippedTo: "cap" };
    saveHubSaveToLocalStorage(normalizeHubSnapshot({ ...INITIAL_HUB, credits: 1001, fleet, circuits: [t4] } as never));
    const world = sortieWith([t4], false, fleet);
    const enemy = world.enemies[0]!;
    enemy.alive = true;
    enemy.hp = 40;
    beginCircuitButton(world, "air_support");
    consumeCircuitClick(world, { ...enemy.pos });
    assert.equal(enemy.alive, false, "Q3b: air support strikes with a captain 4 (all_unlocked too)");
    assert.equal(loadHubSaveFromLocalStorage()!.hub.credits, 401, "Q3b: 600c charged once");
    assert.equal(loadHubSaveFromLocalStorage()!.hub.airSupportCooldownSec, 200, "Q3b: cooldown 200s");
    assert.equal(world.circuitPlay!.cooldownSec, 200);
    assert.ok(!circuitButtonsIds(world).includes("air_support"), "cooling down: no button");
    rescueAbortFromHub(world);
    assert.equal(world.rescueFeeCredits, 200, "rescue ½ uses the wallet after the charge (floor 401/2)");
    const poor = sortieWith([t4], false, fleet);
    const foe = poor.enemies[0]!;
    foe.alive = true;
    poor.circuitPlay!.cooldownSec = 0;
    beginCircuitButton(poor, "air_support");
    consumeCircuitClick(poor, { ...foe.pos });
    assert.equal(foe.alive, true, "under 600c: no strike");
    assert.equal(loadHubSaveFromLocalStorage()!.hub.credits, 401, "under 600c: nothing charged");
  } finally {
    g.localStorage = prev;
  }
}

function circuitButtonsIds(world: ReturnType<typeof createWorld>): string[] {
  return circuitButtons(world).map((b) => b.id);
}

console.log("circuitPlay.selftest ok");
