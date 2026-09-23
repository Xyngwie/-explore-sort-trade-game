/**
 * Module 3 — circuit sell price (仮 / provisional).
 *
 * Formula (神宮): **最低 30c + 出来栄え floor(effect) × 3c**.
 * Uses the shared circuit-effect scorer (smallest closed loop; perfect 0→4).
 * Display matches hangar wallet notation (`c` credits), not a separate `$` unit.
 *
 * Effect 0 → price 30c (floor only; sell still allowed).
 */

/** Credits floor always paid on sell (最低額). */
export const CIRCUIT_SELL_BASE_CREDITS = 30 as const;

/** Provisional credits per unit of circuit effect value (出来栄え / 有効値). */
export const CIRCUIT_SELL_CREDITS_PER_EFFECT = 3 as const;

/**
 * Provisional sell price in credits: `30 + floor(effect) * 3` (never below base).
 * Effect 0 → 30c (最低額 only).
 */
export function circuitSellPriceCredits(effectValue: number): number {
  const e = Math.max(0, Math.floor(Number(effectValue) || 0));
  return CIRCUIT_SELL_BASE_CREDITS + e * CIRCUIT_SELL_CREDITS_PER_EFFECT;
}

/** Japanese breakdown for UI / confirm (総額 + 最低+出来栄え). */
export function formatCircuitSellPriceJa(effectValue: number): {
  total: number;
  base: number;
  craft: number;
  effect: number;
  buttonJa: string;
  confirmLineJa: string;
  detailJa: string;
} {
  const effect = Math.max(0, Math.floor(Number(effectValue) || 0));
  const craft = effect * CIRCUIT_SELL_CREDITS_PER_EFFECT;
  const base = CIRCUIT_SELL_BASE_CREDITS;
  const total = base + craft;
  return {
    total,
    base,
    craft,
    effect,
    buttonJa: `売却 仮${total}c`,
    confirmLineJa: `仮 +${total}c（最低 ${base}c + 出来栄え ${craft}c）`,
    detailJa: `最低 ${base}c + 出来栄え ${craft}c`,
  };
}
