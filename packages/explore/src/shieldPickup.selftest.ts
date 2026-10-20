import assert from 'node:assert/strict';
import { emptyFieldObjectIdentities, registerWreckIdentity, shieldIdentityFromWreck } from '@estg/shared';
import { createWorld, bootstrapFromSearch, startSortie } from './game/world';
import { absorbShieldHit, equippedShield, dropUnavailableShields } from './game/shields';
import { startShieldPickup, tickShieldOperations, spareShields, dropOwnedShield, takeShieldNotices, SHIELD_FULL_MESSAGE, SHIELD_BUSY_MESSAGE, sortedGroundShields } from './game/shieldOperations';
import { unitLoad } from './game/carry';
import { tickWorld } from './game/sim';
import { attachCircuitPlay, stepCircuitPlay, startWreckPickup } from './game/circuitPlay';
import { getCoverObjects } from './game/coverObjects';
import { snapshotSortieWorld, worldFromCheckpointBody } from './game/checkpoint';
function fixture(){const w=createWorld(bootstrapFromSearch(''));startSortie(w);getCoverObjects(w).splice(0);w.leader.pos={x:600,y:600};w.leader.heading=0;w.shieldState={identities:emptyFieldObjectIdentities(),equipped:{},ground:{}};return w;}
function item(w:ReturnType<typeof fixture>,key:string,hp=50,maxHp=50){let ids=registerWreckIdentity(w.shieldState!.identities,`w:${key}`);w.shieldState!.identities=shieldIdentityFromWreck(ids,`w:${key}`,key,{hp,maxHp});w.shieldState!.ground[key]={...w.leader.pos};}
function advance(w:ReturnType<typeof fixture>,seconds:number){w.elapsed+=seconds;tickShieldOperations(w);}
{
 const w=fixture();item(w,'first');assert.equal(startShieldPickup(w,w.leader,'first'),'started');
 assert.equal(unitLoad(w,w.leader),0);advance(w,1.99);assert.equal(equippedShield(w,w.leader),null);
 w.leader.pos.x+=10;advance(w,.02);assert.equal(equippedShield(w,w.leader)?.key,'first');assert.equal(unitLoad(w,w.leader),1);
 assert.equal(w.shieldState!.ground.first,undefined);assert.equal(w.logs.filter(l=>l.text==='盾を回収しました').length,1);
 advance(w,10);assert.equal(w.logs.filter(l=>l.text==='盾を回収しました').length,1);
}
{
 const w=fixture();item(w,'reserved');const wing=w.wingmen[0]!;wing.pos={...w.leader.pos};
 startShieldPickup(w,w.leader,'reserved');assert.equal(startShieldPickup(w,wing,'reserved'),'busy');
 assert.deepEqual(takeShieldNotices(w),[SHIELD_BUSY_MESSAGE]);assert.equal(w.logs.length,0);
 w.leader.pos.x+=w.leader.radius*2+1;advance(w,1);assert.equal(w.shieldState!.pickups![w.leader.id],undefined);
 assert.equal(startShieldPickup(w,wing,'reserved'),'started');advance(w,1.99);assert.equal(equippedShield(w,wing),null);advance(w,.02);assert.equal(equippedShield(w,wing)?.key,'reserved');
}
{
 const w=fixture();item(w,'full');w.leader.salvagedCount=2;assert.equal(startShieldPickup(w,w.leader,'full'),'full');
 assert.deepEqual(takeShieldNotices(w),[SHIELD_FULL_MESSAGE]);assert.equal(w.logs.filter(l=>l.text===SHIELD_FULL_MESSAGE).length,1);
 w.leader.salvagedCount=0;advance(w,10);assert.equal(equippedShield(w,w.leader),null);
 startShieldPickup(w,w.leader,'full');w.leader.salvagedCount=2;advance(w,2);
 assert(w.shieldState!.ground.full);assert.equal(w.shieldState!.pickups![w.leader.id],undefined);assert.deepEqual(takeShieldNotices(w),[SHIELD_FULL_MESSAGE]);
 w.leader.salvagedCount=0;advance(w,10);assert.equal(equippedShield(w,w.leader),null,'no automatic retry');
}
{
 const w=fixture();item(w,'old',1);item(w,'spare',30);startShieldPickup(w,w.leader,'old');advance(w,2);startShieldPickup(w,w.leader,'spare');advance(w,2);
 assert.equal(unitLoad(w,w.leader),2);assert.equal(spareShields(w,w.leader).length,1);
 assert(absorbShieldHit(w,w.leader,0,1000));assert.equal(equippedShield(w,w.leader),null);assert.equal(unitLoad(w,w.leader),1,'reserved spare keeps weight');
 assert.equal(dropOwnedShield(w,w.leader,'spare'),false);assert.equal(w.shieldState!.exchanges![w.leader.id]!.key,'spare');
 item(w,'better',50);startShieldPickup(w,w.leader,'better');advance(w,1.99);assert.equal(equippedShield(w,w.leader),null);
 advance(w,.02);assert.equal(equippedShield(w,w.leader)?.key,'spare','fixed exchange target, not newly acquired better shield');
 assert.equal(spareShields(w,w.leader)[0]!.key,'better');assert.equal(unitLoad(w,w.leader),2);
}
{
 const w=fixture();item(w,'pending');startShieldPickup(w,w.leader,'pending');advance(w,1);
 const restored=worldFromCheckpointBody(snapshotSortieWorld(w))!;restored.elapsed+=1.01;tickShieldOperations(restored);assert.equal(equippedShield(restored,restored.leader)?.key,'pending');
 assert(dropOwnedShield(restored,restored.leader,'pending'));assert.equal(restored.shieldState!.identities.shields.pending!.hp,50);assert.equal(unitLoad(restored,restored.leader),0);
}
{
 const w=fixture();item(w,'equipped',1);item(w,'reserve',20);item(w,'ground');
 startShieldPickup(w,w.leader,'equipped');advance(w,2);startShieldPickup(w,w.leader,'reserve');advance(w,2);
 absorbShieldHit(w,w.leader,0,100);startShieldPickup(w,w.leader,'ground');w.leader.pos.x+=5;w.leader.alive=false;dropUnavailableShields(w);advance(w,10);
 assert.equal(equippedShield(w,w.leader),null);assert.equal(spareShields(w,w.leader).length,0);assert.deepEqual(w.shieldState!.ground.reserve,w.leader.pos);
 assert.deepEqual(w.shieldState!.ground.ground,{x:600,y:600},'uncollected target stays at original position');assert.equal(w.shieldState!.exchanges![w.leader.id],undefined);
}
{
 const w=fixture();item(w,'duplicate');w.shieldState!.equipped[w.leader.id]={kind:'shield',key:'duplicate'};
 assert.equal(startShieldPickup(w,w.wingmen[0]!,'duplicate'),'none','a stale ground reference must not clone an owned shield');
 assert.equal(unitLoad(w,w.leader),1);
}
{
 const w=fixture();item(w,'high',40,60);item(w,'wide',30,50);item(w,'newer',30,40);item(w,'older',30,40);
 w.shieldState!.identities.shields.older!.generationOrder='9007199254740992';w.shieldState!.identities.shields.newer!.generationOrder='9007199254740993';
 assert.deepEqual(sortedGroundShields(w,['wide','newer','older','high']),['high','older','newer','wide']);
}
{
 const w=fixture();w.enemies=[];w.wingmen=[];w.leader.instanceId='leader';w.currentAmmo.leader=0;
 item(w,'front',1);item(w,'backup',20);startShieldPickup(w,w.leader,'front');advance(w,2);startShieldPickup(w,w.leader,'backup');advance(w,2);
 const hp=w.leader.hp;w.bullets=[{alive:true,pos:{x:650,y:600},vel:{x:-1000,y:0},ttl:1,damage:100,fromEnemy:true,ownerId:'attacker'}];
 const input={move:{x:0,y:0},clickMove:null,fire:false,interact:false};
 tickWorld(w,.05,input);assert.equal(w.leader.hp,hp);assert.equal(equippedShield(w,w.leader),null);
 tickWorld(w,1.99,input);assert.equal(equippedShield(w,w.leader),null);tickWorld(w,.02,input);assert.equal(equippedShield(w,w.leader)?.key,'backup');
}
{
 const w=fixture();attachCircuitPlay(w,null,false);const passenger=w.wingmen[0]!;passenger.instanceId='passenger';passenger.pos={...w.leader.pos};
 item(w,'front',1);item(w,'reserved',20);startShieldPickup(w,w.leader,'front');advance(w,2);startShieldPickup(w,w.leader,'reserved');advance(w,2);
 absorbShieldHit(w,w.leader,0,100);w.circuitPlay!.wreckChannel[w.leader.id]={id:passenger.id,t:7.9};
 stepCircuitPlay(w,.2);assert.equal(w.circuitPlay!.carry[w.leader.id],undefined,'cannot overload a unit or throw away an exchange reservation');
 assert.equal(w.shieldState!.exchanges![w.leader.id]!.key,'reserved');assert.equal(unitLoad(w,w.leader),1);
}
{
 const w=fixture();attachCircuitPlay(w,null,false);const passenger=w.wingmen[0]!;passenger.instanceId='passenger';passenger.pos={...w.leader.pos};
 for(const key of ['carrier-a','carrier-b','passenger-a','passenger-b'])item(w,key,25,50);
 startShieldPickup(w,w.leader,'carrier-a');advance(w,2);startShieldPickup(w,w.leader,'carrier-b');advance(w,2);
 startShieldPickup(w,passenger,'passenger-a');advance(w,2);startShieldPickup(w,passenger,'passenger-b');advance(w,2);
 assert.equal(startWreckPickup(w,w.leader,passenger.id),'started');stepCircuitPlay(w,8.1);
 assert(w.circuitPlay!.carry[w.leader.id]!.includes(passenger.id));assert.equal(unitLoad(w,w.leader),2);assert.equal(unitLoad(w,passenger),0);
 for(const key of ['carrier-a','carrier-b','passenger-a','passenger-b']){assert(w.shieldState!.ground[key]);assert.equal(w.shieldState!.identities.shields[key]!.hp,25);}
}
console.log('Shield pickup core PASS: 2s equip, movement/range, exclusivity, both capacity checks, no retry, fixed exchange target, reserved weight/disposal, death, checkpoint');
