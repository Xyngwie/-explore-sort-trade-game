/**
 * Guaranteed solvable Perfect Circuit playtest seed (2×2 Slitherlink).
 * Solution = outer perimeter loop; all cell clues are 2.
 * Used by trade hangar grant buttons + restore fixed-clue lookup.
 */
import {
  encodeEdgeState,
  edgeCount,
  sanitizeEditorName,
  type CircuitBoardState,
  type EdgeMark,
} from "./circuit-board";

/** puzzleId stamped on CircuitBoardState / restore generatePuzzle lookup. */
export const VERIFY_TRUE_PUZZLE_ID = "verify-true-2";

/** Hub circuitId for unsolved solvable grant 「検証用真盤を受領」. */
export const VERIFY_TRUE_CIRCUIT_ID = "verify_true";

/** Hub circuitId for already-locked sample 「検証用・既に完璧」. */
export const VERIFY_PERFECT_CIRCUIT_ID = "verify_perfect";

export const VERIFY_TRUE_COLS = 2;
export const VERIFY_TRUE_ROWS = 2;

/** Default 刻印 on the pre-locked sample when hangar signature unset. */
export const VERIFY_PERFECT_DEFAULT_EDITOR = "検証職人";

/**
 * Cell clues for the verify-true board (all 2s).
 * Spoilers: see VERIFY_TRUE_SOLUTION_HINT / docs.
 */
export const VERIFY_TRUE_CLUES: ReadonlyArray<ReadonlyArray<number | null>> = [
  [2, 2],
  [2, 2],
];

/** Light spoiler for playtesters (outer loop). */
export const VERIFY_TRUE_SOLUTION_HINT =
  "外周を一周（内部の十字辺は線にしない）。各マスの周囲辺数は 2。";

export function isVerifyTruePuzzleId(
  puzzleId: string | null | undefined,
): boolean {
  if (puzzleId == null) return false;
  return puzzleId.trim() === VERIFY_TRUE_PUZZLE_ID;
}

function hEdgeIndex(cols: number, x: number, y: number): number {
  return y * cols + x;
}

function vEdgeIndex(cols: number, rows: number, x: number, y: number): number {
  return cols * (rows + 1) + y * (cols + 1) + x;
}

/**
 * Solution marks: single outer loop on the 2×2 grid (8 line edges).
 * Guarantees digitRate=1 + loopClosed → fully_awakened + perfect lock.
 */
export function buildVerifyTrueSolutionMarks(): EdgeMark[] {
  const cols = VERIFY_TRUE_COLS;
  const rows = VERIFY_TRUE_ROWS;
  const marks: EdgeMark[] = Array.from(
    { length: edgeCount(cols, rows) },
    () => 0 as EdgeMark,
  );
  marks[hEdgeIndex(cols, 0, 0)] = 1;
  marks[hEdgeIndex(cols, 1, 0)] = 1;
  marks[hEdgeIndex(cols, 0, 2)] = 1;
  marks[hEdgeIndex(cols, 1, 2)] = 1;
  marks[vEdgeIndex(cols, rows, 0, 0)] = 1;
  marks[vEdgeIndex(cols, rows, 0, 1)] = 1;
  marks[vEdgeIndex(cols, rows, 2, 0)] = 1;
  marks[vEdgeIndex(cols, rows, 2, 1)] = 1;
  return marks;
}

/** Empty (unsolved) board for solving → lock path. */
export function buildVerifyTrueUnsolvedBoard(): CircuitBoardState {
  const n = edgeCount(VERIFY_TRUE_COLS, VERIFY_TRUE_ROWS);
  const marks = Array.from({ length: n }, () => 0 as EdgeMark);
  return {
    v: 1,
    cols: VERIFY_TRUE_COLS,
    rows: VERIFY_TRUE_ROWS,
    edgeState: encodeEdgeState(marks),
    puzzleId: VERIFY_TRUE_PUZZLE_ID,
    outcome: "offline",
  };
}

/**
 * Already solved + Perfect-locked board for lock/engraving UI smoke test.
 */
