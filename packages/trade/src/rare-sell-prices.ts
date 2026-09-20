/**
 * Module 3 — rare YieldBag sell prices (仮 / TBD).
 *
 * Explicit placeholder price table. Inventory sell buttons and `sellRareItem`
 * both read from this table — do not hard-code unit prices elsewhere.
 *
 * Balance: every row is **TBD** until an economy pass. Numbers are playtest
 * placeholders only (parts intended higher than basic rare mats).
 *
 * | id                | kind | 仮価格 (credits) | balance |
 * |-------------------|------|------------------|---------|
 * | mat_circuit       | mat  | 8                | TBD     |
 * | part_actuator     | part | 35               | TBD     |
 * | part_armor_plate  | part | 40               | TBD     |
 * | part_power_cell   | part | 45               | TBD     |
 * | part_sensor_array | part | 55               | TBD     |
 *
 * Non-listed YieldBag ids are not sellable via this path.
 */

import type { YieldItemId } from "@estg/shared";

export type RareSellBalanceMark = "TBD";

export type RareSellPriceRow = {
  readonly id: YieldItemId;
  /** Catalog kind for UI / docs (mat vs part). */
  readonly kind: "mat" | "part";
  /** Placeholder unit sell price in credits (仮). */
  readonly credits: number;
  /** Always TBD until balancing — do not treat as final economy. */
  readonly balance: RareSellBalanceMark;
};

/**
 * Canonical 仮 price table for rare mats/parts.
 * Edit rows here (credits + balance) when balancing; keep `balance: "TBD"`
 * until a dedicated economy pass lands.
 */
export const RARE_SELL_PRICE_TABLE = [
  { id: "mat_circuit", kind: "mat", credits: 8, balance: "TBD" },
  { id: "part_actuator", kind: "part", credits: 35, balance: "TBD" },
  { id: "part_armor_plate", kind: "part", credits: 40, balance: "TBD" },
  { id: "part_power_cell", kind: "part", credits: 45, balance: "TBD" },
  { id: "part_sensor_array", kind: "part", credits: 55, balance: "TBD" },
] as const satisfies readonly RareSellPriceRow[];

export type RareYieldItemId = (typeof RARE_SELL_PRICE_TABLE)[number]["id"];

export const RARE_YIELD_ITEM_IDS: readonly RareYieldItemId[] =
  RARE_SELL_PRICE_TABLE.map((row) => row.id);

/** Lookup map derived from {@link RARE_SELL_PRICE_TABLE} (credits each). */
export const RARE_SELL_PRICE_CREDITS: Record<RareYieldItemId, number> =
  Object.fromEntries(
    RARE_SELL_PRICE_TABLE.map((row) => [row.id, row.credits]),
  ) as Record<RareYieldItemId, number>;

export function isRareYieldItemId(id: string): id is RareYieldItemId {
  return (RARE_YIELD_ITEM_IDS as readonly string[]).includes(id);
}

/** Unit 仮価格 in credits, or null if not in the rare sell table. */
export function rareSellPriceCredits(id: YieldItemId): number | null {
  if (!isRareYieldItemId(id)) return null;
  return RARE_SELL_PRICE_CREDITS[id];
}

/** Row from the explicit table, or null if not sellable as rare. */
export function rareSellPriceRow(id: string): RareSellPriceRow | null {
  if (!isRareYieldItemId(id)) return null;
  const row = RARE_SELL_PRICE_TABLE.find((r) => r.id === id);
  return row ?? null;
}
