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
import {
  HUB_SAVE_CORRUPT_KEY_PREFIX,
  HUB_SAVE_LEGACY_STORAGE_KEY,
  HUB_SAVE_STORAGE_KEY,
} from "./constants";
import {
  canDeploy,
  createOwnedMech,
  normalizeBattery,
  normalizeFleet,
  MECH_STATUSES,
  type MechBatteryState,
  type MechStatus,
  type OwnedMech,
} from "./mech-fleet";
import {
  applyYieldBagToInventory,
  compactYieldBag,
  emptyYieldBag,
  type YieldBag,
} from "./sort-yield";
import {
  CIRCUIT_BOARD_DECODE_MAX_SIDE,
  RESTORE_MAX_SIDE,
  isCircuitLocked,
  isCircuitOrigin,
  isCircuitOutcome,
  isCircuitRestoreState,
  isPerfectCircuitClearance,
  normalizeCircuitBoard,
  outcomeFromRestoreState,
  sanitizeEditorName,
  stampCircuitEditor,
  type CircuitBoardState,
  type CircuitOrigin,
  type CircuitOutcome,
  type CircuitRestoreState,
} from "./circuit-board";

export { HUB_SAVE_STORAGE_KEY, HUB_SAVE_LEGACY_STORAGE_KEY, HUB_SAVE_CORRUPT_KEY_PREFIX };

/** Current HubSave payload version (docs/HUB_SAVE_CONTRACT.md §12). */
export const HUB_SAVE_VERSION = 3;

/**
 * One circuit owned by the hub (HubSave v3; docs/CIRCUIT_DATA_MODEL_V0.md §2.1).
 * Size = circuitBoard.cols (square). 評価値 is NOT stored — compute it from the
 * board (`circuitEffectValue`).
 */
