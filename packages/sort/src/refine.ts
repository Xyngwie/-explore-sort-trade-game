/**
 * Sort v2 Panel de Pon / Puzzle League style refine loop.
 * Stacked panels on a grid; orthogonal (H+V) adjacent swap + raise;
 * H/V matches of 3+ clear with gravity; active chain window lets the
 * player keep swapping to extend combos. Junk never matches.
 * SORT_V2 economy unchanged.
 *
 * Intentional departure from classic Panel de Pon / Puzzle League:
 * those titles only allow horizontal neighbor swaps; we also allow
 * vertical (above/below) swaps for touch swipe up/down and tap-select.
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

/** Panel de Pon play + SORT_V2 economy (docs/SORT_V2_RULES.md). */
export const SORT_V0_RULES = {
  invalidRatio: 0.2,
  /** Match length (horizontal / vertical only — no diagonal). */
  minClearLine: 3,
  boardCols: 6,
  boardRows: 12,
  /** How many bottom rows to prefill from the bag on start. */
  initialFillRows: 5,
  /**
   * Active-chain window (ms). UI ticks commitClearStep after this;
   * player may keep swapping while the window is open.
   */
  chainWindowMs: 550,
  /** Extra ms added when a mid-chain swap creates new matches. */
  chainWindowExtendMs: 280,
  /** Swaps/raises scale with budget so small demos stay short. */
  movesPerValidPiece: 0.35,
  minMoves: 12,
  maxMoves: 48,
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

/** idle = waiting for swap/raise; clearing = chain window open. */
export type PlayMode = "idle" | "clearing";

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
   * Remaining window ms (informational; UI owns the timer).
   * Engine extends this when mid-chain swaps add matches.
   */
  chainWindowMsLeft: number;
  /** Selected cell index for tap-tap swap (cursor-style). */
  selected: number | null;
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

const LINE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // horizontal
  [1, 0], // vertical
];

/**
 * Panel de Pon matching: 3+ same *valid* kind in a straight horizontal or
 * vertical line. No diagonals. Junk never matches.
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
  matches: Set<number> | number[],
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

/**
 * Resolve all passive gravity chains (no player input). Used in tests and
 * for seeding. Live play uses the active-chain window instead.
 */
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

function mergeCleared(a: ClearedCounts, b: ClearedCounts): ClearedCounts {
  return {
    food: a.food + b.food,
    material: a.material + b.material,
    energy: a.energy + b.energy,
  };
}

function takeFromBag(
  bag: PieceKind[],
  n: number,
): { gems: PieceKind[]; bag: PieceKind[] } {
  const take = Math.min(n, bag.length);
  return { gems: bag.slice(0, take), bag: bag.slice(take) };
}

/** True if two indices are orthogonally adjacent (horizontal or vertical). */
export function areAdjacent(
  cols: number,
  a: number,
  b: number,
): boolean {
  const ra = Math.floor(a / cols);
  const ca = a % cols;
  const rb = Math.floor(b / cols);
  const cb = b % cols;
  const dr = Math.abs(ra - rb);
  const dc = Math.abs(ca - cb);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

/**
 * Classic Panel de Pon / Puzzle League: horizontal neighbors only.
 * Kept for contrast — our swap rule intentionally includes vertical.
 */
export function areHorizontalAdjacent(
  cols: number,
  a: number,
  b: number,
): boolean {
  const ra = Math.floor(a / cols);
  const ca = a % cols;
  const rb = Math.floor(b / cols);
  const cb = b % cols;
  return ra === rb && Math.abs(ca - cb) === 1;
}

/**
 * Whether two panels may be swapped.
 * Orthogonal neighbors (left/right **and** above/below).
 * Intentional departure from classic horizontal-only swaps.
 */
export function canSwapAdjacent(
  cols: number,
  a: number,
  b: number,
): boolean {
  return areAdjacent(cols, a, b);
}

/**
 * Prefill bottom rows from bag. Avoids leaving immediate matches by
 * resolving passive chains without awarding clears (seed settle).
 */
export function fillInitialBoard(
  bag: PieceKind[],
  cols: number,
  rows: number,
  fillRows: number,
): { board: Cell[]; bag: PieceKind[] } {
  let rest = [...bag];
  let board = emptyBoard(cols, rows);
  const startRow = Math.max(0, rows - fillRows);
  for (let r = startRow; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rest.length === 0) break;
      const { gems, bag: next } = takeFromBag(rest, 1);
      board[indexOf(cols, r, c)] = gems[0]!;
      rest = next;
    }
  }
  // Settle accidental opening matches without scoring; return pieces to bag.
  let b = board;
  for (;;) {
    const matches = findLineMatches(b, cols, rows);
    if (matches.size === 0) break;
    for (const i of matches) {
      const kind = b[i];
      if (kind != null) rest.push(kind);
    }
    const cleared = clearMatches(b, matches);
    b = applyGravity(cleared.board, cols, rows);
  }
  return { board: b, bag: rest };
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

  return {
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
    pendingClear: [],
    playMode: "idle",
    chainCount: 0,
    lastChain: 0,
    chainWindowMsLeft: 0,
    selected: null,
    statusMsg: null,
  };
}

