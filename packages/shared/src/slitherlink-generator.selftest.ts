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

const trueBoard = generateSlitherlinkBoard(8, 8, "selftest-true", {
  forceSolvable: true,
  maskRatio: 0,
});
assert.equal(trueBoard.isSolvable, true);
assert.equal(trueBoard.solutionEdges.horizontal.length, 9);
assert.equal(trueBoard.solutionEdges.vertical.length, 8);
assert.deepEqual(trueBoard.cells, expectedNumbers(trueBoard), "true board clues must match the loop");

const junkBoard = generateSlitherlinkBoard(8, 8, "selftest-junk", {
  forceSolvable: false,
  maskRatio: 0,
});
assert.equal(junkBoard.isSolvable, false);
const junkExpected = expectedNumbers(junkBoard);
let mutations = 0;
for (let y = 0; y < junkBoard.height; y++) {
  for (let x = 0; x < junkBoard.width; x++) {
    if (junkBoard.cells[y]![x] !== junkExpected[y]![x]) mutations++;
  }
}
assert.ok(mutations >= 2 && mutations <= 3, `junk board must mutate exactly 2–3 clues; got ${mutations}`);
assert.ok(junkBoard.cells.some((row) => row.some((cell) => cell == null)) === false);

const a = generateSlitherlinkBoard(8, 8, "same-seed", { forceSolvable: false });
const b = generateSlitherlinkBoard(8, 8, "same-seed", { forceSolvable: false });
assert.deepEqual(a, b, "same seed must regenerate deterministically");

console.log("shared slitherlink-generator selftest: ok");
