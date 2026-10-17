import { toggleUnitCover, toggleSquadCover } from "./game/orders";
import { FRIENDLY_FIRE_HISTORY_LIMIT, FRIENDLY_FIRE_HISTORY_MAX_CHARS, settleFriendlyFireOnce } from "./game/friendlyFireHistory";
import assert from "node:assert/strict";
import { createWorld, bootstrapFromSearch, startSortie } from "./game/world";
import { updateBullets, tickWorld } from "./game/sim";
import { backfillEnemyState } from "./game/enemyBehavior";
import { getCoverObjects } from "./game/coverObjects";
import { obstacleMove, updateCoverMovement } from "./game/coverMovement";
import { firstShotContact, friendlyFireRisk, hitRadius, spreadRadians, SPREAD_DEG } from "./game/projectiles";
import { attachCircuitPlay, circuitTryWeapon, modsFor } from "./game/circuitPlay";
import { snapshotSortieWorld, worldFromCheckpointBody, snapshotResultWorld } from "./game/checkpoint";
import { FRIENDLY_FIRE_HISTORY_KEY, settleFriendlyFire } from "./game/friendlyFireHistory";
import { combatFeedback } from "./game/combatFeedback";
import type { Bullet, Unit, World } from "./game/types";
const idle={move:{x:0,y:0},clickMove:null,fire:false,interact:false};
function fixture(){
  const w=createWorld(bootstrapFromSearch(''));startSortie(w);
  getCoverObjects(w).splice(0);
  for(const e of w.enemies) e.enemyIdentity!.circuits=[];
  w.leader.pos={x:100,y:300};w.leader.heading=0;w.leader.hp=w.leader.maxHp=1000;
  for(const u of [...w.wingmen,...w.enemies]){u.pos={x:1200,y:900};u.hp=u.maxHp=1000;u.cooldown=100;}
  return w;
}
function bullet(w:World,owner:Unit=w.leader,fromEnemy=false){
  const b:Bullet={alive:true,pos:{...owner.pos},vel:{x:1000,y:0},ttl:1.2,damage:10,fromEnemy,ownerId:owner.id};
  w.bullets=[b];return b;
}
// Swept collision hits nearest body regardless of array order (and cannot tunnel).
{
 const w=fixture(),near=w.wingmen[1]!,far=w.enemies[0]!;
 near.pos={x:200,y:300};far.pos={x:300,y:300};
 bullet(w);updateBullets(w,.3);
 assert.equal(near.hp,990);assert.equal(far.hp,1000);assert.equal(w.bullets.length,0);
 assert.equal(w.friendlyFire?.count,1);
 assert.equal(w.logs.filter(l=>l.text.startsWith('誤射：')).length,1);
 assert.ok(w.logs.some(l=>l.text.includes('（−10）')));
 assert.ok(combatFeedback(w).some(e=>e.kind==='friendly_fire'));
 near.hp=1;bullet(w);updateBullets(w,.3);
 assert.equal(near.alive,false);assert.equal(w.friendlyFire?.count,2);
 assert.ok(w.logs.some(l=>l.text.includes('の誤射で')&&l.text.includes('大破')));
}
// Enemy fire still hits other enemies, not the original shooter, not counted as friendly fire.
{
 const w=fixture(),e=w.enemies[0]!,other=w.enemies[1]!;
 e.pos={x:100,y:300};w.leader.pos={x:900,y:300};other.pos={x:200,y:300};
 bullet(w,e,true);updateBullets(w,.2);assert.equal(other.hp,990);assert.equal(e.hp,1000);assert.equal(w.friendlyFire?.count??0,0);
}
// Obstacles stop shots, before bodies. Wrecks / containers / stranded objects don't.
{
 const w=fixture(),target=w.enemies[0]!;target.pos={x:300,y:300};
 const covers=getCoverObjects(w);covers.push({id:'wall',pos:{x:200,y:300},radius:30});
 bullet(w);updateBullets(w,.4);assert.equal(target.hp,1000);
 covers.splice(0);w.wingmen[0]!.alive=false;w.wingmen[0]!.pos={x:200,y:300};
 w.containers[0]!.pos={x:180,y:300};
 bullet(w);updateBullets(w,.4);assert.equal(target.hp,990);
}
// Lifetime: final partial step can hit; a target beyond the remaining distance cannot.
{
 const w=fixture(),e=w.enemies[0]!;e.pos={x:190,y:300};let b=bullet(w);b.ttl=.1;updateBullets(w,.5);assert.equal(e.hp,990);
 e.hp=1000;e.pos={x:230,y:300};b=bullet(w);b.ttl=.1;updateBullets(w,.5);assert.equal(e.hp,1000);
}
// Carrier/passenger mutual exclusion, outside fire reaches carrier, even if carrier is a wingman.
{
 const w=fixture();attachCircuitPlay(w,null,false);
 const carrier=w.wingmen[0]!,rider=w.leader;
 carrier.pos=rider.pos={x:200,y:300};w.circuitPlay!.carry[carrier.id]=[rider.id];
 assert.equal(firstShotContact(w,rider.id,rider.pos,{x:300,y:300}),null);
 assert.equal(firstShotContact(w,carrier.id,carrier.pos,{x:300,y:300}),null);
 assert.equal(firstShotContact(w,'outside',{x:100,y:300},{x:300,y:300})?.unit?.id,carrier.id);
}
// C2: cover doesn't shrink the body; physical geometry shields only the far side.
{
 const w=fixture(),e=w.enemies[0]!;e.pos={x:200,y:300};
 const full=hitRadius(w,e);e.inCover=true;assert.equal(hitRadius(w,e),full);
 bullet(w);w.bullets[0]!.pos.y=300+full*.85;updateBullets(w,.2);assert.equal(e.hp,993); // D2 reduces damage, not the hit body
 e.hp=1000;getCoverObjects(w).push({id:'cover',pos:{x:245,y:300},radius:30});
 const b=bullet(w);b.pos={x:400,y:300};b.vel.x=-1000;updateBullets(w,.3);assert.equal(e.hp,1000,'hidden side blocked');
 bullet(w);updateBullets(w,.2);assert.equal(e.hp,993,'exposed side still hit, then D2 mitigates');
}
// Risk is centerline only, blockers behind the enemy do not suppress, off-line allies allow fire.
{
 const w=fixture(),friend=w.wingmen[0]!,target=w.enemies[0]!;
 target.pos={x:300,y:300};friend.pos={x:200,y:300};assert.equal(friendlyFireRisk(w,w.leader,target),true);
 friend.pos.y=330;assert.equal(friendlyFireRisk(w,w.leader,target),false);
 friend.pos={x:400,y:300};assert.equal(friendlyFireRisk(w,w.leader,target),false);
}
// Sweep movement, including a huge step: cannot enter or cross obstacles, can walk away.
{
 const w=fixture(),u=w.leader;getCoverObjects(w).push({id:'wall',pos:{x:300,y:300},radius:30});
 u.pos={x:200,y:300};let p=obstacleMove(w,u,{x:500,y:300});
 assert.ok(p.x<=300-30-u.radius+.01);assert.ok(Math.hypot(p.x-300,p.y-300)>=30+u.radius);
 u.pos=p;p=obstacleMove(w,u,{x:100,y:300});assert.ok(p.x<200);
 u.pos={x:300,y:300};u.pos=obstacleMove(w,u,u.pos);updateCoverMovement(w,u,{x:0,y:0},0);assert.ok(Math.hypot(u.pos.x-300,u.pos.y-300)>=30+u.radius);
 u.pos={x:300-30-u.radius-3,y:300};const before={...u.pos};updateCoverMovement(w,u,{x:0,y:0},0);assert.deepEqual(u.pos,before);assert.equal(u.inCover,false,"nearby alone never enters cover");
}
// Spread bounds, zero-centered samples, each weapon with seeded deterministic random input.
for(const key of Object.keys(SPREAD_DEG)){
 const half=SPREAD_DEG[key as keyof typeof SPREAD_DEG]*Math.PI/180;
 assert.ok(Math.abs(spreadRadians(key,()=>0)+half)<1e-12);
 assert.equal(spreadRadians(key,()=>.5),0);
 assert.ok(spreadRadians(key,()=>.999999)<half);
}
// Actual circuit MMR shots: special ammo speed changes lifetime, not 1.3× range.
for(const special of [null,'fast_round','homing_round'] as const){
 const w=fixture();attachCircuitPlay(w,null,false);
 const p=w.circuitPlay!,u=w.leader,e=w.enemies[0]!;u.instanceId='captain';e.pos={x:160,y:300};
 p.loadout[u.id]=[{circuitId:'mmr',effectKey:'mmr',effect:25,r:.1,trueBoard:false,oneByOne:null,side:2,conductive:true,cargoSlots:0,perfectPt:0,false20:false,true20:false}];
 if(special)p.loadout[u.id]!.push({...p.loadout[u.id]![0]!,circuitId:'round',effectKey:special});
 w.currentAmmo.captain=28;u.cooldown=0;
 assert.equal(circuitTryWeapon(w,u,e),true);const b=w.bullets[0]!;
 const expected=w.balance.weaponRange*modsFor(w,u.id).range*3*(1+.1)*1.3;
 assert.ok(Math.abs(Math.hypot(b.vel.x,b.vel.y)*b.ttl-expected)<1e-8);
}
// Checkpoint compatibility, learning counts survive result reload; settlement is idempotent and private.
{
 const w=fixture();bullet(w);w.wingmen[0]!.pos={x:200,y:300};updateBullets(w,.2);
 const restored=worldFromCheckpointBody(snapshotSortieWorld(w))!;assert.equal(restored.friendlyFire?.count,1);
 const body=JSON.parse(JSON.stringify(snapshotSortieWorld(w)));delete body.friendlyFire;
 const old=worldFromCheckpointBody(body)!;assert.equal(old.friendlyFire?.count,0);
 w.phase='result';const result=worldFromCheckpointBody(snapshotResultWorld(w))!;
 const memory=new Map<string,string>();const storage={getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,v:string)=>{memory.set(key,v)}};
 assert.equal(settleFriendlyFire(result,'battle-1',storage),true);assert.equal(settleFriendlyFire(result,'battle-1',storage),true);
 const history=JSON.parse(memory.get(FRIENDLY_FIRE_HISTORY_KEY)!);assert.equal(history.battles.length,1);assert.equal(history.battles[0].count,1);
 assert.equal(settleFriendlyFire(result,'battle-2',storage),true);assert.equal(JSON.parse(memory.get(FRIENDLY_FIRE_HISTORY_KEY)!).battles.length,2);
 assert.equal(settleFriendlyFire(result,'battle-3',{...storage,setItem:()=>{throw Error('quota')}}),false);
}
console.log('projectileHitAll: collision, obstacles, carrier, spread, MMR, counts and checkpoint PASS');
// Integration: the captain holds fire and physically sidesteps on the following tick.
{
 const w=fixture();attachCircuitPlay(w,null,false);
 const u=w.leader,blocker=w.wingmen[0]!,target=w.enemies[0]!;
 u.instanceId='captain';w.currentAmmo.captain=28;target.pos={x:240,y:300};blocker.pos={x:160,y:300};
 backfillEnemyState(w);
 for(const e of w.enemies){e.enemyState!.ammo=0;e.enemyState!.activity=0;}
 blocker.moveTarget=null;blocker.stance='patrol';blocker.waypoint={...blocker.pos};
 u.cooldown=0;tickWorld(w,.01,idle);
 assert.equal(w.currentAmmo.captain,28,'blocked shot holds ammunition');
 const before={...u.pos};tickWorld(w,.05,idle);
 assert.ok(Math.abs(u.pos.y-before.y)>0,'actual movement clears the line');
}
// Serialized pre-feature bullets still hit under the new collision rules.
{
 const w=fixture();w.wingmen[0]!.pos={x:200,y:300};bullet(w);
 const body=JSON.parse(JSON.stringify(snapshotSortieWorld(w)));delete body.friendlyFire;
 const restored=worldFromCheckpointBody(body)!;updateBullets(restored,.2);
 assert.equal(restored.friendlyFire!.count,1);assert.equal(restored.wingmen[0]!.hp,990);
}
console.log('projectileHitAll: actual avoidance and legacy flying bullet PASS');

