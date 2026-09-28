import { type Cell, type PieceKind, applyGravity, refillFromAbove } from "./refine-board";
import type { SortClearedCounts } from "./resource-model";

export type ClearedCounts = SortClearedCounts;

const LINE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
];

/** Match 3+ identical valid pieces in horizontal or vertical lines. */
export function findLineMatches(
  board: Cell[],
  cols: number,
  rows: number,
  minLen = 3,
): Set<number> {
  const marked = new Set<number>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const start = r * cols + c;
      const kind = board[start];
      if (kind == null || kind === "junk") continue;
      for (const [dr, dc] of LINE_DIRS) {
        const pr = r - dr;
        const pc = c - dc;
        if (pr >= 0 && pr < rows && pc >= 0 && pc < cols) {
          if (board[pr * cols + pc] === kind) continue;
        }
        const cells: number[] = [start];
        let rr = r + dr;
        let cc = c + dc;
        while (rr >= 0 && rr < rows && cc >= 0 && cc < cols) {
          const i = rr * cols + cc;
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
  const cleared: ClearedCounts = { ammo: 0, armor: 0, power: 0 };
  for (const i of matches) {
    const kind = next[i];
    if (kind === "ammo" || kind === "armor" || kind === "power") {
      cleared[kind]++;
    }
    next[i] = null;
  }
  return { board: next, cleared };
}

export function resolveChains(
  board: Cell[],
  cols: number,
  rows: number,
  bag: PieceKind[] = [],
  minLen = 3,
  junkWhenEmpty = false,
): { board: Cell[]; cleared: ClearedCounts; chain: number; bag: PieceKind[] } {
  let current = board;
  let rest = [...bag];
  const total: ClearedCounts = { ammo: 0, armor: 0, power: 0 };
  let chain = 0;
  const maxChains = 64;
  while (chain < maxChains) {
    const matches = findLineMatches(current, cols, rows, minLen);
    if (matches.size === 0) break;
    chain++;
    const cleared = clearMatches(current, matches);
    total.ammo += cleared.cleared.ammo;
    total.armor += cleared.cleared.armor;
    total.power += cleared.cleared.power;
    current = applyGravity(cleared.board, cols, rows);
    if (rest.length > 0 || junkWhenEmpty) {
      const filled = refillFromAbove(current, rest, cols, rows, junkWhenEmpty);
      current = filled.board;
      rest = filled.bag;
    }
  }
  return { board: current, cleared: total, chain, bag: rest };
}

export function countOnBoard(
  board: Cell[],
): ClearedCounts & { junk: number; empty: number } {
  const out = { ammo: 0, armor: 0, power: 0, junk: 0, empty: 0 };
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

export function remainingValidInBag(bag: PieceKind[]): number {
  return bag.filter((kind) => kind !== "junk").length;
}
