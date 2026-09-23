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
  isCircuitLocked,
  isCircuitOutcome,
  isPerfectCircuitClearance,
  normalizeCircuitBoard,
  sanitizeEditorName,
  stampCircuitEditor,
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
  /** 刻印 — final editor name when saved / returned from restore→hub. */
  lastEditorName?: string;
  /**
   * Perfect Circuit lock (additive). Once true, refuse edge/outcome updates.
   * Also mirrored onto circuitBoard.locked when set.
   */
  locked?: boolean;
};

/** Sector coord on the invade front AOI (additive HubSave field). */
export type FrontCellCoord = {
  sx: number;
  sy: number;
};

/**
 * Invade front minesweeper progress (Module 4).
 * Additive on HubSave v2 — missing / invalid → null.
 * Mine layout is reproduced from `seed` via invade `rngFromSeed`.
 */
export type InvadeFrontProgress = {
  /** uint32 mine-layout seed. */
  seed: number;
  /** AOI half-extent used when saved (default 12). Mismatch → treat as absent. */
  aoiHalf?: number;
  /** Opened cells (HQ flood + player opens + stepped mines). */
  opened: FrontCellCoord[];
  /** Flagged cells. */
  flagged: FrontCellCoord[];
  /** Route focus; null = none / quick-battle skip. */
  focus: FrontCellCoord | null;
  /**
   * Pending forced-combat lock (mine stepped, sortie not yet resolved).
   * Cleared when forced combat reaches any terminal outcome (or back-wipe).
   * Not re-derived from opened mine cells on restore.
   */
  hitMine?: boolean;
  /** ISO timestamp of last write (optional). */
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
  /**
   * Module 4 invade front minesweeper progress. Additive on HubSave v2;
   * missing / invalid → null. Alias key `invadeBoard` accepted on read.
   */
  frontProgress: InvadeFrontProgress | null;
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
  frontProgress: null,
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
  /** Max opened/flagged cells stored in frontProgress (25×25 AOI). */
  maxFrontCells: 625,
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
    const editor =
      sanitizeEditorName(obj.lastEditorName) ??
      sanitizeEditorName(board.lastEditorName);
    let boardFinal: CircuitBoardState = boardWithOutcome;
    if (editor) boardFinal = { ...boardFinal, lastEditorName: editor };
    const locked =
      obj.locked === true ||
      board.locked === true ||
      isPerfectCircuitClearance({
        outcome: outcomeRaw,
        perfect: board.perfect === true || obj.perfect === true,
      });
    if (locked) {
      boardFinal = { ...boardFinal, locked: true, perfect: true };
    }
    const rec: HubCircuitRecord = {
      circuitId,
      circuitBoard: boardFinal,
      outcome: outcomeRaw,
    };
    if (typeof obj.updatedAt === "string" && obj.updatedAt.trim()) {
      rec.updatedAt = obj.updatedAt.trim().slice(0, 40);
    }
    if (editor) rec.lastEditorName = editor;
    if (locked) rec.locked = true;
    out.push(rec);
    if (out.length >= max) break;
  }
  return out;
}

const FRONT_COORD_MAX = 32;

function finiteInt(n: unknown, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.trunc(x);
}

function normalizeFrontCoord(raw: unknown): FrontCellCoord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (Array.isArray(raw) && raw.length >= 2) {
      const sx = finiteInt(raw[0], NaN);
      const sy = finiteInt(raw[1], NaN);
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
      if (Math.abs(sx) > FRONT_COORD_MAX || Math.abs(sy) > FRONT_COORD_MAX) return null;
      return { sx, sy };
    }
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const sx = finiteInt(obj.sx, NaN);
  const sy = finiteInt(obj.sy, NaN);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  if (Math.abs(sx) > FRONT_COORD_MAX || Math.abs(sy) > FRONT_COORD_MAX) return null;
  return { sx, sy };
}