// A newer history schema must not be overwritten by an older client.
{
 const w=fixture();const future=JSON.stringify({version:2,battles:[]});let writes=0;
 assert.equal(settleFriendlyFire(w,'future',{getItem:()=>future,setItem:()=>{writes++;}}),false);
 assert.equal(writes,0);
 assert.equal(settleFriendlyFire(w,'corrupt',{getItem:()=>'{broken',setItem:()=>{writes++;}}),false);
 assert.equal(writes,0);
}
console.log('projectileHitAll: future and corrupt learning history protected PASS');

// F1/C1: manual choice persists across real frames; no automatic entry near or away.
{
 const w=fixture(),u=w.leader;
 backfillEnemyState(w);for(const e of w.enemies){e.enemyState!.ammo=0;e.enemyState!.activity=0;}
 getCoverObjects(w).push({id:'manual',pos:{x:300,y:300},radius:30});u.pos={x:255,y:300};
 for(let i=0;i<5;i++)tickWorld(w,.02,idle);assert.equal(u.inCover,false,'proximity alone cannot enter');
 assert.equal(toggleUnitCover(w,u),true);
 for(let i=0;i<5;i++)tickWorld(w,.02,idle);assert.equal(u.inCover,true,'manual ON persists near wall');
 assert.equal(toggleUnitCover(w,u),false);
 for(let i=0;i<5;i++)tickWorld(w,.02,idle);assert.equal(u.inCover,false,'manual OFF persists near wall');
 u.pos={x:100,y:300};assert.equal(toggleUnitCover(w,u),null);assert.equal(toggleSquadCover(w),'denied');
 for(let i=0;i<5;i++)tickWorld(w,.02,idle);assert.equal(u.inCover,false,'away remains OFF');
 u.pos={x:255,y:300};assert.equal(toggleUnitCover(w,u),true);u.pos={x:100,y:300};tickWorld(w,.02,idle);assert.equal(u.inCover,false,'leaving the obstacle ends cover');
}
// C3: explicit fire and focus orders shoot through a risky allied line (with normal damage).
for(const mode of ['manual','focus'] as const){
 const w=fixture();attachCircuitPlay(w,null,false);backfillEnemyState(w);
 const u=w.leader,blocker=w.wingmen[0]!,target=w.enemies[0]!;
 u.instanceId='captain';u.cooldown=0;w.currentAmmo.captain=28;
 blocker.pos={x:160,y:300};blocker.stance='patrol';blocker.waypoint={...blocker.pos};target.pos={x:240,y:300};
 for(const e of w.enemies){e.enemyState!.ammo=0;e.enemyState!.activity=0;}
 if(mode==='focus')w.circuitPlay!.order={kind:'focus',enemyId:target.id};
 tickWorld(w,.01,{...idle,fire:mode==='manual'});
 assert.equal(w.currentAmmo.captain,27,mode+' bypasses friendly-fire hold');
 updateBullets(w,.3);assert.equal(w.friendlyFire!.count,1);
 assert.equal(w.combatHitsTaken,0,'friendly hits are not enemy-hit observations');
}
// C5 and F4: camp mitigation applies equally to a friendly shot; enemy-hit count stays separate.
{
 const w=fixture(),friend=w.wingmen[0]!;friend.pos={x:200,y:300};w.camp={pos:{...friend.pos},stashedCount:1};
 bullet(w);updateBullets(w,.2);assert.equal(friend.hp,1000-10*w.balance.campDamageTakenMul);assert.equal(w.combatHitsTaken,0);
 const e=w.enemies[0]!;e.pos={x:100,y:300};bullet(w,e,true);updateBullets(w,.2);assert.equal(w.combatHitsTaken,1);
}
// F5: only allied damage on a suppressed enemy cancels the order, as before.
{
 const w=fixture();attachCircuitPlay(w,null,false);const e=w.enemies[0]!,other=w.enemies[1]!;e.pos={x:200,y:300};other.pos={x:100,y:300};w.leader.pos={x:500,y:500};
 w.circuitPlay!.order={kind:'suppress',enemyId:e.id,left:8};bullet(w,other,true);updateBullets(w,.2);assert.equal(w.circuitPlay!.order?.kind,'suppress');
 other.pos={x:100,y:600};w.leader.pos={x:100,y:300};bullet(w);updateBullets(w,.2);assert.equal(w.circuitPlay!.order,null);
}
// F9: a body inside the camera can be hit at an off-camera contact point.
{
 const w=fixture();w.enemies[0]!.pos={x:200,y:300};w.camera={...w.camera,x:200,y:200,w:200,h:200};bullet(w);updateBullets(w,.2);
 assert.ok(w.logs.some(l=>l.text.includes('被弾')),'off-camera shot contact still reports');
}
// F7: bounded learning history; a successful result reads once; refused writes back off.
{
 const w=fixture();let raw=JSON.stringify({version:1,battles:Array.from({length:FRIENDLY_FIRE_HISTORY_LIMIT},(_,i)=>({sortieId:'old-'+i,count:0,byShooter:{}}))});let reads=0;
 const store={getItem:()=>{reads++;return raw;},setItem:(_k:string,v:string)=>{raw=v}};
 assert.equal(settleFriendlyFireOnce(w,'latest',store,0),true);assert.equal(settleFriendlyFireOnce(w,'latest',store,10),true);assert.equal(reads,1);
 const saved=JSON.parse(raw);assert.equal(saved.battles.length,FRIENDLY_FIRE_HISTORY_LIMIT);assert.equal(saved.battles[0].sortieId,'old-1');assert.ok(raw.length<=FRIENDLY_FIRE_HISTORY_MAX_CHARS);
 const refused=fixture();let attempts=0;const fail={getItem:()=>{attempts++;return null},setItem:()=>{throw Error('quota')}};
 assert.equal(settleFriendlyFireOnce(refused,'retry',fail,0),false);assert.equal(settleFriendlyFireOnce(refused,'retry',fail,20),false);assert.equal(attempts,1);
 assert.equal(settleFriendlyFireOnce(refused,'retry',fail,5000),false);assert.equal(attempts,2);
}
console.log('projectileHitAll: C1-C5 and F1-F9 audit regressions PASS');
// C6: dodge works against allied friendly fire and enemy-on-enemy fire.
for(const enemyTarget of [false,true]){
 const w=fixture();attachCircuitPlay(w,null,false);
 const target=enemyTarget?w.enemies[1]!:w.wingmen[0]!;target.pos={x:200,y:300};
 if(enemyTarget){
  target.enemyIdentity!.circuits=[{circuitId:'dodge',side:2,effectKey:'dodge',effect:100,trueBoard:false}];
  w.enemies[0]!.pos={x:100,y:300};w.leader.pos={x:500,y:500};
 }else w.circuitPlay!.loadout[target.id]=[{circuitId:'dodge',side:2,effectKey:'dodge',effect:100,r:.2,trueBoard:false,oneByOne:null,conductive:true,cargoSlots:0,perfectPt:0,false20:false,true20:false}];
 bullet(w,enemyTarget?w.enemies[0]!:w.leader,enemyTarget);updateBullets(w,.2);
 assert.equal(target.hp,1000);assert.notEqual(target.pos.y,300);assert.equal(w.friendlyFire?.count??0,0);
}
console.log('projectileHitAll: C6 faction-independent dodge PASS');
// C3 also applies to the wingman's focus-order firing path, not just the captain.
{
 const w=fixture();attachCircuitPlay(w,null,false);backfillEnemyState(w);
 w.leader.pos={x:500,y:700};const shooter=w.wingmen[0]!,blocker=w.wingmen[1]!,target=w.enemies[0]!;
 shooter.pos={x:100,y:300};shooter.heading=0;shooter.instanceId='wing-shooter';shooter.cooldown=0;w.currentAmmo['wing-shooter']=28;
 blocker.pos={x:160,y:300};target.pos={x:240,y:300};
 for(const e of w.enemies){e.enemyState!.ammo=0;e.enemyState!.activity=0;}
 w.circuitPlay!.order={kind:'focus',enemyId:target.id};tickWorld(w,.01,idle);
 assert.equal(w.currentAmmo['wing-shooter'],27,'wingman focus bypasses the friendly-risk gate');
}
// F7's serialized-size bound also protects histories with unusually large old records.
{
 const w=fixture();let raw=JSON.stringify({version:1,battles:[{sortieId:'x'.repeat(FRIENDLY_FIRE_HISTORY_MAX_CHARS),count:0,byShooter:{}}]});
 const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v}};
 assert.equal(settleFriendlyFire(w,'new-small',storage),true);
 assert.ok(raw.length<=FRIENDLY_FIRE_HISTORY_MAX_CHARS);assert.equal(JSON.parse(raw).battles.length,1);
}
console.log('projectileHitAll: wingman focus and serialized-history limit PASS');
// Round 2 D1/D2: real bullet hits apply circuit / manual-cover damage reduction after contact.
function mitigationHit(options:{armor?:number;fight?:number;hp?:number;moving?:boolean;cover?:boolean;camp?:boolean;legacy?:boolean}){
 const w=fixture();attachCircuitPlay(w,null,false);
 const target=w.wingmen[0]!;target.pos={x:200,y:300};target.maxHp=1000;target.hp=options.hp??1000;
 const circuit=(key:string,r:number,trueBoard:boolean)=>({circuitId:key,side:2,effectKey:key,effect:100,r,trueBoard,oneByOne:null,conductive:true,cargoSlots:0,perfectPt:0,false20:false,true20:false});
 w.circuitPlay!.loadout[target.id]=[];
 if(options.armor)w.circuitPlay!.loadout[target.id]!.push(circuit('armor_tune',options.armor,true));
 if(options.fight)w.circuitPlay!.loadout[target.id]!.push(circuit('cover_fight',options.fight,false));
 target.vel={x:options.moving?20:0,y:0};
 getCoverObjects(w).push({id:'mitigation-cover',pos:{x:245,y:300},radius:30});
 if(options.cover)assert.equal(toggleUnitCover(w,target),true);
 if(options.camp)w.camp={pos:{...target.pos},stashedCount:1};
 if(options.legacy)w.circuitPlay!.rules=false;
 const radius=hitRadius(w,target),before=target.hp;
 bullet(w);updateBullets(w,.2);
 assert.equal(hitRadius(w,target),radius,'no mitigation shrinks the physical hit body');
 assert.equal(w.friendlyFire?.count,1,'the shot really hits; it is not a probability veto');
 return before-target.hp;
}
function close(actual:number,expected:number){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}
close(mitigationHit({}),10);
close(mitigationHit({armor:.2}),8);
close(mitigationHit({fight:.2,hp:500,moving:true}),5);
close(mitigationHit({fight:.2,hp:500,moving:false}),10);
close(mitigationHit({fight:.2,hp:501,moving:true}),10);
close(mitigationHit({cover:true}),7);
close(mitigationHit({cover:true,legacy:true}),7);
close(mitigationHit({armor:.2,cover:true}),5);
close(mitigationHit({armor:.2,fight:.2,hp:500,moving:true,cover:true}),4);
close(mitigationHit({armor:.2,fight:.2,hp:500,moving:true,cover:true,camp:true}),2.88);
close(mitigationHit({cover:true,camp:true}),5.04);
console.log('projectileHitAll: D1/D2 real-hit mitigation, half-HP/movement gates, additive cap and camp stack PASS');