export function buildVerifyPerfectLockedBoard(
  editorName?: string | null,
): CircuitBoardState {
  const editor =
    sanitizeEditorName(editorName) ?? VERIFY_PERFECT_DEFAULT_EDITOR;
  return {
    v: 1,
    cols: VERIFY_TRUE_COLS,
    rows: VERIFY_TRUE_ROWS,
    edgeState: encodeEdgeState(buildVerifyTrueSolutionMarks()),
    puzzleId: VERIFY_TRUE_PUZZLE_ID,
    outcome: "fully_awakened",
    perfect: true,
    locked: true,
    lastEditorName: editor,
  };
}

/** Fixed clues when puzzleId matches verify-true. */
export function resolveVerifyTrueClues(
  puzzleId: string | null | undefined,
  cols?: number,
  rows?: number,
): {
  cols: number;
  rows: number;
  puzzleId: string;
  clues: ReadonlyArray<ReadonlyArray<number | null>>;
} | null {
  if (!isVerifyTruePuzzleId(puzzleId)) return null;
  void cols;
  void rows;
  return {
    cols: VERIFY_TRUE_COLS,
    rows: VERIFY_TRUE_ROWS,
    puzzleId: VERIFY_TRUE_PUZZLE_ID,
    clues: VERIFY_TRUE_CLUES.map((row) => [...row]),
  };
}


// ---------------------------------------------------------------------------
// Perfect Circuit injection rates (seeded true boards among flawed majority)
// See docs/PERFECT_CIRCUIT_PROBABILITY.md — do NOT rely on natural random digits.
// ---------------------------------------------------------------------------

/**
 * Production / formal default: ~1% guaranteed true-board injection.
 * (Docs also cite ~0.1% as an alternate formal target.)
 */
export const PERFECT_CIRCUIT_PROD_RATE = 0.01;

/**
 * Alternate formal target (~0.1%). Not the default — select via
 * `PERFECT_CIRCUIT_RATE` / `VITE_PERFECT_CIRCUIT_RATE` env, or pass explicitly.
 */
export const PERFECT_CIRCUIT_PROD_RATE_ALT = 0.001;

/**
 * Test / stub / localhost / `?perfectRate=` / Vite `import.meta.env.DEV`:
 * temporary 33% true-board injection for playtest visibility.
 */
export const PERFECT_CIRCUIT_DEV_RATE = 0.33;

/** Query key: `?perfectRate=0.33` overrides resolved rate. */
export const PERFECT_CIRCUIT_RATE_QUERY_KEY = "perfectRate";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/** Parse a rate string/number; returns null when missing or invalid. */
export function parsePerfectCircuitRate(
  raw: string | number | null | undefined,
): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  return clamp01(n);
}

/**
 * Roll whether this board should be a seeded Perfect (true) board.
 * `rng` must return Uniform[0,1) (e.g. mulberry32).
 */
export function rollPerfectCircuit(
  rng: () => number,
  opts: { rate: number },
): boolean {
  const rate = clamp01(opts.rate);
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return rng() < rate;
}

export type PerfectCircuitRateContext = {
  /** `window.location.search` or raw query / URLSearchParams */
  search?: string | URLSearchParams | null;
  /** `window.location.hostname` — localhost → DEV rate */
  hostname?: string | null;
  /** Pass `import.meta.env.DEV` from Vite entrypoints */
  isDev?: boolean;
  /**
   * Explicit env override (`PERFECT_CIRCUIT_RATE` or `VITE_PERFECT_CIRCUIT_RATE`).
   * Use `0.001` for the docs alternate formal target.
   */
  envRate?: string | number | null;
};

/**
 * Player-facing injection details are a DEV/local/debug aid only. Keep this
 * gate aligned with the DEV/localhost branch used by the rate resolver, while
 * allowing an explicit `?perfectRate=` query to opt into playtest HUD text.
 */
export function isPerfectCircuitDebugContext(
  ctx: PerfectCircuitRateContext = {},
): boolean {
  let params: URLSearchParams | null = null;
  if (typeof ctx.search === "string") {
    const q = ctx.search.startsWith("?") ? ctx.search.slice(1) : ctx.search;
    try {
      params = new URLSearchParams(q);
    } catch {
      params = null;
    }
  } else if (ctx.search instanceof URLSearchParams) {
    params = ctx.search;
  }

  const hasDebugRate =
    parsePerfectCircuitRate(
      params?.get(PERFECT_CIRCUIT_RATE_QUERY_KEY) ?? undefined,
    ) != null;
  const host = (ctx.hostname ?? "").trim().toLowerCase();
  return (
    ctx.isDev === true ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    hasDebugRate
  );
}

