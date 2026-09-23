/**
 * Module 5 restore — playable thicken.
 * Slitherlink-ish board gen + scoring. Uses @estg/shared CircuitBoardState;
 * rules stay provisional (no full solver).
 */
import {
  buildInjectedOrFlawedPuzzle,
  createEmptyCircuitBoard,
  decodeEdgeState,
  encodeEdgeState,
  edgeCount,
  isPerfectCircuitClearance,
  resolveVerifyTrueClues,
  type CircuitBoardState,
  type CircuitOutcome,
  type EdgeMark,
  type InjectedBoardKind,
} from "@estg/shared";

/** Simple seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a short puzzleSeed string → uint32. */
export function hashSeed(puzzleSeed: string): number {
  let h = 2166136261;
  for (let i = 0; i < puzzleSeed.length; i++) {
    h ^= puzzleSeed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type ClueGrid = ReadonlyArray<ReadonlyArray<number | null>>;

/** Majority boards are flawed; Perfect Circuit injection is rare. */
export type BoardRarity = "perfect_rare" | "flawed_majority";

/**
 * How a flawed board was intentionally spoiled.
 * `none` only on perfect / verify-true boards.
 */
export type HazardKind =
  | "none"
  | "contradiction"
  | "overdigit"
  | "dense_noise";

/** Default mix among flawed boards (sums to 1). */
export const FLAWED_HAZARD_WEIGHTS: Readonly<
  Record<Exclude<HazardKind, "none">, number>
> = {
  contradiction: 0.45,
  overdigit: 0.3,
  dense_noise: 0.25,
};

export type RestorePuzzle = {
  cols: number;
  rows: number;
  puzzleId: string;
  /** Cell clues; null = no digit. */
  clues: ClueGrid;
  /**
   * True when this board is a seeded Perfect Circuit (verify-true / injection),
   * not a flawed random fill.
   */
  injectedTrue?: boolean;
  /** Rarity tag for UI / tests. */
  rarity: BoardRarity;
  /** Flaw hazard; `none` on perfect boards. */
  hazard: HazardKind;
};

export type GeneratePuzzleOptions = {
  /**
   * When set, roll Perfect Circuit injection at this rate among flawed boards.
   * Fixed verify-true puzzleId always returns the true board (no roll).
   * Omit to keep legacy behavior (flawed random only, unless verify-true id).
   */
  injectRate?: number;
  /** Optional Uniform[0,1) RNG (default: mulberry32 from seed). */
  rng?: () => number;
  /** Test hook: force true or flawed path. */
  forceKind?: InjectedBoardKind;
  /** Test hook: force a specific flawed hazard (ignored on true boards). */
  forceHazard?: Exclude<HazardKind, "none">;
};

/** Horizontal edge index: row of dots `y` (0..rows), col `x` (0..cols-1). */
export function hEdgeIndex(cols: number, rows: number, x: number, y: number): number {
  void rows;
  return y * cols + x;
}

/** Vertical edge index: col of dots `x` (0..cols), row `y` (0..rows-1). */
export function vEdgeIndex(cols: number, rows: number, x: number, y: number): number {
  return cols * (rows + 1) + y * (cols + 1) + x;
}

export function cellEdgeIndices(
  cols: number,
  rows: number,
  cx: number,
  cy: number,
): [number, number, number, number] {
  // top, right, bottom, left
  return [
    hEdgeIndex(cols, rows, cx, cy),
    vEdgeIndex(cols, rows, cx + 1, cy),
    hEdgeIndex(cols, rows, cx, cy + 1),
    vEdgeIndex(cols, rows, cx, cy),
  ];
}

export function countLineEdgesAroundCell(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
  cx: number,
  cy: number,
): number {
  let n = 0;
  for (const i of cellEdgeIndices(cols, rows, cx, cy)) {
    if (marks[i] === 1) n++;
  }
  return n;
}

function blankClues(cols: number, rows: number): (number | null)[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null as number | null),
  );
}

