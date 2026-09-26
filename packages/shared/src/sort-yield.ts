/** Sort Yield — four-resource model. */

export const SORT_PIECE_TYPES = ["ammo", "armor", "power"] as const;
export type SortPieceType = (typeof SORT_PIECE_TYPES)[number];
export type LegacySortPieceType = "food" | "material" | "energy";
export type ClearedPieceCounts =
  | Record<SortPieceType, number>
  | Record<LegacySortPieceType, number>;

/** The only resources produced and stored by the new model. */
export const RESOURCE_IDS = ["ammo", "armor", "power", "junk"] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type YieldItemId = ResourceId;
export type YieldBag = Partial<Record<ResourceId, number>>;

export const RESOURCE_LABEL_JA: Record<ResourceId, string> = {
  ammo: "弾薬",
  armor: "装甲パーツ",
  power: "電力パーツ",
  junk: "ジャンク",
};

/** Deprecated compatibility names retained for existing HUB callers. */
export type BasicMaterialId =
  | ResourceId
  | "mat_scrap"
  | "mat_polymer"
  | "mat_circuit"
  | "mat_ration"
  | "mat_coolant";
export type PartId =
  | ResourceId
  | "part_actuator"
  | "part_armor_plate"
  | "part_power_cell"
  | "part_sensor_array"
  | "part_hydraulic_line";

export const BASIC_MATERIAL_LABEL_JA: Record<BasicMaterialId, string> = {
  ammo: "弾薬",
  armor: "装甲パーツ",
  power: "電力パーツ",
  junk: "ジャンク",
  mat_scrap: "旧・スクラップ鋼",
  mat_polymer: "旧・ポリマー",
  mat_circuit: "旧・回路素体",
  mat_ration: "旧・糧食パック",
  mat_coolant: "旧・冷却剤",
};
export const PART_LABEL_JA: Record<PartId, string> = {
  ammo: "弾薬",
  armor: "装甲パーツ",
  power: "電力パーツ",
  junk: "ジャンク",
  part_actuator: "旧・アクチュエータ",
  part_armor_plate: "旧・装甲板",
  part_power_cell: "旧・電力セル",
  part_sensor_array: "旧・センサーアレイ",
  part_hydraulic_line: "旧・油圧ライン",
};

export function isBasicMaterialId(value: string): value is BasicMaterialId {
  return (Object.keys(BASIC_MATERIAL_LABEL_JA) as string[]).includes(value);
}
export function isPartId(value: string): value is PartId {
  return (Object.keys(PART_LABEL_JA) as string[]).includes(value);
}
export function isYieldItemId(value: string): value is YieldItemId {
  return (RESOURCE_IDS as readonly string[]).includes(value);
}

function nonNegInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function compactYieldBag(bag: YieldBag): YieldBag {
  const out: YieldBag = {};
  for (const id of RESOURCE_IDS) {
    const n = nonNegInt(bag[id] ?? 0);
    if (n > 0) out[id] = n;
  }
  return out;
}
export function emptyYieldBag(): YieldBag { return {}; }
export function yieldBagTotal(bag: YieldBag): number {
  return RESOURCE_IDS.reduce((sum, id) => sum + nonNegInt(bag[id] ?? 0), 0);
}
export function mergeYieldBags(...bags: readonly YieldBag[]): YieldBag {
  const out: YieldBag = {};
  for (const bag of bags) {
    for (const id of RESOURCE_IDS) {
      const add = nonNegInt(bag[id] ?? 0);
      if (add > 0) out[id] = nonNegInt(out[id] ?? 0) + add;
    }
  }
  return compactYieldBag(out);
}
export function scaleYieldBag(bag: YieldBag, multiplier: number): YieldBag {
  const m = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 0;
  const out: YieldBag = {};
  for (const id of RESOURCE_IDS) {
    const scaled = Math.floor(nonNegInt(bag[id] ?? 0) * m);
    if (scaled > 0) out[id] = scaled;
  }
  return out;
}
export function applyYieldBagToInventory(inventory: YieldBag, bag: YieldBag): YieldBag {
  return mergeYieldBags(inventory, bag);
}
export function canAffordYieldCost(inventory: YieldBag, cost: YieldBag): boolean {
  return RESOURCE_IDS.every((id) => nonNegInt(inventory[id] ?? 0) >= nonNegInt(cost[id] ?? 0));
}
export function spendYieldBag(inventory: YieldBag, cost: YieldBag): YieldBag | null {
  if (!canAffordYieldCost(inventory, cost)) return null;
  const out = { ...compactYieldBag(inventory) };
  for (const id of RESOURCE_IDS) {
    const next = nonNegInt(out[id] ?? 0) - nonNegInt(cost[id] ?? 0);
    if (next > 0) out[id] = next;
    else delete out[id];
  }
  return compactYieldBag(out);
}

/** One matched board piece extracts one corresponding resource. */
export function yieldBagFromClearedCounts(cleared: ClearedPieceCounts): YieldBag {
  if ("ammo" in cleared) {
    return compactYieldBag({
      ammo: cleared.ammo,
      armor: cleared.armor,
      power: cleared.power,
    });
  }
  // Migration path for the current Sort engine: food→ammo, material→armor, energy→power.
  return compactYieldBag({
    ammo: cleared.food,
    armor: cleared.material,
    power: cleared.energy,
  });
}
export function yieldBagFromClearedWithMultiplier(
  cleared: ClearedPieceCounts,
  craftMultiplier: number,
): YieldBag {
  return scaleYieldBag(yieldBagFromClearedCounts(cleared), craftMultiplier);
}

export function encodeYieldBagCompact(bag: YieldBag): string {
  return RESOURCE_IDS
    .filter((id) => nonNegInt(bag[id] ?? 0) > 0)
    .map((id) => `${id}:${nonNegInt(bag[id] ?? 0)}`)
    .join(";");
}
export function parseYieldBagCompact(raw: string | null | undefined): YieldBag {
  if (raw == null || raw.trim() === "") return {};
  const out: YieldBag = {};
  for (const part of raw.split(";")) {
    const colon = part.lastIndexOf(":");
    if (colon <= 0) continue;
    const id = part.slice(0, colon).trim();
    const n = Number.parseInt(part.slice(colon + 1), 10);
    if (!isYieldItemId(id) || !Number.isFinite(n)) continue;
    const v = nonNegInt(n);
    if (v > 0) out[id] = nonNegInt(out[id] ?? 0) + v;
  }
  return compactYieldBag(out);
}

/** Legacy repair type retained so existing fleet code compiles during migration. */
export type TypedRepairCost = {
  credits: number;
  basicMaterials: Partial<Record<Exclude<BasicMaterialId, ResourceId>, number>>;
  parts: Partial<Record<Exclude<PartId, ResourceId>, number>>;
};
export function yieldBagFromTypedRepairCost(cost: TypedRepairCost): YieldBag {
  const basic = Object.values(cost.basicMaterials).reduce((s, n) => s + nonNegInt(n ?? 0), 0);
  const parts = Object.values(cost.parts).reduce((s, n) => s + nonNegInt(n ?? 0), 0);
  return basic + parts > 0 ? { armor: basic + parts } : {};
}
export const EXAMPLE_TYPED_REPAIR_COST: TypedRepairCost = {
  credits: 50,
  basicMaterials: {},
  parts: { part_armor_plate: 1 },
};
