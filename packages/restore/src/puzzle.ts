/**
 * Module 5 restore — playable thicken.
 * Slitherlink-ish board gen + scoring. Uses @estg/shared CircuitBoardState;
 * rules stay provisional (no full solver).
 */
import {
  buildInjectedOrFlawedPuzzle,
  circuitCellEdgeIndices,
  circuitDigitSatisfaction,
  computeCircuitEffectValue,
  countLineEdgesAroundCell,
  createEmptyCircuitBoard,
  circuitHEdgeIndex,
  circuitVEdgeIndex,
  decodeEdgeState,
  encodeEdgeState,
  edgeCount,
  formatCircuitEffectJa,
  generateFlawedClues as sharedGenerateFlawedClues,
  hashSeed,
  isCircuitDigitSatisfied,
  isCircuitSingleLoopClosed,
  isPerfectCircuitClearance,
  mulberry32,
  previewBypassVsAwakenedEffect,
  resolveVerifyTrueClues,
  FLAWED_HAZARD_WEIGHTS as SHARED_FLAWED_HAZARD_WEIGHTS,
  type CircuitBoardState,
  type CircuitEffectBreakdown,
  type CircuitOutcome,
  type EdgeMark,
  type InjectedBoardKind,
} from "@estg/shared";

export { mulberry32, hashSeed };


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

export const FLAWED_HAZARD_WEIGHTS = SHARED_FLAWED_HAZARD_WEIGHTS;

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

export function hEdgeIndex(cols: number, rows: number, x: number, y: number): number {
  return circuitHEdgeIndex(cols, rows, x, y);
}

export function vEdgeIndex(cols: number, rows: number, x: number, y: number): number {
  return circuitVEdgeIndex(cols, rows, x, y);
}

export { countLineEdgesAroundCell };

export function generateFlawedClues(
  puzzleSeed: string,
  cols: number,
  rows: number,
  rng?: () => number,
  forceHazard?: Exclude<HazardKind, "none">,
): { clues: (number | null)[][]; hazard: Exclude<HazardKind, "none"> } {
  return sharedGenerateFlawedClues(puzzleSeed, cols, rows, rng, forceHazard);
}

/** Detect the 2×2 block of four 3s used by contradiction hazard (for tests/UI). */
export function hasContradictionBlock(clues: ClueGrid): boolean {
  return findContradictionBlockOrigin(clues) != null;
}

/** Top-left of the first 2×2 contradiction block of 3s, or null. */
export function findContradictionBlockOrigin(
  clues: ClueGrid,
): { x: number; y: number } | null {
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
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Edges that sit next to hazard / noise digits — stronger break/interfere
 * feedback when the player toggles them (Module 5 Restore UI).
 */
export function hazardNoiseEdgeIndices(
  clues: ClueGrid,
  cols: number,
  rows: number,
  hazard: HazardKind,
): Set<number> {
  const out = new Set<number>();
  if (hazard === "none") return out;

  const addCellEdges = (cx: number, cy: number) => {
    for (const i of circuitCellEdgeIndices(cols, rows, cx, cy)) out.add(i);
  };

  if (hazard === "contradiction") {
    const origin = findContradictionBlockOrigin(clues);
    if (origin) {
      for (const dy of [0, 1]) {
        for (const dx of [0, 1]) {
          addCellEdges(origin.x + dx, origin.y + dy);
        }
      }
      return out;
    }
  }

  // overdigit / dense_noise / fallback: edges around every digit cell
  // (dense fill = "noise" the player fights when wiring).
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = clues[y]?.[x];
      if (c == null) continue;
      if (hazard === "overdigit" && c < 2) continue;
      addCellEdges(x, y);
    }
  }
  return out;
}

export type OutcomeEffectPreview = {
  bypass: CircuitEffectBreakdown;
  awakened: CircuitEffectBreakdown;
  /** True when Fully Awakened would score higher (typically 0→4). */
  awakenedBetter: boolean;
};

/** Live Bypass vs Fully Awakened effect numbers for the preview panel. */
export function previewOutcomeEffects(
  clues: ClueGrid,
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): OutcomeEffectPreview {
  const { bypass, awakened } = previewBypassVsAwakenedEffect({
    clues,
    marks,
    cols,
    rows,
  });
  return {
    bypass,
    awakened,
    awakenedBetter: awakened.effect > bypass.effect,
  };
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
  return isCircuitDigitSatisfied(clues, marks, cols, rows, cx, cy);
}

export function digitSatisfaction(
  clues: ClueGrid,
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): DigitStats {
  const s = circuitDigitSatisfaction(clues, marks, cols, rows);
  return { clueCount: s.clueCount, satisfied: s.satisfied, rate: s.rate };
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
  return isCircuitSingleLoopClosed(marks, cols, rows);
}

export {
  computeCircuitEffectValue,
  formatCircuitEffectJa,
  previewBypassVsAwakenedEffect,
  type CircuitEffectBreakdown,
};

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
  /** Shared circuit effect value (0 when no loop; 0→4 on perfect). */
  effect: CircuitEffectBreakdown;
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
  const effect = computeCircuitEffectValue({
    clues,
    marks,
    cols,
    rows,
    perfect: perfectClearance,
    outcome,
  });
  return {
    outcome,
    perfectClearance,
    digits,
    loopClosed,
    lineCount,
    effect,
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
