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

export { HUB_SAVE_STORAGE_KEY };

/**
 * Current hub snapshot. `fleet` holds owned instances (not bare MechId).
 * Legacy saves with `MechId[]` are migrated in normalize / parse.
 */
export type HubSnapshot = {
  credits: number;
  materials: number;
  fleet: OwnedMech[];
  ammoLoad: AmmoLoad;
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
  importedMaterials: 0,
  selectedMechId: "mech_gen1",
  selectedAmmoId: "ammo_standard",
};

export const HUB_LIMITS = {
  maxMechs: 3,
  maxAmmo: 100,
  materialUnitPrice: 10,
} as const;

function finiteNonNeg(n: unknown, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, x);
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
