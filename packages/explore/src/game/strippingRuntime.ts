import { interruptBarricade } from "./barricades";
import { cancelShieldPickup } from "./shieldOperations";
import { classifyCircuit, emptyFieldObjectIdentities, type HubSnapshot, type WreckStrippingObservation, type WreckStrippingReport } from '@estg/shared';
import { wreckCarrierId } from './carry';
import { dist, type Vec2 } from './math';
import { pushLog } from './orders';
import { advanceStripping, cancelUnitStripping, reserveStripping, STRIPPED_SHIELD_HP, type StrippingSource } from './wreckStripping';
import type { Unit, World } from './types';
export type StrippingRuntime = {
  jobs: import('./wreckStripping').StrippingState['jobs'];
  observations: WreckStrippingObservation[];
};
type Target = { id: string; pos: Vec2; unit?: Unit; instanceId: string | null };
export function wreckWasStripped(world: World, targetId: string): boolean { return world.stripping?.jobs?.[targetId]?.completed === true || (world.stripping?.observations?.some(row => row.targetId === targetId) ?? false); }
export function activeStripping(world: World, unitId: string): boolean {
  return Object.values(world.stripping?.jobs ?? {}).some(j => !j.completed && j.reservation?.unitId === unitId);
}
export function interruptStripping(world: World, unitId: string): void { cancelUnitStripping(world.stripping, unitId); }
export function strippingTargets(world: World): Target[] {
  const result: Target[] = [];
  for (const unit of [world.leader, ...world.wingmen, ...world.enemies]) {
    if (!unit.alive && (unit.kind !== 'enemy' || unit.hp <= 0) && !unit.enemyState?.recovered &&
      (unit.kind === 'enemy' || unit.instanceId) && !wreckWasStripped(world, unit.id) && !wreckCarrierId(world, unit.id))
      result.push({ id: unit.id, pos: unit.pos, unit, instanceId: unit.kind === 'enemy' ? null : unit.instanceId });
  }
  for (const m of world.strandedMechs ?? []) {
    const id = `s:${m.instanceId}`;
    if (m.wreck && m.found !== false && !wreckWasStripped(world, id) && !wreckCarrierId(world, id) && !(world.recoveredLostMechIds ?? []).includes(m.instanceId))
      result.push({ id, pos: m.pos, instanceId: m.instanceId });
  }
  for (const w of world.circuitPlay?.airWrecks ?? []) {
    const id = `a:${w.id}`;
    if (!w.recovered && !world.enemies.some(e => e.id === w.id) && !wreckWasStripped(world, id) && !wreckCarrierId(world, id))
      result.push({ id, pos: w.pos, instanceId: null });
  }
  return result;
}
/** Explicit leader action only in this PR. No movement toward a distant target. */
export function canStripWreck(world:World,unit:Unit=world.leader):boolean {
  return (world.circuitPlay?.loadout[unit.id] ?? []).some(c=>c.effectKey==='shield');
}
export function startStrippingAt(world: World, point: Vec2, hub: HubSnapshot | null, hitRadius: number): 'started' | 'none' | 'far' | 'busy' | 'locked' {
  const unit = world.leader;
  interruptBarricade(world,unit.id);
  if (!canStripWreck(world,unit)) return 'locked';
  if (world.phase !== 'sortie' || !unit.alive || world.operationTimedOut || wreckCarrierId(world, unit.id)) return 'none';
  const target = strippingTargets(world).filter(t => dist(t.pos, point) <= hitRadius).sort((a,b) => dist(a.pos,point) - dist(b.pos,point))[0];
  if (!target) return 'none';
  if (dist(unit.pos, target.pos) > world.balance.interactRadius) return 'far';
  // Don't steal a wreck already being lifted by another worker.
  if (Object.values(world.circuitPlay?.wreckChannel ?? {}).some(c => c.id === target.id)) return 'busy';
  const circuits = target.unit?.enemyIdentity?.circuits ?? world.circuitPlay?.loadout[target.id] ??
    (hub?.circuits ?? []).filter(c => (world.strandedMechs?.find(m => `s:${m.instanceId}` === target.id)?.row.circuitIds ?? []).includes(c.circuitId)).map(classifyCircuit);
  const source: StrippingSource = { targetId: target.id, instanceId: target.instanceId,
    circuits: circuits.map(c => ({ circuitId: c.circuitId, side: c.side, effect: c.effect })), learningValue: null,
    shieldMaxHp: STRIPPED_SHIELD_HP + Math.max(0,circuits.find(c=>c.effectKey==='shield')?.effect ?? 0) };
  world.shieldState ??= { identities: structuredClone(hub?.fieldObjectIdentities ?? emptyFieldObjectIdentities()), equipped: {}, ground: {} };
  world.stripping ??= { jobs: {}, observations: [] };
  const r = reserveStripping(world.stripping, world.shieldState.identities, source, unit.id, unit.pos);
  if (r.status !== 'started') return r.status === 'busy' ? 'busy' : 'none';
  cancelShieldPickup(world,unit.id);
  world.shieldState.identities = r.identities;
  unit.moveTarget = null; unit.playerMoveTarget = null; unit.salvageId = null; unit.salvageT = 0; unit.vel = { x: 0, y: 0 };
  return 'started';
}
export function tickStripping(world: World, dt: number): void {
  const state = world.stripping, shields = world.shieldState;
  if (!state || !shields) return;
  for (const [id,job] of Object.entries(state.jobs)) {
    if (!job.reservation) continue;
    const worker = [world.leader, ...world.wingmen].find(u => u.id === job.reservation?.unitId);
    const target = strippingTargets(world).find(t => t.id === id);
    const valid = world.phase === 'sortie' && !world.operationTimedOut && !!worker && !wreckCarrierId(world,worker.id) && !!target && dist(worker.pos,target.pos) <= world.balance.interactRadius;
    const r = advanceStripping(state, shields.identities, id, worker ?? null, valid, target?.pos ?? job.reservation.at, dt);
    shields.identities = r.identities;
    if (!r.completion) continue;
    const done = r.completion, item = shields.identities.shields[done.shieldKey]!;
    shields.ground[done.shieldKey] = { ...done.at };
    state.observations.push({ targetId: id, sourceInstanceId: done.source.instanceId,
      wreckId: item.sourceWreckId, shieldId: item.shieldId, generationOrder: item.generationOrder,
      at: new Date().toISOString(), circuits: done.source.circuits, learningValue: null });
    // Keep the dead Unit as combat history, while every wreck consumer uses the tombstone.
    if (target?.unit) {
      if (target.unit.enemyIdentity) target.unit.enemyIdentity.circuits = [];
      if (world.circuitPlay) world.circuitPlay.loadout[id] = [];
      world.circuitIdsByUnit[id] = [];
    }
    pushLog(world, `残骸盾：盾を1枚生成。失われた回路 ${done.source.circuits.map(c => `${c.side}×${c.side}・効力${Number(c.effect.toFixed(2))}`).join('、') || 'なし'}。学習価値：未算定。`);
  }
}
export function strippingReport(world: World): WreckStrippingReport | undefined {
  if (!world.stripping || !world.shieldState) return undefined;
  return { observations: world.stripping.observations, nextWreckId: world.shieldState.identities.nextWreckId, nextShieldOrder: world.shieldState.identities.nextShieldOrder };
}
