import assert from 'node:assert/strict';
import { BoardGesture, BOARD_INPUT, type PointerSample } from './boardInput';
import { chordCells } from './chord';
import { getCell, type MsBoard } from './board';
let now=0;let jobs=new Map<number,()=>void>();let next=0;const actions:string[]=[],pans:number[]=[],zooms:number[]=[];
const g=new BoardGesture({hit:p=>({sx:Math.floor(p.x/25),sy:Math.floor(p.y/25)}),bounds:c=>({left:c.sx*25,top:c.sy*25,right:(c.sx+1)*25,bottom:(c.sy+1)*25}),preview:()=>{},action:a=>actions.push(a),pan:(x,y)=>pans.push(x,y),zoom:f=>zooms.push(f),zoomedOut:()=>true},{now:()=>now,set:fn=>{jobs.set(++next,fn);return next;},clear:id=>{jobs.delete(id as number);}});
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
reset();g.down(e('touch'));now=500;g.move(e('touch',1,0,1,40,30));g.up(e('touch',0,0,1,40,30));flush();assert.equal(actions.length,0);assert.equal(pans.length,0,'first pan sample rebases without jumping');
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

new BoardGesture({hit:()=>null,bounds:()=>null,preview:()=>{},action:()=>{},pan:()=>{},zoom:()=>{},zoomedOut:()=>false}).cancel(); // default real clock must initialize without a shadowed default parameter

reset();g.down(e('touch'));g.up(e('touch',0));now=100;g.down(e('touch',1,0,1,100,10));g.up(e('touch',0,0,1,100,10));flush();assert.deepEqual(actions,['tap','tap'],'two separate locations must not lose the first delayed tap');

// A controllable clock proves the exact preview threshold without committing a cell.
{
 let time=0,id=0;const timers=new Map<number,{at:number;fn:()=>void}>(),preview:(string|null)[]=[],events:string[]=[],pan:number[]=[];
 const clock={now:()=>time,set:(fn:()=>void,ms:number)=>{timers.set(++id,{at:time+ms,fn});return id;},clear:(key:unknown)=>{timers.delete(key as number);}};
 const advance=(ms:number)=>{time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}};
 const h=new BoardGesture({hit:()=>({sx:0,sy:0}),bounds:()=>({left:0,top:0,right:50,bottom:50}),preview:c=>preview.push(c?'hold':null),action:a=>events.push(a),pan:(x,y)=>pan.push(x,y),zoom:()=>{},zoomedOut:()=>false},clock);
 h.down(e('touch'));advance(299);assert(!preview.includes('hold'));assert.equal(events.length,0);
 h.move(e('touch',1,0,1,40,40));advance(1);assert.equal(preview.at(-1),'hold');assert.equal(events.length,0,'300ms preview only, 42px in-cell jitter is allowed');
 h.up(e('touch',0,0,1,40,40));assert.deepEqual(events,['hold']);assert.equal(preview.at(-1),null);
 for(const delay of [0,300]){
  h.cancel();events.length=pan.length=0;h.down(e('touch'));advance(delay);
  h.move(e('touch',1,0,1,51,10));assert.equal(preview.at(-1),null);assert.equal(pan.length,0,'no jump at transition');
  h.move(e('touch',1,0,1,60,10));assert.deepEqual(pan,[9,0]);
  h.move(e('touch',1,0,1,10,10));h.up(e('touch',0));assert.equal(events.length,0,'return to origin cannot restore tap/chord');
 }
 h.down(e('touch'));advance(300);h.down(e('touch',1,0,2,40,10));assert.equal(preview.at(-1),null);h.cancel();advance(500);assert.equal(events.length,0);
 h.down(e('touch'));advance(300);h.cancel();h.up(e('touch',0));assert.equal(preview.at(-1),null);assert.equal(events.length,0);
 h.down({...e(),ctrl:true});h.up({...e('mouse',0),ctrl:true});assert.deepEqual(events,['right'],'Ctrl-left never opens');
}
console.log('300ms preview-only threshold, captured cell bounds, immediate no-jump pan, return/cancel/pinch, Ctrl-left PASS');
