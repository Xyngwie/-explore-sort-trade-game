import type { FieldObjectIdentities, FieldObjectReference } from './field-object-identities';
import type { LostMechReturnState } from './hub-save';
export type LostMechShields = {
  equipped?: FieldObjectReference;
  spares: FieldObjectReference[];
  exchange?: { key: string; remaining: number };
};
export type LostMechShieldMap = Record<string, LostMechShields>;
export function ownedShieldKeys(state: LostMechShields): string[] {
  return [...(state.equipped ? [state.equipped.key] : []),...state.spares.map(r=>r.key)];
}
/** Invalid references refuse the save, rather than silently losing equipment. */
export function normalizeLostMechShields(raw: unknown, identities: FieldObjectIdentities | undefined,
  lost?: readonly LostMechReturnState[]): LostMechShieldMap | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid lost mech shields');
  const result: LostMechShieldMap=Object.create(null), used=new Set<string>();
  const ref=(v:unknown):v is FieldObjectReference=>{
    if (!v || typeof v!=='object') return false;
    const r=v as FieldObjectReference,item=r.kind==='shield' && identities?.shields[r.key];
    return !!item && typeof item.hp==='number' && item.hp>0 && Number.isFinite(item.hp) && typeof item.maxHp==='number' && item.maxHp>=item.hp && Number.isFinite(item.maxHp);
  };
  for (const [id,value] of Object.entries(raw)) {
    // Existing mech recovery/stripping can remove an owner in the same transaction.
    if (lost && !lost.some(m=>m.instanceId===id && m.kind!=='wreck')) continue;
    const s=value as LostMechShields;
    if (!id || !s || typeof s!=='object' || !Array.isArray(s.spares) || !s.spares.every(ref) || (s.equipped!==undefined && !ref(s.equipped))) throw Error('Invalid owned shields');
    const keys=ownedShieldKeys(s);
    if (new Set(keys).size!==keys.length || keys.some(k=>used.has(k))) throw Error('Duplicate shield owner');
    if (s.exchange !== undefined && (!s.exchange || typeof s.exchange !== 'object' || s.equipped || typeof s.exchange.key!=='string' || !s.spares.some(r=>r.key===s.exchange!.key) ||
      !Number.isFinite(s.exchange.remaining) || s.exchange.remaining<0 || s.exchange.remaining>2)) throw Error('Invalid saved shield exchange');
    keys.forEach(k=>used.add(k));result[id]=structuredClone(s);
  }
  return result;
}
