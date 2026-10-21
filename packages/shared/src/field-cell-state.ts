import { normalizeLostMechShields, ownedShieldKeys, type LostMechShieldMap } from "./lost-mech-shields";
/** Browser-local battlefield persistence. Scope is an Invade seed + cell.
 * Identity records remain canonical in HubSnapshot.fieldObjectIdentities. */
import { isMechId, type MechId } from './catalog';
import { normalizeFieldObjectIdentities, emptyFieldObjectIdentities, type FieldObjectIdentities } from './field-object-identities';
import type { HubSnapshot } from './hub-save';
export type FieldLocation = { frontSeed: number; cell: { sx: number; sy: number } };
export type FieldEnemyIdentity = { modelId: MechId; durability: number; circuits: {
  circuitId: string; side: number; effectKey: string; effect: number; trueBoard: false;
}[] };
export type FieldWreck = {
  targetId: string; wreckKey: string; pos: { x: number; y: number };
  sourceInstanceId: string | null; seconds: number; shieldMaxHp?: number;
  circuits: { circuitId: string; side: number; effect: number }[];
  legacyAir?: true;
  enemy?: { name: string; maxHp: number; radius: number; heading: number; identity: FieldEnemyIdentity };
};
export type FieldCellState = {
  location: FieldLocation;
  ground: Record<string, { x: number; y: number }>;
  wrecks: FieldWreck[];
  barricades?: Record<string, {pos:{x:number;y:number};heading:number}>;
};
export type FieldCellReport = FieldCellState & { identities: FieldObjectIdentities; ownedShields?: LostMechShieldMap };
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => finite(v) && v > 0;
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const pos = (v: unknown): v is {x:number;y:number} => obj(v) && finite(v.x) && finite(v.y);
const circuit = (v: unknown): boolean => obj(v) && text(v.circuitId) && finite(v.side) && v.side >= 0 && finite(v.effect) && v.effect >= 0;
export function sameFieldLocation(a: FieldLocation, b: FieldLocation): boolean {
  return a.frontSeed === b.frontSeed && a.cell.sx === b.cell.sx && a.cell.sy === b.cell.sy;
}
function location(v: unknown): v is FieldLocation {
  return obj(v) && Number.isInteger(v.frontSeed) && Number(v.frontSeed) >= 0 && Number(v.frontSeed) <= 0xffffffff && obj(v.cell) &&
    [v.cell.sx,v.cell.sy].every(n => Number.isInteger(n) && Math.abs(Number(n)) <= 32);
}
function enemy(v: unknown): boolean {
  if (!obj(v) || !text(v.name) || !positive(v.maxHp) || !positive(v.radius) || !finite(v.heading) || !obj(v.identity)) return false;
  const i=v.identity;
  return text(i.modelId) && isMechId(i.modelId) && positive(i.durability) && Array.isArray(i.circuits) && i.circuits.every(c =>
    circuit(c) && obj(c) && text(c.effectKey) && c.trueBoard === false);
}
/** Refuse malformed state instead of silently deleting battlefield objects. */
export function normalizeFieldCells(raw: unknown, identities: FieldObjectIdentities | undefined): FieldCellState[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) throw new Error('Invalid field cells');
  const result: FieldCellState[] = [];
  for (const row of raw) {
    if (!obj(row) || !location(row.location) || !obj(row.ground) || !Array.isArray(row.wrecks) ||
      result.some(old => sameFieldLocation(old.location,row.location as FieldLocation))) throw new Error('Invalid/duplicate field cell');
    for (const [key, point] of Object.entries(row.ground)) {
      const shield = identities?.shields[key];
      if (!pos(point) || !shield || !positive(shield.hp) || !positive(shield.maxHp) || shield.hp > shield.maxHp)
        throw new Error('Invalid field shield reference');
      if (result.some(old => Object.hasOwn(old.ground,key))) throw new Error('Shield in multiple field cells');
    }
    if(row.barricades!==undefined && !obj(row.barricades))throw Error('Invalid barricades');
    for(const [key,b] of Object.entries((row.barricades??{}) as Record<string,unknown>)){
      const shield=identities?.shields[key];
      if(!obj(b)||!pos(b.pos)||!finite(b.heading)||!shield||!positive(shield.hp)||!positive(shield.maxHp)||shield.hp>shield.maxHp||Object.hasOwn(row.ground,key)||result.some(c=>Object.hasOwn(c.ground,key)||Object.hasOwn(c.barricades??{},key)))throw Error('Invalid barricade reference');
    }
    if(Object.keys(row.ground).some(k=>result.some(c=>Object.hasOwn(c.barricades??{},k))))throw Error('Duplicate shield location');
    const targets=new Set<string>(), wreckKeys=new Set<string>();
    for (const w of row.wrecks) {
      if (!obj(w) || !text(w.targetId) || !text(w.wreckKey) || !pos(w.pos) || !finite(w.seconds) || w.seconds < 0 || w.seconds >= 8 ||
        (w.shieldMaxHp !== undefined && (!finite(w.shieldMaxHp) || w.shieldMaxHp < 50)) ||
        !Array.isArray(w.circuits) || !w.circuits.every(circuit) || !identities?.wrecks[w.wreckKey] ||
        !(w.sourceInstanceId === null || text(w.sourceInstanceId)) ||
        (w.sourceInstanceId === null ? !(enemy(w.enemy) && w.legacyAir === undefined || w.legacyAir === true && w.enemy === undefined && w.targetId.startsWith("a:")) : w.enemy !== undefined || w.legacyAir !== undefined) || targets.has(w.targetId) || wreckKeys.has(w.wreckKey) ||
        result.some(c=>c.wrecks.some(old=>old.targetId===w.targetId || old.wreckKey===w.wreckKey)))
        throw new Error('Invalid field wreck');
      targets.add(w.targetId); wreckKeys.add(w.wreckKey);
    }
    result.push(structuredClone({location:row.location,ground:row.ground,wrecks:row.wrecks,...(row.barricades!==undefined?{barricades:row.barricades}:{})}) as FieldCellState);
  }
  return result;
}
export function normalizeFieldCellReport(raw: unknown): FieldCellReport | undefined {
  if (!obj(raw)) return undefined;
  try {
    const identities=normalizeFieldObjectIdentities(raw.identities);
    if (!identities) return undefined;
    const cells=normalizeFieldCells([raw],identities)!;
    const ownedShields=normalizeLostMechShields(raw.ownedShields,identities);
    if (Object.values(ownedShields ?? {}).some(s=>ownedShieldKeys(s).some(k=>(Object.hasOwn(cells[0]!.ground,k)||Object.hasOwn(cells[0]!.barricades??{},k))))) return undefined;
    return {...cells[0]!,identities,...(ownedShields ? {ownedShields} : {})};
  } catch { return undefined; }
}
/** Only the reported cell is replaced; an empty snapshot explicitly clears it.
 * A late return from a regenerated board cannot resurrect the old battlefield.
 * Caller supplies the existing sortieId transaction/deduplication. */