/**
 * Resolve injection rate:
 * 1. `?perfectRate=` query (wins)
 * 2. `envRate` (prod alternate / ops knob)
 * 3. Vite DEV or localhost → {@link PERFECT_CIRCUIT_DEV_RATE} (33%)
 * 4. else {@link PERFECT_CIRCUIT_PROD_RATE} (1%)
 */
export function resolvePerfectCircuitInjectRate(
  ctx: PerfectCircuitRateContext = {},
): number {
  let params: URLSearchParams | null = null;
  if (typeof ctx.search === "string") {
    const q = ctx.search.startsWith("?") ? ctx.search.slice(1) : ctx.search;
    try {
      params = new URLSearchParams(q);
    } catch {
      params = null;
    }
  } else if (ctx.search instanceof URLSearchParams) {
    params = ctx.search;
  }
  const fromQuery = parsePerfectCircuitRate(
    params?.get(PERFECT_CIRCUIT_RATE_QUERY_KEY) ?? undefined,
  );
  if (fromQuery != null) return fromQuery;

  const fromEnv = parsePerfectCircuitRate(ctx.envRate);
  if (fromEnv != null) return fromEnv;

  const host = (ctx.hostname ?? "").trim().toLowerCase();
  if (
    ctx.isDev === true ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return PERFECT_CIRCUIT_DEV_RATE;
  }

  return PERFECT_CIRCUIT_PROD_RATE;
}

export type InjectedBoardKind = "true" | "flawed";

export type TruePuzzleFromSolution = {
  kind: "true";
  cols: number;
  rows: number;
  puzzleId: string;
  clues: ReadonlyArray<ReadonlyArray<number | null>>;
};

/**
 * Guaranteed uniquely solvable puzzle from the known Perfect Circuit solution
 * (generate-from-solution / verify-true seed). Never samples random digits.
 */
export function buildTruePuzzleFromSolution(): TruePuzzleFromSolution {
  const fixed = resolveVerifyTrueClues(VERIFY_TRUE_PUZZLE_ID)!;
  return {
    kind: "true",
    cols: fixed.cols,
    rows: fixed.rows,
    puzzleId: fixed.puzzleId,
    clues: fixed.clues.map((row) => [...row]),
  };
}

export type FlawedClueFactory = (
  seed: string,
  cols: number,
  rows: number,
  rng: () => number,
) => ReadonlyArray<ReadonlyArray<number | null>>;

/**
 * Board factory: roll Perfect injection → seeded true board OR flawed clues.
 * Flawed path is supplied by the caller (restore random digits today).
 */
export function buildInjectedOrFlawedPuzzle(args: {
  seed: string;
  cols: number;
  rows: number;
  rate: number;
  rng: () => number;
  generateFlawed: FlawedClueFactory;
  /** Test hook: skip the roll. */
  forceKind?: InjectedBoardKind;
}): {
  kind: InjectedBoardKind;
  cols: number;
  rows: number;
  puzzleId: string;
  clues: ReadonlyArray<ReadonlyArray<number | null>>;
  injectedTrue: boolean;
} {
  // Explicit verify-true seed always returns the solution board (no roll).
  if (isVerifyTruePuzzleId(args.seed)) {
    const t = buildTruePuzzleFromSolution();
    return {
      kind: "true",
      cols: t.cols,
      rows: t.rows,
      puzzleId: t.puzzleId,
      clues: t.clues,
      injectedTrue: true,
    };
  }

  const inject =
    args.forceKind === "true"
      ? true
      : args.forceKind === "flawed"
        ? false
        : rollPerfectCircuit(args.rng, { rate: args.rate });

  if (inject) {
    const t = buildTruePuzzleFromSolution();
    return {
      kind: "true",
      cols: t.cols,
      rows: t.rows,
      puzzleId: t.puzzleId,
      clues: t.clues,
      injectedTrue: true,
    };
  }

  const clues = args.generateFlawed(args.seed, args.cols, args.rows, args.rng);
  return {
    kind: "flawed",
    cols: args.cols,
    rows: args.rows,
    puzzleId: args.seed,
    clues,
    injectedTrue: false,
  };
}

