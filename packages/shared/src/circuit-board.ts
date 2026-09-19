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
