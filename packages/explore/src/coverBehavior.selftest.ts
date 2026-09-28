import { COVER_RULES, rollCoverBlock } from './coverBehavior';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`coverBehavior selftest failed: ${message}`);
}

assert(COVER_RULES.blockChance === 0.5, 'cover block chance should remain 50%');
assert(rollCoverBlock(() => 0) === true, 'random value below threshold should block');
assert(rollCoverBlock(() => 0.499999) === true, 'random value just below threshold should block');
assert(rollCoverBlock(() => 0.5) === false, 'threshold value should not block');
assert(rollCoverBlock(() => 0.999999) === false, 'random value above threshold should not block');

console.log('coverBehavior selftest passed');
