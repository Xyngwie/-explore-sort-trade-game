import assert from 'node:assert/strict';
import { BoardGesture, BOARD_INPUT, type PointerSample } from './boardInput';
import { chordCells } from './chord';
import { getCell, type MsBoard } from './board';
let now=0;let jobs=new Map<number,()=>void>();let next=0;const actions:string[]=[],pans:number[]=[],zooms:number[]=[];
const g=new BoardGesture({hit:()=>({sx:0,sy:0}),action:a=>actions.push(a),pan:(x,y)=>pans.push(x,y),zoom:f=>zooms.push(f),zoomedOut:()=>true},{now:()=>now,set:fn=>{jobs.set(++next,fn);return next;},clear:id=>{jobs.delete(id as number);}});
const e=(type='mouse',buttons=1,button=0,id=1,x=10,y=10):PointerSample=>({id,type,buttons,button,x,y});
const flush=()=>{const all=[...jobs.values()];jobs.clear();all.forEach(f=>f());};
const reset=()=>{g.cancel();actions.length=pans.length=zooms.length=0;now=0;};
for(const [first,last]of [[1,2],[2,1]]){
 reset();g.down(e('mouse',first,first===1?0:2));g.move(e('mouse',3,last===1?0:2));g.move(e('mouse',first,last===1?0:2));g.up(e('mouse',0,first===1?0:2));assert.deepEqual(actions,['chord']);
}
reset();g.down(e());now=1000;assert.equal(actions.length,0);g.up(e('mouse',0));assert.deepEqual(actions,['left']);
reset();g.down(e('mouse',2,2));g.up(e('mouse',0,2));assert.deepEqual(actions,['right']);
reset();g.down(e('mouse',4,1));g.move(e('mouse',4,1,1,50,30));g.up(e('mouse',0,1,1,50,30));assert.equal(actions.length,0);assert(pans.length);
reset();g.down(e('touch'));now=BOARD_INPUT.holdMs;assert.equal(actions.length,0);g.up(e('touch',0));flush();assert.deepEqual(actions,['hold']);
reset();g.down(e('touch'));g.up(e('touch',0));assert.equal(actions.length,0);flush();assert.deepEqual(actions,['tap']);
reset();g.down(e('touch'));now=500;g.move(e('touch',1,0,1,40,30));g.up(e('touch',0,0,1,40,30));flush();assert.equal(actions.length,0);assert(pans.length);
reset();g.down(e('touch'));g.move(e('touch',1,0,1,40,30));now=600;g.up(e('touch',0,0,1,40,30));flush();assert.equal(actions.length,0);assert.equal(pans.length,0);
reset();g.down(e('touch'));g.up(e('touch',0));now=150;g.down(e('touch'));g.up(e('touch',0));flush();assert.deepEqual(actions,[]);assert.deepEqual(zooms,[2]);
reset();g.down(e('touch'));g.down(e('touch',1,0,2,40,10));g.move(e('touch',1,0,2,70,10));g.up(e('touch',0,0,2,70,10));g.up(e('touch',0));flush();assert.equal(actions.length,0);assert(zooms[0]!>1);
reset();g.down(e('touch'));g.up(e('touch',0));g.down(e('touch',1,0,1,10,10));g.down(e('touch',1,0,2,40,10));g.cancel();flush();assert.equal(actions.length,0);
reset();g.down(e('touch'));now=600;g.cancel();g.up(e('touch',0));flush();assert.equal(actions.length,0);
function board():MsBoard {
 return {aoiHalf:1,span:3,mineCount:1,status:'playing',hitMine:false,cells:Array.from({length:3},(_,y)=>Array.from({length:3},(_,x)=>({sx:x-1,sy:y-1,mine:x===0&&y===0,blocked:false,adjacent:1,open:x===1&&y===1,flagged:false,isHq:false})))};
}
let b=board();assert.equal(chordCells(b,0,0).opened,0,'too few flags');
b=board();getCell(b,-1,-1)!.flagged=true;getCell(b,1,1)!.flagged=true;assert.equal(chordCells(b,0,0).opened,0,'too many flags');
b=board();getCell(b,-1,-1)!.flagged=true;assert.equal(chordCells(b,0,0).opened,7,'matching correct flags opens neighbors');
b=board();getCell(b,0,-1)!.flagged=true;const r=chordCells(b,0,0);assert.deepEqual(r.hit,{sx:-1,sy:-1});assert(b.hitMine);assert.equal(getCell(b,1,1)!.open,false,'stop immediately at first enemy');assert.equal(chordCells(b,0,0).opened,0,'locked board cannot continue');
console.log('Invade input: both chord button orders, release holds, tap delay, cancel/pinch/pan/double; exact flag counts and first-mine stop PASS');

new BoardGesture({hit:()=>null,action:()=>{},pan:()=>{},zoom:()=>{},zoomedOut:()=>false}).cancel(); // default real clock must initialize without a shadowed default parameter
