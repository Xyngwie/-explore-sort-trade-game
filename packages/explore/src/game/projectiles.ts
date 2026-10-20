import { wallEntries } from "./barricades";
import { wallContact } from "./barricadeGeometry";
import { isWingmanMobileFor } from "./commandUnlock";
import { movementLocked } from "./circuitPlay";
import { wreckCarrierId } from "./carry";
import { segmentCircle } from "./geometry";
import { getCoverObjects } from "./coverObjects";
import type { Unit, World } from "./types";
import type { Vec2 } from "./math";
export const SPREAD_DEG={normal:2,smg:5,mmr:.5,lmg:4,shotgun:2} as const;
export function spreadRadians(weapon: string|null, rng:()=>number=Math.random):number {
  const degrees=SPREAD_DEG[weapon as keyof typeof SPREAD_DEG]??SPREAD_DEG.normal;
  return (rng()*2-1)*degrees*Math.PI/180;
}
/** C2: cover never shrinks a body; protection is actual obstacle occlusion. */
export function hitRadius(world:World, unit:Unit):number {
  return unit.radius+world.balance.bulletHitPadding;
}
export function shotCanHit(world:World, ownerId:string, unit:Unit):boolean {
  if(!unit.alive||unit.id===ownerId)return false;
  // All outside shots hit the carrier. Passenger/carrier cannot shoot each other.
  if(wreckCarrierId(world,unit.id))return false;
  return wreckCarrierId(world,ownerId)!==unit.id;
}
export function firstShotContact(world:World, ownerId:string, a:Vec2,b:Vec2):{t:number;unit?:Unit;barricadeKey?:string}|null {
  let best:{t:number;unit?:Unit;barricadeKey?:string}|null=null;
  for(const c of getCoverObjects(world)){const t=segmentCircle(a,b,c.pos,c.radius);if(t!=null&&(!best||t<best.t))best={t};}
  for(const [key,wall] of wallEntries(world)){const hit=wallContact(wall,a,b);if(hit&&(!best||hit.t<best.t))best={t:hit.t,barricadeKey:key};}
  for(const unit of [world.leader,...world.wingmen,...world.enemies]){
    if(!shotCanHit(world,ownerId,unit))continue;
    const t=segmentCircle(a,b,unit.pos,hitRadius(world,unit));
    if(t!=null&&(!best||t<best.t))best={t,unit};
  }
  return best;
}
/** Q2A: only the unscattered muzzle line, and allies between shooter and intended enemy. */
export function friendlyFireRisk(world:World,from:Unit,target:Unit):boolean {
  if(from.kind==='enemy')return false;
  const range=Math.hypot(target.pos.x-from.pos.x,target.pos.y-from.pos.y);
  const end={x:from.pos.x+Math.cos(from.heading)*range,y:from.pos.y+Math.sin(from.heading)*range};
  const contact=firstShotContact(world,from.id,from.pos,end);
  return !!contact?.unit && contact.unit.kind!=='enemy';
}
const avoidance=new WeakMap<World,Map<string,{pos:Vec2;until:number}>>();
export function lineClearTarget(world:World,unit:Unit):Vec2|null {
  if(world.circuitPlay?.order?.kind==="focus" || movementLocked(world) || (unit.kind==="wingman" && !isWingmanMobileFor(world,unit.id)))return null;
  const rec=avoidance.get(world)?.get(unit.id);
  return rec && rec.until>world.elapsed ? rec.pos : null;
}
/** Move perpendicular to the shot; preserve explicit player movement and mounted position. */
export function clearFiringLine(world:World,unit:Unit):void {
  if(wreckCarrierId(world,unit.id) || movementLocked(world) || (unit.kind==="wingman" && !isWingmanMobileFor(world,unit.id)))return;
  if(lineClearTarget(world,unit))return;
  const side=world.wingmen.findIndex(w=>w.id===unit.id)%2===0 ? 1:-1;
  const target={x:Math.max(20,Math.min(world.balance.worldW-20,unit.pos.x-Math.sin(unit.heading)*36*side)),y:Math.max(20,Math.min(world.balance.worldH-20,unit.pos.y+Math.cos(unit.heading)*36*side))};
  const map=avoidance.get(world)??new Map();map.set(unit.id,{pos:target,until:world.elapsed+.6});avoidance.set(world,map);
}
