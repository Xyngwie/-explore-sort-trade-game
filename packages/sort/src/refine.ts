/**
 * Sort v2 minimal refine loop — honest rules, simplified board.
 * Tap connected groups of 3+ valid pieces to clear; junk cannot be cleared.
 */
import {
  type CraftingPuzzleResult,
  type ExploreToSortPayload,
  type YieldBag,
  PIECES_PER_CONTAINER,
  parseExploreToSortSearch,
  stockFromContainers,
  yieldBagFromClearedWithMultiplier,
} from "@estg/shared";

/** Provisional invalid ratio from docs/SORT_V2_RULES.md */
export const SORT_V0_RULES = {
  invalidRatio: 0.2,
  minClearGroup: 3,
  boardCols: 6,
  boardRows: 8,
  /** Moves scale with budget so small demos stay short. */
  movesPerValidPiece: 0.2,
  minMoves: 8,
  maxMoves: 40,
  craftMultiplier: 1,
} as const;

export type PieceKind = "food" | "material" | "energy" | "junk";

export const VALID_KINDS: readonly Exclude<PieceKind, "junk">[] = [
  "food",
  "material",
  "energy",
];

export const PIECE_LABEL_JA: Record<PieceKind, string> = {
  food: "食料",
  material: "部品",
  energy: "電力",
  junk: "ジャンク",
};

export type ClearedCounts = {
  food: number;
  material: number;
  energy: number;
};

export type RefinePhase = "blocked" | "briefing" | "play" | "result";

export type Cell = PieceKind | null;

export type RefineLive = {
  phase: RefinePhase;
  inbound: ExploreToSortPayload;
  note: string;
  blockReason: string | null;
  validPieceBudget: number;
  invalidPieceCount: number;
  /** Remaining pieces not yet on the board (or still in play on board). */
  bag: PieceKind[];
  board: Cell[];
  cols: number;
  rows: number;
  movesLeft: number;
  cleared: ClearedCounts;
  selected: number | null;
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rnd: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

export function computeBudgets(
  inbound: ExploreToSortPayload,
): { validPieceBudget: number; invalidPieceCount: number } {
  const validPieceBudget =
    inbound.totalStockPieces > 0
      ? Math.floor(inbound.totalStockPieces)
      : stockFromContainers(inbound.salvagedContainers);
  const invalidPieceCount = Math.floor(
    validPieceBudget * SORT_V0_RULES.invalidRatio,
  );
  return { validPieceBudget, invalidPieceCount };
}

export function canStartRefine(inbound: ExploreToSortPayload): {
  ok: boolean;
  reason: string | null;
} {
  if (!inbound.isExtracted) {
    return { ok: false, reason: "未生還（isExtracted=false）のため精製できません。" };
  }
  const { validPieceBudget } = computeBudgets(inbound);
  if (validPieceBudget <= 0) {
    return { ok: false, reason: "有効ピース予算が 0 です（缶／在庫なし）。" };
  }
  return { ok: true, reason: null };
}

/** Build supply bag: valid kinds ~equal, plus junk. */
export function buildSupplyBag(
  validPieceBudget: number,
  invalidPieceCount: number,
  seed = 1,
): PieceKind[] {
  const bag: PieceKind[] = [];
  for (let i = 0; i < validPieceBudget; i++) {
    bag.push(VALID_KINDS[i % VALID_KINDS.length]!);
  }
  for (let i = 0; i < invalidPieceCount; i++) {
    bag.push("junk");
  }
  const rnd = mulberry32(seed ^ (validPieceBudget * 97) ^ invalidPieceCount);
  shuffleInPlace(bag, rnd);
  return bag;
}

export function moveBudgetFor(validPieceBudget: number): number {
  const raw = Math.ceil(validPieceBudget * SORT_V0_RULES.movesPerValidPiece);
  return Math.min(
    SORT_V0_RULES.maxMoves,
    Math.max(SORT_V0_RULES.minMoves, raw),
  );
}

function emptyBoard(cols: number, rows: number): Cell[] {
  return Array.from({ length: cols * rows }, () => null);
}

/** Drop pieces from bag into empty cells (top→bottom fill via gravity later). */
export function fillBoardFromBag(
  board: Cell[],
  bag: PieceKind[],
  cols: number,
  rows: number,
): { board: Cell[]; bag: PieceKind[] } {
  const nextBoard = [...board];
  const nextBag = [...bag];
  // Fill empty cells from bottom-left upward so gravity looks natural after.
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (nextBoard[i] == null && nextBag.length > 0) {
        nextBoard[i] = nextBag.shift()!;
      }
    }
  }
  return { board: nextBoard, bag: nextBag };
}

