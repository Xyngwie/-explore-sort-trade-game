/**
 * feat/explore-status-badges (2026-10-12 神宮 19:52 Go): a red line over a
 * wingman's head while a state lasts. Wingmen only (the captain keeps the info
 * area). Fixed order; several states join with 「・」.
 */
import type { Unit, World } from "./types";
import { effectiveBatteryCapacity, usableAmmo } from "./circuitPlay";
import { unitLoad, unitLoadCap } from "./carry";

export const STATUS_BADGE_ORDER = ["弾切れ", "装甲低下", "活動量低下", "積載上限"] as const;
export type StatusBadge = (typeof STATUS_BADGE_ORDER)[number];
/** On-screen size in CSS px (same on PC and phone, not tied to map zoom). */
export const STATUS_BADGE_PX = 11;
export const STATUS_BADGE_COLOR = "#ff4d4d";
export const STATUS_BADGE_OUTLINE = "#1a0505";

export function wingmanStatusBadges(world: World, unit: Unit): StatusBadge[] {
  if (unit.kind === "leader" || !unit.alive) return [];
  const out: StatusBadge[] = [];
  if (unit.instanceId != null && usableAmmo(world, unit) <= 0) out.push("弾切れ");
  if (unit.maxHp > 0 && unit.hp < unit.maxHp * 0.5) out.push("装甲低下");
  const b = unit.instanceId ? world.mechBattery[unit.instanceId] : undefined;
  const cap = effectiveBatteryCapacity(world, unit);
  if (b && cap != null && cap > 0 && b.activity < cap * 0.5) out.push("活動量低下");
  const loadCap = unitLoadCap(world, unit);
  if (loadCap > 0 && unitLoad(world, unit) >= loadCap) out.push("積載上限");
  return out;
}

export function wingmanStatusLine(world: World, unit: Unit): string {
  return wingmanStatusBadges(world, unit).join("・");
}
