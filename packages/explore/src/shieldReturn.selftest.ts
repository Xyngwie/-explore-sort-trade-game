import assert from 'node:assert/strict';
import { INITIAL_HUB, createOwnedMech, normalizeHubSnapshot, createHubSave, serializeHubSave, deserializeHubSave, applyExploreReturnToHub, setFrontProgressInHub, buildExploreToHubWearUrl, parseExploreToHubWearSearch, emptyFieldObjectIdentities, registerWreckIdentity, shieldIdentityFromWreck } from '@estg/shared';
import { createWorld, bootstrapFromSearch, startSortie } from './game/world';
import { attachCircuitPlay } from './game/circuitPlay';
import { attachLostMechContext } from './game/lostMechs';
import { attachFieldPersistence, fieldCellReport } from './game/fieldPersistence';
import { settleReturnedShields, leftBehindShieldState } from './game/shieldReturn';
import { equippedShield, absorbShieldHit } from './game/shields';
import { tickShieldOperations, dropOwnedShield } from './game/shieldOperations';
import { shieldOwnerUnits } from './game/shieldOwners';
import { unitLoad } from './game/carry';
import { rescueAbortSortie, resolveForcedRescueTimeout } from './game/rescue';
import { requestExtract, tickWorld } from './game/sim';
import { snapshotResultWorld, snapshotSortieWorld, worldFromCheckpointBody } from './game/checkpoint';
const hub=normalizeHubSnapshot({...INITIAL_HUB,fleet:['cap','wa','wb'].map(instanceId=>createOwnedMech('mech_gen1',{instanceId})),frontProgress:{seed:812,aoiHalf:12,opened:[],flagged:[],focus:null}});
const idle={move:{x:0,y:0},clickMove:null,fire:false,interact:false};
function fixture(){
 const w=createWorld(bootstrapFromSearch('?sectorX=1&sectorY=2&density=0.2'));attachLostMechContext(w,hub);attachCircuitPlay(w,hub,false);attachFieldPersistence(w,hub);startSortie(w);
 w.enemies=[];w.coverObjects=[];w.containers=[];w.leader.pos={x:600,y:600};w.leader.instanceId='cap';
 w.wingmen[0]!.instanceId='wa';w.wingmen[0]!.pos={x:620,y:600};w.wingmen[1]!.instanceId='wb';w.wingmen[1]!.pos={x:1200,y:1200};
 for(const u of w.wingmen){u.individualOrder=true;u.holdOrder=true;u.moveTarget=null;u.waypoint=null;}
 w.shieldState={identities:emptyFieldObjectIdentities(),equipped:{},spares:{},ground:{}};
 for(const u of [w.leader,...w.wingmen]){
  const key=u.instanceId!;let ids=registerWreckIdentity(w.shieldState.identities,'source-'+key);ids=shieldIdentityFromWreck(ids,'source-'+key,key,{hp:20,maxHp:50});
  w.shieldState.identities=ids;w.shieldState.equipped[u.id]={kind:'shield',key};
 }
 return w;
}
function lift(w:ReturnType<typeof fixture>,miss=false){requestExtract(w);w.elapsed=w.balance.boardingLiftOffDelaySec+.1;if(miss)w.leader.pos={x:900,y:900};tickWorld(w,0,idle);assert.equal(w.phase,'result');}
{
 const w=fixture();lift(w);assert(w.extracted);assert.deepEqual(w.shieldState!.ground.cap,{x:600,y:600});assert.deepEqual(w.shieldState!.ground.wa,{x:620,y:600});assert.equal(w.shieldState!.ground.wb,undefined);
 assert.equal(leftBehindShieldState(w).wb!.equipped!.key,'wb');const before=JSON.stringify(w.shieldState);settleReturnedShields(w);assert.equal(JSON.stringify(w.shieldState),before);
}
for(const timeout of [false,true]){
 const w=fixture();w.leader.alive=false;w.leader.hp=0;
 if(timeout)resolveForcedRescueTimeout(w);else rescueAbortSortie(w,1000);
 assert.equal(w.phase,'result');assert(w.rescueAbort);assert.equal(leftBehindShieldState(w).wa!.equipped!.key,'wa');assert.equal(leftBehindShieldState(w).wb!.equipped!.key,'wb');
 assert.deepEqual(w.shieldState!.ground.cap,{x:600,y:600});assert.equal(w.shieldState!.ground.wa,undefined);
 if(!timeout)assert.equal(w.rescueFeeCredits,500);
 const captured=JSON.stringify(w.shieldState!.ground);settleReturnedShields(w);assert.equal(JSON.stringify(w.shieldState!.ground),captured,'no double drop');
}
{
 const w=fixture();resolveForcedRescueTimeout(w);assert.equal(w.rescueAbort,false);assert.equal(w.shieldState!.ground.cap!.x,600);assert.equal(w.shieldState!.ground.wa!.x,620);assert(leftBehindShieldState(w).wb);
}
{
 const w=fixture();lift(w,true);assert.equal(w.extracted,false);assert.equal(w.failReason,'extract_missed');assert(leftBehindShieldState(w).wb);assert(!leftBehindShieldState(w).wa);assert(w.shieldState!.ground.wa);assert.deepEqual(w.shieldState!.ground.cap,{x:900,y:900});
}
// Round trip, exact shield data, fixed spare target and frozen 0.75 seconds.
{
 const w=fixture(),wing=w.wingmen[1]!;w.elapsed=1.25;
 let ids=registerWreckIdentity(w.shieldState!.identities,'spare-source');ids=shieldIdentityFromWreck(ids,'spare-source','spare',{hp:37.25,maxHp:60});w.shieldState!.identities=ids;
 w.shieldState!.spares![wing.id]=[{kind:'shield',key:'spare'}];absorbShieldHit(w,wing,wing.heading,1000);
 ids=registerWreckIdentity(w.shieldState!.identities,'better-source');ids=shieldIdentityFromWreck(ids,'better-source','better',{hp:50,maxHp:60});w.shieldState!.identities=ids;w.shieldState!.spares![wing.id]!.push({kind:'shield',key:'better'});
 w.elapsed=2.5;w.leftBehind=[{id:wing.id,name:wing.name,reason:'outside_circle'}];settleReturnedShields(w);w.phase='result';
 const report=fieldCellReport(w)!;assert.equal(report.ownedShields!.wb!.exchange!.remaining,.75);assert.equal(report.ownedShields!.wb!.exchange!.key,'spare');
 const lost={instanceId:'wb',currentAmmo:0,battery:{capacity:300,activity:100},circuitIds:[],frontSeed:812,cell:{sx:1,sy:2},kind:'left_behind' as const};
 const payload={returnKind:'extract' as const,sortieId:'shield-return',mechWear:[],frontSeed:812,cell:{sx:1,sy:2},lostMechs:[lost],fieldCell:report};
 const encoded=parseExploreToHubWearSearch(new URL(buildExploreToHubWearUrl(payload,'https://example.test')).search)!;
 const applied=applyExploreReturnToHub(hub,encoded);assert(applied.applied);assert(applied.hub.lostMechShields!.wb);assert.equal(applyExploreReturnToHub(applied.hub,encoded).applied,false);
 const loaded=deserializeHubSave(serializeHubSave(createHubSave(applied.hub)))!.hub;assert.equal(loaded.lostMechShields!.wb!.exchange!.remaining,.75);
 const savedShield=loaded.fieldObjectIdentities!.shields.spare;
 const next=createWorld(bootstrapFromSearch('?sectorX=1&sectorY=2&density=0.2'));attachLostMechContext(next,loaded);attachCircuitPlay(next,loaded,false);attachFieldPersistence(next,loaded);startSortie(next);
 next.leader.salvagedCount=1;const owner=shieldOwnerUnits(next).find(u=>u.id==='s:wb')!;assert(owner);assert.equal(equippedShield(next,owner),null);assert.equal(unitLoad(next,owner),2);assert.equal(dropOwnedShield(next,owner,'spare'),false);
 next.elapsed=.74;tickShieldOperations(next);assert.equal(equippedShield(next,owner),null);
 const resumed=worldFromCheckpointBody(snapshotSortieWorld(next))!;resumed.elapsed=.76;tickShieldOperations(resumed);assert.equal(equippedShield(resumed,owner)?.key,'spare');assert.deepEqual(resumed.shieldState!.identities.shields.spare,savedShield);
 const reset=setFrontProgressInHub(loaded,{...loaded.frontProgress!,seed:999});assert.deepEqual(reset.fieldCells,[]);assert.equal(reset.fieldObjectIdentities!.shields.cap,undefined);assert.deepEqual(reset.fieldObjectIdentities!.shields.spare,savedShield);assert.equal(reset.lostMechShields!.wb!.exchange!.remaining,.75);
 // Refused-write result checkpoint retains all field/ownership report data.
 const replay=worldFromCheckpointBody(snapshotResultWorld(w))!;assert.deepEqual(JSON.parse(JSON.stringify(fieldCellReport(replay))),JSON.parse(JSON.stringify(report)));
 // A reappeared owner recovered later must drop its fixed exchange spare,
 // not bring it to HUB or retain a second owner record.
 next.recoveredLostMechIds=['wb'];next.leftBehind=[];settleReturnedShields(next);next.phase='result';
 const recoveryReport=fieldCellReport(next)!;assert.equal(recoveryReport.ownedShields!.wb,undefined);assert(recoveryReport.ground.spare);
 const recovery=applyExploreReturnToHub(loaded,{returnKind:'extract',sortieId:'recover-wb',mechWear:[],frontSeed:812,cell:{sx:1,sy:2},recoveredLostMechInstanceIds:['wb'],fieldCell:recoveryReport}).hub;
 assert(!recovery.lostMechShields?.wb);assert(recovery.fleet.some(m=>m.instanceId==='wb'));assert.equal(recovery.fieldObjectIdentities!.shields.spare!.hp,37.25);
 assert.equal(normalizeHubSnapshot(INITIAL_HUB).lostMechShields,undefined);
 const corrupt=structuredClone(loaded);corrupt.lostMechShields!.wb!.exchange!.remaining=3;assert.throws(()=>normalizeHubSnapshot(corrupt));
}
console.log('Shield return PASS: normal/rescue/alive-timeout/dead-timeout/missed, once, owned save+URL+IDs, frozen fixed exchange/reload/weight/drop lock, regeneration separation and legacy');