export type HubCircuitRecord = {
  circuitId: string;
  circuitBoard: CircuitBoardState;
  /** Restore state (source of truth). `unrestored` = not yet through Restore. */
  restoreState: CircuitRestoreState;
  /** Where the circuit came from. `crafted` = white board; others = used. */
  origin: CircuitOrigin;
  /** OwnedMech.instanceId it is equipped to; null = stash (倉庫). */
  equippedTo: string | null;
  /** ISO timestamp when the hub first got this circuit (optional). */
  acquiredAt?: string;
  /** Reserved: row key of the future circuit→command/stat table (unset for now). */
  effectKey?: string;
  /**
   * @deprecated Legacy 3-value mirror of `restoreState` kept so existing callers
   * keep working (`unrestored` → "offline"). Derived on normalize; do not set
   * independently.
   */
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

export type FieldDropCause = "wreck_not_carried" | "left_behind" | "rescue_abort";

export const FIELD_DROP_CAUSES: readonly FieldDropCause[] = [
  "wreck_not_carried",
  "left_behind",
  "rescue_abort",
] as const;

/**
 * A circuit whose ownership was lost on the battlefield (HubSave v3 `fieldDrops`).
 * Recorded per invade front board (`frontSeed`) and cell — no in-Explore coords.
 * `circuit` is the owned record as it was (equippedTo forced null) so recovery
 * returns it unchanged (設計メモ §5 旧 §8.4-3). docs/CIRCUIT_DATA_MODEL_V0.md §5.
 */
export type FieldCircuitDrop = {
  dropId: string;
  frontSeed: number;
  cell: FrontCellCoord;
  circuit: HubCircuitRecord;
  cause: FieldDropCause;
  fromMechInstanceId?: string;
  droppedAt: string;
};

/** General inventory dropped in the field; intentionally separate from Circuit fieldDrops. */
export type FieldInventoryDrop = {
  dropId: string;
  frontSeed: number;
  cell: FrontCellCoord;
  inventory: YieldBag;
  cause: FieldDropCause;
  droppedAt: string;
};

/**
 * Persistent snapshot of a mech left behind during Explore return.
 *
 * Since the lostMechs-recovery shared PR (2026-10-03, CIRCUIT_DATA_MODEL_V0
 * §5.6) the circuits stay attached to the lost mech: their records keep
 * `equippedTo === instanceId` and `circuitIds` is reconciled to exactly those
 * records on every normalize (HubCircuitRecord stays the source of truth).
 * Every field after `circuitIds` is optional (older saves / returns lack
 * them; invalid values are dropped one by one, the row is kept).
 */
export type LostMechReturnState = {
  instanceId: string;
  currentAmmo: number | undefined;
  battery: MechBatteryState;
  /** Circuit ids only; HubCircuitRecord remains the circuit source of truth. */
  circuitIds: string[];
  /** Where it was left: Invade front seed (uint32) … */
  frontSeed?: number;
  /** … and sortie cell. */
  cell?: FrontCellCoord;
  /** ISO time it was (last) left behind. */
  lostAt?: string;
  /** sortieId of the sortie it was (last) left behind in. */
  lostSortieId?: string;
  /** Copy for putting it back into the fleet on recovery. */
  catalogId?: MechId;
  durability?: number;
  durabilityMax?: number;
  status?: MechStatus;
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
  /**
   * Unopened salvage containers stocked on HUB (Module 2 skip / purchase).
   * Additive on HubSave v2 — missing / invalid → 0.
   */
  unopenedContainers: number;
  selectedMechId: MechId;
  selectedAmmoId: AmmoId;
  /**
   * HubSave v3: largest side N restored Perfect (Fully Awakened + locked).
   * 0 = none yet. Never decreases. Junk craft cap = max(2, N + 1).
   */
  perfectMaxSize: number;
  /** HubSave v3: circuits lost on the battlefield (ownership lost). */
  fieldDrops: FieldCircuitDrop[];
  /** General inventory lost on the battlefield; separate from Circuit fieldDrops. */
  inventoryFieldDrops: FieldInventoryDrop[];
  /** HubSave v3: Explore mechs left behind; not wrecks / field drops. */
  lostMechs: LostMechReturnState[];
  /** HubSave v3: recently applied Explore sortie ids (apply-once guard). */
  appliedSortieIds?: string[];
  /**
   * HubSave v3 (additive, 2026-10-03 item 15): mechs chosen to sortie in the
   * hangar (instanceIds, at most `HUB_LIMITS.maxSortieMechs`). Trade's deploy
   * URL and Explore's 再出撃 both read it via `resolveSortieSelection`.
   */
  sortieSelection?: string[];
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

/** @deprecated Legacy payload (HubSnapshot before v3 fields) — migration typing only. */
export type HubSaveV2 = {
  v: 2;
  savedAt: string;
  hub: Record<string, unknown>;
};

export type HubSaveV3 = {
  v: 3;
  savedAt: string;
  hub: HubSnapshot;
};

/** Current on-disk / in-memory save shape. */
export type HubSave = HubSaveV3;

export const INITIAL_HUB: HubSnapshot = {
  credits: 500,
  materials: 250,
  fleet: [],
  ammoLoad: { ...INITIAL_AMMO_LOAD },
  inventory: emptyYieldBag(),
  circuits: [],
  frontProgress: null,
  importedMaterials: 0,
  unopenedContainers: 0,
  selectedMechId: "mech_gen1",
  selectedAmmoId: "ammo_standard",
  perfectMaxSize: 0,
  fieldDrops: [],
  inventoryFieldDrops: [],
  lostMechs: [],
  appliedSortieIds: [],
};

export const HUB_LIMITS = {
  /**
   * Mechs per sortie (leader + 2 wingmen). The fleet itself has no cap
   * (2026-10-03 item 15: the old `maxMechs: 3` and load-time truncation are gone).
   */
  maxSortieMechs: 3,
  maxAmmo: 100,
  materialUnitPrice: 10,
  /**
   * @deprecated HubSave v3 no longer truncates circuits (設計メモ §2 旧 §8.2-7).
   * Kept only because trade junk craft still references it (removed in impl B).
   */
  maxCircuits: 8,
  /** Base circuit slots per mech (設計メモ §2). Common slot expansion is undecided → always this. */
  mechBaseCircuitSlots: 1,
  /** How many recent applied sortie ids to keep (apply-once guard). */
  maxAppliedSortieIds: 20,
  /**
   * Largest board side accepted when decoding saves (normalizeCircuitBoard
   * limit, = CIRCUIT_BOARD_DECODE_MAX_SIDE). Kept at 64 so older saves with a
   * bigger board are not dropped; Restore/craft use `maxRestoreSide`.
   */
  maxCircuitSide: CIRCUIT_BOARD_DECODE_MAX_SIDE,
  /** Largest side Restore generates/plays and the junk-craft ceiling (U12): 20. */
  maxRestoreSide: RESTORE_MAX_SIDE,
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

const EFFECT_KEY_RE = /^[a-zA-Z0-9_.:-]{1,64}$/;
const MECH_INSTANCE_ID_MAX = 128;

function sanitizeMechInstanceId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > MECH_INSTANCE_ID_MAX) return null;
  return t;
}

function sanitizeIso(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().slice(0, 40);
  return t || undefined;
}

/**
 * Normalize one loose circuit record (v2 or v3 shape). Returns null when the
 * board or state is unusable (the caller drops just that one entry).
 * v2 records (no restoreState) map outcome → restoreState as-is (U2),
 * origin → "legacy", equippedTo → null.
 */
export function normalizeCircuitRecord(
  raw: unknown,
  fallbackId = "circuit",
): HubCircuitRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const board = normalizeCircuitBoard(obj.circuitBoard ?? obj.board);
  if (!board) return null;
  let restoreState: CircuitRestoreState;
  if (isCircuitRestoreState(obj.restoreState)) {
    restoreState = obj.restoreState;
  } else {
    const outcomeRaw = obj.outcome ?? board.outcome;
    if (!isCircuitOutcome(outcomeRaw)) return null;
    restoreState = outcomeRaw;
  }
  const outcome = outcomeFromRestoreState(restoreState);
  const circuitId = sanitizeCircuitId(obj.circuitId ?? board.puzzleId, fallbackId);

  let boardFinal: CircuitBoardState = { ...board };
  if (restoreState === "unrestored") delete boardFinal.outcome;
  else boardFinal.outcome = outcome;
  const editor =
    sanitizeEditorName(obj.lastEditorName) ??
    sanitizeEditorName(board.lastEditorName);
  if (editor) boardFinal = { ...boardFinal, lastEditorName: editor };
  const locked =
    obj.locked === true ||
    board.locked === true ||
    isPerfectCircuitClearance({
      outcome: restoreState === "unrestored" ? null : outcome,
      perfect: board.perfect === true || obj.perfect === true,
    });
  if (locked) {
    boardFinal = { ...boardFinal, locked: true, perfect: true };
  }
  const rec: HubCircuitRecord = {
    circuitId,
    circuitBoard: boardFinal,
    restoreState,
    origin: isCircuitOrigin(obj.origin) ? obj.origin : "legacy",
    equippedTo: sanitizeMechInstanceId(obj.equippedTo),
    outcome,
  };
  const acquiredAt = sanitizeIso(obj.acquiredAt);
  if (acquiredAt) rec.acquiredAt = acquiredAt;
  const updatedAt = sanitizeIso(obj.updatedAt);
  if (updatedAt) rec.updatedAt = updatedAt;
  if (editor) rec.lastEditorName = editor;
  if (locked) rec.locked = true;
  if (typeof obj.effectKey === "string" && EFFECT_KEY_RE.test(obj.effectKey)) {
    rec.effectKey = obj.effectKey;
  }
  return rec;
}

