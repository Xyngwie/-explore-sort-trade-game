/**
 * Sort v2 Zoo Keeper + active-chain refine loop.
 * Board starts filled; orthogonal (H+V) adjacent swap; H/V matches of 3+
 * clear → slow gravity + refill from bag above (visible settle) → cascades.
 * Active chain: during the slow fall/refill (before holes are fully filled),
 * the player may keep swapping already-landed panels; matches made then
 * interrupt settle, clear, and increment the chain count. Blink is a short
 * preview; skill window is the settle (~500ms/row). No rising stack / no top-out.
 * Supply: valid-first bag (food/material/energy only). When the valid bag
 * is empty, every subsequent top-spawn / refill is junk and packs holes.
 * Junk never matches; may fall. SORT_V2 economy otherwise unchanged.
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

/** Zoo Keeper + active chain + SORT_V2 economy (docs/SORT_V2_RULES.md). */
export const SORT_V0_RULES = {
  /**
   * @deprecated Unused. Junk is no longer mixed into the bag at a fixed
   * ratio. Valid pieces draw first; after the valid bag is empty, spawns
   * are junk-only (see spawnTopFromBag / refillFromAbove).
   */
  invalidRatio: 0.2,
  /** Match length (horizontal / vertical only — no diagonal). */
  minClearLine: 3,
  boardCols: 6,
  boardRows: 12,
  /**
   * Prefill rows from the bag on start (Zoo Keeper: fill the whole board).
   * Equals boardRows so play begins on a filled field — no rising pressure.
   */
  initialFillRows: 12,
  /**
   * Short blink before erase (ms). Not the main skill window —
   * active chain is during slow settle below.
   */
  clearBlinkMs: 280,
  /** Extra blink ms when a mid-blink swap adds matches. */
  clearBlinkExtendMs: 140,
  /**
   * @deprecated Prefer clearBlinkMs. Kept as alias for blink duration so
   * older callers / tests that read chainWindowMs still work.
   */
  chainWindowMs: 280,
  /** @deprecated Prefer clearBlinkExtendMs. */
  chainWindowExtendMs: 140,
  /**
   * ms between one settle tick (fall one row + spawn into empty tops).
   * ~500ms per row so the active-chain skill window is readable;
   * swaps stay free while settling (including already-landed panels).
   */
  settleStepMs: 500,
  /**
   * Min pointer travel (px) before a gesture is treated as a swipe.
   * Kept modest so short mobile flicks still register.
   */
  swipeMinPx: 18,
  /**
   * Axis-dominance ratio for swipe direction (player-favorable).
   * Accept when max(|dx|,|dy|) >= min(|dx|,|dy|) * swipeAxisDominanceRatio.
   * 1.15 ≈ require the strong axis to be ≥15% larger → accept gestures within
   * ~41° of a cardinal axis; reject only near-equal true diagonals (ratio < 1.15).
   * More forgiving than a tight axial cone; still NG for fully diagonal.
   */
  swipeAxisDominanceRatio: 1.15,
  /** Swaps scale with budget so small demos stay short. */
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
  // Junk is on-demand after valid supply ends — no fixed mix count.
  const invalidPieceCount = 0;
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

/**
 * Build supply bag: valid kinds only (~equal food/material/energy).
 * Junk is NOT mixed in — after this bag empties, spawn/refill emit junk.
 * `invalidPieceCount` is ignored (kept for call-site compatibility).
 */
export function buildSupplyBag(
  validPieceBudget: number,
  invalidPieceCount = 0,
  seed = 1,
): PieceKind[] {
  void invalidPieceCount;
  const bag: PieceKind[] = [];
  for (let i = 0; i < validPieceBudget; i++) {
    bag.push(VALID_KINDS[i % VALID_KINDS.length]!);
  }
  const rnd = mulberry32(seed ^ (validPieceBudget * 97));
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

/**
 * One row of gravity: each panel falls at most one cell if the cell below
 * is empty. Used for visible slow settle (not instant snap).
 */
export function stepGravityOnce(
  board: Cell[],
  cols: number,
  rows: number,
): { board: Cell[]; moved: boolean } {
  const next = [...board];
  let moved = false;
  for (let c = 0; c < cols; c++) {
    for (let r = rows - 2; r >= 0; r--) {
      const from = indexOf(cols, r, c);
      const to = indexOf(cols, r + 1, c);
      if (next[from] != null && next[to] == null) {
        next[to] = next[from]!;
        next[from] = null;
        moved = true;
      }
    }
  }
  return { board: next, moved };
}

/**
 * Spawn at most one panel into the top empty cell of each column (from bag).
 * Combined with stepGravityOnce, yields gradual fill from above.
 */
export function spawnTopFromBag(
  board: Cell[],
  bag: PieceKind[],
  cols: number,
  rows: number,
): { board: Cell[]; bag: PieceKind[]; spawned: boolean } {
  void rows;
  let rest = [...bag];
  const next = [...board];
  let spawned = false;
  for (let c = 0; c < cols; c++) {
    const top = indexOf(cols, 0, c);
    if (next[top] != null) continue;
    if (rest.length === 0) {
      // Valid supply exhausted → junk-only refill.
      next[top] = "junk";
      spawned = true;
      continue;
    }
    const taken = takeFromBag(rest, 1);
    next[top] = taken.gems[0]!;
    rest = taken.bag;
    spawned = true;
  }
  return { board: next, bag: rest, spawned };
}

/**
 * True if any panel can fall one cell, or an empty top needs a spawn.
 * Empty tops always settle (when bag is empty, spawnTopFromBag emits junk).
 */
export function boardNeedsSettle(
  board: Cell[],
  bag: PieceKind[],
  cols: number,
  rows: number,
): boolean {
  void bag;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows - 1; r++) {
      const i = indexOf(cols, r, c);
      const below = indexOf(cols, r + 1, c);
      if (board[i] != null && board[below] == null) return true;
    }
    if (board[indexOf(cols, 0, c)] == null) return true;
  }
  return false;
}

