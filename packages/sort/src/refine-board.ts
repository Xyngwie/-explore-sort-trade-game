export type PieceKind = "food" | "material" | "energy" | "junk";
export type Cell = PieceKind | null;

export function emptyBoard(cols: number, rows: number): Cell[] {
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

/** One visible row of gravity; used by the gradual settle animation. */
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

/** Take the next n panels from the front of the supply bag. */
export function takeFromBag(
  bag: PieceKind[],
  n: number,
): { gems: PieceKind[]; bag: PieceKind[] } {
  const take = Math.min(n, bag.length);
  return { gems: bag.slice(0, take), bag: bag.slice(take) };
}

/** Spawn at most one panel into each empty top cell. */
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

/** Whether any panel can fall or an empty top cell needs a spawn. */
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

/** Fill empty cells from the bag; optionally turn exhausted holes into junk. */
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

/** Indices whose occupant changed during a settle tick. */
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