function circuitListFromRaw(raw: unknown, fallback: unknown[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([id, v]) => {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return { circuitId: id, ...(v as Record<string, unknown>) };
      }
      return null;
    });
  }
  return fallback;
}

/**
 * Normalize HubSnapshot.circuits (array or id→record map). Dedupes by circuitId;
 * first-seen wins (list is most recent first). HubSave v3: **no count cap** by
 * default (maxCircuits truncation abolished); `max` is kept for callers/tests.
 * Invalid entries are dropped one by one (the rest are kept).
 */
export function normalizeCircuits(
  raw: unknown,
  fallback: HubCircuitRecord[] = [],
  max = Number.POSITIVE_INFINITY,
): HubCircuitRecord[] {
  return normalizeCircuitsWithReport(raw, fallback, max).circuits;
}

/** Same as normalizeCircuits, plus how many entries were dropped as unreadable / duplicate. */
export function normalizeCircuitsWithReport(
  raw: unknown,
  fallback: HubCircuitRecord[] = [],
  max = Number.POSITIVE_INFINITY,
): { circuits: HubCircuitRecord[]; dropped: number } {
  const list = circuitListFromRaw(raw, fallback);
  const out: HubCircuitRecord[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const item of list) {
    if (out.length >= max) break;
    const rec = normalizeCircuitRecord(item, `circuit_${out.length}`);
    if (!rec || seen.has(rec.circuitId)) {
      dropped += 1;
      continue;
    }
    seen.add(rec.circuitId);
    out.push(rec);
  }
  return { circuits: out, dropped };
}

/** Board side used for size rules (square boards; non-square → min side, U13). */
export function circuitSize(
  rec: Pick<HubCircuitRecord, "circuitBoard">,
): number {
  return Math.max(0, Math.min(rec.circuitBoard.cols, rec.circuitBoard.rows));
}

/** Perfect (Fully Awakened + locked) → counts toward perfectMaxSize (U10). */
export function isPerfectRestoredCircuit(
  rec: Pick<HubCircuitRecord, "restoreState" | "locked" | "circuitBoard">,
): boolean {
  return (
    rec.restoreState === "fully_awakened" &&
    (rec.locked === true || rec.circuitBoard.locked === true)
  );
}

/** Largest Perfect side among records (migration seed for perfectMaxSize, U11). */
export function derivePerfectMaxSize(circuits: readonly HubCircuitRecord[]): number {
  let max = 0;
  for (const c of circuits) {
    if (isPerfectRestoredCircuit(c)) max = Math.max(max, circuitSize(c));
  }
  return Math.min(HUB_LIMITS.maxRestoreSide, max);
}

/** Circuit slots of one mech. Common slot expansion is undecided (U4) → base only. */
export function mechSlotCapacity(_mech?: Pick<OwnedMech, "instanceId"> | null): number {
  return HUB_LIMITS.mechBaseCircuitSlots;
}

/**
 * Equip integrity (§6.2): equippedTo pointing at a missing mech → stash;
 * more equipped than a mech's slots → keep the newest (updatedAt, then list
 * order), the rest go to stash. No squad-wide cap yet (U3).
 */
