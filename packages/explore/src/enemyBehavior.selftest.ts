import { getCoverObjects } from "./game/coverObjects";
import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  normalizeHubSnapshot,
  buildExploreToHubWearUrl,
  parseExploreToHubWearSearch,
  applyExploreReturnToHub,
  classifyCircuit,
  createHubSave,
  serializeHubSave,
  deserializeHubSave,
  upsertCircuitInHub,
} from "@estg/shared";
import { createWorld, bootstrapFromSearch, startSortie } from "./game/world";
import { makeEnemyIdentity } from "./game/enemyIdentity";
import {
  initializeEnemy,
  actionCircuit,
  enemyMode,
  lootEnemy,
  nearestEnemyTarget,
  moveEnemy,
  handleEnemyDeaths,
  collectSupplies,
  scheduleRecall,
  spawnRecall,
  backfillSplitSupplies,
  SUPPLY_SPLIT_HALF_GAP,
  splitSupplyDrops,
} from "./game/enemyBehavior";
import { updateEnemies, tickWorld, requestExtract } from "./game/sim";
import {
  snapshotSortieWorld,
  snapshotResultWorld,
  worldFromCheckpointBody,
} from "./game/checkpoint";
import { enemyWreckReturns } from "./game/enemyRecovery";
import {
  attachCircuitPlay,
  startWreckPickup,
  stepCircuitPlay,
} from "./game/circuitPlay";
const world = () => {
  const w = createWorld(bootstrapFromSearch(""));
  startSortie(w);
  // Projectile/obstacle physics is tested separately; fixed AI/resource fixtures need unobstructed positions.
  getCoverObjects(w).splice(0);
  return w;
};
function recoverer() {
  const w = world();
  w.enemies = w.enemies.slice(0, 1);
  const e = w.enemies[0]!;
  e.enemyIdentity!.circuits[0]!.effectKey = "recover";
  initializeEnemy(e, () => 0.1);
  e.pos = { x: 500, y: 500 };
  w.leader.pos = { x: 100, y: 100 };
  w.wingmen = [];
  return { w, e };
}
for (const [n, count, side] of [
  [0, 1, 2],
  [2, 1, 2],
  [3, 2, 3],
  [5, 2, 3],
  [6, 3, 4],
  [8, 3, 4],
]) {
  const id = makeEnemyIdentity({ id: "test", maxHp: 100 }, () => 0.5, n);
  assert.equal(id.circuits.length, count);
  assert.ok(
    id.circuits.every(
      (c) =>
        c.side === side &&
        c.effect >= side * side * 0.3 &&
        c.effect <= side * side,
    ),
  );
}
{
  const { e } = recoverer();
  const a = e.enemyIdentity!.circuits[0]!;
  const b = { ...a, circuitId: "b", effectKey: "raid_attack" };
  e.enemyIdentity!.circuits = [a, b];
  assert.equal(actionCircuit(e), a);
  b.effect = a.effect + 1;
  assert.equal(actionCircuit(e), b);
  assert.equal(enemyMode(e), "rush");
}
{
  const { w, e } = recoverer();
  w.containers = Array.from({ length: 3 }, (_, i) => ({
    id: `crate${i}`,
    pos: { ...e.pos },
    taken: false,
    discovered: false,
    glowT: 0,
  }));
  const s = e.enemyState!;
  e.hp = 42;
  s.ammo = 0;
  s.activity = 40;
  lootEnemy(w, e, 7.99, 70);
  assert.equal(s.ammo, 0);
  lootEnemy(w, e, 0.01, 70);
  assert.equal(s.ammo, 28);
  assert.equal(s.activity, s.capacity);
  assert.equal(e.hp, 42);
  assert.equal(s.cargo, 1);
  lootEnemy(w, e, 8, 70);
  assert.equal(s.cargo, 2);
  assert.equal(w.containers[2]!.taken, false);
  s.ammo = 0;
  s.activity = 50;
  lootEnemy(w, e, 8, 70);
  assert.equal(s.ammo, 28);
  assert.equal(s.activity, s.capacity);
  assert.equal(s.cargo, 2);
  assert.equal(w.containers[2]!.taken, false);
  s.ammo = 4;
  lootEnemy(w, e, 8, 70);
  assert.equal(s.ammo, 28);
  assert.equal(e.hp, 42);
  e.enemyIdentity!.circuits = [];
  s.ammo = 0;
  assert.equal(lootEnemy(w, e, 8, 70), false);
  assert.equal(s.ammo, 0);
}
{
  const { w, e } = recoverer();
  const s = e.enemyState!;
  s.activity = s.capacity * 0.1;
  e.pos = { x: 400, y: 400 };
  w.leader.pos = { x: 440, y: 400 };
  e.heading = 0; // facing PR1: already aimed at the leader
  s.ammo = 28;
  moveEnemy(w, e, { x: 500, y: 400 }, 70, 1);
  assert.deepEqual(e.pos, { x: 400, y: 400 });
  updateEnemies(w, 1);
  assert.ok(s.ammo < 28);
  assert.ok(w.bullets.length > 0);
  const enemy2 = {
    ...e,
    id: "enemy-other",
    pos: { x: 405, y: 400 },
    enemyState: { ...s },
    alive: true,
  };
  w.enemies.push(enemy2);
  assert.equal(nearestEnemyTarget(w, e), enemy2);
  s.activity = 200;
  moveEnemy(w, e, { x: 600, y: 400 }, 70, 2);
  assert.equal(s.activity, 199);
  moveEnemy(w, e, null, 70, 10);
  assert.equal(s.activity, 199);
}
{
  const { w, e } = recoverer();
  e.enemyState!.ammo = 17;
  e.enemyState!.activity = 61;
  e.enemyState!.cargo = 2;
  e.alive = false;
  e.hp = 0;
  w.containers = [];
  handleEnemyDeaths(w);
  handleEnemyDeaths(w);
  // 10/17 神宮: split into an ammo drop and a power drop side by side (was one combined drop).
  assert.equal(w.enemySupplies!.length, 2);
  assert.equal(w.containers.length, 2);
  const [am, pw] = w.enemySupplies!;
  assert.equal(am!.kind, "ammo"); assert.equal(am!.ammo, 17); assert.equal(am!.power, 0);
  assert.equal(pw!.kind, "power"); assert.equal(pw!.power, 61); assert.equal(pw!.ammo, 0);
  assert.equal(am!.pos.y, e.pos.y); assert.equal(pw!.pos.y, e.pos.y);
  assert.ok(am!.pos.x < e.pos.x && pw!.pos.x > e.pos.x, "side by side around the wreck");
  w.leader.pos = { ...e.pos };
  w.leader.instanceId = "player";
  w.currentAmmo.player = 27;
  w.mechBattery.player = { capacity: 300, activity: 299 };
  collectSupplies(w);
  assert.equal(w.currentAmmo.player, 28);
  assert.equal(w.mechBattery.player.activity, 300);
  // Same pickup result as the combined drop: one unit standing there takes both.
  assert.equal(w.enemySupplies!.find((d) => d.kind === "ammo")!.ammo, 16);
  assert.equal(w.enemySupplies!.find((d) => d.kind === "power")!.power, 60);
}
{
  // A resource of 0 makes no drop.
  const { w, e } = recoverer();
  e.enemyState!.ammo = 0;
  e.enemyState!.activity = 40;
  e.alive = false; e.hp = 0;
  handleEnemyDeaths(w);
  assert.equal(w.enemySupplies!.length, 1);
  assert.equal(w.enemySupplies![0]!.kind, "power");
  assert.equal(w.enemySupplies![0]!.pos.x, e.pos.x, "a lone drop sits at the wreck");
  assert.ok(!w.enemySupplies!.some((d) => d.id.endsWith("-ammo")));
}
{
  // Old checkpoint: combined drop → two side-by-side drops; 0 side skipped; faint image follows.
  const w = { enemySupplies: [
    { id: "supply-a", pos: { x: 100, y: 50 }, ammo: 5, power: 9 },
    { id: "supply-b", pos: { x: 200, y: 50 }, ammo: 3, power: 0 },
  ], squadIntel: { ghosts: { "supply:supply-a": { kind: "supply", id: "supply-a", pos: { x: 100, y: 50 }, t: 12 } } } } as any;
  backfillSplitSupplies(w);
  assert.deepEqual(w.enemySupplies.map((d: any) => [d.id, d.kind, d.pos.x, d.ammo, d.power]), [
    ["supply-a-ammo", "ammo", 100 - SUPPLY_SPLIT_HALF_GAP, 5, 0],
    ["supply-a-power", "power", 100 + SUPPLY_SPLIT_HALF_GAP, 0, 9],
    ["supply-b-ammo", "ammo", 200, 3, 0],
  ]);
  assert.equal(w.squadIntel.ghosts["supply:supply-a"], undefined);
  assert.equal(w.squadIntel.ghosts["supply:supply-a-ammo"].t, 12);
  assert.equal(w.squadIntel.ghosts["supply:supply-a-power"].pos.x, 100 + SUPPLY_SPLIT_HALF_GAP);
  backfillSplitSupplies(w); // idempotent
  assert.equal(w.enemySupplies.length, 3);
}
{
  // Enemies: ambush still heads for the power drop, and standing on it takes the ammo drop next to it too.
  const { w, e } = recoverer();
  w.enemySupplies = splitSupplyDrops("supply-x", { x: e.pos.x + 50, y: e.pos.y }, 5, 30);
  const pd = w.enemySupplies.find((d) => d.kind === "power")!;
  e.pos = { ...pd.pos };
  e.enemyState!.ammo = 0;
  e.enemyState!.activity = 0;
  collectSupplies(w);
  assert.equal(e.enemyState!.ammo, 5);
  assert.equal(e.enemyState!.activity, 30);
  assert.equal(w.enemySupplies.length, 0, "both emptied drops are removed");
}
{
  const { w, e } = recoverer();
  attachCircuitPlay(w, null, false);
  e.alive = false;
  e.hp = 0;
  w.recoveredEnemyUnits = [e];
  const rows = enemyWreckReturns(w);
  assert.equal(rows.length, 1);
  const payload = {
    returnKind: "extract" as const,
    mechWear: [],
    sortieId: "enemy-test",
    enemyWrecks: rows,
  };
  const url = buildExploreToHubWearUrl(payload, "http://localhost/");
  const parsed = parseExploreToHubWearSearch(new URL(url).search)!;
  assert.equal(parsed.enemyWrecks!.length, 1);
  const first = applyExploreReturnToHub(
    normalizeHubSnapshot(INITIAL_HUB),
    parsed,
  );
  const circuit = first.hub.circuits.find(
    (c) => c.circuitId === e.enemyIdentity!.circuits[0]!.circuitId,
  )!;
  assert.equal(
    classifyCircuit(circuit).effect,
    e.enemyIdentity!.circuits[0]!.effect,
  );
  assert.equal(
    first.hub.fleet.find((m) => m.instanceId === rows[0]!.instanceId)!.status,
    "destroyed",
  );
  const round = deserializeHubSave(serializeHubSave(createHubSave(first.hub)))!;
  assert.equal(
    classifyCircuit(
      round.hub.circuits.find((c) => c.circuitId === circuit.circuitId)!,
    ).effect,
    circuit.enemyEffect,
  );
  const second = applyExploreReturnToHub(first.hub, parsed);
  assert.equal(second.applied, false);
  assert.deepEqual(second.hub, first.hub);
  const restored = worldFromCheckpointBody(snapshotResultWorld(w))!;
  assert.deepEqual(enemyWreckReturns(restored), rows);
  const old = { ...circuit };
  delete old.enemyEffect;
  assert.ok(
    normalizeHubSnapshot({ ...first.hub, circuits: [old] }).circuits.length > 0,
  );
}
{
  const w = world();
  w.invadeSector = {
    sectorX: 0,
    sectorY: 0,
    density: 1,
    intelFlags: [],
    neighborCount: 8,
  };
  w.boarding = {
    center: { x: 100, y: 100 },
    radius: 60,
    requestedAt: 0,
    cargoArrived: false,
  };
  scheduleRecall(w, () => 0.5);
  assert.equal(w.recallSpawns!.length, 8);
  assert.ok(w.recallSpawns!.every((e) => e.at === 7.5));
  const back = worldFromCheckpointBody(snapshotSortieWorld(w))!;
  scheduleRecall(back, () => 0);
  assert.deepEqual(back.recallSpawns, w.recallSpawns);
  const n = back.enemies.length;
  back.elapsed = 8;
  spawnRecall(back);
  assert.equal(back.enemies.length, n + 8);
  spawnRecall(back);
  assert.equal(back.enemies.length, n + 8);
  assert.ok(
    back.enemies
      .slice(n)
      .every(
        (e) =>
          e.enemyIdentity!.circuits.length === 0 &&
          Math.hypot(e.pos.x - 100, e.pos.y - 100) > 280,
      ),
  );
  const zero = world();
  scheduleRecall(zero);
  assert.deepEqual(zero.recallSpawns, []);
  const old = world();
  delete old.enemies[0]!.enemyIdentity;
  const oldBack = worldFromCheckpointBody(snapshotSortieWorld(old))!;
  assert.ok(oldBack.enemies.every((e) => e.enemyState && e.enemyIdentity));
  const previousId = w.enemies[0]!.id;
  startSortie(w);
  assert.notEqual(w.enemies[0]!.id, previousId);
  const fresh = world();
  assert.notEqual(fresh.enemies[0]!.id, w.enemies[0]!.id);
  assert.notEqual(
    fresh.enemies[0]!.enemyIdentity!.circuits[0]!.circuitId,
    w.enemies[0]!.enemyIdentity!.circuits[0]!.circuitId,
  );
}
{
  const { w, e } = recoverer();
  attachCircuitPlay(w, null, false);
  e.alive = false; e.hp = 0;
  w.leader.pos = { ...e.pos };
  assert.equal(startWreckPickup(w, w.leader, e.id), "started");
  stepCircuitPlay(w, 7.99);
  assert.equal(w.circuitPlay!.carry[w.leader.id]?.length ?? 0, 0);
  stepCircuitPlay(w, .01);
  assert.deepEqual(w.circuitPlay!.carry[w.leader.id], [e.id]);
  assert.equal(requestExtract(w), true);
  // Take-off runs the real recovery path, not a manually assigned result.
  tickWorld(w, w.balance.boardingLiftOffDelaySec, {move:{x:0,y:0},clickMove:null,fire:false,interact:false});
  assert.equal(w.phase, "result");
  assert.equal(w.recoveredEnemyUnits!.length, 1);
  assert.equal(enemyWreckReturns(w)[0]!.circuits.length, 1);
}
console.log(
  "enemy behavior / looting / drops / recovery / recall / compatibility: PASS",
);

