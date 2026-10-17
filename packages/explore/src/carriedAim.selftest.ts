import assert from 'node:assert/strict';
import type { ClassifiedCircuit } from '@estg/shared';
import { createWorld, bootstrapFromSearch, startSortie } from './game/world';
import { attachCircuitPlay, startWreckPickup, stepCircuitPlay, placeCarried, unloadMech, modsFor } from './game/circuitPlay';
import { backfillEnemyState } from './game/enemyBehavior';
import { getCoverObjects } from './game/coverObjects';
import { turnRate, updateFacing } from './game/facing';
import { unitLoad, unitLoadCap, wreckCarrierId } from './game/carry';
import { tickWorld } from './game/sim';
import { snapshotSortieWorld, worldFromCheckpointBody } from './game/checkpoint';
import { IDENTITY_ABILITY_SCALE } from './game/releaseAbility';
const idle={move:{x:0,y:0},clickMove:null,fire:false,interact:false};
function fixture(){
 const w=createWorld(bootstrapFromSearch('?deployedInstanceIds=a,b,c,d&mechBattery=a:300:300;b:300:300;c:300:300;d:300:300&mechCurrentAmmo=a:28;b:28;c:28;d:28'));
 startSortie(w);attachCircuitPlay(w,null,true);getCoverObjects(w).splice(0);
 for(const u of [w.leader,...w.wingmen]){u.pos={x:400,y:400};u.heading=0;u.moveTarget=null;w.circuitPlay!.ability[u.id]={...IDENTITY_ABILITY_SCALE};}
 backfillEnemyState(w);
 for(const e of w.enemies){e.alive=false;e.hp=0;e.enemyState!.deathHandled=true;e.enemyIdentity!.circuits=[];}
 for(const c of w.containers){c.discovered=false;c.pos={x:20,y:20};}
 return w;
}
function slots(n:number):ClassifiedCircuit {
 return {circuitId:'slots',side:4*n,effect:16*n*n,effectKey:'cargo_slots',r:.08*n,trueBoard:false,oneByOne:null,conductive:true,cargoSlots:n,perfectPt:0,false20:false,true20:false};
}
function load(w:ReturnType<typeof fixture>,target=w.wingmen[0]!){
 target.pos={...w.leader.pos};assert.equal(startWreckPickup(w,w.leader,target.id),'started');stepCircuitPlay(w,8);
 assert.equal(wreckCarrierId(w,target.id),w.leader.id);
}
function near(a:{x:number;y:number},b:{x:number;y:number}){return Math.hypot(a.x-b.x,a.y-b.y);}
// Dropping happens at completion, including all containers and nested carried units.
// Spare capacity must NOT silently transfer the passenger's inventory to the carrier.
{
 const w=fixture(),target=w.wingmen[0]!,child=w.wingmen[1]!;
 w.circuitPlay!.loadout.leader=[slots(4)];w.circuitPlay!.loadout[target.id]=[slots(2)];target.salvagedCount=2;w.salvaged=2;
 w.circuitPlay!.carry[target.id]=[child.id];
 const pickup={...target.pos};const ammo=w.currentAmmo.b,battery={...w.mechBattery.b!};
 target.moveHeading=Math.PI;target.aimWant=Math.PI/2;target.heading=.7;
 assert.equal(startWreckPickup(w,w.leader,target.id),'started');stepCircuitPlay(w,7.99);
 assert.equal(target.salvagedCount,2);assert.equal(wreckCarrierId(w,child.id),target.id);
 stepCircuitPlay(w,.01);
 assert.deepEqual(w.circuitPlay!.carry.leader,[target.id]);
 assert.equal(target.salvagedCount,0);assert.equal(w.circuitPlay!.carry[target.id],undefined);
 assert.equal(w.leader.salvagedCount,0);assert.equal(wreckCarrierId(w,child.id),null);
 assert.ok(near(child.pos,pickup)<=36.01);assert.equal(w.salvaged,0);
 const dropped=w.containers.filter(c=>c.id.startsWith('purge'));
 assert.equal(dropped.length,2);assert.ok(dropped.every(c=>c.discovered&&!c.taken&&near(c.pos,pickup)<60));
 assert.equal(w.currentAmmo.b,ammo);assert.deepEqual(w.mechBattery.b,battery);
 assert.equal(w.circuitPlay!.loadout[target.id]![0]!.effectKey,"cargo_slots","equipped circuits are not cargo");
 assert.equal(target.moveHeading,null);assert.equal(target.aimWant,null);assert.equal(target.heading,.7);
}
// An interrupted pickup must not strip the target before it is loaded.
{
 const w=fixture(),target=w.wingmen[0]!;target.salvagedCount=1;w.salvaged=1;
 assert.equal(startWreckPickup(w,w.leader,target.id),'started');stepCircuitPlay(w,4);
 w.leader.pos.x+=100;stepCircuitPlay(w,5);
 assert.equal(wreckCarrierId(w,target.id),null);assert.equal(target.salvagedCount,1);assert.equal(w.salvaged,1);
 assert.equal(w.containers.filter(c=>c.id.startsWith('purge')).length,0);
}
// Capacity 3 means own container1 + passenger2 fit; the passenger's container drops.
{
 const w=fixture(),target=w.wingmen[0]!;
 w.circuitPlay!.loadout.leader=[slots(1)];w.leader.salvagedCount=1;target.salvagedCount=1;w.salvaged=2;
 load(w);assert.equal(unitLoadCap(w,w.leader),3);assert.equal(unitLoad(w,w.leader),3);
 assert.equal(w.leader.salvagedCount,1);assert.equal(target.salvagedCount,0);assert.equal(w.salvaged,1);
 assert.equal(w.containers.filter(c=>c.id.startsWith('purge')).length,1);
}
// Capacity 2 still drops the carrier's own containers only when needed to fit the body.
{
 const w=fixture();w.leader.salvagedCount=2;w.salvaged=2;load(w);
 assert.equal(unitLoad(w,w.leader),2);assert.equal(w.containers.filter(c=>c.id.startsWith('purge')).length,2);
}
// Carrier at load6 cannot rotate; each passenger still rotates independently at 90°/s.
{
 const w=fixture();w.circuitPlay!.loadout.leader=[slots(4)];
 for(const u of w.wingmen)load(w,u);
 assert.equal(unitLoad(w,w.leader),6);assert.equal(turnRate(w,w.leader),0);
 for(const u of [w.leader,...w.wingmen]){u.heading=0;u.aimWant=Math.PI;}
 updateFacing(w,.5);assert.equal(w.leader.heading,0);
 for(const u of w.wingmen)assert.ok(Math.abs(u.heading-Math.PI/4)<1e-10);
 // Q1=A: neither the carrier's new heading nor an old saved moveHeading is an idle aim.
 const rider=w.wingmen[0]!,held=rider.heading;rider.moveHeading=Math.PI;rider.aimWant=null;w.leader.heading=-Math.PI/2;
 updateFacing(w,1);assert.equal(rider.heading,held);assert.equal(rider.moveHeading,null);
}
// In real ticks only the rider, once inside its OWN 3° firing arc, can fire.
{
 const w=fixture(),rider=w.wingmen[0]!;load(w);
 for(const other of w.wingmen.slice(1))other.pos={x:900,y:900};
 const enemy=w.enemies[0]!;enemy.alive=true;enemy.hp=enemy.maxHp=10000;enemy.pos={x:400,y:460};enemy.enemyState!.ammo=0;enemy.enemyState!.activity=0;
 w.leader.heading=rider.heading=0;w.leader.moveHeading=rider.moveHeading=null;
 const beforeA=w.currentAmmo.a!,beforeB=w.currentAmmo.b!,powerA=w.mechBattery.a!.activity,powerB=w.mechBattery.b!.activity;
 tickWorld(w,.5,idle);assert.equal(w.currentAmmo.a,beforeA);assert.equal(w.currentAmmo.b,beforeB);
 assert.ok(Math.abs(w.leader.heading-Math.PI/8)<1e-8);assert.ok(Math.abs(rider.heading-Math.PI/4)<1e-8);
 tickWorld(w,.5,idle);assert.equal(w.currentAmmo.b,beforeB);assert.ok(Math.abs(rider.heading-Math.PI/2)<1e-8);
 tickWorld(w,.01,idle);assert.equal(w.currentAmmo.b,beforeB-1);assert.equal(w.currentAmmo.a,beforeA);
 assert.ok(w.bullets.some(b=>b.ownerId===rider.id));assert.equal(w.mechBattery.a!.activity,powerA);assert.equal(w.mechBattery.b!.activity,powerB);
}
// Old checkpoints need no new fields: preserve carry/facing and ignore stale movement while mounted.
{
 const w=fixture(),rider=w.wingmen[0]!;load(w);rider.heading=1;rider.moveHeading=-2;
 const old=worldFromCheckpointBody(JSON.parse(JSON.stringify(snapshotSortieWorld(w))))!;
 updateFacing(old,.5);assert.equal(old.wingmen[0]!.heading,1);assert.equal(wreckCarrierId(old,rider.id),'leader');
 assert.equal(unloadMech(old,rider.id),true);old.wingmen[0]!.moveHeading=0;updateFacing(old,.5);
 assert.ok(old.wingmen[0]!.heading<1,'dismount resumes its own movement-facing rules');
}
console.log('carriedAim: own 3°/90°, load6 carrier, idle facing, full cargo drop, capacity3, interruption and old checkpoint PASS');
