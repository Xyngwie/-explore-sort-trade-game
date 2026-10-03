/**
 * Circuit inventory pure functions on HubSave v3 (docs/CIRCUIT_DATA_MODEL_V0.md
 * §2.2 / §2.3 / §5 / §7). No UI, no storage. The effect→bonus conversion is
 * still undecided, so these only expose facts (restoreState / effect value).
 */
import { isCircuitRestoreStateActive } from "./circuit-board";
import { computeCircuitEffectForBoard } from "./circuit-clues";
import {
  HUB_LIMITS,
  circuitSize,
  isPerfectRestoredCircuit,
  mechSlotCapacity,
  normalizeCircuitRecord,
  normalizeFieldDrop,
  normalizeInventoryFieldDrops,
  normalizeHubSnapshot,
  sanitizeSortieId,
  type FieldCircuitDrop,
  type FieldDropCause,
  type FieldInventoryDrop,
  type FrontCellCoord,
  type HubCircuitRecord,
  type HubSnapshot,
  type LostMechReturnState,
} from "./hub-save";
import type { MechCircuitEntry } from "./handoff";
import {
  MECH_FLEET_RULES,
  createOwnedMech,
  normalizeBattery,
  syncMechStatus,
  type OwnedMech,
} from "./mech-fleet";
import { mergeYieldBags } from "./sort-yield";

// ---------------------------------------------------------------------------
// §2.2 effect (never stored — U17)
// ---------------------------------------------------------------------------

/** Board 評価値 — same computation as trade's sell price / hub brief. */
export function circuitEffectValue(
  rec: Pick<HubCircuitRecord, "circuitBoard" | "locked">,
): number {
  try {
    return computeCircuitEffectForBoard(rec.circuitBoard, {
      perfect: rec.circuitBoard.perfect ?? rec.locked,
    }).effect;
  } catch {
    return 0;
  }
}

/** Effect used in play: only Fully Awakened / Bypass count; others → 0. */
export function circuitActiveEffect(
  rec: Pick<HubCircuitRecord, "circuitBoard" | "locked" | "restoreState">,
): number {
  return isCircuitRestoreStateActive(rec.restoreState) ? circuitEffectValue(rec) : 0;
}

// ---------------------------------------------------------------------------
// §2.3 equip (HUB only). Squad cap is not checked until item 3 (U3).
// ---------------------------------------------------------------------------

export function circuitsEquippedTo(
  hub: Pick<HubSnapshot, "circuits">,
  mechInstanceId: string,
): HubCircuitRecord[] {
  return hub.circuits.filter((c) => c.equippedTo === mechInstanceId);
}

export function stashCircuits(hub: Pick<HubSnapshot, "circuits">): HubCircuitRecord[] {
  return hub.circuits.filter((c) => c.equippedTo == null);
}

export type EquipResult = {
  hub: HubSnapshot;
  ok: boolean;
  /** `on_lost_mech`: the circuit is attached to a left-behind mech (lostMechs) — it comes back only with the mech. */
  reason?: "no_circuit" | "no_mech" | "slot_full" | "on_lost_mech";
};

/** True when the circuit is attached to a left-behind mech (`lostMechs`). */
export function isCircuitOnLostMech(
  hub: Pick<HubSnapshot, "lostMechs">,
  rec: Pick<HubCircuitRecord, "equippedTo">,
): boolean {
  return rec.equippedTo != null && (hub.lostMechs ?? []).some((m) => m.instanceId === rec.equippedTo);
}

/**
 * Circuits the HUB shows as owned: every `HubSave.circuits` record except the
 * ones attached to a left-behind mech (`lostMechs`). Those stay in the save
 * (they come back with the mech when it is recovered) but are not listed,
 * counted, sold or re-equipped in the HUB.
 */
export function hubVisibleCircuits<C extends Pick<HubCircuitRecord, "equippedTo">>(
  hub: Pick<HubSnapshot, "lostMechs"> & { circuits?: readonly C[] | null },
): C[] {
  return (hub.circuits ?? []).filter((c) => !isCircuitOnLostMech(hub, c));
}

