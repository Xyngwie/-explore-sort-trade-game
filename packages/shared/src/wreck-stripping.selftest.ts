import assert from 'node:assert/strict';
import { INITIAL_HUB, normalizeHubSnapshot, createHubSave, serializeHubSave, deserializeHubSave, type HubCircuitRecord } from './hub-save';
import { createOwnedMech } from './mech-fleet';
import { createEmptyCircuitBoard } from './circuit-board';
import { applyExploreReturnToHub } from './sortie-return';
import { buildExploreToHubWearUrl, parseExploreToHubWearSearch, type ExploreToHubWearPayload } from './handoff';
import { normalizeWreckStrippingReport } from './wreck-stripping';
const mech=createOwnedMech('mech_gen1',{instanceId:'stripped-mech'});
const circuit:HubCircuitRecord={circuitId:'strip-c',circuitBoard:createEmptyCircuitBoard(2,2,'strip-c'),restoreState:'unrestored',outcome:'offline',origin:'crafted',equippedTo:mech.instanceId};
const observation={targetId:'wing',sourceInstanceId:mech.instanceId,wreckId:'10',shieldId:'10',generationOrder:'4',at:'2026-10-19T00:00:00.000Z',circuits:[{circuitId:'strip-c',side:2,effect:3}],learningValue:null};
const wear:ExploreToHubWearPayload={returnKind:'extract',sortieId:'strip-once',mechWear:[{instanceId:mech.instanceId,durabilityAfter:0}],wreckStripping:{observations:[observation],nextWreckId:'11',nextShieldOrder:'5'}};
const hub=normalizeHubSnapshot({...INITIAL_HUB,fleet:[mech],circuits:[circuit],sortieSelection:[mech.instanceId]});
assert.equal(hub.circuits.length,1,"fixture has a real saved circuit");
const originalHub=structuredClone(hub);
const payload=parseExploreToHubWearSearch(new URL(buildExploreToHubWearUrl(wear,'http://example.test/')).search)!;
assert.deepEqual(payload.wreckStripping,wear.wreckStripping);
const result=applyExploreReturnToHub(hub,payload);assert(result.applied);assert.equal(result.hub.fleet.length,0);assert.equal(result.hub.circuits.length,0);
assert.equal(result.hub.wreckStrippingHistory!.length,1);assert.equal(result.hub.wreckStrippingHistory![0]!.learningValue,null);
assert.equal(result.hub.fieldObjectIdentities!.nextWreckId,'11');assert.equal(result.hub.fieldObjectIdentities!.nextShieldOrder,'5');
assert.equal(applyExploreReturnToHub(result.hub,payload).applied,false);
const persisted=deserializeHubSave(serializeHubSave(createHubSave(result.hub)))!;
assert.deepEqual(persisted.hub.wreckStrippingHistory,result.hub.wreckStrippingHistory);assert.equal(persisted.hub.fleet.length,0);assert.equal(persisted.hub.circuits.length,0);
const lost=normalizeHubSnapshot({...hub,fleet:[],lostMechs:[{...mech,kind:'wreck',currentAmmo:0,circuitIds:['strip-c'],frontSeed:3,cell:{sx:0,sy:0},lostSortieId:'previous'}]});
assert.equal(applyExploreReturnToHub(lost,payload).hub.lostMechs.length,0);
assert.equal(parseExploreToHubWearSearch('?returnKind=extract&mechWear=&wreckStripping=%7Bbad').wreckStripping,undefined);
assert.equal(normalizeWreckStrippingReport({observations:[{...observation,learningValue:99}],nextWreckId:'11',nextShieldOrder:'5'}),undefined);
assert.deepEqual(hub,originalHub);assert.equal(hub.circuits.length,1,'pure apply leaves source unchanged');
// Audit regression: inconsistent result has BOTH stripped and recovered enemy.
{
 const enemyId='enemy-audit-case', recoveredId=`recovered-${enemyId}`;
 const enemyObservation={...observation,targetId:enemyId,sourceInstanceId:null};
 const mixed:ExploreToHubWearPayload={returnKind:'extract',sortieId:'mixed-enemy',mechWear:[],
   enemyWrecks:[{instanceId:recoveredId,circuits:[{...circuit,equippedTo:recoveredId}]}],
   wreckStripping:{observations:[enemyObservation],nextWreckId:'11',nextShieldOrder:'5'}};
 const mixedResult=applyExploreReturnToHub(normalizeHubSnapshot({...INITIAL_HUB,fleet:[],circuits:[]}),mixed);
 assert(!mixedResult.hub.fleet.some(m=>m.instanceId===recoveredId),'stripped enemy must not reappear as an empty hull via enemyWrecks');
 assert(!mixedResult.hub.circuits.some(c=>c.circuitId==='strip-c'));
 const replayed=applyExploreReturnToHub(mixedResult.hub,mixed);assert(!replayed.applied);
 const late=applyExploreReturnToHub(mixedResult.hub,{returnKind:'extract',sortieId:'late-stale-enemy',mechWear:[],enemyWrecks:mixed.enemyWrecks});
 assert(!late.hub.fleet.some(m=>m.instanceId===recoveredId),'saved stripping history rejects a stale enemy return without a new stripping report');
 const emptyPayload={...mixed,sortieId:'empty-enemy',wreckStripping:{...mixed.wreckStripping!,observations:[{...enemyObservation,circuits:[]}]}};
 assert(!applyExploreReturnToHub(hub,emptyPayload).hub.fleet.some(m=>m.instanceId===recoveredId),'a circuitless stripped enemy cannot return as a hull');
 const polluted=normalizeHubSnapshot({...INITIAL_HUB,fleet:[createOwnedMech('mech_gen1',{instanceId:recoveredId})],circuits:[{...circuit,equippedTo:recoveredId}]});
 const cleaned=applyExploreReturnToHub(polluted,mixed).hub;
 assert(!cleaned.fleet.some(m=>m.instanceId===recoveredId));assert(!cleaned.circuits.some(c=>c.equippedTo===recoveredId),'preexisting recovered copy also removed');
 const viaUrl=parseExploreToHubWearSearch(new URL(buildExploreToHubWearUrl(mixed,'http://example.test')).search)!;
 assert(!applyExploreReturnToHub(hub,viaUrl).hub.fleet.some(m=>m.instanceId===recoveredId),'same protection via the hangar URL');
 const air={...mixed,sortieId:'legacy-air',wreckStripping:{...mixed.wreckStripping!,observations:[{...enemyObservation,targetId:`a:${enemyId}`} ]}};
 assert(!applyExploreReturnToHub(hub,air).hub.fleet.some(m=>m.instanceId===recoveredId),'legacy a: target resolves to the same acquired enemy hull');
 const control='recovered-enemy-not-stripped';
 const controlResult=applyExploreReturnToHub(mixedResult.hub,{returnKind:'extract',sortieId:'control-return',mechWear:[],enemyWrecks:[{instanceId:control,circuits:[]}]});
 assert(controlResult.hub.fleet.some(m=>m.instanceId===control),'unrelated enemy recovery remains enabled');

}
console.log('Wreck stripping return PASS: URL, fleet/circuit/lost removal, once, history/counters save, invalid/legacy');
