import type { Unit, World } from "./types";
export type CombatFeedback = { unitId: string; kind: "empty" | "ammo" | "power"; amount: number; ttl: number };
// Presentation only: checkpoints must never replay old acquisition notifications.
const pending = new WeakMap<World, CombatFeedback[]>();
export function combatFeedback(world: World): readonly CombatFeedback[] { return pending.get(world) ?? []; }
export function showCombatFeedback(world: World, unit: Unit, kind: CombatFeedback["kind"], amount = 0): void {
  if (kind !== "empty" && amount <= 0) return;
  const items = pending.get(world) ?? [];
  const recent = items.find(e => e.unitId === unit.id && e.kind === kind && e.ttl > 1.4);
  if (recent) recent.amount += amount;
  else items.push({ unitId: unit.id, kind, amount, ttl: 1.8 });
  pending.set(world, items.slice(-40));
}
export function tickCombatFeedback(world: World, dt: number): void {
  pending.set(world, (pending.get(world) ?? []).filter(e => (e.ttl -= dt) > 0));
}
export function enemyAmmoFeedback(world: World, unit: Unit, previous: number): void {
  if (previous > 0 && unit.enemyState?.ammo === 0) showCombatFeedback(world, unit, "empty");
}
export function feedbackLabel(e: CombatFeedback): string {
  if (e.kind === "empty") return "弾切れ";
  const value = Number(e.amount.toFixed(2));
  return `${e.kind === "ammo" ? "弾薬" : "活動量"} +${value || "0.01未満"}`;
}
