/**
 * 自律学習の後続 (2026-11-11 TASK_ASSIGNMENT; docs/AUTONOMOUS_LEARNING_V0.md 「決定済み・未着手」).
 * S1 排除で運び終えたコンテナ / S2 敵の基本報酬の平均 / S3 隊長の 1×1 完全による自律.
 */
import assert from "node:assert/strict";
import { createNewGameHub, enemyBaseRewardAverage, normalizeHubSnapshot } from "@estg/shared";
import { createWorld, bootstrapFromSearch, startSortie } from "./game/world";
import { tickWorld, updateSalvage, type PlayerInput } from "./game/sim";
import { attachCircuitPlay, circuitButtons } from "./game/circuitPlay";
import { backfillEnemyState, handleEnemyDeaths } from "./game/enemyBehavior";
import { checkEliminationInterrupts } from "./game/eliminationContainers";
import { applyMechLearningHubSide, enemyBaseRewardOfSortie, ensureMechLearningWorld } from "./game/outcome";
import { isCommandUnlockedFor } from "./game/commandUnlock";
import { releaseAbilityScale } from "./game/releaseAbility";
import { learningExpectation, isAutonomousLeader, isLearningUnit } from "./game/learning";
import { getCoverObjects } from "./game/coverObjects";
import type { Container, Unit, World } from "./game/types";

function fixture(): World {
  const w = createWorld(bootstrapFromSearch(""));
  startSortie(w);
  getCoverObjects(w).splice(0);
  w.containers.splice(0);
  backfillEnemyState(w);
  for (const e of w.enemies) e.pos = { x: 9000, y: 9000 };
  w.leader.pos = { x: 100, y: 100 };
  for (const wing of w.wingmen) wing.pos = { x: 120, y: 100 };
  return w;
}
const crate = (id: string, x: number, y: number): Container => ({ id, pos: { x, y }, taken: false, discovered: true, glowT: 0 });
/** Kill `e` while facing +x, then process its death once. */
function kill(w: World, e: Unit, x: number, y: number): void {
  e.pos = { x, y };
  e.heading = 0;
  e.hp = 0;
  e.alive = false;
  handleEnemyDeaths(w);
}
function company(w: World, instanceId: string): number {
  return (w.mechLearningWork?.[instanceId] ?? [])
    .filter((c) => c.ledger === "company")
    .reduce((n, c) => n + (c.eliminatedContainers ?? 0), 0);
}
/** Complete the salvage of the container at the unit's feet. */
function finishSalvage(w: World, u: Unit): void {
  updateSalvage(w, u, true, 0.01);
  checkEliminationInterrupts(w);
  updateSalvage(w, u, true, 999);
  checkEliminationInterrupts(w);
}

