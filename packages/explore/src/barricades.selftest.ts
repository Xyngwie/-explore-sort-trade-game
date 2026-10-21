import assert from 'node:assert/strict';
import { buildVerifyPerfectLockedBoard, classifyCircuit, emptyFieldObjectIdentities, registerWreckIdentity, shieldIdentityFromWreck, TRUE_BOARD_EFFECT_KEYS, FALSE_BOARD_EFFECT_KEYS, assignMissingEffectKeys, normalizeHubSnapshot, INITIAL_HUB, createOwnedMech, equipCircuit, squadEquipmentError, applyExploreReturnToHub, clearFrontProgressInHub, normalizeFieldCellReport, createHubSave, serializeHubSave, deserializeHubSave, type HubCircuitRecord } from '@estg/shared';
import { createWorld, bootstrapFromSearch, startSortie } from './game/world';
import { attachCircuitPlay, openWingPalette, pressWingPalette, wingmanPaletteActions } from './game/circuitPlay';
import { startBarricade, startDismantle, tickBarricades, canBuildBarricade, placementFor, barricadeWorking, wallEntries } from './game/barricades';
import { wallContact, wallOverlap, wallCircleOverlap } from './game/barricadeGeometry';
import { attachLostMechContext } from './game/lostMechs';
import { attachFieldPersistence, fieldCellReport } from './game/fieldPersistence';
import { snapshotSortieWorld, worldFromCheckpointBody } from './game/checkpoint';
import { startStrippingAt } from './game/strippingRuntime';
import { startShieldPickup, tickShieldOperations } from './game/shieldOperations';
import { equippedShield } from './game/shields';
import { getCoverObjects } from './game/coverObjects';
import { obstacleMove } from './game/coverMovement';
import { tickWorld, updateBullets } from './game/sim';
import { applyOrder } from './game/orders';
import { settleReturnedShields } from './game/shieldReturn';
function circuit(id:string,key='p_shield',owner:string|null='leader'):HubCircuitRecord {return{circuitId:id,circuitBoard:buildVerifyPerfectLockedBoard('test'),restoreState:key==='p_shield'?'fully_awakened':'bypass',origin:'crafted',equippedTo:owner,effectKey:key};}
function fixture(){
 const w=createWorld(bootstrapFromSearch('?sectorX=1&sectorY=2&density=0.2'));startSortie(w);attachCircuitPlay(w,null,true);w.coverObjects=[];w.containers=[];
 w.leader.pos={x:600,y:600};w.leader.heading=0;w.leader.moveTarget=null;w.leader.playerMoveTarget=null;
 for(const u of [...w.wingmen,...w.enemies]){u.pos={x:1100,y:1100};u.alive=false;u.hp=0;}
 w.circuitPlay!.loadout[w.leader.id]=[classifyCircuit(circuit('p'))];
 const ids=shieldIdentityFromWreck(registerWreckIdentity(emptyFieldObjectIdentities(),'source'),'source','shield',{hp:47.25,maxHp:62.75});
 w.shieldState={identities:ids,ground:{},equipped:{[w.leader.id]:{kind:'shield',key:'shield'}}};return w;
}
function build(w:ReturnType<typeof fixture>){assert(startBarricade(w,w.leader));tickBarricades(w,2);assert.equal(wallEntries(w).length,1);}
const idle={move:{x:0,y:0},clickMove:null,fire:false,interact:false};
assert(TRUE_BOARD_EFFECT_KEYS.includes('p_shield'));assert(!(FALSE_BOARD_EFFECT_KEYS as readonly string[]).includes('p_shield'));
const candidates=assignMissingEffectKeys(Array.from({length:200},(_,i)=>{const c=circuit(`new-p-${i}`);delete c.effectKey;return c;}));assert(candidates.some(c=>c.effectKey==='p_shield'));
const saved=candidates.map(c=>({...c,effectKey:'march'}));assert.deepEqual(assignMissingEffectKeys(saved).map(c=>c.effectKey),saved.map(c=>c.effectKey));
{
 const hub=normalizeHubSnapshot({...INITIAL_HUB,fleet:[createOwnedMech('mech_gen1',{instanceId:'leader'})],invadeRank:{current:5,highestCleared:4},circuits:[circuit('s','shield'),circuit('p','p_shield',null),circuit('p2','p_shield',null),circuit('s2','shield',null)]});
 const next=equipCircuit(hub,'p','leader');assert(next.ok);assert.equal(equipCircuit(next.hub,'p2','leader').reason,'category_full');assert.equal(equipCircuit(next.hub,'s2','leader').reason,'category_full');
 assert.equal(squadEquipmentError(next.hub,['leader']),null);
 const w=fixture();assert.equal(startStrippingAt(w,{x:0,y:0},null,20),'locked','P alone cannot strip');w.circuitPlay!.loadout[w.leader.id]=[classifyCircuit(circuit('s','shield'))];assert(!canBuildBarricade(w,w.leader));
}
{
 const w=fixture(),before=structuredClone(w.shieldState!.identities.shields.shield);assert(startBarricade(w,w.leader));tickBarricades(w,1.25);assert(equippedShield(w,w.leader));
 const restored=worldFromCheckpointBody(snapshotSortieWorld(w))!;assert.equal(restored.barricades!.jobs.leader!.seconds,1.25);tickBarricades(restored,.74);assert.equal(wallEntries(restored).length,0);restored.leader.heading=Math.PI/2;tickBarricades(restored,.02);
 assert.equal(wallEntries(restored).length,1);assert.equal(restored.barricades!.walls.shield!.heading,Math.PI/2);assert.equal(equippedShield(restored,restored.leader),null);assert.deepEqual(restored.shieldState!.identities.shields.shield,before);
}
{
 const w=fixture();const wing=w.wingmen[0]!;wing.alive=true;wing.hp=80;wing.pos={x:800,y:600};wing.heading=Math.PI/2;
 assert(!canBuildBarricade(w,wing));assert(!wingmanPaletteActions(w,[wing.id]).some(a=>a.id==='barricade'));
 w.circuitPlay!.loadout[wing.id]=[classifyCircuit(circuit('wing-p'))];w.shieldState!.equipped[wing.id]=w.shieldState!.equipped.leader!;delete w.shieldState!.equipped.leader;
 w.circuitPlay!.carry.leader=[wing.id];assert(!startBarricade(w,wing));delete w.circuitPlay!.carry.leader;
 assert(openWingPalette(w,[wing.id]));assert(pressWingPalette(w,'barricade'));tickBarricades(w,2);assert.deepEqual(w.barricades!.walls.shield,placementFor(wing));assert(!equippedShield(w,wing));
}
for(const reason of ['move','order','death','shield','timeout']){
 const w=fixture();assert(startBarricade(w,w.leader));tickBarricades(w,.5);
 if(reason==='move')tickWorld(w,.01,{...idle,move:{x:1,y:0}});
 if(reason==='order') {const wing=w.wingmen[0]!;wing.alive=true;w.barricades!.jobs[wing.id]=w.barricades!.jobs.leader!;delete w.barricades!.jobs.leader;applyOrder(w,wing,'escort',{individual:true});}
 if(reason==='death')w.leader.alive=false;
 if(reason==='shield')delete w.shieldState!.identities.shields.shield;
 if(reason==='timeout')w.operationTimedOut=true;
 tickBarricades(w,2);assert.equal(wallEntries(w).length,0);assert.equal(Object.keys(w.barricades!.jobs).length,0);
}
{
 const w=fixture();assert(startBarricade(w,w.leader));tickWorld(w,.5,{...idle,fire:true});assert(barricadeWorking(w,'leader'));assert.deepEqual(w.leader.pos,{x:600,y:600});assert(!w.bullets.some(b=>b.ownerId==='leader'));
 // Incoming rear hit damages armor but does not cancel stationary construction.
 w.bullets=[{alive:true,pos:{x:550,y:600},vel:{x:1000,y:0},ttl:1,damage:1,fromEnemy:true,ownerId:'attacker'}];updateBullets(w,.1);assert(barricadeWorking(w,'leader'));tickBarricades(w,1.5);assert.equal(wallEntries(w).length,1);
}
for(const obstacle of ['unit','cover','wall']){
 const w=fixture(),p=placementFor(w.leader);
 if(obstacle==='unit'){const e=w.enemies[0]!;e.alive=true;e.hp=100;e.pos={...p.pos};}
 if(obstacle==='cover')w.coverObjects=[{id:'cover',pos:p.pos,radius:30}];
 if(obstacle==='wall')w.barricades={walls:{other:p},jobs:{}};
 assert(!startBarricade(w,w.leader));assert(equippedShield(w,w.leader));
}
{
 const w=fixture();assert(startBarricade(w,w.leader));getCoverObjects(w).push({id:'later',pos:placementFor(w.leader).pos,radius:30});tickBarricades(w,2);assert.equal(wallEntries(w).length,0);assert(equippedShield(w,w.leader),'completion overlap does not consume');
}
for(const angle of [0,Math.PI/4,Math.PI/2]){
 const wall={pos:{x:600,y:600},heading:angle};assert(wallContact(wall,{x:400,y:600},{x:800,y:600}));assert(wallOverlap(wall,wall));
 const w=fixture();w.leader.pos={x:400,y:600};w.barricades={walls:{shield:wall},jobs:{}};delete w.shieldState!.equipped.leader;
 const end=obstacleMove(w,w.leader,{x:800,y:600});assert(!wallCircleOverlap(wall,end,w.leader.radius),'high-dt sweep ends outside');assert(!wallContact(wall,w.leader.pos,end,w.leader.radius),'resolved sweep stays on the original side or goes around');
 const enemy={...w.leader,kind:'enemy' as const};assert.deepEqual(obstacleMove(w,enemy,{x:800,y:600}),end,'factions use same physical sweep');
}
for(const fromEnemy of [false,true])for(const emp of [false,true]){
 const w=fixture();build(w);const wall=w.barricades!.walls.shield!;w.leader.pos={x:500,y:600};const hp=w.leader.hp;
 w.bullets=[{alive:true,pos:{x:700,y:600},vel:{x:-2000,y:0},ttl:1,damage:7.5,fromEnemy,ownerId:'shooter',emp,empSlow:.5}];updateBullets(w,.15);assert.equal(w.shieldState!.identities.shields.shield!.hp,39.75,'raw damage without unit DR');assert.equal(w.leader.hp,hp);assert.equal(w.circuitPlay!.emp.leader,undefined,'EMP status stops at wall');assert.equal(w.bullets.length,0);
 w.bullets=[{alive:true,pos:{x:700,y:600},vel:{x:-2000,y:0},ttl:1,damage:9999,fromEnemy,ownerId:'shooter',emp,empSlow:.5}];updateBullets(w,.15);assert.equal(w.barricades!.walls.shield,undefined);assert.equal(w.shieldState!.identities.shields.shield,undefined);assert.equal(w.leader.hp,hp,'overkill consumed');
}
{
 const w=fixture();build(w);const original=structuredClone(w.shieldState!.identities.shields.shield);assert(startDismantle(w,'shield'));tickBarricades(w,1.25);
 const r=worldFromCheckpointBody(snapshotSortieWorld(w))!;tickBarricades(r,.76);assert.equal(wallEntries(r).length,0);assert(r.shieldState!.ground.shield);assert.deepEqual(r.shieldState!.identities.shields.shield,original);assert(!equippedShield(r,r.leader));
 assert(startShieldPickup(r,r.leader,'shield')==='started');r.elapsed+=1.99;tickShieldOperations(r);assert(!equippedShield(r,r.leader));r.elapsed+=.02;tickShieldOperations(r);assert(equippedShield(r,r.leader));
}
{
 const w=fixture();build(w);w.shieldState!.ground.shield={x:600,y:600};assert.equal(worldFromCheckpointBody(snapshotSortieWorld(w)),null,'duplicate wall/ground rejected');
}
{
 const hub=normalizeHubSnapshot({...INITIAL_HUB,frontProgress:{seed:812,aoiHalf:12,opened:[],flagged:[],focus:null}}),w=fixture();w.sortieLocation={frontSeed:812,cell:{sx:1,sy:2}};w.fieldPersistenceEnabled=true;build(w);
 const report=fieldCellReport(w)!;assert(report.barricades!.shield);assert(report.identities.shields.shield);assert(!report.ground.shield);
 const returned=applyExploreReturnToHub(hub,{returnKind:'extract',sortieId:'p-wall',mechWear:[],frontSeed:812,cell:{sx:1,sy:2},fieldCell:report}).hub;
 assert.deepEqual(deserializeHubSave(serializeHubSave(createHubSave(returned)))!.hub.fieldCells,returned.fieldCells);
 const duplicate=structuredClone(report);duplicate.ground.shield={x:0,y:0};assert.equal(normalizeFieldCellReport(duplicate),undefined,'field duplicate ownership refused');
 const invalid=structuredClone(report);invalid.barricades!.shield!.heading=NaN;assert.equal(normalizeFieldCellReport(invalid),undefined);
 const next=createWorld(bootstrapFromSearch('?sectorX=1&sectorY=2&density=.2'));attachLostMechContext(next,returned);attachCircuitPlay(next,returned,false);attachFieldPersistence(next,returned);startSortie(next);assert.deepEqual(next.barricades!.walls,w.barricades!.walls);assert.equal(next.shieldState!.identities.shields.shield!.hp,47.25);
 assert.equal(clearFrontProgressInHub(returned).fieldObjectIdentities!.shields.shield,undefined);
 for(const kind of ['extract','abort','fail']){const r=fixture();build(r);assert(startDismantle(r,'shield'));r.leader.alive=kind==='extract';settleReturnedShields(r);assert.equal(wallEntries(r).length,1);assert.equal(Object.keys(r.barricades!.jobs).length,0);}
}
{
 const w=fixture(),wing=w.wingmen[0]!;wing.alive=true;wing.hp=100;wing.pos={x:600,y:600};w.leader.pos={...wing.pos};
 w.shieldState!.equipped[wing.id]=w.shieldState!.equipped.leader!;delete w.shieldState!.equipped.leader;
 w.circuitPlay!.loadout[wing.id]=[classifyCircuit(circuit('carrier-p'))];
 w.leader.instanceId='leader';w.circuitPlay!.carry[wing.id]=[w.leader.id];assert(startBarricade(w,wing));tickWorld(w,.1,{...idle,move:{x:1,y:0}});assert(!barricadeWorking(w,wing.id),'manual carrier control interrupts construction');
}
console.log('P shield/barricades PASS: true-only keys, independent limits, own leader/wingman eligibility, 2s build/dismantle, interruption/damage, rectangle sweeps, raw/EMP/overkill, exact identity, checkpoints, field return/regeneration and duplicate refusal');