export function startRefine(s: RefineLive, seed = Date.now()): RefineLive {
  if (s.phase !== "briefing") return s;
  const bag = buildSupplyBag(
    s.validPieceBudget,
    s.invalidPieceCount,
    seed,
  );
  const filled = fillInitialBoard(
    bag,
    s.cols,
    s.rows,
    SORT_V0_RULES.initialFillRows,
  );
  return {
    ...s,
    phase: "play",
    bag: filled.bag,
    board: filled.board,
    movesLeft: moveBudgetFor(s.validPieceBudget),
    cleared: { food: 0, material: 0, energy: 0 },
    pendingClear: [],
    playMode: "idle",
    chainCount: 0,
    lastChain: 0,
    chainWindowMsLeft: 0,
    selected: null,
    statusMsg: null,
  };
}

function maybeFinishOnMoves(s: RefineLive): RefineLive {
  if (s.phase !== "play") return s;
  if (s.playMode === "clearing") return s;
  if (s.movesLeft <= 0) {
    return finishRefine({ ...s, statusMsg: "手数切れ" });
  }
  return s;
}

/**
 * Enter / refresh clearing window with the given match set.
 */
function beginOrExtendClear(
  s: RefineLive,
  matches: Set<number>,
  opts: { newChain: boolean; extendOnly: boolean },
): RefineLive {
  if (matches.size === 0) return s;
  const pending = new Set(s.pendingClear);
  for (const i of matches) pending.add(i);
  const chainCount = opts.newChain
    ? Math.max(1, s.chainCount)
    : opts.extendOnly
      ? s.chainCount
      : s.chainCount + 1;
  const windowMs = opts.extendOnly
    ? Math.max(
        s.chainWindowMsLeft,
        SORT_V0_RULES.chainWindowExtendMs,
      ) + SORT_V0_RULES.chainWindowExtendMs
    : SORT_V0_RULES.chainWindowMs;
  return {
    ...s,
    pendingClear: [...pending],
    playMode: "clearing",
    chainCount: opts.newChain ? 1 : chainCount,
    chainWindowMsLeft: windowMs,
    selected: null,
    statusMsg:
      (opts.newChain ? 1 : chainCount) > 1
        ? `連鎖 ×${opts.newChain ? 1 : chainCount}（スワップで伸ばせる）`
        : "マッチ！ 連鎖ウィンドウ中",
  };
}

/**
 * Swap two orthogonally adjacent panels (horizontal or vertical).
 * Vertical is an intentional departure from classic Panel de Pon.
 * - Idle: costs 1 move; opens chain window if matches form.
 * - Clearing (active chain): free; new matches merge into pending clear
 *   and extend the window (skill expression).
 */
