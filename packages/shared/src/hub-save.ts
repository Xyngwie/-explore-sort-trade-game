import {
  AMMO_IDS,
  type AmmoId,
  type AmmoLoad,
  INITIAL_AMMO_LOAD,
  isAmmoId,
  isMechId,
  type MechId,
  emptyAmmoLoad,
} from "./catalog";
import { HUB_SAVE_STORAGE_KEY } from "./constants";
import {
  createOwnedMech,
  normalizeFleet,
  type OwnedMech,
} from "./mech-fleet";
import {
  applyYieldBagToInventory,
  compactYieldBag,
  emptyYieldBag,
  type YieldBag,
} from "./sort-yield";
import {
  isCircuitOutcome,
  normalizeCircuitBoard,
  type CircuitBoardState,
  type CircuitOutcome,
} from "./circuit-board";

export { HUB_SAVE_STORAGE_KEY };

/**
 * One circuit board known to the hub (Module 5 restore results).
 * Additive on HubSave v2 — missing → [].
 */
export type HubCircuitRecord = {
  circuitId: string;
  circuitBoard: CircuitBoardState;
  /** Last restore→trade outcome (also mirrored onto board.outcome). */
  outcome: CircuitOutcome;
  /** ISO timestamp of last upsert (optional). */
  updatedAt?: string;
};

/**
 * Current hub snapshot. `fleet` holds owned instances (not bare MechId).
 * Legacy saves with `MechId[]` are migrated in normalize / parse.
 * `circuits` holds Module 5 restore boards (additive; missing → []).
 */
export type HubSnapshot = {
  credits: number;
  materials: number;
  fleet: OwnedMech[];
  ammoLoad: AmmoLoad;
  /** Typed materials / parts from sort Yield v2 (additive; missing → {}). */
  inventory: YieldBag;
  /**
   * Module 5 circuit boards (restore results). Additive on HubSave v2;
   * missing / invalid → []. Upserted by circuitId (most recent first).
   */
  circuits: HubCircuitRecord[];
  importedMaterials: number;
  selectedMechId: MechId;
  selectedAmmoId: AmmoId;
};

/** @deprecated Prefer HubSaveV2 — kept for migration typing. */
export type HubSaveV1 = {
  v: 1;
  savedAt: string;
  hub: {
    credits: number;
    materials: number;
    /** Legacy: catalog ids only. */
    fleet: MechId[] | OwnedMech[];
    ammoLoad: AmmoLoad;
    importedMaterials: number;
    selectedMechId: MechId;
    selectedAmmoId: AmmoId;
  };
};

export type HubSaveV2 = {
  v: 2;
  savedAt: string;
  hub: HubSnapshot;
};

/** Current on-disk / in-memory save shape. */
export type HubSave = HubSaveV2;

export const INITIAL_HUB: HubSnapshot = {
  credits: 500,
  materials: 250,
  fleet: [],
  ammoLoad: { ...INITIAL_AMMO_LOAD },
  inventory: emptyYieldBag(),
  circuits: [],
  importedMaterials: 0,
  selectedMechId: "mech_gen1",
  selectedAmmoId: "ammo_standard",
};

export const HUB_LIMITS = {
  maxMechs: 3,
  maxAmmo: 100,
  materialUnitPrice: 10,
  /** Cap of persisted restore circuits (most recent kept). */
  maxCircuits: 8,
} as const;

function finiteNonNeg(n: unknown, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, x);
}

function normalizeInventory(raw: unknown, fallback: YieldBag = emptyYieldBag()): YieldBag {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return compactYieldBag(fallback);
  }
  return compactYieldBag(raw as YieldBag);
}

const CIRCUIT_ID_RE = /^[a-zA-Z0-9_.:-]{1,64}$/;

function sanitizeCircuitId(raw: unknown, fallback = "circuit"): string {
  if (typeof raw !== "string") return fallback;
  const t = raw.trim().slice(0, 64);
  if (!t || !CIRCUIT_ID_RE.test(t)) return fallback;
  return t;
}

/**
 * Normalize HubSnapshot.circuits (array or id→record map). Dedupes by circuitId;
 * most recent / first-seen wins order; capped at HUB_LIMITS.maxCircuits.
 */