function pickHazard(
  rnd: () => number,
  force?: Exclude<HazardKind, "none">,
): Exclude<HazardKind, "none"> {
  if (force) return force;
  const r = rnd();
  const w = FLAWED_HAZARD_WEIGHTS;
  if (r < w.contradiction) return "contradiction";
  if (r < w.contradiction + w.overdigit) return "overdigit";
  return "dense_noise";
}

/**
 * Classic local paradox: four adjacent 3s in a 2×2 block cannot all be
 * satisfied by a simple loop (shared edges over-constrain the vertex).
 */
function applyContradictionHazard(
  clues: (number | null)[][],
  cols: number,
  rows: number,
  rnd: () => number,
): void {
  if (cols < 2 || rows < 2) {
    // Degenerate tiny board: 3 beside 0 forces a local conflict when possible.
    if (cols >= 1 && rows >= 1) {
      clues[0]![0] = 3;
      if (cols > 1) clues[0]![1] = 0;
      else if (rows > 1) clues[1]![0] = 0;
    }
    return;
  }
  const ox = Math.floor(rnd() * (cols - 1));
  const oy = Math.floor(rnd() * (rows - 1));
  clues[oy]![ox] = 3;
  clues[oy]![ox + 1] = 3;
  clues[oy + 1]![ox] = 3;
  clues[oy + 1]![ox + 1] = 3;
  // Sprinkle a few extra high digits so the rest still looks "repaired".
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (clues[y]![x] != null) continue;
      if (rnd() < 0.2) clues[y]![x] = 1 + Math.floor(rnd() * 3); // 1..3
    }
  }
}

/** Extra / dense high digits — overconstrained substrate, rarely fully solvable. */
function applyOverdigitHazard(
  clues: (number | null)[][],
  cols: number,
  rows: number,
  rnd: () => number,
): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const r = rnd();
      if (r < 0.72) {
        // Bias toward 2–3 (extra digits / heavy demand).
        clues[y]![x] = 2 + Math.floor(rnd() * 2);
      } else if (r < 0.88) {
        clues[y]![x] = Math.floor(rnd() * 2); // 0..1
      } else {
        clues[y]![x] = null;
      }
    }
  }
}

/** Noisy sparse fill — imperfect / hazardous without guaranteed paradox. */
function applyDenseNoiseHazard(
  clues: (number | null)[][],
  cols: number,
  rows: number,
  rnd: () => number,
): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const r = rnd();
      if (r < 0.35) clues[y]![x] = null;
      else clues[y]![x] = Math.floor(rnd() * 4); // 0..3
    }
  }
}

/**
 * Intentionally imperfect / hazardous clue fill (majority path).
 * Applies contradiction, overdigit, or dense noise — not a Perfect source.
 */
export function generateFlawedClues(
  puzzleSeed: string,
  cols: number,
  rows: number,
  rng?: () => number,
  forceHazard?: Exclude<HazardKind, "none">,
): { clues: (number | null)[][]; hazard: Exclude<HazardKind, "none"> } {
  const rnd = rng ?? mulberry32(hashSeed(`${puzzleSeed}:flawed`));
  const hazard = pickHazard(
    rng ?? mulberry32(hashSeed(`${puzzleSeed}:hazard`)),
    forceHazard,
  );
  const clues = blankClues(cols, rows);
  if (hazard === "contradiction") {
    applyContradictionHazard(clues, cols, rows, rnd);
  } else if (hazard === "overdigit") {
    applyOverdigitHazard(clues, cols, rows, rnd);
  } else {
    applyDenseNoiseHazard(clues, cols, rows, rnd);
  }
  return { clues, hazard };
}