/** Free-swap skill window: blink clearing or slow settle refill. */
export function isActiveChain(s: RefineLive): boolean {
  return s.playMode === "clearing" || s.playMode === "settling";
}

/**
 * Zoo Keeper refill: after gravity, empty cells (top of each column) draw
 * from the supply bag. No rising stack / no top-out.
 */
/**
 * Fill empty cells from the bag (column-major top→bottom).
 * When `junkWhenEmpty` is true and the bag is drained, remaining holes
 * become junk (valid-first → all-junk fill). Default false so passive
 * cascade tests that omit a bag keep empty cells empty.
 */
export function refillFromAbove(
  board: Cell[],
  bag: PieceKind[],
  cols: number,
  rows: number,
  junkWhenEmpty = false,
): { board: Cell[]; bag: PieceKind[] } {
  let rest = [...bag];
  const next = [...board];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const i = indexOf(cols, r, c);
      if (next[i] != null) continue;
      if (rest.length === 0) {
        if (!junkWhenEmpty) break;
        next[i] = "junk";
        continue;
      }
      const taken = takeFromBag(rest, 1);
      next[i] = taken.gems[0]!;
      rest = taken.bag;
    }
  }
  return { board: next, bag: rest };
}

const LINE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // horizontal
  [1, 0], // vertical
];

/**
 * Zoo Keeper / match-3 line matching: 3+ same *valid* kind in a straight
 * horizontal or vertical line. No diagonals. Junk never matches.
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
 * Resolve passive clear → gravity → (optional) refill cascades.
 * Live play uses the active-chain window + commitClearStep instead.
 * Pass a bag to refill empty cells from above after each gravity step
 * (Zoo Keeper style). Omit bag for gravity-only cascade tests.
 */
