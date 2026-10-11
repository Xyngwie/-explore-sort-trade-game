/**
 * Sortie / result snapshots for the one shared checkpoint key.
 * Enemies, bullets, and terrain (cover) are omitted from an operation result.
 */
import type { World } from "./types";
import { backfillCircuitPlayState, type CircuitPlayState } from "./circuitPlay";

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
  // #270: JSON turns the circuit fog Uint8Array into a plain object; rebuild it.
  const play = world.circuitPlay as { fogOpen?: unknown } | undefined;
  if (play && play.fogOpen != null && !(play.fogOpen instanceof Uint8Array)) {
    const raw = play.fogOpen;
    const vals = Array.isArray(raw)
      ? raw
      : typeof raw === "object"
        ? Object.keys(raw as object)
            .sort((x, y) => Number(x) - Number(y))
            .map((k) => (raw as Record<string, unknown>)[k])
        : [];
    play.fogOpen = Uint8Array.from(vals.map((v) => (v ? 1 : 0)));
  }
  // PR-B: fill the release-scale / wing-move state a pre-PR-B checkpoint lacks.
  backfillCircuitPlayState(world.circuitPlay as Partial<CircuitPlayState> | undefined);
  return world;
}