/** Detect the 2×2 block of four 3s used by contradiction hazard (for tests/UI). */
export function hasContradictionBlock(clues: ClueGrid): boolean {
  const rows = clues.length;
  const cols = clues[0]?.length ?? 0;
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      if (
        clues[y]![x] === 3 &&
        clues[y]![x + 1] === 3 &&
        clues[y + 1]![x] === 3 &&
        clues[y + 1]![x + 1] === 3
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Clue density in [0,1] (digits / cells). */
export function clueDensity(clues: ClueGrid): number {
  const rows = clues.length;
  const cols = clues[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return 0;
  let n = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (clues[y]![x] != null) n++;
    }
  }
  return n / (rows * cols);
}

/**
 * Generate a small clue grid from puzzleSeed.
 * With `injectRate`, may inject a seeded true board (generate-from-solution);
 * otherwise flawed/hazardous as majority. Never relies on natural random digits for Perfect.
 */
export function generatePuzzle(
  puzzleSeed: string,
  cols = 6,
  rows = 6,
  opts?: GeneratePuzzleOptions,
): RestorePuzzle {
  const fixed = resolveVerifyTrueClues(puzzleSeed, cols, rows);
  if (fixed) {
    return {
      cols: fixed.cols,
      rows: fixed.rows,
      puzzleId: fixed.puzzleId,
      clues: fixed.clues.map((row) => [...row]),
      injectedTrue: true,
      rarity: "perfect_rare",
      hazard: "none",
    };
  }

  const useInject =
    opts?.injectRate != null || opts?.forceKind != null || opts?.rng != null;

  if (!useInject) {
    // Legacy: flawed only (deterministic from seed), with intentional hazard.
    const built = generateFlawedClues(
      puzzleSeed,
      cols,
      rows,
      undefined,
      opts?.forceHazard,
    );
    return {
      cols,
      rows,
      puzzleId: puzzleSeed,
      clues: built.clues,
      injectedTrue: false,
      rarity: "flawed_majority",
      hazard: built.hazard,
    };
  }

  // Separate streams: roll vs clue digits so flawed layouts stay seed-stable.
  const rollRng =
    opts?.rng ?? mulberry32(hashSeed(`${puzzleSeed}:perfect-roll`));
  let capturedHazard: HazardKind = "dense_noise";
  const built = buildInjectedOrFlawedPuzzle({
    seed: puzzleSeed,
    cols,
    rows,
    rate: opts?.injectRate ?? 0,
    rng: rollRng,
    forceKind: opts?.forceKind,
    // Flawed layouts stay seed-stable: do not consume the inject-roll RNG.
    generateFlawed: (seed, c, r, _flawedRng) => {
      void _flawedRng;
      const f = generateFlawedClues(seed, c, r, undefined, opts?.forceHazard);
      capturedHazard = f.hazard;
      return f.clues;
    },
  });

  if (built.injectedTrue) {
    return {
      cols: built.cols,
      rows: built.rows,
      puzzleId: built.puzzleId,
      clues: built.clues.map((row) => [...row]),
      injectedTrue: true,
      rarity: "perfect_rare",
      hazard: "none",
    };
  }

  return {
    cols: built.cols,
    rows: built.rows,
    puzzleId: built.puzzleId,
    clues: built.clues.map((row) => [...row]),
    injectedTrue: false,
    rarity: "flawed_majority",
    hazard: capturedHazard,
  };
}

export type DigitStats = {
  clueCount: number;
  satisfied: number;
  /** 0..1; 1 when no clues. */
  rate: number;
};

/**
 * Whether a digit cell is 「activated」(satisfied by current line edges).
 * Returns null when the cell has no clue.
 */
export function isCellDigitActivated(
  clues: ClueGrid,
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
  cx: number,
  cy: number,
): boolean | null {
  const c = clues[cy]?.[cx];
  if (c == null) return null;
  return countLineEdgesAroundCell(marks, cols, rows, cx, cy) === c;
}

export function digitSatisfaction(
  clues: ClueGrid,
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): DigitStats {
  let clueCount = 0;
  let satisfied = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = clues[y]![x]!;
      if (c == null) continue;
      clueCount++;
      if (countLineEdgesAroundCell(marks, cols, rows, x, y) === c) {
        satisfied++;
      }
    }
  }
  return {
    clueCount,
    satisfied,
    rate: clueCount === 0 ? 1 : satisfied / clueCount,
  };
}