export function resolveChains(
  board: Cell[],
  cols: number,
  rows: number,
  bag: PieceKind[] = [],
  junkWhenEmpty = false,
): { board: Cell[]; cleared: ClearedCounts; chain: number; bag: PieceKind[] } {
  let b = board;
  let rest = [...bag];
  const total: ClearedCounts = { food: 0, material: 0, energy: 0 };
  let chain = 0;
  const maxChains = 64;
  while (chain < maxChains) {
    const matches = findLineMatches(b, cols, rows);
    if (matches.size === 0) break;
    chain++;
    const cleared = clearMatches(b, matches);
    total.food += cleared.cleared.food;
    total.material += cleared.cleared.material;
    total.energy += cleared.cleared.energy;
    b = applyGravity(cleared.board, cols, rows);
    if (rest.length > 0 || junkWhenEmpty) {
      const filled = refillFromAbove(b, rest, cols, rows, junkWhenEmpty);
      b = filled.board;
      rest = filled.bag;
    }
  }
  return { board: b, cleared: total, chain, bag: rest };
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

/** Valid pieces left in the supply bag (junk never sits in the bag). */
export function remainingValidInBag(bag: PieceKind[]): number {
  return bag.filter((k) => k !== "junk").length;
}

/**
 * True when valid supply is gone and the board has no clearable panels —
 * player cannot make progress; Finish / auto-end is appropriate.
 */
export function isJunkOnlyStalemate(s: RefineLive): boolean {
  if (s.phase !== "play") return false;
  if (s.playMode === "clearing" || s.playMode === "settling") return false;
  if (remainingValidInBag(s.bag) > 0) return false;
  if (remainingValidOnBoard(s.board) > 0) return false;
  return true;
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

export type SwipeAxis = "horizontal" | "vertical";

/**
 * Classify a swipe into a cardinal axis, or null if it's a tap / true diagonal.
 * See SORT_V0_RULES.swipeAxisDominanceRatio for the player-favorable threshold.
 */
export function classifySwipeAxis(dx: number, dy: number): SwipeAxis | null {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const minPx = SORT_V0_RULES.swipeMinPx;
  if (absX < minPx && absY < minPx) return null;
  const max = Math.max(absX, absY);
  const min = Math.min(absX, absY);
  // Reject near-equal axes (true / almost-true diagonal).
  if (max < min * SORT_V0_RULES.swipeAxisDominanceRatio) return null;
  return absX >= absY ? "horizontal" : "vertical";
}

/**
 * Resolve the orthogonal neighbor index for a swipe starting at `fromIdx`.
 * Returns null for taps, rejected diagonals, or edge-of-board.
 */
export function resolveSwipeNeighbor(
  cols: number,
  rows: number,
  fromIdx: number,
  dx: number,
  dy: number,
): number | null {
  if (fromIdx < 0 || fromIdx >= cols * rows) return null;
  const axis = classifySwipeAxis(dx, dy);
  if (axis == null) return null;
  const r = Math.floor(fromIdx / cols);
  const c = fromIdx % cols;
  if (axis === "horizontal") {
    if (dx > 0 && c + 1 < cols) return fromIdx + 1;
    if (dx < 0 && c > 0) return fromIdx - 1;
    return null;
  }
  if (dy > 0 && r + 1 < rows) return fromIdx + cols;
  if (dy < 0 && r > 0) return fromIdx - cols;
  return null;
}

/**
 * Cell indices whose occupant changed during a settle tick (fell in or spawned).
 * Used by the UI to play a one-row fall-in CSS animation without changing logic timing.
 */
export function settleMotionIndices(before: Cell[], after: Cell[]): number[] {
  const out: number[] = [];
  const n = Math.min(before.length, after.length);
  for (let i = 0; i < n; i++) {
    if (after[i] == null) continue;
    if (before[i] === after[i]) continue;
    out.push(i);
  }
  return out;
}

/** True if placing `kind` at (r,c) would complete a H or V run of 3+. */
function wouldCreateMatch(
  board: Cell[],
  cols: number,
  rows: number,
  r: number,
  c: number,
  kind: PieceKind,
): boolean {
  if (kind === "junk") return false;
  let horiz = 1;
  for (let cc = c - 1; cc >= 0; cc--) {
    if (board[indexOf(cols, r, cc)] !== kind) break;
    horiz++;
  }
  for (let cc = c + 1; cc < cols; cc++) {
    if (board[indexOf(cols, r, cc)] !== kind) break;
    horiz++;
  }
  if (horiz >= SORT_V0_RULES.minClearLine) return true;
  let vert = 1;
  for (let rr = r - 1; rr >= 0; rr--) {
    if (board[indexOf(cols, rr, c)] !== kind) break;
    vert++;
  }
  for (let rr = r + 1; rr < rows; rr++) {
    if (board[indexOf(cols, rr, c)] !== kind) break;
    vert++;
  }
  return vert >= SORT_V0_RULES.minClearLine;
}

/**
 * Prefill the board from the bag (Zoo Keeper: start filled).
 * Places pieces while avoiding immediate 3+ matches when possible.
 * Bounded settle clears any leftover opening matches without scoring.
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
      let placeAt = -1;
      for (let i = 0; i < rest.length; i++) {
        if (!wouldCreateMatch(board, cols, rows, r, c, rest[i]!)) {
          placeAt = i;
          break;
        }
      }
      if (placeAt < 0) placeAt = 0;
      board[indexOf(cols, r, c)] = rest[placeAt]!;
      rest.splice(placeAt, 1);
    }
  }

  // Bounded settle: return matched pieces to bag, gravity, optional refill.
  // Initial fill stays valid-only (no junkWhenEmpty). Junk enters later via
  // spawnTopFromBag once the valid bag is empty during play settle.
  const settleOnce = (refill: boolean) => {
    const matches = findLineMatches(board, cols, rows);
    if (matches.size === 0) return false;
    for (const i of matches) {
      const kind = board[i];
      if (kind != null) rest.push(kind);
    }
    const cleared = clearMatches(board, matches);
    board = applyGravity(cleared.board, cols, rows);
    if (refill) {
      const filled = refillFromAbove(board, rest, cols, rows);
      board = filled.board;
      rest = filled.bag;
    }
    return true;
  };

  for (let guard = 0; guard < 48 && settleOnce(false); guard++) {
    /* gravity-only strip */
  }
  {
    const filled = refillFromAbove(board, rest, cols, rows);
    board = filled.board;
    rest = filled.bag;
  }
  for (let guard = 0; guard < 24 && settleOnce(true); guard++) {
    /* refill settle */
  }
  for (let guard = 0; guard < 16 && settleOnce(false); guard++) {
    /* final no-refill strip */
  }

  return { board, bag: rest };
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
  const needsJunkFill = boardNeedsSettle(
    filled.board,
    filled.bag,
    s.cols,
    s.rows,
  );
  // Valid bag already empty and holes remain → slow junk fill (Zoo Keeper).
  const playMode = needsJunkFill ? "settling" : "idle";
  return {
    ...s,
    phase: "play",
    bag: filled.bag,
    board: filled.board,
    movesLeft: moveBudgetFor(s.validPieceBudget),
    cleared: { food: 0, material: 0, energy: 0 },
    pendingClear: [],
    playMode,
    chainCount: 0,
    lastChain: 0,
    chainWindowMsLeft: 0,
    selected: null,
    statusMsg: needsJunkFill
      ? "有効補充が尽きた · ジャンクが穴を埋める"
      : null,
  };
}

