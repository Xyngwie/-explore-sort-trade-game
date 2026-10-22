import assert from "node:assert/strict";
import { SHIELD_PRESETS, classifyCircuit, squadEquipmentError, loadHubSaveFromLocalStorage, saveHubSaveToLocalStorage } from "@estg/shared";
import { buildShieldFixture, inspectShieldFixture } from "./shieldFixture";
import { worldFromCheckpointBody } from "../game/checkpoint";
import { unitLoad, unitLoadCap } from "../game/carry";
import { tickWorld } from "../game/sim";
import { canStripWreck } from "../game/strippingRuntime";
import { canBuildBarricade } from "../game/barricades";
for(const preset of SHIELD_PRESETS){
 const {hub,world}=buildShieldFixture(preset);
 assert.equal(squadEquipmentError(hub,hub.sortieSelection!),null,preset);
 for(const unit of [world.leader,...world.wingmen])assert(unitLoad(world,unit)<=unitLoadCap(world,unit),`${preset}: valid cargo`);
 assert(worldFromCheckpointBody(JSON.parse(JSON.stringify(world))),preset);
 const store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);}};
 assert(saveHubSaveToLocalStorage(hub,storage));const reloaded=loadHubSaveFromLocalStorage(storage)!.hub;
 assert.equal(reloaded.circuits.length,hub.circuits.length);
 for(const c of reloaded.circuits){const classified=classifyCircuit(c);assert(classified.effect>0);assert.equal(classified.effectKey,c.effectKey);assert.equal(classified.trueBoard,c.effectKey==="p_shield");}
 const inspect=inspectShieldFixture(world) as {shields:{owners:unknown[]}[]};for(const item of inspect.shields)assert.equal(item.owners.length,1);
 if(preset==="NO_SHIELD_NO_CIRCUIT"){assert.equal(hub.circuits.length,0);assert(!canStripWreck(world));assert(!canBuildBarricade(world,world.leader));}
 if(preset==="STRIPPING_READY")assert(canStripWreck(world));
 if(preset==="P_SHIELD_LEADER_READY"){assert(canBuildBarricade(world,world.leader));assert(!canStripWreck(world));}
 if(preset==="P_SHIELD_WINGMAN_READY"){assert(!canBuildBarricade(world,world.leader));assert(canBuildBarricade(world,world.wingmen[0]!));}
 if(preset==="NORMAL_SHIELD_AND_RESERVE") {
  assert.equal(world.enemies[0]!.enemyState!.ammo,28);
  for(let i=0;i<1200 && world.shieldState!.equipped.leader?.key!=="debug-reserve";i++)tickWorld(world,1/60,{move:{x:0,y:0},clickMove:null,fire:false,interact:false});
  assert.equal(world.shieldState!.equipped.leader?.key,"debug-reserve","fixture must let normal hostile fire actually trigger exchange");
 }
 if(preset==="BARRICADE_PERSISTENCE_READY"){
  assert.equal(world.stripping!.jobs["debug-wreck"]!.seconds,3);
  assert.equal(world.barricades!.jobs[world.wingmen[0]!.id]!.seconds,.75);
  const snapshot=JSON.stringify(world);
  const restored=worldFromCheckpointBody(JSON.parse(snapshot))!;
  assert.equal(restored.stripping!.jobs["debug-wreck"]!.seconds,3);
  assert.equal(restored.barricades!.jobs[restored.wingmen[0]!.id]!.seconds,.75);
 }
 console.log(`shield fixture ${preset} PASS`);
}
