/**
 * Sort Yield v2 — typed basic materials / specific parts from cleared puzzle pieces.
 * Aggregate yieldFood / yieldMaterial / yieldEnergy stay for compatibility.
 *
 * Documented in docs/SORT_YIELD_V2.md.
 */

/** Valid clearable piece kinds (SORT_V2_RULES). junk is not a yield source. */
export const SORT_PIECE_TYPES = ["food", "material", "energy"] as const;
export type SortPieceType = (typeof SORT_PIECE_TYPES)[number];

export const BASIC_MATERIAL_IDS = [
  "mat_scrap",
  "mat_polymer",
  "mat_circuit",
  "mat_ration",
  "mat_coolant",
] as const;
export type BasicMaterialId = (typeof BASIC_MATERIAL_IDS)[number];

export const PART_IDS = [
  "part_actuator",
  "part_armor_plate",
  "part_power_cell",
  "part_sensor_array",
  "part_hydraulic_line",
] as const;
export type PartId = (typeof PART_IDS)[number];

export type YieldItemId = BasicMaterialId | PartId;

/** Sparse bag of typed yields (only positive counts matter). */
export type YieldBag = Partial<Record<YieldItemId, number>>;

export type ClearedPieceCounts = Record<SortPieceType, number>;

/** Provisional balance — tune later; documented in docs/SORT_YIELD_V2.md. */
export const SORT_YIELD_RULES = {
  /** material clears → basic split */
  materialScrapRatio: 0.6,
  materialPolymerRatio: 0.4,
  /** energy clears → basic split */
  energyCircuitRatio: 0.5,
  energyCoolantRatio: 0.5,
  /** material clears → parts (every N clears → +1) */
  materialPartEvery: {
    part_actuator: 10,
    part_armor_plate: 15,
    part_hydraulic_line: 20,
  },
  /** energy clears → parts */
  energyPartEvery: {
    part_power_cell: 12,
    part_sensor_array: 18,
  },
} as const;

export const BASIC_MATERIAL_LABEL_JA: Record<BasicMaterialId, string> = {
  mat_scrap: "スクラップ鋼",
  mat_polymer: "ポリマー",
  mat_circuit: "回路素体",
  mat_ration: "糧食パック",
  mat_coolant: "冷却剤",
};

export const PART_LABEL_JA: Record<PartId, string> = {
  part_actuator: "アクチュエータ",
  part_armor_plate: "装甲板",
  part_power_cell: "電力セル",
  part_sensor_array: "センサーアレイ",
  part_hydraulic_line: "油圧ライン",
};

const YIELD_ITEM_IDS: readonly YieldItemId[] = [
  ...BASIC_MATERIAL_IDS,
  ...PART_IDS,
];

export function isBasicMaterialId(value: string): value is BasicMaterialId {
  return (BASIC_MATERIAL_IDS as readonly string[]).includes(value);
}

export function isPartId(value: string): value is PartId {
  return (PART_IDS as readonly string[]).includes(value);
}

export function isYieldItemId(value: string): value is YieldItemId {
  return isBasicMaterialId(value) || isPartId(value);
}

function nonNegInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/** Drop zero / non-finite entries. */
export function compactYieldBag(bag: YieldBag): YieldBag {
  const out: YieldBag = {};
  for (const id of YIELD_ITEM_IDS) {
    const n = bag[id];
    if (n == null) continue;
    const v = nonNegInt(n);
    if (v > 0) out[id] = v;
  }
  return out;
}

export function emptyYieldBag(): YieldBag {
  return {};
}

export function yieldBagTotal(bag: YieldBag): number {
  let sum = 0;
  for (const id of YIELD_ITEM_IDS) {
    sum += nonNegInt(bag[id] ?? 0);
  }
  return sum;
}

export function mergeYieldBags(...bags: readonly YieldBag[]): YieldBag {
  const out: YieldBag = {};
  for (const bag of bags) {
    for (const id of YIELD_ITEM_IDS) {
      const add = nonNegInt(bag[id] ?? 0);
      if (add <= 0) continue;
      out[id] = nonNegInt(out[id] ?? 0) + add;
    }
  }
  return compactYieldBag(out);
}

/** Apply craftMultiplier-style scale with floor per entry. */
export function scaleYieldBag(bag: YieldBag, multiplier: number): YieldBag {
  const m = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 0;
  const out: YieldBag = {};
  for (const id of YIELD_ITEM_IDS) {
    const n = nonNegInt(bag[id] ?? 0);
    if (n <= 0) continue;
    const scaled = Math.floor(n * m);
    if (scaled > 0) out[id] = scaled;
  }
  return out;
}

/**
 * Add bag into an inventory bag (hub-side merge helper; does not touch HubSave yet).
 */
export function applyYieldBagToInventory(
  inventory: YieldBag,
  bag: YieldBag,
): YieldBag {
  return mergeYieldBags(inventory, bag);
}

/**
 * True if `inventory` has at least the counts in `cost` (missing keys treat as 0).
 */
