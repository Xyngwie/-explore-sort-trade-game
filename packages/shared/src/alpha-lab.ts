import { DEBUG_FIXTURE_ACTIVE, DEBUG_META_KEY, readNormalSaveKey } from "./debug-storage";
import { HUB_SAVE_STORAGE_KEY } from "./constants";
import { INITIAL_HUB, loadHubSaveWithStatus, resolveSortieSelection, serializeHubSave, createHubSave, notifyHubSaved, type HubSnapshot } from "./hub-save";
import { SORTIE_CHECKPOINT_KEY } from "./sortie-checkpoint";
import { readSortieCheckpoint } from "./sortie-checkpoint";
import type { FieldObjectIdentities, FieldObjectReference } from "./field-object-identities";
import { buildDebugCircuit } from "./debug-circuit";
import { equipCircuit, unequipCircuit, isCircuitOnLostMech } from "./circuit-inventory";
import { classifyCircuit, type CircuitEffectKey } from "./circuit-actions";

declare const __GAME_VERSION__: string;
export const ALPHA_LAB_VERSION = typeof __GAME_VERSION__ === "undefined" ? "alpha-lab-319" : __GAME_VERSION__;
export type LabUnit = {id:string;name:string;instanceId:string|null;hp:number;maxHp:number;ammo:number;ammoMax:number;battery:number;batteryMax:number;load:number;capacity:number};
export type LabShield = {key:string;shieldId:string;hp:number;maxHp:number;where:string;sourceWreckId?:string;generationOrder?:string;pos?:{x:number;y:number};heading?:number};
export type LabAction =
 | {kind:"unit";unitId:string;hp:number;ammo:number;battery:number}
 | {kind:"shield-create";unitId:string;where:"equipped"|"reserve"|"ground";hp:number;maxHp:number}
 | {kind:"shield-hp";key:string;hp:number;maxHp:number}
 | {kind:"shield-delete";key:string}
 | {kind:"shield-move";key:string;unitId:string;where:"equipped"|"reserve"|"ground"}
 | {kind:"sync-circuits"};
export interface AlphaLabHost {
  view(): {units:LabUnit[];shields:LabShield[];phase:string;work?:unknown};
  prepare(action:LabAction,hub:HubSnapshot): unknown;
  commit(world:unknown): void;
  pause?(): boolean;
}
export function labOwnerLabel(hub:HubSnapshot,id:string,units:LabUnit[]=[]):string {
  const current=units.find(u=>u.instanceId===id);if(current)return current.name;
  if(hub.lostMechs?.some(m=>m.instanceId===id))return "置き去り機";
  const index=resolveSortieSelection(hub).indexOf(id);
  return index===0?"隊長機":index>0?`僚機${index}`:`格納庫機${hub.fleet.findIndex(m=>m.instanceId===id)+1}`;
}
export function labNumber(value: unknown, integer = false, max = Number.MAX_VALUE): number {
  if ((typeof value!=="number"&&typeof value!=="string") || typeof value==="string"&&!value.trim()) throw new Error("数値を入力してください");
  const n=Number(value),bound=integer?Math.min(max,Number.MAX_SAFE_INTEGER):max;
  if(!Number.isFinite(n)||n<0||n>bound||(integer&&!Number.isSafeInteger(n)))throw new Error(`0〜${bound}の${integer?"安全な整数":"有限数"}を入力してください`);
  return n;
}
export function labHub(): HubSnapshot {
  const r=loadHubSaveWithStatus();
  if(r.status==="newer_read_only"||r.status==="corrupt_backed_up"||r.droppedCircuits)throw new Error("実験セーブを安全に読み込めません");
  return r.save?.hub??structuredClone(INITIAL_HUB);
}
export function editLabCredits(hub:HubSnapshot,value:unknown,operation:"set"|"add"|"zero"|"initial"):HubSnapshot {
  const n=operation==="zero"?0:operation==="initial"?INITIAL_HUB.credits:labNumber(value,true);
  const credits=labNumber(operation==="add"?hub.credits+n:n,true);
  return {...hub,credits};
}
export function createLabCircuit(hub:HubSnapshot,key:CircuitEffectKey,trueBoard:boolean,online:boolean,owner:string|null,id=`lab-circuit-${crypto.randomUUID()}`):HubSnapshot {
  if(hub.circuits.some(c=>c.circuitId===id))throw new Error("回路IDが重複しています");
  const rec=buildDebugCircuit(id,null,key,trueBoard,online);
  const next={...hub,circuits:[...hub.circuits,rec]};
  if(!owner)return next;
  const r=equipCircuit(next,id,owner);
  if(!r.ok)throw new Error(`装備できません（${r.reason}）。装備枠・カテゴリ・対象機体を確認してください`);
  return r.hub;
}
export function changeLabCircuit(hub:HubSnapshot,id:string,operation:"equip"|"unequip"|"delete",owner:string|null):HubSnapshot {
  const rec=hub.circuits.find(c=>c.circuitId===id);
  if(!rec)throw new Error("回路が見つかりません");
  if(isCircuitOnLostMech(hub,rec))throw new Error("置き去り機の回路は機体を回収してから変更してください");
  if(operation==="equip"){
    if(!owner)throw new Error("装備先を選択してください");const r=equipCircuit(hub,id,owner);if(!r.ok)throw new Error(`装備できません（${r.reason}）`);return r.hub;
  }
  const next=unequipCircuit(hub,id);
  if(operation==="unequip")return next;
  if(!id.startsWith("lab-circuit-")&&!id.startsWith("debug-"))throw new Error("削除できるのは実験室で生成した検証用回路だけです");
  return {...next,circuits:next.circuits.filter(c=>c.circuitId!==id)};
}