export function normalizeCircuits(
  raw: unknown,
  fallback: HubCircuitRecord[] = [],
  max = HUB_LIMITS.maxCircuits,
): HubCircuitRecord[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    list = Object.entries(raw as Record<string, unknown>).map(([id, v]) => {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return { circuitId: id, ...(v as Record<string, unknown>) };
      }
      return null;
    });
  } else if (raw == null) {
    list = fallback;
  } else {
    list = fallback;
  }

  const out: HubCircuitRecord[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const board = normalizeCircuitBoard(obj.circuitBoard ?? obj.board);
    if (!board) continue;
    const outcomeRaw = obj.outcome ?? board.outcome;
    if (!isCircuitOutcome(outcomeRaw)) continue;
    const circuitId = sanitizeCircuitId(
      obj.circuitId ?? board.puzzleId,
      `circuit_${out.length}`,
    );
    if (seen.has(circuitId)) continue;
    seen.add(circuitId);
    const boardWithOutcome: CircuitBoardState = {
      ...board,
      outcome: outcomeRaw,
    };
    const rec: HubCircuitRecord = {
      circuitId,
      circuitBoard: boardWithOutcome,
      outcome: outcomeRaw,
    };
    if (typeof obj.updatedAt === "string" && obj.updatedAt.trim()) {
      rec.updatedAt = obj.updatedAt.trim().slice(0, 40);
    }
    out.push(rec);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeHubSnapshot(
  raw: Partial<HubSnapshot> | Record<string, unknown> | null | undefined,
  fallback: HubSnapshot = INITIAL_HUB,
): HubSnapshot {
  const fleetIn = Array.isArray((raw as HubSnapshot | undefined)?.fleet)
    ? (raw as HubSnapshot).fleet
    : fallback.fleet;
  const fleet = normalizeFleet(fleetIn, HUB_LIMITS.maxMechs);

  const ammoLoad: AmmoLoad = emptyAmmoLoad();
  const src =
    ((raw as HubSnapshot | undefined)?.ammoLoad as AmmoLoad | undefined) ??
    fallback.ammoLoad;
  for (const id of AMMO_IDS) {
    ammoLoad[id] = finiteNonNeg(src[id], fallback.ammoLoad[id] ?? 0);
  }
  let total = AMMO_IDS.reduce((s, id) => s + ammoLoad[id], 0);
  if (total > HUB_LIMITS.maxAmmo) {
    const scale = HUB_LIMITS.maxAmmo / total;
    for (const id of AMMO_IDS) {
      ammoLoad[id] = Math.floor(ammoLoad[id] * scale);
    }
  }

  const selectedMechIdRaw = (raw as HubSnapshot | undefined)?.selectedMechId;
  const selectedMechId =
    selectedMechIdRaw && isMechId(String(selectedMechIdRaw))
      ? (String(selectedMechIdRaw) as MechId)
      : fallback.selectedMechId;
  const selectedAmmoIdRaw = (raw as HubSnapshot | undefined)?.selectedAmmoId;
  const selectedAmmoId =
    selectedAmmoIdRaw && isAmmoId(String(selectedAmmoIdRaw))
      ? (String(selectedAmmoIdRaw) as AmmoId)
      : fallback.selectedAmmoId;

  const inventory = normalizeInventory(
    (raw as HubSnapshot | undefined)?.inventory,
    fallback.inventory ?? emptyYieldBag(),
  );

  const circuits = normalizeCircuits(
    (raw as HubSnapshot | undefined)?.circuits,
    fallback.circuits ?? [],
  );

  return {
    credits: finiteNonNeg(
      (raw as HubSnapshot | undefined)?.credits,
      fallback.credits,
    ),
    materials: finiteNonNeg(
      (raw as HubSnapshot | undefined)?.materials,
      fallback.materials,
    ),
    fleet,
    ammoLoad,
    inventory,
    circuits,
    importedMaterials: finiteNonNeg(
      (raw as HubSnapshot | undefined)?.importedMaterials,
      fallback.importedMaterials,
    ),
    selectedMechId,
    selectedAmmoId,
  };
}

export function createHubSave(hub: HubSnapshot, at = new Date()): HubSaveV2 {
  return {
    v: 2,
    savedAt: at.toISOString(),
    hub: normalizeHubSnapshot(hub),
  };
}

/** Convert a parsed v1 (or loose) hub blob into a v2 save. */
export function migrateHubSaveV1ToV2(raw: HubSaveV1 | HubSaveV2 | {
  v?: number;
  savedAt?: string;
  hub?: unknown;
}): HubSaveV2 {
  const savedAt =
    typeof raw.savedAt === "string" ? raw.savedAt : new Date(0).toISOString();
  const hub = normalizeHubSnapshot(
    (raw.hub ?? {}) as Partial<HubSnapshot>,
  );
  return { v: 2, savedAt, hub };
}

export function parseHubSave(raw: unknown): HubSaveV2 | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== 1 && obj.v !== 2) return null;
  if (!obj.hub || typeof obj.hub !== "object") return null;
  return migrateHubSaveV1ToV2(
    obj as { v: number; savedAt?: string; hub: unknown },
  );
}

