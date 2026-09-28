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

/** Per-clear wave vs session-cumulative yield chip source. */
export type YieldPreviewMode = "wave" | "session";

export const YIELD_PREVIEW_MODE_LABEL_JA: Record<YieldPreviewMode, string> = {
  wave: "今回",
  session: "累積",
};

/** Toggle target for the yield-mode button. */
export function nextYieldPreviewMode(mode: YieldPreviewMode): YieldPreviewMode {
  return mode === "wave" ? "session" : "wave";
}

/**
 * Visual intensity tier for consecutive clears / combo chain.
 * Used by HUD flash + board pending cells (no particles).
 */
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

/**
 * Remaining valid-panel supply gauge for the play HUD.
 * Visualizes bag leftover vs validPieceBudget — no junk-transition banner.
 * Levels: ok → low → tension (imminent junk color + telegraph) → depleted.
 */
export function buildValidSupplyGaugeHtml(
  s: Pick<RefineLive, "bag" | "validPieceBudget">,
): string {
  const g = validSupplyGaugeState(s);
  const pct = Math.round(g.ratio * 1000) / 10; // one decimal for CSS width
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
  /** Brief top telegraph when gauge first enters tension (not a junk banner). */
  showJunkTension?: boolean;
  /** Wave (per-clear) vs session cumulative yield chips. Default wave. */
  yieldMode?: YieldPreviewMode;
};

/**
 * Top feedback strip: chain count, yield preview, status — never a center overlay.
 */
export function buildTopFeedbackHtml(
  s: RefineLive,
  opts?: TopFeedbackOpts,
): string {
  const parts: string[] = [];
  const craft = resolveCraftMultiplier(s.inbound);
  const yieldMode: YieldPreviewMode = opts?.yieldMode ?? "wave";

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

  // Short junk-tension telegraph (gauge already shifted) — not a persistent banner.
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

  // Active chain / simultaneous clear visualization (top, not center).
  if (s.playMode === "clearing" || s.playMode === "settling") {
    const modeLabel = s.playMode === "clearing" ? "同時消去" : "落下連鎖";
    const n = Math.max(1, s.chainCount);
    const tier = comboTierClass(n);
    const comboNote =
      n >= 3 ? "連続クリア！" : n >= 2 ? "連鎖中" : "着地済みもスワップ可";
    parts.push(`
      <div class="hud-flash hud-flash-chain${tier ? ` ${tier}` : ""}" role="status" aria-live="polite" data-combo="${n}">
        <span class="hud-chain-x">×${n}</span>
        <span class="hud-flash-v">${escapeHtml(modeLabel)}</span>
        <span class="hud-flash-note">${escapeHtml(comboNote)}</span>
      </div>
    `);
  } else if (s.lastChain > 1 && s.statusMsg?.includes("連鎖完了")) {
    const n = s.lastChain;
    const tier = comboTierClass(n);
    parts.push(`
      <div class="hud-flash hud-flash-chain done${tier ? ` ${tier}` : ""}" role="status" data-combo="${n}">
        <span class="hud-chain-x">×${n}</span>
        <span class="hud-flash-v">連鎖完了</span>
        <span class="hud-flash-note">${n >= 3 ? "高連鎖" : "コンボ"}</span>
      </div>
    `);
  }

  // Yield chips: per-clear wave and/or session cumulative (toggle).
  const waveDelta = s.lastClearDelta;
  const sessionCounts = s.cleared;
  const sourceCounts: ClearedCounts | null =
    yieldMode === "session"
      ? sessionCounts
      : waveDelta;
  const yieldBag = buildYieldPreviewFromDelta(sourceCounts, craft);
  const { chips, extra } = formatYieldPreviewChips(yieldBag);
  const sessionTotal =
    sessionCounts.food + sessionCounts.material + sessionCounts.energy;
  const showYield =
    chips.length > 0 &&
    (yieldMode === "session" ? sessionTotal > 0 : waveDelta != null);
  if (showYield) {
    const delta = sourceCounts!;
    const pieceBits = [
      delta.food > 0 ? `食${delta.food}` : "",
      delta.material > 0 ? `部${delta.material}` : "",
      delta.energy > 0 ? `電${delta.energy}` : "",
    ]
      .filter(Boolean)
      .join("·");
    const modeLabel = YIELD_PREVIEW_MODE_LABEL_JA[yieldMode];
    const nextMode = nextYieldPreviewMode(yieldMode);
    const nextLabel = YIELD_PREVIEW_MODE_LABEL_JA[nextMode];
    parts.push(`
      <div class="hud-flash hud-flash-yield" role="status" aria-live="polite">
        <span class="hud-flash-k">産出</span>
        <button
          type="button"
          class="hud-yield-toggle"
          id="btn-yield-mode"
          data-mode="${yieldMode}"
          aria-label="産出表示を切り替え（現在 ${escapeHtml(modeLabel)}）"
          title="タップで${escapeHtml(nextLabel)}表示"
        >${escapeHtml(modeLabel)}</button>
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

export type PlayHudOpts = TopFeedbackOpts;

/** Compact play HUD rail: moves / clears / chain + valid-supply gauge + top feedback. */
export function buildPlayHudHtml(s: RefineLive, opts?: PlayHudOpts): string {
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