function enforceEquipIntegrity(
  circuits: HubCircuitRecord[],
  fleet: readonly OwnedMech[],
  /** Left-behind mechs: their circuits stay attached (not counted in any cap). */
  lostMechIds: ReadonlySet<string> = new Set(),
): HubCircuitRecord[] {
  const mechs = new Map(fleet.map((m) => [m.instanceId, m]));
  const byMech = new Map<string, number[]>();
  const out = circuits.map((c) => ({ ...c }));
  out.forEach((c, i) => {
    if (c.equippedTo == null) return;
    if (!mechs.has(c.equippedTo) && lostMechIds.has(c.equippedTo)) return;
    if (!mechs.has(c.equippedTo)) {
      c.equippedTo = null;
      return;
    }
    const arr = byMech.get(c.equippedTo) ?? [];
    arr.push(i);
    byMech.set(c.equippedTo, arr);
  });
  for (const [mechId, idxs] of byMech) {
    const cap = mechSlotCapacity(mechs.get(mechId));
    if (idxs.length <= cap) continue;
    const ranked = [...idxs].sort((a, b) => {
      const ta = out[a]!.updatedAt ?? "";
      const tb = out[b]!.updatedAt ?? "";
      if (ta !== tb) return ta < tb ? 1 : -1;
      return a - b;
    });
    for (const i of ranked.slice(cap)) out[i]!.equippedTo = null;
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

const DROP_ID_RE = /^[a-zA-Z0-9_.:-]{1,160}$/;
const SORTIE_ID_RE = /^[a-zA-Z0-9_.:-]{1,64}$/;

export function sanitizeSortieId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return SORTIE_ID_RE.test(t) ? t : null;
}

function isFieldDropCause(x: unknown): x is FieldDropCause {
  return typeof x === "string" && (FIELD_DROP_CAUSES as readonly string[]).includes(x);
}

/** Normalize persisted Explore left-behind mech snapshots. Invalid rows are dropped individually. */
export function normalizeLostMechs(
  raw: unknown,
  fallback: LostMechReturnState[] = [],
): LostMechReturnState[] {
  if (raw == null) return fallback.map((m) => ({ ...m, battery: { ...m.battery }, circuitIds: [...m.circuitIds] }));
  if (!Array.isArray(raw)) return fallback.map((m) => ({ ...m, battery: { ...m.battery }, circuitIds: [...m.circuitIds] }));
  const out: LostMechReturnState[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const instanceId = typeof obj.instanceId === "string" ? obj.instanceId.trim() : "";
    if (!instanceId || seen.has(instanceId)) continue;
    const currentAmmo =
      obj.currentAmmo == null
        ? undefined
        : Math.max(0, Math.floor(Number(obj.currentAmmo)));
    if (obj.currentAmmo != null && !Number.isFinite(Number(obj.currentAmmo))) continue;
    const batteryRaw = obj.battery;
    if (!batteryRaw || typeof batteryRaw !== "object" || Array.isArray(batteryRaw)) continue;
    const batteryObj = batteryRaw as Record<string, unknown>;
    const capacity = Number(batteryObj.capacity);
    const activity = Number(batteryObj.activity);
    if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(activity)) continue;
    const battery: MechBatteryState = {
      capacity: Math.floor(capacity),
      activity: Math.max(0, Math.min(Math.floor(capacity), Math.floor(activity))),
    };
    const circuitIds = Array.isArray(obj.circuitIds)
      ? [...new Set(obj.circuitIds.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))]
      : [];
    seen.add(instanceId);
    out.push({ instanceId, currentAmmo, battery, circuitIds, ...normalizeLostMechExtras(obj) });
  }
  return out;
}

/**
 * Optional location / time / copy fields of a lostMechs row. Each invalid
 * value is dropped on its own (the row itself is kept — older rows have none).
 */
export function normalizeLostMechExtras(
  obj: Record<string, unknown>,
): Partial<Omit<LostMechReturnState, "instanceId" | "currentAmmo" | "battery" | "circuitIds">> {
  const out: Partial<Omit<LostMechReturnState, "instanceId" | "currentAmmo" | "battery" | "circuitIds">> = {};
  const seed = typeof obj.frontSeed === "number" ? obj.frontSeed : obj.frontSeed == null ? NaN : Number(obj.frontSeed);
  if (Number.isFinite(seed)) out.frontSeed = Math.trunc(seed) >>> 0;
  const cell = normalizeFrontCoord(obj.cell);
  if (cell) out.cell = cell;
  const lostAt = sanitizeIso(obj.lostAt);
  if (lostAt) out.lostAt = lostAt;
  const lostSortieId = sanitizeSortieId(obj.lostSortieId);
  if (lostSortieId) out.lostSortieId = lostSortieId;
  if (typeof obj.catalogId === "string" && isMechId(obj.catalogId)) out.catalogId = obj.catalogId;
  const dMax = Number(obj.durabilityMax);
  if (obj.durabilityMax != null && Number.isFinite(dMax) && dMax >= 1) out.durabilityMax = Math.floor(dMax);
  const d = Number(obj.durability);
  if (obj.durability != null && Number.isFinite(d)) {
    out.durability = Math.max(0, Math.floor(d));
    if (out.durabilityMax != null) out.durability = Math.min(out.durability, out.durabilityMax);
  }
  if (typeof obj.status === "string" && (MECH_STATUSES as readonly string[]).includes(obj.status)) {
    out.status = obj.status as MechStatus;
  }
  return out;
}

/**
 * One place per mech and per circuit (lostMechs recovery PR):
 * - a row whose mech is in `fleet` is dropped (the fleet copy wins);
 * - `circuitIds` = the circuits whose record has `equippedTo === instanceId`
 *   (row order first, then any other such record). Older saves where the
 *   left-behind mech's circuit had been moved to the stash (`equippedTo:
 *   null`, the old duplication) keep the circuit where its record is — in the
 *   stash — and the id is dropped from the row. No circuit is lost or added.
 */
