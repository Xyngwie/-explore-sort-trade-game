/**
 * Explore tuning entrypoint (ISSUE-02).
 *
 * All numeric balance lives in `./balance.ts` (`BALANCE`). This module
 * re-exports that table plus named aliases for the playtest-facing knobs
 * so moveSpeed / payload slowdown / range / ammo defaults are easy to find
 * without hunting through components. Behavior-equivalent refactor only —
 * do not put trade/economy prices here.
 */
export {
  BALANCE,
  balanceForDensity,
  balanceForThreat,
  clampDensity,
  ENGAGE_BRIEFING_LABEL,
  threatFromDensity,
  threatFromEngage,
  threatFromInvadeSector,
  type Balance,
  type DensityThreat,
  type EngageThreatInput,
} from "./balance";

import { BALANCE } from "./balance";
import { DEFAULT_EXPEDITION_LOADOUT } from "@estg/shared";

/**
 * Playtest-facing aliases (same values as BALANCE / shared loadout).
 * Prefer `BALANCE.*` at call sites; use these when documenting or grepping.
 */
export const EXPLORE_TUNABLES = {
  /** Captain base move speed. */
  moveSpeed: BALANCE.moveSpeed,
  /** Wingman base move speed. */
  wingmanSpeed: BALANCE.wingmanSpeed,
  /**
   * Payload slowdown floor (speed mul at/above cargoSpeedRefSlots).
   * Playtest ~45% at 3+ items when soft ref is 2.
   */
  payloadPenalty: BALANCE.cargoSpeedMulMin,
  cargoSpeedMulMin: BALANCE.cargoSpeedMulMin,
  cargoSpeedRefSlots: BALANCE.cargoSpeedRefSlots,
  visionRange: BALANCE.visionRange,
  weaponRange: BALANCE.weaponRange,
  engageRange: BALANCE.engageRange,
  /** Sortie clock seconds when handoff omits a budget. */
  defaultTimeSec: BALANCE.defaultTimeSec,
  /**
   * Starting ammo when trade omits `startingAmmo`.
   * Owned by shared expedition defaults — mirrored here for discoverability only.
   */
  startingAmmo: DEFAULT_EXPEDITION_LOADOUT.ammoStock,
} as const;