export function equipCircuit(
  hub: HubSnapshot,
  circuitId: string,
  mechInstanceId: string,
): EquipResult {
  const rec = hub.circuits.find((c) => c.circuitId === circuitId);
  if (!rec) return { hub, ok: false, reason: "no_circuit" };
  if (isCircuitOnLostMech(hub, rec)) return { hub, ok: false, reason: "on_lost_mech" };
  const mech = hub.fleet.find((m) => m.instanceId === mechInstanceId);
  if (!mech) return { hub, ok: false, reason: "no_mech" };
  if (rec.equippedTo === mechInstanceId) return { hub, ok: true };
  const used = hub.circuits.filter(
    (c) => c.equippedTo === mechInstanceId && c.circuitId !== circuitId,
  ).length;
  if (used >= mechSlotCapacity(mech)) return { hub, ok: false, reason: "slot_full" };
  const circuits = hub.circuits.map((c) =>
    c.circuitId === circuitId ? { ...c, equippedTo: mechInstanceId } : c,
  );
  return { hub: normalizeHubSnapshot({ ...hub, circuits }), ok: true };
}

export function unequipCircuit(hub: HubSnapshot, circuitId: string): HubSnapshot {
  const rec = hub.circuits.find((c) => c.circuitId === circuitId && c.equippedTo != null);
  if (!rec || isCircuitOnLostMech(hub, rec)) return hub;
  const circuits = hub.circuits.map((c) =>
    c.circuitId === circuitId ? { ...c, equippedTo: null } : c,
  );
  return normalizeHubSnapshot({ ...hub, circuits });
}

// ---------------------------------------------------------------------------
// §7 perfect max size / junk craft size
// ---------------------------------------------------------------------------

/**
 * Raise perfectMaxSize when `rec` is Perfect (Fully Awakened + locked, U10).
 * Never lowers it. The restore-import call site is impl B.
 */
export function recordPerfectSize(
  hub: HubSnapshot,
  rec: Pick<HubCircuitRecord, "restoreState" | "locked" | "circuitBoard">,
): HubSnapshot {
  if (!isPerfectRestoredCircuit(rec)) return hub;
  const n = Math.min(HUB_LIMITS.maxRestoreSide, circuitSize(rec));
  if (n <= hub.perfectMaxSize) return hub;
  return { ...hub, perfectMaxSize: n };
}

/**
 * Largest junk-craft side: min(ceiling, max(2, perfectMaxSize + 1)).
 * `ceiling` defaults to Restore's max side (U12: {@link HUB_LIMITS.maxRestoreSide}
 * = 20). The trade craft UI wiring is impl B.
 */
export function craftMaxSize(
  hub: Pick<HubSnapshot, "perfectMaxSize">,
  ceiling: number = HUB_LIMITS.maxRestoreSide,
): number {
  const n = Math.max(2, Math.floor(hub.perfectMaxSize ?? 0) + 1);
  if (!Number.isFinite(ceiling)) return n;
  return Math.max(2, Math.min(n, Math.floor(ceiling)));
}

// ---------------------------------------------------------------------------
// §5 field drops
// ---------------------------------------------------------------------------

/** Append drops (dedup by dropId; existing kept). */
export function addFieldDrops(
  hub: HubSnapshot,
  drops: readonly FieldCircuitDrop[],
): HubSnapshot {
  if (drops.length === 0) return hub;
  const seen = new Set(hub.fieldDrops.map((d) => d.dropId));
  const add: FieldCircuitDrop[] = [];
  for (const raw of drops) {
    const d = normalizeFieldDrop(raw);
    if (!d || seen.has(d.dropId)) continue;
    seen.add(d.dropId);
    add.push(d);
  }
  if (add.length === 0) return hub;
  return { ...hub, fieldDrops: [...hub.fieldDrops, ...add] };
}

