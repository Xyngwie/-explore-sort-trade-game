/** Input thresholds are independent of board rules and device viewport width. */
export const BOARD_INPUT = {
  holdMs: 480, movePx: 8, doubleTapMs: 280, doubleTapPx: 24,
  minScale: 0.65, maxScale: 4, doubleTapBelow: 1.6, doubleTapFactor: 2,
  wheelSensitivity: 0.0015, visibleMarginPx: 40,
} as const;
export type Coord = { sx: number; sy: number };
export type Point = { x: number; y: number };
export type BoardAction = 'left' | 'right' | 'chord' | 'tap' | 'hold';
export type PointerSample = Point & { id: number; type: string; button: number; buttons: number };
type Clock = { now(): number; set(fn:()=>void,ms:number):unknown; clear(id:unknown):void };
const systemClock: Clock = {now:()=>performance.now(),set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id as ReturnType<typeof setTimeout>)};
type Hooks = { hit(p:Point):Coord|null; action(a:BoardAction,c:Coord):void; pan(x:number,y:number):void; zoom(f:number,p:Point):void; zoomedOut():boolean };
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const same=(a:Coord|null,b:Coord|null)=>a!=null&&b!=null&&a.sx===b.sx&&a.sy===b.sy;
export class BoardGesture {
  private mouse: {start:Point;last:Point;cell:Coord|null;buttons:number;chord:boolean;pan:boolean;moved:boolean}|null=null;
  private touches=new Map<number,Point>();
  private touch: {start:Point;last:Point;cell:Coord|null;at:number;pan:boolean;cancelled:boolean;double:boolean;previous:Coord|null}|null=null;
  private multi=false;
  private pinch: {center:Point;distance:number}|null=null;
  private pending: {p:Point;cell:Coord;at:number;timer:unknown}|null=null;
  constructor(private h:Hooks,private clock:Clock=systemClock) {}
  private clearPending():void {if(this.pending)this.clock.clear(this.pending.timer);this.pending=null;}
  cancel():void {this.clearPending();this.mouse=null;this.touches.clear();this.touch=null;this.multi=false;this.pinch=null;}
  down(e:PointerSample):void {
    if(e.type==='mouse') {
      this.clearPending();
      if(!this.mouse)this.mouse={start:e,last:e,cell:this.h.hit(e),buttons:e.buttons,chord:false,pan:false,moved:false};
      this.mouseButtons(e);return;
    }
    if(this.mouse)this.mouse=null;
    this.touches.set(e.id,e);
    if(this.touches.size>1){this.clearPending();this.multi=true;this.touch=null;this.pinch=this.pinchNow();return;}
    const double=this.pending!=null && this.clock.now()-this.pending.at<=BOARD_INPUT.doubleTapMs && distance(e,this.pending.p)<=BOARD_INPUT.doubleTapPx && this.h.zoomedOut();
    const previous=!double ? this.pending?.cell??null : null;
    this.clearPending();
    this.touch={start:e,last:e,cell:this.h.hit(e),at:this.clock.now(),pan:false,cancelled:false,double,previous};
  }
  private mouseButtons(e:PointerSample):void {
    const m=this.mouse;if(!m)return;
    m.buttons|=e.buttons;
    if((e.buttons&3)===3)m.chord=true;
    if(e.buttons&4)m.pan=true;
  }
  private pinchNow(): {center:Point;distance:number}|null {
    const [a,b]=[...this.touches.values()];
    return a&&b?{center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance:distance(a,b)}:null;
  }
  move(e:PointerSample):void {
    if(e.type==='mouse') {
      const m=this.mouse;if(!m)return;this.mouseButtons(e);
      if(distance(e,m.start)>BOARD_INPUT.movePx)m.moved=true;
      if(m.pan)this.h.pan(e.x-m.last.x,e.y-m.last.y);
      m.last=e;return;
    }
    if(!this.touches.has(e.id))return;
    this.touches.set(e.id,e);
    if(this.multi){const p=this.pinchNow();if(p&&this.pinch){this.h.pan(p.center.x-this.pinch.center.x,p.center.y-this.pinch.center.y);if(this.pinch.distance>0)this.h.zoom(p.distance/this.pinch.distance,p.center);}this.pinch=p;return;}
    const t=this.touch;if(!t)return;
    if(distance(e,t.start)>BOARD_INPUT.movePx && !t.pan){
      if(this.clock.now()-t.at>=BOARD_INPUT.holdMs && !t.cancelled)t.pan=true;
      else t.cancelled=true;
    }
    if(t.pan)this.h.pan(e.x-t.last.x,e.y-t.last.y);
    t.last=e;
  }
  up(e:PointerSample):void {
    if(e.type==='mouse') {
      const m=this.mouse;if(!m)return;this.mouseButtons(e);
      if(e.buttons!==0)return;
      this.mouse=null;
      if(!m.pan && !m.moved && distance(e,m.start)<=BOARD_INPUT.movePx && same(m.cell,this.h.hit(e)))this.h.action(m.chord?'chord':(m.buttons&2)?'right':'left',m.cell!);
      return;
    }
    if(!this.touches.has(e.id))return;
    this.touches.delete(e.id);
    if(this.multi){if(!this.touches.size){this.multi=false;this.pinch=null;}return;}
    const t=this.touch;this.touch=null;
    if(!t || t.pan || t.cancelled || distance(e,t.start)>BOARD_INPUT.movePx || !same(t.cell,this.h.hit(e)))return;
    if(t.previous)this.h.action('tap',t.previous);
    if(this.clock.now()-t.at>=BOARD_INPUT.holdMs){this.h.action('hold',t.cell!);return;}
    if(t.double){this.h.zoom(BOARD_INPUT.doubleTapFactor,e);return;}
    if(!this.h.zoomedOut()){this.h.action('tap',t.cell!);return;}
    const pending={p:{x:e.x,y:e.y},cell:t.cell!,at:this.clock.now(),timer:null as unknown};
    pending.timer=this.clock.set(()=>{if(this.pending===pending){this.pending=null;this.h.action('tap',pending.cell);}},BOARD_INPUT.doubleTapMs);
    this.pending=pending;
  }
}

