/**
 * Module 5 (restore) — CircuitBoardState types + edgeState encode/decode stub.
 * See docs/RESTORE_V0.md. No puzzle rules / timer / handoff.
 */

/** Edge mark: 0 empty, 1 line, 2 ×/blocked. (2 bits; 3 reserved) */
export type EdgeMark = 0 | 1 | 2;

export type CircuitOutcome = "fully_awakened" | "bypass" | "offline";

export const CIRCUIT_OUTCOMES: readonly CircuitOutcome[] = [
  "fully_awakened",
  "bypass",
  "offline",
] as const;

export interface CircuitBoardState {
  v: 1;
  cols: number;
  rows: number;
  /** base64url-packed EdgeMark[] (2 bits each). */
  edgeState: string;
  outcome?: CircuitOutcome;
  puzzleId?: string;
  /** 刻印 — final editor name stamped on save / restore→hub. */
  lastEditorName?: string;
  /**
   * Perfect Circuit lock. Once true, board edges/outcome are uneditable.
   * Set when clearance is perfect (see isPerfectCircuitClearance).
   */
  locked?: boolean;
  /**
   * Explicit perfect flag (optional). With outcome===fully_awakened,
   * or digit 100% + single loop closed, marks a Perfect Circuit.
   */
  perfect?: boolean;
}

/** Horizontal edges first (row-major), then vertical — Slitherlink-style. */
export function edgeCount(cols: number, rows: number): number {
  if (cols < 1 || rows < 1) return 0;
  const horizontal = cols * (rows + 1);
  const vertical = rows * (cols + 1);
  return horizontal + vertical;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padLen);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Pack EdgeMark[] into a compact base64url string (2 bits per edge).
 */
export function encodeEdgeState(marks: readonly EdgeMark[]): string {
  if (marks.length === 0) return "";
  const byteLen = Math.ceil((marks.length * 2) / 8);
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i]! & 0b11;
    const bitIndex = i * 2;
    const byteIndex = bitIndex >> 3;
    const shift = 6 - (bitIndex & 7);
    bytes[byteIndex]! |= m << shift;
  }
  return bytesToBase64Url(bytes);
}

/**
 * Decode base64url edgeState back to EdgeMark[].
 * Fills/truncates to `expectedEdges` when provided.
 */
export function decodeEdgeState(
  encoded: string,
  expectedEdges?: number,
): EdgeMark[] {
  if (!encoded) {
    const n = expectedEdges ?? 0;
    return Array.from({ length: n }, () => 0 as EdgeMark);
  }
  const bytes = base64UrlToBytes(encoded);
  const maxFromBytes = Math.floor((bytes.length * 8) / 2);
  const count = expectedEdges ?? maxFromBytes;
  const marks: EdgeMark[] = [];
  for (let i = 0; i < count; i++) {
    if (i >= maxFromBytes) {
      marks.push(0);
      continue;
    }
    const bitIndex = i * 2;
    const byteIndex = bitIndex >> 3;
    const shift = 6 - (bitIndex & 7);
    const raw = (bytes[byteIndex]! >> shift) & 0b11;
    marks.push((raw === 3 ? 0 : raw) as EdgeMark);
  }
  return marks;
}

export function createEmptyCircuitBoard(
  cols: number,
  rows: number,
  puzzleId?: string,
): CircuitBoardState {
  const n = edgeCount(cols, rows);
  const marks = Array.from({ length: n }, () => 0 as EdgeMark);
  const state: CircuitBoardState = {
    v: 1,
    cols,
    rows,
    edgeState: encodeEdgeState(marks),
  };
  if (puzzleId != null && puzzleId !== "") state.puzzleId = puzzleId;
  return state;
}

export function isCircuitOutcome(x: unknown): x is CircuitOutcome {
  return (
    x === "fully_awakened" || x === "bypass" || x === "offline"
  );
}


/**
 * Normalize a loose board blob. Returns null if cols/rows/edgeState unusable.
 * Does not invent a board from nothing (caller supplies fallback empty board if needed).
 */
export function normalizeCircuitBoard(
  raw: unknown,
): CircuitBoardState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const v = obj.v === 1 || obj.v === "1" ? 1 : Number(obj.v);
  const cols = Math.floor(Number(obj.cols));
  const rows = Math.floor(Number(obj.rows));
  if (v !== 1 || !Number.isFinite(cols) || !Number.isFinite(rows)) return null;
  if (cols < 1 || rows < 1 || cols > 64 || rows > 64) return null;
  const edgeState = typeof obj.edgeState === "string" ? obj.edgeState : "";
  const board: CircuitBoardState = {
    v: 1,
    cols,
    rows,
    edgeState,
  };
  if (typeof obj.puzzleId === "string" && obj.puzzleId.trim()) {
    board.puzzleId = obj.puzzleId.trim().replace(/\|/g, "").slice(0, 64);
  }
  if (isCircuitOutcome(obj.outcome)) board.outcome = obj.outcome;
  const editor = sanitizeEditorName(obj.lastEditorName);
  if (editor) board.lastEditorName = editor;
  if (obj.locked === true) board.locked = true;
  if (obj.perfect === true) board.perfect = true;
  return board;
}

/**
 * Compact URL / query encoding for CircuitBoardState.
 * Shape: `v|cols|rows|edgeState|puzzleId|outcome` (trailing empties ok).
 * edgeState is already base64url; other fields avoid `|`.
 */
