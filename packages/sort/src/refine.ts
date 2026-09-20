/**
 * Sort v2 Columns-style refine loop.
 * Falling 3-gem columns: position / rotate / drop; line matches clear with
 * gravity and chains. Junk never matches. SORT_V2 economy unchanged.
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

/** Provisional rules — economy from docs/SORT_V2_RULES.md; play is Columns. */
export const SORT_V0_RULES = {
  invalidRatio: 0.2,
  /** Classic Columns: 3+ same kind in a straight line. */
  minClearLine: 3,
  /** Falling column height (gems per drop). */
  fallingHeight: 3,
  boardCols: 6,
  boardRows: 12,
  /** Placements scale with budget so small demos stay short. */
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

/** Active falling column: gems[0] is top, gems[n-1] is bottom. */
export type FallingPiece = {
  col: number;
  /** Board row of the top gem. */
  row: number;
  gems: PieceKind[];
};

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
  falling: FallingPiece | null;
  /** Preview of next drop (up to fallingHeight gems). */
  nextGems: PieceKind[];
  /** Last chain length after a lock (for UI). */
  lastChain: number;
  statusMsg: string | null;
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

export function indexOf(cols: number, r: number, c: number): number {
  return r * cols + c;
}

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

/** @deprecated Prefer line matching; kept for callers that inspect connectivity. */
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

const LINE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal ↘
  [1, -1], // diagonal ↙
];

/**
 * Classic Columns matching: 3+ same *valid* kind in a straight line
 * (horizontal / vertical / diagonal). Junk never matches.
 */
export function findLineMatches(
  board: Cell[],
  cols: number,
  rows: number,
  minLen = SORT_V0_RULES.minClearLine,
): Set<number> {
  const marked = new Set<number>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const start = indexOf(cols, r, c);
      const kind = board[start];
      if (kind == null || kind === "junk") continue;
      for (const [dr, dc] of LINE_DIRS) {
        // Only start a ray from the "beginning" of a potential line
        // (previous cell in opposite dir differs / OOB) to avoid duplicates.
        const pr = r - dr;
        const pc = c - dc;
        if (pr >= 0 && pr < rows && pc >= 0 && pc < cols) {
          if (board[indexOf(cols, pr, pc)] === kind) continue;
        }
        const cells: number[] = [start];
        let rr = r + dr;
        let cc = c + dc;
        while (rr >= 0 && rr < rows && cc >= 0 && cc < cols) {
          const i = indexOf(cols, rr, cc);
          if (board[i] !== kind) break;
          cells.push(i);
          rr += dr;
          cc += dc;
        }
        if (cells.length >= minLen) {
          for (const i of cells) marked.add(i);
        }
      }
    }
  }
  return marked;
}

export function clearMatches(
  board: Cell[],
  matches: Set<number>,
): { board: Cell[]; cleared: ClearedCounts } {
  const next = [...board];
  const cleared: ClearedCounts = { food: 0, material: 0, energy: 0 };
  for (const i of matches) {
    const kind = next[i];
    if (kind === "food" || kind === "material" || kind === "energy") {
      cleared[kind]++;
    }
    next[i] = null;
  }
  return { board: next, cleared };
}

/** Gravity + re-match until stable. Returns chain count (number of clear waves). */
export function resolveChains(
  board: Cell[],
  cols: number,
  rows: number,
): { board: Cell[]; cleared: ClearedCounts; chain: number } {
  let b = board;
  const total: ClearedCounts = { food: 0, material: 0, energy: 0 };
  let chain = 0;
  for (;;) {
    const matches = findLineMatches(b, cols, rows);
    if (matches.size === 0) break;
    chain++;
    const cleared = clearMatches(b, matches);
    total.food += cleared.cleared.food;
    total.material += cleared.cleared.material;
    total.energy += cleared.cleared.energy;
    b = applyGravity(cleared.board, cols, rows);
  }
  return { board: b, cleared: total, chain };
}

