import assert from 'node:assert/strict';
import { INITIAL_HUB,createOwnedMech,makeRestoredTrueOneByOne,makeFalseOneByOne,normalizeHubSnapshot,saveHubSaveToLocalStorage,loadHubSaveFromLocalStorage,equipCircuit } from '@estg/shared';
import { createInitialHangar,sellHangarWreck,wreckSaleConfirmText,sellCircuit } from './hangar';
const values=new Map<string,string>();let writes=0;
const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{writes++;values.set(k,v);},removeItem:(k:string)=>values.delete(k)};
const dead={...createOwnedMech('mech_gen1',{instanceId:'wreck',durability:0,currentAmmo:4}),battery:{capacity:300,activity:12.5}};
const live=createOwnedMech('mech_gen1',{instanceId:'live',currentAmmo:0});
const circuits=[makeRestoredTrueOneByOne('retained-P'),makeFalseOneByOne('retained-false')].map(c=>({...c,equippedTo:'wreck',lastEditorName:'署名'}));
const hub=normalizeHubSnapshot({...INITIAL_HUB,fleet:[dead,live],credits:100,inventory:{ammo:3,power:5,armor:7},circuits,starterCircuitGranted:true,ammoBatteryRepaired:true,sortieSelection:['wreck','live']});
assert(saveHubSaveToLocalStorage(hub,store));
const state={...createInitialHangar(store),lastDeployedIds:['wreck','live']};
assert(wreckSaleConfirmText(state,'wreck')!.includes('400c'));assert(wreckSaleConfirmText(state,'wreck')!.includes('倉庫'));assert.equal(wreckSaleConfirmText(state,'live'),null);assert.equal(wreckSaleConfirmText(state,'lost'),null);
assert.equal(state.hub.fleet[0]!.currentAmmo,4,'legacy held resource is not migrated away');assert.equal(state.hub.fleet[0]!.battery.activity,12.5);
const beforeWrites=writes;const sold=sellHangarWreck(state,'wreck',store);assert.equal(writes-beforeWrites,1,'one canonical save update');assert.equal(sold.hub.credits,500);assert(!sold.hub.fleet.some(m=>m.instanceId==='wreck'));assert.deepEqual(sold.hub.inventory,state.hub.inventory,'no resource refund including legacy residual ammo/power');
for(const c of state.hub.circuits){const after=sold.hub.circuits.find(x=>x.circuitId===c.circuitId)!;assert.deepEqual(after,{...c,equippedTo:null});}
assert(!sold.selectedDeployIds.includes('wreck'));assert(!sold.lastDeployedIds.includes('wreck'));assert(!sold.hub.sortieSelection?.includes('wreck'));
const twice=sellHangarWreck(state,'wreck',store);assert.equal(twice.hub.credits,500,'even a stale pre-sale state cannot sell twice');assert.equal(loadHubSaveFromLocalStorage(store)!.hub.credits,500);
const reload=createInitialHangar(store);assert.equal(sellHangarWreck(reload,'wreck',store).hub.credits,500);
const reequipped=equipCircuit(sold.hub,'retained-P','live');assert(reequipped.ok);assert.equal(reequipped.hub.circuits.find(c=>c.circuitId==='retained-P')!.equippedTo,'live');
const otherSale=sellCircuit({...sold,hub:sold.hub},'retained-false');assert(otherSale.hub.credits>sold.hub.credits,'retained circuits can sell separately');
assert.equal(sellHangarWreck(sold,'live',store).hub.credits,500);
assert(saveHubSaveToLocalStorage(hub,store));const refused=sellHangarWreck(state,'wreck',{...store,setItem:()=>{throw Error('quota');}});assert.equal(refused.hub,state.hub);assert(refused.notice.includes('保存できません'));assert.equal(loadHubSaveFromLocalStorage(store)!.hub.credits,100);
console.log('Wreck sale: 400 once, single save, no supplies, exact circuit retention/re-equip/sell, stale/reload/live/missing/quota PASS');

const withLost=normalizeHubSnapshot({...hub,lostMechs:[{instanceId:'lost-wreck',kind:'wreck',currentAmmo:0,battery:{capacity:300,activity:0},circuitIds:[],durability:0,status:'destroyed'}]});
assert(saveHubSaveToLocalStorage(withLost,store));const lostState=createInitialHangar(store);const noLostSale=sellHangarWreck(lostState,'lost-wreck',store);assert.equal(noLostSale.hub.credits,100);assert(noLostSale.hub.lostMechs.some(m=>m.instanceId==='lost-wreck'));