export function encodeCircuitBoardCompact(board: CircuitBoardState): string {
  const v = board.v === 1 ? "1" : String(Math.max(1, Math.floor(board.v)));
  const cols = String(Math.max(1, Math.floor(board.cols)));
  const rows = String(Math.max(1, Math.floor(board.rows)));
  const edge = (board.edgeState ?? "").replace(/\|/g, "");
  const puzzleId = (board.puzzleId ?? "").replace(/\|/g, "").slice(0, 64);
  const outcome =
    board.outcome != null && isCircuitOutcome(board.outcome) ? board.outcome : "";
  return [v, cols, rows, edge, puzzleId, outcome].join("|");
}

/**
 * Parse compact circuit board string. Returns null on malformed input.
 */
export function parseCircuitBoardCompact(
  raw: string | null | undefined,
): CircuitBoardState | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  const parts = s.split("|");
  if (parts.length < 4) return null;
  const v = Number.parseInt(parts[0]!, 10);
  const cols = Number.parseInt(parts[1]!, 10);
  const rows = Number.parseInt(parts[2]!, 10);
  if (v !== 1 || !Number.isFinite(cols) || !Number.isFinite(rows)) return null;
  if (cols < 1 || rows < 1 || cols > 64 || rows > 64) return null;
  const edgeState = parts[3] ?? "";
  const puzzleId = (parts[4] ?? "").trim();
  const outcomeRaw = (parts[5] ?? "").trim();
  const board: CircuitBoardState = {
    v: 1,
    cols,
    rows,
    edgeState,
  };
  if (puzzleId) board.puzzleId = puzzleId.slice(0, 64);
  if (isCircuitOutcome(outcomeRaw)) board.outcome = outcomeRaw;
  return board;
}


/** Max length for engraved editor name (刻印). */
export const CIRCUIT_EDITOR_NAME_MAX = 32;

/** Sanitize player craft signature / editor name for persistence. */
export function sanitizeEditorName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().replace(/[\u0000-\u001f|]/g, "").slice(0, CIRCUIT_EDITOR_NAME_MAX);
  return t || undefined;
}

/**
 * Perfect Circuit clearance (stub-friendly).
 * Clearest available check without a full solver:
 * - `perfect === true`, or
 * - `outcome === fully_awakened` AND (`perfect === true` OR digitRate≥1 + single loop closed).
 * When metrics are omitted, only an explicit `perfect`/`locked` flag counts
 * (fully_awakened alone does not lock).
 */
export function isPerfectCircuitClearance(input: {
  outcome?: CircuitOutcome | null;
  perfect?: boolean | null;
  locked?: boolean | null;
  digitRate?: number | null;
  loopClosed?: boolean | null;
}): boolean {
  if (input.locked === true) return true;
  if (input.perfect === true) return true;
  if (input.outcome !== "fully_awakened") return false;
  const hasMetrics =
    input.digitRate != null || input.loopClosed != null;
  if (!hasMetrics) return false;
  return (input.digitRate ?? 0) >= 1 && input.loopClosed === true;
}

/** True when a circuit board / hub record must refuse further edits. */
export function isCircuitLocked(
  input:
    | {
        locked?: boolean | null;
        perfect?: boolean | null;
        outcome?: CircuitOutcome | null;
        circuitBoard?: CircuitBoardState | null;
        digitRate?: number | null;
        loopClosed?: boolean | null;
      }
    | CircuitBoardState
    | null
    | undefined,
): boolean {
  if (input == null) return false;
  const board =
    "circuitBoard" in input && input.circuitBoard
      ? input.circuitBoard
      : (input as CircuitBoardState);
  const locked =
    ("locked" in input && input.locked === true) ||
    board.locked === true;
  if (locked) return true;
  const outcome =
    "outcome" in input && input.outcome != null
      ? input.outcome
      : board.outcome;
  const perfect =
    ("perfect" in input && input.perfect === true) ||
    board.perfect === true;
  const digitRate =
    "digitRate" in input ? (input as { digitRate?: number }).digitRate : undefined;
  const loopClosed =
    "loopClosed" in input
      ? (input as { loopClosed?: boolean }).loopClosed
      : undefined;
  return isPerfectCircuitClearance({
    outcome,
    perfect: perfect || undefined,
    digitRate,
    loopClosed,
  });
}

/**
 * Stamp editor name onto a board; optionally mark perfect/locked from clearance.
 * Does not mutate when already locked (returns input unchanged).
 */
export function stampCircuitEditor(
  board: CircuitBoardState,
  editorName: string | undefined | null,
  clearance?: {
    outcome?: CircuitOutcome | null;
    digitRate?: number | null;
    loopClosed?: boolean | null;
    perfect?: boolean | null;
  },
): CircuitBoardState {
  const next: CircuitBoardState = { ...board };
  const name = sanitizeEditorName(editorName);
  // Refresh 刻印 only while still editable; locked boards keep engraved name.
  if (!isCircuitLocked(board) && name) {
    next.lastEditorName = name;
  } else if (isCircuitLocked(board) && !next.lastEditorName && name) {
    // First persist of a board that arrived already flagged locked.
    next.lastEditorName = name;
  }
  if (isCircuitLocked(board) && board.locked === true) {
    // Preserve lock; do not mutate edges/outcome here (caller owns board bytes).
    if (board.perfect === true) next.perfect = true;
    next.locked = true;
    return next;
  }
  const outcome = clearance?.outcome ?? board.outcome;
  if (outcome && isCircuitOutcome(outcome)) next.outcome = outcome;
  const perfect = isPerfectCircuitClearance({
    outcome,
    perfect: clearance?.perfect ?? board.perfect,
    locked: board.locked,
    digitRate: clearance?.digitRate,
    loopClosed: clearance?.loopClosed,
  });
  if (perfect) {
    next.perfect = true;
    next.locked = true;
  }
  return next;
}
