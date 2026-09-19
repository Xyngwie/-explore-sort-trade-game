/**
 * Hub circuit outcomes → tangible hub/sortie bonuses (track 1).
 * Tunable table + aggregate helper; trade/explore consume AggregatedCircuitBonuses.
 * Does not touch invade minesweeper.
 */

import type { CircuitOutcome } from "./circuit-board";
import { isCircuitOutcome } from "./circuit-board";

/** Per-outcome contribution (additive when aggregating). */
export type CircuitOutcomeBonusRow = {
  /** Added to craft multiplier baseline 1.0 (sort / display). */
  craftMultiplierBonus: number;
  /** Fraction off classic repair credits+materials (0..1). */
  repairDiscount: number;
  /** Wear points absorbed on sortie return (per deployed mech). */
  durabilityBuffer: number;
};

/**
 * Tunable effects by restore outcome.
 * fully_awakened > bypass > offline (none).
 */
export const CIRCUIT_OUTCOME_BONUS: Record<
  CircuitOutcome,
  CircuitOutcomeBonusRow
> = {
  fully_awakened: {
    craftMultiplierBonus: 0.1,
    repairDiscount: 0.2,
    durabilityBuffer: 10,
  },
  bypass: {
    craftMultiplierBonus: 0.05,
    repairDiscount: 0.1,
    durabilityBuffer: 5,
  },
  offline: {
    craftMultiplierBonus: 0,
    repairDiscount: 0,
    durabilityBuffer: 0,
  },
};

/** Soft caps so many boards cannot stack forever. */
export const CIRCUIT_BONUS_CAPS = {
  craftMultiplierBonus: 0.25,
  repairDiscount: 0.5,
  durabilityBuffer: 25,
} as const;

export type CircuitBonusCaps = typeof CIRCUIT_BONUS_CAPS;

export type AggregatedCircuitBonuses = {
  craftMultiplierBonus: number;
  repairDiscount: number;
  durabilityBuffer: number;
  /** 1 + craftMultiplierBonus (handy for UI / sort handoff later). */
  craftMultiplier: number;
  /** 1 - repairDiscount (multiply classic repair cost). */
  repairCostMul: number;
  counts: Record<CircuitOutcome, number>;
  contributingCircuitIds: string[];
};