function reconcileLostMechs(
  lostMechs: LostMechReturnState[],
  fleet: readonly OwnedMech[],
  circuits: readonly HubCircuitRecord[],
): LostMechReturnState[] {
  const fleetIds = new Set(fleet.map((m) => m.instanceId));
  return lostMechs
    .filter((m) => !fleetIds.has(m.instanceId))
    .map((m) => {
      const attached = circuits.filter((c) => c.equippedTo === m.instanceId).map((c) => c.circuitId);
      const set = new Set(attached);
      const circuitIds = [
        ...m.circuitIds.filter((id) => set.has(id)),
        ...attached.filter((id) => !m.circuitIds.includes(id)),
      ];
      return { ...m, circuitIds };
    });
}

/** Normalize one field drop; null when unusable (dropped individually). */
export function normalizeFieldDrop(raw: unknown): FieldCircuitDrop | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.dropId !== "string" || !DROP_ID_RE.test(obj.dropId.trim())) return null;
  const seedNum = typeof obj.frontSeed === "number" ? obj.frontSeed : Number(obj.frontSeed);
  if (!Number.isFinite(seedNum)) return null;
  const cell = normalizeFrontCoord(obj.cell);
  if (!cell) return null;
  const circuit = normalizeCircuitRecord(obj.circuit);
  if (!circuit) return null;
  const drop: FieldCircuitDrop = {
    dropId: obj.dropId.trim(),
    frontSeed: seedNum >>> 0,
    cell,
    circuit: { ...circuit, equippedTo: null },
    cause: isFieldDropCause(obj.cause) ? obj.cause : "wreck_not_carried",
    droppedAt: sanitizeIso(obj.droppedAt) ?? new Date(0).toISOString(),
  };
  const from = sanitizeMechInstanceId(obj.fromMechInstanceId);
  if (from) drop.fromMechInstanceId = from;
  return drop;
}

function normalizeFieldInventoryDrop(raw: unknown): FieldInventoryDrop | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.dropId !== "string" || !DROP_ID_RE.test(obj.dropId.trim())) return null;
  const seedNum = typeof obj.frontSeed === "number" ? obj.frontSeed : Number(obj.frontSeed);
  if (!Number.isFinite(seedNum)) return null;
  const cell = normalizeFrontCoord(obj.cell);
  if (!cell) return null;
  const inventory = normalizeInventory(obj.inventory);
  const cause = isFieldDropCause(obj.cause) ? obj.cause : "wreck_not_carried";
  return {
    dropId: obj.dropId.trim(),
    frontSeed: seedNum >>> 0,
    cell,
    inventory,
    cause,
    droppedAt: sanitizeIso(obj.droppedAt) ?? new Date(0).toISOString(),
  };
}

export function normalizeInventoryFieldDrops(raw: unknown): FieldInventoryDrop[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldInventoryDrop[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const d = normalizeFieldInventoryDrop(item);
    if (!d || seen.has(d.dropId)) continue;
    seen.add(d.dropId);
    out.push(d);
  }
  return out;
}

export function normalizeFieldDrops(raw: unknown): FieldCircuitDrop[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldCircuitDrop[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const d = normalizeFieldDrop(item);
    if (!d || seen.has(d.dropId)) continue;
    seen.add(d.dropId);
    out.push(d);
  }
  return out;
}

function normalizeAppliedSortieIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const id = sanitizeSortieId(item);
    if (id && !out.includes(id)) out.push(id);
  }
  return out.slice(-HUB_LIMITS.maxAppliedSortieIds);
}

function normalizePerfectMaxSize(raw: unknown, circuits: readonly HubCircuitRecord[]): number {
  if (raw == null) return derivePerfectMaxSize(circuits);
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return derivePerfectMaxSize(circuits);
  return Math.max(0, Math.min(HUB_LIMITS.maxRestoreSide, Math.floor(n)));
}

