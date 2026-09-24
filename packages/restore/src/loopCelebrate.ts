/**
 * Perfect / closed-loop completion celebrate FX for Restore.
 * Amplifies existing active-loop highlight — does not replace it.
 */

export const LOOP_CELEBRATE_MS = 1100;

export type LoopCelebrateState = {
  loopClosed: boolean;
  /** Brief settle window after transition into closed loop. */
  celebrating: boolean;
  perfect: boolean;
  /** Fully Awakened (or equivalent) for stronger copy. */
  fullyAwakened?: boolean;
};

/** Arm celebrate when loop transitions from open → closed. */
export function shouldArmLoopCelebrate(
  prevClosed: boolean,
  nowClosed: boolean,
): boolean {
  return !prevClosed && nowClosed;
}

/** Extra classes on `.slither` — keeps `active-loop` edges untouched. */
export function slitherLoopCelebrateClass(state: LoopCelebrateState): string {
  const parts: string[] = [];
  if (state.loopClosed) parts.push("loop-closed");
  if (state.celebrating) parts.push("loop-celebrate");
  if (state.perfect || state.fullyAwakened) parts.push("loop-perfect");
  return parts.length ? ` ${parts.join(" ")}` : "";
}

/** Classes for effect-value readout settle FX. */
export function effectSettleClass(state: LoopCelebrateState): string {
  const parts: string[] = [];
  if (state.loopClosed) parts.push("loop-live");
  if (state.celebrating) parts.push("settle");
  if (state.perfect || state.fullyAwakened) parts.push("perfect");
  return parts.length ? ` ${parts.join(" ")}` : "";
}

export function buildLoopCelebrateNoteHtml(state: LoopCelebrateState): string {
  if (!state.loopClosed) return "";
  if (state.celebrating) {
    const title =
      state.perfect || state.fullyAwakened
        ? "完全ループ成立"
        : "閉ループ成立";
    const blurb =
      state.perfect || state.fullyAwakened
        ? "効果値が確定トーンで着地 · 青白グローは採点中の最小閉ループ"
        : "効果値が着地 · 青白グローは採点中の最小閉ループ（既存ハイライトを強化）";
    return `<div class="loop-celebrate-note" role="status" aria-live="polite">
      <span class="loop-celebrate-k">${title}</span>
      <span class="loop-celebrate-v">${blurb}</span>
    </div>`;
  }
  return `<p class="loop-hint muted loop-live-hint">閉ループ採点中 · グロー強調は active-loop を上書きせず増幅</p>`;
}
