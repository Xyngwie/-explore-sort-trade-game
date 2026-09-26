export const COVER_RULES = {
  /** Probability that an incoming hit is completely negated while in cover. */
  blockChance: 0.5,
} as const;

export function rollCoverBlock(random: () => number = Math.random): boolean {
  return random() < COVER_RULES.blockChance;
}
