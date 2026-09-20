/**
 * Module 5 session bootstrap: trade→restore ingest + restore→trade return URL.
 * Uses @estg/shared HANDOFF_M45 helpers only (no shared edits).
 */
import {
  HANDOFF_QUERY_KEYS,
  buildRestoreToTradeUrl,
  decodeEdgeState,
  edgeCount,
  isCircuitLocked,
  loadHubSaveFromLocalStorage,
  parseTradeToRestoreSearch,
  resolveModuleBaseUrl,
  sanitizeEditorName,
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
  /** Craft signature / 刻印 passed from hangar (or HubSave). */
  editorName?: string;
  /** Perfect Circuit — refuse edge / outcome edits. */
  locked: boolean;
  /** Engraved name when locked (prefer HubSave lastEditorName). */
  engravedName?: string;
};

/**
 * Parse trade→restore query. Hydrate marks from circuitBoard when present;
 * otherwise seed a demo puzzle (circuitId as seed when only id is given).
 */
export function bootstrapFromSearch(search: string): RestoreSession {
  const inbound = parseTradeToRestoreSearch(search);
  const hubEditor = lookupHubCircuitLock(
    inbound?.circuitId,
    inbound?.circuitBoard?.puzzleId,
  );
  const passedEditor =
    sanitizeEditorName(inbound?.editorName) ??
    sanitizeEditorName(inbound?.lastEditorName) ??
    hubEditor?.lastEditorName;
  const lockedFromHub = hubEditor?.locked === true;
  const lockedFromBoard =
    inbound?.circuitBoard != null && isCircuitLocked(inbound.circuitBoard);
  const lockedFromQuery = inbound?.locked === true;
  const locked = lockedFromHub || lockedFromBoard || lockedFromQuery;

  if (inbound?.circuitBoard != null) {
    const board = inbound.circuitBoard;
    // Prefer board.puzzleId so return payload matches inbound.
    const seed =
      (board.puzzleId && board.puzzleId.trim()) ||
      (inbound.circuitId && inbound.circuitId.trim()) ||
      DEFAULT_SEED;
    // Fixed verify-true seed may override cols/rows to the known solvable size.
    const puzzle = generatePuzzle(seed, board.cols, board.rows);
    const cols = puzzle.cols;
    const rows = puzzle.rows;
    const n = edgeCount(cols, rows);
    const marks = decodeEdgeState(board.edgeState, n);
    const session: RestoreSession = {
      puzzle,
      marks,
      source: "handoff-board",
      note: `HUB 受取 · 盤 hydrate ${cols}×${rows}${
        inbound.circuitId ? ` · id ${inbound.circuitId}` : ""
      }`,
      locked,
    };
    if (inbound.circuitId) session.circuitId = inbound.circuitId;
    if (board.outcome != null) session.inboundOutcome = board.outcome;
    if (passedEditor) session.editorName = passedEditor;
    if (locked) {
      session.engravedName =
        hubEditor?.lastEditorName ??
        sanitizeEditorName(board.lastEditorName) ??
        passedEditor;
    }
    return session;
  }

  if (inbound?.circuitId) {
    const puzzle = generatePuzzle(inbound.circuitId, DEFAULT_COLS, DEFAULT_ROWS);
    const n = edgeCount(puzzle.cols, puzzle.rows);
    const marks =
      loadMarksFromStorage(puzzle.puzzleId, n) ??
      freshMarks(puzzle.cols, puzzle.rows);
    const session: RestoreSession = {
      circuitId: inbound.circuitId,
      puzzle,
      marks,
      source: "handoff-id",
      note: `HUB 受取 · circuitId=${inbound.circuitId}（盤なし → シード生成）`,
      locked,
    };
    if (passedEditor) session.editorName = passedEditor;
    if (locked) {
      session.engravedName = hubEditor?.lastEditorName ?? passedEditor;
    }
    return session;
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
    locked: false,
    editorName: passedEditor,
  };
}

function lookupHubCircuitLock(
  circuitId?: string,
  puzzleId?: string,
): { locked: boolean; lastEditorName?: string } | null {
  try {
    const save = loadHubSaveFromLocalStorage();
    const list = save?.hub.circuits ?? [];
    const id = (circuitId ?? "").trim();
    const pid = (puzzleId ?? "").trim();
    const rec =
      (id && list.find((c) => c.circuitId === id)) ||
      (pid && list.find((c) => c.circuitBoard.puzzleId === pid)) ||
      null;
    if (!rec) return null;
    return {
      locked: isCircuitLocked(rec),
      lastEditorName: rec.lastEditorName ?? rec.circuitBoard.lastEditorName,
    };
  } catch {
    return null;
  }
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
  lastEditorName?: string;
  perfect?: boolean;
  locked?: boolean;
  baseUrl?: string;
}): string {
  let circuitBoard = boardFromMarks(
    args.cols,
    args.rows,
    args.marks,
    args.puzzleId,
    args.outcome,
  );
  const editor = sanitizeEditorName(args.lastEditorName);
  if (editor) circuitBoard = { ...circuitBoard, lastEditorName: editor };
  if (args.perfect) circuitBoard = { ...circuitBoard, perfect: true };
  if (args.locked) circuitBoard = { ...circuitBoard, locked: true };
  const payload: {
    circuitId?: string;
    circuitBoard: typeof circuitBoard;
    outcome: CircuitOutcome;
    lastEditorName?: string;
    locked?: boolean;
    perfect?: boolean;
  } = {
    circuitBoard,
    outcome: args.outcome,
  };
  if (args.circuitId != null && args.circuitId.trim() !== "") {
    payload.circuitId = args.circuitId.trim();
  }
  if (editor) payload.lastEditorName = editor;
  if (args.perfect) payload.perfect = true;
  if (args.locked) payload.locked = true;
  return buildRestoreToTradeUrl(payload, args.baseUrl ?? tradeBaseUrl());
}
