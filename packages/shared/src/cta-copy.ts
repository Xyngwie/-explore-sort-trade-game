/**
 * Unified CTA button labels across modules (copy only).
 *
 * Rules:
 * - Primary: `{行き先}へ` (仕分 / 格納庫 / 探索 / 戦線 / 修復)
 * - Secondary retry: `もう一度` (sortie retry only: `再出撃`)
 * - Tertiary hub return: always `格納庫へ` (abolish 拠点 / Hub(trade) / 〜へ渡す / 〜へ戻る)
 * - Result / context status lives in chips or notes — never embedded in button text
 * - Handoff URL key contracts are unchanged; this module is labels only
 */
export const CTA_COPY = {
  toSort: "仕分へ",
  toHangar: "格納庫へ",
  toExplore: "探索へ",
  toFront: "戦線へ",
  toRestore: "修復へ",
  /** Secondary retry (Sort / Restore demo replay, etc.) */
  again: "もう一度",
  /** Secondary retry — Explore / Invade sortie only */
  sortieAgain: "再出撃",
  /** Viewing locked circuits (Trade) — minimal, not a destination */
  view: "閲覧",
} as const;

export type CtaCopyKey = keyof typeof CTA_COPY;

/**
 * Chip / note labels paired with CTAs.
 * Status and context belong here (or equivalent UI), not inside button text.
 */
export const CTA_CHIP = {
  wearReport: "摩耗報告",
  unopened: "未開封",
  forcedCombat: "強制交戦",
  raid: "任意レイド",
} as const;

export type CtaChipKey = keyof typeof CTA_CHIP;
