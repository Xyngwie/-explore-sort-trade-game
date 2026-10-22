import {
  DEBUG_FIXTURE_ACTIVE, DEBUG_META_KEY, INITIAL_HUB, buildDebugCircuit,
  buildTradeToExplorePayloadFromFleet, buildTradeToExploreUrl, createOwnedMech,
  emptyFieldObjectIdentities, isShieldPreset, normalizeHubSnapshot, registerWreckIdentity,
  saveHubSaveToLocalStorage, shieldIdentityFromWreck, writeSortieCheckpoint,
  type HubCircuitRecord, type HubSnapshot, type ShieldPreset,
} from "@estg/shared";
import { attachCircuitPlay } from "../game/circuitPlay";
import { attachLostMechContext } from "../game/lostMechs";
import { attachFieldPersistence } from "../game/fieldPersistence";
import { bootstrapFromSearch, createWorld, startSortie } from "../game/world";
import { startBarricade } from "../game/barricades";
import { startStrippingAt } from "../game/strippingRuntime";
import { initializeEnemy } from "../game/enemyBehavior";
import { worldFromCheckpointBody } from "../game/checkpoint";
import type { World } from "../game/types";

const circuit = (id: string, owner: string, key: "shield" | "p_shield") => buildDebugCircuit(id, owner, key, key === "p_shield");

/** Prepared state only. Every subsequent action runs the normal simulation. */
export function buildShieldFixture(preset: ShieldPreset): {hub: HubSnapshot; world: World} {
  const leaderId="debug-leader", wingId="debug-wing";
  const fleet=[leaderId,wingId].map(instanceId=>createOwnedMech("mech_gen1",{instanceId}));
  const circuits: HubCircuitRecord[]=[];
  if (preset === "STRIPPING_READY" || preset === "BARRICADE_PERSISTENCE_READY") circuits.push(circuit("debug-normal",leaderId,"shield"));
  if (preset === "P_SHIELD_LEADER_READY" || preset === "BARRICADE_PERSISTENCE_READY") circuits.push(circuit("debug-p-leader",leaderId,"p_shield"));
  if (preset === "P_SHIELD_WINGMAN_READY" || preset === "BARRICADE_PERSISTENCE_READY") circuits.push(circuit("debug-p-wing",wingId,"p_shield"));
  const hub=normalizeHubSnapshot({...structuredClone(INITIAL_HUB),fleet,sortieSelection:[leaderId,wingId],circuits,
    invadeRank:{current:5,highestCleared:4},frontProgress:{seed:812,aoiHalf:12,opened:[],flagged:[],focus:null}});
  const search=new URL(buildTradeToExploreUrl(buildTradeToExplorePayloadFromFleet(hub.fleet,0,[leaderId,wingId]),"https://fixture.invalid/")).searchParams;
  search.set("sectorX","0");search.set("sectorY","0");search.set("density","0");search.set("neighborCount","0");
  const world=createWorld(bootstrapFromSearch("?"+search));
  attachLostMechContext(world,hub);attachCircuitPlay(world,hub,true);attachFieldPersistence(world,hub);startSortie(world);
  world.enemies=[];world.containers=[];world.coverObjects=[];
  const leader=world.leader,wing=world.wingmen[0]!;
  leader.pos={x:600,y:600};wing.pos={x:700,y:600};
  for(const u of [leader,wing]){u.heading=0;u.moveHeading=null;u.aimWant=null;u.moveTarget=null;u.playerMoveTarget=null;u.vel={x:0,y:0};}
  wing.holdOrder=true;
  // Return at the test site, with one already recovered container so the
  // normal return/settlement path is available without unrelated collection.
  world.extract.pos={x:600,y:600};world.salvaged=1;
  (preset==="P_SHIELD_WINGMAN_READY"?leader:wing).salvagedCount=1;
  world.shieldState={identities:emptyFieldObjectIdentities(),ground:{},equipped:{}};
  const add=(key:string,hp:number,maxHp:number)=>{
    const s=world.shieldState!;
    s.identities=registerWreckIdentity(s.identities,`source-${key}`);
    s.identities=shieldIdentityFromWreck(s.identities,`source-${key}`,key,{hp,maxHp});
  };
  add("debug-ground",17.25,62.75);world.shieldState.ground["debug-ground"]={x:610,y:620};
  if(preset!=="NO_SHIELD_NO_CIRCUIT" && preset!=="STRIPPING_READY") {
    const holder=preset==="P_SHIELD_WINGMAN_READY"?wing:leader;
    add("debug-equipped",47.25,62.75);world.shieldState.equipped[holder.id]={kind:"shield",key:"debug-equipped"};
  }
  if(preset==="NORMAL_SHIELD_AND_RESERVE") {
    wing.pos={x:600,y:680};
    add("debug-reserve",35.5,50);world.shieldState.spares={[leader.id]:[{kind:"shield",key:"debug-reserve"}]};
    // A normal hostile for manual shield fire tests; no altered AI/damage.
    const hostile=structuredClone(wing);hostile.id="debug-hostile";hostile.kind="enemy";hostile.instanceId=null;hostile.name="検証用敵";
    hostile.pos={x:740,y:600};hostile.heading=Math.PI;hostile.holdOrder=false;hostile.enemyIdentity={modelId:"mech_gen1",durability:100,circuits:[]};
    initializeEnemy(hostile,()=>0.95); // select the normal full-ammo band for reproducible exchange tests
    world.enemies=[hostile];
  }
  if(preset==="STRIPPING_READY" || preset==="BARRICADE_PERSISTENCE_READY") {
    const wreck=structuredClone(wing);wreck.id="debug-wreck";wreck.kind="enemy";wreck.instanceId=null;wreck.name="検証用残骸";wreck.pos={x:590,y:620};wreck.alive=false;wreck.hp=0;
    wreck.enemyIdentity={modelId:"mech_gen1",durability:100,circuits:[{circuitId:"debug-source-shield",side:2,effect:12.75,effectKey:"shield",trueBoard:false}]};
    world.enemies.push(wreck);
  }
  if(preset==="BARRICADE_PERSISTENCE_READY") {
    add("debug-wall",29.25,62.75);world.barricades={walls:{"debug-wall":{pos:{x:622,y:600},heading:0}},jobs:{}};
    add("debug-wing-equipped",38.5,50);world.shieldState.equipped[wing.id]={kind:"shield",key:"debug-wing-equipped"};
    if(!startBarricade(world,wing))throw new Error("Fixture construction unavailable");
    world.barricades.jobs[wing.id]!.seconds=0.75;
    if(startStrippingAt(world,{x:590,y:620},hub,20)!=="started")throw new Error("Fixture stripping unavailable");
    world.stripping!.jobs["debug-wreck"]!.seconds=3;
  }
  if(!worldFromCheckpointBody(structuredClone(world)))throw new Error("Invalid fixture checkpoint");
  return {hub,world};
}

