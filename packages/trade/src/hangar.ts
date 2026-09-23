/**
 * Hangar state helpers for Module 3 stub UI.
 * Pure transitions + localStorage persistence via shared hub-save.
 */

import {
  CRAFT_SIGNATURE_STORAGE_KEY,
  HANDOFF_QUERY_KEYS,
  INITIAL_HUB,
  MECH_FLEET_RULES,
  MECH_STATUS_LABEL_JA,
  EXAMPLE_TYPED_REPAIR_COST,
  addMechToHub,
  ammoTotal,
  applyRepair,
  applyScrap,
  applyWearReportsToFleet,
  buildTradeToExplorePayloadFromFleet,
  buildTradeToExploreUrl,
  buildTradeToInvadeUrl,
  buildTradeToRestoreUrl,
  createEmptyCircuitBoard,
  buildVerifyPerfectLockedBoard,
  buildVerifyTrueUnsolvedBoard,
  VERIFY_PERFECT_CIRCUIT_ID,
  VERIFY_TRUE_CIRCUIT_ID,
  VERIFY_TRUE_PUZZLE_ID,
  VERIFY_TRUE_SOLUTION_HINT,
  PERFECT_CIRCUIT_DEV_RATE,
  PERFECT_CIRCUIT_PROD_RATE,
  PERFECT_CIRCUIT_PROD_RATE_ALT,
  resolveModuleBaseUrl,
  resolvePerfectCircuitInjectRate,
  rollPerfectCircuit,
  canAffordRepair,
  canAffordYieldCost,
  canDeploy,
  clearHubSaveFromLocalStorage,
  createOwnedMech,
  filterToDeployableIds,
  importMaterialsIntoHub,
  importYieldBagIntoHub,
  isCircuitLocked,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  parseExploreToHubWearSearch,
  parseInvadeToTradeSearch,
  parseRestoreToTradeSearch,
  parseSortToTradeSearch,
  repairCost,
  sanitizeEditorName,
  saveHubSaveToLocalStorage,
  selectDeployableInstanceIds,
  syncMechStatus,
  spendYieldBag,
  stripHandoffParams,
  upsertCircuitIntoHub,
  removeCircuitFromHub,
  yieldBagFromTypedRepairCost,
  aggregateCircuitBonuses,
  applyRepairDiscountToCost,
  applyDurabilityBufferToWear,
  buildWearReportsForSortie,
  formatCircuitBonusesJa,
  computeCircuitEffectForBoard,
  formatCircuitEffectJa,
  type AggregatedCircuitBonuses,
  type CircuitBoardState,
  type CircuitEffectBreakdown,
  type CircuitOutcome,
  type HubCircuitRecord,
  type HubSnapshot,
  type InvadeToTradePayload,
  type MechId,
  type RestoreToTradePayload,
  type SortieReturnKind,
  type YieldBag,
} from "@estg/shared";

import {
  RARE_SELL_PRICE_CREDITS,
  isRareYieldItemId,
} from "./rare-sell-prices";
import {
  CIRCUIT_SELL_BASE_CREDITS,
  CIRCUIT_SELL_CREDITS_PER_EFFECT,
  circuitSellPriceCredits,
  formatCircuitSellPriceJa,
} from "./circuit-sell-prices";

export {
  RARE_SELL_PRICE_TABLE,
  RARE_SELL_PRICE_CREDITS,
  RARE_YIELD_ITEM_IDS,
  isRareYieldItemId,
  rareSellPriceCredits,
  rareSellPriceRow,
  type RareSellPriceRow,
  type RareYieldItemId,
  type RareSellBalanceMark,
} from "./rare-sell-prices";

export {
  CIRCUIT_SELL_BASE_CREDITS,
  CIRCUIT_SELL_CREDITS_PER_EFFECT,
  circuitSellPriceCredits,
  formatCircuitSellPriceJa,
} from "./circuit-sell-prices";

export type HangarLog = string[];

/** Side stash: invade sector (+ legacy circuit mirror). Circuits now live in HubSave.circuits. */
export type HubM45Stash = {
  lastInvadeSector: InvadeToTradePayload | null;
  lastCircuit: RestoreToTradePayload | null;
  /** ISO timestamp of last stash write (localStorage note). */
  updatedAt: string | null;
};

export const HUB_M45_STASH_STORAGE_KEY = "wreckline.hubM45Stash.v0";

/** Default craft signature when hangar 「署名」 is unset. */
export const DEFAULT_CRAFT_SIGNATURE = "無名の職人";

export function loadCraftSignature(
  storage?: Pick<Storage, "getItem"> | null,
): string {
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null);
  if (!store) return DEFAULT_CRAFT_SIGNATURE;
  const raw = store.getItem(CRAFT_SIGNATURE_STORAGE_KEY);
  return sanitizeEditorName(raw) ?? DEFAULT_CRAFT_SIGNATURE;
}

/**
 * Persist hangar 「署名」 once. Returns false if already set (editable once).
 */
export function saveCraftSignatureOnce(
  name: string,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): { ok: boolean; signature: string; alreadySet: boolean } {
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? (globalThis.localStorage as Storage)
      : null);
  const cleaned = sanitizeEditorName(name);
  if (!cleaned) {
    return {
      ok: false,
      signature: loadCraftSignature(store),
      alreadySet: false,
    };
  }
  if (!store) {
    return { ok: true, signature: cleaned, alreadySet: false };
  }
  const existing = sanitizeEditorName(store.getItem(CRAFT_SIGNATURE_STORAGE_KEY));
  if (existing) {
    return { ok: false, signature: existing, alreadySet: true };
  }
  try {
    store.setItem(CRAFT_SIGNATURE_STORAGE_KEY, cleaned);
    return { ok: true, signature: cleaned, alreadySet: false };
  } catch {
    return { ok: false, signature: cleaned, alreadySet: false };
  }
}

export function isCraftSignatureLocked(
  storage?: Pick<Storage, "getItem"> | null,
): boolean {
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null);
  if (!store) return false;
  return sanitizeEditorName(store.getItem(CRAFT_SIGNATURE_STORAGE_KEY)) != null;
}

/** Demo board used when opening restore with no prior circuit stash. */
export const SEED_CIRCUIT_ID = "board_demo";
export const SEED_CIRCUIT_PUZZLE_ID = "stub-8";

export type ExploreReturnDigest = {
  returnKind: SortieReturnKind;
  /** One-line JA for 「次の出撃」 panel. */
  summaryJa: string;
};

export type HangarState = {
  hub: HubSnapshot;
  /** Last deploy set (for simulated return). */
  lastDeployedIds: string[];
  selectedDeployIds: string[];
  log: HangarLog;
  notice: string;
  /** Last invade→trade sector (UI + localStorage stash; not in HubSave). */
  lastInvadeSector: InvadeToTradePayload | null;
  /** Active / most recent circuit (mirrors hub.circuits[0]; HubSave is source of truth). */
  lastCircuit: RestoreToTradePayload | null;
  /** Last explore→hub wear ingest (UI digest only; not HubSave). */
  lastExploreReturn: ExploreReturnDigest | null;
  /** Hangar craft signature (署名) for circuit 刻印. */
  craftSignature: string;
};