export function swapPanels(
  s: RefineLive,
  a: number,
  b: number,
): RefineLive {
  if (s.phase !== "play") return s;
  if (a === b) return s;
  if (a < 0 || b < 0 || a >= s.board.length || b >= s.board.length) return s;
  if (!canSwapAdjacent(s.cols, a, b)) return s;

  const pending = new Set(s.pendingClear);
  if (pending.has(a) || pending.has(b)) {
    return { ...s, statusMsg: "消去中のパネルは動かせません", selected: null };
  }

  const cellA = s.board[a];
  const cellB = s.board[b];
  if (cellA == null && cellB == null) return s;

  const board = [...s.board];
  board[a] = cellB;
  board[b] = cellA;

  const inChain = s.playMode === "clearing";
  let movesLeft = s.movesLeft;
  if (!inChain) {
    if (movesLeft <= 0) return s;
    movesLeft -= 1;
  }

  const matches = findLineMatches(board, s.cols, s.rows);
  let next: RefineLive = {
    ...s,
    board,
    movesLeft,
    selected: null,
  };

  if (matches.size > 0) {
    if (inChain) {
      next = beginOrExtendClear(
        { ...next, pendingClear: s.pendingClear, chainCount: s.chainCount },
        matches,
        { newChain: false, extendOnly: true },
      );
      // Keep existing pending + new; chain count unchanged until commit.
      const merged = new Set(s.pendingClear);
      for (const i of matches) merged.add(i);
      next = {
        ...next,
        pendingClear: [...merged],
        chainCount: s.chainCount,
        statusMsg: `連鎖ウィンドウ · 追加マッチ！（×${s.chainCount}）`,
      };
    } else {
      next = beginOrExtendClear(
        { ...next, pendingClear: [], chainCount: 0 },
        matches,
        { newChain: true, extendOnly: false },
      );
    }
  } else if (!inChain) {
    next = {
      ...next,
      statusMsg: null,
    };
    next = maybeFinishOnMoves(next);
  }

  return next;
}

/**
 * Raise: push a new bottom row from the bag (stack rises).
 * Costs 1 move. Top-out finishes the run.
 */
export function raiseStack(s: RefineLive): RefineLive {
  if (s.phase !== "play") return s;
  if (s.playMode === "clearing") {
    return { ...s, statusMsg: "連鎖中はせり上げできません" };
  }
  if (s.movesLeft <= 0) return maybeFinishOnMoves(s);
  if (s.bag.length === 0) {
    return { ...s, statusMsg: "袋が空です" };
  }

  // Top-out if any cell in row 0 is occupied.
  for (let c = 0; c < s.cols; c++) {
    if (s.board[indexOf(s.cols, 0, c)] != null) {
      return finishRefine({
        ...s,
        statusMsg: "トップアウト（盤面が埋まりました）",
      });
    }
  }

  const needed = s.cols;
  const taken = takeFromBag(s.bag, needed);
  const bag = taken.bag;
  const rowGems: Cell[] = [...taken.gems];
  while (rowGems.length < needed) rowGems.push(null);

  const board = emptyBoard(s.cols, s.rows);
  // Shift everything up one row.
  for (let r = 1; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      board[indexOf(s.cols, r - 1, c)] = s.board[indexOf(s.cols, r, c)] ?? null;
    }
  }
  // New bottom row.
  for (let c = 0; c < s.cols; c++) {
    board[indexOf(s.cols, s.rows - 1, c)] = rowGems[c] ?? null;
  }

  let next: RefineLive = {
    ...s,
    board,
    bag,
    movesLeft: s.movesLeft - 1,
    selected: null,
    statusMsg: "せり上げ",
  };

  const matches = findLineMatches(next.board, next.cols, next.rows);
  if (matches.size > 0) {
    next = beginOrExtendClear(
      { ...next, pendingClear: [], chainCount: 0 },
      matches,
      { newChain: true, extendOnly: false },
    );
  } else {
    next = maybeFinishOnMoves(next);
  }
  return next;
}