/** Drops on one front cell of the current board (explore filter, U19). */
export function fieldDropsAt(
  hub: Pick<HubSnapshot, "fieldDrops">,
  frontSeed: number,
  cell: FrontCellCoord,
): FieldCircuitDrop[] {
  const seed = frontSeed >>> 0;
  return hub.fieldDrops.filter(
    (d) => d.frontSeed === seed && d.cell.sx === cell.sx && d.cell.sy === cell.sy,
  );
}

export type RecoverResult = {
  hub: HubSnapshot;
  /** circuitIds returned to the stash (unchanged, equippedTo null — U18). */
  recovered: string[];
};

/**
 * Return dropped circuits to the stash exactly as they were (§5.1). A drop
 * whose circuitId already exists in hub.circuits stays on the field.
 */
export function recoverFieldDrops(
  hub: HubSnapshot,
  dropIds: readonly string[],
): RecoverResult {
  const want = new Set(dropIds);
  if (want.size === 0) return { hub, recovered: [] };
  const owned = new Set(hub.circuits.map((c) => c.circuitId));
  const back: HubCircuitRecord[] = [];
  const remaining: FieldCircuitDrop[] = [];
  for (const d of hub.fieldDrops) {
    if (want.has(d.dropId) && !owned.has(d.circuit.circuitId)) {
      owned.add(d.circuit.circuitId);
      back.push({ ...d.circuit, equippedTo: null });
    } else {
      remaining.push(d);
    }
  }
  if (back.length === 0) return { hub, recovered: [] };
  return {
    hub: normalizeHubSnapshot({
      ...hub,
      circuits: [...back, ...hub.circuits],
      fieldDrops: remaining,
    }),
    recovered: back.map((c) => c.circuitId),
  };
}

// ---------------------------------------------------------------------------
// §5.4 sortie report (applied once per sortieId — U9)
// ---------------------------------------------------------------------------

export type SortieCircuitReport = {
  sortieId: string;
  /** Sortie cell. null = not via Invade → dropped circuits are lost (U7). */
  cell: FrontCellCoord | null;
  frontSeed: number | null;
  lostMechInstanceIds: string[];
  lostCause: Record<string, FieldDropCause>;
  recoveredDropIds: string[];
  acquiredCircuits: HubCircuitRecord[];
  inventoryDrops?: FieldInventoryDrop[];
  recoveredInventoryDropIds?: string[];
  wreckedMechInstanceIds?: string[];
  /** Explore return snapshots for mechs left behind; does not create field drops. */
  lostMechs?: LostMechReturnState[];
  /** Left-behind mechs picked up this sortie → back to the fleet (`recoverLostMechs`). */
  recoveredLostMechInstanceIds?: string[];
};

export type ApplySortieResult = {
  hub: HubSnapshot;
  /** false when sortieId was already applied / invalid (hub unchanged). */
  applied: boolean;
  /** Circuits moved to fieldDrops. */
  droppedToField: FieldCircuitDrop[];
  /** Circuits lost with no record (no Invade cell, U7) — show on the result screen. */
  lostForever: HubCircuitRecord[];
  /** circuitIds recovered to the stash. */
  recovered: string[];
  /** Acquired circuitIds added to the stash. */
  acquired: string[];
  droppedInventoryToField: FieldInventoryDrop[];
  recoveredInventory: string[];
  /** Left-behind mechs put back into the fleet this sortie. */
  recoveredMechs: string[];
};

/**
 * Durability for a recovered row without a copy (older saves): the lowest
 * operational value — it can sortie, and nothing is invented beyond that.
 */
export const LOST_MECH_RECOVERY_FALLBACK_DURABILITY = MECH_FLEET_RULES.operationalMinDurability;

