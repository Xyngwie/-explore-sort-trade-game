/**
 * Restore max 20×20 + generator speedup selftest (STATUS 12/14, data model U12).
 *
 * - Sizes 2..20 (and non-square spot checks): v2 Perfect boards are uniquely
 *   solvable, the loop touches all 4 sides, puzzleId round-trips, trade
 *   scoring matches, and the hidden count respects min(50%, 10% + 5%×N).
 * - Requests above 20 clamp to 20 (never the 2×2 board).
 * - Solver: matches brute force on ≤4×4 and the pre-speedup solver on fixed
 *   inputs (same count, same DFS node count); boards for sides ≤ 8 are
 *   byte-identical to the #154 generator.
 * - Timing: 20×20 generation from scratch.
 */
import assert from "node:assert/strict";
import {
  CIRCUIT_BOARD_DECODE_MAX_SIDE,
  HUB_LIMITS,
  RESTORE_MAX_SIDE,
  SIZED_TRUE_HIDE_NODE_BUDGET,
  SIZED_TRUE_HIDE_TOTAL_NODE_BUDGET,
  SIZED_TRUE_MAX_SIDE,
  buildInjectedOrFlawedPuzzle,
  buildSizedTruePuzzleId,
  buildSizedTruePuzzleIdV2,
  buildTruePuzzleFromSolution,
  circuitCellEdgeIndices,
  clampRestoreSide,
  clearSizedTruePuzzleCache,
  computeCircuitEffectForBoard,
  computeCircuitEffectValue,
  countCircuitLoopSolutions,
  countLineEdgesAroundCell,
  edgeCount,
  encodeEdgeState,
  isCircuitSingleLoopClosed,
  isSizedTruePuzzleId,
  loopTouchesAllOuterSides,
  normalizeCircuitBoard,
  parseCircuitBoardCompact,
  parseSizedTruePuzzleId,
  resolveCluesForCircuitBoard,
  resolveSizedTruePuzzle,
  sizedTrueHiddenFraction,
  type EdgeMark,
} from "./index";

