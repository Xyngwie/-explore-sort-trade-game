import {
  RESOURCE_IDS,
  RESOURCE_LABEL_JA,
  type YieldBag,
  buildSortToTradeUrl,
  buildSortToTradeUrlFromResult,
  CTA_CHIP,
  CTA_COPY,
} from "@estg/shared";
import {
  cargoAcceptedForWarehouse,
  createRefineFromLocationSearch,
  createTestPlayRefine,
  resolveCraftMultiplier,
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
          <a class="btn" id="btn-hangar" href="${href}" target="_top" rel="noopener">${CTA_COPY.toHangar}</a>
          <button type="button" class="secondary" id="btn-again">${CTA_COPY.again}</button>
        </div>
      </div>
    </div>
  `;
}

/** Compact yield lines for the result overlay (on-field, not a second screen). */
export function buildResultYieldCompactHtml(opts: {
  yieldBag: YieldBag | undefined;
  craftMultiplier: number;
  lastChain: number;
}): string {
  // fix/hub-save-legacy-retire (詳細 4): the result shows only the 4 resources.
  const m = opts.craftMultiplier.toFixed(3);
  const bag = opts.yieldBag ?? {};
  const cells = RESOURCE_IDS.map(
    (id) => `<span data-resource="${id}">${escapeHtml(RESOURCE_LABEL_JA[id])} ${Math.max(0, Math.floor(bag[id] ?? 0))}</span>`,
  ).join("");
  return `
    <div class="result-yield-compact" aria-label="精製結果要約">
      ${cells}
      <span class="muted">×${opts.lastChain || 1}</span>
      <span class="muted">craft ${escapeHtml(m)}</span>
    </div>
  `;
}

/**
 * Empty cargo / zero-budget entry from explore→sort.
 * Extracted run with nothing to refine — do not force the board; offer skip-to-hub.
 * Non-extracted failures stay blocked without this skip path.
 */
export function isEmptyCargoEntry(
  s: Pick<RefineLive, "inbound" | "validPieceBudget">,
): boolean {
  return cargoAcceptedForWarehouse(s.inbound) && s.validPieceBudget <= 0;
}

/**
 * Same sort→trade URL contract as a normal post-sort handoff with zero yield
 * (`fromSort=1`, `craftMultiplier`, no `yieldBag`). Preserves HubSave
 * apply path on trade (no-op resource / bag).
 */
export function buildEmptySkipToHubUrl(
  s: Pick<RefineLive, "inbound">,
  baseUrl: string,
): string {
  return buildSortToTradeUrlFromResult(
    {
      yieldFood: 0,
      yieldMaterial: 0,
      yieldEnergy: 0,
      craftMultiplier: resolveCraftMultiplier(s.inbound),
      yieldBag: {},
    },
    baseUrl,
  );
}

/**
 * Primary CTA for empty-cargo blocked overlay — matches result-ribbon hangar
 * navigation (`target="_top"`).
 */
export function buildEmptySkipHubCtaHtml(handoffUrl: string): string {
  const href = escapeHtml(handoffUrl);
  return `<a class="btn" id="btn-skip-hub" href="${href}" target="_top" rel="noopener">${CTA_COPY.toHangar}</a>`;
}

/**
 * Briefing-phase skip when inbound cargo / valid budget > 0.
 * Deposits remaining inbound containers as Hub 未開封 stock (no refine).
 */
export function canSkipWithCargo(
  s: Pick<RefineLive, "inbound" | "validPieceBudget"> & {
    phase?: RefineLive["phase"];
  },
): boolean {
  if (s.phase != null && s.phase !== "briefing") return false;
  return (
    cargoAcceptedForWarehouse(s.inbound) &&
    s.validPieceBudget > 0 &&
    Math.max(0, Math.floor(s.inbound.salvagedContainers)) > 0
  );
}

/**
 * Zero-yield sort→trade URL that deposits inbound container count into Hub
 * `unopenedContainers` via `depositUnopenedContainers` (no resource import).
 */
export function buildCargoSkipToHubUrl(
  s: Pick<RefineLive, "inbound">,
  baseUrl: string,
): string {
  const deposit = Math.max(0, Math.floor(s.inbound.salvagedContainers));
  return buildSortToTradeUrl(
    {
      fromSort: true,
      craftMultiplier: resolveCraftMultiplier(s.inbound),
      ...(deposit > 0 ? { depositUnopenedContainers: deposit } : {}),
    },
    baseUrl,
  );
}

/** Secondary CTA on briefing — deposit cans as 未開封, skip refine. */
export function buildCargoSkipHubCtaHtml(handoffUrl: string): string {
  const href = escapeHtml(handoffUrl);
  // Status (未開封) as chip — button text stays tertiary hub CTA only.
  return `<span class="cta-chip" aria-label="${CTA_CHIP.unopened}">${CTA_CHIP.unopened}</span>
<a class="btn secondary" id="btn-skip-cargo-hub" href="${href}" target="_top" rel="noopener">${CTA_COPY.toHangar}</a>`;
}
