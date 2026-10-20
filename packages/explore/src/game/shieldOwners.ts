import type { Unit, World } from './types';
/** Stranded mechs remain the existing passive field objects, not new AI units.
 * A lightweight owner view lets their shield timers use simulation time. */
export function shieldOwnerUnits(world: World): Unit[] {
  return [world.leader,...world.wingmen,...world.enemies,...(world.strandedMechs ?? []).map(m=>({
    ...world.leader,id:`s:${m.instanceId}`,instanceId:m.instanceId,kind:'wingman' as const,
    name:m.name,pos:m.pos,alive:!m.wreck,hp:m.wreck?0:world.leader.maxHp,
    salvagedCount:0,salvageId:null,salvageT:0,moveTarget:null,playerMoveTarget:null,waypoint:null,inCover:false,
  }))];
}
