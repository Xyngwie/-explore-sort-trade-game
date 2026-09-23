/**
 * Circuit effect value (効果値) — shared pure scoring for restore + trade.
 *
 * Formula (神宮 / RESTORE_V0):
 * 1. If the board has **no closed loop**, effect = **0** (effects inactive).
 * 2. Otherwise sum contributions from **satisfied** digit cells:
 *    - digit **d ≥ 1**: contribute **d**
 *    - digit **0**: contribute **0** on flawed / wounded-and-below boards;
 *      on a **perfect** circuit each satisfied 0 contributes **4**
 *
 * "Perfect" means Perfect Circuit clearance (all digits satisfied +
 * single closed loop), or an explicit `perfect` / `locked` flag.
 *
 * See docs/RESTORE_V0.md § effect value.
 */

import {
  isPerfectCircuitClearance,
  type CircuitOutcome,
  type EdgeMark,
} from "./circuit-board";

/** Cell clues; null = no digit. */
export type CircuitClueGrid = ReadonlyArray<ReadonlyArray<number | null>>;

/** Horizontal edge index: row of dots `y` (0..rows), col `x` (0..cols-1). */
export function circuitHEdgeIndex(
  cols: number,
  rows: number,
  x: number,
  y: number,
): number {
  void rows;
  return y * cols + x;
}

/** Vertical edge index: col of dots `x` (0..cols), row `y` (0..rows-1). */
export function circuitVEdgeIndex(
  cols: number,
  rows: number,
  x: number,
  y: number,
): number {
  return cols * (rows + 1) + y * (cols + 1) + x;
}

/** Top, right, bottom, left edge indices around cell (cx, cy). */
export function circuitCellEdgeIndices(
  cols: number,
  rows: number,
  cx: number,
  cy: number,
): [number, number, number, number] {
  return [
    circuitHEdgeIndex(cols, rows, cx, cy),
    circuitVEdgeIndex(cols, rows, cx + 1, cy),
    circuitHEdgeIndex(cols, rows, cx, cy + 1),
    circuitVEdgeIndex(cols, rows, cx, cy),
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
  for (const i of circuitCellEdgeIndices(cols, rows, cx, cy)) {
    if (marks[i] === 1) n++;
  }
  return n;
}

/**
 * Whether a digit cell is satisfied by current line edges.
 * Returns null when the cell has no clue.
 */
export function isCircuitDigitSatisfied(
  clues: CircuitClueGrid,
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

export type CircuitDigitStats = {
  clueCount: number;
  satisfied: number;
  /** Satisfied digit-0 cells. */
  satisfiedZeros: number;
  /** 0..1; 1 when no clues. */
  rate: number;
};

export function circuitDigitSatisfaction(
  clues: CircuitClueGrid,
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): CircuitDigitStats {
  let clueCount = 0;
  let satisfied = 0;
  let satisfiedZeros = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = clues[y]?.[x];
      if (c == null) continue;
      clueCount++;
      if (countLineEdgesAroundCell(marks, cols, rows, x, y) === c) {
        satisfied++;
        if (c === 0) satisfiedZeros++;
      }
    }
  }
  return {
    clueCount,
    satisfied,
    satisfiedZeros,
    rate: clueCount === 0 ? 1 : satisfied / clueCount,
  };
}

function buildLineAdjacency(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): number[][] | null {
  const vw = cols + 1;
  const vCount = vw * (rows + 1);
  const adj: number[][] = Array.from({ length: vCount }, () => []);
  const vid = (x: number, y: number) => y * vw + x;

  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = circuitHEdgeIndex(cols, rows, x, y);
      if (marks[i] !== 1) continue;
      const a = vid(x, y);
      const b = vid(x + 1, y);
      adj[a]!.push(b);
      adj[b]!.push(a);
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x <= cols; x++) {
      const i = circuitVEdgeIndex(cols, rows, x, y);
      if (marks[i] !== 1) continue;
      const a = vid(x, y);
      const b = vid(x, y + 1);
      adj[a]!.push(b);
      adj[b]!.push(a);
    }
  }

  for (let i = 0; i < vCount; i++) {
    const d = adj[i]!.length;
    if (d === 0) continue;
    if (d !== 2) return null;
  }
  return adj;
}

