import { wallEntries } from '../game/barricades';
import { wallCircleOverlap } from '../game/barricadeGeometry';
import { canStripWreck, strippingTargets } from '../game/strippingRuntime';
import { paletteWingmen } from '../game/circuitPlay';
import { squadSees } from '../game/vision';
import { dist, type Vec2 } from '../game/math';
import { shieldItem } from '../game/shieldOperations';
import type { World } from '../game/types';
import { groundShieldGroups } from './shieldPanel';
export type MapTarget = { kind: 'wall' | 'ground' | 'wreck' | 'wing'; key: string; label: string; pos: Vec2 };
/** UI hit areas only. Physical collision geometry and explicit order targets stay unchanged. */
export function mapTargetsAt(world: World, point: Vec2, radius: number): MapTarget[] {
  const targets: MapTarget[] = [];
  for (const [key, wall] of wallEntries(world)) {
    if (!squadSees(world, wall.pos) || !wallCircleOverlap(wall, point, radius)) continue;
    const item = shieldItem(world, key);
    if (item) targets.push({kind: 'wall', key, label: `設置盾 ${Number(item.hp.toFixed(1))}/${Number(item.maxHp.toFixed(1))}`, pos: {...wall.pos}});
  }
  for (const group of groundShieldGroups(world)) if (dist(group.pos, point) <= radius)
    targets.push({kind: 'ground', key: group.keys[0]!, label: `地面盾 ${group.keys.length}個（${group.keys.map(key=>{const s=shieldItem(world,key)!;return `${Number(s.hp.toFixed(1))}/${Number(s.maxHp.toFixed(1))}`;}).join("・")}）`, pos: {...group.pos}});
  if (canStripWreck(world)) for (const wreck of strippingTargets(world)) {
    if (dist(wreck.pos, point) <= radius && squadSees(world, wreck.pos))
      targets.push({kind: 'wreck', key: wreck.id, label: `残骸盾：${wreck.unit?.name ?? '残骸'}`, pos: {...wreck.pos}});
  }
  for (const id of paletteWingmen(world)) {
    const unit = world.wingmen.find(w => w.id === id)!;
    if (dist(unit.pos, point) <= radius)
      targets.push({kind: 'wing', key: id, label: `僚機：${unit.name}`, pos: {...unit.pos}});
  }
  return targets;
}
export function mapTargetChoicesHtml(targets: MapTarget[]): string {
  if (targets.length < 2) return '';
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  return `<div class="card" id="map-target-choices" role="group" aria-label="重なった操作候補"><strong>対象を選択</strong>${targets.map((t,i)=>`<button type="button" class="secondary" data-map-choice="${i}" data-map-target-key="${escape(t.key)}" data-map-target-kind="${t.kind}">${escape(t.label)}</button>`).join('')}<button type="button" class="secondary" data-map-choice="move">この地点へ移動</button><button type="button" class="secondary" data-map-choice="cancel">取消</button></div>`;
}