/** Rebuild the fleet mech for a lostMechs row (instanceId / ammo / battery kept). */
export function ownedMechFromLostMech(row: LostMechReturnState): OwnedMech {
  const base = createOwnedMech(row.catalogId ?? "mech_gen1", {
    instanceId: row.instanceId,
    durability: row.durability ?? LOST_MECH_RECOVERY_FALLBACK_DURABILITY,
    ...(row.durabilityMax != null ? { durabilityMax: row.durabilityMax } : {}),
    ...(row.currentAmmo != null ? { currentAmmo: row.currentAmmo } : {}),
  });
  return syncMechStatus({ ...base, battery: normalizeBattery(row.battery) });
}

/**
 * Recovery (CIRCUIT_DATA_MODEL_V0 §5.6): the listed left-behind mechs leave
 * `lostMechs` and rejoin the fleet (appended) with the same instanceId,
 * carried ammo and battery. Their circuits never left them (`equippedTo` is
 * still the mech), so they come back equipped. Ids not in `lostMechs`, or
 * already in the fleet, are ignored.
 */
export function recoverLostMechs(
  hub: HubSnapshot,
  instanceIds: readonly string[],
): { hub: HubSnapshot; recovered: string[] } {
  const want = new Set(instanceIds.map((id) => id.trim()).filter(Boolean));
  if (want.size === 0) return { hub, recovered: [] };
  const fleetIds = new Set(hub.fleet.map((m) => m.instanceId));
  const back: OwnedMech[] = [];
  const remaining: LostMechReturnState[] = [];
  for (const row of hub.lostMechs ?? []) {
    if (want.has(row.instanceId) && !fleetIds.has(row.instanceId)) back.push(ownedMechFromLostMech(row));
    else remaining.push(row);
  }
  if (back.length === 0) return { hub, recovered: [] };
  return {
    hub: normalizeHubSnapshot({ ...hub, fleet: [...hub.fleet, ...back], lostMechs: remaining }),
    recovered: back.map((m) => m.instanceId),
  };
}

/**
 * Apply one Explore sortie report to the hub (pure, idempotent by sortieId).
 * Lost mechs leave the fleet; their equipped circuits become field drops on
 * the sortie cell (or are lost when `cell` is null, U7). Recovered drops go
 * back to the stash unchanged; acquired circuits are added to the stash.
 */
