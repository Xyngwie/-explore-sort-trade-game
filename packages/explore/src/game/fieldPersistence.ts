import { leftBehindShieldState } from "./shieldReturn";
import {
  emptyFieldObjectIdentities, registerWreckIdentity, sameFieldLocation,
  type FieldCellReport, type FieldWreck, type HubSnapshot,
} from '@estg/shared';
import { initializeEnemy } from './enemyBehavior';
import { wreckWasStripped } from './strippingRuntime';
import type { Unit, World } from './types';

/** Stage a snapshot; startSortie's reset must run before dead enemies reappear. */
export function attachFieldPersistence(world: World, hub: HubSnapshot | null): void {
  world.fieldPersistenceEnabled=true;
  const cell=world.sortieLocation && hub?.fieldCells?.find(c=>sameFieldLocation(c.location,world.sortieLocation!));
  if (hub?.fieldObjectIdentities) world.shieldState={identities:structuredClone(hub.fieldObjectIdentities),ground:{},equipped:{}};
  if (world.shieldState) for (const m of world.strandedMechs ?? []) {
    const held=hub?.lostMechShields?.[m.instanceId];if(!held)continue;
    const id=`s:${m.instanceId}`;
    if(held.equipped)world.shieldState.equipped[id]=structuredClone(held.equipped);
    (world.shieldState.spares??={})[id]=structuredClone(held.spares);
    if(held.exchange)(world.shieldState.exchanges??={})[id]={key:held.exchange.key,until:held.exchange.remaining};
  }
  if (cell && hub?.fieldObjectIdentities) world.fieldCellAtStart={...structuredClone(cell),identities:structuredClone(hub.fieldObjectIdentities)};
}
function deadEnemy(w: FieldWreck): Unit {
  const e=w.enemy!;
  const unit:Unit = {id:w.targetId,kind:'enemy',name:e.name,pos:{...w.pos},vel:{x:0,y:0},heading:e.heading,
    hp:0,maxHp:e.maxHp,radius:e.radius,alive:false,stance:'raid',waypoint:null,moveTarget:null,
    cooldown:0,patrolAngle:0,salvageId:null,salvageT:0,salvagedCount:0,capacity:0,instanceId:null,
    inCover:false,quirk:null,hitWarnT:0,engageWarnT:0,enemyIdentity:structuredClone(e.identity)};
  initializeEnemy(unit);
  Object.assign(unit.enemyState!, {ammo:0,activity:0,cargo:0,deathHandled:true});
  return unit;
}
export function restoreFieldAtSortieStart(world: World): void {
  const saved=world.fieldCellAtStart;
  delete world.fieldCellAtStart;
  if (!saved) return;
  world.shieldState={...world.shieldState,identities:structuredClone(saved.identities),ground:structuredClone(saved.ground),equipped:world.shieldState?.equipped??{}};
  world.stripping={jobs:{},observations:[]};
  for (const w of saved.wrecks) {
    const id=w.sourceInstanceId ? `s:${w.sourceInstanceId}` : w.targetId;
    if (w.sourceInstanceId && !world.strandedMechs?.some(m=>m.instanceId===w.sourceInstanceId && m.wreck)) continue;
    if (w.enemy && !world.enemies.some(e=>e.id===id)) world.enemies.push(deadEnemy(w));
    if (w.legacyAir && world.circuitPlay) world.circuitPlay.airWrecks.push({id:id.slice(2),pos:{...w.pos},recovered:false});
    world.stripping.jobs[id]={source:{targetId:id,instanceId:w.sourceInstanceId,circuits:structuredClone(w.circuits),learningValue:null},
      wreckKey:w.wreckKey,seconds:w.seconds,reservation:null,completed:false};
  }
}
/** Snapshot only objects left on the field, never a live enemy or carried shield.
 * Pure: repeated rendering cannot allocate new IDs or advance progress. */
export function fieldCellReport(world: World): FieldCellReport | undefined {
  const cached=world.fieldReturnReport;
  const location=world.sortieLocation;
  if (!location || !world.fieldPersistenceEnabled) return undefined;
  let identities=structuredClone(world.shieldState?.identities ?? cached?.identities ?? emptyFieldObjectIdentities());
  const wrecks:FieldWreck[]=cached ? structuredClone(cached.wrecks) : [];
  const recovered=new Set([...(world.recoveredWreckUnitIds ?? []),...(world.recoveredEnemyUnits ?? []).map(e=>e.id)]);
  const lostRecovered=new Set(world.recoveredLostMechIds ?? []);
  const add=(id:string,point:{x:number;y:number},instanceId:string|null,unit?:Unit,legacyAir=false)=>{
    if (wreckWasStripped(world,id) || recovered.has(id) || (instanceId && lostRecovered.has(instanceId))) return;
    const job=world.stripping?.jobs[id];
    // Friendly wreck existence and circuits are already persisted by lostMechs.
    if (!job) return; // Owner Q3=A: only started wreck-stripping operations persist.
    if (!instanceId && !unit?.enemyIdentity && !legacyAir) return;
    const wreckKey=job?.wreckKey ?? `field-wreck:${id}`;
    if (!Object.hasOwn(identities.wrecks,wreckKey)) identities=registerWreckIdentity(identities,wreckKey);
    wrecks.push({targetId:instanceId ? `s:${instanceId}` : id,wreckKey,pos:{...point},sourceInstanceId:instanceId,
      seconds:job?.seconds ?? 0,...(legacyAir ? {legacyAir:true as const} : {}),circuits:structuredClone(job?.source.circuits ?? unit?.enemyIdentity?.circuits.map(c=>({circuitId:c.circuitId,side:c.side,effect:c.effect})) ?? []),
      ...(unit?.enemyIdentity && !instanceId ? {enemy:{name:unit.name,maxHp:unit.maxHp,radius:unit.radius,heading:unit.heading,identity:structuredClone(unit.enemyIdentity)}} : {})});
  };
  if (!cached) for (const u of [world.leader,...world.wingmen,...world.enemies]) {
    if (u.alive || u.hp > 0 || u.enemyState?.recovered) continue;
    if (u.kind==='enemy' || u.instanceId) add(u.id,u.pos,u.kind==='enemy'?null:u.instanceId,u);
  }
  if (!cached) for (const m of world.strandedMechs ?? []) if (m.wreck) add(`s:${m.instanceId}`,m.pos,m.instanceId);
  if (!cached) for (const a of world.circuitPlay?.airWrecks ?? []) if (!a.recovered && !world.enemies.some(e=>e.id===a.id)) add(`a:${a.id}`,a.pos,null,undefined,true);
  // Report only identity records referenced by this cell; counters are global.
  const ground=structuredClone(world.shieldState?.ground ?? cached?.ground ?? {});
  const ownedShields=leftBehindShieldState(world);
  identities.wrecks=Object.fromEntries(wrecks.map(w=>[w.wreckKey,identities.wrecks[w.wreckKey]!]));
  const keys=[...Object.keys(ground),...Object.values(ownedShields).flatMap(s=>[...(s.equipped?[s.equipped.key]:[]),...s.spares.map(r=>r.key)])];
  identities.shields=Object.fromEntries(keys.map(key=>[key,identities.shields[key]!]));
  identities.repairLogs=[]; // repair history already lives in HubSave, never replay it as new
  return {location:structuredClone(location),ground,wrecks,identities,ownedShields};
}
