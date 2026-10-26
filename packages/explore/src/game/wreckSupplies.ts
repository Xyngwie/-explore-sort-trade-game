import { compactYieldBag } from "@estg/shared";
/** Known new death transitions only: never infer drops from a legacy dead checkpoint. */
import { effectiveBatteryCapacity } from './circuitPlay';
import { splitSupplyDrops } from './enemyBehavior';
import type { Unit, World } from './types';
export function dropFriendlyWreckSupplies(world:World,unit:Unit,remainingArmorHp=0):void {
  if(unit.kind==='enemy'||!unit.instanceId||unit.wreckSuppliesDropped)return;
  const id=unit.instanceId,b=world.mechBattery[id];
  const ammo=Math.max(0,world.currentAmmo[id]??0);
  const power=b?Math.max(0,b.activity/b.capacity*(effectiveBatteryCapacity(world,unit)??b.capacity)):0;
  world.enemySupplies??=[];
  world.enemySupplies.push(...splitSupplyDrops(`wreck-supply-${unit.id}`,unit.pos,ammo,power));
  // Parts use the existing integer resource normalization; no durability/maxHP scaling.
  const armor=compactYieldBag({armor:remainingArmorHp}).armor??0;
  if(armor>0)world.enemySupplies.push({id:`wreck-supply-${unit.id}-armor`,pos:{...unit.pos},ammo:0,power:0,armor,kind:"armor"});
  world.currentAmmo[id]=0;
  if(b)b.activity=0;
  unit.wreckSuppliesDropped=true;
}