export function canAffordYieldCost(
  inventory: YieldBag,
  cost: YieldBag,
): boolean {
  for (const id of YIELD_ITEM_IDS) {
    const need = nonNegInt(cost[id] ?? 0);
    if (need <= 0) continue;
    if (nonNegInt(inventory[id] ?? 0) < need) return false;
  }
  return true;
}

/**
 * Subtract cost from inventory. Returns null if unaffordable.
 */
export function spendYieldBag(
  inventory: YieldBag,
  cost: YieldBag,
): YieldBag | null {
  if (!canAffordYieldCost(inventory, cost)) return null;
  const out: YieldBag = { ...compactYieldBag(inventory) };
  for (const id of YIELD_ITEM_IDS) {
    const need = nonNegInt(cost[id] ?? 0);
    if (need <= 0) continue;
    const next = nonNegInt(out[id] ?? 0) - need;
    if (next <= 0) delete out[id];
    else out[id] = next;
  }
  return compactYieldBag(out);
}

function addPartEvery(
  bag: YieldBag,
  cleared: number,
  everyMap: Readonly<Partial<Record<PartId, number>>>,
): void {
  for (const [partId, every] of Object.entries(everyMap) as Array<
    [PartId, number]
  >) {
    const e = nonNegInt(every);
    if (e <= 0) continue;
    const n = Math.floor(cleared / e);
    if (n > 0) bag[partId] = nonNegInt(bag[partId] ?? 0) + n;
  }
}

/**
 * Map cleared piece counts → typed yield bag (before craftMultiplier).
 * Aggregate yield* fields remain the caller's responsibility (usually = cleared counts).
 */
export function yieldBagFromClearedCounts(
  cleared: ClearedPieceCounts,
  rules: typeof SORT_YIELD_RULES = SORT_YIELD_RULES,
): YieldBag {
  const food = nonNegInt(cleared.food);
  const material = nonNegInt(cleared.material);
  const energy = nonNegInt(cleared.energy);
  const bag: YieldBag = {};

  if (food > 0) bag.mat_ration = food;

  if (material > 0) {
    const scrap = Math.floor(material * rules.materialScrapRatio);
    const polymer = Math.floor(material * rules.materialPolymerRatio);
    if (scrap > 0) bag.mat_scrap = scrap;
    if (polymer > 0) bag.mat_polymer = polymer;
    addPartEvery(bag, material, rules.materialPartEvery);
  }

  if (energy > 0) {
    const circuit = Math.floor(energy * rules.energyCircuitRatio);
    const coolant = Math.floor(energy * rules.energyCoolantRatio);
    if (circuit > 0) bag.mat_circuit = circuit;
    if (coolant > 0) bag.mat_coolant = coolant;
    addPartEvery(bag, energy, rules.energyPartEvery);
  }

  return compactYieldBag(bag);
}

/**
 * Convenience: cleared counts + multiplier → final bag for handoff.
 */
export function yieldBagFromClearedWithMultiplier(
  cleared: ClearedPieceCounts,
  craftMultiplier: number,
  rules: typeof SORT_YIELD_RULES = SORT_YIELD_RULES,
): YieldBag {
  return scaleYieldBag(yieldBagFromClearedCounts(cleared, rules), craftMultiplier);
}

/** Compact URL / log form: id:n;id:n */
export function encodeYieldBagCompact(bag: YieldBag): string {
  const parts: string[] = [];
  for (const id of YIELD_ITEM_IDS) {
    const n = nonNegInt(bag[id] ?? 0);
    if (n > 0) parts.push(`${id}:${n}`);
  }
  return parts.join(";");
}

/** Parse compact form; unknown ids skipped. */
export function parseYieldBagCompact(raw: string | null | undefined): YieldBag {
  if (raw == null || raw.trim() === "") return {};
  const out: YieldBag = {};
  for (const part of raw.split(";")) {
    const chunk = part.trim();
    if (!chunk) continue;
    const colon = chunk.lastIndexOf(":");
    if (colon <= 0) continue;
    const id = chunk.slice(0, colon).trim();
    const n = Number.parseInt(chunk.slice(colon + 1), 10);
    if (!isYieldItemId(id) || !Number.isFinite(n)) continue;
    const v = nonNegInt(n);
    if (v <= 0) continue;
    out[id] = nonNegInt(out[id] ?? 0) + v;
  }
  return compactYieldBag(out);
}

/**
 * Provisional typed repair cost shape for Module 3 (not wired into mech-fleet yet).
 * Example only — balance TBD.
 */
export type TypedRepairCost = {
  credits: number;
  basicMaterials: Partial<Record<BasicMaterialId, number>>;
  parts: Partial<Record<PartId, number>>;
};

/** Flatten TypedRepairCost into a YieldBag (credits stay separate). */
export function yieldBagFromTypedRepairCost(cost: TypedRepairCost): YieldBag {
  return mergeYieldBags(cost.basicMaterials, cost.parts);
}

/** Example provisional cost for docs / tests (要修理 1 機). */
export const EXAMPLE_TYPED_REPAIR_COST: TypedRepairCost = {
  credits: 50,
  basicMaterials: {
    mat_scrap: 20,
    mat_polymer: 10,
  },
  parts: {
    part_actuator: 1,
  },
};
