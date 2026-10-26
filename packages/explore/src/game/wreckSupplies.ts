/** Known new death transitions only: never infer drops from a legacy dead checkpoint. */
import { effectiveBatteryCapacity } from './circuitPlay';
import { splitSupplyDrops } from './enemyBehavior';
import type { Unit, World } from './types';
export function dropFriendlyWreckSupplies(world:World,unit:Unit):void {
  if(unit.kind==='enemy'||!unit.instanceId||unit.wreckSuppliesDropped)return;
  const id=unit.instanceId,b=world.mechBattery[id];
  const ammo=Math.max(0,world.currentAmmo[id]??0);
  const power=b?Math.max(0,b.activity/b.capacity*(effectiveBatteryCapacity(world,unit)??b.capacity)):0;
  world.enemySupplies??=[];
  world.enemySupplies.push(...splitSupplyDrops(`wreck-supply-${unit.id}`,unit.pos,ammo,power));
  world.currentAmmo[id]=0;
  if(b)b.activity=0;
  unit.wreckSuppliesDropped=true;
}
