/**
 * Item 5-3: sortie restore matches the cut point. Result resume is not the hub.
 */
import { createHubSave, serializeHubSave, HUB_SAVE_STORAGE_KEY, INITIAL_HUB, createOwnedMech } from "@estg/shared";
import {
  exploreBackAction,
  exploreBootFromCheckpoint,
  readSortieCheckpoint,
  writeSortieSnapshot,
  SORTIE_PAUSE_LABEL,
} from "@estg/shared";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { tickWorld } from "./game/sim";
import {
  snapshotResultWorld,
  snapshotSortieWorld,
  worldFromCheckpointBody,
} from "./game/checkpoint";
import { resultHeading } from "./game/rescue";
import { hubWearHandoffUrl, sortHandoffUrl, toExploreResult } from "./game/outcome";
import type { World } from "./game/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mem(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  } as Storage;
}

{
  const world = createWorld(bootstrapFromSearch("?deployableMechs=2&startingAmmo=30"));
  startSortie(world);
  const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };
  tickWorld(world, 0.05, idle);
  world.timeLeft = 123.5;
  world.leader.pos = { x: 111, y: 222 };
  world.leader.heading = 1.25;
  if (world.enemies[0]) world.enemies[0].pos = { x: 30, y: 40 };
  const marker = "ENEMY_KEEP";
  if (world.enemies[0]) world.enemies[0].name = marker;
  world.bullets.push({
    alive: true,
    pos: { x: 5, y: 6 },
    vel: { x: 1, y: 0 },
    ttl: 1,
    damage: 2,
    fromEnemy: false,
    ownerId: "leader",
  });

  const snap = snapshotSortieWorld(world);
  const restored = worldFromCheckpointBody(snap);
  assert(restored, "sortie snapshot restores");
  assert(JSON.stringify(snapshotSortieWorld(restored!)) === JSON.stringify(snap), "sortie restore matches");
  assert(restored!.timeLeft === world.timeLeft, "clock matches");
  assert(restored!.leader.pos.x === 111 && restored!.leader.pos.y === 222, "leader pos matches");
  assert(restored!.leader.heading === world.leader.heading, "heading matches");
  assert(restored!.enemies.length === world.enemies.length, "enemy count matches");
  assert(restored!.bullets.length === world.bullets.length, "bullets match");
  assert(JSON.stringify(restored).includes(marker), "sortie keeps enemies");

  const before = world.timeLeft;
  const paused = true;
  if (!paused) tickWorld(world, 0.05, idle);
  assert(world.timeLeft === before, "paused frame does not advance the clock");

  const store = mem();
  assert(writeSortieSnapshot("sortie", snap, store) === true, "writes sortie");
  const boot = exploreBootFromCheckpoint(readSortieCheckpoint(store));
  assert(boot.action === "sortie", "reload stays in the sortie");
}

{
  const world = createWorld(
    bootstrapFromSearch("?deployedInstanceIds=cap,wing&deployableMechs=2&startingAmmo=20"),
  );
  startSortie(world);
  world.phase = "result";
  world.extracted = true;
  world.salvaged = 2;
  world.rescueFeeCredits = 40;
  world.leader.alive = true;
  const wing = world.wingmen[0];
  if (wing) {
    wing.alive = false;
    wing.hp = 0;
    wing.pos = { x: 77, y: 88 };
    wing.heading = 0.5;
  }
  const enemyName = "ENEMY_DROP";
  if (world.enemies[0]) world.enemies[0].name = enemyName;
  world.bullets.push({
    alive: true,
    pos: { x: 1, y: 1 },
    vel: { x: 0, y: 1 },
    ttl: 1,
    damage: 1,
    fromEnemy: true,
    ownerId: "enemy",
  });
  world.coverObjects = [{ id: "cover-terrain", pos: { x: 12, y: 12 }, radius: 10 }];

  const result = snapshotResultWorld(world) as World;
  assert(result.enemies.length === 0, "result drops enemies");
  assert(result.bullets.length === 0, "result drops bullets");
  assert((result.coverObjects ?? []).length === 0, "result drops terrain");
  assert(!JSON.stringify(result).includes(enemyName), "enemy name is not stored");
  if (wing) {
    const kept = result.wingmen.find((u) => u.id === wing.id);
    assert(kept != null, "unit state kept");
    assert(kept!.pos.x === 77 && kept!.pos.y === 88, "wreck position kept");
  }
  assert(result.salvaged === 2, "unopened containers kept");
  assert(result.rescueFeeCredits === 40, "cost kept");
  assert(resultHeading(result) === resultHeading(world), "heading kept");
  assert(sortHandoffUrl(result) === sortHandoffUrl(world), "仕分へ kept");
  assert(hubWearHandoffUrl(result) === hubWearHandoffUrl(world), "格納庫へ kept");
  assert(toExploreResult(result).salvagedContainers === toExploreResult(world).salvagedContainers, "containers match");
  assert(result.deployedInstanceIds.join() === world.deployedInstanceIds.join(), "再出撃 squad kept");

  const store = mem();
  assert(writeSortieSnapshot("result", result, store) === true, "writes result");
  const boot = exploreBootFromCheckpoint(readSortieCheckpoint(store));
  assert(boot.action === "result", "result resume is not the hub");
  assert(SORTIE_PAUSE_LABEL === "一時停止中 — タップで再開", "pause copy");
}

{
  const fleet = [createOwnedMech("mech_gen1", { instanceId: "back1", durability: 80 })];
  const store = mem();
  store.setItem(
    HUB_SAVE_STORAGE_KEY,
    serializeHubSave(createHubSave({ ...INITIAL_HUB, fleet })),
  );
  const before = store.getItem(HUB_SAVE_STORAGE_KEY);
  for (const phase of ["briefing", "sortie", "result"] as const) {
    const action = exploreBackAction(phase);
    assert(action.wipe === false, `${phase} back does not wipe`);
  }
  assert(store.getItem(HUB_SAVE_STORAGE_KEY) === before, "back leaves HubSave unchanged");
  assert(exploreBackAction("sortie").block === true, "sortie back is blocked");
  assert(exploreBackAction("briefing").block === false, "briefing back stays enabled");
  assert(exploreBackAction("result").block === false, "result back stays enabled");
}

console.log("explore checkpoint.selftest ok");
