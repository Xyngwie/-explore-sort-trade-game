/**
 * Module 5 session bootstrap: trade→restore ingest + restore→trade return URL.
 * Uses @estg/shared HANDOFF_M45 helpers only (no shared edits).
 */
import {
  HANDOFF_QUERY_KEYS,
  buildRestoreToTradeUrl,
  decodeEdgeState,
  edgeCount,
  parseTradeToRestoreSearch,
  resolveModuleBaseUrl,
  stripHandoffParams,
  type CircuitOutcome,
  type EdgeMark,
} from "@estg/shared";
import {
  boardFromMarks,
  freshMarks,
  generatePuzzle,
  loadMarksFromStorage,
  type RestorePuzzle,
} from "./puzzle";

export const DEFAULT_SEED = "restore-stub-6";
export const DEFAULT_COLS = 6;
export const DEFAULT_ROWS = 6;

export type RestoreSessionSource = "handoff-board" | "handoff-id" | "demo";

export type RestoreSession = {
  circuitId?: string;
  puzzle: RestorePuzzle;
  marks: EdgeMark[];
  /** Outcome carried on inbound circuitBoard, if any. */
  inboundOutcome?: CircuitOutcome;
  source: RestoreSessionSource;
  note: string;
};

/**
 * Parse trade→restore query. Hydrate marks from circuitBoard when present;
 * otherwise seed a demo puzzle (circuitId as seed when only id is given).
 */
export function bootstrapFromSearch(search: string): RestoreSession {
  const inbound = parseTradeToRestoreSearch(search);

  if (inbound?.circuitBoard != null) {
    const board = inbound.circuitBoard;
    const cols = board.cols;
    const rows = board.rows;
    // Prefer board.puzzleId so return payload matches inbound.
    const seed =
      (board.puzzleId && board.puzzleId.trim()) ||
      (inbound.circuitId && inbound.circuitId.trim()) ||
      DEFAULT_SEED;
    const puzzle = generatePuzzle(seed, cols, rows);
    const n = edgeCount(cols, rows);
    const marks = decodeEdgeState(board.edgeState, n);
    const session: RestoreSession = {
      puzzle,
      marks,
      source: "handoff-board",
      note: `HUB 受取 · 盤 hydrate ${cols}×${rows}${
        inbound.circuitId ? ` · id ${inbound.circuitId}` : ""
      }`,
    };
    if (inbound.circuitId) session.circuitId = inbound.circuitId;
    if (board.outcome != null) session.inboundOutcome = board.outcome;
    return session;
  }

  if (inbound?.circuitId) {
    const puzzle = generatePuzzle(inbound.circuitId, DEFAULT_COLS, DEFAULT_ROWS);
    const n = edgeCount(puzzle.cols, puzzle.rows);
    const marks =
      loadMarksFromStorage(puzzle.puzzleId, n) ??
      freshMarks(puzzle.cols, puzzle.rows);
    return {
      circuitId: inbound.circuitId,
      puzzle,
      marks,
      source: "handoff-id",
      note: `HUB 受取 · circuitId=${inbound.circuitId}（盤なし → シード生成）`,
    };
  }

  const puzzle = generatePuzzle(DEFAULT_SEED, DEFAULT_COLS, DEFAULT_ROWS);
  const n = edgeCount(puzzle.cols, puzzle.rows);
  const marks =
    loadMarksFromStorage(puzzle.puzzleId, n) ??
    freshMarks(puzzle.cols, puzzle.rows);
  return {
    puzzle,
    marks,
    source: "demo",
    note: "デモ盤 · クエリなし（trade→restore 未受信）",
  };
}

/** Strip trade→restore keys from the current location (after ingest). */
export function stripInboundSearchFromLocation(
  href: string = typeof window !== "undefined" ? window.location.href : "/",
): string {
  return stripHandoffParams(href, HANDOFF_QUERY_KEYS.tradeToRestore);
}

export function tradeBaseUrl(): string {
  return resolveModuleBaseUrl("trade");
}

/**
 * Build restore→trade URL with current board + outcome (shared helper).
 */
export function buildReturnToTradeUrl(args: {
  circuitId?: string;
  cols: number;
  rows: number;
  marks: readonly EdgeMark[];
  puzzleId: string;
  outcome: CircuitOutcome;
  baseUrl?: string;
}): string {
  const circuitBoard = boardFromMarks(
    args.cols,
    args.rows,
    args.marks,
    args.puzzleId,
    args.outcome,
  );
  const payload: {
    circuitId?: string;
    circuitBoard: typeof circuitBoard;
    outcome: CircuitOutcome;
  } = {
    circuitBoard,
    outcome: args.outcome,
  };
  if (args.circuitId != null && args.circuitId.trim() !== "") {
    payload.circuitId = args.circuitId.trim();
  }
  return buildRestoreToTradeUrl(payload, args.baseUrl ?? tradeBaseUrl());
}