{
  const base=createWorld(bootstrapFromSearch('?sectorX=0&sectorY=0&density=.1'));
  const high=createWorld(bootstrapFromSearch('?sectorX=0&sectorY=0&density=.1&invadeRank=84'));
  const factor=Math.pow(1.01,84);
  assert.equal(high.balance.enemyDamage,base.balance.enemyDamage*factor);
  assert.equal(high.enemies[0]!.maxHp,base.enemies[0]!.maxHp*factor);
  assert.equal(high.leader.maxHp,base.leader.maxHp);
  startSortie(high);assert.equal(high.enemies[0]!.maxHp,base.enemies[0]!.maxHp*factor,'restart does not compound rank scaling');
  const restored=worldFromCheckpointBody(snapshotSortieWorld(high))!;
  assert.equal(restored.invadeSector!.invadeRank,84);assert.equal(restored.balance.enemyDamage,high.balance.enemyDamage);
  console.log('Explore rank damage, HP, unchanged squad and checkpoint PASS');
}

{
  const boot = bootstrapFromSearch('?sectorX=0&sectorY=0&density=.1&neighborCount=8&invadeRank=1');
  const world = createWorld(boot); startSortie(world);
  assert.equal(world.invadeSector!.neighborCount, 8);
  assert.equal(world.enemies[0]!.enemyIdentity!.circuits.length, 3);
  assert.ok(world.enemies[0]!.enemyIdentity!.circuits.every(c => c.side === 4));
  assert.equal(requestExtract(world), true);
  assert.equal(world.recallSpawns!.length, 8, 'real handoff cell number schedules all eight strays');
  console.log('Invade cell number handoff -> circuit strength and recall wave PASS');
}