/** Persist hub + checkpoint atomically from the UI's perspective; roll back on failure. */
export function commitLabEdit(hub:HubSnapshot,host?:AlphaLabHost,action:LabAction={kind:"sync-circuits"},store:Storage=localStorage):void {
  if(!DEBUG_FIXTURE_ACTIVE)throw new Error("実験室の外では変更できません");
  const staged=structuredClone(hub),world=host?.prepare(action,staged);
  const oldMeta=store.getItem(DEBUG_META_KEY);
  const oldSave=store.getItem(HUB_SAVE_STORAGE_KEY);
  const circuitsChanged=JSON.stringify(oldSave?JSON.parse(oldSave).hub?.circuits:[])!==JSON.stringify(staged.circuits);
  try {
    if(!host&&circuitsChanged)store.setItem(DEBUG_META_KEY,JSON.stringify({...JSON.parse(oldMeta??"{}"),pendingCircuitSync:true}));
    persistLabPair(staged,world,store);
  } catch(e) {if(oldMeta===null)store.removeItem(DEBUG_META_KEY);else store.setItem(DEBUG_META_KEY,oldMeta);throw e;}
  if(world)host!.commit(world);
}
export function persistLabPair(hub:HubSnapshot,world:unknown,store:Storage):void {
  const beforeHub=store.getItem(HUB_SAVE_STORAGE_KEY),beforeCheckpoint=store.getItem(SORTIE_CHECKPOINT_KEY);
  const restore=(key:string,v:string|null)=>v===null?store.removeItem(key):store.setItem(key,v);
  try {
    store.setItem(HUB_SAVE_STORAGE_KEY,serializeHubSave(createHubSave(hub)));
    if(world && (world as {phase:string}).phase!=="briefing")store.setItem(SORTIE_CHECKPOINT_KEY,JSON.stringify({v:1,kind:(world as {phase:string}).phase==="result"?"result":"sortie",body:world}));
  } catch(e) {try{restore(HUB_SAVE_STORAGE_KEY,beforeHub);restore(SORTIE_CHECKPOINT_KEY,beforeCheckpoint);}catch{/* report failure; never fall back to normal */}throw new Error(`実験状態を保存できませんでした：${String(e)}`);}
  if(store===globalThis.localStorage)notifyHubSaved();
}
/** Confirmed copy uses only getItem on the normal area. Never migrate/write it. */
export function copyNormalSaveToLab():void {
  if(!DEBUG_FIXTURE_ACTIVE)throw new Error("実験室の外では使用できません");
  const r=loadHubSaveWithStatus({getItem:readNormalSaveKey});
  if(!r.save||!["ok","migrated"].includes(r.status)||r.droppedCircuits)throw new Error("コピー可能な通常セーブがありません。新しい版・破損データはコピーできません");
  const text=serializeHubSave(createHubSave(r.save.hub));
  const snapshot=(s:Storage)=>Array.from({length:s.length},(_,i)=>s.key(i)).filter((k):k is string=>k!==null).map(k=>[k,s.getItem(k)!]as const);
  const previous=snapshot(localStorage),previousSession=snapshot(sessionStorage);
  try {
    localStorage.setItem(HUB_SAVE_STORAGE_KEY,text);
    for(const key of Object.keys(localStorage))if(key!==HUB_SAVE_STORAGE_KEY)localStorage.removeItem(key);
    sessionStorage.clear();
    localStorage.setItem(DEBUG_META_KEY,JSON.stringify({type:"ALPHA_LAB",preset:"NORMAL_SAVE_COPY",run:crypto.randomUUID(),createdAt:new Date().toISOString(),DEBUG_FIXTURE:true}));
  } catch(e) {try{localStorage.clear();for(const[k,v]of previous)localStorage.setItem(k,v);sessionStorage.clear();for(const[k,v]of previousSession)sessionStorage.setItem(k,v);}catch{/* never fall back to normal */}throw new Error(`コピーを保存できませんでした：${String(e)}`);}
}