export function applySortieReport(
  hub: HubSnapshot,
  report: SortieCircuitReport,
  at = new Date(),
): ApplySortieResult {
  const none: ApplySortieResult = {
    hub,
    applied: false,
    droppedToField: [],
    lostForever: [],
    recovered: [],
    acquired: [],
    droppedInventoryToField: [],
    recoveredInventory: [],
    recoveredMechs: [],
  };
  const sortieId = sanitizeSortieId(report.sortieId);
  if (!sortieId) return none;
  if ((hub.appliedSortieIds ?? []).includes(sortieId)) return none;

  // Recovery first: picked-up mechs rejoin the fleet before this sortie's losses.
  const recoveredMechsResult = recoverLostMechs(hub, report.recoveredLostMechInstanceIds ?? []);
  hub = recoveredMechsResult.hub;
  const recoveredMechIds = new Set(recoveredMechsResult.recovered);

  const lost = new Set(report.lostMechInstanceIds);
  const wrecked = new Set(
    (report.wreckedMechInstanceIds ?? []).filter((id) => !lost.has(id)),
  );
  const canonicalCircuitIds = new Set(hub.circuits.map((c) => c.circuitId));
  const fleetById = new Map(hub.fleet.map((m) => [m.instanceId, m]));
  const existingLost = new Map((hub.lostMechs ?? []).map((m) => [m.instanceId, m]));
  const lostMechs = (report.lostMechs ?? [])
    .filter(
      (m, index, rows) =>
        m.instanceId.trim().length > 0 &&
        // a fleet mech left behind, or a reappeared lost mech left again (updated in place)
        (fleetById.has(m.instanceId) || existingLost.has(m.instanceId)) &&
        !recoveredMechIds.has(m.instanceId) &&
        rows.findIndex((row) => row.instanceId === m.instanceId) === index &&
        !lost.has(m.instanceId) &&
        !wrecked.has(m.instanceId),
    )
    .map((m) => lostMechRecord(m, {
      fleetMech: fleetById.get(m.instanceId),
      previous: existingLost.get(m.instanceId),
      sortieId,
      at,
      cell: report.cell,
      frontSeed: report.frontSeed,
      canonicalCircuitIds,
    }));
  const lostMechIds = new Set(lostMechs.map((m) => m.instanceId));
  const droppedAt = at.toISOString();
  const droppedToField: FieldCircuitDrop[] = [];
  const lostForever: HubCircuitRecord[] = [];
  const keep: HubCircuitRecord[] = [];
  for (const c of hub.circuits) {
    if (c.equippedTo == null || !lost.has(c.equippedTo)) {
      keep.push(c);
      continue;
    }
    const circuit: HubCircuitRecord = { ...c, equippedTo: null };
    if (report.cell && report.frontSeed != null && Number.isFinite(report.frontSeed)) {
      const drop: FieldCircuitDrop = {
        dropId: `drop_${sortieId}_${c.circuitId}`,
        frontSeed: report.frontSeed >>> 0,
        cell: { sx: report.cell.sx, sy: report.cell.sy },
        circuit,
        cause: report.lostCause[c.equippedTo] ?? "wreck_not_carried",
        fromMechInstanceId: c.equippedTo,
        droppedAt,
      };
      droppedToField.push(drop);
    } else {
      lostForever.push(circuit);
    }
  }

  let next: HubSnapshot = {
    ...hub,
    fleet: hub.fleet
      .filter((m) => !lost.has(m.instanceId) && !lostMechIds.has(m.instanceId))
      .map((m) =>
        wrecked.has(m.instanceId)
          ? syncMechStatus({ ...m, durability: 0, status: "destroyed" })
          : m,
      ),
    circuits: keep,
  };
  next = addFieldDrops(next, droppedToField);

  const inventoryDrops = normalizeInventoryFieldDrops(report.inventoryDrops ?? []);
  const existingInventoryDropIds = new Set(
    next.inventoryFieldDrops.map((d) => d.dropId),
  );
  const droppedInventoryToField: FieldInventoryDrop[] = [];
  for (const drop of inventoryDrops) {
    if (existingInventoryDropIds.has(drop.dropId)) continue;
    existingInventoryDropIds.add(drop.dropId);
    droppedInventoryToField.push(drop);
  }
  if (droppedInventoryToField.length > 0) {
    next = {
      ...next,
      inventoryFieldDrops: [
        ...next.inventoryFieldDrops,
        ...droppedInventoryToField,
      ],
    };
  }

  if (lostMechs.length > 0) {
    // newest first; a re-lost entry replaces its old row (same instanceId)
    next = {
      ...next,
      lostMechs: [...lostMechs, ...(next.lostMechs ?? []).filter((m) => !lostMechIds.has(m.instanceId))],
    };
  }

  const rec = recoverFieldDrops(next, report.recoveredDropIds);
  next = rec.hub;

  const recoveredInventoryIds = new Set(report.recoveredInventoryDropIds ?? []);
  const recoveredInventory: string[] = [];
  const remainingInventoryDrops: FieldInventoryDrop[] = [];
  let recoveredBag = next.inventory;
  for (const drop of next.inventoryFieldDrops) {
    if (!recoveredInventoryIds.has(drop.dropId)) {
      remainingInventoryDrops.push(drop);
      continue;
    }
    recoveredBag = mergeYieldBags(recoveredBag, drop.inventory);
    recoveredInventory.push(drop.dropId);
  }
  if (recoveredInventory.length > 0) {
    next = {
      ...next,
      inventory: recoveredBag,
      inventoryFieldDrops: remainingInventoryDrops,
    };
  }

  const owned = new Set(next.circuits.map((c) => c.circuitId));
  const acquired: HubCircuitRecord[] = [];
  for (const raw of report.acquiredCircuits) {
    const c = normalizeCircuitRecord(raw);
    if (!c || owned.has(c.circuitId)) continue;
    owned.add(c.circuitId);
    acquired.push({ ...c, equippedTo: null, acquiredAt: c.acquiredAt ?? droppedAt });
  }
  const applied = [...(hub.appliedSortieIds ?? []), sortieId].slice(
    -HUB_LIMITS.maxAppliedSortieIds,
  );
  next = normalizeHubSnapshot({
    ...next,
    circuits: [...acquired, ...next.circuits],
    appliedSortieIds: applied,
  });
  return {
    hub: next,
    applied: true,
    droppedToField,
    lostForever,
    recovered: rec.recovered,
    acquired: acquired.map((c) => c.circuitId),
    droppedInventoryToField,
    recoveredInventory,
    recoveredMechs: recoveredMechsResult.recovered,
  };
}

