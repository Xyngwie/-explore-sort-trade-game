import {
  createRefineFromLocationSearch,
  createTestPlayRefine,
  TEST_PLAY_CONTAINERS,
  type RefineLive,
} from "./refine";

/** How the current play session was started (for 「もう一度」). */
export type SessionSource = "location" | "test-play";

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
 * Centered ribbon (帯) hero CTA for the result phase.
 * Buttons live on the ribbon; yield summary stays in a separate card.
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
