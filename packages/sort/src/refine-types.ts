import type { ExploreToSortPayload } from "@estg/shared";

export type PieceKind = "ammo" | "armor" | "power" | "junk";

export const VALID_KINDS: readonly Exclude<PieceKind, "junk">[] = [
  "ammo",
  "armor",
  "power",
];

export const PIECE_LABEL_JA: Record<PieceKind, string> = {
  ammo: "弾薬",
  armor: "装甲パーツ",
  power: "電力パーツ",
  junk: "ジャンク",
};

export type ClearedCounts = {
  ammo: number;
  armor: number;
  power: number;
};

export type RefinePhase = "blocked" | "briefing" | "play" | "result";

export type Cell = PieceKind | null;

/**
 * idle = waiting for swap;
 * clearing = short blink before erase;
 * settling = slow gravity/refill (active-chain skill window — swaps free).
 */
export type PlayMode = "idle" | "clearing" | "settling";

export type RefineLive = {
  phase: RefinePhase;
  inbound: ExploreToSortPayload;
  note: string;
  blockReason: string | null;
  validPieceBudget: number;
  invalidPieceCount: number;
  bag: PieceKind[];
  board: Cell[];
  cols: number;
  rows: number;
  movesLeft: number;
  cleared: ClearedCounts;
  /** Indices marked to clear when the chain window commits. */
  pendingClear: number[];
  playMode: PlayMode;
  /** Current chain wave count (0 when idle). */
  chainCount: number;
  /** Last finished chain length (for UI flash). */
  lastChain: number;
  /**
   * Remaining blink ms while clearing (informational; UI owns the timer).
   * Engine extends this when mid-blink swaps add matches.
   * During settling, UI uses SORT_V0_RULES.settleStepMs instead.
   */
  chainWindowMsLeft: number;
  /** Selected cell index for tap-tap swap (cursor-style). */
  selected: number | null;
  statusMsg: string | null;
  /**
   * Cleared counts from the most recent commitClearStep (one blink wave).
   * UI shows a brief top yield preview from this; cleared on return to idle.
   */
  lastClearDelta: ClearedCounts | null;
};
