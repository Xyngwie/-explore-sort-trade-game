import { emptyFieldObjectIdentities, type FieldObjectIdentities } from './field-object-identities';
import type { HubSnapshot } from './hub-save';
export type WreckStrippingObservation = {
  targetId: string; sourceInstanceId: string | null; wreckId: string;
  shieldId: string; generationOrder: string; at: string;
  circuits: { circuitId: string; side: number; effect: number }[];
  learningValue: null;
};
export type WreckStrippingReport = {
  observations: WreckStrippingObservation[]; nextWreckId: string; nextShieldOrder: string;
};
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d*$/.test(v);
export function normalizeStrippingObservations(raw: unknown): WreckStrippingObservation[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is WreckStrippingObservation => v && typeof v === 'object' &&
    typeof v.targetId === 'string' && (v.sourceInstanceId === null || typeof v.sourceInstanceId === 'string') &&
    id(v.wreckId) && id(v.shieldId) && id(v.generationOrder) && typeof v.at === 'string' && Number.isFinite(Date.parse(v.at)) &&
    v.learningValue === null && Array.isArray(v.circuits) && v.circuits.every((c: WreckStrippingObservation['circuits'][number]) =>
      c && typeof c.circuitId === 'string' && Number.isFinite(c.side) && c.side >= 0 && Number.isFinite(c.effect) && c.effect >= 0));
}
export function normalizeWreckStrippingReport(raw: unknown): WreckStrippingReport | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as WreckStrippingReport;
  if (!id(r.nextWreckId) || !id(r.nextShieldOrder) || !Array.isArray(r.observations)) return undefined;
  const observations = normalizeStrippingObservations(r.observations);
  if (observations.length !== r.observations.length) return undefined;
  return { observations, nextWreckId: r.nextWreckId, nextShieldOrder: r.nextShieldOrder };
}
/** Enemy returns name the acquired hull recovered-<runtime unit id>.
 * Legacy air-wreck targets prefix that same unit id with a:. Do not infer a
 * friendly instance ID from targetId: those carry sourceInstanceId explicitly.
 */
export function consumedStrippingMechIds(rows: readonly WreckStrippingObservation[]): Set<string> {
  return new Set(rows.flatMap(row => {
    if (row.sourceInstanceId) return [row.sourceInstanceId];
    const unitId = row.targetId.startsWith('a:') ? row.targetId.slice(2) : row.targetId;
    return /^(enemy-|stray-)/.test(unitId) ? [`recovered-${unitId}`] : [];
  }));
}
/** Applied inside the existing sortieId transaction. Stripping consumes the
 * mech and its circuits, whether it currently belongs to fleet or lostMechs.
 * Persist counters/history, not a new ownership or ground-shield lifetime rule.
 */
export function applyWreckStrippingReport(hub: HubSnapshot, raw: WreckStrippingReport | undefined): HubSnapshot {
  const report = normalizeWreckStrippingReport(raw);
  if (!report && !(hub.wreckStrippingHistory?.length)) return hub;
  const observations = [...(hub.wreckStrippingHistory ?? []), ...(report?.observations ?? [])];
  const mechs = consumedStrippingMechIds(observations);
  const circuits = new Set(observations.flatMap(r => r.circuits.map(c => c.circuitId)));
  for (const c of hub.circuits) if (c.equippedTo && mechs.has(c.equippedTo)) circuits.add(c.circuitId);
  for (const m of hub.lostMechs ?? []) if (mechs.has(m.instanceId)) for (const c of m.circuitIds) circuits.add(c);
  const identities: FieldObjectIdentities = structuredClone(hub.fieldObjectIdentities ?? emptyFieldObjectIdentities());
  const max = (a: string, b: string) => BigInt(a) > BigInt(b) ? a : b;
  if (report) {
    identities.nextWreckId = max(identities.nextWreckId, report.nextWreckId);
    identities.nextShieldOrder = max(identities.nextShieldOrder, report.nextShieldOrder);
  }
  for (const r of observations) {
    identities.nextWreckId = max(identities.nextWreckId, String(BigInt(r.shieldId) + 1n));
    identities.nextShieldOrder = max(identities.nextShieldOrder, String(BigInt(r.generationOrder) + 1n));
  }
  const history = [...(hub.wreckStrippingHistory ?? [])];
  for (const row of report?.observations ?? []) if (!history.some(old => old.shieldId === row.shieldId)) history.push(structuredClone(row));
  return { ...hub, fieldObjectIdentities: identities, wreckStrippingHistory: history,
    fleet: hub.fleet.filter(m => !mechs.has(m.instanceId)),
    lostMechs: (hub.lostMechs ?? []).filter(m => !mechs.has(m.instanceId)),
    circuits: hub.circuits.filter(c => !circuits.has(c.circuitId)),
    fieldDrops: (hub.fieldDrops ?? []).filter(d => !circuits.has(d.circuit.circuitId)),
    sortieSelection: (hub.sortieSelection ?? []).filter(value => !mechs.has(value)),
  };
}
