import assert from "node:assert/strict";
import {
  createEmptyCircuitBoard,
  decodeEdgeState,
  encodeEdgeState,
  edgeCount,
  type EdgeMark,
} from "@estg/shared";

const n = edgeCount(4, 4);
assert.equal(n, 40);
const marks: EdgeMark[] = Array.from({ length: n }, (_, i) =>
  (i % 3) as EdgeMark,
);
const enc = encodeEdgeState(marks);
assert.deepEqual(decodeEdgeState(enc, n), marks);

const board = createEmptyCircuitBoard(4, 4);
assert.equal(board.outcome, undefined);
assert.ok(!("timer" in board));

console.log("restore circuit.selftest ok");
