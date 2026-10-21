import { wallEntries } from "./barricades";
import { wallContact, wallPushOut } from "./barricadeGeometry";
import type { Vec2 } from "./math";
import { getCoverObjects } from "./coverObjects";
import { segmentCircle } from "./geometry";
import type { Unit, World } from "./types";
/** Project old saves / spawn overlaps outside, then sweep the whole movement. */
export function obstacleMove(world: World, unit: Unit, desired: Vec2): Vec2 {
  const covers=getCoverObjects(world);
  let start={...unit.pos};
  for(let pass=0;pass<3;pass++){
   for(const [,wall] of wallEntries(world))start=wallPushOut(wall,start,unit.radius+.01);
   for(const c of covers){
    const r=c.radius+unit.radius+.01, dx=start.x-c.pos.x, dy=start.y-c.pos.y, d=Math.hypot(dx,dy);
    if(d<r){const angle=d>1e-8?Math.atan2(dy,dx):unit.heading+Math.PI;start={x:c.pos.x+Math.cos(angle)*r,y:c.pos.y+Math.sin(angle)*r};}
  }
  }
  // Translation caused by repairing an old embedded position is not movement power.
  let end={x:start.x+desired.x-unit.pos.x,y:start.y+desired.y-unit.pos.y};
  for(let pass=0;pass<3;pass++){
    let first=1; let hit:typeof covers[number]|undefined;
    for(const c of covers){const t=segmentCircle(start,end,c.pos,c.radius+unit.radius+.001);if(t!=null&&t<first){first=t;hit=c;}}
    let wallNormal:Vec2|undefined;
    for(const [,wall] of wallEntries(world)){const h=wallContact(wall,start,end,unit.radius+.001);if(h && h.t<first){first=h.t;wallNormal=h.normal;hit=undefined;}}
    if(!hit && !wallNormal)return end;
    const dx=end.x-start.x,dy=end.y-start.y;
    start={x:start.x+dx*Math.max(0,first-1e-5),y:start.y+dy*Math.max(0,first-1e-5)};
    const n=wallNormal ?? {x:start.x-hit!.pos.x,y:start.y-hit!.pos.y},len=Math.hypot(n.x,n.y);n.x/=len;n.y/=len;
    const rx=dx*(1-first),ry=dy*(1-first),inward=Math.min(0,rx*n.x+ry*n.y);
    end={x:start.x+rx-inward*n.x,y:start.y+ry-inward*n.y};
  }
  return start;
}
/** Near enough to use the obstacle without entering its solid body. */
export function nearCover(world:World,unit:Unit):boolean {
  return getCoverObjects(world).some(c=>Math.hypot(unit.pos.x-c.pos.x,unit.pos.y-c.pos.y)<=c.radius+unit.radius+8);
}
export function updateCoverMovement(world: World, unit: Unit, _moveInput: Vec2, _dt: number): void {
  // C1: maintain a manual choice, never auto-enter. Walking away ends cover.
  if(unit.inCover && (!unit.alive || !nearCover(world,unit)))unit.inCover=false;
}
