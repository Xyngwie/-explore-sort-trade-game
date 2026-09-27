/** Circuit credit growth 1.5^N — single source for craft cost and Perfect sell bonus. */
import assert from "node:assert/strict";
import {
  circuitCraftCreditCost,
  circuitCraftJunkCost,
  circuitPerfectSellBonusCredits,
} from "./index";

// N → [junk, credits round(4×1.5^N), perfect bonus 2×credits]
const table: Array<[number, number, number, number]> = [
  [2, 4, 9, 18],
  [3, 6, 14, 28],
  [4, 8, 20, 40],
  [5, 10, 30, 60],
  [6, 12, 46, 92],
  [8, 16, 103, 206],
  [10, 20, 231, 462],
  [16, 32, 2627, 5254],
  [20, 40, 13301, 26602],
];
for (const [n, junk, credits, bonus] of table) {
  assert.equal(circuitCraftJunkCost(n), junk, `junk ${n}`);
  assert.equal(circuitCraftCreditCost(n), credits, `credits ${n}`);
  assert.equal(circuitPerfectSellBonusCredits(n), bonus, `bonus ${n}`);
}
for (let n = 1; n <= 64; n++) {
  assert.equal(circuitPerfectSellBonusCredits(n), 2 * circuitCraftCreditCost(n), "bonus = 2 × craft");
  assert.equal(circuitCraftCreditCost(n), Math.round(4 * 1.5 ** n));
}
for (const bad of [0, -3, null, undefined, Number.NaN]) {
  assert.equal(circuitCraftCreditCost(bad), 0);
  assert.equal(circuitCraftJunkCost(bad), 0);
  assert.equal(circuitPerfectSellBonusCredits(bad), 0);
}
assert.equal(circuitCraftCreditCost(6.9), 46, "fractional side floors");

console.log("shared circuit-craft-cost selftest: ok");