/**
 * Provisional loop-closed check: line edges form exactly one cycle
 * (every used vertex degree 2; single component).
 */
export function isLoopClosed(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): boolean {
  const vw = cols + 1;
  const vh = rows + 1;
  const vCount = vw * vh;
  const adj: number[][] = Array.from({ length: vCount }, () => []);

  const vid = (x: number, y: number) => y * vw + x;

  // horizontal
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = hEdgeIndex(cols, rows, x, y);
      if (marks[i] !== 1) continue;
      const a = vid(x, y);
      const b = vid(x + 1, y);
      adj[a]!.push(b);
      adj[b]!.push(a);
    }
  }
  // vertical
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x <= cols; x++) {
      const i = vEdgeIndex(cols, rows, x, y);
      if (marks[i] !== 1) continue;
      const a = vid(x, y);
      const b = vid(x, y + 1);
      adj[a]!.push(b);
      adj[b]!.push(a);
    }
  }

  let start = -1;
  let edgeVerts = 0;
  for (let i = 0; i < vCount; i++) {
    const d = adj[i]!.length;
    if (d === 0) continue;
    if (d !== 2) return false;
    edgeVerts++;
    if (start < 0) start = i;
  }
  if (edgeVerts < 4) return false; // need at least a 2x2 loop

  // Walk cycle; must cover all edge vertices and return.
  const seen = new Set<number>();
  let prev = -1;
  let cur = start;
  for (;;) {
    seen.add(cur);
    const nbrs = adj[cur]!;
    const next = nbrs[0] === prev ? nbrs[1]! : nbrs[0]!;
    prev = cur;
    cur = next;
    if (cur === start) break;
    if (seen.has(cur)) return false;
  }
  return seen.size === edgeVerts;
}

/** Cycle EdgeMark: 0 → 1 → 2 → 0. */
export function cycleEdgeMark(m: EdgeMark): EdgeMark {
  return ((m + 1) % 3) as EdgeMark;
}

/**
 * Provisional outcome from play metrics (no timer).
 * - fully_awakened: closed loop + all digits ok
 * - bypass: meaningful partial (loop or ≥50% digits with some lines)
 * - offline: empty / abandoned / weak progress
 */
export function deriveStubOutcome(
  loopClosed: boolean,
  digitRate: number,
  lineCount: number,
): CircuitOutcome {
  if (lineCount === 0) return "offline";
  if (loopClosed && digitRate >= 1) return "fully_awakened";
  // Partial progress → Bypass (vision: imperfect boards still reward craft).
  if (loopClosed || digitRate >= 0.5 || lineCount >= 4) return "bypass";
  return "offline";
}

export type PlayClassification = {
  outcome: CircuitOutcome;
  /** Digit satisfaction 100% + single closed loop (+ outcome fully_awakened). */
  perfectClearance: boolean;
  digits: DigitStats;
  loopClosed: boolean;
  lineCount: number;
  /** Short JP/EN gloss for UI. */
  blurb: string;
};

/**
 * Classify current play into Fully Awakened / Bypass / Offline.
 * Perfect clearance additionally gates engraver lock.
 */
export function classifyPlayResult(
  clues: ClueGrid,
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
  outcomeOverride?: CircuitOutcome | null,
): PlayClassification {
  const digits = digitSatisfaction(clues, marks, cols, rows);
  const loopClosed = isLoopClosed(marks, cols, rows);
  const lineCount = lineEdgeCount(marks);
  const derived = deriveStubOutcome(loopClosed, digits.rate, lineCount);
  const outcome = outcomeOverride ?? derived;
  const perfectClearance = isPerfectCircuitClearance({
    outcome,
    digitRate: digits.rate,
    loopClosed,
  });
  let blurb: string;
  if (outcome === "fully_awakened") {
    blurb = perfectClearance
      ? "完全復元 · 刻印ロック対象"
      : "完全復元（判定）";
  } else if (outcome === "bypass") {
    blurb = "部分修復 · 迂回稼働（Bypass）";
  } else {
    blurb = lineCount === 0 ? "未着手 / 放棄 → Offline" : "修復不足 → Offline";
  }
  return {
    outcome,
    perfectClearance,
    digits,
    loopClosed,
    lineCount,
    blurb,
  };
}

