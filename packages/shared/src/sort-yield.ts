/**
 * Sort Yield — four-resource model.
 *
 * Sort extracts usable resources from matched pieces. Anything left on the
 * board when the session ends is converted to junk.
 */

/** Sort board colors / extracted resources. */
export const SORT_PIECE_TYPES = ["ammo", "armor", "power"] as const;
export type SortPieceType = (typeof SORT_PIECE_TYPES)[number];

/** The four resources shared by Sort and HUB. */
export const RESOURCE_IDS = ["ammo", "armor", "power", "junk"] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type YieldItemId = ResourceId;
export type YieldBag = Partial<Record<ResourceId, number>>;
export type ClearedPieceCounts = Record<SortPieceType, number>;

export const RESOURCE_LABEL_JA: Record<ResourceId, string> = {
  ammo: "弾薬",
  armor: "装甲パーツ",
  power: "電力パーツ",
  junk: "ジャンク",
};

/**
 * Legacy names are retained only as compatibility aliases for older HUB code.
 * New Sort yields never create these IDs.
 */
export type BasicMaterialId =
  | "mat_scrap"
  | "mat_polymer"
  | "mat_circuit"
  | "mat_ration"
  | "mat_coolant";
export type PartId =
  | "part_actuator"
  | "part_armor_plate"
  | "part_power_cell"
  | "part_sensor_array"
  | "part_hydraulic_line";

export const BASIC_MATERIAL_LABEL_JA: Record<BasicMaterialId, string> = {
  mat_scrap: "旧・スクラップ鋼",
  mat_polymer: "旧・ポリマー",
  mat_circuit: "旧・回路素体",
  mat_ration: "旧・糧食パック",
  mat_coolant: "旧・冷却剤",
};
export const PART_LABEL_JA: Record<PartId, string> = {
  part_actuator: "旧・アクチュエータ",
  part_armor_plate: "旧・装甲板",
  part_power_cell: "旧・電力セル",
  part_sensor_array: "旧・センサーアレイ",
  part_hydraulic_line: "旧・油圧ライン",
};

const LEGACY_BASIC_IDS = Object.keys(BASIC_MATERIAL_LABEL_JA) as BasicMaterialId[];
const LEGACY_PART_IDS = Object.keys(PART_LABEL_JA) as PartId[];

/** Compatibility predicates used by existing HUB UI. */
export function isBasicMaterialId(value: string): value is BasicMaterialId {
  return LEGACY_BASIC_IDS.includes(value as BasicMaterialId);
}
export function isPartId(value: string): value is PartId {
  return LEGACY_PART_IDS.includes(value as PartId);
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

export function emptyYieldBag(): YieldBag {
  return {};
}

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
    const n = nonNegInt(bag[id] ?? 0);
    const scaled = Math.floor(n * m);
    if (scaled > 0) out[id] = scaled;
  }
  return out;
}

export function applyYieldBagToInventory(inventory: YieldBag, bag: YieldBag): YieldBag {
  return mergeYieldBags(inventory, bag);
}

export function canAffordYieldCost(inventory: YieldBag, cost: YieldBag): boolean {
  for (const id of RESOURCE_IDS) {
    const need = nonNegInt(cost[id] ?? 0);
    if (need > 0 && nonNegInt(inventory[id] ?? 0) < need) return false;
  }
  return true;
}

export function spendYieldBag(inventory: YieldBag, cost: YieldBag): YieldBag | null {
  if (!canAffordYieldCost(inventory, cost)) return null;
  const out = { ...compactYieldBag(inventory) };
  for (const id of RESOURCE_IDS) {
    const need = nonNegInt(cost[id] ?? 0);
    if (need <= 0) continue;
    const next = nonNegInt(out[id] ?? 0) - need;
    if (next > 0) out[id] = next;
    else delete out[id];
  }
  return compactYieldBag(out);
}

/** One matched red/blue/yellow piece extracts one corresponding resource. */
export function yieldBagFromClearedCounts(cleared: ClearedPieceCounts): YieldBag {
  const bag: YieldBag = {};
  if (cleared.ammo > 0) bag.ammo = nonNegInt(cleared.ammo);
  if (cleared.armor > 0) bag.armor = nonNegInt(cleared.armor);
  if (cleared.power > 0) bag.power = nonNegInt(cleared.power);
  return compactYieldBag(bag);
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

/** Legacy typed repair shape retained for callers during migration. */
export type TypedRepairCost = {
  credits: number;
  basicMaterials: Partial<Record<BasicMaterialId, number>>;
  parts: Partial<Record<PartId, number>>;
};

/** Map legacy repair costs to the new single armor resource. */
export function yieldBagFromTypedRepairCost(cost: TypedRepairCost): YieldBag {
  const legacyBasic = Object.values(cost.basicMaterials).reduce(
    (sum, n) => sum + nonNegInt(n ?? 0),
    0,
  );
  const legacyParts = Object.values(cost.parts).reduce(
    (sum, n) => sum + nonNegInt(n ?? 0),
    0,
  );
  const armor = legacyBasic + legacyParts;
  return armor > 0 ? { armor } : {};
}

export const EXAMPLE_TYPED_REPAIR_COST: TypedRepairCost = {
  credits: 50,
  basicMaterials: {},
  parts: { part_armor_plate: 1 },
};
