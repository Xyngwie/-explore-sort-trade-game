import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  normalizeHubSnapshot,
  decodeEdgeState,
  edgeCount,
  isSizedTruePuzzleId,
  createHubSave,
  serializeHubSave,
  deserializeHubSave,
  resolvePerfectCircuitInjectRate,
  buildSizedTruePuzzleIdV2,
  resolveSizedTruePuzzle,
  encodeEdgeState,
} from "@estg/shared";
import {
  CIRCUIT_PURCHASE_PRICE,
  purchaseMaxSide,
  purchaseCircuit,
} from "./circuit-purchase";
const rich = normalizeHubSnapshot({
  ...INITIAL_HUB,
  credits: 20000,
  perfectMaxSize: 0,
});
assert.equal(CIRCUIT_PURCHASE_PRICE, 10000);
for (const [max, cap] of [
  [0, 3],
  [1, 3],
  [5, 7],
  [18, 20],
  [20, 20],
])
  assert.equal(purchaseMaxSide({ ...rich, perfectMaxSize: max }), cap);
for (const rng of [() => 0, () => 0.999999]) {
  const r = purchaseCircuit(rich, {
    circuitId: "bought-test",
    trueBoardRate: 0,
    rng,
  });
  assert.ok(r.ok);
  if (!r.ok) throw Error();
  assert.equal(r.hub.credits, 10000);
  assert.equal(r.record.origin, "bought");
  assert.equal(r.record.restoreState, "unrestored");
  assert.equal(r.record.equippedTo, null);
  assert.equal(r.record.outcome, "offline");
  assert.equal(r.record.circuitBoard.cols, rng() === 0 ? 2 : 3);
  assert.equal(r.record.circuitBoard.cols, r.record.circuitBoard.rows);
  assert.ok(
    decodeEdgeState(
      r.record.circuitBoard.edgeState,
      edgeCount(r.record.circuitBoard.cols, r.record.circuitBoard.rows),
    ).includes(1),
    "used board has a line",
  );
  assert.deepEqual(r.hub.inventory, rich.inventory);
  assert.deepEqual(r.hub.fleet, rich.fleet);
  assert.deepEqual(rich.circuits, r.hub.circuits.slice(1));
  assert.equal(rich.credits, 20000);
  const saved = deserializeHubSave(serializeHubSave(createHubSave(r.hub)))!.hub;
  assert.deepEqual(saved.circuits[0], r.record);
  const duplicate = purchaseCircuit(r.hub, {
    circuitId: "bought-test",
    trueBoardRate: 1,
    rng: () => {
      throw Error("duplicate must not reroll");
    },
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.hub, r.hub);
}
for (const credits of [0, 9999]) {
  const h = { ...rich, credits };
  const r = purchaseCircuit(h, {
    circuitId: "unaffordable",
    trueBoardRate: 1,
    rng: () => {
      throw Error("failure must not generate");
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.hub, h);
}
assert.ok(
  purchaseCircuit(
    { ...rich, credits: 10000 },
    { circuitId: "exact", trueBoardRate: 0, rng: () => 0 },
  ).ok,
);
for (const circuitId of ["", "bad id", "x".repeat(65)])
  assert.equal(
    purchaseCircuit(rich, { circuitId, trueBoardRate: 0 }).ok,
    false,
  );
const puzzleId = buildSizedTruePuzzleIdV2("oldperfect", 8, 8);
const puzzle = resolveSizedTruePuzzle(puzzleId)!;
const legacy = normalizeHubSnapshot({
  ...rich,
  perfectMaxSize: 0,
  circuits: [
    {
      circuitId: "oldperfect",
      circuitBoard: {
        v: 1,
        cols: 8,
        rows: 8,
        puzzleId,
        edgeState: encodeEdgeState(puzzle.solution),
        outcome: "fully_awakened",
        locked: true,
        perfect: true,
      },
      restoreState: "fully_awakened",
      outcome: "fully_awakened",
      origin: "legacy",
      equippedTo: null,
      locked: true,
    },
  ],
});
assert.equal(
  purchaseMaxSide(legacy),
  10,
  "legacy perfect boards backfill the craft cap",
);
const before = resolvePerfectCircuitInjectRate({
  hostname: "xyngwie.github.io",
  firstCleared: false,
});
const after = resolvePerfectCircuitInjectRate({
  hostname: "xyngwie.github.io",
  firstCleared: true,
});
assert.equal(before, 0);
assert.equal(after, 0.01);
for (const [rate, roll, expected] of [
  [before, 0, false],
  [after, 0.009, true],
  [after, 0.01, false],
  [1, 0.99, true],
]) {
  let i = 0;
  const r = purchaseCircuit(rich, {
    circuitId: `rate-${rate}-${roll}`,
    trueBoardRate: rate,
    rng: () => (i++ === 0 ? 0 : roll),
  });
  assert.ok(r.ok);
  if (!r.ok) throw Error();
  assert.equal(isSizedTruePuzzleId(r.record.circuitBoard.puzzleId!), expected);
}
const big = purchaseCircuit(
  { ...rich, perfectMaxSize: 20 },
  { circuitId: "max-size", trueBoardRate: 0, rng: () => 0.9999 },
);
assert.ok(big.ok);
if (big.ok) assert.equal(big.record.circuitBoard.cols, 20);
console.log(
  "circuit purchase: cost, size bounds, used marks, rates, failure atomicity, legacy saves, persistence PASS",
);
