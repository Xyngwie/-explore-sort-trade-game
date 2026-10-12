/**
 * Enemy PR1 (feat/enemy-id-stats, CIRCUIT_SQUAD_DESIGN_V0 §11 E1 = C / F1 = B):
 * each enemy carries a model number, durability and false-board circuit data.
 * Data only — no behaviour (PR2). The UI shows only 「所属不明」 (tap and info
 * panel); circuit contents stay hidden until brought home (E4, PR4).
 *
 * Decided 2026-10-12 23:48 神宮 (CIRCUIT_SQUAD_DESIGN_V0 §11.2a, all A): every enemy is `mech_gen1`;
 * durability = the enemy's current HP (no balance change); one 2×2 false-board
 * circuit with a random false-board effect type, effect value 0 (no effect yet).
 */
import { FALSE_BOARD_EFFECT_KEYS, type MechId } from "@estg/shared";
import type { Unit, World } from "./types";

export const ENEMY_UNKNOWN_JA = "所属不明";
export const ENEMY_TAG_SEC = 3;

export type EnemyCircuitData = { circuitId: string; side: number; effectKey: string; effect: number; trueBoard: false };
export type EnemyIdentity = { modelId: MechId; durability: number; circuits: EnemyCircuitData[] };

export function makeEnemyIdentity(unit: Pick<Unit, "id" | "maxHp">, rng: () => number = Math.random): EnemyIdentity {
  const key = FALSE_BOARD_EFFECT_KEYS[Math.floor(rng() * FALSE_BOARD_EFFECT_KEYS.length) % FALSE_BOARD_EFFECT_KEYS.length]!;
  return {
    modelId: "mech_gen1",
    durability: Math.max(1, Math.round(unit.maxHp)),
    circuits: [{ circuitId: `enemy-circ-${unit.id}`, side: 2, effectKey: key, effect: 0, trueBoard: false }],
  };
}

/** Old checkpoints (no identity on enemies) get one on load; existing ones are kept. */
export function backfillEnemyIdentities(world: World, rng: () => number = Math.random): void {
  for (const e of world.enemies ?? []) {
    if (e.kind === "enemy" && !e.enemyIdentity) e.enemyIdentity = makeEnemyIdentity(e, rng);
  }
}

/** F1 = B: the UI label for any enemy. Never the model / circuits. */
export function enemyDisplayNameJa(_e: Unit): string {
  return ENEMY_UNKNOWN_JA;
}

/** Nearest live enemy within `max` of `pt` (only ones the squad can see). */
export function enemyAt(world: World, pt: { x: number; y: number }, max: number, seen: (e: Unit) => boolean): Unit | null {
  let best: Unit | null = null;
  let bd = max;
  for (const e of world.enemies) {
    if (!e.alive || !seen(e)) continue;
    const d = Math.hypot(e.pos.x - pt.x, e.pos.y - pt.y);
    if (d <= bd) { bd = d; best = e; }
  }
  return best;
}

/** F1 = B: a tap on an enemy shows 「所属不明」 over it (and in the info panel) for a few seconds. */
export function noteEnemyTap(world: World, enemyId: string): void {
  world.enemyTag = { enemyId, t: ENEMY_TAG_SEC };
}

export function tickEnemyTag(world: World, dt: number): void {
  const tag = world.enemyTag;
  if (!tag) return;
  tag.t -= dt;
  const e = world.enemies.find((x) => x.id === tag.enemyId);
  if (tag.t <= 0 || !e || !e.alive) world.enemyTag = null;
}