/** Gravity: pieces fall down within each column. */
export function applyGravity(
  board: Cell[],
  cols: number,
  rows: number,
): Cell[] {
  const next = emptyBoard(cols, rows);
  for (let c = 0; c < cols; c++) {
    const stack: PieceKind[] = [];
    for (let r = rows - 1; r >= 0; r--) {
      const cell = board[r * cols + c];
      if (cell != null) stack.push(cell);
    }
    for (let i = 0; i < stack.length; i++) {
      const r = rows - 1 - i;
      next[r * cols + c] = stack[i]!;
    }
  }
  return next;
}

export function settleBoard(
  board: Cell[],
  bag: PieceKind[],
  cols: number,
  rows: number,
): { board: Cell[]; bag: PieceKind[] } {
  let b = applyGravity(board, cols, rows);
  const filled = fillBoardFromBag(b, bag, cols, rows);
  b = applyGravity(filled.board, cols, rows);
  return { board: b, bag: filled.bag };
}

export function indexOf(cols: number, r: number, c: number): number {
  return r * cols + c;
}

export function floodGroup(
  board: Cell[],
  cols: number,
  rows: number,
  start: number,
): number[] {
  const kind = board[start];
  if (kind == null) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen.has(i)) continue;
    seen.add(i);
    if (board[i] !== kind) continue;
    out.push(i);
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (c > 0) stack.push(indexOf(cols, r, c - 1));
    if (c + 1 < cols) stack.push(indexOf(cols, r, c + 1));
    if (r > 0) stack.push(indexOf(cols, r - 1, c));
    if (r + 1 < rows) stack.push(indexOf(cols, r + 1, c));
  }
  return out;
}

export function countOnBoard(board: Cell[]): ClearedCounts & { junk: number; empty: number } {
  const out = { food: 0, material: 0, energy: 0, junk: 0, empty: 0 };
  for (const cell of board) {
    if (cell == null) out.empty++;
    else out[cell]++;
  }
  return out;
}

export function remainingValidOnBoard(board: Cell[]): number {
  let n = 0;
  for (const cell of board) {
    if (cell != null && cell !== "junk") n++;
  }
  return n;
}

export function hasClearableGroup(
  board: Cell[],
  cols: number,
  rows: number,
  minSize = SORT_V0_RULES.minClearGroup,
): boolean {
  const seen = new Set<number>();
  for (let i = 0; i < board.length; i++) {
    const kind = board[i];
    if (kind == null || kind === "junk" || seen.has(i)) continue;
    const group = floodGroup(board, cols, rows, i);
    for (const g of group) seen.add(g);
    if (group.length >= minSize) return true;
  }
  return false;
}

export function parseInboundOrDemo(search: string): {
  inbound: ExploreToSortPayload;
  note: string;
  fromQuery: boolean;
} {
  const parsed = parseExploreToSortSearch(search);
  if (parsed != null) {
    const stock =
      parsed.totalStockPieces > 0
        ? parsed.totalStockPieces
        : stockFromContainers(parsed.salvagedContainers);
    return {
      inbound: {
        salvagedContainers: parsed.salvagedContainers,
        totalStockPieces: stock,
        isExtracted: parsed.isExtracted,
      },
      note: `explore 受取 · 缶 ${parsed.salvagedContainers} · 予算 ${stock} · 生還 ${parsed.isExtracted ? "はい" : "いいえ"}`,
      fromQuery: true,
    };
  }
  // Demo default so `npm run dev:sort` is playable without a query.
  const containers = 2;
  const stock = stockFromContainers(containers);
  return {
    inbound: {
      salvagedContainers: containers,
      totalStockPieces: stock,
      isExtracted: true,
    },
    note: `デモ入力 · 缶 ${containers} · 予算 ${stock}（クエリなし）`,
    fromQuery: false,
  };
}

