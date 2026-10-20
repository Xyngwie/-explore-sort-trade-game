import { wreckCarrierId } from './carry';
import { getCoverObjects } from './coverObjects';
import { wallCircleOverlap, wallOverlap, type Barricade } from './barricadeGeometry';
import { equippedShield } from './shields';
import { shieldItem, cancelShieldPickup } from './shieldOperations';
import { interruptStripping } from './strippingRuntime';
import { pushLog } from './orders';
import type { World, Unit } from './types';
export type BarricadeJob = {kind:'build'|'dismantle';key:string;at:{x:number;y:number};seconds:number};
export type BarricadeState = {walls:Record<string,Barricade>;jobs:Record<string,BarricadeJob>};
export function wallEntries(w:World):[string,Barricade][] {return Object.entries(w.barricades?.walls??{});}
export function barricadeWorking(w:World,id:string):boolean {return !!w.barricades?.jobs[id];}
export function interruptBarricade(w:World,id:string):void {if(w.barricades)delete w.barricades.jobs[id];}
export function hasPShield(w:World,u:Unit):boolean {return (w.circuitPlay?.loadout[u.id]??[]).some(c=>c.effectKey==='p_shield');}
export function canBuildBarricade(w:World,u:Unit):boolean {return w.phase==='sortie'&&!w.operationTimedOut&&u.kind!=='enemy'&&u.alive&&!wreckCarrierId(w,u.id)&&hasPShield(w,u)&&!!equippedShield(w,u);}
export function placementFor(u:Unit):Barricade {return {pos:{x:u.pos.x+Math.cos(u.heading)*(u.radius+8),y:u.pos.y+Math.sin(u.heading)*(u.radius+8)},heading:u.heading};}
export function validPlacement(w:World,wall:Barricade):boolean {
 return ![w.leader,...w.wingmen,...w.enemies].some(u=>u.alive&&wallCircleOverlap(wall,u.pos,u.radius)) &&
 !getCoverObjects(w).some(c=>wallCircleOverlap(wall,c.pos,c.radius)) && !wallEntries(w).some(([,b])=>wallOverlap(wall,b));
}
function startJob(w:World,u:Unit,job:BarricadeJob):void {
 interruptStripping(w,u.id);cancelShieldPickup(w,u.id);
 if(w.circuitPlay){w.circuitPlay.pending=null;w.circuitPlay.wingSelect=null;delete w.circuitPlay.wreckChannel[u.id];}
 u.salvageId=null;u.salvageT=0;u.moveTarget=null;u.playerMoveTarget=null;u.vel={x:0,y:0};
 w.barricades??={walls:{},jobs:{}};w.barricades.jobs[u.id]=job;
}
export function startBarricade(w:World,u:Unit):boolean {
 if(!canBuildBarricade(w,u)||!validPlacement(w,placementFor(u)))return false;
 const key=equippedShield(w,u)!.key;
 startJob(w,u,{kind:'build',key,at:{...u.pos},seconds:0});return true;
}
export function startDismantle(w:World,key:string):boolean {
 const u=w.leader,b=w.barricades?.walls[key];
 if(w.phase!=='sortie'||w.operationTimedOut||!u.alive||wreckCarrierId(w,u.id)||!b||!shieldItem(w,key)||Math.hypot(u.pos.x-b.pos.x,u.pos.y-b.pos.y)>u.radius*2)return false;
 startJob(w,u,{kind:'dismantle',key,at:{...u.pos},seconds:0});return true;
}
export function cancelBarricadeJobs(w:World):void {if(w.barricades)w.barricades.jobs={};}
export function tickBarricades(w:World,dt:number):void {
 for(const [id,job] of Object.entries(w.barricades?.jobs??{})){
  const u=[w.leader,...w.wingmen].find(u=>u.id===id),wall=w.barricades!.walls[job.key];
  if(w.phase!=='sortie'||w.operationTimedOut||!u?.alive||wreckCarrierId(w,id)||u.pos.x!==job.at.x||u.pos.y!==job.at.y||!shieldItem(w,job.key)||
   (job.kind==='build' ? !canBuildBarricade(w,u)||equippedShield(w,u)?.key!==job.key : id!==w.leader.id||!wall||Math.hypot(u.pos.x-wall.pos.x,u.pos.y-wall.pos.y)>u.radius*2)) {interruptBarricade(w,id);continue;}
  job.seconds+=Math.max(0,dt);if(job.seconds<2)continue;
  if(job.kind==='build'){
   const next=placementFor(u);if(validPlacement(w,next)){delete w.shieldState!.equipped[id];w.barricades!.walls[job.key]=next;pushLog(w,'屹立：盾を設置しました');}
  }else{delete w.barricades!.walls[job.key];w.shieldState!.ground[job.key]={...wall!.pos};pushLog(w,'撤去：盾を地面に戻しました');}
  interruptBarricade(w,id);
 }
}
export function damageBarricade(w:World,key:string,damage:number):void {
 const item=shieldItem(w,key);if(!item||!w.barricades?.walls[key]||!Number.isFinite(damage)||damage<0)return;
 item.hp=Math.max(0,item.hp-damage);if(item.hp<=0){delete w.barricades.walls[key];delete w.shieldState!.identities.shields[key];for(const[id,j]of Object.entries(w.barricades.jobs))if(j.key===key)interruptBarricade(w,id);}
}

/** New checkpoints never accept two locations for one canonical shield. */
function validateBarricadeCheckpoint(w:World):boolean {
 if(!w.barricades)return true;
 const state=w.barricades;
 if(!state.walls||typeof state.walls!=='object'||Array.isArray(state.walls)||!state.jobs||typeof state.jobs!=='object'||Array.isArray(state.jobs))return false;
 const keys=[...Object.keys(w.shieldState?.ground??{}),...Object.values(w.shieldState?.equipped??{}).map(r=>r.key),...Object.values(w.shieldState?.spares??{}).flatMap(rs=>rs.map(r=>r.key)),...Object.keys(state.walls)];
 if(new Set(keys).size!==keys.length || keys.some(k=>{const item=shieldItem(w,k);return !item||item.hp>item.maxHp;}))return false;
 for(const b of Object.values(state.walls))if(!b||!b.pos||![b.pos.x,b.pos.y,b.heading].every(Number.isFinite))return false;
 for(const [id,j]of Object.entries(state.jobs)){
   const u=[w.leader,...w.wingmen].find(u=>u.id===id);
   if(!u||!j||!['build','dismantle'].includes(j.kind)||!j.at||![j.at.x,j.at.y,j.seconds].every(Number.isFinite)||j.seconds<0||j.seconds>=2)return false;
   if(j.kind==='build' ? !hasPShield(w,u)||equippedShield(w,u)?.key!==j.key : id!==w.leader.id||!state.walls[j.key])return false;
 }
 return true;
}

export function validBarricadeCheckpoint(w:World):boolean {try{return validateBarricadeCheckpoint(w);}catch{return false;}}
