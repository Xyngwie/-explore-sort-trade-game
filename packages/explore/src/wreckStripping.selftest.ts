import assert from 'node:assert/strict';
import { emptyFieldObjectIdentities, INITIAL_HUB } from '@estg/shared';
import { reserveStripping, advanceStripping, cancelUnitStripping, type StrippingState } from './game/wreckStripping';
import { activeStripping, startStrippingAt, tickStripping, strippingReport, wreckWasStripped } from './game/strippingRuntime';
import { createWorld, bootstrapFromSearch, startSortie } from './game/world';
import { attachCircuitPlay, startWreckPickup, applyCircuitHubSide } from './game/circuitPlay';
import { recoverStrandedAtLiftOff, strandedNotRecovered } from './game/lostMechs';
import { sortieWreckUnits } from './game/wrecks';
import { getCoverObjects } from './game/coverObjects';
import { tickWorld } from './game/sim';
import { snapshotSortieWorld, worldFromCheckpointBody } from './game/checkpoint';
const source = { targetId:'corpse', instanceId:'old-mech', circuits:[{circuitId:'c',side:3,effect:7}], learningValue:null };
{
  let ids=emptyFieldObjectIdentities(); const state:StrippingState={jobs:{}};
  const r=reserveStripping(state,ids,source,'leader',{x:0,y:0}); assert.equal(r.status,'started'); if(r.status!=='started')throw Error(); ids=r.identities;
  assert.equal(reserveStripping(state,ids,source,'wing',{x:0,y:0}).status,'busy');
  assert.equal(advanceStripping(state,ids,'corpse',{alive:true,pos:{x:0,y:0}},true,{x:3,y:0},3).completion,null);
  advanceStripping(state,ids,'corpse',{alive:true,pos:{x:1,y:0}},true,{x:3,y:0},5);
  assert.equal(state.jobs.corpse!.seconds,3); assert.equal(state.jobs.corpse!.reservation,null);
  const serialized=JSON.parse(JSON.stringify({state,ids}));
  const next=reserveStripping(serialized.state,serialized.ids,source,'wing',{x:0,y:0}); assert.equal(next.status,'started');
  const almost=advanceStripping(serialized.state,serialized.ids,'corpse',{alive:true,pos:{x:0,y:0}},true,{x:3,y:0},4.9); assert.equal(almost.completion,null);
  const done=advanceStripping(serialized.state,serialized.ids,'corpse',{alive:true,pos:{x:0,y:0}},true,{x:3,y:0},.11);
  assert(done.completion); assert.equal(Object.keys(done.identities.shields).length,1);
  const shield=done.identities.shields[done.completion.shieldKey]!;
  assert.equal(shield.hp,50); assert.equal(shield.maxHp,50); assert.equal(shield.shieldId,'1'); assert.equal(shield.sourceWreckId,'1');
  assert.equal(reserveStripping(serialized.state,done.identities,source,'wing',{x:0,y:0}).status,'consumed');
  assert.equal(advanceStripping(serialized.state,done.identities,'corpse',{alive:true,pos:{x:0,y:0}},true,{x:3,y:0},20).completion,null);
}
{
  const state:StrippingState={jobs:{}}; const r=reserveStripping(state,emptyFieldObjectIdentities(),source,'leader',{x:0,y:0}); if(r.status!=='started')throw Error();
  advanceStripping(state,r.identities,'corpse',{alive:true,pos:{x:0,y:0}},true,{x:0,y:0},2);
  cancelUnitStripping(state,'leader'); assert.equal(state.jobs.corpse!.seconds,2);
  reserveStripping(state,r.identities,source,'wing',{x:0,y:0});
  advanceStripping(state,r.identities,'corpse',{alive:false,pos:{x:0,y:0}},true,{x:0,y:0},20);
  assert.equal(state.jobs.corpse!.seconds,2); assert.equal(state.jobs.corpse!.reservation,null);
}
function fixture(){
 const w=createWorld(bootstrapFromSearch(''));startSortie(w);attachCircuitPlay(w,null,false);getCoverObjects(w).splice(0);w.containers=[];
 w.leader.pos={x:600,y:600};w.leader.moveTarget=null;w.leader.playerMoveTarget=null;
 for(const e of w.enemies){e.alive=false;e.hp=0;}
 const e=w.enemies[0]!;e.pos={x:620,y:600};e.enemyIdentity={modelId:'mech_gen1',durability:100,circuits:[{circuitId:'enemy-c',side:2,effectKey:'smg',effect:4,trueBoard:false}]};
 return w;
}
{
 const w=fixture(), e=w.enemies[0]!;assert.equal(startStrippingAt(w,e.pos,null,20),'started');
 assert.equal(startWreckPickup(w,w.leader,e.id),'taken');
 tickStripping(w,7.9);assert.equal(Object.keys(w.shieldState!.ground).length,0);
 const restored=worldFromCheckpointBody(snapshotSortieWorld(w))!;tickStripping(restored,.11);
 assert(wreckWasStripped(restored,e.id));assert.equal(Object.keys(restored.shieldState!.ground).length,1);
 assert.equal(restored.enemies[0]!.enemyIdentity!.circuits.length,0);
 assert.equal(strippingReport(restored)!.observations[0]!.circuits[0]!.effect,4);
 assert.equal(startWreckPickup(restored,restored.leader,e.id),'none');
 assert.equal(startStrippingAt(restored,e.pos,null,20),'none');
}
{
 const w=fixture(),e=w.enemies[0]!; assert.equal(startStrippingAt(w,{x:0,y:0},null,20),'none');
 e.pos={x:900,y:600};assert.equal(startStrippingAt(w,e.pos,null,20),'far');e.pos={x:620,y:600};
 assert.equal(startWreckPickup(w,w.leader,e.id),'started');assert.equal(startStrippingAt(w,e.pos,null,20),'busy');
}
{
 const w=fixture(),e=w.enemies[0]!;assert.equal(startStrippingAt(w,e.pos,null,20),'started');
 // Visible live enemy does not interrupt or cause auto-firing/side-stepping.
 const threat=w.enemies[1]!;threat.alive=true;threat.hp=100;threat.pos={x:700,y:600};threat.cooldown=100;
 const ammo={...w.currentAmmo};const pos={...w.leader.pos};
 tickWorld(w,.1,{move:{x:0,y:0},clickMove:null,fire:false,interact:false});
 assert(activeStripping(w,w.leader.id));assert.deepEqual(w.leader.pos,pos);assert.deepEqual(w.currentAmmo,ammo);assert(!w.bullets.some(b=>b.ownerId===w.leader.id));
 tickWorld(w,.1,{move:{x:1,y:0},clickMove:null,fire:false,interact:false});assert(!activeStripping(w,w.leader.id));
 assert(w.stripping!.jobs[e.id]!.seconds>0);
}
{
 const w=fixture(),e=w.enemies[0]!;startStrippingAt(w,e.pos,null,20);tickStripping(w,3);
 w.leader.pos.x+=1;tickStripping(w,5);assert(!activeStripping(w,w.leader.id));assert.equal(Object.keys(w.shieldState!.ground).length,0);
 startStrippingAt(w,e.pos,null,20);w.leader.alive=false;tickStripping(w,10);assert.equal(Object.keys(w.shieldState!.ground).length,0);
}
{
 const w=fixture();const wing=w.wingmen[0]!;wing.alive=false;wing.hp=0;wing.instanceId='wing-wreck';wing.pos={x:610,y:600};w.deployedInstanceIds.push(wing.instanceId);
 assert.equal(startStrippingAt(w,wing.pos,null,3),'started');tickStripping(w,8);
 assert(!sortieWreckUnits(w).includes(wing));assert.equal(startWreckPickup(w,w.leader,wing.id),'none');
 assert.equal(w.stripping!.observations[0]!.sourceInstanceId,'wing-wreck');
}
{
 const w=fixture();w.enemies=[];
 w.strandedMechs=[{instanceId:'old',name:'old',pos:{x:620,y:600},wreck:true,found:true,row:{instanceId:'old',currentAmmo:0,battery:{capacity:300,activity:0},circuitIds:[],kind:'wreck',frontSeed:1,cell:{sx:0,sy:0}}}];
 assert.equal(startStrippingAt(w,{x:620,y:600},null,10),'started');tickStripping(w,8);
 assert.deepEqual(recoverStrandedAtLiftOff(w,{center:{x:600,y:600},radius:110,requestedAt:0,cargoArrived:true},true),[]);
 assert.deepEqual(strandedNotRecovered(w),[]);assert.equal(startWreckPickup(w,w.leader,'s:old'),'none');
}
{
 const w=fixture();w.enemies=[];w.circuitPlay!.airWrecks=[{id:'gone-enemy',pos:{x:620,y:600},recovered:false}];
 assert.equal(startStrippingAt(w,{x:620,y:600},null,10),'started');tickStripping(w,8);
 assert(wreckWasStripped(w,'a:gone-enemy'));assert.equal(startWreckPickup(w,w.leader,'a:gone-enemy'),'none');
 w.circuitPlay!.airWrecks[0]!.recovered=true;
 w.stripping!.jobs={}; // completed observation still proves consumption if the job table is absent/cleared
 assert(wreckWasStripped(w,'a:gone-enemy'));
 assert.equal(applyCircuitHubSide(w,INITIAL_HUB).fleet.length,INITIAL_HUB.fleet.length,'stale recovered flag must not grant an anonymous legacy hull');
}
{
 const w=fixture(),e=w.enemies[0]!;startStrippingAt(w,e.pos,null,20);tickStripping(w,8);
 w.circuitPlay!.airWrecks=[{id:e.id,pos:{...e.pos},recovered:true}];
 w.enemies=[];w.stripping!.jobs={}; // result snapshots omit enemies; observation is still authoritative
 assert.equal(applyCircuitHubSide(w,INITIAL_HUB).fleet.length,INITIAL_HUB.fleet.length,'normal enemy ID must also block the anonymous air-wreck path in a result snapshot');
}
console.log('Wreck stripping PASS: exclusivity, progress/resume, stationary/no fire, movement/death, one shield, consumed pickup, checkpoint');