// --- S1: tags = enemies that saw the container at their death; +1 each, no cap ---------------
{
  const w = fixture();
  const seen = crate("c-seen", 530, 500);
  const behind = crate("c-behind", 470 - 400, 500); // far behind the enemy → not in its vision
  w.containers.push(seen, behind);
  const [e1, e2] = w.enemies;
  kill(w, e1!, 500, 500);
  kill(w, e2!, 500, 500);
  assert.equal(seen.eliminationTags, 2, "two enemies saw it → 2");
  assert.equal(behind.eliminationTags ?? 0, 0, "outside the dead enemy's vision → no tag");
  handleEnemyDeaths(w);
  assert.equal(seen.eliminationTags, 2, "each death is tagged once");
  const carrier = w.wingmen[0]!;
  carrier.instanceId = "carrier-1";
  carrier.learningAction = "carry";
  carrier.pos = { ...seen.pos };
  finishSalvage(w, carrier);
  assert.equal(seen.taken, true);
  assert.equal(company(w, "carrier-1"), 2, "the carrier receives +1 per enemy");
  const cell = w.mechLearningWork!["carrier-1"]!.find((c) => c.ledger === "company")!;
  assert.equal(cell.subject, "container");
  assert.equal(learningExpectation(cell), 0, "company ledger is not summed into the expectation");
}
{
  // No cap: 12 enemies.
  const w = fixture();
  const c = crate("c-many", 530, 500);
  w.containers.push(c);
  while (w.enemies.length < 12) w.enemies.push({ ...structuredClone(w.enemies[0]!), id: `extra-${w.enemies.length}` });
  w.enemies.splice(12);
  backfillEnemyState(w);
  for (const e of w.enemies) { e.enemyState!.deathHandled = false; kill(w, e, 500, 500); }
  assert.equal(c.eliminationTags, 12, "no cap");
  const carrier = w.wingmen[0]!;
  carrier.instanceId = "carrier-12";
  carrier.pos = { ...c.pos };
  finishSalvage(w, carrier);
  assert.equal(company(w, "carrier-12"), 12);
}
{
  // Interrupted after the kill → nothing, even if someone completes it later.
  const w = fixture();
  const c = crate("c-int", 530, 500);
  w.containers.push(c);
  kill(w, w.enemies[0]!, 500, 500);
  const a = w.wingmen[0]!, b = w.wingmen[1]!;
  a.instanceId = "int-a";
  b.instanceId = "int-b";
  a.pos = { ...c.pos };
  updateSalvage(w, a, true, 0.01);
  checkEliminationInterrupts(w);
  assert.equal(c.eliminationWorkerId, a.id);
  a.pos = { x: 2000, y: 2000 }; // out of reach → the salvage is aborted
  updateSalvage(w, a, true, 0.01);
  checkEliminationInterrupts(w);
  assert.equal(c.eliminationTags ?? 0, 0, "interruption clears the tags");
  b.pos = { ...c.pos };
  finishSalvage(w, b);
  assert.equal(c.taken, true);
  assert.equal(company(w, "int-b"), 0, "completed after an interruption → no points");
  assert.equal(company(w, "int-a"), 0);
}
{
  // Time-out while salvaging = interruption (same as the quiz).
  const w = fixture();
  const c = crate("c-to", 530, 500);
  w.containers.push(c);
  kill(w, w.enemies[0]!, 500, 500);
  const a = w.wingmen[0]!;
  a.instanceId = "to-a";
  a.pos = { ...c.pos };
  updateSalvage(w, a, true, 0.01);
  checkEliminationInterrupts(w);
  a.salvageId = null; a.salvageT = 0; // what the operation time-out does to every salvage
  checkEliminationInterrupts(w);
  assert.equal(c.eliminationTags ?? 0, 0);
}
{
  // The killer receives only when it carried the container itself.
  const w = fixture();
  const c1 = crate("c-k1", 530, 500), c2 = crate("c-k2", 1530, 500);
  w.containers.push(c1, c2);
  const killer = w.wingmen[0]!, other = w.wingmen[1]!;
  killer.instanceId = "killer";
  other.instanceId = "other";
  kill(w, w.enemies[0]!, 500, 500);
  kill(w, w.enemies[1]!, 1500, 500);
  other.pos = { ...c1.pos };
  finishSalvage(w, other);
  assert.equal(company(w, "other"), 1, "carrier of c1 receives");
  assert.equal(company(w, "killer"), 0, "the killer did not carry c1 → nothing");
  killer.pos = { ...c2.pos };
  finishSalvage(w, killer);
  assert.equal(company(w, "killer"), 1, "the killer carried c2 itself → +1");
}
{
  // Old checkpoint: containers without the runtime fields carry no tag.
  const w = fixture();
  const c = crate("c-old", 100, 100);
  w.containers.push(c);
  const a = w.wingmen[0]!;
  a.instanceId = "old";
  a.pos = { ...c.pos };
  finishSalvage(w, a);
  assert.equal(company(w, "old"), 0);
}

// --- S2: 60 per enemy wreck brought home; not used for classification -----------------------
{
  const w = fixture();
  w.extracted = true;
  w.recoveredEnemyUnits = [w.enemies[0]!, w.enemies[1]!];
  w.recoveredWreckUnitIds = [w.wingmen[0]!.id]; // our own wreck: never counted
  assert.equal(enemyBaseRewardOfSortie(w), 120);
  w.extracted = false;
  assert.equal(enemyBaseRewardOfSortie(w), 0, "no lift-off → 0");
  w.extracted = true;
  w.recoveredEnemyUnits = [];
  assert.equal(enemyBaseRewardOfSortie(w), 0, "nothing brought home → 0");
  w.recoveredEnemyUnits = [w.enemies[0]!];
  const hub = applyMechLearningHubSide(w, normalizeHubSnapshot(createNewGameHub()));
  assert.equal(enemyBaseRewardAverage(hub.mechLearning), 6, "60 / 10");
  const again = applyMechLearningHubSide(w, hub);
  assert.equal(again.mechLearning!.enemyBaseRewards!.length, 1, "the same sortie is recorded once");
  // The battlefield enemies stay `normal`: a kill cell after the average is still normal.
  const k = fixture();
  const wing = k.wingmen[0]!;
  wing.instanceId = "normal-check";
  wing.learningAction = "fight";
  ensureMechLearningWorld(k);
  assert.ok(!(k.mechLearningWork!["normal-check"] ?? []).some((c) => c.subject === "circuit" || c.subject === "wreck"));
}

