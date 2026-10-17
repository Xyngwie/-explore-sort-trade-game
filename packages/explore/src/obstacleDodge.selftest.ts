import assert from 'node:assert/strict';
import {createWorld,bootstrapFromSearch,startSortie} from './game/world';
import {attachCircuitPlay,tryDodge} from './game/circuitPlay';
import {getCoverObjects} from './game/coverObjects';
import {obstacleMove} from './game/coverMovement';
import {updateBullets} from './game/sim';
import type {Bullet} from './game/types';
function fixture(){
 const w=createWorld(bootstrapFromSearch('?deployedInstanceIds=a&mechBattery=a:300:300'));startSortie(w);attachCircuitPlay(w,null,false);getCoverObjects(w).splice(0);w.wingmen=[];w.enemies=[];
 w.leader.pos={x:300,y:300};w.leader.hp=w.leader.maxHp=100;
 w.circuitPlay!.loadout.leader=[{circuitId:'dodge',side:10,effectKey:'dodge',effect:100,r:.2,trueBoard:false,oneByOne:null,conductive:true,cargoSlots:0,perfectPt:0,false20:false,true20:false}];
 return w;
}
function bullet(enemy=true):Bullet{return {alive:true,pos:{x:270,y:300},vel:{x:320,y:0},ttl:1,damage:10,fromEnemy:enemy,ownerId:'outside'};}
// Phase0: a circular surface already supports diagonal tangent sliding; preserve it.
{
 const w=fixture(),u=w.leader;getCoverObjects(w).push({id:'circle',pos:{x:300,y:300},radius:30});u.pos={x:255.99,y:300};
 const out=obstacleMove(w,u,{x:280,y:330});assert.ok(out.y>320);assert.ok(Math.hypot(out.x-300,out.y-300)>=44);
 const fast=obstacleMove(w,{...u,pos:{x:100,y:300}},{x:1000,y:300});assert.ok(fast.x<256.01,'large step cannot cross a solid circle');
}
// Multiple circles: remain outside every expanded body, including a narrow valid gap.
{
 const w=fixture(),u=w.leader;const walls=getCoverObjects(w);walls.push({id:'upper',pos:{x:300,y:250},radius:30},{id:'lower',pos:{x:300,y:350},radius:30});
 u.pos={x:200,y:300};const result=obstacleMove(w,u,{x:500,y:300});assert.ok(result.x>400,'valid central gap is traversable');
 u.pos={x:230,y:280};const slide=obstacleMove(w,u,{x:450,y:330});assert.ok(walls.every(c=>Math.hypot(slide.x-c.pos.x,slide.y-c.pos.y)>=c.radius+u.radius-.00001));
}
for(const fromEnemy of [true,false]){
 const w=fixture();getCoverObjects(w).push({id:'up',pos:{x:300,y:255.98},radius:30},{id:'down',pos:{x:300,y:344.02},radius:30});
 const before={...w.leader.pos},b=bullet(fromEnemy);b.pos.x=290;
 assert.equal(tryDodge(w,w.leader,b),false,'blocked subpixel movement is not evasion');
 assert.deepEqual(w.leader.pos,before);assert.equal(w.circuitPlay!.dodgeReady.leader,undefined);
 w.bullets=[bullet(fromEnemy)];updateBullets(w,.2);
 assert.equal(w.leader.hp,90,'failed dodge takes normal projectile damage');assert.equal(w.circuitPlay!.dodgeReady.leader,undefined);
 assert.equal(w.friendlyFire?.count??0,fromEnemy?0:1);
}
// If the preferred side is blocked but the other side clears the shot, use the open side.
{
 const w=fixture();getCoverObjects(w).push({id:'down',pos:{x:300,y:344.02},radius:30});w.bullets=[bullet()];updateBullets(w,.2);
 assert.equal(w.leader.hp,100);assert.ok(w.leader.pos.y<280);assert.ok(w.circuitPlay!.dodgeReady.leader!>w.elapsed);
}
// Clear-space dodge remains available once, then obeys the existing cooldown.
{
 const w=fixture(),b=bullet();b.pos.x=290;assert.equal(tryDodge(w,w.leader,b),true);const cooldown=w.circuitPlay!.dodgeReady.leader!;
 assert.ok(cooldown>w.elapsed);b.pos={...w.leader.pos};assert.equal(tryDodge(w,w.leader,b),false);assert.equal(w.circuitPlay!.dodgeReady.leader,cooldown);
}
console.log('obstacleDodge: existing slide, high-dt and gaps; blocked/actual-side evasion, hits and cooldown PASS');
