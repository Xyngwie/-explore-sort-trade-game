import type { LostMechShieldMap } from '@estg/shared';
import { dropAllOwnedShields, spareShields } from './shieldOperations';
import { dropUnavailableShields, equippedShield } from './shields';
import { shieldOwnerUnits } from './shieldOwners';
import type { World } from './types';
/** Called only after the existing terminal mech classification is known.
 * No change to boarding, losses or rescue costs; shield settlement is once. */
export function settleReturnedShields(world:World):void {
  if(world.shieldReturnSettled)return;
  world.shieldReturnSettled=true;
  dropUnavailableShields(world);
  const left=new Set((world.leftBehind??[]).map(m=>m.id));
  const recovered=new Set(world.recoveredLostMechIds??[]);
  for(const unit of shieldOwnerUnits(world)){
    if(unit.kind==='enemy')continue;
    const stranded=unit.id.startsWith('s:');
    const stays=unit.alive && (stranded ? !recovered.has(unit.instanceId!) : left.has(unit.id));
    if(!stays)dropAllOwnedShields(world,unit,true);
  }
  if(world.shieldState)world.shieldState.pickups={};
}
export function leftBehindShieldState(world:World):LostMechShieldMap {
  const result:LostMechShieldMap=Object.create(null),left=new Set((world.leftBehind??[]).map(m=>m.id));
  const recovered=new Set(world.recoveredLostMechIds??[]);
  for(const u of shieldOwnerUnits(world)){
    if(u.kind==='enemy'||!u.alive||!u.instanceId)continue;
    if(u.id.startsWith('s:') ? recovered.has(u.instanceId) : !left.has(u.id))continue;
    const equipped=equippedShield(world,u),spares=spareShields(world,u),exchange=world.shieldState?.exchanges?.[u.id];
    if(!equipped&&!spares.length)continue;
    result[u.instanceId]={...(equipped?{equipped:{kind:'shield',key:equipped.key}}:{}),spares:structuredClone(spares),
      ...(exchange?{exchange:{key:exchange.key,remaining:Math.max(0,Math.min(2,exchange.until-world.elapsed))}}:{})};
  }
  return result;
}