/**
 * Commit one clear step: erase pending → gravity → re-match.
 * Called by UI when the chain window timer fires.
 * If new matches appear, stays in clearing (chain++). Else returns to idle.
 */
export function commitClearStep(s: RefineLive): RefineLive {
  if (s.phase !== "play" || s.playMode !== "clearing") return s;
  if (s.pendingClear.length === 0) {
    return {
      ...s,
      playMode: "idle",
      chainCount: 0,
      chainWindowMsLeft: 0,
      lastChain: s.lastChain,
    };
  }

  const clearedStep = clearMatches(s.board, s.pendingClear);
  const board = applyGravity(clearedStep.board, s.cols, s.rows);
  const cleared = mergeCleared(s.cleared, clearedStep.cleared);
  const chainDone = s.chainCount;

  const matches = findLineMatches(board, s.cols, s.rows);
  if (matches.size > 0) {
    return {
      ...s,
      board,
      cleared,
      pendingClear: [...matches],
      playMode: "clearing",
      chainCount: chainDone + 1,
      chainWindowMsLeft: SORT_V0_RULES.chainWindowMs,
      lastChain: chainDone + 1,
      selected: null,
      statusMsg: `連鎖 ×${chainDone + 1}（スワップで伸ばせる）`,
    };
  }

  let next: RefineLive = {
    ...s,
    board,
    cleared,
    pendingClear: [],
    playMode: "idle",
    chainCount: 0,
    chainWindowMsLeft: 0,
    lastChain: chainDone,
    selected: null,
    statusMsg: chainDone > 1 ? `連鎖完了 ×${chainDone}` : "マッチ消去",
  };
  return maybeFinishOnMoves(next);
}

/** Tap a cell: select, or swap with selection if orthogonally adjacent (incl. vertical). */
export function tapCell(s: RefineLive, index: number): RefineLive {
  if (s.phase !== "play") return s;
  if (index < 0 || index >= s.board.length) return s;

  if (s.pendingClear.includes(index)) {
    return { ...s, statusMsg: "消去中のパネルです", selected: null };
  }

  if (s.selected == null) {
    if (s.board[index] == null) return s;
    return { ...s, selected: index, statusMsg: null };
  }

  if (s.selected === index) {
    return { ...s, selected: null };
  }

  if (canSwapAdjacent(s.cols, s.selected, index)) {
    return swapPanels(s, s.selected, index);
  }

  // Re-select
  if (s.board[index] == null) return { ...s, selected: null };
  return { ...s, selected: index, statusMsg: null };
}

export function finishRefine(s: RefineLive): RefineLive {
  if (s.phase !== "play" && s.phase !== "result") return s;
  // If finishing mid-clear, commit remaining clears passively for fairness.
  let board = s.board;
  let cleared = s.cleared;
  let lastChain = s.lastChain;
  if (s.playMode === "clearing" && s.pendingClear.length > 0) {
    const step = clearMatches(board, s.pendingClear);
    board = applyGravity(step.board, s.cols, s.rows);
    cleared = mergeCleared(cleared, step.cleared);
    const rest = resolveChains(board, s.cols, s.rows);
    board = rest.board;
    cleared = mergeCleared(cleared, rest.cleared);
    lastChain = Math.max(lastChain, s.chainCount + rest.chain);
  }
  return {
    ...s,
    phase: "result",
    board,
    cleared,
    pendingClear: [],
    playMode: "idle",
    chainCount: 0,
    chainWindowMsLeft: 0,
    lastChain,
    selected: null,
  };
}

export function scrapLossFromState(s: RefineLive): number {
  const onBoard = remainingValidOnBoard(s.board);
  const inBag = s.bag.filter((k) => k !== "junk").length;
  return onBoard + inBag;
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

/** @deprecated Columns control API — no-op shim for old callers. */
export type ControlAction =
  | "left"
  | "right"
  | "rotate"
  | "softDrop"
  | "hardDrop"
  | "raise";

export function applyControl(s: RefineLive, action: ControlAction): RefineLive {
  if (action === "raise") return raiseStack(s);
  return s;
}
