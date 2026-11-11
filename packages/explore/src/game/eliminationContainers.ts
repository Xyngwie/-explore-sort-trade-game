/**
 * 排除で運び終えたコンテナ — 中隊功績 (docs/AUTONOMOUS_LEARNING_V0.md、2026-10-24 神宮。
 * +1 per enemy and no cap are provisional, 2026-10-26 神宮). Implemented 2026-11-11.
 *
 * - When an enemy dies, every container (not yet taken) inside that enemy's own vision at
 *   that moment gets +1 tag. Several enemies seeing the same container add up; no cap.
 * - If the container's salvage then completes without an interruption, the unit that carried
 *   it receives the tags as `eliminatedContainers` on its `company` ledger. The killer only
 *   receives them when it is that carrier.
 * - Interruption = the same as the transport quiz: a salvage of that container stops before
 *   it completes (aborted, out of reach, worker wrecked, operation time-out). The tags are
 *   then gone. Completion wins.
 * - Not summed into the learning expectation; the v0 score table is unchanged.
 *
 * Runtime fields live on the container (checkpointed with the world; absent in old
 * checkpoints → no tag). No new save key.
 */
import { canSee } from "./vision";
import type { Container, Unit, World } from "./types";

/** Tag the containers the dying enemy can see right now (call once, before death drops spawn). */
export function tagEliminationContainers(world: World, enemy: Unit): void {
  const seer: Unit = { ...enemy, alive: true };
  for (const c of world.containers) {
    if (c.taken) continue;
    if (!canSee(world, seer, c.pos)) continue;
    c.eliminationTags = (c.eliminationTags ?? 0) + 1;
  }
}

/** Tags a completed salvage of `crate` hands to its carrier (then cleared). */
export function takeEliminationTags(crate: Container): number {
  const n = Math.max(0, Math.floor(crate.eliminationTags ?? 0));
  delete crate.eliminationTags;
  delete crate.eliminationWorkerId;
  return n;
}

/**
 * Once per tick, after every salvage update: a tagged container whose salvage worker stopped
 * (or switched) before completion loses its tags.
 */
export function checkEliminationInterrupts(world: World): void {
  const workers = [world.leader, ...world.wingmen].filter((u) => u.alive && u.salvageId);
  for (const c of world.containers) {
    if (!c.eliminationTags) continue;
    if (c.taken) {
      delete c.eliminationTags;
      delete c.eliminationWorkerId;
      continue;
    }
    const worker = workers.find((u) => u.salvageId === c.id) ?? null;
    if (c.eliminationWorkerId && c.eliminationWorkerId !== worker?.id) {
      delete c.eliminationTags;
      delete c.eliminationWorkerId;
      continue;
    }
    if (worker) c.eliminationWorkerId = worker.id;
  }
}
