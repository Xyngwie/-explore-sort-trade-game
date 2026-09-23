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

/**
 * Yield preview from one clear wave (lastClearDelta), scaled by craftMultiplier.
 */
export function buildYieldPreviewFromDelta(
  delta: ClearedCounts | null | undefined,
  craftMultiplier: number,
): YieldBag {
  if (delta == null) return {};
  const total = delta.food + delta.material + delta.energy;
  if (total <= 0) return {};
  return yieldBagFromClearedWithMultiplier(delta, craftMultiplier);
}

/**
 * Remaining valid-panel supply gauge for the play HUD.
 * Visualizes bag leftover vs validPieceBudget — no junk-transition banner.
 */
export function buildValidSupplyGaugeHtml(
  s: Pick<RefineLive, "bag" | "validPieceBudget">,
): string {
  const g = validSupplyGaugeState(s);
  const pct = Math.round(g.ratio * 1000) / 10; // one decimal for CSS width
  const depletedCls = g.depleted ? " depleted" : g.ratio <= 0.2 ? " low" : "";
  const label = g.depleted
    ? "有効供給なし（以降ジャンク）"
    : `残り有効 ${g.remaining}/${g.budget}`;
  return `
    <div
      class="hud-gauge${depletedCls}"
      role="meter"
      aria-label="残り有効パネル"
      aria-valuemin="0"
      aria-valuemax="${g.budget}"
      aria-valuenow="${g.remaining}"
      aria-valuetext="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
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

/**
 * Top feedback strip: chain count, yield preview, status — never a center overlay.
 */
export function buildTopFeedbackHtml(
  s: RefineLive,
  opts?: { showBagIntro?: boolean },
): string {
  const parts: string[] = [];
  const craft = resolveCraftMultiplier(s.inbound);

  // Bag difficulty (briefly at session start) — scale + how far until junk.
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

  // Active chain / simultaneous clear visualization (top, not center).
  if (s.playMode === "clearing" || s.playMode === "settling") {
    const modeLabel = s.playMode === "clearing" ? "同時消去" : "落下連鎖";
    const n = Math.max(1, s.chainCount);
    parts.push(`
      <div class="hud-flash hud-flash-chain" role="status" aria-live="polite">
        <span class="hud-chain-x">×${n}</span>
        <span class="hud-flash-v">${escapeHtml(modeLabel)}</span>
        <span class="hud-flash-note">着地済みもスワップ可</span>
      </div>
    `);
  } else if (s.lastChain > 1 && s.statusMsg?.includes("連鎖完了")) {
    parts.push(`
      <div class="hud-flash hud-flash-chain done" role="status">
        <span class="hud-chain-x">×${s.lastChain}</span>
        <span class="hud-flash-v">連鎖完了</span>
      </div>
    `);
  }

  // Yield preview from the clear that just committed (non-blocking top chips).
  const yieldBag = buildYieldPreviewFromDelta(s.lastClearDelta, craft);
  const { chips, extra } = formatYieldPreviewChips(yieldBag);
  if (chips) {
    const delta = s.lastClearDelta!;
    const pieceBits = [
      delta.food > 0 ? `食${delta.food}` : "",
      delta.material > 0 ? `部${delta.material}` : "",
      delta.energy > 0 ? `電${delta.energy}` : "",
    ]
      .filter(Boolean)
      .join("·");
    parts.push(`
      <div class="hud-flash hud-flash-yield" role="status" aria-live="polite">
        <span class="hud-flash-k">産出</span>
        <span class="hud-flash-pieces">${escapeHtml(pieceBits)}</span>
        <span class="hud-yield-chips">${chips}${
          extra > 0
            ? `<span class="hud-yield-chip muted">+${extra}</span>`
            : ""
        }</span>
      </div>
    `);
  }

  // Compact status (top) — replaces below-board field-status mid-play.
  if (
    s.statusMsg &&
    !(s.playMode === "clearing" || s.playMode === "settling") &&
    !(s.lastChain > 1 && s.statusMsg.includes("連鎖完了"))
  ) {
    parts.push(
      `<p class="hud-flash hud-flash-status" role="status">${escapeHtml(s.statusMsg)}</p>`,
    );
  }

  if (parts.length === 0) return "";
  return `<div class="hud-feedback" aria-label="プレイフィードバック">${parts.join("")}</div>`;
}

/** Compact play HUD rail: moves / clears / chain + valid-supply gauge + top feedback. */
export function buildPlayHudHtml(
  s: RefineLive,
  opts?: { showBagIntro?: boolean },
): string {
  const chain =
    s.playMode === "clearing" || s.playMode === "settling"
      ? `×${s.chainCount}${s.playMode === "settling" ? " 落下" : " 点滅"}`
      : s.lastChain > 0
        ? `前回×${s.lastChain}`
        : "—";
  // Bag length equals remaining valid (junk never queued in bag).
  const bagLeft = remainingValidInBag(s.bag);
  return `
    <div class="hud-rail" aria-label="プレイ HUD">
      <div class="hud-stats">
        <div class="hud-stat"><span class="hud-k">手数</span><span class="hud-v">${s.movesLeft}</span></div>
        <div class="hud-stat"><span class="hud-k">袋</span><span class="hud-v">${bagLeft}</span></div>
        <div class="hud-stat"><span class="hud-k">消</span><span class="hud-v">${s.cleared.food}/${s.cleared.material}/${s.cleared.energy}</span></div>
        <div class="hud-stat"><span class="hud-k">連鎖</span><span class="hud-v">${escapeHtml(chain)}</span></div>
        <div class="legend hud-legend" aria-hidden="true">
          <span class="swatch food">食</span>
          <span class="swatch material">部</span>
          <span class="swatch energy">電</span>
          <span class="swatch junk">ジャ</span>
        </div>
      </div>
      ${buildValidSupplyGaugeHtml(s)}
      ${buildTopFeedbackHtml(s, opts)}
    </div>
  `;
}

/**
 * Briefing bag-difficulty line: budget scale and how far until junk conversion.
 */
export function buildBriefingBagDifficultyHtml(
  s: Pick<RefineLive, "validPieceBudget" | "inbound">,
): string {
  const budget = Math.max(0, s.validPieceBudget);
  const capacity = SORT_V0_RULES.boardCols * SORT_V0_RULES.boardRows;
  const fillNote =
    budget >= capacity
      ? `盤 ${capacity} 埋めたあと袋に ${budget - capacity}`
      : `盤を埋める有効 ${budget} · 不足は開始後ジャンク`;
  return `
    <li class="brief-bag" title="有効が尽きると以降はジャンクのみ補充">
      <span>ジャンクまで</span>
      <strong>${budget}</strong>
      <em class="brief-bag-note">${escapeHtml(fillNote)}</em>
    </li>
  `;
}