function fnv(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function prng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Constants / clamping
// ---------------------------------------------------------------------------
assert.equal(RESTORE_MAX_SIDE, 20);
assert.equal(SIZED_TRUE_MAX_SIDE, RESTORE_MAX_SIDE);
assert.equal(HUB_LIMITS.maxRestoreSide, RESTORE_MAX_SIDE);
assert.equal(HUB_LIMITS.maxCircuitSide, CIRCUIT_BOARD_DECODE_MAX_SIDE);
assert.equal(SIZED_TRUE_HIDE_NODE_BUDGET, 5_000);
assert.equal(SIZED_TRUE_HIDE_TOTAL_NODE_BUDGET, 150_000);
assert.equal(clampRestoreSide(6), 6);
assert.equal(clampRestoreSide(20), 20);
assert.equal(clampRestoreSide(21), 20);
assert.equal(clampRestoreSide(64), 20);
assert.equal(clampRestoreSide(0), 1);
assert.equal(clampRestoreSide(Number.NaN), 1);
// Decoding stays tolerant up to 64 (older saves are not dropped).
assert.equal(normalizeCircuitBoard({ v: 1, cols: 30, rows: 30, edgeState: "" })?.cols, 30);
assert.equal(normalizeCircuitBoard({ v: 1, cols: 65, rows: 65, edgeState: "" }), null);
assert.equal(parseCircuitBoardCompact("1|30|30||x")?.cols, 30);
// Ids: sides 2..20.
assert.equal(isSizedTruePuzzleId("perfect-true-v2-20x20-abc"), true);
assert.equal(isSizedTruePuzzleId("perfect-true-v2-21x21-abc"), false);
assert.equal(isSizedTruePuzzleId("perfect-true-v2-20x21-abc"), false);
assert.equal(isSizedTruePuzzleId("perfect-true-17x17-abc"), true);
// Hidden target: min(50%, 10% + 5%×N).
for (let n = 0; n <= 25; n++) {
  assert.equal(sizedTrueHiddenFraction(n), Math.min(0.5, 0.1 + 0.05 * n));
}
assert.equal(sizedTrueHiddenFraction(8), 0.5);
assert.equal(sizedTrueHiddenFraction(20), 0.5);

// Requests above 20 clamp to 20 (never the fixed 2×2 verify-true board).
{
  const t = buildTruePuzzleFromSolution({ seed: "clamp-25", cols: 25, rows: 25 });
  assert.equal(t.cols, 20);
  assert.equal(t.rows, 20);
  assert.equal(t.puzzleId, buildSizedTruePuzzleIdV2("clamp-25", 20, 20));
  const t2 = buildTruePuzzleFromSolution({ seed: "clamp-rect", cols: 40, rows: 6 });
  assert.equal(t2.cols, 20);
  assert.equal(t2.rows, 6);
  let flawedSize: [number, number] | null = null;
  const flawedArgs = {
    seed: "clamp-flawed",
    cols: 30,
    rows: 21,
    rate: 0,
    rng: () => 0.99,
    generateFlawed: (_s: string, c: number, r: number) => {
      flawedSize = [c, r];
      return Array.from({ length: r }, () => Array.from({ length: c }, () => null));
    },
  };
  const f = buildInjectedOrFlawedPuzzle({ ...flawedArgs, forceKind: "flawed" });
  assert.equal(f.cols, 20);
  assert.equal(f.rows, 20);
  assert.deepEqual(flawedSize, [20, 20]);
  const inj = buildInjectedOrFlawedPuzzle({ ...flawedArgs, forceKind: "true" });
  assert.equal(inj.injectedTrue, true);
  assert.equal(inj.cols, 20);
  assert.equal(inj.rows, 20);
  // 17..20 used to fall back to 2×2 (SIZED_TRUE_MAX_SIDE was 16).
  for (const n of [17, 18, 19, 20]) {
    const b = buildTruePuzzleFromSolution({ seed: `inj-${n}`, cols: n, rows: n });
    assert.equal(b.cols, n);
    assert.equal(b.puzzleId, buildSizedTruePuzzleIdV2(`inj-${n}`, n, n));
  }
}

// ---------------------------------------------------------------------------
// Solver vs brute force (≤4×4, incl. non-square)
// ---------------------------------------------------------------------------
/** Every simple loop on a grid is the boundary of a cell region → enumerate. */
function allLoops(cols: number, rows: number): EdgeMark[][] {
  const out: EdgeMark[][] = [];
  const total = cols * rows;
  const E = edgeCount(cols, rows);
  for (let mask = 1; mask < 1 << total; mask++) {
    const marks = Array.from({ length: E }, () => 0 as EdgeMark);
    const inside = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < cols && y < rows && ((mask >> (y * cols + x)) & 1) === 1;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!inside(x, y)) continue;
        const [t, r, b, l] = circuitCellEdgeIndices(cols, rows, x, y);
        if (!inside(x, y - 1)) marks[t] = 1;
        if (!inside(x + 1, y)) marks[r] = 1;
        if (!inside(x, y + 1)) marks[b] = 1;
        if (!inside(x - 1, y)) marks[l] = 1;
      }
    }
    if (isCircuitSingleLoopClosed(marks, cols, rows)) out.push(marks);
  }
  return out;
}
{
  let compared = 0;
  for (const [cols, rows] of [[2, 2], [3, 3], [4, 4], [3, 4], [4, 2]] as const) {
    const loops = allLoops(cols, rows);
    const rnd = prng(cols * 97 + rows);
    for (let k = 0; k < 120; k++) {
      // Clues from a real loop (masked) or random digits (often unsolvable).
      const base = loops[Math.floor(rnd() * loops.length)]!;
      const keep = [1, 0.8, 0.6, 0.4, 0.2][k % 5]!;
      const randomDigits = k % 7 === 6;
      const clues = Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          if (rnd() >= keep) return null;
          return randomDigits
            ? Math.floor(rnd() * 4)
            : countLineEdgesAroundCell(base, cols, rows, x, y);
        }),
      );
      let brute = 0;
      let firstBrute: EdgeMark[] | null = null;
      for (const lp of loops) {
        let ok = true;
        for (let y = 0; y < rows && ok; y++) {
          for (let x = 0; x < cols && ok; x++) {
            const c = clues[y]![x];
            if (c != null && countLineEdgesAroundCell(lp, cols, rows, x, y) !== c) ok = false;
          }
        }
        if (ok) {
          brute++;
          firstBrute ??= lp;
        }
      }
      const r = countCircuitLoopSolutions(clues, cols, rows, { limit: 2, nodeBudget: 1e6 });
      assert.equal(r.aborted, false);
      assert.equal(r.count, Math.min(2, brute), `solver vs brute ${cols}x${rows} #${k}`);
      if (brute === 1) assert.deepEqual(r.first, firstBrute);
      compared++;
    }
  }
  console.log(`circuit solver vs brute force: ${compared} grids ok`);
}