/** Curated evidence: no raw URL, storage dump, signatures or geolocation. */
export function alphaLabEvidence(host?:AlphaLabHost):unknown {
  const hub=labHub(),meta=JSON.parse(localStorage.getItem(DEBUG_META_KEY)??"{}"),runtime=host?.view();
  const circuits=hub.circuits.map(c=>({id:c.circuitId,effectKey:c.effectKey??null,effect:classifyCircuit(c).effect,restoreState:c.restoreState,equippedTo:c.equippedTo,size:c.circuitBoard.cols}));
  return {type:"ALPHA_LAB",runId:meta.run??null,timestamp:new Date().toISOString(),preset:meta.preset??null,experimentMode:"ISOLATED_EXPERIMENT",gameVersion:ALPHA_LAB_VERSION,DEBUG_FIXTURE:true,
    units:runtime?.units??hub.fleet.map(m=>({id:m.instanceId,hp:m.durability,maxHp:m.durabilityMax,ammo:m.currentAmmo,battery:m.battery})),circuits,shields:runtime?.shields??savedLabShields(hub),
    currentModule:location.pathname,saveState:{credits:hub.credits,inventory:hub.inventory,fleet:hub.fleet.map(m=>({instanceId:m.instanceId,catalogId:m.catalogId,status:m.status,durability:m.durability,currentAmmo:m.currentAmmo,battery:m.battery})),checkpointPresent:localStorage.getItem(SORTIE_CHECKPOINT_KEY)!==null,phase:runtime?.phase??null,work:runtime?.work??null}};
}

function savedLabShields(hub:HubSnapshot):LabShield[] {
  const read=readSortieCheckpoint();
  if(read.status==="unreadable")throw new Error("途中保存を読み取れないため証拠を出力できません");
  type Saved={shieldState?:{identities:FieldObjectIdentities;ground:Record<string,{x:number;y:number}>;equipped:Record<string,FieldObjectReference>;spares?:Record<string,FieldObjectReference[]>};barricades?:{walls:Record<string,{pos:{x:number;y:number};heading:number}>}};
  const w=(read.status==="ok"&&read.record.kind!=="done"?read.record.body:null) as Saved|null,s=w?.shieldState;
  const registry=s?.identities??hub.fieldObjectIdentities;
  return Object.entries(registry?.shields??{}).map(([key,i])=>{
    let where=s?.ground[key]?"地面":w?.barricades?.walls[key]?"設置盾":"";
    if(!where)for(const[id,r]of Object.entries(s?.equipped??{}))if(r.key===key)where=id+" 装備";
    if(!where)for(const[id,rs]of Object.entries(s?.spares??{}))if(rs.some(r=>r.key===key))where=id+" 予備";
    if(!where)for(const c of hub.fieldCells??[])if(c.ground[key]||c.barricades?.[key])where=`マス(${c.location.cell.sx},${c.location.cell.sy}) ${c.ground[key]?"地面":"設置盾"}`;
    if(!where)for(const[id,held]of Object.entries(hub.lostMechShields??{}))if(held.equipped?.key===key||held.spares.some(r=>r.key===key))where=id+" 置き去り機";
    return {key,shieldId:i.shieldId,sourceWreckId:i.sourceWreckId,generationOrder:i.generationOrder,hp:Number(i.hp),maxHp:Number(i.maxHp),where:where||"所在未確認"};
  });
}