function maybeFinishOnMoves(s: RefineLive): RefineLive {
  if (s.phase !== "play") return s;
  if (s.playMode === "clearing" || s.playMode === "settling") return s;
  if (s.movesLeft <= 0) {
    return finishRefine({ ...s, statusMsg: "手数切れ" });
  }
  if (isJunkOnlyStalemate(s)) {
    return finishRefine({
      ...s,
      statusMsg: "有効ピース尽き · ジャンクのみ",
    });
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
        SORT_V0_RULES.clearBlinkExtendMs,
      ) + SORT_V0_RULES.clearBlinkExtendMs
    : SORT_V0_RULES.clearBlinkMs;
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
 * - Idle: costs 1 move; opens blink if matches form.
 *   **No-match idle swap immediately finishRefine** (forbids endless leftover shuffling).
 * - Clearing (blink): free; new matches merge into pending clear
 *   and extend the blink. Non-matching mid-blink swaps do NOT end play.
 * - Settling (slow fall/refill — main active chain): free; already-landed
 *   panels stay swappable. A player-made match interrupts settle, enters
 *   blink, and increments chainCount (same as a post-settle cascade wave).
 *   Non-matching mid-settle swaps do NOT end play (setup stays free).
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

  const inBlink = s.playMode === "clearing";
  const inSettle = s.playMode === "settling";
  const freeSwap = inBlink || inSettle;
  let movesLeft = s.movesLeft;
  if (!freeSwap) {
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

  if (inSettle) {
    // Already-landed panels stay live: a match interrupts settle → next chain wave.
    if (matches.size > 0) {
      return beginOrExtendClear(
        { ...next, pendingClear: [], chainCount: s.chainCount },
        matches,
        { newChain: false, extendOnly: false },
      );
    }
    return {
      ...next,
      statusMsg: `落下補充中 · スワップで次を仕込む（×${Math.max(1, s.chainCount)}）`,
    };
  }

  if (matches.size > 0) {
    if (inBlink) {
      next = beginOrExtendClear(
        { ...next, pendingClear: s.pendingClear, chainCount: s.chainCount },
        matches,
        { newChain: false, extendOnly: true },
      );
      const merged = new Set(s.pendingClear);
      for (const i of matches) merged.add(i);
      next = {
        ...next,
        pendingClear: [...merged],
        chainCount: s.chainCount,
        statusMsg: `点滅中 · 追加マッチ！（×${s.chainCount}）`,
      };
    } else {
      next = beginOrExtendClear(
        { ...next, pendingClear: [], chainCount: 0 },
        matches,
        { newChain: true, extendOnly: false },
      );
    }
  } else if (!freeSwap) {
    // Idle + no match → end session (no endless leftover redistribution).
    next = finishRefine({
      ...next,
      statusMsg: "マッチなし · 精製終了",
    });
  }

  return next;
}

/**
 * @deprecated Zoo Keeper mode has no rising stack / top-out.
 * Kept as a no-op shim so old callers do not crash.
 */
export function raiseStack(s: RefineLive): RefineLive {
  if (s.phase !== "play") return s;
  return {
    ...s,
    statusMsg: "せり上げなし（上から補充）",
  };
}

/**
 * Commit blink: erase pending panels and enter slow settle (gravity + refill).
 * Does NOT snap-fill — UI ticks tickSettleStep for visible gradual fill.
 * Active-chain free swaps continue during settling.
 */
export function commitClearStep(s: RefineLive): RefineLive {
  if (s.phase !== "play" || s.playMode !== "clearing") return s;
  if (s.pendingClear.length === 0) {
    // Nothing to erase — if holes remain, settle; else idle.
    if (boardNeedsSettle(s.board, s.bag, s.cols, s.rows)) {
      return {
        ...s,
        playMode: "settling",
        chainWindowMsLeft: 0,
        selected: null,
        statusMsg: `落下補充中（スワップ可 · ×${Math.max(1, s.chainCount)}）`,
      };
    }
    return {
      ...s,
      playMode: "idle",
      chainCount: 0,
      chainWindowMsLeft: 0,
      lastChain: s.lastChain,
    };
  }

  const clearedStep = clearMatches(s.board, s.pendingClear);
  const cleared = mergeCleared(s.cleared, clearedStep.cleared);
  const chainDone = s.chainCount;

  return {
    ...s,
    board: clearedStep.board,
    bag: s.bag,
    cleared,
    pendingClear: [],
    playMode: "settling",
    chainCount: chainDone,
    chainWindowMsLeft: 0,
    lastChain: chainDone,
    selected: null,
    statusMsg: `落下補充中（スワップで次を仕込む · ×${chainDone}）`,
  };
}

/**
 * One visible settle tick: fall panels one row, then spawn into empty tops.
 * When fully settled, detect matches → blink (chain++) or return to idle.
 * Called by UI on settleStepMs while playMode === "settling".
 */
export function tickSettleStep(s: RefineLive): RefineLive {
  if (s.phase !== "play" || s.playMode !== "settling") return s;

  const fell = stepGravityOnce(s.board, s.cols, s.rows);
  const spawned = spawnTopFromBag(fell.board, s.bag, s.cols, s.rows);
  const board = spawned.board;
  const bag = spawned.bag;

  if (boardNeedsSettle(board, bag, s.cols, s.rows)) {
    const keepSel =
      s.selected != null && board[s.selected] != null ? s.selected : null;
    return {
      ...s,
      board,
      bag,
      playMode: "settling",
      selected: keepSel,
      statusMsg: `落下補充中（スワップで次を仕込む · ×${Math.max(1, s.chainCount)}）`,
    };
  }

  // Fully settled — resolve matches or end chain.
  const matches = findLineMatches(board, s.cols, s.rows);
  const chainDone = s.chainCount;
  if (matches.size > 0) {
    return {
      ...s,
      board,
      bag,
      pendingClear: [...matches],
      playMode: "clearing",
      chainCount: chainDone + 1,
      chainWindowMsLeft: SORT_V0_RULES.clearBlinkMs,
      lastChain: chainDone + 1,
      selected: null,
      statusMsg: `連鎖 ×${chainDone + 1}（落下中もスワップ可）`,
    };
  }

  let next: RefineLive = {
    ...s,
    board,
    bag,
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
  // Mid-clear / mid-settle: resolve remaining clears + snap settle for fairness.
  let board = s.board;
  let bag = s.bag;
  let cleared = s.cleared;
  let lastChain = s.lastChain;
  if (s.playMode === "clearing" && s.pendingClear.length > 0) {
    const step = clearMatches(board, s.pendingClear);
    board = applyGravity(step.board, s.cols, s.rows);
    const refilled = refillFromAbove(board, bag, s.cols, s.rows, true);
    board = refilled.board;
    bag = refilled.bag;
    cleared = mergeCleared(cleared, step.cleared);
    const rest = resolveChains(board, s.cols, s.rows, bag, true);
    board = rest.board;
    bag = rest.bag;
    cleared = mergeCleared(cleared, rest.cleared);
    lastChain = Math.max(lastChain, s.chainCount + rest.chain);
  } else if (s.playMode === "settling") {
    board = applyGravity(board, s.cols, s.rows);
    const refilled = refillFromAbove(board, bag, s.cols, s.rows, true);
    board = refilled.board;
    bag = refilled.bag;
    const rest = resolveChains(board, s.cols, s.rows, bag, true);
    board = rest.board;
    bag = rest.bag;
    cleared = mergeCleared(cleared, rest.cleared);
    lastChain = Math.max(lastChain, s.chainCount + rest.chain);
  }
  return {
    ...s,
    phase: "result",
    board,
    bag,
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
  return remainingValidOnBoard(s.board) + remainingValidInBag(s.bag);
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

/** Long local test session: 100 containers (valid budget = 100 * PIECES_PER_CONTAINER). */
export const TEST_PLAY_CONTAINERS = 100;

export function testPlayQueryExample(
  containers = TEST_PLAY_CONTAINERS,
): string {
  const cans = Math.max(1, Math.floor(containers));
  return `?salvagedContainers=${cans}&totalStockPieces=${cans * PIECES_PER_CONTAINER}&isExtracted=1`;
}

/**
 * Build a briefing state for a long test run (default 100 containers).
 * Explore handoffs are unchanged — this is only for the demo UI button.
 */
export function createTestPlayRefine(
  containers = TEST_PLAY_CONTAINERS,
): RefineLive {
  const cans = Math.max(1, Math.floor(containers));
  const stock = stockFromContainers(cans);
  const inbound: ExploreToSortPayload = {
    salvagedContainers: cans,
    totalStockPieces: stock,
    isExtracted: true,
  };
  const { validPieceBudget, invalidPieceCount } = computeBudgets(inbound);
  const cols = SORT_V0_RULES.boardCols;
  const rows = SORT_V0_RULES.boardRows;
  return {
    phase: "briefing",
    inbound,
    note: `テストプレイ · 缶 ${cans} · 予算 ${stock}`,
    blockReason: null,
    validPieceBudget,
    invalidPieceCount,
    bag: [],
    board: emptyBoard(cols, rows),
    cols,
    rows,
    movesLeft: moveBudgetFor(validPieceBudget),
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

/** @deprecated Legacy control API — no-op shim (raise removed in Zoo Keeper). */
export type ControlAction =
  | "left"
  | "right"
  | "rotate"
  | "softDrop"
  | "hardDrop"
  | "raise";

export function applyControl(s: RefineLive, _action: ControlAction): RefineLive {
  return s;
}
