import assert from 'node:assert/strict';
import { FALSE_BOARD_EFFECT_KEYS, TRUE_BOARD_EFFECT_KEYS, assignMissingEffectKeys, classifyCircuit, buildVerifyPerfectLockedBoard, INITIAL_HUB, normalizeHubSnapshot, createOwnedMech, equipCircuit, squadEquipmentError, applyExploreReturnToHub, type HubCircuitRecord } from '@estg/shared';
import { createWorld, bootstrapFromSearch, startSortie } from './game/world';
import { attachCircuitPlay } from './game/circuitPlay';
import { canStripWreck, startStrippingAt, tickStripping } from './game/strippingRuntime';
import { snapshotSortieWorld, worldFromCheckpointBody } from './game/checkpoint';
import { attachLostMechContext } from './game/lostMechs';
import { attachFieldPersistence, fieldCellReport } from './game/fieldPersistence';
import { makeEnemyIdentity } from './game/enemyIdentity';
import { enemyMode } from './game/enemyBehavior';
import { startShieldPickup, tickShieldOperations } from './game/shieldOperations';
import { equippedShield, absorbShieldHit } from './game/shields';
import { CIRCUIT_EFFECT_LABEL_JA } from './game/statusBadges';
function circuit(id:string,effect=100,owner:string|null='leader'):HubCircuitRecord {
 return {circuitId:id,circuitBoard:buildVerifyPerfectLockedBoard('shield-test'),restoreState:'bypass',origin:'crafted',equippedTo:owner,effectKey:'shield',enemyEffect:effect};
}
assert.equal(FALSE_BOARD_EFFECT_KEYS.at(-1),'piercing_round');
assert(!(TRUE_BOARD_EFFECT_KEYS as readonly string[]).includes('shield'));
assert.equal(CIRCUIT_EFFECT_LABEL_JA.shield,'盾');
const assigned=assignMissingEffectKeys(Array.from({length:300},(_,i)=>{const c=circuit(`new-${i}`);delete c.effectKey;return c;}));
assert(assigned.some(c=>c.effectKey==='shield'),'ordinary new false circuit assignment can yield shield');
const stable=assigned.map((c,i)=>({...c,effectKey:FALSE_BOARD_EFFECT_KEYS[i%19]}));
assert.deepEqual(assignMissingEffectKeys(stable).map(c=>c.effectKey),stable.map(c=>c.effectKey));
const hub=normalizeHubSnapshot({...INITIAL_HUB,fleet:['leader','wing'].map(instanceId=>createOwnedMech('mech_gen1',{instanceId})),circuits:[circuit('first'),circuit('second',7,null)],invadeRank:{current:5,highestCleared:4},frontProgress:{seed:812,aoiHalf:12,opened:[],flagged:[],focus:{sx:0,sy:0}}});
assert.equal(equipCircuit(hub,'second','leader').reason,'category_full');
assert(equipCircuit(hub,'second','wing').ok,'one on each different mech allowed');
assert.equal(squadEquipmentError({...hub,circuits:hub.circuits.map(c=>({...c,equippedTo:'leader'}))},['leader']),'category_full','invalid duplicate loadout cannot deploy');
function fixture(h=hub){
 const w=createWorld(bootstrapFromSearch('?sectorX=1&sectorY=2&density=0.2'));attachLostMechContext(w,h);attachCircuitPlay(w,h,false);attachFieldPersistence(w,h);startSortie(w);
 w.leader.pos={x:600,y:600};w.leader.heading=0;w.leader.salvagedCount=0;w.containers=[];w.coverObjects=[];
 for(const e of w.enemies){e.alive=false;e.hp=0;}
 const e=w.enemies[0]!;e.pos={x:620,y:600};e.enemyIdentity={modelId:'mech_gen1',durability:100,circuits:[{circuitId:'source-shield',side:4,effectKey:'shield',effect:12.75,trueBoard:false}]};
 w.circuitPlay!.loadout[w.leader.id]=[classifyCircuit(circuit('worker',100))];return w;
}
{
 const w=fixture(),e=w.enemies[0]!;w.circuitPlay!.loadout[w.leader.id]=[];
 w.circuitPlay!.loadout[w.wingmen[0]!.id]=[classifyCircuit(circuit('passenger'))];
 w.circuitPlay!.carry[w.leader.id]=[w.wingmen[0]!.id];
 assert(!canStripWreck(w),'passenger circuit does not unlock worker action');
 const before=JSON.stringify({stripping:w.stripping,shieldState:w.shieldState});
 assert.equal(startStrippingAt(w,e.pos,hub,20),'locked');assert.equal(JSON.stringify({stripping:w.stripping,shieldState:w.shieldState}),before,'rejection cannot allocate or reserve');
}
{
 const w=fixture(),e=w.enemies[0]!;assert(canStripWreck(w));assert.equal(startStrippingAt(w,e.pos,hub,20),'started');tickStripping(w,3.25);
 assert.equal(w.stripping!.jobs[e.id]!.source.shieldMaxHp,62.75,'source raw effect, never worker100');
 const checkpoint=worldFromCheckpointBody(snapshotSortieWorld(w))!;tickStripping(checkpoint,4.76);
 const made=Object.values(checkpoint.shieldState!.identities.shields)[0]!;assert.equal(made.maxHp,62.75);assert.equal(made.hp,62.75);
 const report=fieldCellReport(w)!;assert.equal(report.wrecks[0]!.shieldMaxHp,62.75);
 const returned=applyExploreReturnToHub(hub,{returnKind:'extract',sortieId:'shield-circuit-resume',mechWear:[],frontSeed:812,cell:{sx:1,sy:2},fieldCell:report}).hub;
 const next=fixture(returned);const saved=next.enemies.find(x=>x.id===e.id)!;next.enemies=[saved];
 next.leader.pos={x:600,y:600};assert.equal(next.stripping!.jobs[e.id]!.seconds,3.25);assert.equal(startStrippingAt(next,saved.pos,returned,20),'started');tickStripping(next,4.76);
 const key=Object.keys(next.shieldState!.ground)[0]!;const original=structuredClone(next.shieldState!.identities.shields[key]!);
 assert.equal(original.maxHp,62.75,'cross-sortie snapshot preserves fractional source bonus');
 next.circuitPlay!.loadout[next.leader.id]=[];assert(!canStripWreck(next));
 assert.equal(startShieldPickup(next,next.leader,key),'started','pickup without circuit');next.elapsed+=2;tickShieldOperations(next);
 assert(equippedShield(next,next.leader));assert.deepEqual(next.shieldState!.identities.shields[key],original,'pickup never changes identity/HP');
 assert(absorbShieldHit(next,next.leader,0,2),'defense without circuit');assert.equal(equippedShield(next,next.leader)!.shield.hp,60.75);
}
{
 const w=fixture(),e=w.enemies[0]!;e.enemyIdentity!.circuits=[];assert.equal(startStrippingAt(w,e.pos,hub,20),'started');tickStripping(w,8);
 assert.equal(Object.values(w.shieldState!.identities.shields)[0]!.maxHp,50,'worker bonus not applied to ordinary source');
}
{
 const w=fixture(),wing=w.wingmen[0]!;wing.alive=false;wing.hp=0;wing.instanceId='source-wing';wing.pos={x:610,y:600};w.enemies=[];
 w.circuitPlay!.loadout[wing.id]=[classifyCircuit(circuit('friendly-source',12.75))];
 assert.equal(startStrippingAt(w,wing.pos,hub,20),'started');tickStripping(w,8);assert.equal(Object.values(w.shieldState!.identities.shields)[0]!.maxHp,62.75);
}
{
 const w=fixture();w.enemies=[];w.strandedMechs=[{instanceId:'stranded-source',name:'old',pos:{x:620,y:600},wreck:true,found:true,row:{instanceId:'stranded-source',currentAmmo:0,battery:{capacity:300,activity:0},circuitIds:['lost-shield'],kind:'wreck',frontSeed:812,cell:{sx:1,sy:2}}}];
 const sourceHub={...hub,circuits:[...hub.circuits,circuit('lost-shield',12.75,'stranded-source')]};
 assert.equal(startStrippingAt(w,{x:620,y:600},sourceHub,20),'started');tickStripping(w,8);assert.equal(Object.values(w.shieldState!.identities.shields)[0]!.maxHp,62.75,'stranded source uses own stored circuits');
}
{
 const w=fixture(),e=w.enemies[0]!;e.enemyIdentity=makeEnemyIdentity(e,()=>.999,8);
 assert.equal(e.enemyIdentity.circuits.filter(c=>c.effectKey==='shield').length,1,'enemy random candidate includes shield once');
 e.enemyIdentity.circuits=[{circuitId:'shield',side:4,effectKey:'shield',effect:12.75,trueBoard:false},{circuitId:'recover',side:4,effectKey:'recover',effect:12,trueBoard:false}];assert.equal(enemyMode(e),'ambush');
 e.enemyIdentity.circuits[1]!.effect=13;assert.equal(enemyMode(e),'scavenge');
 e.enemyIdentity.circuits[0]!.effect=13;assert.equal(enemyMode(e),'ambush','existing first-generated tie break');
}
console.log('Shield circuit PASS: false-only assignment, stable keys, equip/deploy cap, own unlock, source fractional HP, checkpoint/cell resume, no-circuit pickup/defense, friendly/stranded sources, enemy candidate/ambush/ties');
