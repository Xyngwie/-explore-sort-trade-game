/**
 * feat/explore-status-badges (2026-10-12 神宮 19:52 Go): a red line over a
 * wingman's head while a state lasts. Wingmen only (the captain keeps the info
 * area). Fixed order; several states join with 「・」.
 */
import type { Unit, World } from "./types";
import { effectiveBatteryCapacity, sortieAmmoCap, usableAmmo } from "./circuitPlay";
import type { ClassifiedCircuit } from "@estg/shared";
import { unitLoad, unitLoadCap } from "./carry";

/** 21:29 神宮: 弾切れ and 残弾減少 share the first slot (only one shows; 弾切れ wins at 0). */
export const STATUS_BADGE_ORDER = ["弾切れ", "残弾減少", "装甲低下", "活動量低下", "積載上限"] as const;
export type StatusBadge = (typeof STATUS_BADGE_ORDER)[number];
/** On-screen size in CSS px (same on PC and phone, not tied to map zoom). */
export const STATUS_BADGE_PX = 11;
export const STATUS_BADGE_COLOR = "#ff4d4d";
export const STATUS_BADGE_OUTLINE = "#1a0505";

export function wingmanStatusBadges(world: World, unit: Unit): StatusBadge[] {
  if (unit.kind === "leader" || !unit.alive) return [];
  const out: StatusBadge[] = [];
  if (unit.instanceId != null) {
    const ammo = usableAmmo(world, unit);
    if (ammo <= 0) out.push("弾切れ");
    else if (ammo < sortieAmmoCap(world, unit) * 0.5) out.push("残弾減少");
  }
  if (unit.maxHp > 0 && unit.hp < unit.maxHp * 0.5) out.push("装甲低下");
  const b = unit.instanceId ? world.mechBattery[unit.instanceId] : undefined;
  const cap = effectiveBatteryCapacity(world, unit);
  if (b && cap != null && cap > 0 && b.activity < b.capacity * 0.5) out.push("活動量低下");
  const loadCap = unitLoadCap(world, unit);
  if (loadCap > 0 && unitLoad(world, unit) >= loadCap) out.push("積載上限");
  return out;
}

export function wingmanStatusLine(world: World, unit: Unit): string {
  return wingmanStatusBadges(world, unit).join("・");
}

/** Effect-type names as in CIRCUIT_SQUAD_DESIGN_V0 §「通常行動」「小隊行動」 (+ 回収, 項目4-2). */
export { CIRCUIT_EFFECT_LABEL_JA } from "@estg/shared";
import { CIRCUIT_EFFECT_LABEL_JA } from "@estg/shared";

/**
 * 21:29 神宮 1 = B: a wrecked wingman shows its circuits' effect type and
 * effect value instead of states (no size). Decided 21:47 神宮 (all A): equip order, 「・」 join, value = 効果値 (`effect`), circuits
 * without an effect type are skipped, no circuits → nothing, true / false
 * boards look the same, captain's wreck shows nothing.
 */
export function wreckCircuitLine(world: World, unit: Unit): string {
  if (unit.kind === "leader" || unit.alive) return "";
  const list: ClassifiedCircuit[] = world.circuitPlay?.loadout?.[unit.id] ?? [];
  return list
    .filter((c) => c.effectKey != null)
    .map((c) => `${CIRCUIT_EFFECT_LABEL_JA[c.effectKey!] ?? c.effectKey} ${Math.max(0, Math.floor(c.effect))}`)
    .join("・");
}