export function createRefineFromLocationSearch(search: string): RefineLive {
  const { inbound, note } = parseInboundOrDemo(search);
  const gate = canStartRefine(inbound);
  const { validPieceBudget, invalidPieceCount } = computeBudgets(inbound);
  const cols = SORT_V0_RULES.boardCols;
  const rows = SORT_V0_RULES.boardRows;

  if (!gate.ok) {
    return {
      phase: "blocked",
      inbound,
      note,
      blockReason: gate.reason,
      validPieceBudget,
      invalidPieceCount,
      bag: [],
      board: emptyBoard(cols, rows),
      cols,
      rows,
      movesLeft: 0,
      cleared: { food: 0, material: 0, energy: 0 },
      selected: null,
    };
  }

  return {
    phase: "briefing",
    inbound,
    note,
    blockReason: null,
    validPieceBudget,
    invalidPieceCount,
    bag: [],
    board: emptyBoard(cols, rows),
    cols,
    rows,
    movesLeft: moveBudgetFor(validPieceBudget),
    cleared: { food: 0, material: 0, energy: 0 },
    selected: null,
  };
}

export function startRefine(s: RefineLive, seed = Date.now()): RefineLive {
  if (s.phase !== "briefing") return s;
  const bag = buildSupplyBag(
    s.validPieceBudget,
    s.invalidPieceCount,
    seed,
  );
  const settled = settleBoard(
    emptyBoard(s.cols, s.rows),
    bag,
    s.cols,
    s.rows,
  );
  return {
    ...s,
    phase: "play",
    bag: settled.bag,
    board: settled.board,
    movesLeft: moveBudgetFor(s.validPieceBudget),
    cleared: { food: 0, material: 0, energy: 0 },
    selected: null,
  };
}

/**
 * Tap a cell. Junk / null / groups smaller than minClearGroup do nothing.
 * Valid group ≥3 → clear, count yields, gravity+refill, spend a move.
 */
export function tapCell(s: RefineLive, index: number): RefineLive {
  if (s.phase !== "play") return s;
  if (index < 0 || index >= s.board.length) return s;
  const kind = s.board[index];
  if (kind == null) return { ...s, selected: null };
  if (kind === "junk") {
    // Invalid pieces cannot be matched / cleared.
    return { ...s, selected: index };
  }

  const group = floodGroup(s.board, s.cols, s.rows, index);
  if (group.length < SORT_V0_RULES.minClearGroup) {
    return { ...s, selected: index };
  }

  const nextBoard = [...s.board];
  for (const i of group) nextBoard[i] = null;

  const cleared: ClearedCounts = { ...s.cleared };
  if (kind === "food" || kind === "material" || kind === "energy") {
    cleared[kind] += group.length;
  }

  const settled = settleBoard(nextBoard, s.bag, s.cols, s.rows);
  const movesLeft = Math.max(0, s.movesLeft - 1);

  let next: RefineLive = {
    ...s,
    board: settled.board,
    bag: settled.bag,
    cleared,
    movesLeft,
    selected: null,
  };

  if (movesLeft <= 0 || !hasClearableGroup(next.board, next.cols, next.rows)) {
    next = finishRefine(next);
  }
  return next;
}

export function finishRefine(s: RefineLive): RefineLive {
  if (s.phase !== "play" && s.phase !== "result") return s;
  return { ...s, phase: "result", selected: null };
}

export function scrapLossFromState(s: RefineLive): number {
  const onBoard = remainingValidOnBoard(s.board);
  const inBag = s.bag.filter((k) => k !== "junk").length;
  // Minimal: uncleared valid pieces (board + bag). Junk omitted per docs "min ok".
  return onBoard + inBag;
}

export function toCraftingResult(s: RefineLive): CraftingPuzzleResult {
  const craftMultiplier = SORT_V0_RULES.craftMultiplier;
  const yieldBag: YieldBag = yieldBagFromClearedWithMultiplier(
    s.cleared,
    craftMultiplier,
  );
  return {
    yieldFood: s.cleared.food,
    yieldMaterial: s.cleared.material,
    yieldEnergy: s.cleared.energy,
    scrapLossCount: scrapLossFromState(s),
    craftMultiplier,
    totalTilesCleared:
      s.cleared.food + s.cleared.material + s.cleared.energy,
    yieldBag,
  };
}

export function demoQueryExample(): string {
  const cans = 2;
  return `?salvagedContainers=${cans}&totalStockPieces=${cans * PIECES_PER_CONTAINER}&isExtracted=1`;
}
