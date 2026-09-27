/**
 * Small Slitherlink-style solution counter for Module 5 circuit boards.
 *
 * Counts single-closed-loop edge sets that satisfy every displayed clue
 * (`null` = hidden / no digit), stopping at `limit` (default 2 → "unique?").
 * Constraint propagation (cell counts, vertex degree 0/2) + DFS, with early
 * rejection of a closed sub-loop while other line edges remain.
 *
 * Deterministic: no randomness. A node budget guards pathological inputs;
 * when exhausted the result is `aborted: true` (callers treat that as
 * "not proven unique").
 */
import type { EdgeMark } from "./circuit-board";
import {
  circuitCellEdgeIndices,
  circuitHEdgeIndex,
  circuitVEdgeIndex,
  type CircuitClueGrid,
} from "./circuit-effect";

export type CircuitSolutionCount = {
  /** Solutions found (capped at `limit`). */
  count: number;
  /** True when the node budget ran out before the search finished. */
  aborted: boolean;
  /** First solution found (line marks), if any. */
  first: EdgeMark[] | null;
  /** DFS nodes visited (for timing / tests). */
  nodes: number;
};

type Geometry = {
  edges: number;
  /** For each edge: its two dot vertices. */
  edgeVerts: Int32Array;
  /** For each edge: up to two adjacent cells (-1 = none). */
  edgeCells: Int32Array;
  /** For each vertex: incident edges (-1 padded to 4). */
  vertEdges: Int32Array;
  /** For each cell: its 4 edges. */
  cellEdges: Int32Array;
  verts: number;
  cells: number;
};

const geoCache = new Map<string, Geometry>();

