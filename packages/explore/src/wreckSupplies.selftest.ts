import assert from 'node:assert/strict';
import { INITIAL_HUB,normalizeHubSnapshot,applyExploreReturnToHub } from '@estg/shared';
import { acquireEnemyWrecks,enemyWreckReturns } from './game/enemyRecovery';
import {bootstrapFromSearch,createWorld,startSortie} from './game/world';
import {attachCircuitPlay,startWreckPickup,stepCircuitPlay} from './game/circuitPlay';
import {wreckCarrierId} from './game/carry';
import {expireEmptyBatteries} from './game/power';
import {dropFriendlyWreckSupplies} from './game/wreckSupplies';
import {handleEnemyDeaths,collectSupplies,initializeEnemy} from './game/enemyBehavior';
import {tickWorld} from './game/sim';
import {worldFromCheckpointBody,snapshotSortieWorld} from './game/checkpoint';
import {IDENTITY_ABILITY_SCALE} from './game/releaseAbility';
const idle={move:{x:0,y:0},clickMove:null,fire:false,interact:false};
function world(){const w=createWorld(bootstrapFromSearch('?deployableMechs=2&deployedInstanceIds=a,b&mechBattery=a:300:300;b:300:100.5&mechCurrentAmmo=a:0;b:7'));startSortie(w);attachCircuitPlay(w,null,true);w.enemies=[];w.containers=[];w.coverObjects=[];w.leader.pos={x:400,y:400};w.wingmen[0]!.pos={x:900,y:900};for(const u of [w.leader,...w.wingmen])w.circuitPlay!.ability[u.id]={...IDENTITY_ABILITY_SCALE};return w;}
{
 const w=world(),u=w.wingmen[0]!;w.mechBattery.b!.activity=0;u.hp=17.25;
 expireEmptyBatteries(w);assert(!u.alive);assert.equal(u.hp,0);assert.equal(w.currentAmmo.b,0);assert.equal(w.mechBattery.b!.activity,0);assert.equal(w.enemySupplies!.reduce((s,d)=>s+d.ammo,0),7);assert.equal(w.enemySupplies!.reduce((s,d)=>s+d.power,0),0);
 const before=JSON.stringify(w.enemySupplies);expireEmptyBatteries(w);assert.equal(JSON.stringify(w.enemySupplies),before);
 const reloaded=worldFromCheckpointBody(snapshotSortieWorld(w))!;assert(reloaded);expireEmptyBatteries(reloaded);dropFriendlyWreckSupplies(reloaded,reloaded.wingmen[0]!);assert.equal(JSON.stringify(reloaded.enemySupplies),before,'checkpoint reload cannot duplicate resources');
}
{
 const w=world(),u=w.wingmen[0]!;u.hp=1;u.holdOrder=true;
 w.bullets=[{alive:true,pos:{x:870,y:900},vel:{x:400,y:0},ttl:1,damage:1000,fromEnemy:true,ownerId:'enemy-source'}];
 tickWorld(w,.1,idle);assert(!u.alive,'actual projectile kills target');assert.equal(w.currentAmmo.b,0);assert.equal(w.mechBattery.b!.activity,0);assert(w.enemySupplies!.some(d=>d.ammo===7));assert(w.enemySupplies!.some(d=>d.power===100.5));
 const drops=JSON.stringify(w.enemySupplies);tickWorld(w,.01,idle);assert.equal(JSON.stringify(w.enemySupplies),drops);
 w.leader.pos={...u.pos};collectSupplies(w);assert.equal(w.currentAmmo.a,7);assert.equal(w.currentAmmo.b,0);assert.equal(w.mechBattery.b!.activity,0,'wreck cannot retain collected supplies');
}
{
 const w=world(),u=w.wingmen[0]!;u.alive=false;u.hp=0;delete u.wreckSuppliesDropped;const before=JSON.stringify({ammo:w.currentAmmo,battery:w.mechBattery});
 const reloaded=worldFromCheckpointBody(snapshotSortieWorld(w))!;tickWorld(reloaded,.01,idle);assert.equal(JSON.stringify({ammo:reloaded.currentAmmo,battery:reloaded.mechBattery}),before,'legacy already-dead residual resources are not migrated');assert.equal(reloaded.enemySupplies!.length,0);
}
{
 const w=world();const e={...structuredClone(w.wingmen[0]!),id:'enemy',kind:'enemy' as const,instanceId:null,alive:false,hp:0};initializeEnemy(e);e.enemyState!.ammo=9;e.enemyState!.activity=17.5;w.enemies=[e];handleEnemyDeaths(w);handleEnemyDeaths(w);assert.equal(e.enemyState!.ammo,0);assert.equal(e.enemyState!.activity,0);assert.equal(w.enemySupplies!.length,2,'existing enemy death drop remains once');
}
{const w=world();const e={...structuredClone(w.wingmen[0]!),id:'enemy-recovery',kind:'enemy' as const,instanceId:null,alive:false,hp:0};w.recoveredEnemyUnits=[e];const h=normalizeHubSnapshot({...INITIAL_HUB,fleet:[],ammoBatteryRepaired:true});const direct=acquireEnemyWrecks(w,h);assert.equal(direct.fleet[0]!.battery.activity,0);const result=applyExploreReturnToHub(h,{sortieId:'recover-no-supplies',returnKind:'extract',mechWear:[],enemyWrecks:enemyWreckReturns(w)} as never).hub;assert.equal(result.fleet[0]!.currentAmmo,0);assert.equal(result.fleet[0]!.battery.activity,0,'enemy recovery cannot synthesize a full battery');}
console.log('Friendly wreck supplies: actual combat and empty-power transitions, canonical zero, pickup, repeated frame/checkpoint once; no legacy dead migration; enemy behavior preserved PASS');

{const w=world(),passenger=w.wingmen[0]!;passenger.pos={...w.leader.pos};assert.equal(startWreckPickup(w,w.leader,passenger.id),'started');stepCircuitPlay(w,8);assert.equal(wreckCarrierId(w,passenger.id),w.leader.id);w.currentAmmo.a=5;w.mechBattery.a!.activity=0;expireEmptyBatteries(w);assert.equal(wreckCarrierId(w,passenger.id),null);assert(passenger.alive);assert.equal(w.currentAmmo.a,0);assert.equal(w.currentAmmo.b,7);assert.equal(w.mechBattery.b!.activity,100.5);assert.equal(w.enemySupplies!.reduce((n,d)=>n+d.ammo,0),5);const saved=worldFromCheckpointBody(snapshotSortieWorld(w))!;expireEmptyBatteries(saved);assert.equal(saved.enemySupplies!.reduce((n,d)=>n+d.ammo,0),5);}
