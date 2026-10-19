import { COVER_DR_BASE } from "@estg/shared";
import { campDamageTakenMul } from "./orders";
import { enemyArmorMultiplier } from "./enemyBehavior";
import { circuitIncomingMul } from "./circuitPlay";
import type { Unit, World } from "./types";

/** The existing projectile order, also used by melee (owner Q3=A). */
export function incomingDamage(world: World, target: Unit, raw: number): number {
  const base = target.kind === "enemy" ? raw / enemyArmorMultiplier(target) : raw * campDamageTakenMul(world, target);
  return base * (circuitIncomingMul(world, target) ?? (target.inCover ? 1 - COVER_DR_BASE : 1));
}
