import { shieldItem, shieldReservedBy, sortedGroundShields, spareShields } from '../game/shieldOperations';
import { equippedShield } from '../game/shields';
import { squadSees } from '../game/vision';
import { dist, type Vec2 } from '../game/math';
import type { World } from '../game/types';
const escape = (s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export type ShieldGroup={pos:Vec2;keys:string[];reserved:number};
export function groundShieldGroups(world:World):ShieldGroup[]{
 const groups=new Map<string,ShieldGroup>();
 for(const [key,pos] of Object.entries(world.shieldState?.ground??{})){
  if(!shieldItem(world,key) || !squadSees(world,pos))continue;
  const groupKey=`${pos.x}:${pos.y}`;
  let group=groups.get(groupKey);if(!group){group={pos,keys:[],reserved:0};groups.set(groupKey,group);}
  group.keys.push(key);if(shieldReservedBy(world,key))group.reserved++;
 }
 return [...groups.values()];
}
export function shieldGroupAt(world:World,point:Vec2,radius:number):ShieldGroup|null{
 return groundShieldGroups(world).filter(g=>dist(g.pos,point)<=radius).sort((a,b)=>dist(a.pos,point)-dist(b.pos,point))[0]??null;
}
export function shieldPanelHtml(world:World,selected:Vec2|null):string{
 const group=selected?groundShieldGroups(world).find(g=>g.pos.x===selected.x && g.pos.y===selected.y):null;
 const keys=sortedGroundShields(world,group?.keys??[]);
 const leader=world.leader, equipped=equippedShield(world,leader),spares=spareShields(world,leader);
 const hp=(key:string)=>{const item=shieldItem(world,key)!;return `${Number(item.hp.toFixed(1))}/${Number(item.maxHp.toFixed(1))}`;};
 const ground=keys.map(key=>{
  const owner=shieldReservedBy(world,key),own=owner===leader.id;
  return `<div class="row"><span>盾 ${hp(key)}${owner?'・回収中':''}</span><button type="button" data-shield-pick="${escape(key)}" ${own?'disabled':''}>${own?'回収中':'回収'}</button></div>`;
 }).join('');
 const held=[...(equipped?[{ref:{key:equipped.key},label:'装備盾'}]:[]),...spares.map(ref=>({ref,label:'予備盾'}))].map(({ref,label})=>{
  const locked=world.shieldState?.exchanges?.[leader.id]?.key===ref.key;
  return `<div class="row"><span>${label} ${hp(ref.key)}${locked?'・交換中':''}</span><button type="button" class="secondary" data-shield-drop="${escape(ref.key)}" ${locked?'disabled':''}>投棄</button></div>`;
 }).join('');
 return (ground?`<div class="card" role="group" aria-label="盾の回収候補"><strong>盾の回収候補</strong>${ground}</div>`:'')+(held?`<div class="card" role="group" aria-label="所持盾"><strong>所持盾</strong>${held}</div>`:'');
}
