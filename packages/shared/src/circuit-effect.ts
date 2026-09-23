/**
 * Circuit effect value (効果値) — shared pure scoring for restore + trade.
 *
 * Formula (神宮 / RESTORE_V0):
 * 1. If the board has **no closed loop**, effect = **0** (effects inactive).
 * 2. When multiple closed loops exist, pick **exactly one** active loop:
 *    the **smallest** proper closed cycle by edge count (then by vertex count).
 * 3. Sum contributions from **satisfied** digit cells on that active loop:
 *    - digit **d ≥ 1**: contribute **d** if the cell touches the active loop
 *      (at least one of its line edges is on the cycle)
 *    - digit **0**: contribute **0** on flawed / wounded-and-below boards;
 *      on a **perfect** circuit (single loop) each board-wide satisfied 0
 *      contributes **4** (0-cells have no line edges, so they never "touch"
 *      a cycle; perfect single-loop keeps the prior board-wide 0→4 rule)
 * 4. Digits satisfied only on non-active loops contribute **0** to effect
 *    (satisfaction meter may still count them board-wide).
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

/** One proper closed cycle on the line-edge graph. */
export type CircuitClosedLoop = {
  /** Dot vertex ids on the cycle (length = edge count). */
  vertices: number[];
  /** Line-edge indices that form the cycle. */
  edgeIndices: number[];
};

/** Map two adjacent dot vertices to their shared H/V edge index. */
function edgeIndexBetweenVertices(
  cols: number,
  rows: number,
  a: number,
  b: number,
): number {
  const vw = cols + 1;
  const ax = a % vw;
  const ay = Math.floor(a / vw);
  const bx = b % vw;
  const by = Math.floor(b / vw);
  if (ay === by && Math.abs(ax - bx) === 1) {
    return circuitHEdgeIndex(cols, rows, Math.min(ax, bx), ay);
  }
  if (ax === bx && Math.abs(ay - by) === 1) {
    return circuitVEdgeIndex(cols, rows, ax, Math.min(ay, by));
  }
  // Non-adjacent: treat as invalid graph (caller rejects).
  return -1;
}

/**
 * List closed loops on the line-edge graph.
 * Requires every used vertex degree 2; each component is one cycle (≥4 verts).
 * Returns [] if the graph is not a disjoint union of such cycles.
 */
export function listCircuitClosedLoops(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
): CircuitClosedLoop[] {
  const adj = buildLineAdjacency(marks, cols, rows);
  if (!adj) return [];

  const seen = new Set<number>();
  const loops: CircuitClosedLoop[] = [];
  for (let start = 0; start < adj.length; start++) {
    if (adj[start]!.length === 0 || seen.has(start)) continue;

    const vertices: number[] = [];
    const edgeIndices: number[] = [];
    const component = new Set<number>();
    let prev = -1;
    let cur = start;
    for (;;) {
      if (component.has(cur)) return [];
      component.add(cur);
      seen.add(cur);
      vertices.push(cur);
      const nbrs = adj[cur]!;
      const next = nbrs[0] === prev ? nbrs[1]! : nbrs[0]!;
      const ei = edgeIndexBetweenVertices(cols, rows, cur, next);
      if (ei < 0) return [];
      edgeIndices.push(ei);
      prev = cur;
      cur = next;
      if (cur === start) break;
    }
    if (vertices.length < 4) return [];
    loops.push({ vertices, edgeIndices });
  }
  return loops;
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
  return listCircuitClosedLoops(marks, cols, rows).length;
}

/**
 * Multi-loop selection (product lock): the **smallest** proper closed cycle
 * by edge count, then by vertex count. Digits on other loops do not score.
 */
export function selectSmallestClosedLoop(
  loops: readonly CircuitClosedLoop[],
): CircuitClosedLoop | null {
  if (loops.length === 0) return null;
  let best = loops[0]!;
  for (let i = 1; i < loops.length; i++) {
    const L = loops[i]!;
    const be = best.edgeIndices.length;
    const le = L.edgeIndices.length;
    if (le < be) best = L;
    else if (le === be && L.vertices.length < best.vertices.length) best = L;
  }
  return best;
}

