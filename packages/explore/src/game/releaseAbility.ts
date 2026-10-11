/**
 * #269 / PR-B — release-only ability scale by the equipped 1×1.
 *
 * Per mech (captain and wingmen alike), by the effect value of the 1×1 it
 * has equipped: the true 1×1 「4」 → ×1; effect 0 (the false 1×1) or no 1×1
 * at all → ×0.5 (provisional). Applies to exactly nine abilities: attack,
 * max ammo, bullet speed, fire interval, max durability, max power, range,
 * vision and move speed. The fire interval is divided by the scale (×0.5 →
 * the interval doubles, i.e. it fires slower).
 *
 * Q3a: a wingman with the false 1×1 also gets ×2 attack / range / vision on
 * top of ×0.5, so those three end up ×1. Never for the captain.
 * Q4: circuits on a destroyed mech do not count (attachCircuitPlay skips them).
 *
 * The numbers live ONLY in RELEASE_ABILITY_SCALE. Not a save key.
 */
export const RELEASE_ABILITY_SCALE = {
  /** Equipped 1×1 has effect value 4 (the true 「4」). */
  four: 1,
  /** Equipped 1×1 has effect value 0, or the mech has no 1×1 (provisional). */
  noFour: 0.5,
  /** Q3a: wingman with the false 1×1 → attack / range / vision ×2 on top. */
  falseOneWingman: 2,
} as const;

export const RELEASE_ABILITY_KEYS = [
  "attack",
  "maxAmmo",
  "bulletSpeed",
  "fireInterval",
  "maxDurability",
  "maxPower",
  "range",
  "vision",
  "moveSpeed",
] as const;

export type ReleaseAbilityKey = (typeof RELEASE_ABILITY_KEYS)[number];
export type AbilityScale = Record<ReleaseAbilityKey, number>;

export const IDENTITY_ABILITY_SCALE: Readonly<AbilityScale> = Object.freeze({
  attack: 1,
  maxAmmo: 1,
  bulletSpeed: 1,
  fireInterval: 1,
  maxDurability: 1,
  maxPower: 1,
  range: 1,
  vision: 1,
  moveSpeed: 1,
});

/**
 * `oneByOneEffect`: the highest effect value among the mech's equipped 1×1s
 * (4 for the true 「4」, 0 for the false 1×1), or null with no 1×1.
 * Outside release the scale is always ×1.
 */
export function releaseAbilityScale(opts: {
  release: boolean;
  isCaptain: boolean;
  oneByOneEffect: number | null;
  hasFalseOne: boolean;
}): AbilityScale {
  if (!opts.release) return { ...IDENTITY_ABILITY_SCALE };
  const k = (opts.oneByOneEffect ?? 0) >= 4 ? RELEASE_ABILITY_SCALE.four : RELEASE_ABILITY_SCALE.noFour;
  const wingBoost = !opts.isCaptain && opts.hasFalseOne ? RELEASE_ABILITY_SCALE.falseOneWingman : 1;
  return {
    attack: k * wingBoost,
    maxAmmo: k,
    bulletSpeed: k,
    fireInterval: 1 / k,
    maxDurability: k,
    maxPower: k,
    range: k * wingBoost,
    vision: k * wingBoost,
    moveSpeed: k,
  };
}
