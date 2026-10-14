/** Enemy identity: independently sampled per sortie. Circuit strength follows
 * the Invade cell number; contents stay hidden until the wreck comes home.
 * Existing checkpoint identities are kept, not rerolled on resume. */
import { weaponCategory, FALSE_BOARD_EFFECT_KEYS, type MechId } from "@estg/shared";
import type { Unit, World } from "./types";

export const ENEMY_UNKNOWN_JA = "所属不明";
export const ENEMY_TAG_SEC = 3;

export type EnemyCircuitData = {
  circuitId: string;
  side: number;
  effectKey: string;
  effect: number;
  trueBoard: false;
};
export type EnemyIdentity = {
  modelId: MechId;
  durability: number;
  circuits: EnemyCircuitData[];
};

export function makeEnemyIdentity(
  unit: Pick<Unit, "id" | "maxHp">,
  rng: () => number = Math.random,
  n = 0,
): EnemyIdentity {
  const tier = Math.floor(Math.min(8, Math.max(0, n)) / 3);
  const nonce = `${Date.now().toString(36)}-${rng().toString(36).slice(2)}-${unit.id}`;
  const usedCategories = new Set<string>();
  const circuits: EnemyCircuitData[] = Array.from({ length: 1 + tier }, (_, i) => {
    const candidates = FALSE_BOARD_EFFECT_KEYS.filter(key => {
      const category = weaponCategory(key);
      return !category || !usedCategories.has(category);
    });
    const effectKey = candidates[Math.floor(rng() * candidates.length) % candidates.length]!;
    const category = weaponCategory(effectKey);
    if (category) usedCategories.add(category);
    return {
      circuitId: `enemy-circ-${nonce}-${i}`, side: 2 + tier, effectKey,
      effect: (2 + tier) ** 2 * (0.3 + rng() * 0.7), trueBoard: false,
    };
  });
  return { modelId: "mech_gen1", durability: Math.max(1, Math.round(unit.maxHp)), circuits };
}

/** Old checkpoints (no identity on enemies) get one on load; existing ones are kept. */
export function backfillEnemyIdentities(
  world: World,
  rng: () => number = Math.random,
): void {
  for (const e of world.enemies ?? []) {
    if (e.kind === "enemy" && !e.enemyIdentity)
      e.enemyIdentity = makeEnemyIdentity(
        e,
        rng,
        world.invadeSector?.neighborCount ?? 0,
      );
  }
}

/** F1 = B: the UI label for any enemy. Never the model / circuits. */
export function enemyDisplayNameJa(_e: Unit): string {
  return ENEMY_UNKNOWN_JA;
}

/** Nearest live enemy within `max` of `pt` (only ones the squad can see). */
export function enemyAt(
  world: World,
  pt: { x: number; y: number },
  max: number,
  seen: (e: Unit) => boolean,
): Unit | null {
  let best: Unit | null = null;
  let bd = max;
  for (const e of world.enemies) {
    if (!e.alive || !seen(e)) continue;
    const d = Math.hypot(e.pos.x - pt.x, e.pos.y - pt.y);
    if (d <= bd) {
      bd = d;
      best = e;
    }
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