/** True when a digit cell shares at least one line edge with the loop. */
export function circuitDigitTouchesLoop(
  marks: readonly EdgeMark[],
  cols: number,
  rows: number,
  cx: number,
  cy: number,
  loopEdges: ReadonlySet<number>,
): boolean {
  for (const i of circuitCellEdgeIndices(cols, rows, cx, cy)) {
    if (marks[i] === 1 && loopEdges.has(i)) return true;
  }
  return false;
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

/** One satisfied digit cell and its contribution to 効果値. */
export type CircuitEffectDigitContribution = {
  /** Cell column (0-based). */
  x: number;
  /** Cell row (0-based). */
  y: number;
  /** Clue digit on the cell. */
  digit: number;
  /**
   * Credits toward effect from this cell.
   * 0 when satisfied but not on the active (smallest) loop,
   * or digit 0 on a non-perfect board.
   */
  contribution: number;
};

export type CircuitEffectBreakdown = {
  /** Final effect value (0 when no loop). */
  effect: number;
  /** Sum of digit contributions on the active loop (before no-loop gate). */
  rawSum: number;
  loopCount: number;
  hasLoop: boolean;
  /** Edge count of the selected (smallest) closed loop; 0 when none. */
  activeLoopEdgeCount: number;
  perfect: boolean;
  digits: CircuitDigitStats;
  /** Satisfied zeros that counted as 4 (only when perfect). */
  zeroBonusApplied: number;
  /**
   * Per satisfied digit cell: how much it adds to 効果値
   * (same scorer / smallest-loop rules). Includes 0-contribution cells
   * that are satisfied but inactive (other loop / non-perfect 0).
   */
  contributions: readonly CircuitEffectDigitContribution[];
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
 * No closed loop → 0. Multi-loop → score only the smallest closed loop.
 * Satisfied 0-cells count as 4 only on perfect (single-loop) circuits.
 */
export function computeCircuitEffectValue(
  input: ComputeCircuitEffectInput,
): CircuitEffectBreakdown {
  const { clues, marks, cols, rows } = input;
  const digits = circuitDigitSatisfaction(clues, marks, cols, rows);
  const loops = listCircuitClosedLoops(marks, cols, rows);
  const loopCount = loops.length;
  const hasLoop = loopCount >= 1;
  const singleLoop = loopCount === 1;
  const activeLoop = selectSmallestClosedLoop(loops);
  const activeLoopEdgeCount = activeLoop?.edgeIndices.length ?? 0;
  const activeEdges = activeLoop
    ? new Set<number>(activeLoop.edgeIndices)
    : null;
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
  const contributions: CircuitEffectDigitContribution[] = [];
  if (activeEdges) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = clues[y]?.[x];
        if (c == null) continue;
        if (countLineEdgesAroundCell(marks, cols, rows, x, y) !== c) continue;

        if (c === 0) {
          // 0-cells never touch line edges; keep board-wide 0→4 on perfect
          // single-loop circuits only (perfect implies singleLoop or flag).
          if (!perfect) {
            contributions.push({ x, y, digit: 0, contribution: 0 });
            continue;
          }
          rawSum += 4;
          zeroBonusApplied += 4;
          contributions.push({ x, y, digit: 0, contribution: 4 });
          continue;
        }

        if (!circuitDigitTouchesLoop(marks, cols, rows, x, y, activeEdges)) {
          contributions.push({ x, y, digit: c, contribution: 0 });
          continue;
        }
        const add = circuitDigitEffectContribution(c, perfect);
        rawSum += add;
        contributions.push({ x, y, digit: c, contribution: add });
      }
    }
  }

  const effect = hasLoop ? rawSum : 0;
  return {
    effect,
    rawSum,
    loopCount,
    hasLoop,
    activeLoopEdgeCount,
    perfect,
    digits,
    zeroBonusApplied,
    contributions,
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

/** Group satisfied-digit contributions by digit value (display helper). */
export type CircuitEffectDigitGroup = {
  digit: number;
  /** How many satisfied cells with this digit contribute (>0). */
  count: number;
  /** Sum of contributions from those cells. */
  total: number;
  /** Per-cell unit contribution (digit, or 4 for perfect 0). */
  unit: number;
};

/**
 * Aggregate {@link CircuitEffectBreakdown.contributions} by digit for UI.
 * Only cells with contribution > 0 are included. Digits sorted ascending.
 */
export function groupCircuitEffectContributions(
  breakdown: CircuitEffectBreakdown,
): CircuitEffectDigitGroup[] {
  const map = new Map<number, CircuitEffectDigitGroup>();
  for (const c of breakdown.contributions) {
    if (c.contribution <= 0) continue;
    const g = map.get(c.digit);
    if (g) {
      g.count += 1;
      g.total += c.contribution;
    } else {
      map.set(c.digit, {
        digit: c.digit,
        count: 1,
        total: c.contribution,
        unit: c.contribution,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.digit - b.digit);
}

/**
 * Japanese breakdown line for hub UI, e.g.
 * `内訳 2×4(+8)` or `内訳 0→4×1(+4) · 2×2(+4)` or `内訳なし（ループなし）`.
 */
export function formatCircuitEffectBreakdownJa(
  breakdown: CircuitEffectBreakdown,
): string {
  if (!breakdown.hasLoop) {
    return "内訳なし（ループなし）";
  }
  const groups = groupCircuitEffectContributions(breakdown);
  if (groups.length === 0) {
    return "内訳なし（充足寄与 0）";
  }
  const parts = groups.map((g) => {
    if (g.digit === 0) {
      return `0→4×${g.count}(+${g.total})`;
    }
    return `${g.digit}×${g.count}(+${g.total})`;
  });
  return `内訳 ${parts.join(" · ")}`;
}
