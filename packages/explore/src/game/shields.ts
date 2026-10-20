import { shieldOwnerUnits } from "./shieldOwners";
import { beginShieldExchange, dropAllOwnedShields, spareShields } from "./shieldOperations";
import { PERIPHERY_HALF_RAD } from "./vision";
import type { FieldObjectIdentities, FieldObjectReference, ShieldIdentity } from "@estg/shared";
import type { Vec2 } from "./math";
import type { Unit, World } from "./types";

export const SHIELD_HALF_ARC = Math.PI / 3;
export const SHIELD_WEIGHT = 1;
export type DurableShield = ShieldIdentity & { hp: number; maxHp: number };
/** No starting shield is manufactured. Later completed pickup/equip operations
 * populate these stable references; the shared identity registry stays canonical.
 */
export type ShieldState = {
  identities: FieldObjectIdentities;
  equipped: Record<string, FieldObjectReference>;
  ground: Record<string, Vec2>;
  /** Acquisition order is the stored array order; reserved exchange items stay here and keep their weight. */
  spares?: Record<string, FieldObjectReference[]>;
  pickups?: Record<string, { key: string; until: number }>;
  exchanges?: Record<string, { key: string; until: number }>;
};
export function equippedShield(world: World, unit: Unit): { key: string; shield: DurableShield } | null {
  const state = world.shieldState, ref = state?.equipped?.[unit.id];
  if (!state || ref?.kind !== "shield" || !Object.hasOwn(state.identities.shields, ref.key)) return null;
  const item = state.identities.shields[ref.key]!;
  if (typeof item.hp !== "number" || !Number.isFinite(item.hp) || item.hp <= 0 ||
      typeof item.maxHp !== "number" || !Number.isFinite(item.maxHp) || item.maxHp <= 0) return null;
  return { key: ref.key, shield: item as DurableShield };
}
export function shieldLoad(world: World, unit: Unit): number { return ((equippedShield(world, unit) ? 1 : 0) + spareShields(world,unit).length) * SHIELD_WEIGHT; }
export function shieldHudText(world: World, unit: Unit): string {
  const entry = equippedShield(world, unit);
  const spareCount = spareShields(world,unit).length;
  const equipped = entry ? `盾 ${Number(entry.shield.hp.toFixed(1))}/${Number(entry.shield.maxHp.toFixed(1))}` : world.shieldState?.exchanges?.[unit.id] ? "盾交換中" : "";
  return [equipped, spareCount ? `予備盾 ${spareCount}` : "", world.shieldState?.pickups?.[unit.id] ? "盾回収中" : ""].filter(Boolean).join("・");
}
/** incomingAngle points toward the oncoming attack, not the shooter's old position.
 * Damage is already reduced (owner Q1=A). The breaking hit never spills to armor.
 */
export function absorbShieldHit(world: World, unit: Unit, incomingAngle: number, damage: number, kind: "projectile" | "melee" = "projectile"): boolean {
  const entry = equippedShield(world, unit);
  const halfArc = kind === "melee" ? PERIPHERY_HALF_RAD : SHIELD_HALF_ARC;
  if (!unit.alive || !entry || !Number.isFinite(incomingAngle) || !Number.isFinite(damage) || damage < 0 ||
      Math.abs(Math.atan2(Math.sin(incomingAngle - unit.heading), Math.cos(incomingAngle - unit.heading))) > halfArc + 1e-9) return false;
  entry.shield.hp = Math.max(0, entry.shield.hp - damage);
  if (entry.shield.hp === 0) {
    const state = world.shieldState!;
    delete state.equipped[unit.id]; delete state.ground[entry.key];
    delete state.identities.shields[entry.key];
    beginShieldExchange(world,unit);
  }
  return true;
}
/** Same item, HP, IDs and generation order; no transfer to the carrier. */
export function dropEquippedShield(world: World, unit: Unit): boolean {
  const state = world.shieldState, entry = equippedShield(world, unit);
  if (!state || !entry) return false;
  state.ground[entry.key] = { ...unit.pos };
  delete state.equipped[unit.id];
  return true;
}
/** Death/power exhaustion cannot leave an active shield on a corpse. */
export function dropUnavailableShields(world: World): void {
  if (!world.shieldState) return;
  const units = shieldOwnerUnits(world);
  const riders = new Set(Object.values(world.circuitPlay?.carry ?? {}).flat());
  for (const unit of units) {
    if (!unit.alive || riders.has(unit.id)) dropAllOwnedShields(world, unit, true);
  }
}
