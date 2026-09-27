/**
 * Restore v3 deterministic Slitherlink-style substrate generator.
 * Builds one closed loop from a hole-free cell region, derives every clue from
 * that loop, then optionally injects 2–3 clue mutations for junk boards.
 */

export interface SlitherlinkBoardData {
  width: number;
  height: number;
  seed: string | number;
  isSolvable: boolean;
  cells: (number | null)[][];
  solutionEdges: {
    horizontal: boolean[][];
    vertical: boolean[][];
  };
}

export function createSlitherlinkRng(seedVal: string | number): () => number {
  let s = typeof seedVal === "number"
    ? seedVal
    : seedVal.split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0);

  return function (): number {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSolutionEdges(
  width: number,
  height: number,
  rng: () => number,
  targetDensity: number,
): { horizontal: boolean[][]; vertical: boolean[][] } {
  const inside: boolean[][] = Array.from({ length: height }, () =>
    Array(width).fill(false),
  );
  const total = width * height;
  if (total === 0) {
    return {
      horizontal: Array.from({ length: height + 1 }, () => Array(width).fill(false)),
      vertical: Array.from({ length: height }, () => Array(width + 1).fill(false)),
    };
  }

  const startY = Math.max(0, Math.floor(height / 2) - 1);
  const startX = Math.max(0, Math.floor(width / 2) - 1);
  const initH = Math.min(2, height);
  const initW = Math.min(2, width);
  let insideCount = 0;
  for (let y = 0; y < initH; y++) {
    for (let x = 0; x < initW; x++) {
      if (!inside[startY + y]![startX + x]) {
        inside[startY + y]![startX + x] = true;
        insideCount++;
      }
    }
  }

  const canAdd = (x: number, y: number): boolean => {
    if (inside[y]![x]) return false;
    let adjacent = 0;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && inside[ny]![nx]) {
        adjacent++;
      }
    }
    return adjacent >= 1 && adjacent <= 2;
  };

  const maxIterations = total * 20;
  let iterations = 0;
  while (insideCount / total < targetDensity && iterations < maxIterations) {
    iterations++;
    const candidates: [number, number][] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (canAdd(x, y)) candidates.push([x, y]);
      }
    }
    if (candidates.length === 0) break;
    const [x, y] = candidates[Math.floor(rng() * candidates.length)]!;
    inside[y]![x] = true;
    insideCount++;
  }

  const horizontal = Array.from({ length: height + 1 }, () => Array(width).fill(false));
  const vertical = Array.from({ length: height }, () => Array(width + 1).fill(false));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cur = inside[y]![x];
      const top = y > 0 ? inside[y - 1]![x] : false;
      const bottom = y < height - 1 ? inside[y + 1]![x] : false;
      const left = x > 0 ? inside[y]![x - 1] : false;
      const right = x < width - 1 ? inside[y]![x + 1] : false;
      if (cur !== top) horizontal[y]![x] = true;
      if (cur !== bottom) horizontal[y + 1]![x] = true;
      if (cur !== left) vertical[y]![x] = true;
      if (cur !== right) vertical[y]![x + 1] = true;
    }
  }
  return { horizontal, vertical };
}

function buildFullNumbers(
  width: number,
  height: number,
  edges: SlitherlinkBoardData["solutionEdges"],
): number[][] {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      Number(edges.horizontal[y]![x]) +
      Number(edges.horizontal[y + 1]![x]) +
      Number(edges.vertical[y]![x]) +
      Number(edges.vertical[y]![x + 1]),
    ),
  );
}

/** Generate a true board or a junk board using the v3 rules. */
export function generateSlitherlinkBoard(
  width: number,
  height: number,
  seed: string | number,
  options?: {
    forceSolvable?: boolean;
    targetDensity?: number;
    maskRatio?: number;
    noiseCountRange?: [number, number];
  },
): SlitherlinkBoardData {
  width = Math.max(1, Math.floor(width));
  height = Math.max(1, Math.floor(height));
  const rng = createSlitherlinkRng(seed);
  const targetDensity = Math.min(1, Math.max(0, options?.targetDensity ?? 0.75));
  const maskRatio = Math.min(1, Math.max(0, options?.maskRatio ?? 0.5));
  const [minNoise, maxNoise] = options?.noiseCountRange ?? [2, 3];
  const isSolvable = options?.forceSolvable ?? rng() < 0.01;
  const solutionEdges = buildSolutionEdges(width, height, rng, targetDensity);
  const fullNumbers = buildFullNumbers(width, height, solutionEdges);

  if (!isSolvable) {
    const lo = Math.max(0, Math.floor(minNoise));
    const hi = Math.max(lo, Math.floor(maxNoise));
    const noiseCount = lo + Math.floor(rng() * (hi - lo + 1));
    const used = new Set<string>();
    for (let i = 0; i < noiseCount; i++) {
      let x = Math.floor(rng() * width);
      let y = Math.floor(rng() * height);
      let key = `${x},${y}`;
      let guard = 0;
      while (used.has(key) && guard++ < 10) {
        x = Math.floor(rng() * width);
        y = Math.floor(rng() * height);
        key = `${x},${y}`;
      }
      used.add(key);
      const original = fullNumbers[y]![x]!;
      let next = (original + 1 + Math.floor(rng() * 3)) % 4;
      if (next === original) next = (original + 1) % 4;
      fullNumbers[y]![x] = next;
    }
  }

  const cells = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const value = fullNumbers[y]![x]!;
      if (rng() < maskRatio) return null;
      if (value === 0 && rng() < 0.3) return null;
      return value;
    }),
  );

  return { width, height, seed, isSolvable, cells, solutionEdges };
}
