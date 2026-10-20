import { segmentCircle } from './geometry';
import type { Vec2 } from './math';
export type Barricade = { pos: Vec2; heading: number };
export const WALL_HALF_WIDTH=30, WALL_HALF_THICKNESS=4;
export function localPoint(w:Barricade,p:Vec2):Vec2 {const c=Math.cos(w.heading),s=Math.sin(w.heading),x=p.x-w.pos.x,y=p.y-w.pos.y;return{x:x*c+y*s,y:-x*s+y*c};}
export function worldVector(w:Barricade,p:Vec2):Vec2 {const c=Math.cos(w.heading),s=Math.sin(w.heading);return{x:p.x*c-p.y*s,y:p.x*s+p.y*c};}
export function wallCircleOverlap(w:Barricade,p:Vec2,r:number):boolean {const a=localPoint(w,p);return Math.hypot(Math.max(0,Math.abs(a.x)-4),Math.max(0,Math.abs(a.y)-30))<r;}
export function wallOverlap(a:Barricade,b:Barricade):boolean {
 const axes=[a.heading,a.heading+Math.PI/2,b.heading,b.heading+Math.PI/2];
 return axes.every(t=>{const project=(w:Barricade)=>4*Math.abs(Math.cos(t-w.heading))+30*Math.abs(Math.sin(t-w.heading));return Math.abs((a.pos.x-b.pos.x)*Math.cos(t)+(a.pos.y-b.pos.y)*Math.sin(t))<project(a)+project(b);});
}
/** Exact swept circle against an oriented rectangle: face strips plus round corners. */
export function wallContact(w:Barricade,a:Vec2,b:Vec2,r=0):{t:number;normal:Vec2}|null {
 const p=localPoint(w,a),q=localPoint(w,b),d={x:q.x-p.x,y:q.y-p.y};
 let best=Infinity,normal={x:0,y:0};
 const add=(t:number,n:Vec2)=>{if(t>=0&&t<=1&&t<best){best=t;normal=n;}};
 if(Math.abs(p.x)<=4 && Math.abs(p.y)<=30){const nx=4-Math.abs(p.x),ny=30-Math.abs(p.y);add(0,nx<ny?{x:p.x>=0?1:-1,y:0}:{x:0,y:p.y>=0?1:-1});}
 for(const sign of [-1,1]){
  if(d.x!==0){const t=(sign*(4+r)-p.x)/d.x,y=p.y+t*d.y;if(Math.abs(y)<=30 && d.x*sign<0)add(t,{x:sign,y:0});}
  if(d.y!==0){const t=(sign*(30+r)-p.y)/d.y,x=p.x+t*d.x;if(Math.abs(x)<=4 && d.y*sign<0)add(t,{x:0,y:sign});}
 }
 if(r>0)for(const x of [-4,4])for(const y of [-30,30]){
  const t=segmentCircle(p,q,{x,y},r);if(t!=null){const n={x:p.x+d.x*t-x,y:p.y+d.y*t-y},len=Math.hypot(n.x,n.y)||1;add(t,{x:n.x/len,y:n.y/len});}
 }
 return Number.isFinite(best)?{t:best,normal:worldVector(w,normal)}:null;
}
/** Same spawn/checkpoint overlap repair as circular terrain, without charging movement power. */
export function wallPushOut(w:Barricade,p:Vec2,r:number):Vec2 {
 const a=localPoint(w,p),closest={x:Math.max(-4,Math.min(4,a.x)),y:Math.max(-30,Math.min(30,a.y))},dx=a.x-closest.x,dy=a.y-closest.y,d=Math.hypot(dx,dy);
 if(d>=r)return p;
 let out:Vec2;
 if(d>1e-9)out={x:closest.x+dx/d*(r+.01),y:closest.y+dy/d*(r+.01)};
 else if(4-Math.abs(a.x)<30-Math.abs(a.y))out={x:(a.x>=0?1:-1)*(4+r+.01),y:a.y};
 else out={x:a.x,y:(a.y>=0?1:-1)*(30+r+.01)};
 const v=worldVector(w,out);return{x:w.pos.x+v.x,y:w.pos.y+v.y};
}