const MAX_LOG = 12;

function pushLog(log: HangarLog, line: string): HangarLog {
  return [line, ...log].slice(0, MAX_LOG);
}

function emptyM45Stash(): HubM45Stash {
  return { lastInvadeSector: null, lastCircuit: null, updatedAt: null };
}

export function loadM45StashFromLocalStorage(
  storage?: Pick<Storage, "getItem"> | null,
): HubM45Stash {
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null);
  if (!store) return emptyM45Stash();
  const raw = store.getItem(HUB_M45_STASH_STORAGE_KEY);
  if (!raw) return emptyM45Stash();
  try {
    const obj = JSON.parse(raw) as Partial<HubM45Stash> | null;
    if (!obj || typeof obj !== "object") return emptyM45Stash();
    return {
      lastInvadeSector:
        obj.lastInvadeSector && typeof obj.lastInvadeSector === "object"
          ? (obj.lastInvadeSector as InvadeToTradePayload)
          : null,
      lastCircuit:
        obj.lastCircuit && typeof obj.lastCircuit === "object"
          ? (obj.lastCircuit as RestoreToTradePayload)
          : null,
      updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : null,
    };
  } catch {
    return emptyM45Stash();
  }
}

export function saveM45StashToLocalStorage(
  stash: Pick<HangarState, "lastInvadeSector" | "lastCircuit">,
  storage?: Pick<Storage, "setItem"> | null,
): boolean {
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null);
  if (!store) return false;
  const payload: HubM45Stash = {
    lastInvadeSector: stash.lastInvadeSector,
    lastCircuit: stash.lastCircuit,
    updatedAt: new Date().toISOString(),
  };
  try {
    store.setItem(HUB_M45_STASH_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearM45StashFromLocalStorage(
  storage?: Pick<Storage, "removeItem"> | null,
): void {
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null);
  store?.removeItem(HUB_M45_STASH_STORAGE_KEY);
}

export type SeedCircuitBoardOptions = {
  /** When set, roll Perfect Circuit injection at this rate. */
  injectRate?: number;
  /** Uniform[0,1) RNG (default Math.random). */
  rng?: () => number;
};

/**
 * Fresh demo CircuitBoardState for trade→restore when no stash/seed board.
 * With `injectRate`, may grant the seeded verify-true board instead of stub-8.
 */
export function buildSeedCircuitBoard(
  opts?: SeedCircuitBoardOptions,
): CircuitBoardState {
  if (opts?.injectRate != null) {
    const rng = opts.rng ?? (() => Math.random());
    if (rollPerfectCircuit(rng, { rate: opts.injectRate })) {
      return buildVerifyTrueUnsolvedBoard();
    }
  }
  return createEmptyCircuitBoard(8, 8, SEED_CIRCUIT_PUZZLE_ID);
}


/** Map a HubCircuitRecord to restore→trade payload shape. */
export function circuitRecordToPayload(
  rec: HubCircuitRecord,
): RestoreToTradePayload {
  return {
    circuitId: rec.circuitId,
    circuitBoard: rec.circuitBoard,
    outcome: rec.outcome,
  };
}

/** Prefer hub.circuits[0]; fall back to stash payload. */
export function resolveActiveCircuit(
  hub: HubSnapshot,
  stashCircuit: RestoreToTradePayload | null,
): RestoreToTradePayload | null {
  const head = hub.circuits?.[0];
  if (head) return circuitRecordToPayload(head);
  return stashCircuit;
}

export function findHubCircuit(
  hub: HubSnapshot,
  circuitId: string | null | undefined,
): HubCircuitRecord | null {
  if (!circuitId) return null;
  const id = circuitId.trim();
  if (!id) return null;
  return hub.circuits.find((c) => c.circuitId === id) ?? null;
}

export function createInitialHangar(
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
): HangarState {
  const loaded = loadHubSaveFromLocalStorage(storage ?? undefined);
  const stash = loadM45StashFromLocalStorage(storage ?? undefined);
  let hub = loaded?.hub
    ? normalizeHubSnapshot(loaded.hub)
    : normalizeHubSnapshot(INITIAL_HUB);
  const log: HangarLog = loaded
    ? [`セーブ読込 (${loaded.savedAt})`]
    : ["初期ハブ（セーブなし）"];

  // Migrate legacy hubM45Stash circuit → HubSave.circuits (one-shot).
  let migratedCircuit = false;
  if (
    (hub.circuits?.length ?? 0) === 0 &&
    stash.lastCircuit?.circuitBoard &&
    stash.lastCircuit.outcome
  ) {
    hub = upsertCircuitIntoHub(hub, {
      circuitId: stash.lastCircuit.circuitId,
      circuitBoard: stash.lastCircuit.circuitBoard,
      outcome: stash.lastCircuit.outcome,
    });
    migratedCircuit = true;
    log.unshift("回路を HubSave へ移行（旧 M45スタッシュ）");
  }

  if (stash.lastInvadeSector || (!migratedCircuit && stash.lastCircuit)) {
    log.unshift(
      `M45スタッシュ読込${stash.updatedAt ? ` (${stash.updatedAt})` : ""}`,
    );
  }

  const lastCircuit = resolveActiveCircuit(hub, stash.lastCircuit);
  const craftSignature = loadCraftSignature(storage ?? undefined);
  const state: HangarState = {
    hub,
    lastDeployedIds: [],
    selectedDeployIds: selectDeployableInstanceIds(hub.fleet),
    log: log.slice(0, MAX_LOG),
    notice: "",
    lastInvadeSector: stash.lastInvadeSector,
    lastCircuit,
    lastExploreReturn: null,
    craftSignature,
  };
  if (migratedCircuit) {
    return persistHangar(state, storage ?? undefined);
  }
  return state;
}

export function persistHangar(
  state: HangarState,
  storage?: Pick<Storage, "setItem"> | null,
): HangarState {
  saveHubSaveToLocalStorage(state.hub, storage ?? undefined);
  saveM45StashToLocalStorage(state, storage ?? undefined);
  return state;
}

/** Ingest sort / explore wear / invade / restore query params; clear them from the URL when possible. */
export function ingestLocationSearch(
  state: HangarState,
  search: string,
): { state: HangarState; consumed: boolean } {
  let hub = state.hub;
  let log = state.log;
  let consumed = false;
  let lastInvadeSector = state.lastInvadeSector;
  let lastCircuit = state.lastCircuit;
  let lastExploreReturn = state.lastExploreReturn;
  const notices: string[] = [];

  const sort = parseSortToTradeSearch(search);
  if (sort) {
    if (sort.importMaterials > 0) {
      hub = importMaterialsIntoHub(hub, sort.importMaterials);
      log = pushLog(log, `搬入 materials +${sort.importMaterials}`);
      consumed = true;
    }
    if (sort.yieldBag && Object.keys(sort.yieldBag).length > 0) {
      hub = importYieldBagIntoHub(hub, sort.yieldBag);
      const keys = Object.entries(sort.yieldBag)
        .map(([k, v]) => `${k}:${v}`)
        .join(", ");
      log = pushLog(log, `搬入 yieldBag ${keys}`);
      consumed = true;
    }
  }

  const wear = parseExploreToHubWearSearch(search);
  if (wear) {
    const beforeById = new Map(hub.fleet.map((m) => [m.instanceId, m.durability]));
    hub = {
      ...hub,
      fleet: applyWearReportsToFleet(hub.fleet, wear.mechWear),
    };
    hub = normalizeHubSnapshot(hub);
    const detail = wear.mechWear
      .map((w) => {
        const before = beforeById.get(w.instanceId);
        const after = hub.fleet.find((m) => m.instanceId === w.instanceId);
        if (before == null || !after) return `${w.instanceId}:${w.durabilityAfter}`;
        return `${w.instanceId} ${before}→${after.durability}(${after.status})`;
      })
      .join("; ");
    log = pushLog(
      log,
      `帰還ウェア ${wear.returnKind} ×${wear.mechWear.length}${detail ? ` · ${detail}` : ""}`,
    );
    const kindJa =
      wear.returnKind === "extract"
        ? "EXTRACT"
        : wear.returnKind === "abort"
          ? "中断"
          : "失敗";
    lastExploreReturn = {
      returnKind: wear.returnKind,
      summaryJa: `探索帰還 ${kindJa} · 摩耗報告 ${wear.mechWear.length}機${
        detail ? ` · ${detail}` : ""
      }`,
    };
    notices.push(lastExploreReturn.summaryJa);
    consumed = true;
  }

  const invade = parseInvadeToTradeSearch(search);
  if (invade) {
    lastInvadeSector = invade;
    const flags =
      invade.intelFlags && invade.intelFlags.length > 0
        ? ` · intel=${invade.intelFlags.join(",")}`
        : "";
    log = pushLog(
      log,
      `invade セクター (${invade.sectorX},${invade.sectorY}) dens=${invade.density.toFixed(3)}${flags}`,
    );
    notices.push(
      `戦線セクター (${invade.sectorX},${invade.sectorY}) dens=${invade.density.toFixed(3)}`,
    );
    consumed = true;
  }

  const restore = parseRestoreToTradeSearch(search);
  if (restore) {
    const editor =
      sanitizeEditorName(restore.lastEditorName) ??
      sanitizeEditorName(restore.circuitBoard.lastEditorName) ??
      sanitizeEditorName(state.craftSignature) ??
      loadCraftSignature();
    const wasLocked = (() => {
      const id = restore.circuitId?.trim();
      if (!id) return false;
      const prev = hub.circuits.find((c) => c.circuitId === id);
      return prev != null && isCircuitLocked(prev);
    })();
    hub = upsertCircuitIntoHub(hub, {
      circuitId: restore.circuitId,
      circuitBoard: restore.circuitBoard,
      outcome: restore.outcome,
      lastEditorName: editor,
      perfect:
        restore.perfect === true || restore.circuitBoard.perfect === true,
    });
    lastCircuit = resolveActiveCircuit(hub, {
      ...restore,
      lastEditorName: editor,
    });
    const id = restore.circuitId ?? restore.circuitBoard.puzzleId ?? "—";
    const lockNote = wasLocked
      ? " · ロック維持（編集拒否）"
      : hub.circuits.find((c) => c.circuitId === (restore.circuitId ?? ""))
            ?.locked
        ? " · 完璧ロック"
        : "";
    log = pushLog(
      log,
      `restore 回路 ${id} → ${restore.outcome} · 刻印 ${editor}${lockNote}`,
    );
    notices.push(`回路修復 ${restore.outcome} (${id}) · 刻印 ${editor}`);
    consumed = true;
  }

  if (!consumed) {
    return { state, consumed: false };
  }

  const next: HangarState = {
    ...state,
    hub,
    log,
    lastInvadeSector,
    lastCircuit,
    lastExploreReturn,
    craftSignature: state.craftSignature || loadCraftSignature(),
    selectedDeployIds: filterToDeployableIds(
      hub.fleet,
      state.selectedDeployIds,
    ),
    notice:
      notices.length > 0
        ? `ハンドオフ取込: ${notices.join(" / ")}`
        : "ハンドオフを取り込みました",
  };
  return { state: persistHangar(next), consumed: true };
}

export function clearHandoffFromUrl(): void {
  if (typeof window === "undefined") return;
  const keys = [
    ...HANDOFF_QUERY_KEYS.sortToTrade,
    ...HANDOFF_QUERY_KEYS.exploreToHubWear,
    ...HANDOFF_QUERY_KEYS.invadeToTrade,
    ...HANDOFF_QUERY_KEYS.restoreToTrade,
  ];
  const next = stripHandoffParams(window.location.href, keys);
  window.history.replaceState({}, "", next);
}

export function grantStarterFleet(state: HangarState): HangarState {
  let hub = state.hub;
  if (hub.fleet.length === 0) {
    hub = addMechToHub(hub, "mech_gen1") ?? hub;
    hub = addMechToHub(hub, "mech_gen2") ?? hub;
  } else if (hub.fleet.length < 3) {
    const id: MechId = hub.fleet.length === 1 ? "mech_gen2" : "mech_gen1";
    hub = addMechToHub(hub, id) ?? hub;
  }
  const next: HangarState = {
    ...state,
    hub,
    selectedDeployIds: selectDeployableInstanceIds(hub.fleet),
    log: pushLog(state.log, "機体を受領"),
    notice: "ハンガーに機体を追加",
  };
  return persistHangar(next);
}

/** Demo bag so typed repair can be tried without sort. */
export function grantDemoInventory(state: HangarState): HangarState {
  const bag: YieldBag = {
    mat_scrap: 40,
    mat_polymer: 20,
    mat_circuit: 5,
    part_actuator: 2,
    part_armor_plate: 1,
  };
  const hub = importYieldBagIntoHub(state.hub, bag);
  const next: HangarState = {
    ...state,
    hub,
    log: pushLog(state.log, "デモ資材バッグ付与"),
    notice: "型付き在庫を加算",
  };
  return persistHangar(next);
}

/**
 * Grant unsolved but guaranteed-solvable verify-true board into hub.circuits.
 * Hangar button 「検証用真盤を受領」 — solve in restore → perfect lock path.
 */
export function grantVerifyTrueCircuit(state: HangarState): HangarState {
  const board = buildVerifyTrueUnsolvedBoard();
  const hub = upsertCircuitIntoHub(state.hub, {
    circuitId: VERIFY_TRUE_CIRCUIT_ID,
    circuitBoard: board,
    outcome: "offline",
  });
  const next: HangarState = {
    ...state,
    hub,
    lastCircuit: resolveActiveCircuit(hub, {
      circuitId: VERIFY_TRUE_CIRCUIT_ID,
      circuitBoard: board,
      outcome: "offline",
    }),
    log: pushLog(state.log, `検証用真盤受領 ${VERIFY_TRUE_CIRCUIT_ID}`),
    notice: `検証用真盤を受領（${VERIFY_TRUE_PUZZLE_ID} · 未解·可解）`,
  };
  return persistHangar(next);
}

/**
 * Grant already solved+locked Perfect Circuit for lock / 刻印 UI smoke test.
 * Hangar button 「検証用・既に完璧」.
 */
export function grantVerifyPerfectLockedCircuit(
  state: HangarState,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): HangarState {
  const editor =
    sanitizeEditorName(state.craftSignature) ??
    sanitizeEditorName(loadCraftSignature(storage ?? undefined)) ??
    undefined;
  const board = buildVerifyPerfectLockedBoard(editor);
  const hub = upsertCircuitIntoHub(state.hub, {
    circuitId: VERIFY_PERFECT_CIRCUIT_ID,
    circuitBoard: board,
    outcome: "fully_awakened",
    lastEditorName: board.lastEditorName,
    perfect: true,
  });
  const rec = hub.circuits.find((c) => c.circuitId === VERIFY_PERFECT_CIRCUIT_ID);
  const next: HangarState = {
    ...state,
    hub,
    lastCircuit: resolveActiveCircuit(
      hub,
      rec
        ? circuitRecordToPayload(rec)
        : {
            circuitId: VERIFY_PERFECT_CIRCUIT_ID,
            circuitBoard: board,
            outcome: "fully_awakened",
          },
    ),
    log: pushLog(
      state.log,
      `検証用完璧回路受領 ${VERIFY_PERFECT_CIRCUIT_ID} · 刻印 ${board.lastEditorName}`,
    ),
    notice: `検証用・既に完璧を受領（ロック · 刻印 ${board.lastEditorName}）`,
  };
  return persistHangar(next);
}

/** Multiplier so seed inventory covers several EXAMPLE_TYPED_REPAIR_COST repairs. */
const SEED_TYPED_REPAIR_COPIES = 3;

/**
 * YieldBag sized from EXAMPLE_TYPED_REPAIR_COST (plus a few demo extras).
 * Keeps seed ↔ typed repair helpers from drifting apart.
 */
export function buildSeedYieldBagForTypedRepair(
  copies: number = SEED_TYPED_REPAIR_COPIES,
): YieldBag {
  const costBag = yieldBagFromTypedRepairCost(EXAMPLE_TYPED_REPAIR_COST);
  const n = Math.max(1, Math.floor(copies));
  const inventory: YieldBag = {};
  for (const [id, qty] of Object.entries(costBag) as Array<[keyof YieldBag, number]>) {
    const v = Math.floor(Number(qty) || 0) * n;
    if (v > 0) inventory[id] = v;
  }
  // Demo extras (not required by EXAMPLE_TYPED_REPAIR_COST)
  inventory.mat_circuit = Math.max(inventory.mat_circuit ?? 0, 8);
  inventory.part_armor_plate = Math.max(inventory.part_armor_plate ?? 0, 2);
  return inventory;
}

/**
 * Stable playtest HubSnapshot: mixed fleet + wallet + YieldBag + ammo.
 * One tap replaces the need to 「機体を受領」 / 「デモ資材バッグ」 manually.
 * Durability bands: operational ≥41, needs_repair 1..40 (MECH_FLEET_RULES).
 * Inventory/credits sized so typed repair (EXAMPLE_TYPED_REPAIR_COST) succeeds immediately.
 */
export function buildPlaytestSeedHub(): HubSnapshot {
  const inventory = buildSeedYieldBagForTypedRepair();
  const credits = Math.max(
    800,
    EXAMPLE_TYPED_REPAIR_COST.credits * SEED_TYPED_REPAIR_COPIES * 2,
  );
  return normalizeHubSnapshot({
    credits,
    materials: 200,
    fleet: [
      createOwnedMech("mech_gen1", {
        instanceId: "seed_op_gen1",
        durability: 100,
      }),
      createOwnedMech("mech_gen2", {
        instanceId: "seed_op_gen2",
        durability: 85,
      }),
      createOwnedMech("mech_gen1", {
        instanceId: "seed_repair_gen1",
        durability: 25, // needs_repair band (1..40)
      }),
    ],
    ammoLoad: {
      ammo_standard: 40,
      ammo_ap: 10,
      ammo_hp: 5,
    },
    inventory,
    importedMaterials: 0,
    selectedMechId: "mech_gen1",
    selectedAmmoId: "ammo_standard",
  });
}

export type LoadPlaytestSeedOptions = {
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** Perfect Circuit injection rate for the demo circuit board. */
  injectRate?: number;
  rng?: () => number;
  /** Allow player-facing injected-board details in DEV/local/debug UI. */
  showInjectionDetails?: boolean;
};

/** Replace hub with playtest seed and persist via HubSave (+ demo circuit stash). */
export function loadPlaytestSeed(
  state: HangarState,
  storageOrOpts?:
    | Pick<Storage, "getItem" | "setItem" | "removeItem">
    | null
    | LoadPlaytestSeedOptions,
): HangarState {
  const opts: LoadPlaytestSeedOptions =
    storageOrOpts != null &&
    typeof storageOrOpts === "object" &&
    ("injectRate" in storageOrOpts ||
      "rng" in storageOrOpts ||
      "storage" in storageOrOpts)
      ? (storageOrOpts as LoadPlaytestSeedOptions)
      : { storage: storageOrOpts as LoadPlaytestSeedOptions["storage"] };
  const storage = opts.storage ?? undefined;
  const seedBoard = buildSeedCircuitBoard({
    injectRate: opts.injectRate,
    rng: opts.rng,
  });
  const injected = seedBoard.puzzleId === VERIFY_TRUE_PUZZLE_ID;
  const showInjectionDetails =
    opts.showInjectionDetails ?? typeof window === "undefined";
  const circuitId = injected ? VERIFY_TRUE_CIRCUIT_ID : SEED_CIRCUIT_ID;
  const hub = upsertCircuitIntoHub(buildPlaytestSeedHub(), {
    circuitId,
    circuitBoard: seedBoard,
    outcome: "offline",
  });
  const next: HangarState = {
    ...state,
    hub,
    lastDeployedIds: [],
    selectedDeployIds: selectDeployableInstanceIds(hub.fleet),
    lastCircuit: resolveActiveCircuit(hub, {
      circuitId,
      circuitBoard: seedBoard,
      outcome: "offline",
    }),
    craftSignature: state.craftSignature || loadCraftSignature(storage),
    log: pushLog(
      state.log,
      injected && showInjectionDetails
        ? `シード読込 · 真盤注入 ${VERIFY_TRUE_PUZZLE_ID}`
        : "シード読込",
    ),
    notice: injected && showInjectionDetails
      ? `プレイテスト用シード · 真盤気配（${VERIFY_TRUE_PUZZLE_ID}）`
      : "プレイテスト用シードを読込（健在2 + 要修理1 · 回路デモ）",
  };
  return persistHangar(next, storage);
}

/**
 * Resolve hangar Perfect inject rate (DEV 33% / prod 1% / query / env).
 * Call from Vite UI with hostname + import.meta.env.DEV.
 */
export function resolveHangarPerfectInjectRate(ctx?: {
  search?: string | null;
  hostname?: string | null;
  isDev?: boolean;
  envRate?: string | number | null;
}): number {
  return resolvePerfectCircuitInjectRate(ctx ?? {});
}

export function resetHangar(
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
): HangarState {
  clearHubSaveFromLocalStorage(storage ?? undefined);
  clearM45StashFromLocalStorage(storage ?? undefined);
  const hub = normalizeHubSnapshot(INITIAL_HUB);
  const next: HangarState = {
    hub,
    lastDeployedIds: [],
    selectedDeployIds: [],
    log: ["デモ初期化"],
    notice: "セーブを消去し初期ハブへ",
    lastInvadeSector: null,
    lastCircuit: null,
    lastExploreReturn: null,
    craftSignature: loadCraftSignature(storage ?? undefined),
  };
  return persistHangar(next, storage ?? undefined);
}

export function setDeploySelection(
  state: HangarState,
  instanceId: string,
  selected: boolean,
): HangarState {
  const set = new Set(state.selectedDeployIds);
  if (selected) set.add(instanceId);
  else set.delete(instanceId);
  const selectedDeployIds = filterToDeployableIds(state.hub.fleet, [...set]);
  return { ...state, selectedDeployIds, notice: "" };
}

export function selectAllDeployable(state: HangarState): HangarState {
  return {
    ...state,
    selectedDeployIds: selectDeployableInstanceIds(state.hub.fleet),
    notice: "",
  };
}


/** Aggregate HubSave.circuits outcomes into sortie/hub bonuses. */
export function hubCircuitBonuses(hub: HubSnapshot): AggregatedCircuitBonuses {
  return aggregateCircuitBonuses(hub.circuits ?? []);
}

export function buildDeployUrl(state: HangarState): string | null {
  const ids = filterToDeployableIds(
    state.hub.fleet,
    state.selectedDeployIds.length > 0
      ? state.selectedDeployIds
      : selectDeployableInstanceIds(state.hub.fleet),
  );
  if (ids.length === 0) return null;
  const ammo = ammoTotal(state.hub.ammoLoad);
  const payload = buildTradeToExplorePayloadFromFleet(
    state.hub.fleet,
    ammo,
    ids,
  );
  const bonuses = hubCircuitBonuses(state.hub);
  if (
    bonuses.durabilityBuffer > 0 ||
    bonuses.craftMultiplier > 1 ||
    bonuses.repairDiscount > 0
  ) {
    payload.circuitBonuses = {
      craftMultiplier: bonuses.craftMultiplier,
      repairDiscount: bonuses.repairDiscount,
      durabilityBuffer: bonuses.durabilityBuffer,
    };
  }
  return buildTradeToExploreUrl(payload, resolveModuleBaseUrl("explore"));
}

/** trade → invade preview URL (optional; fromHub + fleet/ammo summary). */
export function buildInvadeUrl(state: HangarState): string {
  const deployableMechs = selectDeployableInstanceIds(state.hub.fleet).length;
  const startingAmmo = ammoTotal(state.hub.ammoLoad);
  return buildTradeToInvadeUrl(
    {
      fromHub: true,
      deployableMechs,
      startingAmmo,
    },
    resolveModuleBaseUrl("invade"),
  );
}

/**
 * trade → restore preview URL.
 * Prefers hub.circuits (optional circuitId) → lastCircuit → demo seed board.
 * Prior outcome is not forwarded into the restore session.
 */
export function buildRestoreUrl(
  state: HangarState,
  circuitId?: string | null,
): string {
  const fromHub = findHubCircuit(state.hub, circuitId);
  const stash =
    fromHub != null
      ? circuitRecordToPayload(fromHub)
      : circuitId
        ? null
        : state.lastCircuit ??
          (state.hub.circuits[0]
            ? circuitRecordToPayload(state.hub.circuits[0])
            : null);

  const editorName = sanitizeEditorName(state.craftSignature) ?? loadCraftSignature();
  if (stash?.circuitBoard) {
    const board: CircuitBoardState = {
      v: 1,
      cols: stash.circuitBoard.cols,
      rows: stash.circuitBoard.rows,
      edgeState: stash.circuitBoard.edgeState,
    };
    if (stash.circuitBoard.puzzleId) board.puzzleId = stash.circuitBoard.puzzleId;
    // Forward lock / 刻印 so restore can refuse edits without HubSave race.
    const hubRec = findHubCircuit(state.hub, stash.circuitId);
    if (hubRec && isCircuitLocked(hubRec)) {
      board.locked = true;
      board.perfect = true;
      if (hubRec.lastEditorName) board.lastEditorName = hubRec.lastEditorName;
    }
    const locked = hubRec != null && isCircuitLocked(hubRec);
    const engraved =
      hubRec?.lastEditorName ?? hubRec?.circuitBoard.lastEditorName;
    return buildTradeToRestoreUrl(
      {
        circuitId: stash.circuitId ?? SEED_CIRCUIT_ID,
        circuitBoard: board,
        editorName,
        locked: locked || undefined,
        lastEditorName: engraved,
      },
      resolveModuleBaseUrl("restore"),
    );
  }
  return buildTradeToRestoreUrl(
    {
      circuitId: SEED_CIRCUIT_ID,
      circuitBoard: buildSeedCircuitBoard(),
      editorName,
    },
    resolveModuleBaseUrl("restore"),
  );
}

/** Set hangar 「署名」 once (localStorage craft signature). */
export function setCraftSignature(
  state: HangarState,
  name: string,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): HangarState {
  const result = saveCraftSignatureOnce(name, storage ?? undefined);
  if (result.alreadySet) {
    return {
      ...state,
      craftSignature: result.signature,
      notice: `署名は確定済み（${result.signature}）· 変更不可`,
    };
  }
  if (!result.ok) {
    return { ...state, notice: "署名を入力してください" };
  }
  return {
    ...state,
    craftSignature: result.signature,
    log: pushLog(state.log, `署名確定 ${result.signature}`),
    notice: `署名を刻印用に確定: ${result.signature}`,
  };
}

/** Select a circuit as the active lastCircuit (UI highlight / default restore). */
export function selectCircuit(
  state: HangarState,
  circuitId: string,
): HangarState {
  const rec = findHubCircuit(state.hub, circuitId);
  if (!rec) return { ...state, notice: "回路なし" };
  return {
    ...state,
    lastCircuit: circuitRecordToPayload(rec),
    notice: `回路選択 ${rec.circuitId}`,
  };
}

export function circuitOutcomeLabelJa(outcome: CircuitOutcome): string {
  if (outcome === "fully_awakened") return "完全覚醒";
  if (outcome === "bypass") return "バイパス";
  return "オフライン";
}

/** Remember last deploy set when user opens the explore link. */
export function markDeployed(state: HangarState, ids: string[]): HangarState {
  const next: HangarState = {
    ...state,
    lastDeployedIds: ids,
    log: pushLog(state.log, `出撃コミット ${ids.length}機`),
    notice: "出撃セットを記録（シミュ帰還用）",
  };
  return next;
}

export function repairClassic(
  state: HangarState,
  instanceId: string,
): HangarState {
  const mech = state.hub.fleet.find((m) => m.instanceId === instanceId);
  if (!mech) return { ...state, notice: "機体なし" };
  const baseCost = repairCost(mech);
  if (!baseCost) {
    return { ...state, notice: "要修理のみ修理可（大破は解体）" };
  }
  const bonuses = hubCircuitBonuses(state.hub);
  const cost = applyRepairDiscountToCost(baseCost, bonuses);
  if (
    state.hub.credits < cost.credits ||
    state.hub.materials < cost.materials
  ) {
    const disc =
      bonuses.repairDiscount > 0
        ? ` · 回路割引 −${Math.round(bonuses.repairDiscount * 100)}%`
        : "";
    return {
      ...state,
      notice: `クレジット/資材不足（要 ${cost.credits}c / ${cost.materials}m${disc}）`,
    };
  }
  // Apply discounted spend; restore mech to full like applyRepair.
  const repaired = syncMechStatus({
    ...mech,
    durability: mech.durabilityMax,
  });
  const fleet = state.hub.fleet.map((m) =>
    m.instanceId === instanceId ? repaired : m,
  );
  const hub = normalizeHubSnapshot({
    ...state.hub,
    fleet,
    credits: state.hub.credits - cost.credits,
    materials: state.hub.materials - cost.materials,
  });
  const discNote =
    bonuses.repairDiscount > 0
      ? `（回路 −${Math.round(bonuses.repairDiscount * 100)}%）`
      : "";
  const next: HangarState = {
    ...state,
    hub,
    selectedDeployIds: selectDeployableInstanceIds(hub.fleet),
    log: pushLog(state.log, `修理(集計) ${instanceId}${discNote}`),
    notice: `集計コストで修理完了 → 健在${discNote}`,
  };
  return persistHangar(next);
}

/** Human-readable shortfall for EXAMPLE_TYPED_REPAIR_COST vs wallet/inventory. */
export function describeTypedRepairShortfall(
  credits: number,
  inventory: YieldBag,
): string | null {
  const costBag = yieldBagFromTypedRepairCost(EXAMPLE_TYPED_REPAIR_COST);
  const creditsNeed = EXAMPLE_TYPED_REPAIR_COST.credits;
  const parts: string[] = [];
  if (credits < creditsNeed) {
    parts.push(`クレジット不足（要 ${creditsNeed} / 持 ${credits}）`);
  }
  const missing: string[] = [];
  for (const [id, needRaw] of Object.entries(costBag)) {
    const need = Math.floor(Number(needRaw) || 0);
    if (need <= 0) continue;
    const have = Math.floor(Number(inventory[id as keyof YieldBag] ?? 0) || 0);
    if (have < need) missing.push(`${id} 要${need}/持${have}`);
  }
  if (missing.length > 0) {
    parts.push(`型付き資材不足: ${missing.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Compact spend line for UI / log (credits + YieldBag keys). */
export function formatTypedRepairSpend(): string {
  const costBag = yieldBagFromTypedRepairCost(EXAMPLE_TYPED_REPAIR_COST);
  const bag = Object.entries(costBag)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  return `−${EXAMPLE_TYPED_REPAIR_COST.credits}c` + (bag ? ` · −[${bag}]` : "");
}

/**
 * Typed repair: EXAMPLE_TYPED_REPAIR_COST credits + YieldBag spend.
 * Durability restored like applyRepair (要修理 only).
 * On success, repaired mech is included in selectedDeployIds (all operational).
 */
export function repairTyped(
  state: HangarState,
  instanceId: string,
): HangarState {
  const mech = state.hub.fleet.find((m) => m.instanceId === instanceId);
  if (!mech) return { ...state, notice: "機体なし" };
  if (mech.status !== "needs_repair") {
    return { ...state, notice: "要修理のみ型付き修理可" };
  }
  const costBag = yieldBagFromTypedRepairCost(EXAMPLE_TYPED_REPAIR_COST);
  const shortfall = describeTypedRepairShortfall(
    state.hub.credits,
    state.hub.inventory,
  );
  if (shortfall) {
    return { ...state, notice: shortfall };
  }
  const nextInv = spendYieldBag(state.hub.inventory, costBag);
  if (!nextInv) return { ...state, notice: "型付き消費失敗" };
  const creditsNeed = EXAMPLE_TYPED_REPAIR_COST.credits;
  const repaired = createOwnedMech(mech.catalogId, {
    instanceId: mech.instanceId,
    durability: mech.durabilityMax,
    durabilityMax: mech.durabilityMax,
  });
  const fleet = state.hub.fleet.map((m) =>
    m.instanceId === instanceId ? repaired : m,
  );
  const hub = normalizeHubSnapshot({
    ...state.hub,
    fleet,
    credits: state.hub.credits - creditsNeed,
    inventory: nextInv,
  });
  const selectedDeployIds = selectDeployableInstanceIds(hub.fleet);
  const spend = formatTypedRepairSpend();
  const next: HangarState = {
    ...state,
    hub,
    selectedDeployIds,
    log: pushLog(state.log, `修理(型付き) ${instanceId} ${spend}`),
    notice: `型付き修理完了 → 健在（${spend}）· 出撃選択に追加`,
  };
  return persistHangar(next);
}

export function scrapMech(
  state: HangarState,
  instanceId: string,
): HangarState {
  const result = applyScrap(state.hub.fleet, instanceId, {
    credits: state.hub.credits,
    materials: state.hub.materials,
  });
  if (!result) return { ...state, notice: "解体対象なし" };
  const hub = normalizeHubSnapshot({
    ...state.hub,
    fleet: result.fleet,
    credits: result.wallet.credits,
    materials: result.wallet.materials,
  });
  const next: HangarState = {
    ...state,
    hub,
    selectedDeployIds: filterToDeployableIds(
      hub.fleet,
      state.selectedDeployIds,
    ),
    lastDeployedIds: state.lastDeployedIds.filter((id) => id !== instanceId),
    log: pushLog(
      state.log,
      `解体 ${instanceId} → +${result.yielded.credits}c / +${result.yielded.materials}m`,
    ),
    notice: "解体完了",
  };
  return persistHangar(next);
}

/** Simulated explore return when live wear URL is unavailable. */
export function simulateReturn(
  state: HangarState,
  kind: SortieReturnKind,
): HangarState {
  const ids =
    state.lastDeployedIds.length > 0
      ? state.lastDeployedIds
      : state.selectedDeployIds.length > 0
        ? state.selectedDeployIds
        : selectDeployableInstanceIds(state.hub.fleet);
  if (ids.length === 0) {
    return { ...state, notice: "摩耗対象の機体がありません" };
  }
  const buffer = hubCircuitBonuses(state.hub).durabilityBuffer;
  const reports = buildWearReportsForSortie(state.hub.fleet, ids, kind).map(
    (w) => {
      const reduced = applyDurabilityBufferToWear(w.wearApplied, buffer);
      return {
        instanceId: w.instanceId,
        durabilityAfter: Math.max(0, w.durabilityBefore - reduced),
      };
    },
  );
  const fleet = applyWearReportsToFleet(state.hub.fleet, reports);
  const hub = normalizeHubSnapshot({ ...state.hub, fleet });
  const bufNote = buffer > 0 ? ` · 回路緩衝 ${buffer}` : "";
  const kindJa =
    kind === "extract" ? "EXTRACT" : kind === "abort" ? "中断" : "失敗";
  const summaryJa = `探索帰還 ${kindJa} · シミュ摩耗 ${ids.length}機${bufNote}`;
  const next: HangarState = {
    ...state,
    hub,
    lastDeployedIds: [],
    selectedDeployIds: selectDeployableInstanceIds(hub.fleet),
    lastExploreReturn: { returnKind: kind, summaryJa },
    log: pushLog(state.log, `シミュ帰還 ${kind} ×${ids.length}${bufNote}`),
    notice: `シミュ帰還（${kind}）で摩耗適用${bufNote}`,
  };
  return persistHangar(next);
}


/**
 * Sell rare YieldBag items using {@link RARE_SELL_PRICE_TABLE} unit prices
 * → +credits, −inventory, HubSave persist. Prices are 仮 / TBD.
 */
export function sellRareItem(
  state: HangarState,
  itemId: string,
  qty = 1,
): HangarState {
  if (!isRareYieldItemId(itemId)) {
    return { ...state, notice: "レア対象外（売却不可）" };
  }
  const n = Math.max(1, Math.floor(qty));
  const have = Math.floor(Number(state.hub.inventory[itemId] ?? 0) || 0);
  if (have < n) {
    return { ...state, notice: `${itemId} 不足（持 ${have}）` };
  }
  const unit = RARE_SELL_PRICE_CREDITS[itemId];
  const gained = unit * n;
  const nextInv = spendYieldBag(state.hub.inventory, { [itemId]: n });
  if (!nextInv) return { ...state, notice: "売却失敗（在庫）" };
  const hub = normalizeHubSnapshot({
    ...state.hub,
    credits: state.hub.credits + gained,
    inventory: nextInv,
  });
  const next: HangarState = {
    ...state,
    hub,
    log: pushLog(state.log, `レア売却 ${itemId}×${n} → +${gained}c（仮）`),
    notice: `売却 +${gained}c（仮 ${unit}c/${itemId}）`,
  };
  return persistHangar(next);
}

/**
 * Sell one HubSave circuit: price = {@link CIRCUIT_SELL_BASE_CREDITS} +
 * floor(effect) × {@link CIRCUIT_SELL_CREDITS_PER_EFFECT} (仮 · 最低+出来栄え).
 * Removes from inventory, credits wallet, clears active selection if needed.
 * Effect 0 → +30c (最低額 only; still allowed).
 */
export function sellCircuit(
  state: HangarState,
  circuitId: string,
): HangarState {
  const rec = findHubCircuit(state.hub, circuitId);
  if (!rec) return { ...state, notice: "回路なし" };

  let effect = 0;
  try {
    const br: CircuitEffectBreakdown = computeCircuitEffectForBoard(
      rec.circuitBoard,
      { perfect: rec.circuitBoard.perfect ?? rec.locked },
    );
    effect = br.effect;
  } catch {
    effect = 0;
  }
  const gained = circuitSellPriceCredits(effect);
  const without = removeCircuitFromHub(state.hub, rec.circuitId);
  const hub = normalizeHubSnapshot({
    ...without,
    credits: without.credits + gained,
  });

  const soldWasActive = state.lastCircuit?.circuitId === rec.circuitId;
  const lastCircuit = soldWasActive
    ? resolveActiveCircuit(hub, null)
    : state.lastCircuit != null &&
        findHubCircuit(hub, state.lastCircuit.circuitId) == null
      ? resolveActiveCircuit(hub, null)
      : state.lastCircuit;

  const next: HangarState = {
    ...state,
    hub,
    lastCircuit,
    log: pushLog(
      state.log,
      `回路売却 ${rec.circuitId} · 効果 ${effect} → +${gained}c（仮 最低${CIRCUIT_SELL_BASE_CREDITS}c + 出来栄え ${effect}*${CIRCUIT_SELL_CREDITS_PER_EFFECT}c）`,
    ),
    notice: (() => {
      const brk = formatCircuitSellPriceJa(effect);
      return `回路売却 +${gained}c（最低 ${brk.base}c + 出来栄え ${brk.craft}c）`;
    })(),
  };
  return persistHangar(next);
}

export function statusClass(
  status: keyof typeof MECH_STATUS_LABEL_JA,
): string {
  if (status === "operational") return "status-op";
  if (status === "needs_repair") return "status-rp";
  return "status-dd";
}

export function durabilityBarClass(
  status: keyof typeof MECH_STATUS_LABEL_JA,
): string {
  if (status === "operational") return "bar";
  if (status === "needs_repair") return "bar repair";
  return "bar dead";
}


/** Fleet / handoff snapshot for the 「次の出撃」 hub panel (pure). */
export type NextSortieReadiness = {
  operational: number;
  needsRepair: number;
  destroyed: number;
  total: number;
  deployableIds: string[];
  selectedIds: string[];
  repairTargets: Array<{
    instanceId: string;
    catalogId: string;
    durability: number;
    durabilityMax: number;
  }>;
  canDeployExplore: boolean;
  /** One-line JA readiness, e.g. "出撃可 2 · 要修理 1 · 大破 0". */
  readinessLabelJa: string;
};

/**
 * Summarize hangar fleet for next-sortie readiness UI.
 * Does not invent HubSave keys — reads fleet + selection only.
 */
export function buildNextSortieReadiness(state: HangarState): NextSortieReadiness {
  const fleet = state.hub.fleet;
  let operational = 0;
  let needsRepair = 0;
  let destroyed = 0;
  const repairTargets: NextSortieReadiness["repairTargets"] = [];
  for (const m of fleet) {
    if (m.status === "operational") operational += 1;
    else if (m.status === "needs_repair") {
      needsRepair += 1;
      repairTargets.push({
        instanceId: m.instanceId,
        catalogId: m.catalogId,
        durability: m.durability,
        durabilityMax: m.durabilityMax,
      });
    } else destroyed += 1;
  }
  const deployableIds = selectDeployableInstanceIds(fleet);
  const selectedIds = filterToDeployableIds(
    fleet,
    state.selectedDeployIds.length > 0
      ? state.selectedDeployIds
      : deployableIds,
  );
  const parts: string[] = [`出撃可 ${operational}`];
  if (needsRepair > 0) parts.push(`要修理 ${needsRepair}`);
  if (destroyed > 0) parts.push(`大破 ${destroyed}`);
  if (fleet.length === 0) parts[0] = "艦隊なし";
  return {
    operational,
    needsRepair,
    destroyed,
    total: fleet.length,
    deployableIds,
    selectedIds,
    repairTargets,
    canDeployExplore: selectedIds.length > 0,
    readinessLabelJa: parts.join(" · "),
  };
}


/** One-line return digests for the 「次の出撃」 hero panel. */
export type NextSortieReturnDigest = {
  exploreJa: string;
  invadeJa: string;
  restoreJa: string;
};

export function buildNextSortieReturnDigest(
  state: HangarState,
): NextSortieReturnDigest {
  const exploreJa =
    state.lastExploreReturn?.summaryJa ?? "探索帰還なし（出撃後に摩耗報告）";
  const invadeJa = formatInvadeIntelBrief(state.lastInvadeSector);
  const circuits = formatCircuitHubBrief(state.hub.circuits, state.lastCircuit);
  const restoreJa =
    state.lastCircuit != null
      ? `回路帰還 · ${circuits.summaryJa}`
      : circuits.summaryJa;
  return { exploreJa, invadeJa, restoreJa };
}

/** Known invade intelFlags → short JA (unknown flags pass through). */
export function formatIntelFlagJa(flag: string): string {
  const map: Record<string, string> = {
    routeHint: "ルート示唆",
    rareSignal: "希少信号",
    frontline: "前線",
    scoutHazard: "偵察ハザード",
    scoutClear: "偵察クリア",
    sectorFlagged: "セクター旗",
    sectorCleared: "セクター掃討",
    minesRemaining: "残機雷",
    allDestroyed: "全機大破（ブラウザ戻る）",
  };
  return map[flag] ?? flag;
}

/**
 * Readable invade→trade intel line for the hub panel.
 * Uses existing lastInvadeSector stash (not a new HubSave key).
 */
export function formatInvadeIntelBrief(
  sector: InvadeToTradePayload | null | undefined,
): string {
  if (!sector) return "戦線インテル未取込";
  const dens = Number.isFinite(sector.density)
    ? sector.density.toFixed(2)
    : String(sector.density);
  const flags = sector.intelFlags?.length
    ? sector.intelFlags.map(formatIntelFlagJa).join("、")
    : "なし";
  return `セクター (${sector.sectorX},${sector.sectorY}) · 密度 ${dens} · インテル: ${flags}`;
}

export type CircuitHubBriefLine = {
  circuitId: string;
  outcome: CircuitOutcome;
  outcomeJa: string;
  locked: boolean;
  active: boolean;
  editor: string | null;
  effect: number;
  effectJa: string;
};

export type CircuitHubBrief = {
  /** One-line JA, e.g. "回路 2枚 · 直近 バイパス (board_demo) · 効果 8". */
  summaryJa: string;
  lines: CircuitHubBriefLine[];
};

/**
 * Readable HubSave.circuits (+ optional lastCircuit highlight) for hub UI.
 */
export function formatCircuitHubBrief(
  circuits: HubCircuitRecord[] | null | undefined,
  lastCircuit?: RestoreToTradePayload | null,
): CircuitHubBrief {
  const list = circuits ?? [];
  const activeId =
    lastCircuit?.circuitId ??
    (lastCircuit?.circuitBoard?.puzzleId as string | undefined) ??
    null;
  const lines: CircuitHubBriefLine[] = list.map((c) => {
    let effect = 0;
    let effectJa = "効果 0";
    try {
      const br: CircuitEffectBreakdown = computeCircuitEffectForBoard(
        c.circuitBoard,
        { perfect: c.circuitBoard.perfect ?? c.locked },
      );
      effect = br.effect;
      effectJa = formatCircuitEffectJa(br);
    } catch {
      /* scoring best-effort */
    }
    return {
      circuitId: c.circuitId,
      outcome: c.outcome,
      outcomeJa: circuitOutcomeLabelJa(c.outcome),
      locked: isCircuitLocked(c),
      active: activeId != null && c.circuitId === activeId,
      editor: c.lastEditorName ?? c.circuitBoard.lastEditorName ?? null,
      effect,
      effectJa,
    };
  });
  if (lines.length === 0) {
    return { summaryJa: "回路なし（restore 取込待ち）", lines };
  }
  const active = lines.find((l) => l.active) ?? lines[0]!;
  const lockNote = active.locked ? " · 完璧" : "";
  return {
    summaryJa: `回路 ${lines.length}枚 · 直近 ${active.outcomeJa} (${active.circuitId})${lockNote} · ${active.effectJa}`,
    lines,
  };
}

export {
  MECH_STATUS_LABEL_JA,
  MECH_FLEET_RULES,
  EXAMPLE_TYPED_REPAIR_COST,
  canDeploy,
  repairCost,
  yieldBagFromTypedRepairCost,
  canAffordRepair,
  canAffordYieldCost,
  formatCircuitBonusesJa,
  applyRepairDiscountToCost,
  isCircuitLocked,
  CRAFT_SIGNATURE_STORAGE_KEY,
  VERIFY_TRUE_CIRCUIT_ID,
  VERIFY_PERFECT_CIRCUIT_ID,
  VERIFY_TRUE_PUZZLE_ID,
  VERIFY_TRUE_SOLUTION_HINT,
  PERFECT_CIRCUIT_DEV_RATE,
  PERFECT_CIRCUIT_PROD_RATE,
  PERFECT_CIRCUIT_PROD_RATE_ALT,
  resolvePerfectCircuitInjectRate,
  rollPerfectCircuit,
};
