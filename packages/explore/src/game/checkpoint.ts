/**
 * Sortie / result snapshots for the one shared checkpoint key.
 * Enemies, bullets, and terrain (cover) are omitted from an operation result.
 */
import type { World } from "./types";

export function snapshotSortieWorld(world: World): unknown {
  return JSON.parse(JSON.stringify(world)) as unknown;
}

export function snapshotResultWorld(world: World): unknown {
  const copy = JSON.parse(JSON.stringify(world)) as World;
  copy.enemies = [];
  copy.bullets = [];
  copy.coverObjects = [];
  copy.phase = "result";
  return copy;
}

export function worldFromCheckpointBody(body: unknown): World | null {
  if (!body || typeof body !== "object") return null;
  const world = body as World;
  if (!world.leader || !world.balance) return null;
  if (world.phase !== "briefing" && world.phase !== "sortie" && world.phase !== "result") {
    return null;
  }
  world.wingmen = world.wingmen ?? [];
  world.enemies = world.enemies ?? [];
  world.containers = world.containers ?? [];
  world.bullets = world.bullets ?? [];
  world.logs = world.logs ?? [];
  return world;
}
