import assert from "node:assert/strict";
import { INITIAL_HUB, createOwnedMech, normalizeHubSnapshot, saveHubSaveToLocalStorage, loadHubSaveFromLocalStorage, chargeMechPower, buildTradeToExploreUrl, buildTradeToExplorePayloadFromFleet, parseTradeToExploreSearch, applyExploreReturnToHub } from "@estg/shared";
import { createInitialHangar, chargeMech } from "./hangar";
function storage() {
 const map=new Map<string,string>();return {getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>map.set(k,v),removeItem:(k:string)=>map.delete(k),clear:()=>map.clear(),key:(i:number)=>[...map.keys()][i]??null,get length(){return map.size;}};
}
const a=createOwnedMech('mech_gen1',{instanceId:'a'}),b=createOwnedMech('mech_gen1',{instanceId:'b'});
const hub=normalizeHubSnapshot({...INITIAL_HUB,fleet:[{...a,battery:{capacity:300,activity:250.5}},b],inventory:{power:30},ammoBatteryRepaired:true});
const partial=chargeMechPower(hub,'a');assert.equal(partial.spent,30);assert.equal(partial.gained,30);assert.equal(partial.hub.fleet[0]!.battery.activity,280.5);assert.equal(partial.hub.inventory.power,0);
assert.deepEqual(partial.hub.fleet[1],hub.fleet[1],'other mech unchanged');assert.equal(partial.hub.credits,hub.credits);
assert.equal(chargeMechPower(partial.hub,'a').reason,'no_power');assert.equal(chargeMechPower(hub,'b').reason,'full');assert.equal(chargeMechPower(hub,'ghost').reason,'no_mech');
const full=chargeMechPower({...partial.hub,inventory:{power:20}},'a');assert.equal(full.spent,20);assert.equal(full.hub.fleet[0]!.battery.activity,300,'last whole part caps at capacity');
const store=storage();assert.ok(saveHubSaveToLocalStorage(hub,store));const state=createInitialHangar(store);
const refused=chargeMech(state,'a',{setItem:()=>{throw Error('quota');}});assert.equal(refused.hub,state.hub);assert.ok(refused.notice.includes('保存できません'));assert.equal(loadHubSaveFromLocalStorage(store)!.hub.inventory.power,30);
const charged=chargeMech(state,'a',store);assert.equal(charged.hub.fleet[0]!.battery.activity,280.5);assert.ok(charged.notice.includes('途中まで'));assert.equal(loadHubSaveFromLocalStorage(store)!.hub.fleet[0]!.battery.activity,280.5);
const payload=buildTradeToExplorePayloadFromFleet(charged.hub.fleet,0,['a']);const query=new URL(buildTradeToExploreUrl(payload,'https://example.test/')).search;
assert.equal(parseTradeToExploreSearch(query)!.mechBattery![0]!.battery.activity,280.5,'fractional battery crosses deployment URL');
const back=applyExploreReturnToHub(charged.hub,{sortieId:'power-return',returnKind:'extract',mechWear:[],mechBattery:[{instanceId:'a',battery:{capacity:300,activity:279.875}}]} as never).hub;
assert.equal(back.fleet[0]!.battery.activity,279.875,'fractional remaining power persists on return');
console.log('Manual charge, partial stock, save refusal, whole parts, fractional save and handoff PASS');
