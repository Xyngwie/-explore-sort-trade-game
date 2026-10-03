import type { World } from "./types";

type Phase = World["phase"];

/**
 * Tracks the phase the DOM last rendered, so every phase change is handled by
 * the same frame path (`main.ts` `frame`): changes made inside a tick
 * (extraction X lift-off, leader down) and changes made by a button between
 * frames (撤退 → `abortSortie`). A per-frame "phase before tick" snapshot
 * misses the latter, which left the result screen undrawn after 撤退.
 */
export type PhaseWatcher = {
  /** Call when the DOM has been rendered for `phase` (start of `renderDom`). */
  markRendered(phase: Phase): void;
  /** Returns `phase` if it differs from the last rendered phase (and records it), else null. */
  takeChange(phase: Phase): Phase | null;
};

export function createPhaseWatcher(initial: Phase): PhaseWatcher {
  let rendered: Phase = initial;
  return {
    markRendered(phase) {
      rendered = phase;
    },
    takeChange(phase) {
      if (phase === rendered) return null;
      rendered = phase;
      return phase;
    },
  };
}