export function applyFieldCellReport(hub: HubSnapshot, raw: FieldCellReport | undefined): HubSnapshot {
  const report=normalizeFieldCellReport(raw);
  if (!report || hub.frontProgress?.seed !== report.location.frontSeed) return hub;
  const identities=structuredClone(hub.fieldObjectIdentities ?? emptyFieldObjectIdentities());
  const previous=hub.fieldCells?.find(c=>sameFieldLocation(c.location,report.location));
  for (const key of [...Object.keys(previous?.ground ?? {}),...Object.keys(previous?.barricades??{})]) delete identities.shields[key];
  for (const w of previous?.wrecks ?? []) delete identities.wrecks[w.wreckKey];
  // A mixed/stale report must not restore a recovered or stripped hull.
  report.wrecks=report.wrecks.filter(w=>w.sourceInstanceId
    ? hub.lostMechs.some(m=>m.instanceId===w.sourceInstanceId && m.kind==='wreck')
    : !hub.fleet.some(m=>m.instanceId===`recovered-${w.targetId}`) && !hub.wreckStrippingHistory?.some(r=>r.targetId===w.targetId));
  for (const key of [...Object.keys(report.ground),...Object.keys(report.barricades??{})]) identities.shields[key]=structuredClone(report.identities.shields[key]!);
  for (const w of report.wrecks) identities.wrecks[w.wreckKey]=structuredClone(report.identities.wrecks[w.wreckKey]!);
  const lostMechShields=Object.assign(Object.create(null),structuredClone(hub.lostMechShields ?? {})) as LostMechShieldMap;
  if(report.ownedShields!==undefined) for (const m of hub.lostMechs) if (m.frontSeed===report.location.frontSeed && m.cell?.sx===report.location.cell.sx && m.cell.sy===report.location.cell.sy) delete lostMechShields[m.instanceId];
  for (const [id,state] of Object.entries(report.ownedShields ?? {})) {
    if (!hub.lostMechs.some(m=>m.instanceId===id && m.kind!=='wreck')) continue;
    lostMechShields[id]=structuredClone(state);
    for (const key of ownedShieldKeys(state)) identities.shields[key]=structuredClone(report.identities.shields[key]!);
  }
  const max=(a:string,b:string)=>BigInt(a)>BigInt(b)?a:b;
  identities.nextWreckId=max(identities.nextWreckId,report.identities.nextWreckId);
  identities.nextShieldOrder=max(identities.nextShieldOrder,report.identities.nextShieldOrder);
  const {identities: _unused,ownedShields: _owned,...cell}=report;
  const fieldCells=[...(hub.fieldCells ?? []).filter(c=>!sameFieldLocation(c.location,cell.location)),cell];
  return {...hub,fieldObjectIdentities:identities,fieldCells,lostMechShields};
}

/** Ground objects vanish on regeneration; global ID high-water marks survive. */
export function clearFieldCells(hub: HubSnapshot): HubSnapshot {
  if (!hub.fieldCells?.length) return {...hub,fieldCells:[]};
  const identities=structuredClone(hub.fieldObjectIdentities ?? emptyFieldObjectIdentities());
  for (const cell of hub.fieldCells) {
    for (const key of [...Object.keys(cell.ground),...Object.keys(cell.barricades??{})]) delete identities.shields[key];
    for (const w of cell.wrecks) delete identities.wrecks[w.wreckKey];
  }
  return {...hub,fieldCells:[],fieldObjectIdentities:identities};
}
