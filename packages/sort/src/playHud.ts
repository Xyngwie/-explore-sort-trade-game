import {
  remainingValidInBag,
  validSupplyGaugeState,
  type RefineLive,
} from "./refine";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

/** Compact play HUD rail: moves / clears / chain + valid-supply gauge. */
export function buildPlayHudHtml(s: RefineLive): string {
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
    </div>
  `;
}
