import {
  createRefineFromLocationSearch,
  createTestPlayRefine,
  TEST_PLAY_CONTAINERS,
  type RefineLive,
} from "./refine";

/** How the current play session was started (for 「もう一度」). */
export type SessionSource = "location" | "test-play";

/**
 * UI stage phases on the single play field.
 * Maps 1:1 from RefineLive.phase except `play` → `playing` for clarity in CSS/docs.
 */
export type StagePhase = "blocked" | "briefing" | "playing" | "result";

export function toStagePhase(phase: RefineLive["phase"]): StagePhase {
  return phase === "play" ? "playing" : phase;
}

/**
 * Rebuild briefing state for 「もう一度」.
 * - test-play: keep the long-demo 100-container budget (URL may still be demo/handoff)
 * - location: re-parse current search (handoff or demo defaults)
 */
export function resolveRestartState(
  source: SessionSource,
  search: string,
): RefineLive {
  if (source === "test-play") {
    return createTestPlayRefine(TEST_PLAY_CONTAINERS);
  }
  return createRefineFromLocationSearch(search);
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Centered ribbon (帯) hero CTA for the result phase — lives on the play field.
 */
export function buildResultRibbonHtml(handoffUrl: string): string {
  const href = escapeHtml(handoffUrl);
  return `
    <div class="result-ribbon-wrap" role="region" aria-label="仕分完了">
      <div class="result-ribbon">
        <p class="result-ribbon-title" id="result-ribbon-title">仕分完了！</p>
        <div class="result-ribbon-actions">
          <a class="btn" id="btn-hangar" href="${href}" target="_top" rel="noopener">格納庫へ</a>
          <button type="button" class="secondary" id="btn-again">もう一度</button>
        </div>
      </div>
    </div>
  `;
}

/** Compact yield lines for the result overlay (on-field, not a second screen). */
export function buildResultYieldCompactHtml(opts: {
  yieldFood: number;
  yieldMaterial: number;
  yieldEnergy: number;
  scrapLossCount: number;
  craftMultiplier: number;
  lastChain: number;
}): string {
  const m = opts.craftMultiplier.toFixed(3);
  return `
    <div class="result-yield-compact" aria-label="精製結果要約">
      <span>食 ${opts.yieldFood}</span>
      <span>部 ${opts.yieldMaterial}</span>
      <span>電 ${opts.yieldEnergy}</span>
      <span class="muted">屑 ${opts.scrapLossCount}</span>
      <span class="muted">×${opts.lastChain || 1}</span>
      <span class="muted">craft ${escapeHtml(m)}</span>
    </div>
  `;
}
