import assert from "node:assert/strict";
import { generateSlitherlinkBoard } from "./index";

function expectedNumbers(board: ReturnType<typeof generateSlitherlinkBoard>): number[][] {
  const { horizontal: h, vertical: v } = board.solutionEdges;
  return Array.from({ length: board.height }, (_, y) =>
    Array.from({ length: board.width }, (_, x) =>
      Number(h[y]![x]) + Number(h[y + 1]![x]) + Number(v[y]![x]) + Number(v[y]![x + 1]),
    ),
  );
}

function assertBoardShape(board: ReturnType<typeof generateSlitherlinkBoard>, width: number, height: number): void {
  assert.equal(board.width, width);
  assert.equal(board.height, height);
  assert.equal(board.cells.length, height);
  assert.ok(board.cells.every((row) => row.length === width));
  assert.equal(board.solutionEdges.horizontal.length, height + 1);
  assert.ok(board.solutionEdges.horizontal.every((row) => row.length === width));
  assert.equal(board.solutionEdges.vertical.length, height);
  assert.ok(board.solutionEdges.vertical.every((row) => row.length === width + 1));
}

function assertNumbersMatchSolution(board: ReturnType<typeof generateSlitherlinkBoard>): void {
  const expected = expectedNumbers(board);
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const actual = board.cells[y]![x];
      if (actual != null && board.isSolvable) {
        assert.equal(actual, expected[y]![x]);
      }
      assert.ok(actual == null || (actual >= 0 && actual <= 3));
    }
  }
}

const trueBoard = generateSlitherlinkBoard(8, 8, "selftest-true", {
  forceSolvable: true,
  maskRatio: 0,
});
assert.equal(trueBoard.isSolvable, true);
assertBoardShape(trueBoard, 8, 8);
assertNumbersMatchSolution(trueBoard);

const junkBoard = generateSlitherlinkBoard(8, 8, "selftest-junk", {
  forceSolvable: false,
  maskRatio: 0,
  noiseCountRange: [2, 3],
});
assert.equal(junkBoard.isSolvable, false);
assertBoardShape(junkBoard, 8, 8);
const junkExpected = expectedNumbers(junkBoard);
let visibleMutations = 0;
for (let y = 0; y < junkBoard.height; y++) {
  for (let x = 0; x < junkBoard.width; x++) {
    const actual = junkBoard.cells[y]![x];
    if (actual != null && actual !== junkExpected[y]![x]) visibleMutations++;
  }
}
assert.ok(
  visibleMutations >= 2 && visibleMutations <= 3,
  `junk board must expose 2–3 mutations with no masking; got ${visibleMutations}`,
);

// Default masking must preserve dimensions and only replace clues with null.
const masked = generateSlitherlinkBoard(8, 8, "selftest-mask", {
  forceSolvable: true,
  maskRatio: 1,
});
assertBoardShape(masked, 8, 8);
assert.ok(masked.cells.every((row) => row.every((cell) => cell === null)));

// Boundary sizes must remain valid and deterministic, including the maximum 20×20 board.
for (const [width, height] of [[1, 1], [1, 20], [20, 1], [20, 20]] as const) {
  const board = generateSlitherlinkBoard(width, height, `boundary-${width}x${height}`, {
    forceSolvable: true,
    maskRatio: 0,
  });
  assertBoardShape(board, width, height);
  assertNumbersMatchSolution(board);

  const same = generateSlitherlinkBoard(width, height, `boundary-${width}x${height}`, {
    forceSolvable: true,
    maskRatio: 0,
  });
  assert.deepEqual(board, same, `${width}×${height} board must regenerate deterministically`);
}

// A zero density target is still a valid board and must not produce NaN/shape errors.
const emptyDensity = generateSlitherlinkBoard(1, 1, "selftest-zero-density", {
  forceSolvable: true,
  targetDensity: 0,
  maskRatio: 0,
});
assertBoardShape(emptyDensity, 1, 1);
assert.equal(emptyDensity.cells[0]![0], 0);
assertNumbersMatchSolution(emptyDensity);

const a = generateSlitherlinkBoard(8, 8, "same-seed", { forceSolvable: false });
const b = generateSlitherlinkBoard(8, 8, "same-seed", { forceSolvable: false });
assert.deepEqual(a, b, "same seed must regenerate deterministically");

console.log("shared slitherlink-generator selftest: ok");
