/**
 * Circuit credit growth (神宮 2026-09-28, provisional — final numbers are
 * tuned by the economy pass). ONE source for both:
 * - junk craft credit cost for an N×N board: round(4 × 1.5^N) c
 * - Perfect (Fully Awakened) sell bonus: 2 × that
 * so the two cannot drift. docs/CIRCUIT_SQUAD_DESIGN_V0.md §2.2.
 */

/** Credits multiplier in `round(BASE × GROWTH^N)`. */
export const CIRCUIT_CRAFT_CREDIT_BASE = 4 as const;

/** Per-side credit growth (was 2^N before 2026-09-28). */
export const CIRCUIT_CRAFT_CREDIT_GROWTH = 1.5 as const;

/** Junk per board side: an N×N craft costs 2N junk. */
export const CIRCUIT_CRAFT_JUNK_PER_SIDE = 2 as const;

/** Perfect sell bonus = this × circuitCraftCreditCost(N). */
export const PERFECT_SELL_BONUS_CRAFT_MULTIPLIER = 2 as const;

function sideOf(n: number | null | undefined): number {
  const side = Math.floor(Number(n) || 0);
  return side >= 1 ? side : 0;
}

/**
 * Junk craft credit cost for an N×N board: `round(4 × 1.5^N)`.
 * 2→9, 4→20, 6→46, 8→103, 10→231, 20→13301. Missing / N < 1 → 0.
 */
export function circuitCraftCreditCost(n: number | null | undefined): number {
  const side = sideOf(n);
  if (side === 0) return 0;
  return Math.round(CIRCUIT_CRAFT_CREDIT_BASE * CIRCUIT_CRAFT_CREDIT_GROWTH ** side);
}

/** Junk craft junk cost for an N×N board: `2N`. Missing / N < 1 → 0. */
export function circuitCraftJunkCost(n: number | null | undefined): number {
  return CIRCUIT_CRAFT_JUNK_PER_SIDE * sideOf(n);
}

/**
 * Perfect (Fully Awakened) sell bonus for side N: `2 × circuitCraftCreditCost(N)`.
 * 2→18, 4→40, 6→92, 8→206, 10→462, 20→26602. Missing / N < 1 → 0.
 */
export function circuitPerfectSellBonusCredits(n: number | null | undefined): number {
  return PERFECT_SELL_BONUS_CRAFT_MULTIPLIER * circuitCraftCreditCost(n);
}
