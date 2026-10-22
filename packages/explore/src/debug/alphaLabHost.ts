import { DEBUG_FIXTURE_ACTIVE, DEBUG_META_KEY, loadHubSaveFromLocalStorage, readSortieCheckpoint, writeSortieCheckpoint, labNumber, type AlphaLabHost, type HubSnapshot, type LabAction } from "@estg/shared";
import { attachCircuitPlay, abilityFromLoadout, sortieAmmoCap, usableAmmo, placeCarried } from "../game/circuitPlay";
import { unitLoad, unitLoadCap, roomFor, wreckCarrierId } from "../game/carry";
import { worldFromCheckpointBody } from "../game/checkpoint";
import { dropUnavailableShields } from "../game/shields";
import { cancelShieldPickup } from "../game/shieldOperations";
import { interruptBarricade } from "../game/barricades";
import { interruptStripping } from "../game/strippingRuntime";
import { expireEmptyBatteries } from "../game/power";
import { dropUnitCargoToField } from "../game/orders";
import { registerWreckIdentity, shieldIdentityFromWreck, emptyFieldObjectIdentities } from "@estg/shared";
import type { World } from "../game/types";

/** HUB edits update a paused sortie only when an explicit circuit edit requested it. */
export function applyPendingLabCircuits():void {
  if(!DEBUG_FIXTURE_ACTIVE)return;
  const meta=JSON.parse(localStorage.getItem(DEBUG_META_KEY)??"{}");if(!meta.pendingCircuitSync)return;
  const read=readSortieCheckpoint(),hub=loadHubSaveFromLocalStorage()?.hub;
  if(read.status==="ok"&&read.record.kind!=="done"&&hub){
    const w=worldFromCheckpointBody(read.record.body);if(!w)throw new Error("実験室の途中保存を読み込めません");
    const next=prepareLabWorld(w,{kind:"sync-circuits"},hub);
    if(!writeSortieCheckpoint({v:1,kind:read.record.kind,body:next}))throw new Error("回路変更を途中保存へ反映できません");
  }
  delete meta.pendingCircuitSync;localStorage.setItem(DEBUG_META_KEY,JSON.stringify(meta));
}

function syncCircuits(w:World,hub:HubSnapshot):void {
  const p=w.circuitPlay;if(!p)return;
  const staged=structuredClone(w);attachCircuitPlay(staged,hub,p.release);
  const next=staged.circuitPlay!;
  for(const u of [w.leader,...w.wingmen])if(w.stripping?.jobs[u.id]?.completed||w.stripping?.observations.some(o=>o.targetId===u.id))next.loadout[u.id]=[];
  const changed=JSON.stringify(p.loadout)!==JSON.stringify(next.loadout);
  if(!changed)return;
  for(const u of [w.leader,...w.wingmen]) {interruptBarricade(w,u.id);interruptStripping(w,u.id);cancelShieldPickup(w,u.id);}
  p.loadout=next.loadout;p.ability=abilityFromLoadout(p.loadout);p.captainOneByOne=next.captainOneByOne;p.captainTrueOne=next.captainTrueOne;p.wingTrueOne=next.wingTrueOne;p.wingFalseOne=next.wingFalseOne;
  p.pending=null;p.order=null;p.ammoFloor={};p.ammoCapAt={};
  for(const u of [w.leader,...w.wingmen])w.circuitIdsByUnit[u.id]=(p.loadout[u.id]??[]).map(c=>c.circuitId);
}