export function normalizeHubSnapshot(
  raw: Partial<HubSnapshot> | Record<string, unknown> | null | undefined,
  fallback: HubSnapshot = INITIAL_HUB,
): HubSnapshot {
  const fleetIn = Array.isArray((raw as HubSnapshot | undefined)?.fleet)
    ? (raw as HubSnapshot).fleet
    : fallback.fleet;
  const fleet = normalizeFleet(fleetIn);

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

  const rawRec = raw as Record<string, unknown> | null | undefined;
  const fleetIdSet = new Set(fleet.map((m) => m.instanceId));
  const lostMechsRaw = normalizeLostMechs(rawRec?.lostMechs ?? fallback.lostMechs ?? []).filter(
    (m) => !fleetIdSet.has(m.instanceId),
  );
  const circuits = enforceEquipIntegrity(
    normalizeCircuits(
      (raw as HubSnapshot | undefined)?.circuits,
      fallback.circuits ?? [],
    ),
    fleet,
    new Set(lostMechsRaw.map((m) => m.instanceId)),
  );

  // Missing (v1/v2) → derived from Perfect circuits (U11); stored v3 value kept as-is.
  const perfectMaxSize = normalizePerfectMaxSize(
    rawRec && "perfectMaxSize" in rawRec
      ? rawRec.perfectMaxSize
      : rawRec == null
        ? fallback.perfectMaxSize
        : undefined,
    circuits,
  );
  const fieldDrops = normalizeFieldDrops(rawRec?.fieldDrops ?? fallback.fieldDrops ?? []);
  const inventoryFieldDrops = normalizeInventoryFieldDrops(
    rawRec?.inventoryFieldDrops ?? fallback.inventoryFieldDrops ?? [],
  );
  const lostMechs = reconcileLostMechs(lostMechsRaw, fleet, circuits);
  const appliedSortieIds = normalizeAppliedSortieIds(
    rawRec?.appliedSortieIds ?? fallback.appliedSortieIds ?? [],
  );
  const sortieSelection = normalizeSortieSelection(
    rawRec?.sortieSelection ?? fallback.sortieSelection ?? [],
    fleet,
  );
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
    unopenedContainers: Math.floor(
      finiteNonNeg(
        (raw as HubSnapshot | undefined)?.unopenedContainers,
        fallback.unopenedContainers ?? 0,
      ),
    ),
    selectedMechId,
    selectedAmmoId,
    perfectMaxSize,
    fieldDrops,
    inventoryFieldDrops,
    lostMechs,
    appliedSortieIds,
    sortieSelection,
  };
}

/** Unique instanceIds that exist in the fleet, at most maxSortieMechs. */
function normalizeSortieSelection(raw: unknown, fleet: readonly OwnedMech[]): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set(fleet.map((m) => m.instanceId));
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || !ids.has(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= HUB_LIMITS.maxSortieMechs) break;
  }
  return out;
}

/**
 * The squad for the next sortie: the saved selection's mechs that can still
 * sortie (left-behind mechs are no longer in `fleet`; wrecked / needs_repair
 * cannot deploy), in fleet order. When nothing of the selection remains (or
 * there is no selection yet), the first `maxSortieMechs` deployable mechs.
 */
export function resolveSortieSelection(hub: Pick<HubSnapshot, "fleet" | "sortieSelection">): string[] {
  const chosen = new Set(hub.sortieSelection ?? []);
  const deployable = hub.fleet.filter(canDeploy);
  const kept = deployable.filter((m) => chosen.has(m.instanceId)).map((m) => m.instanceId);
  if (kept.length > 0) return kept.slice(0, HUB_LIMITS.maxSortieMechs);
  return deployable.slice(0, HUB_LIMITS.maxSortieMechs).map((m) => m.instanceId);
}

/** Save the hangar's sortie selection (deployable mechs only, at most maxSortieMechs, fleet order). */
export function setSortieSelection(hub: HubSnapshot, ids: readonly string[]): HubSnapshot {
  const want = new Set(ids);
  const sortieSelection = hub.fleet
    .filter((m) => canDeploy(m) && want.has(m.instanceId))
    .map((m) => m.instanceId)
    .slice(0, HUB_LIMITS.maxSortieMechs);
  return { ...hub, sortieSelection };
}

export function createHubSave(hub: HubSnapshot, at = new Date()): HubSaveV3 {
  return {
    v: 3,
    savedAt: at.toISOString(),
    hub: normalizeHubSnapshot(hub),
  };
}

/**
 * Convert a parsed v1 / v2 / v3 (or loose) hub blob into a v3 save.
 * Idempotent: migrating the same input twice yields the same result (no id reassignment).
 */
export function migrateHubSaveToV3(raw: {
  v?: number;
  savedAt?: string;
  hub?: unknown;
}): HubSaveV3 {
  const savedAt =
    typeof raw.savedAt === "string" ? raw.savedAt : new Date(0).toISOString();
  const hub = normalizeHubSnapshot(
    (raw.hub ?? {}) as Partial<HubSnapshot>,
  );
  return { v: 3, savedAt, hub };
}

/** @deprecated Use migrateHubSaveToV3 (now always returns a v3 save). */
export const migrateHubSaveV1ToV2 = migrateHubSaveToV3;

/** Payload version of a raw blob, or null when it is not a HubSave-shaped object. */
function rawSaveVersion(raw: unknown): number | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.v !== "number" || !Number.isInteger(obj.v)) return null;
  if (!obj.hub || typeof obj.hub !== "object") return null;
  return obj.v;
}

/** Accepts v1 / v2 / v3 → normalized v3. Newer (v ≥ 4) or malformed → null. */
export function parseHubSave(raw: unknown): HubSaveV3 | null {
  const v = rawSaveVersion(raw);
  if (v !== 1 && v !== 2 && v !== 3) return null;
  return migrateHubSaveToV3(
    raw as { v: number; savedAt?: string; hub: unknown },
  );
}

export function serializeHubSave(save: HubSaveV3): string {
  return JSON.stringify(save);
}

export function deserializeHubSave(json: string): HubSaveV3 | null {
  try {
    return parseHubSave(JSON.parse(json));
  } catch {
    return null;
  }
}

