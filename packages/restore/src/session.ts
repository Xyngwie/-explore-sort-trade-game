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
  resolvePerfectCircuitInjectRate,
  sanitizeEditorName,
  stripHandoffParams,
  type CircuitOutcome,
  type EdgeMark,
} from "@estg/shared";
import {
  boardFromMarks,
  freshMarks,
  generatePuzzle,
  hazardLabel,
  loadMarksFromStorage,
  rarityLabel,
  type BoardRarity,
  type HazardKind,
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
  /** Rate used when generating a fresh board (demo / id-only). */
  perfectInjectRate?: number;
  /** True when generatePuzzle injected a seeded true board. */
  injectedTrue?: boolean;
  rarity: BoardRarity;
  hazard: HazardKind;
};

export type BootstrapRateOptions = {
  /** Override hostname (default: window.location.hostname when available). */
  hostname?: string | null;
  /** Pass import.meta.env.DEV from the Vite entry. */
  isDev?: boolean;
  envRate?: string | number | null;
  /** Allow player-facing injected-board details in DEV/local/debug UI. */
  showInjectionDetails?: boolean;
  /**
   * Explicit rate (wins over resolve). Use `0` in Node selftests that expect
   * a stable flawed demo board.
   */
  injectRate?: number;
};

function resolveInjectRateForBootstrap(
  search: string,
  rateOpts?: BootstrapRateOptions,
): number {
  if (rateOpts?.injectRate != null) {
    return rateOpts.injectRate;
  }

  // Browser (or explicit rateOpts from Vite entry): resolve DEV/prod/query.
  // Bare Node selftests calling bootstrapFromSearch(search) with no opts
  // stay at 0 so demo boards remain deterministic flawed stubs.
  const inBrowser = typeof window !== "undefined";
  if (!inBrowser && rateOpts == null) {
    return 0;
  }

  let hostname = rateOpts?.hostname;
  if (hostname === undefined && inBrowser) {
    try {
      hostname = window.location.hostname;
    } catch {
      hostname = null;
    }
  }
  // Env rate is passed from Vite entry via rateOpts.envRate
  // (import.meta.env.VITE_PERFECT_CIRCUIT_RATE) — avoid Node `process` here.
  return resolvePerfectCircuitInjectRate({
    search,
    hostname,
    isDev: rateOpts?.isDev,
    envRate: rateOpts?.envRate ?? null,
  });
}

/** Local demo seed from `?seed=` (restore-only play loop; not a handoff key). */
export function readLocalSeedFromSearch(search: string): string | null {
  try {
    const q = search.startsWith("?") ? search.slice(1) : search;
    const seed = new URLSearchParams(q).get("seed");
    if (seed == null) return null;
    const t = seed.trim();
    return t === "" ? null : t.slice(0, 64);
  } catch {
    return null;
  }
}

function rarityNote(
  puzzle: RestorePuzzle,
  showInjectionDetails: boolean,
): string {
  const base = rarityLabel(puzzle.rarity);
  if (puzzle.rarity === "perfect_rare") {
    return showInjectionDetails ? `${base} · 真盤` : base;
  }
  return `${base} · ${hazardLabel(puzzle.hazard)}`;
}

/**
 * Parse trade→restore query. Hydrate marks from circuitBoard when present;
 * otherwise seed a demo puzzle (circuitId as seed when only id is given).
 * Fresh boards (demo / id-only) apply Perfect Circuit injection rates.
 */
