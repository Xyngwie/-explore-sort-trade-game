import { strict as assert } from "node:assert";
import {
  classifyCircuitOutcome,
  isRestoredCircuitOutcome,
} from "./circuit-outcome";

assert.equal(
  classifyCircuitOutcome({ digitRate: 1, loopClosed: true }),
  "fully_awakened",
);
assert.equal(
  classifyCircuitOutcome({ digitRate: 0.99, loopClosed: true }),
  "bypass",
);
assert.equal(
  classifyCircuitOutcome({ digitRate: 0.25, loopClosed: false }),
  "bypass",
);
assert.equal(
  classifyCircuitOutcome({ digitRate: 0, loopClosed: false }),
  "offline",
);
assert.equal(
  classifyCircuitOutcome({ digitRate: 0, loopClosed: true }),
  "offline",
);

// Clamp malformed progress rather than accidentally awarding a perfect result.
assert.equal(
  classifyCircuitOutcome({ digitRate: 2, loopClosed: true }),
  "fully_awakened",
);
assert.equal(
  classifyCircuitOutcome({ digitRate: -1, loopClosed: true }),
  "offline",
);
assert.equal(
  classifyCircuitOutcome({ digitRate: Number.NaN, loopClosed: true }),
  "offline",
);

assert.equal(isRestoredCircuitOutcome("fully_awakened"), true);
assert.equal(isRestoredCircuitOutcome("bypass"), true);
assert.equal(isRestoredCircuitOutcome("offline"), false);

console.log("circuit-outcome selftest ok");
