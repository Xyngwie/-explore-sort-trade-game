/**
 * Circuit effect numbers and fixed 1×1 boards (Issue #269).
 */
import assert from "node:assert/strict";
import {
  FALSE_BOARD_EFFECT_KEYS,
  assignMissingEffectKeys,
  cargoSlotBonus,
  circuitTrueBoardRate,
  classifyCircuit,
  effectKeyForCircuit,
  effectRate,
  makeFalseOneByOne,
  makeRestoredTrueOneByOne,
  perfectRatePoints,
  qualityBonusPt,
  readAirSupportCooldownSec,
  readBulletinUnlocked,
  weaponCategory,
  type HubSnapshot,
} from "./circuit-actions";
import { resolveCluesForCircuitBoard } from "./circuit-clues";
import { buildVerifyPerfectLockedBoard } from "./perfect-circuit-seed";

assert.equal(effectRate(8), 0.06);
assert.equal(effectRate(49), 0.14);
assert.equal(effectRate(100), 0.2);
assert.equal(effectRate(225), 0.3);
assert.equal(effectRate(0), 0);
assert.equal(perfectRatePoints(8), 1);
assert.equal(perfectRatePoints(49), 4);
assert.equal(perfectRatePoints(225), 8);
assert.equal(cargoSlotBonus(16), 1);
assert.equal(cargoSlotBonus(256), 4);
assert.equal(cargoSlotBonus(0), 0);

const truth = makeRestoredTrueOneByOne("true-1x1");
const fals = makeFalseOneByOne("false-1x1");
assert.equal(classifyCircuit(truth).oneByOne, "true");
assert.equal(classifyCircuit(fals).oneByOne, "false");
assert.equal(resolveCluesForCircuitBoard(truth.circuitBoard)[0]?.[0], 4);
assert.equal(weaponCategory("mmr"), "weapon");
assert.equal(weaponCategory("lmg"), "weapon");
assert.equal(weaponCategory("emp_round"), "special_ammo");
assert.equal(weaponCategory("piercing_round"), "special_ammo");
assert.equal(weaponCategory("cargo_slots"), null);

const keyed = { ...fals, effectKey: "smg" as const };
assert.equal(effectKeyForCircuit(keyed), "smg");
assert.equal(effectKeyForCircuit(keyed), effectKeyForCircuit(keyed));
assert.equal(effectKeyForCircuit(fals), undefined);

const bare = { fleet: [{ instanceId: "m1" }], circuits: [], lostMechs: [] } as unknown as HubSnapshot;
assert.equal(circuitTrueBoardRate(bare, 0.01), 0.01);
assert.equal(circuitTrueBoardRate(bare, 0.33), 0.33);
assert.equal(readBulletinUnlocked(bare), false);
assert.equal(readAirSupportCooldownSec(bare), 0);
const cleared = { ...bare, bulletinUnlocked: true } as HubSnapshot;
assert.equal(circuitTrueBoardRate(cleared, 0.01), 0.01);
assert.equal(circuitTrueBoardRate(cleared, 0.4), 0.4);
const rated = {
  ...bare,
  circuits: [
    {
      circuitId: "pr",
      circuitBoard: buildVerifyPerfectLockedBoard("t"),
      restoreState: "fully_awakened",
      origin: "picked_up",
      equippedTo: "m1",
      outcome: "fully_awakened",
      locked: true,
      effectKey: "perfect_rate",
    },
  ],
} as unknown as HubSnapshot;
const pt = qualityBonusPt(rated);
const add = pt / 100;
assert.equal(circuitTrueBoardRate(rated, 0.01), pt > 0 ? Math.min(0.31, 0.01 + add) : 0.01);
assert.equal(circuitTrueBoardRate(rated, 0.33), pt > 0 ? 0.33 + add : 0.33);
assert.equal(circuitTrueBoardRate(rated, 0.4), pt > 0 ? 0.4 + add : 0.4);

// 項目4-2 C1e compat: 「回収」 (recover) is the 19th false-board key. Saved keys are kept
// as they are; only a circuit that gets its key from now on can roll recover.
{
  assert.equal(FALSE_BOARD_EFFECT_KEYS.length, 21);
  assert.equal(FALSE_BOARD_EFFECT_KEYS[19], "recover");
  assert.equal(FALSE_BOARD_EFFECT_KEYS[15], "piercing_round");
  assert.equal(FALSE_BOARD_EFFECT_KEYS[20], "shield");
  const OLD18 = FALSE_BOARD_EFFECT_KEYS.slice(0, 18);
  const recs = Array.from({ length: 120 }, (_, i) => ({
    circuitId: `c1e-${i}`,
    circuitBoard: buildVerifyPerfectLockedBoard("t"),
    restoreState: "bypass",
    origin: "crafted",
    equippedTo: null,
  })) as unknown as Parameters<typeof assignMissingEffectKeys>[0];
  const fresh = assignMissingEffectKeys(recs);
  assert.ok(fresh.every((r) => typeof r.effectKey === "string" && (FALSE_BOARD_EFFECT_KEYS as readonly string[]).includes(r.effectKey!)));
  assert.ok(fresh.some((r) => r.effectKey === "recover"), "new assignments can roll recover");
  // An old save: every circuit already holds a key from the 18 → none is redrawn.
  const saved = recs.map((r, i) => ({ ...r, effectKey: OLD18[i % 18] }));
  const again = assignMissingEffectKeys(saved);
  assert.deepEqual(again.map((r) => r.effectKey), saved.map((r) => r.effectKey));
  assert.ok(again.every((r) => r.effectKey !== "recover"));
  for (const r of saved) assert.equal(effectKeyForCircuit(r), r.effectKey);
  console.log("shared 項目4-2 C1e recover key compat ok");
}

console.log("circuit-actions.selftest ok");