export type HubSaveLoadStatus =
  /** Nothing stored under either key. */
  | "empty"
  /** Read from the v3 key. */
  | "ok"
  /** v3 key absent; read + migrated from the legacy key (legacy left untouched). */
  | "migrated"
  /** Stored text was unreadable; copied to `backupKey`, caller continues from INITIAL_HUB. */
  | "corrupt_backed_up"
  /** Stored save is a newer version; opened best-effort, saves are refused. */
  | "newer_read_only";

export type HubSaveLoadResult = {
  status: HubSaveLoadStatus;
  save: HubSaveV3 | null;
  /** Storage key the save was read from (when any). */
  sourceKey?: string;
  /** Where unreadable text was copied (corrupt_backed_up). */
  backupKey?: string;
  /** Stored payload version (newer_read_only / migrated). */
  storedVersion?: number;
  /** Circuit entries dropped individually as unreadable / duplicate. */
  droppedCircuits: number;
};

type LoadStorage = Pick<Storage, "getItem"> & Partial<Pick<Storage, "setItem">>;
type SaveStorage = Pick<Storage, "setItem"> & Partial<Pick<Storage, "getItem">>;

function defaultStorage(): Storage | null {
  return typeof globalThis !== "undefined" && "localStorage" in globalThis
    ? globalThis.localStorage
    : null;
}

const CORRUPT_LAST_KEY = `${HUB_SAVE_CORRUPT_KEY_PREFIX}lastKey`;

/** Copy unreadable save text aside (deduped against the last backup). */
function backupCorruptSave(store: LoadStorage, text: string, at: Date): string | undefined {
  if (!store.setItem) return undefined;
  try {
    const lastKey = store.getItem(CORRUPT_LAST_KEY);
    if (lastKey && store.getItem(lastKey) === text) return lastKey;
    const key = `${HUB_SAVE_CORRUPT_KEY_PREFIX}${at.toISOString()}`;
    store.setItem(key, text);
    store.setItem(CORRUPT_LAST_KEY, key);
    return key;
  } catch {
    return undefined;
  }
}

function countDroppedCircuits(rawHub: unknown): number {
  if (!rawHub || typeof rawHub !== "object") return 0;
  return normalizeCircuitsWithReport((rawHub as Record<string, unknown>).circuits, []).dropped;
}

function loadFromKey(
  store: LoadStorage,
  key: string,
  at: Date,
): HubSaveLoadResult | null {
  const text = store.getItem(key);
  if (text == null || text === "") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      status: "corrupt_backed_up",
      save: null,
      sourceKey: key,
      backupKey: backupCorruptSave(store, text, at),
      droppedCircuits: 0,
    };
  }
  const v = rawSaveVersion(raw);
  if (v != null && v > HUB_SAVE_VERSION) {
    // Newer build's save: open best-effort (additive fields ignored), never write.
    return {
      status: "newer_read_only",
      save: migrateHubSaveToV3(raw as { savedAt?: string; hub: unknown }),
      sourceKey: key,
      storedVersion: v,
      droppedCircuits: countDroppedCircuits((raw as { hub: unknown }).hub),
    };
  }
  const save = parseHubSave(raw);
  if (!save) {
    return {
      status: "corrupt_backed_up",
      save: null,
      sourceKey: key,
      backupKey: backupCorruptSave(store, text, at),
      droppedCircuits: 0,
    };
  }
  return {
    status: key === HUB_SAVE_STORAGE_KEY ? "ok" : "migrated",
    save,
    sourceKey: key,
    storedVersion: v ?? undefined,
    droppedCircuits: countDroppedCircuits((raw as { hub: unknown }).hub),
  };
}

/**
 * Load order (docs/HUB_SAVE_CONTRACT.md §12): ① v3 key → ② else legacy key
 * (v1/v2, migrated) → ③ write the migrated save to the v3 key (when the storage
 * can write). The legacy key is never modified or removed. Unreadable text is
 * backed up before any caller can overwrite it. A legacy save from a newer
 * build or a corrupt legacy save is never copied to the v3 key.
 */
export function loadHubSaveWithStatus(
  storage?: LoadStorage | null,
  at = new Date(),
): HubSaveLoadResult {
  const store = storage ?? defaultStorage();
  if (!store) return { status: "empty", save: null, droppedCircuits: 0 };
  try {
    const current = loadFromKey(store, HUB_SAVE_STORAGE_KEY, at);
    if (current) return current;
    const legacy = loadFromKey(store, HUB_SAVE_LEGACY_STORAGE_KEY, at);
    if (legacy) {
      // ③ Migrated → write the v3 key once (legacy key untouched, kept as backup).
      // From here on, an old-build tab writing the legacy key cannot affect v3.
      if (legacy.status === "migrated" && legacy.save && store.setItem) {
        try {
          store.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(legacy.save));
        } catch {
          // Quota / access failure: keep the in-memory migrated save.
        }
      }
      return legacy;
    }
  } catch {
    // Storage access failure → behave as empty (never throw into callers).
  }
  return { status: "empty", save: null, droppedCircuits: 0 };
}