export function bootstrapFromSearch(
  search: string,
  rateOpts?: BootstrapRateOptions,
): RestoreSession {
  const showInjectionDetails =
    rateOpts?.showInjectionDetails ?? typeof window === "undefined";
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
    // Do NOT re-roll injection here — board geometry must match edgeState.
    const puzzle = generatePuzzle(seed, board.cols, board.rows);
    const cols = puzzle.cols;
    const rows = puzzle.rows;
    const n = edgeCount(cols, rows);
    const marks = decodeEdgeState(board.edgeState, n);
    const injectedTrue = puzzle.injectedTrue === true;
    const session: RestoreSession = {
      puzzle,
      marks,
      source: "handoff-board",
      note: `HUB 受取 · 盤 hydrate ${cols}×${rows}${
        inbound.circuitId ? ` · id ${inbound.circuitId}` : ""
      } · ${rarityNote(puzzle, showInjectionDetails)}`,
      locked,
      injectedTrue,
      rarity: puzzle.rarity,
      hazard: puzzle.hazard,
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

  const injectRate = resolveInjectRateForBootstrap(search, rateOpts);

  if (inbound?.circuitId) {
    const puzzle = generatePuzzle(
      inbound.circuitId,
      DEFAULT_COLS,
      DEFAULT_ROWS,
      { injectRate },
    );
    const n = edgeCount(puzzle.cols, puzzle.rows);
    const marks =
      loadMarksFromStorage(puzzle.puzzleId, n) ??
      freshMarks(puzzle.cols, puzzle.rows);
    const injectedTrue = puzzle.injectedTrue === true;
    const session: RestoreSession = {
      circuitId: inbound.circuitId,
      puzzle,
      marks,
      source: "handoff-id",
      note: `HUB 受取 · circuitId=${inbound.circuitId}（盤なし → シード生成） · ${rarityNote(
        puzzle,
        showInjectionDetails,
      )}${
        showInjectionDetails
          ? ` · inject ${(injectRate * 100).toFixed(1)}%`
          : ""
      }`,
      locked,
      perfectInjectRate: injectRate,
      injectedTrue,
      rarity: puzzle.rarity,
      hazard: puzzle.hazard,
    };
    if (passedEditor) session.editorName = passedEditor;
    if (locked) {
      session.engravedName = hubEditor?.lastEditorName ?? passedEditor;
    }
    if (injectedTrue) {
      try {
        console.info(
          "[restore] Perfect Circuit injected (true board)",
          puzzle.puzzleId,
          `rate=${injectRate}`,
        );
      } catch {
        /* ignore */
      }
    }
    return session;
  }

  const localSeed = readLocalSeedFromSearch(search) ?? DEFAULT_SEED;
  const puzzle = generatePuzzle(localSeed, DEFAULT_COLS, DEFAULT_ROWS, {
    injectRate,
  });
  const n = edgeCount(puzzle.cols, puzzle.rows);
  const marks =
    loadMarksFromStorage(puzzle.puzzleId, n) ??
    freshMarks(puzzle.cols, puzzle.rows);
  const injectedTrue = puzzle.injectedTrue === true;
  if (injectedTrue) {
    try {
      console.info(
        "[restore] Perfect Circuit injected (true board)",
        puzzle.puzzleId,
        `rate=${injectRate}`,
      );
    } catch {
      /* ignore */
    }
  }
  return {
    puzzle,
    marks,
    source: "demo",
    note: `ローカル盤 · seed ${localSeed} · ${rarityNote(
      puzzle,
      showInjectionDetails,
    )}${
      showInjectionDetails
        ? ` · inject ${(injectRate * 100).toFixed(1)}%`
        : ""
    }`,
    locked: false,
    editorName: passedEditor,
    perfectInjectRate: injectRate,
    injectedTrue,
    rarity: puzzle.rarity,
    hazard: puzzle.hazard,
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

/** Build a local demo URL that draws another substrate (`?seed=`). */
export function buildNextLocalBoardHref(
  seed: string,
  href: string = typeof window !== "undefined" ? window.location.href : "/",
): string {
  try {
    const u = new URL(href, "https://restore.local/");
    u.searchParams.set("seed", seed);
    // Keep perfectRate if present for playtest continuity.
    return u.pathname + u.search + u.hash;
  } catch {
    return `?seed=${encodeURIComponent(seed)}`;
  }
}
