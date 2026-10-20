import assert from 'node:assert/strict';
import { classifyCircuit, buildVerifyPerfectLockedBoard, INITIAL_HUB, normalizeHubSnapshot, applyExploreReturnToHub, emptyFieldObjectIdentities, registerWreckIdentity, shieldIdentityFromWreck, frontBoard } from '@estg/shared';
import { createWorld, bootstrapFromSearch, startSortie } from './game/world';
import { attachLostMechContext } from './game/lostMechs';
import { attachCircuitPlay } from './game/circuitPlay';
import { attachFieldPersistence, fieldCellReport } from './game/fieldPersistence';
import { startStrippingAt, tickStripping } from './game/strippingRuntime';
import { handleEnemyDeaths } from './game/enemyBehavior';
import { snapshotResultWorld, worldFromCheckpointBody } from './game/checkpoint';
import { directFieldEntry, directFieldEntryFromStorage } from './game/directFieldEntry';
const hub=normalizeHubSnapshot({...INITIAL_HUB,frontProgress:{seed:812,aoiHalf:12,opened:[],flagged:[],focus:{sx:7,sy:7}}});
const search='?sectorX=1&sectorY=2&density=0.2';
function fresh(h=hub,s=search){const w=createWorld(bootstrapFromSearch(s));attachLostMechContext(w,h);attachCircuitPlay(w,h,false);w.circuitPlay!.loadout[w.leader.id]=[classifyCircuit({circuitId:'worker-shield',circuitBoard:buildVerifyPerfectLockedBoard('test'),restoreState:'bypass',origin:'crafted',equippedTo:null,effectKey:'shield',enemyEffect:4})];attachFieldPersistence(w,h);startSortie(w);return w;}
const w=fresh();w.leader.pos={x:600,y:600};const e=w.enemies[0]!;e.pos={x:620,y:600};e.alive=false;e.hp=0;
w.enemies=[e];
assert.equal(startStrippingAt(w,e.pos,hub,20),'started');tickStripping(w,3.25);
let ids=registerWreckIdentity(w.shieldState!.identities,'shield-source');ids=shieldIdentityFromWreck(ids,'shield-source','ground',{hp:17.25,maxHp:50});
w.shieldState!.identities=ids;w.shieldState!.ground.ground={x:610,y:600};
const report=fieldCellReport(w)!;const reportAgain=fieldCellReport(w)!;assert.deepEqual(report,reportAgain,'capture is pure and cannot allocate repeatedly');
assert.equal(report.wrecks[0]!.seconds,3.25);assert.equal((report.wrecks[0] as any).reservation,undefined);
const returned=applyExploreReturnToHub(hub,{returnKind:'extract',sortieId:'test-field',mechWear:[],frontSeed:812,cell:{sx:1,sy:2},fieldCell:report}).hub;
const next=fresh(returned);assert.equal(next.shieldState!.identities.shields.ground!.hp,17.25);
const corpse=next.enemies.find(u=>u.id===e.id)!;assert(corpse && !corpse.alive);assert.deepEqual(corpse.enemyIdentity,e.enemyIdentity,'enemy wreck circuit identity does not reroll');
assert(next.enemies.some(u=>u.alive && u.id!==e.id),'new enemies still generated independently');
assert.equal(next.stripping!.jobs[e.id]!.reservation,null);assert.equal(next.stripping!.jobs[e.id]!.seconds,3.25);
next.enemySupplies=[];handleEnemyDeaths(next);assert.equal(next.enemySupplies.length,0,'restoring a wreck must not mint ammo/power again');
next.leader.pos={x:600,y:600};assert.equal(startStrippingAt(next,corpse.pos,returned,20),'started');tickStripping(next,4.76);
assert.equal(Object.keys(next.shieldState!.ground).length,2,'only the remaining stripping time is needed');
const finished=fieldCellReport(next)!;assert.equal(finished.wrecks.length,0,'consumed source never respawns');
assert.deepEqual(finished.identities.shields.ground,report.identities.shields.ground);
const another=fresh(returned,'?sectorX=2&sectorY=2&density=0.2');assert.deepEqual(another.shieldState!.ground,{});assert(!another.enemies.some(u=>u.id===e.id));
// Result checkpoints omit all enemies: retain the prepared field report for write-refused retry.
w.phase='result';const reloaded=worldFromCheckpointBody(snapshotResultWorld(w))!;
assert.equal(reloaded.enemies.length,0);assert.deepEqual(fieldCellReport(reloaded),report);
// Direct entry always HQ, shares the seed, and never adds scouting/flags or alters focus.
const entry=directFieldEntry('?deployedInstanceIds=leader',hub);const p=new URLSearchParams(entry.search);
assert.equal(p.get('sectorX'),'0');assert.equal(p.get('sectorY'),'0');assert.equal(entry.hub,hub);assert.equal(entry.created,false);
assert.equal(p.get('neighborCount'),String(frontBoard.getCell(frontBoard.generateBoard(12,812),0,0)!.adjacent));
assert.deepEqual(hub.frontProgress!.focus,{sx:7,sy:7});assert.deepEqual(hub.frontProgress!.opened,[]);
const brandNew=directFieldEntry('',normalizeHubSnapshot(INITIAL_HUB),()=>.5);assert(brandNew.created);assert.equal(brandNew.hub.frontProgress!.seed,0x80000000);assert.deepEqual(brandNew.hub.frontProgress!.opened,[]);
assert.equal(directFieldEntry(search,hub).search,search,'explicit sector survives unchanged');
assert.equal(directFieldEntryFromStorage('',{getItem:()=>null,setItem:()=>{throw Error();}}),null,'no synthetic save invented');
console.log('Field persistence PASS: pure snapshot, precise shield, same/other cell, fixed corpse/new enemies, strip resume/exclusion, no repeated loot, result retry, shared HQ direct entry/no scouting');
// A pre-#312 result checkpoint cannot erase a newer stored cell with an empty snapshot.
const legacy=worldFromCheckpointBody(snapshotResultWorld(w))!;delete legacy.fieldReturnReport;delete legacy.fieldPersistenceEnabled;
assert.equal(fieldCellReport(legacy),undefined);
// A friendly wreck changes runtime id from wing-a to s:<instance> across sorties.
{
 const old=fresh();old.enemies=[];old.leader.pos={x:600,y:600};
 const wing=old.wingmen[0]!;wing.instanceId='friendly-progress';wing.pos={x:620,y:600};wing.alive=false;wing.hp=0;
 assert.equal(startStrippingAt(old,wing.pos,hub,20),'started');tickStripping(old,2.5);
 const r=fieldCellReport(old)!;assert.equal(r.wrecks[0]!.targetId,'s:friendly-progress');
 const h=normalizeHubSnapshot({...hub,lostMechs:[{instanceId:wing.instanceId,mechId:'mech_gen1',currentAmmo:0,battery:{capacity:300,activity:0},circuitIds:[],kind:'wreck',pos:wing.pos,frontSeed:812,cell:{sx:1,sy:2}}]});
 const applied=applyExploreReturnToHub(h,{returnKind:'extract',sortieId:'friendly-remap',mechWear:[],frontSeed:812,cell:{sx:1,sy:2},fieldCell:r}).hub;
 const newWorld=fresh(applied);assert.equal(newWorld.stripping!.jobs['s:friendly-progress']!.seconds,2.5);
 assert.equal(newWorld.stripping!.jobs['s:friendly-progress']!.reservation,null);
}
// Legacy anonymous air-support wreck keeps its a: identity and partial job.
{
 const old=fresh();old.enemies=[];old.leader.pos={x:600,y:600};old.circuitPlay!.airWrecks=[{id:'legacy-air',pos:{x:620,y:600},recovered:false}];
 assert.equal(startStrippingAt(old,{x:620,y:600},hub,20),'started');tickStripping(old,1.5);
 const r=fieldCellReport(old)!;assert.equal(r.wrecks[0]!.legacyAir,true);
 const h=applyExploreReturnToHub(hub,{returnKind:'extract',sortieId:'air-remap',mechWear:[],frontSeed:812,cell:{sx:1,sy:2},fieldCell:r}).hub;
 const newWorld=fresh(h);assert.equal(newWorld.circuitPlay!.airWrecks[0]!.id,'legacy-air');assert.equal(newWorld.stripping!.jobs['a:legacy-air']!.seconds,1.5);
}
// Refused creation cannot silently start a transient, unsaved battlefield.
{
 const {createHubSave,serializeHubSave,HUB_SAVE_STORAGE_KEY}=await import('@estg/shared');
 const raw=serializeHubSave(createHubSave(normalizeHubSnapshot(INITIAL_HUB)));
 assert.throws(()=>directFieldEntryFromStorage('',{getItem:key=>key===HUB_SAVE_STORAGE_KEY?raw:null,setItem:()=>{throw Error('denied');}}),/field_save_refused/);
}