// ---------------------------------------------------------------------------
// Same behaviour as before the speedup (recorded from the #154 code)
// ---------------------------------------------------------------------------
{
  // [side, keep, count, nodes, aborted] on v1 boards with a seeded clue mask.
  const SOLVER_FINGERPRINTS: [number, number, number, number, boolean][] = [
    [4, 1, 1, 1, false], [4, 0.7, 1, 5, false], [4, 0.5, 1, 6, false], [4, 0.3, 1, 157, false],
    [6, 1, 1, 1, false], [6, 0.7, 1, 7, false], [6, 0.5, 2, 17, false], [6, 0.3, 2, 26, false],
    [8, 1, 1, 1, false], [8, 0.7, 1, 1, false], [8, 0.5, 2, 23, false], [8, 0.3, 0, 20001, true],
    [10, 1, 1, 1, false], [10, 0.7, 1, 2, false], [10, 0.5, 2, 17, false], [10, 0.3, 2, 253, false],
    [12, 1, 1, 1, false], [12, 0.7, 2, 7, false], [12, 0.5, 2, 1013, false], [12, 0.3, 0, 20001, true],
  ];
  for (const [n, keep, count, nodes, aborted] of SOLVER_FINGERPRINTS) {
    const p = resolveSizedTruePuzzle(buildSizedTruePuzzleId(`fp-solver-${n}`, n, n))!;
    const rnd = prng(n * 1000 + Math.round(keep * 100));
    const clues = p.clues.map((row) => row.map((v) => (rnd() < keep ? v : null)));
    const r = countCircuitLoopSolutions(clues, n, n, { limit: 2, nodeBudget: 20000 });
    assert.deepEqual([r.count, r.nodes, r.aborted], [count, nodes, aborted], `solver fp ${n} ${keep}`);
  }
  // Boards whose target is unchanged (side ≤ 8) are byte-identical to #154.
  const BOARD_FINGERPRINTS: [string, number, number, 1 | 2, string][] = [
    ["fp-a", 2, 2, 2, "1lbjxul"], ["fp-b", 2, 2, 2, "1lbjxul"], ["fp-c", 2, 2, 2, "1lbjxul"],
    ["fp-a", 3, 3, 2, "8v5i6g"], ["fp-b", 3, 3, 2, "56mjbx"], ["fp-c", 3, 3, 2, "148tr9j"],
    ["fp-a", 4, 4, 2, "yhstet"], ["fp-b", 4, 4, 2, "fasgdd"], ["fp-c", 4, 4, 2, "1tk2b94"],
    ["fp-a", 5, 5, 2, "18jwnc7"], ["fp-b", 5, 5, 2, "1u2chu4"], ["fp-c", 5, 5, 2, "13vahk3"],
    ["fp-a", 6, 6, 2, "1om3ji3"], ["fp-b", 6, 6, 2, "1euolyr"], ["fp-c", 6, 6, 2, "xmacen"],
    ["fp-a", 7, 7, 2, "t2tn8q"], ["fp-b", 7, 7, 2, "1y6xs1g"], ["fp-c", 7, 7, 2, "8cftew"],
    ["fp-a", 8, 8, 2, "192u9f9"], ["fp-b", 8, 8, 2, "rvkqqj"], ["fp-c", 8, 8, 2, "tv15zm"],
    ["fp-rect", 5, 3, 2, "ijxni1"], ["fp-rect", 3, 7, 2, "cxfekd"], ["fp-rect", 8, 4, 2, "q3qi13"],
    ["fp-v1", 4, 4, 1, "1apdupr"], ["fp-v1", 6, 6, 1, "1g3n194"], ["fp-v1", 8, 8, 1, "g8p32k"],
  ];
  for (const [seed, c, r, version, fp] of BOARD_FINGERPRINTS) {
    const id = version === 2 ? buildSizedTruePuzzleIdV2(seed, c, r) : buildSizedTruePuzzleId(seed, c, r);
    clearSizedTruePuzzleCache();
    const p = resolveSizedTruePuzzle(id)!;
    assert.equal(fnv(JSON.stringify(p.clues) + JSON.stringify(p.solution)), fp, `board fp ${id}`);
  }
}

