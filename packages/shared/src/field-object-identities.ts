/** #306 Q111–128. Identity/storage foundation only; no shield gameplay. */
export type FieldObjectId = string; // canonical positive decimal; never loses integer precision
export type WreckIdentity = { wreckId: FieldObjectId; [key: string]: unknown };
export type ShieldIdentity = {
  shieldId: FieldObjectId;
  sourceWreckId: FieldObjectId;
  sourceWreckIdInferred: boolean;
  generationOrder: FieldObjectId;
  [key: string]: unknown;
};
export type IdentityRepair = {
  kind: "counter" | "duplicate" | "source";
  target: string;
  before: unknown;
  after: unknown;
};
export type IdentityRepairLog = {
  at: string; // UTC; UI will format locally in a later PR
  severity: "error";
  repairs: IdentityRepair[];
  counts: { counter: number; duplicate: number; source: number };
};
/** Stable storage keys, not repaired numeric IDs, are used for references.
 * Thus reservations/inventory can refer to the same record through an ID repair.
 * sourceWreckId is historical provenance, never a mutable live reference.
 */
export type FieldObjectReference = { kind: "wreck" | "shield"; key: string };
export type FieldObjectIdentities = {
  nextWreckId: FieldObjectId;
  nextShieldOrder: FieldObjectId;
  wrecks: Record<string, WreckIdentity>;
  shields: Record<string, ShieldIdentity>;
  repairLogs: IdentityRepairLog[];
};