// URL cleanup must not send a resumed operation's 再出撃 to an unlocated field.
{
 const {checkpointSortieSearch,resortieSearch}=await import('./game/resortie');
 const restoredSearch=checkpointSortieSearch('?deployedInstanceIds=leader',w.invadeSector);
 const q=new URLSearchParams(restoredSearch);assert.equal(q.get('sectorX'),'1');assert.equal(q.get('sectorY'),'2');
 assert.equal(new URLSearchParams(checkpointSortieSearch('?sectorX=9&sectorY=9&density=1',w.invadeSector)).get('sectorX'),'1','resumed checkpoint owns its location even when incoming URL names a different sector');
 const {createOwnedMech}=await import('@estg/shared');
 const deploy=normalizeHubSnapshot({...hub,fleet:[createOwnedMech('mech_gen1',{instanceId:'leader'})]});
 const next=resortieSearch(restoredSearch,deploy,['leader'])!;assert.equal(new URLSearchParams(next.search).get('sectorY'),'2');
}

// Owner Q3=A: unstarted enemy wrecks keep the existing per-sortie generation rule.
{
 const untouched=fresh();untouched.enemies=untouched.enemies.slice(0,1);untouched.enemies[0]!.alive=false;untouched.enemies[0]!.hp=0;
 assert.deepEqual(fieldCellReport(untouched)!.wrecks,[]);
}