export function serializeHubSave(save: HubSaveV2): string {
  return JSON.stringify(save);
}

export function deserializeHubSave(json: string): HubSaveV2 | null {
  try {
    return parseHubSave(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Browser helper — safe no-op outside window. */
export function loadHubSaveFromLocalStorage(
  storage?: Pick<Storage, "getItem"> | null,
): HubSaveV2 | null {
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null);
  if (!store) return null;
  const raw = store.getItem(HUB_SAVE_STORAGE_KEY);
  if (!raw) return null;
  return deserializeHubSave(raw);
}

export function saveHubSaveToLocalStorage(
  hub: HubSnapshot,
  storage?: Pick<Storage, "setItem"> | null,
): boolean {
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null);
  if (!store) return false;
  try {
    store.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(createHubSave(hub)));
    return true;
  } catch {
    return false;
  }
}

export function clearHubSaveFromLocalStorage(
  storage?: Pick<Storage, "removeItem"> | null,
): void {
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null);
  store?.removeItem(HUB_SAVE_STORAGE_KEY);
}

/** Apply Module 2 import onto a hub snapshot (materials += n). */
export function importMaterialsIntoHub(
  hub: HubSnapshot,
  importMaterials: number,
): HubSnapshot {
  const n = Math.max(0, Math.floor(importMaterials));
  if (n <= 0) return hub;
  return normalizeHubSnapshot({
    ...hub,
    importedMaterials: n,
    materials: hub.materials + n,
  });
}

/** Merge typed YieldBag into hub inventory (sort → trade v2). */
export function importYieldBagIntoHub(
  hub: HubSnapshot,
  bag: YieldBag,
): HubSnapshot {
  const next = applyYieldBagToInventory(hub.inventory ?? emptyYieldBag(), bag);
  if (Object.keys(compactYieldBag(bag)).length === 0) return hub;
  return normalizeHubSnapshot({
    ...hub,
    inventory: next,
  });
}


/** Upsert a restore circuit into hub.circuits (most recent first; capped). */
export function upsertCircuitIntoHub(
  hub: HubSnapshot,
  input: {
    circuitId?: string;
    circuitBoard: CircuitBoardState;
    outcome: CircuitOutcome;
    updatedAt?: string;
  },
  at = new Date(),
): HubSnapshot {
  if (!isCircuitOutcome(input.outcome)) return hub;
  const board = normalizeCircuitBoard(input.circuitBoard);
  if (!board) return hub;
  const circuitId = sanitizeCircuitId(
    input.circuitId ?? board.puzzleId,
    "circuit",
  );
  const boardWithOutcome: CircuitBoardState = { ...board, outcome: input.outcome };
  const updatedAt =
    typeof input.updatedAt === "string" && input.updatedAt.trim()
      ? input.updatedAt.trim().slice(0, 40)
      : at.toISOString();
  const nextRec: HubCircuitRecord = {
    circuitId,
    circuitBoard: boardWithOutcome,
    outcome: input.outcome,
    updatedAt,
  };
  const rest = (hub.circuits ?? []).filter((c) => c.circuitId !== circuitId);
  const circuits = normalizeCircuits([nextRec, ...rest]);
  return normalizeHubSnapshot({ ...hub, circuits });
}

/** Purchase / add a fresh owned mech if under cap. */
export function addMechToHub(
  hub: HubSnapshot,
  catalogId: MechId,
): HubSnapshot | null {
  if (!isMechId(catalogId)) return null;
  if (hub.fleet.length >= HUB_LIMITS.maxMechs) return null;
  return normalizeHubSnapshot({
    ...hub,
    fleet: [...hub.fleet, createOwnedMech(catalogId)],
  });
}