/** Called before Explore reads its checkpoint. Reload must never reseed. */
export function prepareRequestedShieldFixture(): void {
  if(!DEBUG_FIXTURE_ACTIVE)return;
  const q=new URLSearchParams(location.search),preset=q.get("debug_preset"),run=q.get("debug_run");
  if(!isShieldPreset(preset)||!run)return;
  const raw=localStorage.getItem(DEBUG_META_KEY),meta=raw?JSON.parse(raw):null;
  if(meta?.run===run)return;
  const fixture=buildShieldFixture(preset);
  // All access is already namespaced. A failed save never falls back to normal.
  localStorage.clear();sessionStorage.clear();
  if(!saveHubSaveToLocalStorage(fixture.hub)||!writeSortieCheckpoint({v:1,kind:"sortie",body:fixture.world}))throw new Error("DEBUG_FIXTUREを保存できませんでした");
  localStorage.setItem(DEBUG_META_KEY,JSON.stringify({type:"DEBUG_FIXTURE",preset,run,createdAt:new Date().toISOString()}));
}

export function inspectShieldFixture(world: World): unknown {
  const s=world.shieldState;
  return {type:"DEBUG_FIXTURE",phase:world.phase,location:world.sortieLocation,
    units:[world.leader,...world.wingmen].map(u=>({id:u.id,instanceId:u.instanceId,pos:u.pos,heading:u.heading,hp:u.hp,alive:u.alive})),
    circuits:world.circuitPlay?.loadout,shields:Object.entries(s?.identities.shields??{}).map(([key,item])=>({key,...item,
      owners:[...(s?.ground[key]?[{kind:"ground",position:s.ground[key]}]:[]),...Object.entries(s?.equipped??{}).filter(([,r])=>r.key===key).map(([unit])=>({kind:"equipped",unit})),...Object.entries(s?.spares??{}).filter(([,rs])=>rs.some(r=>r.key===key)).map(([unit])=>({kind:"reserve",unit})),...(world.barricades?.walls[key]?[{kind:"barricade",...world.barricades.walls[key]}]:[])]})),
    construction:world.barricades?.jobs,stripping:world.stripping,pickup:s?.pickups,exchange:s?.exchanges};
}