export function prepareLabWorld(original:World,action:LabAction,hub:HubSnapshot):World {
  if(action.kind!=="sync-circuits" && original.phase!=="sortie")throw new Error("盾・機体の直接編集は出撃中に行ってください");
  const w=structuredClone(original);syncCircuits(w,hub);
  const units=[w.leader,...w.wingmen];
  if(action.kind==="unit") {
    const u=units.find(u=>u.id===action.unitId),mech=u?.instanceId?hub.fleet.find(m=>m.instanceId===u.instanceId):null;
    if(!u||!mech)throw new Error("編集可能な機体が見つかりません");
    const hp=labNumber(action.hp,false,u.maxHp),ammo=labNumber(action.ammo,true,sortieAmmoCap(w,u)),battery=labNumber(action.battery,false,mech.battery.capacity);
    u.hp=hp;u.alive=hp>0;
    w.currentAmmo[mech.instanceId]=ammo;(w.circuitPlay!.ammoFloor??={})[mech.instanceId]=0;
    w.mechBattery[mech.instanceId]={...mech.battery,activity:battery};
    mech.currentAmmo=ammo;mech.battery.activity=battery;
    // HP is sortie-local. Return wear/durability still uses the normal contract.
    interruptBarricade(w,u.id);interruptStripping(w,u.id);cancelShieldPickup(w,u.id);
    expireEmptyBatteries(w);dropUnavailableShields(w);placeCarried(w);
    for(const dead of units)if(!dead.alive)dropUnitCargoToField(w,dead);
  }
  if(action.kind.startsWith("shield-")) {
    w.shieldState??={identities:emptyFieldObjectIdentities(),equipped:{},ground:{}};
    const s=w.shieldState;
    if(action.kind!=="shield-create"&&"key" in action){
      const local=s.ground[action.key]||w.barricades?.walls[action.key]||Object.values(s.equipped).some(r=>r.key===action.key)||Object.values(s.spares??{}).some(rs=>rs.some(r=>r.key===action.key));
      if(!local)throw new Error("現在の戦場で所在を確認できる盾だけを編集できます。別マスや置き去り機の盾は現地で確認してください");
    }
    if(action.kind==="shield-create") {
      if(!["equipped","reserve","ground"].includes(action.where))throw new Error("盾の所在が不正です");
      const u=units.find(u=>u.id===action.unitId);if(!u)throw new Error("配置先の機体を選んでください");
      const hp=labNumber(action.hp),maxHp=labNumber(action.maxHp);if(maxHp<=0||hp>maxHp)throw new Error("HPは0〜最大HP、最大HPは正数にしてください");
      if(action.where!=="ground"&&(!u.alive||wreckCarrierId(w,u.id)))throw new Error("生存して搭載されていない機体を選んでください");
      if(action.where==="equipped"&&s.equipped[u.id])throw new Error("装備盾があります。先に投棄・削除してください");
      if(action.where!=="ground"&&roomFor(w,u)<1)throw new Error("積載枠が足りません。既存の積荷は自動投棄しません");
      const key=`lab-shield-${crypto.randomUUID()}`,source=`lab-source-${crypto.randomUUID()}`;
      s.identities=registerWreckIdentity(s.identities,source);s.identities=shieldIdentityFromWreck(s.identities,source,key,{hp,maxHp});
      if(hp===0)delete s.identities.shields[key];
      else if(action.where==="ground")s.ground[key]={...u.pos};
      else if(action.where==="equipped")s.equipped[u.id]={kind:"shield",key};
      else(s.spares??={})[u.id]=[...(s.spares?.[u.id]??[]),{kind:"shield",key}];
    } else if(action.kind==="shield-move") {
      if(!["equipped","reserve","ground"].includes(action.where))throw new Error("盾の所在が不正です");
      if(!s.identities.shields[action.key])throw new Error("盾が見つかりません");
      if(w.barricades?.walls[action.key])throw new Error("設置盾は既存の撤去コマンドで地面へ戻してください");
      const u=units.find(u=>u.id===action.unitId);if(!u)throw new Error("対象機体を選択してください");
      for(const owner of units){if(s.equipped[owner.id]?.key===action.key)delete s.equipped[owner.id];if(s.spares?.[owner.id])s.spares[owner.id]=s.spares[owner.id]!.filter(r=>r.key!==action.key);cancelShieldPickup(w,owner.id);if(s.exchanges?.[owner.id]?.key===action.key)delete s.exchanges[owner.id];if(w.barricades?.jobs[owner.id]?.key===action.key)interruptBarricade(w,owner.id);}
      delete s.ground[action.key];
      if(action.where!=="ground"&&(!u.alive||wreckCarrierId(w,u.id)||roomFor(w,u)<1))throw new Error("対象機体の生存・搭載状態・積載枠を確認してください");
      if(action.where==="equipped"){if(s.equipped[u.id])throw new Error("装備盾があります");s.equipped[u.id]={kind:"shield",key:action.key};}
      else if(action.where==="reserve")(s.spares??={})[u.id]=[...(s.spares?.[u.id]??[]),{kind:"shield",key:action.key}];
      else s.ground[action.key]={...u.pos};
    } else if(action.kind==="shield-hp"||action.kind==="shield-delete") {
      const item=s.identities.shields[action.key];if(!item)throw new Error("盾が見つかりません");
      let destroy=action.kind==="shield-delete";
      if(action.kind==="shield-hp") {const hp=labNumber(action.hp),max=labNumber(action.maxHp);if(max<=0||hp>max)throw new Error("HPは0〜最大HP、最大HPは正数にしてください");item.hp=hp;item.maxHp=max;destroy=hp===0;}
      if(destroy){
        delete s.ground[action.key];delete s.identities.shields[action.key];if(w.barricades)delete w.barricades.walls[action.key];
        for(const u of units){if(s.equipped[u.id]?.key===action.key)delete s.equipped[u.id];if(s.spares?.[u.id])s.spares[u.id]=s.spares[u.id]!.filter(r=>r.key!==action.key);if(s.pickups?.[u.id]?.key===action.key)delete s.pickups[u.id];if(s.exchanges?.[u.id]?.key===action.key)delete s.exchanges[u.id];if(w.barricades?.jobs[u.id]?.key===action.key)interruptBarricade(w,u.id);}
      }
    }
  }
  if(!worldFromCheckpointBody(structuredClone(w)))throw new Error("編集後の途中保存が不正です。変更は保存しません");
  return w;
}