/** Stable delegated listeners survive board re-renders and mouse button transitions. */
export function bindBoardInput(root:HTMLElement, action:(a:BoardAction,c:Coord)=>void): {paint():void;cancel():void;reset():void} {
  const view={scale:1,x:0,y:0};
  const viewport=()=>root.querySelector<HTMLElement>('#board-viewport');
  const hit=(p:Point):Coord|null=>{
    const cell=document.elementFromPoint(p.x,p.y)?.closest<HTMLElement>('button.cell');
    return cell && viewport()?.contains(cell) && !cell.hasAttribute('disabled') ? {sx:Number(cell.dataset.sx),sy:Number(cell.dataset.sy)}:null;
  };
  const paint=()=>{
    const v=viewport(),g=v?.querySelector<HTMLElement>('.front-ms');if(!v||!g)return;
    const margin=Math.min(BOARD_INPUT.visibleMarginPx,v.clientWidth/2);
    view.x=Math.max(margin-g.offsetWidth*view.scale,Math.min(v.clientWidth-margin,view.x));
    view.y=Math.max(margin-g.offsetHeight*view.scale,Math.min(v.clientHeight-margin,view.y));
    g.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;
    v.dataset.scale=String(view.scale);v.dataset.panX=String(view.x);v.dataset.panY=String(view.y);
  };
  const zoom=(f:number,p:Point)=>{
    const r=viewport()?.getBoundingClientRect();if(!r)return;
    const next=Math.max(BOARD_INPUT.minScale,Math.min(BOARD_INPUT.maxScale,view.scale*f)),ratio=next/view.scale;
    view.x=p.x-r.left-(p.x-r.left-view.x)*ratio;view.y=p.y-r.top-(p.y-r.top-view.y)*ratio;view.scale=next;paint();
  };
  const gesture=new BoardGesture({hit,action,pan:(x,y)=>{view.x+=x;view.y+=y;paint();},zoom,zoomedOut:()=>view.scale<BOARD_INPUT.doubleTapBelow});
  const inside=(e:Event)=>e.target instanceof Element && !!e.target.closest('#board-viewport');
  const sample=(e:PointerEvent):PointerSample=>({id:e.pointerId,type:e.pointerType,button:e.button,buttons:e.buttons,x:e.clientX,y:e.clientY});
  root.addEventListener('pointerdown',e=>{if(!inside(e)){gesture.cancel();return;}e.preventDefault();root.setPointerCapture(e.pointerId);gesture.down(sample(e));});
  root.addEventListener('pointermove',e=>{if(root.hasPointerCapture(e.pointerId))gesture.move(sample(e));});
  root.addEventListener('pointerup',e=>{if(!root.hasPointerCapture(e.pointerId))return;gesture.up(sample(e));if(root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);});
  root.addEventListener('pointercancel',()=>gesture.cancel());
  window.addEventListener('blur',()=>gesture.cancel());
  const overViewport=(e:MouseEvent)=>{const r=viewport()?.getBoundingClientRect();return r!=null&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;};
  root.addEventListener('contextmenu',e=>{if(inside(e)||overViewport(e))e.preventDefault();});
  root.addEventListener('auxclick',e=>{if(inside(e)||overViewport(e))e.preventDefault();});
  // Pointer actions commit on release. Ignore all compatibility clicks,
  // including detail=0 variants; keyboard activation has its own explicit path.
  root.addEventListener('click',e=>{if(inside(e)){e.preventDefault();e.stopPropagation();}});
  root.addEventListener('keydown',e=>{
    if(!inside(e)||(e.key!=='Enter'&&e.key!==' '))return;
    e.preventDefault();if(e.repeat)return;
    const c=(e.target as HTMLElement).closest<HTMLElement>('button.cell');
    if(c&&!c.hasAttribute('disabled')){gesture.cancel();action('left',{sx:Number(c.dataset.sx),sy:Number(c.dataset.sy)});}
  });
  root.addEventListener('wheel',e=>{if(!inside(e))return;e.preventDefault();gesture.cancel();zoom(Math.exp(-e.deltaY*BOARD_INPUT.wheelSensitivity),{x:e.clientX,y:e.clientY});},{passive:false});
  window.addEventListener('resize',()=>{gesture.cancel();paint();});
  return {paint,cancel:()=>gesture.cancel(),reset:()=>{gesture.cancel();view.scale=1;view.x=view.y=0;paint();}};
}