function normalizeFrontCoordList(
  raw: unknown,
  max = HUB_LIMITS.maxFrontCells,
): FrontCellCoord[] {
  if (!Array.isArray(raw)) return [];
  const out: FrontCellCoord[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const c = normalizeFrontCoord(item);
    if (!c) continue;
    const key = `${c.sx},${c.sy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Normalize HubSnapshot.frontProgress (also accepts alias `invadeBoard`).
 * Missing / invalid → null. Does not bump save version (v2 additive).
 */
export function normalizeFrontProgress(
  raw: unknown,
  fallback: InvadeFrontProgress | null = null,
): InvadeFrontProgress | null {
  if (raw == null) return fallback;
  if (typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const obj = raw as Record<string, unknown>;
  const seedRaw = obj.seed;
  const seedNum =
    typeof seedRaw === "number"
      ? seedRaw
      : typeof seedRaw === "string"
        ? Number(seedRaw)
        : NaN;
  if (!Number.isFinite(seedNum)) return fallback;
  const seed = seedNum >>> 0;

  let aoiHalf: number | undefined;
  if (obj.aoiHalf != null) {
    const ah = finiteInt(obj.aoiHalf, NaN);
    if (!Number.isFinite(ah) || ah < 1 || ah > FRONT_COORD_MAX) return fallback;
    aoiHalf = ah;
  }

  const opened = normalizeFrontCoordList(obj.opened);
  const flagged = normalizeFrontCoordList(obj.flagged);

  let focus: FrontCellCoord | null = null;
  if (obj.focus != null) {
    focus = normalizeFrontCoord(obj.focus);
    // invalid focus → null focus (keep rest), not whole-null
  }

  const hitMine = obj.hitMine === true;

  const out: InvadeFrontProgress = {
    seed,
    opened,
    flagged,
    focus,
    hitMine,
  };
  if (aoiHalf != null) out.aoiHalf = aoiHalf;
  if (typeof obj.updatedAt === "string" && obj.updatedAt.trim()) {
    out.updatedAt = obj.updatedAt.trim().slice(0, 40);
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

  const rawRec = raw as Record<string, unknown> | null | undefined;
  const frontProgress = normalizeFrontProgress(
    rawRec?.frontProgress ?? rawRec?.invadeBoard,
    fallback.frontProgress ?? null,
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
    frontProgress,
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
    /** 刻印 — refreshes on non-locked upsert. */
    lastEditorName?: string;
    /** Optional clearance metrics from restore session. */
    digitRate?: number;
    loopClosed?: boolean;
    perfect?: boolean;
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
  const existing = (hub.circuits ?? []).find((c) => c.circuitId === circuitId);
  // Perfect Circuit: refuse edge / outcome overrides thereafter.
  if (existing && isCircuitLocked(existing)) {
    return hub;
  }

  const editor =
    sanitizeEditorName(input.lastEditorName) ??
    sanitizeEditorName(board.lastEditorName);

  const stamped = stampCircuitEditor(
    { ...board, outcome: input.outcome },
    editor,
    {
      outcome: input.outcome,
      digitRate: input.digitRate,
      loopClosed: input.loopClosed,
      perfect: input.perfect ?? board.perfect,
    },
  );

  const locked = isCircuitLocked({
    ...stamped,
    outcome: input.outcome,
    digitRate: input.digitRate,
    loopClosed: input.loopClosed,
  });

  const boardFinal: CircuitBoardState = locked
    ? { ...stamped, outcome: input.outcome, locked: true, perfect: true }
    : { ...stamped, outcome: input.outcome };

  const updatedAt =
    typeof input.updatedAt === "string" && input.updatedAt.trim()
      ? input.updatedAt.trim().slice(0, 40)
      : at.toISOString();
  const nextRec: HubCircuitRecord = {
    circuitId,
    circuitBoard: boardFinal,
    outcome: input.outcome,
    updatedAt,
  };
  if (editor) nextRec.lastEditorName = editor;
  if (locked) nextRec.locked = true;

  const rest = (hub.circuits ?? []).filter((c) => c.circuitId !== circuitId);
  const circuits = normalizeCircuits([nextRec, ...rest]);
  return normalizeHubSnapshot({ ...hub, circuits });
}


/** Set or replace invade front minesweeper progress (additive HubSave field). */
export function setFrontProgressInHub(
  hub: HubSnapshot,
  progress: InvadeFrontProgress | null,
  at = new Date(),
): HubSnapshot {
  if (progress == null) {
    return normalizeHubSnapshot({ ...hub, frontProgress: null });
  }
  const normalized = normalizeFrontProgress(progress);
  if (!normalized) {
    return normalizeHubSnapshot({ ...hub, frontProgress: null });
  }
  const withTs: InvadeFrontProgress = {
    ...normalized,
    updatedAt:
      typeof progress.updatedAt === "string" && progress.updatedAt.trim()
        ? progress.updatedAt.trim().slice(0, 40)
        : at.toISOString(),
  };
  return normalizeHubSnapshot({ ...hub, frontProgress: withTs });
}

/** Clear invade front progress (e.g. after regenerate board). */
export function clearFrontProgressInHub(hub: HubSnapshot): HubSnapshot {
  return normalizeHubSnapshot({ ...hub, frontProgress: null });
}

/**
 * Clear pending forced-combat lock (`frontProgress.hitMine`) only.
 * Keeps seed / opened / flagged / focus so Invade re-entry stays playable.
 */
export function clearFrontProgressHitMine(
  hub: HubSnapshot,
  at = new Date(),
): HubSnapshot {
  const fp = hub.frontProgress;
  if (fp == null || fp.hitMine !== true) return hub;
  return setFrontProgressInHub(hub, { ...fp, hitMine: false }, at);
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