export function lineEdgeCount(marks: readonly EdgeMark[]): number {
  let n = 0;
  for (const m of marks) if (m === 1) n++;
  return n;
}

export function boardFromMarks(
  cols: number,
  rows: number,
  marks: readonly EdgeMark[],
  puzzleId: string,
  outcome?: CircuitOutcome,
): CircuitBoardState {
  const state: CircuitBoardState = {
    v: 1,
    cols,
    rows,
    edgeState: encodeEdgeState([...marks]),
    puzzleId,
  };
  if (outcome != null) state.outcome = outcome;
  return state;
}

export function freshMarks(cols: number, rows: number): EdgeMark[] {
  const board = createEmptyCircuitBoard(cols, rows);
  return decodeEdgeState(board.edgeState, edgeCount(cols, rows));
}

export const STORAGE_PREFIX = "estg.restore.edges.v1:";

export function loadMarksFromStorage(
  puzzleId: string,
  expectedEdges: number,
): EdgeMark[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + puzzleId);
    if (raw == null || raw === "") return null;
    const marks = decodeEdgeState(raw, expectedEdges);
    if (marks.length !== expectedEdges) return null;
    return marks;
  } catch {
    return null;
  }
}

export function saveMarksToStorage(puzzleId: string, marks: readonly EdgeMark[]): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + puzzleId, encodeEdgeState([...marks]));
  } catch {
    /* ignore quota / private mode */
  }
}

export function outcomeLabel(o: CircuitOutcome): string {
  if (o === "fully_awakened") return "Fully Awakened";
  if (o === "bypass") return "Bypass";
  return "Offline";
}

export function rarityLabel(r: BoardRarity): string {
  return r === "perfect_rare" ? "Perfect rare（可解コア）" : "Flawed majority（不完全基板）";
}

export function hazardLabel(h: HazardKind): string {
  if (h === "contradiction") return "矛盾ブロック";
  if (h === "overdigit") return "過剰数字";
  if (h === "dense_noise") return "ノイズ充填";
  return "—";
}

/**
 * Monte-Carlo helper for selftests: sample generatePuzzle with a fixed rate
 * and report perfect vs flawed (+ hazard histogram).
 */
export function sampleGeneratorRatios(
  trials: number,
  opts: {
    injectRate: number;
    cols?: number;
    rows?: number;
    seedPrefix?: string;
  },
): {
  trials: number;
  perfect: number;
  flawed: number;
  perfectRate: number;
  hazards: Record<Exclude<HazardKind, "none">, number>;
} {
  const cols = opts.cols ?? 6;
  const rows = opts.rows ?? 6;
  const prefix = opts.seedPrefix ?? "ratio";
  let perfect = 0;
  let flawed = 0;
  const hazards: Record<Exclude<HazardKind, "none">, number> = {
    contradiction: 0,
    overdigit: 0,
    dense_noise: 0,
  };
  for (let i = 0; i < trials; i++) {
    // Deterministic per-index RNG so the roll is independent of seed string quirks.
    const rng = mulberry32(hashSeed(`${prefix}:${i}:roll`));
    const p = generatePuzzle(`${prefix}-${i}`, cols, rows, {
      injectRate: opts.injectRate,
      rng,
    });
    if (p.injectedTrue || p.rarity === "perfect_rare") {
      perfect++;
    } else {
      flawed++;
      if (p.hazard !== "none") hazards[p.hazard]++;
    }
  }
  return {
    trials,
    perfect,
    flawed,
    perfectRate: trials === 0 ? 0 : perfect / trials,
    hazards,
  };
}
