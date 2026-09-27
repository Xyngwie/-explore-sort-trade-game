/**
 * Trade-local compatibility for the legacy "typed repair" helpers.
 *
 * #134 removed the legacy material/part catalog (and these helpers) from
 * `@estg/shared`. The Hangar typed-repair UI still references them, so the
 * exact same logic lives here until that UI is migrated to the four-resource
 * model. Behavior is unchanged: any legacy cost collapses to `armor`.
 */
import type { YieldBag } from "@estg/shared";

/** Legacy typed repair cost (legacy ids are compatibility-only strings). */
export type TypedRepairCost = {
  credits: number;
  basicMaterials: Partial<Record<string, number>>;
  parts: Partial<Record<string, number>>;
};

function nonNegInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function yieldBagFromTypedRepairCost(cost: TypedRepairCost): YieldBag {
  const basic = Object.values(cost.basicMaterials).reduce<number>((s, n) => s + nonNegInt(n ?? 0), 0);
  const parts = Object.values(cost.parts).reduce<number>((s, n) => s + nonNegInt(n ?? 0), 0);
  return basic + parts > 0 ? { armor: basic + parts } : {};
}

export const EXAMPLE_TYPED_REPAIR_COST: TypedRepairCost = {
  credits: 50,
  basicMaterials: {},
  parts: { part_armor_plate: 1 },
};
