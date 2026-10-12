/** Enemy PR1 (feat/enemy-id-stats): identity data, hidden circuits, 「所属不明」 tag, old checkpoint backfill. */
import assert from "node:assert/strict";
import { FALSE_BOARD_EFFECT_KEYS } from "@estg/shared";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { ENEMY_TAG_SEC, ENEMY_UNKNOWN_JA, backfillEnemyIdentities, enemyAt, enemyDisplayNameJa, makeEnemyIdentity, noteEnemyTap, tickEnemyTag } from "./game/enemyIdentity";
import { tickWorld } from "./game/sim";

const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };
const w = createWorld(bootstrapFromSearch(""));
startSortie(w);
assert.ok(w.enemies.length > 0);
for (const e of w.enemies) {
  const id = e.enemyIdentity!;
  assert.ok(id, "every enemy has identity data");
  assert.equal(id.modelId, "mech_gen1");
  assert.equal(id.durability, e.maxHp, "durability = HP (no balance change)");
  assert.equal(id.circuits.length, 1);
  assert.equal(id.circuits[0]!.trueBoard, false);
  assert.equal(id.circuits[0]!.side, 2);
  assert.ok((FALSE_BOARD_EFFECT_KEYS as readonly string[]).includes(id.circuits[0]!.effectKey));
  assert.equal(enemyDisplayNameJa(e), ENEMY_UNKNOWN_JA, "UI name: 所属不明 only");
}
// deterministic with an injected rng
assert.deepEqual(makeEnemyIdentity({ id: "x", maxHp: 100 }, () => 0).circuits[0]!.effectKey, FALSE_BOARD_EFFECT_KEYS[0]);
console.log("enemy identity data ok");

// no behaviour change: HP / speed path unchanged by the identity (same HP as before)
for (const e of w.enemies) assert.equal(e.hp, e.maxHp);

// tap tag: shows, then fades after ENEMY_TAG_SEC, or when the enemy dies
{
  const e = w.enemies[0]!;
  assert.equal(enemyAt(w, e.pos, 24, () => true)?.id, e.id);
  assert.equal(enemyAt(w, { x: e.pos.x + 500, y: e.pos.y }, 24, () => true), null);
  assert.equal(enemyAt(w, e.pos, 24, () => false), null, "unseen enemies cannot be tapped");
  noteEnemyTap(w, e.id);
  tickEnemyTag(w, ENEMY_TAG_SEC - 0.5);
  assert.equal(w.enemyTag?.enemyId, e.id);
  tickEnemyTag(w, 1);
  assert.equal(w.enemyTag, null);
  noteEnemyTap(w, e.id);
  e.alive = false;
  tickEnemyTag(w, 0.01);
  assert.equal(w.enemyTag, null, "a dead enemy drops the tag");
  e.alive = true;
  noteEnemyTap(w, e.id);
  tickWorld(w, 0.1, idle);
  assert.ok(w.enemyTag && w.enemyTag.t < ENEMY_TAG_SEC, "tickWorld fades the tag");
  console.log("enemy tap tag ok");
}

// checkpoint: identity survives; old checkpoint without identity is backfilled
{
  const back = worldFromCheckpointBody(JSON.parse(JSON.stringify(snapshotSortieWorld(w))))!;
  assert.deepEqual(back.enemies[0]!.enemyIdentity, w.enemies[0]!.enemyIdentity, "kept across a checkpoint");
  const old = JSON.parse(JSON.stringify(snapshotSortieWorld(w)));
  for (const e of old.enemies) delete e.enemyIdentity;
  delete old.enemyTag;
  const oldBack = worldFromCheckpointBody(old)!;
  assert.ok(oldBack.enemies.every((e) => e.enemyIdentity?.modelId === "mech_gen1"), "old checkpoint backfilled");
  const before = JSON.stringify(oldBack.enemies.map((e) => e.enemyIdentity));
  backfillEnemyIdentities(oldBack);
  assert.equal(JSON.stringify(oldBack.enemies.map((e) => e.enemyIdentity)), before, "backfill keeps existing data");
  console.log("enemy checkpoint compat ok");
}
console.log("enemyIdentity.selftest ok");