/**
 * One lostMechs row from a return row. Location comes from the row or the
 * report (`frontSeed` + `cell`, i.e. a sortie via Invade). Only rows with a
 * location get `lostAt` / `lostSortieId` and the copy (`catalogId` /
 * `durability` / `durabilityMax` / `status`, taken from the fleet mech or the
 * previous row): those are the mechs that can reappear and be recovered.
 * Without a location (not via Invade) the row keeps its old shape — the
 * decision is that such mechs are lost outright (Explore PR of the recovery
 * work); until then they stay as before.
 */
function lostMechRecord(
  row: LostMechReturnState,
  ctx: {
    fleetMech: OwnedMech | undefined;
    previous: LostMechReturnState | undefined;
    sortieId: string;
    at: Date;
    cell: FrontCellCoord | null;
    frontSeed: number | null;
    canonicalCircuitIds: ReadonlySet<string>;
  },
): LostMechReturnState {
  const prev = ctx.previous;
  const merged: LostMechReturnState = {
    ...(prev ?? {}),
    ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)),
    instanceId: row.instanceId,
    currentAmmo: row.currentAmmo ?? prev?.currentAmmo,
    battery: row.battery,
    circuitIds: [...new Set(row.circuitIds.filter((id) => ctx.canonicalCircuitIds.has(id)))],
  };
  const frontSeed =
    row.frontSeed ?? (ctx.frontSeed != null && Number.isFinite(ctx.frontSeed) ? ctx.frontSeed >>> 0 : undefined);
  const cell = row.cell ?? ctx.cell ?? undefined;
  if (frontSeed == null || !cell) return merged;
  const m = ctx.fleetMech;
  return {
    ...merged,
    frontSeed,
    cell: { sx: cell.sx, sy: cell.sy },
    lostAt: ctx.at.toISOString(),
    lostSortieId: ctx.sortieId,
    catalogId: m?.catalogId ?? merged.catalogId ?? "mech_gen1",
    durability: row.durability ?? m?.durability ?? merged.durability,
    durabilityMax: m?.durabilityMax ?? merged.durabilityMax,
    status: row.status ?? m?.status ?? merged.status,
  };
}

// ---------------------------------------------------------------------------
// §4 trade → explore mechCircuits payload
// ---------------------------------------------------------------------------

/** Equipped circuits per deployed mech (stash circuits are never sent). */
export function buildMechCircuitsForDeploy(
  hub: Pick<HubSnapshot, "circuits">,
  deployedInstanceIds: readonly string[],
): Record<string, MechCircuitEntry[]> {
  const out: Record<string, MechCircuitEntry[]> = {};
  for (const id of deployedInstanceIds) {
    const list = hub.circuits.filter((c) => c.equippedTo === id);
    if (list.length === 0) continue;
    out[id] = list.map((c) => {
      const e: MechCircuitEntry = {
        circuitId: c.circuitId,
        restoreState: c.restoreState,
        effect: circuitEffectValue(c),
      };
      if (c.effectKey) e.effectKey = c.effectKey;
      return e;
    });
  }
  return out;
}