/**
 * Count closed loops on the line-edge graph.
 * Requires every used vertex degree 2; each component is one cycle (≥4 verts).
 * Returns 0 if the graph is not a disjoint union of such cycles.
 */
export function countCircuitClosedLoops(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): number {
  const adj = buildLineAdjacency(marks, cols, rows);
  if (!adj) return 0;

  const seen = new Set<number>();
  let loops = 0;
  for (let start = 0; start < adj.length; start++) {
    if (adj[start]!.length === 0 || seen.has(start)) continue;

    const component = new Set<number>();
    let prev = -1;
    let cur = start;
    for (;;) {
      if (component.has(cur)) return 0;
      component.add(cur);
      seen.add(cur);
      const nbrs = adj[cur]!;
      const next = nbrs[0] === prev ? nbrs[1]! : nbrs[0]!;
      prev = cur;
      cur = next;
      if (cur === start) break;
    }
    if (component.size < 4) return 0;
    loops++;
  }
  return loops;
}

/** True when line edges form exactly one cycle. */
export function isCircuitSingleLoopClosed(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): boolean {
  return countCircuitClosedLoops(marks, cols, rows) === 1;
}

/** True when at least one closed loop exists (effects can be active). */
export function boardHasClosedLoop(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): boolean {
  return countCircuitClosedLoops(marks, cols, rows) >= 1;
}

/** Per-cell contribution toward effect (before the no-loop gate). */
export function circuitDigitEffectContribution(
  digit: number,
  perfect: boolean,
): number {
  if (digit === 0) return perfect ? 4 : 0;
  if (digit < 0) return 0;
  return digit;
}

export type CircuitEffectBreakdown = {
  /** Final effect value (0 when no loop). */
  effect: number;
  /** Sum of digit contributions ignoring the loop gate. */
  rawSum: number;
  loopCount: number;
  hasLoop: boolean;
  perfect: boolean;
  digits: CircuitDigitStats;
  /** Satisfied zeros that counted as 4 (only when perfect). */
  zeroBonusApplied: number;
};

export type ComputeCircuitEffectInput = {
  clues: CircuitClueGrid;
  marks: readonly EdgeMark[];
  cols: number;
  rows: number;
  /**
   * Explicit perfect flag. When omitted, derived from digit 100% + single loop
   * (and optional outcome / locked hints).
   */
  perfect?: boolean | null;
  outcome?: CircuitOutcome | null;
  locked?: boolean | null;
};

/**
 * Current circuit effect value.
 * No closed loop → 0. Satisfied 0-cells count as 4 only on perfect circuits.
 */
export function computeCircuitEffectValue(
  input: ComputeCircuitEffectInput,
): CircuitEffectBreakdown {
  const { clues, marks, cols, rows } = input;
  const digits = circuitDigitSatisfaction(clues, marks, cols, rows);
  const loopCount = countCircuitClosedLoops(marks, cols, rows);
  const hasLoop = loopCount >= 1;
  const singleLoop = loopCount === 1;
  const perfect =
    input.perfect === true ||
    input.locked === true ||
    isPerfectCircuitClearance({
      outcome: input.outcome,
      perfect: input.perfect,
      locked: input.locked,
      digitRate: digits.rate,
      loopClosed: singleLoop,
    });

  let rawSum = 0;
  let zeroBonusApplied = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = clues[y]?.[x];
      if (c == null) continue;
      if (countLineEdgesAroundCell(marks, cols, rows, x, y) !== c) continue;
      const contrib = circuitDigitEffectContribution(c, perfect);
      rawSum += contrib;
      if (c === 0 && perfect) zeroBonusApplied += 4;
    }
  }

  const effect = hasLoop ? rawSum : 0;
  return {
    effect,
    rawSum,
    loopCount,
    hasLoop,
    perfect,
    digits,
    zeroBonusApplied,
  };
}

/** Short JA readout for hub / play UI. */
export function formatCircuitEffectJa(
  breakdown: CircuitEffectBreakdown,
): string {
  if (!breakdown.hasLoop) {
    return `効果 0（ループなし）`;
  }
  const zeroNote =
    breakdown.zeroBonusApplied > 0
      ? ` · 0→4 ×${breakdown.zeroBonusApplied / 4}`
      : breakdown.perfect
        ? " · Perfect"
        : "";
  return `効果 ${breakdown.effect}${zeroNote}`;
}