export type CircuitBonusSource = {
  circuitId?: string;
  outcome: CircuitOutcome;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function finiteNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

export function emptyCircuitBonuses(): AggregatedCircuitBonuses {
  return {
    craftMultiplierBonus: 0,
    repairDiscount: 0,
    durabilityBuffer: 0,
    craftMultiplier: 1,
    repairCostMul: 1,
    counts: { fully_awakened: 0, bypass: 0, offline: 0 },
    contributingCircuitIds: [],
  };
}

/**
 * Sum per-circuit outcome bonuses, then clamp to CIRCUIT_BONUS_CAPS.
 * Offline contributes nothing (counts still tracked).
 */
export function aggregateCircuitBonuses(
  circuits: readonly CircuitBonusSource[] | null | undefined,
  table: Record<CircuitOutcome, CircuitOutcomeBonusRow> = CIRCUIT_OUTCOME_BONUS,
  caps: CircuitBonusCaps = CIRCUIT_BONUS_CAPS,
): AggregatedCircuitBonuses {
  const out = emptyCircuitBonuses();
  if (!circuits || circuits.length === 0) return out;

  let craft = 0;
  let discount = 0;
  let buffer = 0;
  const seen = new Set<string>();

  for (const c of circuits) {
    if (!c || !isCircuitOutcome(c.outcome)) continue;
    out.counts[c.outcome] += 1;
    const row = table[c.outcome];
    craft += row.craftMultiplierBonus;
    discount += row.repairDiscount;
    buffer += row.durabilityBuffer;
    const id =
      typeof c.circuitId === "string" && c.circuitId.trim()
        ? c.circuitId.trim()
        : "";
    if (id && !seen.has(id) && c.outcome !== "offline") {
      seen.add(id);
      out.contributingCircuitIds.push(id);
    }
  }

  out.craftMultiplierBonus = Math.min(caps.craftMultiplierBonus, finiteNonNeg(craft));
  out.repairDiscount = Math.min(caps.repairDiscount, clamp01(discount));
  out.durabilityBuffer = Math.min(
    caps.durabilityBuffer,
    Math.floor(finiteNonNeg(buffer)),
  );
  out.craftMultiplier = 1 + out.craftMultiplierBonus;
  out.repairCostMul = 1 - out.repairDiscount;
  return out;
}

/** Scale classic repair cost by aggregated repairCostMul (ceil, min 0). */
export function applyRepairDiscountToCost(
  cost: { credits: number; materials: number },
  repairDiscountOrBonuses: number | Pick<AggregatedCircuitBonuses, "repairDiscount" | "repairCostMul">,
): { credits: number; materials: number } {
  const mul =
    typeof repairDiscountOrBonuses === "number"
      ? 1 - clamp01(repairDiscountOrBonuses)
      : repairDiscountOrBonuses.repairCostMul;
  const m = Number.isFinite(mul) ? Math.min(1, Math.max(0, mul)) : 1;
  return {
    credits: Math.max(0, Math.ceil(cost.credits * m)),
    materials: Math.max(0, Math.ceil(cost.materials * m)),
  };
}

/**
 * Reduce flat sortie wear by durability buffer (per mech).
 * effectiveWear = max(0, baseWear - buffer).
 */
export function applyDurabilityBufferToWear(
  baseWear: number,
  durabilityBuffer: number,
): number {
  const wear = Math.max(0, Math.floor(baseWear));
  const buf = Math.max(0, Math.floor(durabilityBuffer));
  return Math.max(0, wear - buf);
}

/** Compact URL fragment: craft:1.100;repair:0.200;dur:10 */
export function encodeCircuitBonusesCompact(
  bonuses: Pick<
    AggregatedCircuitBonuses,
    "craftMultiplier" | "repairDiscount" | "durabilityBuffer"
  >,
): string {
  const parts: string[] = [];
  if (bonuses.craftMultiplier > 1) {
    parts.push(`craft:${Number(bonuses.craftMultiplier).toFixed(3)}`);
  }
  if (bonuses.repairDiscount > 0) {
    parts.push(`repair:${Number(bonuses.repairDiscount).toFixed(3)}`);
  }
  if (bonuses.durabilityBuffer > 0) {
    parts.push(`dur:${Math.floor(bonuses.durabilityBuffer)}`);
  }
  return parts.join(";");
}

/** Parse compact circuitBonuses query (missing keys → defaults). */
export function parseCircuitBonusesCompact(
  raw: string | null | undefined,
): Pick<
  AggregatedCircuitBonuses,
  "craftMultiplier" | "repairDiscount" | "durabilityBuffer"
> {
  const fallback = { craftMultiplier: 1, repairDiscount: 0, durabilityBuffer: 0 };
  if (raw == null || raw.trim() === "") return fallback;
  let craftMultiplier = 1;
  let repairDiscount = 0;
  let durabilityBuffer = 0;
  for (const part of raw.split(";")) {
    const chunk = part.trim();
    if (!chunk) continue;
    const colon = chunk.indexOf(":");
    if (colon <= 0) continue;
    const key = chunk.slice(0, colon).trim().toLowerCase();
    const val = Number.parseFloat(chunk.slice(colon + 1));
    if (!Number.isFinite(val)) continue;
    if (key === "craft") craftMultiplier = Math.max(1, val);
    else if (key === "repair") repairDiscount = clamp01(val);
    else if (key === "dur" || key === "buffer") {
      durabilityBuffer = Math.max(0, Math.floor(val));
    }
  }
  return { craftMultiplier, repairDiscount, durabilityBuffer };
}

/** One-line Japanese summary for hangar UI. */
export function formatCircuitBonusesJa(b: AggregatedCircuitBonuses): string {
  if (
    b.craftMultiplierBonus <= 0 &&
    b.repairDiscount <= 0 &&
    b.durabilityBuffer <= 0
  ) {
    return "回路ボーナスなし（fully_awakened / bypass が必要）";
  }
  const bits: string[] = [];
  if (b.craftMultiplierBonus > 0) {
    bits.push(`craft ×${b.craftMultiplier.toFixed(2)}`);
  }
  if (b.repairDiscount > 0) {
    bits.push(`修理 −${Math.round(b.repairDiscount * 100)}%`);
  }
  if (b.durabilityBuffer > 0) {
    bits.push(`摩耗緩衝 ${b.durabilityBuffer}`);
  }
  const counts = `覚醒${b.counts.fully_awakened}/バイパス${b.counts.bypass}/オフ${b.counts.offline}`;
  return `${bits.join(" · ")}（${counts}）`;
}