// ---------------------------------------------------------------------------
// Sizes 2..20: uniqueness, 4 sides, round-trip, trade score, hidden target
// ---------------------------------------------------------------------------
function checkBoard(seed: string, cols: number, rows: number): number {
  const id = buildSizedTruePuzzleIdV2(seed, cols, rows);
  assert.ok(id.length <= 64 && !id.includes("|"));
  const parsed = parseSizedTruePuzzleId(id)!;
  assert.deepEqual([parsed.version, parsed.cols, parsed.rows], [2, cols, rows]);
  clearSizedTruePuzzleCache();
  const t0 = performance.now();
  const p = resolveSizedTruePuzzle(id)!;
  const ms = performance.now() - t0;
  assert.equal(p.cols, cols);
  assert.equal(p.rows, rows);
  assert.equal(isCircuitSingleLoopClosed(p.solution, cols, rows), true);
  assert.equal(loopTouchesAllOuterSides(p.solution, cols, rows), true, `4 sides ${id}`);
  let nulls = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = p.clues[y]![x];
      if (c == null) nulls++;
      else assert.equal(c, countLineEdgesAroundCell(p.solution, cols, rows, x, y));
    }
  }
  assert.equal(nulls, p.hiddenCount);
  const target = Math.floor(cols * rows * sizedTrueHiddenFraction(Math.max(cols, rows)));
  assert.ok(p.hiddenCount <= target);
  // In practice the target is (nearly) always reached; guard regressions.
  assert.ok(p.hiddenCount >= Math.floor(target * 0.8), `hidden ${p.hiddenCount}/${target} ${id}`);
  // Unique within the default budget (the final clue set passed a ≤5k-node
  // check, or it is the full-clue board that passed the 200k check).
  const u = countCircuitLoopSolutions(p.clues, cols, rows);
  assert.equal(u.aborted, false, `verify aborted ${id}`);
  assert.equal(u.count, 1, `unique ${id}`);
  assert.deepEqual(u.first, p.solution.map((m) => (m === 1 ? 1 : 0)));
  // Round-trip from scratch → identical board.
  clearSizedTruePuzzleCache();
  const again = resolveSizedTruePuzzle(id)!;
  assert.deepEqual(again.clues, p.clues);
  assert.deepEqual(again.solution, p.solution);
  // Trade scoring (resolveCluesForCircuitBoard) = Restore clues → same effect.
  assert.deepEqual(resolveCluesForCircuitBoard({ cols, rows, puzzleId: id }), p.clues);
  const direct = computeCircuitEffectValue({
    clues: p.clues,
    marks: p.solution,
    cols,
    rows,
    perfect: true,
    outcome: "fully_awakened",
  });
  const viaBoard = computeCircuitEffectForBoard(
    { v: 1, cols, rows, edgeState: encodeEdgeState(p.solution), puzzleId: id, outcome: "fully_awakened", perfect: true },
    { perfect: true },
  );
  assert.equal(viaBoard.effect, direct.effect);
  assert.ok(direct.effect > 0);
  return ms;
}
{
  const rows: string[] = [];
  for (let n = 2; n <= 20; n++) {
    const seeds = n <= 12 ? ["mx-a", "mx-b", "mx-c"] : ["mx-a", "mx-b"];
    const times = seeds.map((s) => checkBoard(s, n, n));
    rows.push(`${n}:${Math.max(...times).toFixed(0)}`);
  }
  for (const [c, r] of [[10, 20], [20, 8], [5, 12], [20, 2], [2, 20]] as const) {
    checkBoard("mx-rect", c, r);
  }
  console.log(`sized v2 2..20 ok (max ms per side: ${rows.join(" ")})`);
}

// ---------------------------------------------------------------------------
// Timing: 20×20 from scratch (target: median well under 300 ms on a desktop;
// the assert is generous so slower CI runners do not flake).
// ---------------------------------------------------------------------------
{
  const times: number[] = [];
  for (let i = 0; i < 7; i++) {
    const id = buildSizedTruePuzzleIdV2(`timing-${i}`, 20, 20);
    clearSizedTruePuzzleCache();
    const t0 = performance.now();
    resolveSizedTruePuzzle(id);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[3]!;
  assert.ok(median < 1500, `20×20 v2 median ${median.toFixed(0)}ms`);
  console.log(
    `20×20 v2 generation: min ${times[0]!.toFixed(0)} / median ${median.toFixed(0)} / max ${times[6]!.toFixed(0)} ms`,
  );
}

console.log("shared circuit-max20 selftest: ok");
