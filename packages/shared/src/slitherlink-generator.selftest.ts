import assert from "node:assert/strict";
import { generateSlitherlinkBoard } from "./index";

const trueBoard = generateSlitherlinkBoard(8, 8, "selftest-true", { forceSolvable: true });
assert.equal(trueBoard.isSolvable, true);
assert.equal(trueBoard.solutionEdges.horizontal.length, 9);
assert.equal(trueBoard.solutionEdges.vertical.length, 8);

const junkBoard = generateSlitherlinkBoard(8, 8, "selftest-junk", { forceSolvable: false });
assert.equal(junkBoard.isSolvable, false);
assert.ok(junkBoard.cells.some((row) => row.some((cell) => cell == null)));

const a = generateSlitherlinkBoard(8, 8, "same-seed", { forceSolvable: false });
const b = generateSlitherlinkBoard(8, 8, "same-seed", { forceSolvable: false });
assert.deepEqual(a, b, "same seed must regenerate deterministically");

console.log("shared slitherlink-generator selftest: ok");
