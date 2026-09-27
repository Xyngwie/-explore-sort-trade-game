/**
 * Module 3 — circuit sell price (仮 / provisional).
 *
 * Formula (神宮):
 * - **最低 25c + 出来栄え floor(effect) × 3c**（2026-09-28 に 30c→25c）.
 * - **Perfect (Fully Awakened) only:** + 完璧ボーナス **2 × round(4 × 1.5^N) c**
 *   (= 2 × junk craft credit cost, shared `circuitPerfectSellBonusCredits`;
 *   2026-09-28, was 2^(N+1)). N = board side length. Bypass / Offline /
 *   un-Restored get no bonus.
 *   Boards are cols×rows; N = max(cols, rows) (crafted circuits are square).
 * Uses the shared circuit-effect scorer (smallest closed loop; perfect 0→4).
 * Display matches hangar wallet notation (`c` credits), not a separate `$` unit.
 *
 * Effect 0 → price 25c (floor only; sell still allowed, including un-Restored circuits).
 */
import { circuitPerfectSellBonusCredits, type HubCircuitRecord } from "@estg/shared";

/** Credits floor always paid on sell (最低額). */
export const CIRCUIT_SELL_BASE_CREDITS = 25 as const;

/** Provisional credits per unit of circuit effect value (出来栄え / 有効値). */
export const CIRCUIT_SELL_CREDITS_PER_EFFECT = 3 as const;

/** Options for the sell price: perfect board side (N) or null when not Perfect. */
export type CircuitSellPriceOptions = {
  /**
   * Board side length N when the circuit is Perfect (Fully Awakened);
   * null / undefined → no 完璧ボーナス.
   */
  perfectSide?: number | null;
};

/**
 * 完璧ボーナス for a Perfect board of side N: `2 × round(4 × 1.5^N)` credits
 * (twice the junk craft credit cost; single source in @estg/shared).
 * Returns 0 for missing / non-positive N.
 */
export function perfectCircuitSellBonusCredits(
  side: number | null | undefined,
): number {
  return circuitPerfectSellBonusCredits(side);
}

/**
 * Side length N used for the 完璧ボーナス, or null when the record is not a
 * Perfect (Fully Awakened) circuit.
 * Perfect = the same flag the effect scorer uses (`circuitBoard.perfect ??
 * locked`) **and** outcome `fully_awakened`. N = max(cols, rows) of the stored
 * board (crafted circuits are square N×N; non-square boards use the longer side).
 */
export function circuitSellPerfectSide(
  rec: Pick<HubCircuitRecord, "circuitBoard" | "locked" | "outcome">,
): number | null {
  const board = rec.circuitBoard;
  const perfectFlag = (board.perfect ?? rec.locked) === true;
  const awakened =
    rec.outcome === "fully_awakened" || board.outcome === "fully_awakened";
  if (!perfectFlag || !awakened) return null;
  const n = Math.max(Math.floor(board.cols) || 0, Math.floor(board.rows) || 0);
  return n >= 1 ? n : null;
}

/**
 * Provisional sell price in credits:
 * `25 + floor(effect) * 3` (+ `2 × round(4 × 1.5^N)` when Perfect).
 * Effect 0, not Perfect → 25c (最低額 only).
 */
export function circuitSellPriceCredits(
  effectValue: number,
  opts?: CircuitSellPriceOptions,
): number {
  const e = Math.max(0, Math.floor(Number(effectValue) || 0));
  return (
    CIRCUIT_SELL_BASE_CREDITS +
    e * CIRCUIT_SELL_CREDITS_PER_EFFECT +
    perfectCircuitSellBonusCredits(opts?.perfectSide)
  );
}

/** Japanese breakdown for UI / confirm (総額 + 最低+出来栄え[+完璧ボーナス]). */
export function formatCircuitSellPriceJa(
  effectValue: number,
  opts?: CircuitSellPriceOptions,
): {
  total: number;
  base: number;
  craft: number;
  /** 完璧ボーナス credits (0 when not Perfect). */
  perfectBonus: number;
  /** Board side N used for the bonus, or null. */
  perfectSide: number | null;
  effect: number;
  buttonJa: string;
  confirmLineJa: string;
  detailJa: string;
} {
  const effect = Math.max(0, Math.floor(Number(effectValue) || 0));
  const craft = effect * CIRCUIT_SELL_CREDITS_PER_EFFECT;
  const base = CIRCUIT_SELL_BASE_CREDITS;
  const perfectBonus = perfectCircuitSellBonusCredits(opts?.perfectSide);
  const perfectSide = perfectBonus > 0 ? Math.floor(Number(opts?.perfectSide)) : null;
  const total = base + craft + perfectBonus;
  const detailJa =
    perfectBonus > 0
      ? `最低 ${base}c + 出来栄え ${craft}c + 完璧ボーナス ${perfectBonus}c（${perfectSide}×${perfectSide}）`
      : `最低 ${base}c + 出来栄え ${craft}c`;
  return {
    total,
    base,
    craft,
    perfectBonus,
    perfectSide,
    effect,
    buttonJa: `売却 仮${total}c`,
    confirmLineJa: `仮 +${total}c（${detailJa}）`,
    detailJa,
  };
}

// Module 3 UI side effects: trade window + junk→circuit crafting.
import "./four-resource-trade-ui";
import "./junk-circuit-craft-ui";
