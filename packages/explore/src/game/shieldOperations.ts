import type { FieldObjectReference } from '@estg/shared';
import { roomFor, wreckCarrierId } from './carry';
import { dist } from './math';
import { pushLog } from './orders';
import { equippedShield, type DurableShield } from './shields';
import { interruptStripping } from './strippingRuntime';
import type { Unit, World } from './types';
export const SHIELD_WORK_SECONDS = 2;
export const SHIELD_FULL_MESSAGE = 'インベントリ満杯：盾を回収できませんでした';
export const SHIELD_BUSY_MESSAGE = 'この盾は別の機体が回収中です';
const notices = new WeakMap<World,string[]>();
export function takeShieldNotices(world:World):string[] { const queue=notices.get(world)??[];notices.delete(world);return queue; }
function notify(world:World,message:string,log=false):void {
 const queue=notices.get(world)??[];queue.push(message);notices.set(world,queue);if(log)pushLog(world,message);
}
export function shieldItem(world:World,key:string):DurableShield|null {
 const items=world.shieldState?.identities.shields;
 const item=items && Object.hasOwn(items,key)?items[key]:null;
 return item && typeof item.hp==='number' && Number.isFinite(item.hp) && item.hp>0 && typeof item.maxHp==='number' && Number.isFinite(item.maxHp) && item.maxHp>0 ? item as DurableShield:null;
}
export function spareShields(world:World,unit:Unit):FieldObjectReference[] {
 const equipped=world.shieldState?.equipped[unit.id];
 const seen=new Set<string>();
 return (world.shieldState?.spares?.[unit.id]??[]).filter(ref=>ref.kind==='shield' && ref.key!==equipped?.key && !!shieldItem(world,ref.key) && !seen.has(ref.key) && !!seen.add(ref.key));
}
function shieldAlreadyOwned(world:World,key:string):boolean {
 const state=world.shieldState;
 return Object.values(state?.equipped??{}).some(ref=>ref.kind==='shield' && ref.key===key) ||
  Object.values(state?.spares??{}).some(refs=>refs.some(ref=>ref.kind==='shield' && ref.key===key));
}
export function shieldReservedBy(world:World,key:string):string|null {
 return Object.entries(world.shieldState?.pickups??{}).find(([,job])=>job.key===key)?.[0]??null;
}
/** Both lists are stable: ties on generation or acquisition retain stored order. */
export function sortedGroundShields(world:World,keys:string[]):string[] {
 return keys.filter(key=>!!shieldItem(world,key)).sort((a,b)=>{
  const x=shieldItem(world,a)!,y=shieldItem(world,b)!;
  return y.hp-x.hp || x.maxHp-y.maxHp || (BigInt(x.generationOrder)<BigInt(y.generationOrder)?-1:BigInt(x.generationOrder)>BigInt(y.generationOrder)?1:0);
 });
}
export function pickupActive(world:World,unitId:string):boolean {return !!world.shieldState?.pickups?.[unitId];}
export function cancelShieldPickup(world:World,unitId:string):void {if(world.shieldState?.pickups)delete world.shieldState.pickups[unitId];}
export function startShieldPickup(world:World,unit:Unit,key:string):'started'|'busy'|'full'|'far'|'none' {
 const state=world.shieldState,at=state?.ground[key];
 if(!state || !at || !shieldItem(world,key) || shieldAlreadyOwned(world,key) || world.phase!=='sortie' || world.operationTimedOut || !unit.alive || wreckCarrierId(world,unit.id))return 'none';
 const owner=shieldReservedBy(world,key);
 if(owner && owner!==unit.id){notify(world,SHIELD_BUSY_MESSAGE);return 'busy';}
 if(dist(unit.pos,at)>unit.radius*2)return 'far';
 if(roomFor(world,unit)<1){notify(world,SHIELD_FULL_MESSAGE,true);return 'full';}
 interruptStripping(world,unit.id);
 if(world.circuitPlay?.wreckChannel)delete world.circuitPlay.wreckChannel[unit.id];
 unit.salvageId=null;unit.salvageT=0;
 state.pickups??={};
 state.pickups[unit.id]={key,until:world.elapsed+SHIELD_WORK_SECONDS};
 return 'started';
}
/** Called only when the equipped shield breaks, not on voluntary disposal. */
export function beginShieldExchange(world:World,unit:Unit):void {
 const state=world.shieldState;
 if(!state || !unit.alive || state.exchanges?.[unit.id])return;
 const chosen=spareShields(world,unit).map(ref=>({ref,item:shieldItem(world,ref.key)!})).sort((a,b)=>b.item.hp-a.item.hp || a.item.maxHp-b.item.maxHp)[0];
 if(!chosen)return;
 state.exchanges??={};state.exchanges[unit.id]={key:chosen.ref.key,until:world.elapsed+SHIELD_WORK_SECONDS};
}
/** Actual post-movement positions, capacity and survival decide completion.
 * Deadlines use simulation time, so reload resumes without offline progression.
 */
