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

export { HUB_SAVE_STORAGE_KEY };

export type HubSnapshot = {
  credits: number;
  materials: number;
  fleet: MechId[];
  ammoLoad: AmmoLoad;
  importedMaterials: number;
  selectedMechId: MechId;
  selectedAmmoId: AmmoId;
};

export type HubSaveV1 = {
  v: 1;
  savedAt: string;
  hub: HubSnapshot;
};

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
  raw: Partial<HubSnapshot> | null | undefined,
  fallback: HubSnapshot = INITIAL_HUB,
): HubSnapshot {
  const fleetIn = Array.isArray(raw?.fleet) ? raw!.fleet : fallback.fleet;
  const fleet = fleetIn
    .map(String)
    .filter(isMechId)
    .slice(0, HUB_LIMITS.maxMechs);

  const ammoLoad: AmmoLoad = emptyAmmoLoad();
  const src = raw?.ammoLoad ?? fallback.ammoLoad;
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

  const selectedMechId =
    raw?.selectedMechId && isMechId(String(raw.selectedMechId))
      ? (String(raw.selectedMechId) as MechId)
      : fallback.selectedMechId;
  const selectedAmmoId =
    raw?.selectedAmmoId && isAmmoId(String(raw.selectedAmmoId))
      ? (String(raw.selectedAmmoId) as AmmoId)
      : fallback.selectedAmmoId;

  return {
    credits: finiteNonNeg(raw?.credits, fallback.credits),
    materials: finiteNonNeg(raw?.materials, fallback.materials),
    fleet,
    ammoLoad,
    importedMaterials: finiteNonNeg(
      raw?.importedMaterials,
      fallback.importedMaterials,
    ),
    selectedMechId,
    selectedAmmoId,
  };
}

export function createHubSave(hub: HubSnapshot, at = new Date()): HubSaveV1 {
  return {
    v: 1,
    savedAt: at.toISOString(),
    hub: normalizeHubSnapshot(hub),
  };
}

export function parseHubSave(raw: unknown): HubSaveV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== 1) return null;
  if (!obj.hub || typeof obj.hub !== "object") return null;
  return {
    v: 1,
    savedAt:
      typeof obj.savedAt === "string" ? obj.savedAt : new Date(0).toISOString(),
    hub: normalizeHubSnapshot(obj.hub as Partial<HubSnapshot>),
  };
}

export function serializeHubSave(save: HubSaveV1): string {
  return JSON.stringify(save);
}

export function deserializeHubSave(json: string): HubSaveV1 | null {
  try {
    return parseHubSave(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Browser helper — safe no-op outside window. */
export function loadHubSaveFromLocalStorage(
  storage?: Pick<Storage, "getItem"> | null,
): HubSaveV1 | null {
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
