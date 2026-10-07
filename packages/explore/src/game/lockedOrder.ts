/**
 * C20-b (2026-10-07 神宮): a wingman given an order it cannot follow (per
 * `isCommandUnlockedFor`, including the `wing_mobility` prerequisite) shows
 * 「？」 above its name on the map (~1.5 s, fading) and then, 50/50 — rerolled on
 * every order, even the same order repeated — either
 *   - stops: drops its current action and holds in place, shooting only enemies
 *     already in weapon range, until the next order (`Unit.holdOrder`), or
 *   - ignores the order and keeps doing what it was doing.
 * Nothing is logged (no stop / ignore line, no 「対象外」 line).
 *
 * From the UI this is reachable only through a squad-policy order to a mixed
 * squad (PR-a hides locked buttons and keys). Individual orders / 召還 keep the
 * same reaction as an API safety net.
 */
import { abortSalvage } from "./orders";
import type { Unit, World } from "./types";

/** Seconds the 「？」 stays (fades out linearly over this time). */
export const QUESTION_MARK_SEC = 1.5;
/** Probability of "stop" (otherwise "ignore"). */
export const LOCKED_ORDER_STOP_CHANCE = 0.5;
/** 「？」 colour / font: same as the wingman name label. */
export const QUESTION_COLOR = "#9ecbff";
export const QUESTION_FONT = "11px sans-serif";
/** Map label stance word while holding: 「僚機A·待機」. */
export const HOLD_LABEL_JA = "待機";

export type LockedOrderRng = () => number;
let lockedOrderRng: LockedOrderRng = Math.random;

/** Tests: make the stop / ignore roll deterministic. Pass null to restore Math.random. */
export function setLockedOrderRng(rng: LockedOrderRng | null): void {
  lockedOrderRng = rng ?? Math.random;
}

export type LockedOrderReaction = "stop" | "ignore" | "none";

/**
 * React to an order the wingman cannot follow: 「？」 + 50/50 stop / ignore.
 * Immobile wingmen roll too. A hold is NOT cleared by another order it cannot
 * follow ("ignore" while holding keeps holding).
 */
export function reactToLockedOrder(
  _world: World,
  wing: Unit,
  rng: LockedOrderRng = lockedOrderRng,
): LockedOrderReaction {
  if (!wing.alive || wing.kind !== "wingman") return "none";
  wing.questionT = QUESTION_MARK_SEC;
  if (rng() < LOCKED_ORDER_STOP_CHANCE) {
    abortSalvage(wing);
    wing.holdOrder = true;
    wing.moveTarget = null;
    return "stop";
  }
  return "ignore";
}

/** 0..1 opacity of the 「？」 (fades linearly over {@link QUESTION_MARK_SEC}). */
export function questionAlpha(wing: Pick<Unit, "questionT">): number {
  const t = wing.questionT ?? 0;
  if (t <= 0) return 0;
  return Math.max(0, Math.min(1, t / QUESTION_MARK_SEC));
}

/** Map label stance word for a mobile wingman: 「待機」 while holding, else the stance label. */
export function wingStanceTagJa(wing: Pick<Unit, "holdOrder">, stanceLabel: string): string {
  return wing.holdOrder ? HOLD_LABEL_JA : stanceLabel;
}