export function tickShieldOperations(world:World):void {
 const state=world.shieldState;if(!state)return;
 const units=[world.leader,...world.wingmen,...world.enemies];
 for(const [unitId,job] of Object.entries(state.pickups??{})) {
  const unit=units.find(u=>u.id===unitId),at=state.ground[job.key];
  if(world.phase!=='sortie' || world.operationTimedOut || !unit?.alive || wreckCarrierId(world,unitId) || !at || !shieldItem(world,job.key) || shieldAlreadyOwned(world,job.key) || dist(unit.pos,at)>unit.radius*2){delete state.pickups![unitId];continue;}
  if(world.elapsed<job.until)continue;
  delete state.pickups![unitId];
  if(roomFor(world,unit)<1){notify(world,SHIELD_FULL_MESSAGE,true);continue;}
  delete state.ground[job.key];
  const ref:FieldObjectReference={kind:'shield',key:job.key};
  if(!equippedShield(world,unit) && !state.exchanges?.[unitId])state.equipped[unitId]=ref;
  else {state.spares??={};state.spares[unitId]??=[];state.spares[unitId]!.push(ref);}
  pushLog(world,'盾を回収しました');
 }
 for(const [unitId,job] of Object.entries(state.exchanges??{})) {
  const unit=units.find(u=>u.id===unitId);
  if(!unit?.alive || wreckCarrierId(world,unitId))continue; // forced drop is handled by dropUnavailableShields
  if(world.phase!=='sortie' || world.elapsed<job.until)continue;
  delete state.exchanges![unitId];
  if(!spareShields(world,unit).some(ref=>ref.key===job.key))continue;
  state.spares![unitId]=state.spares![unitId]!.filter(ref=>ref.key!==job.key);
  state.equipped[unitId]={kind:'shield',key:job.key};
 }
}
/** Reservation protects the selected spare from manual disposal. Forced loading
 * and destruction use the existing all-cargo-drop contract instead.
 */
export function dropOwnedShield(world:World,unit:Unit,key:string,forced=false):boolean {
 const state=world.shieldState;if(!state || !shieldItem(world,key) || (!forced && state.exchanges?.[unit.id]?.key===key))return false;
 const equipped=state.equipped[unit.id]?.key===key,spare=spareShields(world,unit).some(ref=>ref.key===key);
 if(!equipped && !spare)return false;
 if(equipped)delete state.equipped[unit.id];
 if(state.spares?.[unit.id])state.spares[unit.id]=state.spares[unit.id]!.filter(ref=>ref.key!==key);
 if(state.exchanges?.[unit.id]?.key===key)delete state.exchanges[unit.id];
 state.ground[key]={...unit.pos};return true;
}
export function dropAllOwnedShields(world:World,unit:Unit,forced=false):void {
 const equipped=equippedShield(world,unit);
 const keys=[...(equipped?[equipped.key]:[]),...spareShields(world,unit).map(ref=>ref.key)];
 for(const key of keys)dropOwnedShield(world,unit,key,forced);
 cancelShieldPickup(world,unit.id);
}
