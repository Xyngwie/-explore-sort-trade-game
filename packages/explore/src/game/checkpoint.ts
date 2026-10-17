import { backfillEnemyState, backfillSplitSupplies } from "./enemyBehavior";
import { backfillEnemyIdentities } from "./enemyIdentity";
/**
 * Sortie / result snapshots for the one shared checkpoint key.
 * Enemies, bullets, and terrain (cover) are omitted from an operation result.
 */
import { MECH_BATTERY_DEFAULT_CAPACITY } from "@estg/shared";
import type { World } from "./types";
import { backfillCircuitPlayState, type CircuitPlayState } from "./circuitPlay";

export function snapshotSortieWorld(world: World): unknown {
  return JSON.parse(JSON.stringify(world)) as unknown;
}

export function snapshotResultWorld(world: World): unknown {
  const copy = JSON.parse(JSON.stringify(world)) as World;
  copy.enemies = [];
  // Recovered enemy identities survive the result checkpoint for a refused-write retry.
  copy.recoveredEnemyUnits = world.recoveredEnemyUnits ?? [];
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
  world.friendlyFire ??= { count: 0, byShooter: {} };
  // Enemy PR1: an old checkpoint has enemies without identity data.
  backfillEnemyIdentities(world);
  backfillEnemyState(world);
  backfillSplitSupplies(world); // 10/17: combined supply drops → ammo + power side by side
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
  restorePreBoostBattery(world);
  return world;
}

/**
 * fix/circuit-ammo-activity-refill: a checkpoint written before the fix holds
 * the circuit-boosted battery capacity in world.mechBattery (syncCaps used to
 * write it). Put the pre-boost value back (circuitPlay.baseBattery) so the
 * return does not save the boost; an over-300 value from a save that was
 * already inflated goes back to 300 (same one-time repair as HubSave M6).
 * Idempotent for checkpoints written after the fix.
 */
export function restorePreBoostBattery(world: World): void {
  const base = (world.circuitPlay as { baseBattery?: Record<string, number> } | undefined)?.baseBattery;
  const bats = world.mechBattery;
  if (!bats || typeof bats !== "object") return;
  for (const [inst, b] of Object.entries(bats)) {
    if (!b) continue;
    const pre = base?.[inst];
    let cap = typeof pre === "number" && pre > 0 ? Math.floor(pre) : b.capacity;
    if (cap > MECH_BATTERY_DEFAULT_CAPACITY) cap = MECH_BATTERY_DEFAULT_CAPACITY;
    if (base && typeof pre === "number") base[inst] = cap;
    b.capacity = cap; // activity is clamped to the capacity when the return is saved
  }
}
