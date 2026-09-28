import {
  BASIC_MATERIAL_LABEL_JA,
  PART_LABEL_JA,
  isBasicMaterialId,
  isPartId,
  yieldBagFromClearedWithMultiplier,
  type YieldBag,
  type YieldItemId,
} from "@estg/shared";
import {
  remainingValidInBag,
  resolveCraftMultiplier,
  SORT_V0_RULES,
  validSupplyGaugeState,
  type ClearedCounts,
  type RefineLive,
} from "./refine";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function labelYield(id: string): string {
  if (isBasicMaterialId(id)) return BASIC_MATERIAL_LABEL_JA[id];
  if (isPartId(id)) return PART_LABEL_JA[id];
  return id;
}

/** Compact yield bag → short Japanese chips (top HUD, non-blocking). */
export function formatYieldPreviewChips(
  bag: YieldBag,
  limit = 4,
): { chips: string; extra: number } {
  const entries = Object.entries(bag).filter(
    ([, n]) => (n ?? 0) > 0,
  ) as Array<[YieldItemId, number]>;
  const shown = entries.slice(0, limit);
  const chips = shown
    .map(
      ([id, n]) =>
        `<span class="hud-yield-chip">${escapeHtml(labelYield(id))} +${n}</span>`,
    )
    .join("");
  return { chips, extra: Math.max(0, entries.length - shown.length) };
}

/** Yield preview from one clear wave, scaled by craftMultiplier. */
export function buildYieldPreviewFromDelta(
  delta: ClearedCounts | null | undefined,
  craftMultiplier: number,
): YieldBag {
  if (delta == null) return {};
  const total = delta.ammo + delta.armor + delta.power;
  if (total <= 0) return {};
  return yieldBagFromClearedWithMultiplier(delta, craftMultiplier);
}

export type YieldPreviewMode = "wave" | "session";

export const YIELD_PREVIEW_MODE_LABEL_JA: Record<YieldPreviewMode, string> = {
  wave: "今回",
  session: "累積",
};

export function nextYieldPreviewMode(mode: YieldPreviewMode): YieldPreviewMode {
  return mode === "wave" ? "session" : "wave";
}

export function comboFeedbackTier(chain: number): "base" | "combo-2" | "combo-hot" {
  const n = Math.max(0, Math.floor(chain));
  if (n >= 3) return "combo-hot";
  if (n >= 2) return "combo-2";
  return "base";
}

export function comboTierClass(chain: number): string {
  const t = comboFeedbackTier(chain);
  return t === "base" ? "" : t;
}

export function buildValidSupplyGaugeHtml(
  s: Pick<RefineLive, "bag" | "validPieceBudget">,
): string {
  const g = validSupplyGaugeState(s);
  const pct = Math.round(g.ratio * 1000) / 10;
  const levelCls =
    g.level === "depleted"
      ? " depleted"
      : g.level === "tension"
        ? " tension"
        : g.level === "low"
          ? " low"
          : "";
  const label =
    g.level === "depleted"
      ? "有効供給なし（以降ジャンク）"
      : g.level === "tension"
        ? `ジャンク間近 残り有効 ${g.remaining}/${g.budget}`
        : `残り有効 ${g.remaining}/${g.budget}`;
  return `
    <div
      class="hud-gauge${levelCls}"
      role="meter"
      aria-label="残り有効パネル"
      aria-valuemin="0"
      aria-valuemax="${g.budget}"
      aria-valuenow="${g.remaining}"
      aria-valuetext="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      data-level="${g.level}"
    >
      <div class="hud-gauge-meta">
        <span class="hud-k">有効</span>
        <span class="hud-v">${g.remaining}<span class="hud-gauge-den">/${g.budget}</span></span>
      </div>
      <div class="hud-gauge-track" aria-hidden="true">
        <div class="hud-gauge-fill" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

export type TopFeedbackOpts = {
  showBagIntro?: boolean;
  showJunkTension?: boolean;
  yieldMode?: YieldPreviewMode;
};

export function buildTopFeedbackHtml(
  s: RefineLive,
  opts?: TopFeedbackOpts,
): string {
  const parts: string[] = [];
  const craft = resolveCraftMultiplier(s.inbound);
  const yieldMode: YieldPreviewMode = opts?.yieldMode ?? "wave";

  if (opts?.showBagIntro) {
    const g = validSupplyGaugeState(s);
    const untilJunk = g.remaining;
    parts.push(`
      <div class="hud-flash hud-flash-bag" role="status">
        <span class="hud-flash-k">袋スケール</span>
        <span class="hud-flash-v">有効 ${g.remaining}/${g.budget}</span>
        <span class="hud-flash-note">ジャンク変換まで ${untilJunk}</span>
      </div>
    `);
  }

  if (opts?.showJunkTension) {
    const g = validSupplyGaugeState(s);
    if (g.level === "tension") {
      parts.push(`
        <div class="hud-flash hud-flash-tension" role="status" aria-live="polite">
          <span class="hud-flash-k">緊張</span>
          <span class="hud-flash-v">ジャンク間近</span>
          <span class="hud-flash-note">有効残り ${g.remaining}</span>
        </div>
      `);
    }
  }

  const delta = s.lastClearDelta;
  if (delta != null) {
    const bag = buildYieldPreviewFromDelta(delta, craft);
    const chips = formatYieldPreviewChips(bag);
    if (chips.chips) {
      parts.push(`<div class="hud-flash hud-flash-yield" role="status"><span class="hud-flash-k">${YIELD_PREVIEW_MODE_LABEL_JA[yieldMode]}</span>${chips.chips}${chips.extra > 0 ? `<span class="hud-flash-more">+${chips.extra}</span>` : ""}</div>`);
    }
  }

  if (s.playMode === "clearing" || s.playMode === "settling") {
    parts.push(`<div class="hud-flash hud-flash-chain" role="status"><span class="hud-flash-k">CHAIN</span><strong>${Math.max(1, s.chainCount)}</strong></div>`);
  }

  const remaining = remainingValidInBag(s.bag);
  if (remaining <= 0 && s.phase === "play") {
    parts.push(`<div class="hud-flash hud-flash-depleted" role="status"><span class="hud-flash-k">SUPPLY</span><span class="hud-flash-v">有効パネル終了</span></div>`);
  }

  return parts.join("");
}