// --- S3: the captain with the true 1×1 「4」 is autonomous; manual input wins ----------------
const idle: PlayerInput = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };
function captainFixture(trueOne: boolean): World {
  const w = fixture();
  attachCircuitPlay(w, null, true);
  w.circuitPlay!.captainTrueOne = trueOne;
  w.circuitPlay!.captainOneByOne = trueOne;
  w.leader.instanceId = w.leader.instanceId ?? "captain-1";
  w.mechLearningReady = true;
  w.mechLearningWork = {};
  w.boarding = null;
  return w;
}
{
  const w = captainFixture(true);
  assert.equal(isAutonomousLeader(w, w.leader), true);
  assert.equal(isLearningUnit(w, w.leader), true);
  tickWorld(w, 0.05, { ...idle });
  assert.equal(w.leader.learningDecisionCount, 1, "no input → the captain decides with the learning");
  const id = w.leader.instanceId!.trim();
  const survival = (w.mechLearningWork![id] ?? []).filter((c) => c.ledger === "survival");
  assert.equal(survival.length, 1);
  assert.equal(survival[0]!.tries, 1, "the selection counts tries in the captain's own ledger");
  // Orders to wingmen and air support stay.
  assert.equal(isCommandUnlockedFor(w, "wing_mobility"), true, "wing_mobility stays");
  assert.ok(circuitButtons(w).some((b) => b.id === "air_support"), "air support stays");
  // Manual input wins: no new decision while a basic input is held, and the WASD move is applied.
  const before = w.leader.learningDecisionCount;
  const x0 = w.leader.pos.x;
  for (let i = 0; i < 60; i++) tickWorld(w, 0.05, { ...idle, move: { x: 1, y: 0 } });
  assert.equal(w.leader.learningDecisionCount, before, "manual input → no learning decision");
  assert.ok(w.leader.pos.x > x0 + 5, "manual move applied");
  // Input released → autonomy resumes on the 2 s cadence.
  for (let i = 0; i < 50; i++) tickWorld(w, 0.05, { ...idle });
  assert.ok((w.leader.learningDecisionCount ?? 0) > before, "autonomy resumes without input");
}
{
  // Without the true 1×1 the captain stays manual: no learning.
  const w = captainFixture(false);
  assert.equal(isLearningUnit(w, w.leader), false);
  for (let i = 0; i < 50; i++) tickWorld(w, 0.05, { ...idle });
  assert.equal(w.leader.learningDecisionCount ?? 0, 0);
  assert.equal((w.mechLearningWork![w.leader.instanceId!.trim()] ?? []).length, 0);
}
{
  // A captain without an instanceId does not learn even with the true 1×1.
  const w = captainFixture(true);
  w.leader.instanceId = null;
  assert.equal(isLearningUnit(w, w.leader), false);
}
{
  // The false 1×1 ×2 (attack / range / vision) stays on a wingman in release; never on the captain.
  const wing = releaseAbilityScale({ release: true, isCaptain: false, oneByOneEffect: 0, hasFalseOne: true });
  const cap = releaseAbilityScale({ release: true, isCaptain: true, oneByOneEffect: 0, hasFalseOne: true });
  assert.equal(wing.attack, cap.attack * 2);
  assert.equal(wing.range, cap.range * 2);
  assert.equal(wing.vision, cap.vision * 2);
  assert.equal(cap.moveSpeed, wing.moveSpeed, "only attack / range / vision double");
}
{
  // The basic five stay ungated (D2 ★B): every basic command is unlocked without any circuit.
  const w = captainFixture(false);
  for (const id of ["move", "fire", "collect", "extract", "abort"] as const) assert.equal(isCommandUnlockedFor(w, id), true, id);
}

console.log("explore learning follow-ups selftest: ok");