export function countOnBoard(
  board: Cell[],
): ClearedCounts & { junk: number; empty: number } {
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

function peekNext(
  bag: PieceKind[],
  n = SORT_V0_RULES.fallingHeight,
): PieceKind[] {
  return bag.slice(0, Math.min(n, bag.length));
}

function takeFromBag(
  bag: PieceKind[],
  n = SORT_V0_RULES.fallingHeight,
): { gems: PieceKind[]; bag: PieceKind[] } {
  const take = Math.min(n, bag.length);
  return { gems: bag.slice(0, take), bag: bag.slice(take) };
}

/** Cell occupied if board has a piece, or if falling covers it. */
export function cellBlocked(
  board: Cell[],
  cols: number,
  rows: number,
  r: number,
  c: number,
): boolean {
  if (c < 0 || c >= cols || r < 0 || r >= rows) return true;
  return board[indexOf(cols, r, c)] != null;
}

/** True if falling piece at (col,row) with given height fits without overlap. */
export function canPlaceFalling(
  board: Cell[],
  cols: number,
  rows: number,
  col: number,
  row: number,
  height: number,
): boolean {
  if (col < 0 || col >= cols) return false;
  if (row < 0) return false;
  for (let i = 0; i < height; i++) {
    const r = row + i;
    if (r >= rows) return false;
    if (board[indexOf(cols, r, col)] != null) return false;
  }
  return true;
}

export function spawnFalling(
  board: Cell[],
  bag: PieceKind[],
  cols: number,
  rows: number,
): { falling: FallingPiece | null; bag: PieceKind[]; blocked: boolean } {
  if (bag.length === 0) {
    return { falling: null, bag, blocked: false };
  }
  const { gems, bag: rest } = takeFromBag(bag);
  const height = gems.length;
  const col = Math.floor((cols - 1) / 2);
  // Spawn with top at row 0; if that overlaps, try to finish (top-out).
  if (!canPlaceFalling(board, cols, rows, col, 0, height)) {
    // Put gems back — cannot spawn.
    return { falling: null, bag: [...gems, ...rest], blocked: true };
  }
  return {
    falling: { col, row: 0, gems },
    bag: rest,
    blocked: false,
  };
}

function mergeCleared(a: ClearedCounts, b: ClearedCounts): ClearedCounts {
  return {
    food: a.food + b.food,
    material: a.material + b.material,
    energy: a.energy + b.energy,
  };
}

function withNextPreview(s: RefineLive): RefineLive {
  return { ...s, nextGems: peekNext(s.bag) };
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
    const craft =
      parsed.craftMultiplier != null && Number.isFinite(parsed.craftMultiplier)
        ? parsed.craftMultiplier
        : undefined;
    const craftNote =
      craft != null && craft !== 1
        ? ` · craft×${craft.toFixed(2)}`
        : "";
    return {
      inbound: {
        salvagedContainers: parsed.salvagedContainers,
        totalStockPieces: stock,
        isExtracted: parsed.isExtracted,
        ...(craft != null ? { craftMultiplier: craft } : {}),
      },
      note: `explore 受取 · 缶 ${parsed.salvagedContainers} · 予算 ${stock} · 生還 ${parsed.isExtracted ? "はい" : "いいえ"}${craftNote}`,
      fromQuery: true,
    };
  }
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

  const base: RefineLive = {
    phase: gate.ok ? "briefing" : "blocked",
    inbound,
    note,
    blockReason: gate.reason,
    validPieceBudget,
    invalidPieceCount,
    bag: [],
    board: emptyBoard(cols, rows),
    cols,
    rows,
    movesLeft: gate.ok ? moveBudgetFor(validPieceBudget) : 0,
    cleared: { food: 0, material: 0, energy: 0 },
    falling: null,
    nextGems: [],
    lastChain: 0,
    statusMsg: null,
  };
  return base;
}

export function startRefine(s: RefineLive, seed = Date.now()): RefineLive {
  if (s.phase !== "briefing") return s;
  const bag = buildSupplyBag(
    s.validPieceBudget,
    s.invalidPieceCount,
    seed,
  );
  const spawned = spawnFalling(
    emptyBoard(s.cols, s.rows),
    bag,
    s.cols,
    s.rows,
  );
  let next: RefineLive = {
    ...s,
    phase: "play",
    bag: spawned.bag,
    board: emptyBoard(s.cols, s.rows),
    movesLeft: moveBudgetFor(s.validPieceBudget),
    cleared: { food: 0, material: 0, energy: 0 },
    falling: spawned.falling,
    lastChain: 0,
    statusMsg: null,
  };
  next = withNextPreview(next);
  if (spawned.blocked || spawned.falling == null) {
    return finishRefine(next);
  }
  return next;
}

