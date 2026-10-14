import assert from "node:assert/strict";
import type { ClassifiedCircuit } from "@estg/shared";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { attachCircuitPlay, startWreckPickup, stepCircuitPlay, unloadMech, placeCarried, modsFor, wingmanPaletteActions, pressWingPalette } from "./game/circuitPlay";
import { backfillEnemyState } from "./game/enemyBehavior";
import { getCoverObjects } from "./game/coverObjects";
import { tickWorld } from "./game/sim";
import { unitLoad, wreckCarrierId } from "./game/carry";
import { effectiveActivity } from "./game/power";
import { IDENTITY_ABILITY_SCALE } from "./game/releaseAbility";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { buildSortieOutcome } from "./game/outcome";
const idle = { move: {x:0,y:0}, clickMove: null, fire: false, interact: false };
function world() {
  const w = createWorld(bootstrapFromSearch("?deployedInstanceIds=a,b,c&deployableMechs=3&mechBattery=a:300:300;b:300:300;c:300:300&mechCurrentAmmo=a:20;b:20;c:20"));
  startSortie(w); attachCircuitPlay(w, null, true); getCoverObjects(w).splice(0);
  for (const u of [w.leader, ...w.wingmen]) {
    w.circuitPlay!.ability[u.id] = {...IDENTITY_ABILITY_SCALE};
    u.pos = {x:400,y:400}; u.moveTarget = null;
  }
  for (const e of w.enemies) { e.alive=false; e.hp=0; }
  for (const c of w.containers) { c.discovered=false; c.pos={x:20,y:20}; }
  return w;
}
function circuit(effectKey: ClassifiedCircuit["effectKey"], r=0.2): ClassifiedCircuit {
  return {circuitId:`c-${effectKey}`, effect:100,r,effectKey,trueBoard:false,oneByOne:null,side:4,conductive:true,cargoSlots:effectKey==='cargo_slots'?2:0,perfectPt:0,false20:false,true20:false};
}
function load(w: ReturnType<typeof world>, picker=w.leader, target=w.wingmen[0]!) {
  target.pos={...picker.pos};
  assert.equal(startWreckPickup(w,picker,target.id),"started");
  stepCircuitPlay(w,7.9);assert.equal(wreckCarrierId(w,target.id),null);
  stepCircuitPlay(w,0.1);assert.equal(wreckCarrierId(w,target.id),picker.id);
}
// Pickup, load=2, independent weapon categories, transfer and release.
{
 const w=world(); const passenger=w.wingmen[0]!;
 w.circuitPlay!.loadout.leader=[circuit('mmr'),circuit('homing_round')];
 w.circuitPlay!.loadout[passenger.id]=[circuit('lmg'),circuit('emp_round'),circuit('raid_attack')];
 load(w);
 assert.equal(unitLoad(w,w.leader),2);assert.equal(modsFor(w,w.leader.id).gun,'mmr');
 assert.equal(modsFor(w,passenger.id).gun,'lmg');assert.equal(modsFor(w,w.leader.id).attack,1.2,'nonweapon bonus adds to carrier');
 assert.deepEqual(wingmanPaletteActions(w,[passenger.id]).map(a=>a.id),['unload']);
 const foe=w.enemies[0]!;foe.alive=true;foe.hp=foe.maxHp=100000;foe.pos={x:440,y:400};
 backfillEnemyState(w);
 foe.enemyState!.ammo=0;foe.enemyState!.activity=0;
 const beforeA=w.currentAmmo.a!,beforeB=w.currentAmmo.b!;
 tickWorld(w,0.01,idle);
 assert.equal(w.currentAmmo.a,beforeA-1);assert.equal(w.currentAmmo.b,beforeB-1,'both weapons fire');
 const owners=new Set(w.bullets.map(b=>b.ownerId));assert.ok(owners.has('leader'));assert.ok(owners.has(passenger.id));
 assert.ok(w.bullets.some(b=>b.ownerId==='leader'&&b.homingId===foe.id));
 assert.ok(w.bullets.some(b=>b.ownerId===passenger.id&&b.emp));
 assert.equal(w.mechBattery.b!.activity,300,'rider spends no movement power');
 assert.equal(unloadMech(w,passenger.id),true);assert.equal(unitLoad(w,w.leader),0);
 assert.equal(modsFor(w,w.leader.id).attack,1,'borrowed passive removed after dismount');
 assert.equal(wreckCarrierId(w,passenger.id),null);
}
// Same distance costs twice as much time/power at load2 (120 -> 60).
{
 const empty=world(), loaded=world();load(loaded);
 const input={...idle,move:{x:1,y:0}};
 const x=empty.leader.pos.x;tickWorld(empty,1,input);tickWorld(loaded,2,input);
 assert.ok(Math.abs(empty.leader.pos.x-x-120)<1e-8, JSON.stringify({x,at:empty.leader.pos,speed:empty.balance.moveSpeed,load:unitLoad(empty,empty.leader),ability:empty.circuitPlay!.ability.leader}));
 assert.ok(Math.abs(loaded.leader.pos.x-x-120)<1e-8,JSON.stringify({x,at:loaded.leader.pos,load:unitLoad(loaded,loaded.leader)}));
 assert.equal(empty.mechBattery.a!.activity,299);assert.equal(loaded.mechBattery.a!.activity,298);
 assert.equal(loaded.mechBattery.b!.activity,300);
 const still=world();tickWorld(still,1,idle);assert.equal(still.mechBattery.a!.activity,300,'stopping is free');
 tickWorld(still,0.125,input);assert.equal(still.mechBattery.a!.activity,299.875);
 const cp=worldFromCheckpointBody(JSON.parse(JSON.stringify(snapshotSortieWorld(still))))!;
 assert.equal(cp.mechBattery.a!.activity,299.875);
 assert.equal(buildSortieOutcome(still)!.mechBattery.find(r=>r.instanceId==='a')!.battery.activity,299.875);
}
// Exhaustion moves only for the remaining charge, wrecks carrier, releases living rider.
{
 const w=world();load(w);w.circuitPlay!.wingTrueOne[w.wingmen[0]!.id]=true;w.wingmen[0]!.stance="patrol";w.mechBattery.a!.activity=0.25;
 const x=w.leader.pos.x;tickWorld(w,1,{...idle,move:{x:1,y:0}});
 assert.equal(w.leader.alive,false);assert.equal(w.leader.hp,0);assert.equal(w.mechBattery.a!.activity,0);
 assert.ok(Math.abs(w.leader.pos.x-x-15)<1e-8,'0.25s at loaded speed60');
 assert.equal(w.wingmen[0]!.alive,true);assert.equal(wreckCarrierId(w,w.wingmen[0]!.id),null);
 const before={...w.wingmen[0]!.pos};tickWorld(w,0.1,idle);
 assert.ok(Math.hypot(w.wingmen[0]!.pos.x-before.x,w.wingmen[0]!.pos.y-before.y)>0,JSON.stringify({phase:w.phase, before, after:w.wingmen[0]!.pos, true:w.circuitPlay!.wingTrueOne, carry:w.circuitPlay!.carry, b:w.mechBattery.b, target:w.wingmen[0]!.moveTarget,alive:w.wingmen[0]!.alive}));
}
// A fighting/destroyed passenger stays carried as a wreck; destroyed carrier drops it.
{
 const w=world();load(w);const u=w.wingmen[0]!;u.alive=false;u.hp=0;placeCarried(w);
 assert.equal(wreckCarrierId(w,u.id),'leader');w.leader.alive=false;w.leader.hp=0;placeCarried(w);
 assert.equal(wreckCarrierId(w,u.id),null);assert.deepEqual(u.pos,w.leader.pos);
}
// No nested stacks/cycles: cargo transfers to new carrier, overflow stays on field.
{
 const w=world();const target=w.wingmen[0]!,other=w.wingmen[1]!;
 target.salvagedCount=2;w.salvaged=2;w.circuitPlay!.carry[target.id]=[other.id];
 assert.equal(startWreckPickup(w,other,target.id),'none','a mounted unit cannot pick up its carrier');
 load(w,w.leader,target);
 assert.equal(target.salvagedCount,0);assert.equal(w.circuitPlay!.carry[target.id],undefined);
 assert.equal(wreckCarrierId(w,other.id),null,'overflow dismounted');
 assert.equal(w.containers.filter(c=>c.id.startsWith('purge')).length,2,'overflow crates preserved');
}
console.log('Live transport, independent guns, load speed, time-based power, exhaustion, cargo transfer and checkpoint PASS');

// A living captain riding a wingman can drive it and dismount through its palette.
{
 const w=world(), carrier=w.wingmen[0]!;
 load(w,carrier,w.leader);
 const x=carrier.pos.x;tickWorld(w,0.5,{...idle,move:{x:1,y:0}});
 assert.ok(carrier.pos.x>x);assert.equal(w.mechBattery.a!.activity,300);
 assert.equal(wreckCarrierId(w,w.leader.id),carrier.id);
 assert.ok(wingmanPaletteActions(w,[carrier.id]).some(a=>a.id==='unload-cargo'));
 w.circuitPlay!.wingSelect={ids:[carrier.id],step:'root'};
 assert.equal(pressWingPalette(w,'unload-cargo'),true);
 assert.equal(wreckCarrierId(w,w.leader.id),null);
}
