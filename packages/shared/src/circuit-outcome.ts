/**
 * Classify the result of a Restore attempt from its observable progress.
 *
 * This is intentionally pure and UI-agnostic so Restore and future Hub/Trade
 * handoff code can agree on the same outcome vocabulary.
 */
import type { CircuitOutcome } from "./circuit-board";

export interface CircuitRestoreProgress {
  /** Fraction of visible clues currently satisfied, normalized to 0..1. */
  digitRate: number;
  /** Whether the player's marked line edges currently form the required single loop. */
  loopClosed: boolean;
}

/**
 * Convert Restore progress into the canonical circuit outcome.
 *
 * - Fully Awakened: every clue is satisfied and a single loop is closed.
 * - Bypass: there is any meaningful repair progress, but it is not complete.
 * - Offline: no clue progress has been made.
 *
 * `digitRate` is clamped so malformed UI input cannot produce a false perfect.
 */
export function classifyCircuitOutcome(
  progress: CircuitRestoreProgress,
): CircuitOutcome {
  const rate = Number.isFinite(progress.digitRate)
    ? Math.max(0, Math.min(1, progress.digitRate))
    : 0;

  if (rate >= 1 && progress.loopClosed === true) return "fully_awakened";
  if (rate > 0) return "bypass";
  return "offline";
}

/** True when an outcome represents any usable Restore result. */
export function isRestoredCircuitOutcome(
  outcome: CircuitOutcome,
): boolean {
  return outcome === "fully_awakened" || outcome === "bypass";
}