function record(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
function decimal(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : null;
}
function entries(value: unknown, label: string): [string, Record<string, unknown>][] {
  if (value == null) return [];
  if (!record(value) || Object.values(value).some(row => !record(row)))
    throw new Error(`Invalid field object ${label}; refuse destructive normalization`);
  return Object.entries(value) as [string, Record<string, unknown>][];
}
export function emptyFieldObjectIdentities(): FieldObjectIdentities {
  return { nextWreckId: "1", nextShieldOrder: "1", wrecks: {}, shields: {}, repairLogs: [] };
}

/** Pure, idempotent repair. Retains every record and its non-identity payload.
 * Missing entire state is legacy absence, not a counter repair/event.
 */
export function normalizeFieldObjectIdentities(raw: unknown, at = new Date()): FieldObjectIdentities | undefined {
  if (raw == null) return undefined;
  if (!record(raw)) throw new Error("Invalid field object identity state");
  const wreckEntries = entries(raw.wrecks, "wrecks"), shieldEntries = entries(raw.shields, "shields");
  const repairs: IdentityRepair[] = [];
  const log = (kind: IdentityRepair["kind"], target: string, before: unknown, after: unknown) =>
    repairs.push({ kind, target, before: before ?? null, after });
  let max = 0n, maxOrder = 0n;
  for (const [, row] of wreckEntries) { const id = decimal(row.wreckId); if (id && BigInt(id) > max) max = BigInt(id); }
  for (const [, row] of shieldEntries) {
    const id = decimal(row.shieldId), order = decimal(row.generationOrder);
    if (id && BigInt(id) > max) max = BigInt(id);
    // Missing generation order cannot establish Q122's oldest shield; don't guess.
    if (!order) throw new Error("Shield generation order required for identity repair");
    if (BigInt(order) > maxOrder) maxOrder = BigInt(order);
  }
  const storedNext = decimal(raw.nextWreckId);
  let next = storedNext && BigInt(storedNext) > max ? BigInt(storedNext) : max + 1n;
  if (!storedNext || BigInt(storedNext) <= max) log("counter", "nextWreckId", raw.nextWreckId, String(next));
  const storedOrder = decimal(raw.nextShieldOrder);
  const nextOrder = storedOrder && BigInt(storedOrder) > maxOrder ? BigInt(storedOrder) : maxOrder + 1n;
  if (!storedOrder || BigInt(storedOrder) <= maxOrder) log("counter", "nextShieldOrder", raw.nextShieldOrder, String(nextOrder));
  const allocate = () => String(next++);
  const used = new Set<string>();
  const shields: Record<string, ShieldIdentity> = Object.create(null);
  const wrecks: Record<string, WreckIdentity> = Object.create(null);
  // Oldest shield keeps a duplicate ID. Stable input order breaks equal-order
  // ties without changing generationOrder or inventing a new gameplay ranking.
  const sortedShields = [...shieldEntries].sort((a, b) => {
    const delta = BigInt(decimal(a[1].generationOrder)!) - BigInt(decimal(b[1].generationOrder)!);
    return delta < 0n ? -1 : delta > 0n ? 1 : 0;
  });
  const shieldIds = new Map<string, string>();
  for (const [key, row] of sortedShields) {
    const original = decimal(row.shieldId);
    const id = original && !used.has(original) ? original : allocate();
    if (id !== original) log("duplicate", `shields.${key}.shieldId`, row.shieldId, id);
    used.add(id); shieldIds.set(key, id);
  }
  for (const [key, row] of shieldEntries) {
    const id = shieldIds.get(key)!;
    // Q124 uses the CURRENT shield ID; Q123 keeps any valid historical source.
    const source = decimal(row.sourceWreckId);
    if (!source) log("source", `shields.${key}.sourceWreckId`, row.sourceWreckId, id);
    shields[key] = { ...row, shieldId: id, sourceWreckId: source ?? id,
      sourceWreckIdInferred: !source || row.sourceWreckIdInferred === true,
      generationOrder: decimal(row.generationOrder)! };
  }
  // Shields win shield/wreck collisions. Wreck keys/payload and all stable refs stay put.
  for (const [key, row] of wreckEntries) {
    const original = decimal(row.wreckId);
    const id = original && !used.has(original) ? original : allocate();
    if (id !== original) log("duplicate", `wrecks.${key}.wreckId`, row.wreckId, id);
    used.add(id); wrecks[key] = { ...row, wreckId: id };
  }
  // Collision allocations also advance the counter. Diagnostics report the
  // final stored value, not an intermediate high-water repair value.
  const counterRepair = repairs.find(repair => repair.target === "nextWreckId");
  if (counterRepair) counterRepair.after = String(next);
  if (raw.repairLogs != null && !Array.isArray(raw.repairLogs)) throw new Error("Invalid identity repair logs");
  const repairLogs = [...(raw.repairLogs ?? []) as IdentityRepairLog[]];
  if (repairs.length) {
    const counts = { counter: 0, duplicate: 0, source: 0 };
    for (const repair of repairs) counts[repair.kind]++;
    repairLogs.push({ at: at.toISOString(), severity: "error", repairs, counts });
  }
  return { nextWreckId: String(next), nextShieldOrder: String(nextOrder), wrecks, shields, repairLogs };
}

/** Allocates from the saved global counter, including across battlefield rebuilds.
 * Caller supplies a stable storage key and opaque payload, not gameplay policy.
 */
export function registerWreckIdentity(state: FieldObjectIdentities, key: string, payload: Record<string, unknown> = {}): FieldObjectIdentities {
  if (!key || Object.hasOwn(state.wrecks, key)) throw new Error("Wreck storage key already exists or is empty");
  const clean = normalizeFieldObjectIdentities(state)!;
  const id = clean.nextWreckId;
  return { ...clean, nextWreckId: String(BigInt(id) + 1n),
    wrecks: { ...clean.wrecks, [key]: { ...payload, wreckId: id } } };
}

/** Identity transition only. Caller invokes AFTER a confirmed stripping operation.
 * Keeps the source ID, consumes exactly one wreck identity, assigns one shield order.
 */
export function shieldIdentityFromWreck(state: FieldObjectIdentities, wreckKey: string, shieldKey: string,
  payload: Record<string, unknown> = {}): FieldObjectIdentities {
  const clean = normalizeFieldObjectIdentities(state)!;
  const wreck = Object.hasOwn(clean.wrecks, wreckKey) ? clean.wrecks[wreckKey] : undefined;
  if (!wreck || !shieldKey || Object.hasOwn(clean.shields, shieldKey)) throw new Error("Missing wreck or reused shield storage key");
  const wrecks = { ...clean.wrecks }; delete wrecks[wreckKey];
  const shield: ShieldIdentity = { ...payload, shieldId: wreck.wreckId, sourceWreckId: wreck.wreckId,
    sourceWreckIdInferred: false, generationOrder: clean.nextShieldOrder };
  return { ...clean, wrecks, shields: { ...clean.shields, [shieldKey]: shield },
    nextShieldOrder: String(BigInt(clean.nextShieldOrder) + 1n) };
}
export function resolveFieldObjectIdentity(state: FieldObjectIdentities, reference: FieldObjectReference): WreckIdentity | ShieldIdentity | undefined {
  const collection = reference.kind === "wreck" ? state.wrecks : state.shields;
  return Object.hasOwn(collection, reference.key) ? collection[reference.key] : undefined;
}
