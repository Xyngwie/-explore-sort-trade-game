/**
 * Module 3 — circuit sell price (仮 / provisional).
 *
 * Formula (神宮): **有効値 × 3** credits.
 * Uses the shared circuit-effect scorer (smallest closed loop; perfect 0→4).
 * Display matches hangar wallet notation (`c` credits), not a separate `$` unit.
 *
 * Effect 0 → price 0; sell is still allowed (clears inventory).
 */

/** Provisional credits per unit of circuit effect value (有効値). */
export const CIRCUIT_SELL_CREDITS_PER_EFFECT = 3 as const;

/**
 * Provisional sell price in credits: `floor(effect) * 3` (never negative).
 * Effect 0 → 0c (sell allowed).
 */
export function circuitSellPriceCredits(effectValue: number): number {
  const e = Math.max(0, Math.floor(Number(effectValue) || 0));
  return e * CIRCUIT_SELL_CREDITS_PER_EFFECT;
}