/** True when the stored v3-key save is from a newer build (saves must not overwrite it). */
export function isStoredHubSaveNewer(storage?: Pick<Storage, "getItem"> | null): boolean {
  const store = storage ?? defaultStorage();
  if (!store) return false;
  try {
    const text = store.getItem(HUB_SAVE_STORAGE_KEY);
    if (!text) return false;
    const v = rawSaveVersion(JSON.parse(text));
    return v != null && v > HUB_SAVE_VERSION;
  } catch {
    return false;
  }
}

/**
 * Browser helper — safe no-op outside window. Goes through the v3 load order
 * (v3 key → legacy key migration). See loadHubSaveWithStatus for details.
 */
export function loadHubSaveFromLocalStorage(
  storage?: LoadStorage | null,
): HubSaveV3 | null {
  return loadHubSaveWithStatus(storage).save;
}

/**
 * Writes a v3 save to the v3 key. Refuses (returns false) when the stored
 * v3-key save is from a newer build (read-only). Never touches the legacy key.
 */
export function saveHubSaveToLocalStorage(
  hub: HubSnapshot,
  storage?: SaveStorage | null,
): boolean {
  const store = storage ?? defaultStorage();
  if (!store) return false;
  try {
    if (store.getItem && isStoredHubSaveNewer(store as Pick<Storage, "getItem">)) {
      return false;
    }
    store.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(createHubSave(hub)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Explicit reset: removes both the v3 key and the legacy key (otherwise the
 * next load would re-migrate from the legacy key). Corrupt backups are kept.
 */
export function clearHubSaveFromLocalStorage(
  storage?: Pick<Storage, "removeItem"> | null,
): void {
  const store = storage ?? defaultStorage();
  store?.removeItem(HUB_SAVE_STORAGE_KEY);
  store?.removeItem(HUB_SAVE_LEGACY_STORAGE_KEY);
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

/** Clamp unopened container stock to a non-negative integer. */
export function clampUnopenedContainers(n: unknown): number {
  return Math.floor(finiteNonNeg(n, 0));
}

/** Add unopened containers into hub stock (no-op when n ≤ 0). */
export function addUnopenedContainers(
  hub: HubSnapshot,
  n: number,
): HubSnapshot {
  const add = clampUnopenedContainers(n);
  if (add <= 0) return hub;
  return normalizeHubSnapshot({
    ...hub,
    unopenedContainers: clampUnopenedContainers(hub.unopenedContainers) + add,
  });
}

/**
 * Spend unopened containers from hub stock.
 * Returns null when stock is insufficient (no partial spend).
 */
export function spendUnopenedContainers(
  hub: HubSnapshot,
  n: number,
): HubSnapshot | null {
  const need = clampUnopenedContainers(n);
  if (need <= 0) return hub;
  const have = clampUnopenedContainers(hub.unopenedContainers);
  if (have < need) return null;
  return normalizeHubSnapshot({
    ...hub,
    unopenedContainers: have - need,
  });
}


/** Upsert a restore circuit into hub.circuits (most recent first; no cap in v3). */
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
    /** Origin for a NEW record (default "legacy"). Existing records keep theirs. */
    origin?: CircuitOrigin;
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
  // v3: a Restore result keeps the circuit's equip / origin / acquiredAt / effectKey.
  const nextRec: HubCircuitRecord = {
    circuitId,
    circuitBoard: boardFinal,
    restoreState: input.outcome,
    origin: existing?.origin ?? (isCircuitOrigin(input.origin) ? input.origin : "legacy"),
    equippedTo: existing?.equippedTo ?? null,
    outcome: input.outcome,
    updatedAt,
    acquiredAt: existing?.acquiredAt ?? updatedAt,
  };
  if (existing?.effectKey) nextRec.effectKey = existing.effectKey;
  if (editor) nextRec.lastEditorName = editor;
  if (locked) nextRec.locked = true;

  const rest = (hub.circuits ?? []).filter((c) => c.circuitId !== circuitId);
  const circuits = normalizeCircuits([nextRec, ...rest]);
  // perfectMaxSize is NOT raised here: the restore-import update is impl B
  // (docs/CIRCUIT_DATA_MODEL_V0.md §7.1 / §8). Use recordPerfectSize().
  return normalizeHubSnapshot({ ...hub, circuits });
}


/** Remove a restore circuit from hub.circuits by circuitId (no-op if missing). */
export function removeCircuitFromHub(
  hub: HubSnapshot,
  circuitId: string | null | undefined,
): HubSnapshot {
  if (!circuitId) return hub;
  const id = circuitId.trim();
  if (!id) return hub;
  const prev = hub.circuits ?? [];
  const circuits = prev.filter((c) => c.circuitId !== id);
  if (circuits.length === prev.length) return hub;
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

/** Purchase / add a fresh owned mech (no fleet cap since 2026-10-03, item 15). */
export function addMechToHub(
  hub: HubSnapshot,
  catalogId: MechId,
): HubSnapshot | null {
  if (!isMechId(catalogId)) return null;
  return normalizeHubSnapshot({
    ...hub,
    fleet: [...hub.fleet, createOwnedMech(catalogId)],
  });
}