export function createAlphaLabHost(get:()=>World,commit:(w:World)=>void,pause:()=>boolean):AlphaLabHost {
  return {
    view(){const w=get(),s=w.shieldState;return {phase:w.phase,work:{construction:w.barricades?.jobs,stripping:w.stripping,pickups:s?.pickups,exchanges:s?.exchanges},units:[w.leader,...w.wingmen].map(u=>({id:u.id,name:u.name,instanceId:u.instanceId,hp:u.hp,maxHp:u.maxHp,ammo:usableAmmo(w,u),ammoMax:sortieAmmoCap(w,u),battery:u.instanceId?w.mechBattery[u.instanceId]?.activity??0:0,batteryMax:u.instanceId?w.mechBattery[u.instanceId]?.capacity??300:300,load:unitLoad(w,u),capacity:unitLoadCap(w,u)})),shields:Object.entries(s?.identities.shields??{}).map(([key,i])=>({key,shieldId:i.shieldId,sourceWreckId:i.sourceWreckId,generationOrder:i.generationOrder,hp:Number(i.hp),maxHp:Number(i.maxHp),pos:s?.ground[key]??w.barricades?.walls[key]?.pos,heading:w.barricades?.walls[key]?.heading,where:s?.ground[key]?"地面":w.barricades?.walls[key]?"設置盾":Object.entries(s?.equipped??{}).find(([,r])=>r.key===key)?.[0]?`${Object.entries(s?.equipped??{}).find(([,r])=>r.key===key)![0]} 装備`:"不明"})).map(item=>{const owner=Object.entries(s?.spares??{}).find(([,rs])=>rs.some(r=>r.key===item.key));return owner?{...item,where:`${owner[0]} 予備`}:item;})};},
    prepare(action,hub){if(!DEBUG_FIXTURE_ACTIVE)throw new Error("実験室の外では使用できません");return prepareLabWorld(get(),action,hub);},
    commit(raw){const w=worldFromCheckpointBody(raw);if(!w)throw new Error("途中保存が不正です");commit(w);},pause,
  };
}