function lockAndContinue(s: RefineLive): RefineLive {
  if (s.falling == null || s.phase !== "play") return s;
  const { falling } = s;
  const nextBoard = [...s.board];
  for (let i = 0; i < falling.gems.length; i++) {
    const r = falling.row + i;
    const idx = indexOf(s.cols, r, falling.col);
    nextBoard[idx] = falling.gems[i]!;
  }

  const resolved = resolveChains(nextBoard, s.cols, s.rows);
  const cleared = mergeCleared(s.cleared, resolved.cleared);
  const movesLeft = Math.max(0, s.movesLeft - 1);

  let next: RefineLive = {
    ...s,
    board: resolved.board,
    cleared,
    movesLeft,
    falling: null,
    lastChain: resolved.chain,
    statusMsg:
      resolved.chain > 1
        ? `連鎖 ×${resolved.chain}`
        : resolved.chain === 1
          ? "マッチ消去"
          : null,
  };

  if (movesLeft <= 0) {
    return finishRefine(withNextPreview(next));
  }

  const spawned = spawnFalling(next.board, next.bag, next.cols, next.rows);
  next = {
    ...next,
    bag: spawned.bag,
    falling: spawned.falling,
  };
  next = withNextPreview(next);

  if (spawned.blocked) {
    return finishRefine({
      ...next,
      statusMsg: "盤面が埋まりました",
    });
  }
  if (spawned.falling == null && next.bag.length === 0) {
    return finishRefine({
      ...next,
      statusMsg: "袋が空になりました",
    });
  }
  return next;
}

export type ControlAction =
  | "left"
  | "right"
  | "rotate"
  | "softDrop"
  | "hardDrop";

export function applyControl(s: RefineLive, action: ControlAction): RefineLive {
  if (s.phase !== "play" || s.falling == null) return s;
  const f = s.falling;
  const h = f.gems.length;

  if (action === "left") {
    if (canPlaceFalling(s.board, s.cols, s.rows, f.col - 1, f.row, h)) {
      return { ...s, falling: { ...f, col: f.col - 1 }, statusMsg: null };
    }
    return s;
  }
  if (action === "right") {
    if (canPlaceFalling(s.board, s.cols, s.rows, f.col + 1, f.row, h)) {
      return { ...s, falling: { ...f, col: f.col + 1 }, statusMsg: null };
    }
    return s;
  }
  if (action === "rotate") {
    if (h <= 1) return s;
    // Cycle: bottom → top (classic Columns feel).
    const gems = [...f.gems];
    const bottom = gems.pop()!;
    gems.unshift(bottom);
    return { ...s, falling: { ...f, gems }, statusMsg: null };
  }
  if (action === "softDrop") {
    if (canPlaceFalling(s.board, s.cols, s.rows, f.col, f.row + 1, h)) {
      return { ...s, falling: { ...f, row: f.row + 1 }, statusMsg: null };
    }
    return lockAndContinue(s);
  }
  if (action === "hardDrop") {
    let row = f.row;
    while (canPlaceFalling(s.board, s.cols, s.rows, f.col, row + 1, h)) {
      row++;
    }
    return lockAndContinue({ ...s, falling: { ...f, row } });
  }
  return s;
}

/** @deprecated Use applyControl. Kept briefly for migration; no-op on junk. */
export function tapCell(s: RefineLive, _index: number): RefineLive {
  return s;
}

export function finishRefine(s: RefineLive): RefineLive {
  if (s.phase !== "play" && s.phase !== "result") return s;
  return {
    ...s,
    phase: "result",
    falling: null,
    nextGems: [],
  };
}

export function scrapLossFromState(s: RefineLive): number {
  const onBoard = remainingValidOnBoard(s.board);
  const inBag = s.bag.filter((k) => k !== "junk").length;
  const inFalling =
    s.falling?.gems.filter((k) => k !== "junk").length ?? 0;
  return onBoard + inBag + inFalling;
}

export function resolveCraftMultiplier(inbound: ExploreToSortPayload): number {
  const fromInbound = inbound.craftMultiplier;
  if (fromInbound != null && Number.isFinite(fromInbound) && fromInbound > 0) {
    return fromInbound;
  }
  return SORT_V0_RULES.craftMultiplier;
}

export function toCraftingResult(s: RefineLive): CraftingPuzzleResult {
  const craftMultiplier = resolveCraftMultiplier(s.inbound);
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

/** Overlay falling gems onto a board copy for rendering. */
export function boardWithFalling(s: RefineLive): Cell[] {
  const out = [...s.board];
  if (s.falling == null) return out;
  const { col, row, gems } = s.falling;
  for (let i = 0; i < gems.length; i++) {
    const r = row + i;
    if (r < 0 || r >= s.rows) continue;
    out[indexOf(s.cols, r, col)] = gems[i]!;
  }
  return out;
}

/** Ghost landing row for the active piece (top row after hard drop). */
export function ghostRow(s: RefineLive): number | null {
  if (s.falling == null) return null;
  const f = s.falling;
  const h = f.gems.length;
  let row = f.row;
  while (canPlaceFalling(s.board, s.cols, s.rows, f.col, row + 1, h)) {
    row++;
  }
  return row;
}