function geometry(cols: number, rows: number): Geometry {
  const key = `${cols}x${rows}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const edges = cols * (rows + 1) + rows * (cols + 1);
  const vw = cols + 1;
  const verts = vw * (rows + 1);
  const cells = cols * rows;
  const edgeVerts = new Int32Array(edges * 2);
  const edgeCells = new Int32Array(edges * 2).fill(-1);
  const vertEdges = new Int32Array(verts * 4).fill(-1);
  const vertFill = new Int32Array(verts);
  const cellEdges = new Int32Array(cells * 4);
  const link = (e: number, a: number, b: number) => {
    edgeVerts[e * 2] = a;
    edgeVerts[e * 2 + 1] = b;
    vertEdges[a * 4 + vertFill[a]!++] = e;
    vertEdges[b * 4 + vertFill[b]!++] = e;
  };
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x < cols; x++) {
      link(circuitHEdgeIndex(cols, rows, x, y), y * vw + x, y * vw + x + 1);
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x <= cols; x++) {
      link(circuitVEdgeIndex(cols, rows, x, y), y * vw + x, (y + 1) * vw + x);
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = y * cols + x;
      const es = circuitCellEdgeIndices(cols, rows, x, y);
      for (let k = 0; k < 4; k++) {
        const e = es[k]!;
        cellEdges[c * 4 + k] = e;
        if (edgeCells[e * 2] === -1) edgeCells[e * 2] = c;
        else edgeCells[e * 2 + 1] = c;
      }
    }
  }
  const g: Geometry = {
    edges,
    edgeVerts,
    edgeCells,
    vertEdges,
    cellEdges,
    verts,
    cells,
  };
  geoCache.set(key, g);
  return g;
}

/**
 * Count single-loop solutions for `clues` on a cols×rows board, up to `limit`.
 */
export function countCircuitLoopSolutions(
  clues: CircuitClueGrid,
  cols: number,
  rows: number,
  opts?: { limit?: number; nodeBudget?: number },
): CircuitSolutionCount {
  const limit = Math.max(1, opts?.limit ?? 2);
  const budget = opts?.nodeBudget ?? 200_000;
  const g = geometry(cols, rows);
  const clue = new Int8Array(g.cells).fill(-1);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = clues[y]?.[x];
      if (v != null && v >= 0 && v <= 4) clue[y * cols + x] = v;
    }
  }

  const state = new Int8Array(g.edges).fill(-1);
  const trail: number[] = [];
  const queue: number[] = [];
  let count = 0;
  let first: EdgeMark[] | null = null;
  let nodes = 0;
  let aborted = false;

  const set = (e: number, v: number): boolean => {
    const cur = state[e]!;
    if (cur === v) return true;
    if (cur !== -1) return false;
    state[e] = v;
    trail.push(e);
    queue.push(e);
    return true;
  };

  const checkVertex = (v: number): boolean => {
    let on = 0;
    let unk = 0;
    let lastUnk = -1;
    for (let k = 0; k < 4; k++) {
      const e = g.vertEdges[v * 4 + k]!;
      if (e < 0) break;
      const s = state[e]!;
      if (s === 1) on++;
      else if (s === -1) {
        unk++;
        lastUnk = e;
      }
    }
    if (on > 2) return false;
    if (on === 2) {
      if (unk > 0) {
        for (let k = 0; k < 4; k++) {
          const e = g.vertEdges[v * 4 + k]!;
          if (e < 0) break;
          if (state[e] === -1 && !set(e, 0)) return false;
        }
      }
      return true;
    }
    if (on === 1) {
      if (unk === 0) return false;
      if (unk === 1) return set(lastUnk, 1);
      return true;
    }
    if (unk === 1) return set(lastUnk, 0);
    return true;
  };

  const checkCell = (c: number): boolean => {
    const k = clue[c]!;
    if (k < 0) return true;
    let on = 0;
    let unk = 0;
    for (let i = 0; i < 4; i++) {
      const s = state[g.cellEdges[c * 4 + i]!]!;
      if (s === 1) on++;
      else if (s === -1) unk++;
    }
    if (on > k || on + unk < k) return false;
    if (unk === 0) return true;
    if (on === k || on + unk === k) {
      const val = on === k ? 0 : 1;
      for (let i = 0; i < 4; i++) {
        const e = g.cellEdges[c * 4 + i]!;
        if (state[e] === -1 && !set(e, val)) return false;
      }
    }
    return true;
  };

  const propagate = (): boolean => {
    while (queue.length > 0) {
      const e = queue.pop()!;
      if (!checkVertex(g.edgeVerts[e * 2]!)) return false;
      if (!checkVertex(g.edgeVerts[e * 2 + 1]!)) return false;
      const c0 = g.edgeCells[e * 2]!;
      const c1 = g.edgeCells[e * 2 + 1]!;
      if (c0 >= 0 && !checkCell(c0)) return false;
      if (c1 >= 0 && !checkCell(c1)) return false;
    }
    return true;
  };

  const undo = (mark: number) => {
    while (trail.length > mark) state[trail.pop()!] = -1;
    queue.length = 0;
  };

  /**
   * Sub-loop check on current line edges.
   * Returns: "none" (no closed cycle), "fail" (closed cycle + other lines),
   * "single" (exactly one closed cycle and it holds every line edge).
   */
  const visited = new Uint8Array(g.verts);
  const loopStatus = (): "none" | "fail" | "single" => {
    visited.fill(0);
    let totalOn = 0;
    for (let e = 0; e < g.edges; e++) if (state[e] === 1) totalOn++;
    if (totalOn === 0) return "none";
    for (let e = 0; e < g.edges; e++) {
      if (state[e] !== 1) continue;
      const start = g.edgeVerts[e * 2]!;
      if (visited[start]) continue;
      // Walk the component; closed if every vertex has on-degree 2.
      const stack = [start];
      visited[start] = 1;
      let closed = true;
      let compEdges = 0;
      while (stack.length > 0) {
        const v = stack.pop()!;
        let deg = 0;
        for (let k = 0; k < 4; k++) {
          const ee = g.vertEdges[v * 4 + k]!;
          if (ee < 0) break;
          if (state[ee] !== 1) continue;
          deg++;
          compEdges++;
          const a = g.edgeVerts[ee * 2]!;
          const w = a === v ? g.edgeVerts[ee * 2 + 1]! : a;
          if (!visited[w]) {
            visited[w] = 1;
            stack.push(w);
          }
        }
        if (deg !== 2) closed = false;
      }
      if (closed) {
        return compEdges / 2 === totalOn ? "single" : "fail";
      }
    }
    return "none";
  };

  const cluesAllSatisfiedWithRestOff = (): boolean => {
    for (let c = 0; c < g.cells; c++) {
      const k = clue[c]!;
      if (k < 0) continue;
      let on = 0;
      for (let i = 0; i < 4; i++) if (state[g.cellEdges[c * 4 + i]!] === 1) on++;
      if (on !== k) return false;
    }
    // Vertices: every on-degree must be 0 or 2 (loopStatus single ⇒ yes).
    return true;
  };

  const record = () => {
    count++;
    if (first == null) {
      first = Array.from(state, (s) => (s === 1 ? 1 : 0) as EdgeMark);
    }
  };

  const pickEdge = (): number => {
    // Prefer extending a path: unknown edge at a vertex with on-degree 1.
    for (let v = 0; v < g.verts; v++) {
      let on = 0;
      let unk = -1;
      for (let k = 0; k < 4; k++) {
        const e = g.vertEdges[v * 4 + k]!;
        if (e < 0) break;
        const s = state[e]!;
        if (s === 1) on++;
        else if (s === -1 && unk < 0) unk = e;
      }
      if (on === 1 && unk >= 0) return unk;
    }
    for (let e = 0; e < g.edges; e++) if (state[e] === -1) return e;
    return -1;
  };

  const dfs = (): void => {
    if (count >= limit || aborted) return;
    nodes++;
    if (nodes > budget) {
      aborted = true;
      return;
    }
    const ls = loopStatus();
    if (ls === "fail") return;
    if (ls === "single") {
      // The loop is closed: every other edge must be off.
      if (cluesAllSatisfiedWithRestOff()) record();
      return;
    }
    const e = pickEdge();
    if (e < 0) return; // no unknowns and no closed loop → invalid
    for (const val of [1, 0]) {
      const mark = trail.length;
      if (set(e, val) && propagate()) dfs();
      undo(mark);
      if (count >= limit || aborted) return;
    }
  };

  // Initial propagation over every cell / vertex.
  let ok = true;
  for (let c = 0; c < g.cells && ok; c++) ok = checkCell(c);
  for (let v = 0; v < g.verts && ok; v++) ok = checkVertex(v);
  ok = ok && propagate();
  if (ok) dfs();
  return { count: Math.min(count, limit), aborted, first, nodes };
}

/** True when exactly one single-loop solution exists (and search finished). */
export function isCircuitUniquelySolvable(
  clues: CircuitClueGrid,
  cols: number,
  rows: number,
  opts?: { nodeBudget?: number },
): boolean {
  const r = countCircuitLoopSolutions(clues, cols, rows, {
    limit: 2,
    nodeBudget: opts?.nodeBudget,
  });
  return !r.aborted && r.count === 1;
}
