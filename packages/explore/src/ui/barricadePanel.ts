import { shieldItem } from '../game/shieldOperations';
import type { World } from '../game/types';
export function barricadePanelHtml(w:World,key:string|null):string {
 if(!key || !w.barricades?.walls[key])return '';
 const item=shieldItem(w,key);if(!item)return '';
 const b=w.barricades.walls[key]!,u=w.leader;
 const disabled=!u.alive||w.operationTimedOut||Math.hypot(u.pos.x-b.pos.x,u.pos.y-b.pos.y)>u.radius*2||!!w.barricades.jobs[u.id];
 const esc=key.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 return `<div class="card"><strong>設置盾 ${Number(item.hp.toFixed(1))}/${Number(item.maxHp.toFixed(1))}</strong><button type="button" data-barricade-dismantle="${esc}" ${disabled?'disabled':''}>撤去</button></div>`;
}
