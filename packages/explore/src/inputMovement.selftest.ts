import assert from "node:assert/strict";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { attachCircuitPlay, placeCarried, handleMapTap } from "./game/circuitPlay";
import { backfillEnemyState } from "./game/enemyBehavior";
import { getCoverObjects } from "./game/coverObjects";
import { tickWorld, type PlayerInput } from "./game/sim";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { clearFiringLine, friendlyFireRisk } from "./game/projectiles";
import { IDENTITY_ABILITY_SCALE } from "./game/releaseAbility";

const idle = (): PlayerInput => ({move:{x:0,y:0},clickMove:null,fire:false,interact:false});
function fixture() {
  const w = createWorld(bootstrapFromSearch("?deployedInstanceIds=a,b,c&deployableMechs=3&mechBattery=a:300:300;b:300:300;c:300:300"));
  startSortie(w); attachCircuitPlay(w,null,true); getCoverObjects(w).splice(0);
  w.leader.pos = {x:400,y:400}; w.leader.heading = 0;
  for (const u of [w.leader,...w.wingmen]) {
    w.circuitPlay!.ability[u.id] = {...IDENTITY_ABILITY_SCALE};
    u.moveTarget = null;
  }
  for (const u of w.wingmen) u.pos = {x:1000,y:1000};
  backfillEnemyState(w);
  for (const e of w.enemies) { e.alive=false; e.hp=0; e.enemyState!.deathHandled=true; }
  for (const c of w.containers) {c.discovered=false;c.pos={x:20,y:20};}
  return w;
}

// clickMove persists until completion, but WASD cancels it permanently.
{
  const w=fixture(), input=idle();input.clickMove={x:600,y:400};
  tickWorld(w,.1,input);assert.equal(w.leader.pos.x,412);
  assert.deepEqual(input.clickMove,{x:600,y:400});
  input.move={x:0,y:1};tickWorld(w,.1,input);
  assert.equal(w.leader.pos.x,412);assert.equal(w.leader.pos.y,412);
  assert.equal(input.clickMove,null);assert.equal(w.leader.playerMoveTarget,null);
  input.move={x:0,y:0};const stopped={...w.leader.pos};
  tickWorld(w,.1,input);assert.deepEqual(w.leader.pos,stopped);
  assert.equal(w.leader.moveTarget,null,'no stale WASD or click target after release');
}

// Arrival clears both the input and checkpoint state, including the existing 4px tolerance.
{
  const w=fixture(),input=idle();input.clickMove={x:430,y:400};
  tickWorld(w,.1,input);tickWorld(w,.1,input);
  assert.ok(input.clickMove,'valid click is not prematurely discarded');
  tickWorld(w,.1,input);
  assert.deepEqual(w.leader.pos,{x:430,y:400});assert.equal(input.clickMove,null);
  assert.equal(w.leader.playerMoveTarget,null);assert.equal(w.leader.moveTarget,null);
  input.clickMove={x:432,y:400};tickWorld(w,.1,input);
  assert.equal(input.clickMove,null);assert.deepEqual(w.leader.pos,{x:430,y:400});
}

// A valid click suppresses sidestepping. After arrival, real allied obstruction
// can request a sidestep again, without carrying over the old click target.
{
  const w=fixture(),input=idle();input.clickMove={x:424,y:400};
  clearFiringLine(w,w.leader);
  tickWorld(w,.1,input);assert.equal(w.leader.pos.y,400);
  tickWorld(w,.1,input);assert.equal(input.clickMove,null);
  const friend=w.wingmen[0]!,enemy=w.enemies[0]!;
  friend.pos={x:474,y:400};enemy.pos={x:574,y:400};
  assert.equal(friendlyFireRisk(w,w.leader,enemy),true);
  clearFiringLine(w,w.leader);
  tickWorld(w,.1,input);assert.notEqual(w.leader.pos.y,400);
}

// A click blocked by a wall remains a valid command, never tunnels through it.
{
  const w=fixture(),input=idle();input.clickMove={x:700,y:400};
  getCoverObjects(w).push({id:'wall',pos:{x:500,y:400},radius:30});
  tickWorld(w,1,input);
  assert.ok(w.leader.pos.x<=500-30-w.leader.radius+.001);
  assert.ok(input.clickMove,'collision is not destination arrival');
}

// The explicit input alone survives new checkpoints. Legacy resolved moveTarget
// has ambiguous provenance (click/WASD/AI), so it cannot become a manual order.
{
  const w=fixture(),input=idle();input.clickMove={x:600,y:400};tickWorld(w,.1,input);
  const restored=worldFromCheckpointBody(snapshotSortieWorld(w))!;
  const resumed={...idle(),clickMove:restored.leader.playerMoveTarget??null};
  const before=restored.leader.pos.x;tickWorld(restored,.1,resumed);
  assert.equal(restored.leader.pos.x,before+12);assert.ok(resumed.clickMove);
  const legacy=fixture();legacy.leader.moveTarget={x:900,y:400};delete legacy.leader.playerMoveTarget;
  const old=worldFromCheckpointBody(snapshotSortieWorld(legacy))!;
  tickWorld(old,.1,idle());assert.deepEqual(old.leader.pos,{x:400,y:400});
}

// Riding captain: clicks do not move the passenger independently; manual keys
// still drive the carrier and discard the old click, without rider power cost.
{
  const w=fixture(),carrier=w.wingmen[0]!,input=idle();
  carrier.pos={...w.leader.pos};w.circuitPlay!.carry[carrier.id]=[w.leader.id];placeCarried(w);
  input.clickMove={x:700,y:400};tickWorld(w,.1,input);
  assert.deepEqual(w.leader.pos,carrier.pos);
  const before=carrier.pos.x;input.move={x:1,y:0};tickWorld(w,.1,input);
  assert.ok(carrier.pos.x>before);assert.deepEqual(w.leader.pos,carrier.pos);
  assert.equal(input.clickMove,null);assert.equal(w.mechBattery.a!.activity,300);
}
// Real carrier map taps use wingMove/wingHold rather than input.clickMove.
// They must obey the same cancellation rule when WASD takes control.
{
  const w=fixture(),carrier=w.wingmen[0]!,input=idle();
  carrier.pos={...w.leader.pos};w.circuitPlay!.carry[carrier.id]=[w.leader.id];placeCarried(w);
  assert.equal(handleMapTap(w,{x:700,y:400},24),'consumed');
  tickWorld(w,.1,input);assert.ok(carrier.pos.x>400);
  input.move={x:0,y:1};tickWorld(w,.1,input);
  assert.equal(w.circuitPlay!.wingMove[carrier.id],undefined,'WASD cancels carrier click too');
  const afterManual={...carrier.pos};input.move={x:0,y:0};tickWorld(w,.1,input);
  assert.deepEqual(carrier.pos,afterManual,'carrier does not resume stale click/hold after keys release');
  assert.deepEqual(w.leader.pos,carrier.pos);
}
console.log('Click movement cancellation, arrival, sidestep resumption, collision, checkpoint and carried controls PASS');
