/**
 * Hangar state helpers for Module 3 stub UI.
 * Pure transitions + localStorage persistence via shared hub-save.
 */

import {
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
  resolveModuleBaseUrl,
  canAffordRepair,
  canAffordYieldCost,
  canDeploy,
  clearHubSaveFromLocalStorage,
  createOwnedMech,
  filterToDeployableIds,
  importMaterialsIntoHub,
  importYieldBagIntoHub,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  parseExploreToHubWearSearch,
  parseSortToTradeSearch,
  repairCost,
  saveHubSaveToLocalStorage,
  selectDeployableInstanceIds,
  spendYieldBag,
  stripHandoffParams,
  wearFleetAfterSortie,
  yieldBagFromTypedRepairCost,
  type HubSnapshot,
  type MechId,
  type SortieReturnKind,
  type YieldBag,
} from "@estg/shared";

export type HangarLog = string[];

export type HangarState = {
  hub: HubSnapshot;
  /** Last deploy set (for simulated return). */
  lastDeployedIds: string[];
  selectedDeployIds: string[];
  log: HangarLog;
  notice: string;
};

const MAX_LOG = 12;

function pushLog(log: HangarLog, line: string): HangarLog {
  return [line, ...log].slice(0, MAX_LOG);
}

export function createInitialHangar(
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
): HangarState {
  const loaded = loadHubSaveFromLocalStorage(storage ?? undefined);
  const hub = loaded?.hub
    ? normalizeHubSnapshot(loaded.hub)
    : normalizeHubSnapshot(INITIAL_HUB);
  return {
    hub,
    lastDeployedIds: [],
    selectedDeployIds: selectDeployableInstanceIds(hub.fleet),
    log: loaded
      ? [`セーブ読込 (${loaded.savedAt})`]
      : ["初期ハブ（セーブなし）"],
    notice: "",
  };
}

export function persistHangar(
  state: HangarState,
  storage?: Pick<Storage, "setItem"> | null,
): HangarState {
  saveHubSaveToLocalStorage(state.hub, storage ?? undefined);
  return state;
}

/** Ingest sort / explore wear query params; clear them from the URL when possible. */
export function ingestLocationSearch(
  state: HangarState,
  search: string,
): { state: HangarState; consumed: boolean } {
  let hub = state.hub;
  let log = state.log;
  let consumed = false;

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
    consumed = true;
  }

  if (!consumed) {
    return { state, consumed: false };
  }

  const next: HangarState = {
    ...state,
    hub,
    log,
    selectedDeployIds: filterToDeployableIds(
      hub.fleet,
      state.selectedDeployIds,
    ),
    notice: "ハンドオフを取り込みました",
  };
  return { state: persistHangar(next), consumed: true };
}

export function clearHandoffFromUrl(): void {
  if (typeof window === "undefined") return;
  const keys = [
    ...HANDOFF_QUERY_KEYS.sortToTrade,
    ...HANDOFF_QUERY_KEYS.exploreToHubWear,
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

export function resetHangar(
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
): HangarState {
  clearHubSaveFromLocalStorage(storage ?? undefined);
  const hub = normalizeHubSnapshot(INITIAL_HUB);
  const next: HangarState = {
    hub,
    lastDeployedIds: [],
    selectedDeployIds: [],
    log: ["デモ初期化"],
    notice: "セーブを消去し初期ハブへ",
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
  return buildTradeToExploreUrl(payload, resolveModuleBaseUrl("explore"));
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
  const cost = repairCost(mech);
  if (!cost) {
    return { ...state, notice: "要修理のみ修理可（大破は解体）" };
  }
  if (
    !canAffordRepair(mech, {
      credits: state.hub.credits,
      materials: state.hub.materials,
    })
  ) {
    return {
      ...state,
      notice: `クレジット/資材不足（要 ${cost.credits}c / ${cost.materials}m）`,
    };
  }
  const result = applyRepair(mech, {
    credits: state.hub.credits,
    materials: state.hub.materials,
  });
  if (!result) return { ...state, notice: "修理失敗" };
  const fleet = state.hub.fleet.map((m) =>
    m.instanceId === instanceId ? result.mech : m,
  );
  const hub = normalizeHubSnapshot({
    ...state.hub,
    fleet,
    credits: result.wallet.credits,
    materials: result.wallet.materials,
  });
  const next: HangarState = {
    ...state,
    hub,
    selectedDeployIds: selectDeployableInstanceIds(hub.fleet),
    log: pushLog(state.log, `修理(集計) ${instanceId}`),
    notice: "集計コストで修理完了 → 健在",
  };
  return persistHangar(next);
}

/**
 * Typed repair: EXAMPLE_TYPED_REPAIR_COST credits + YieldBag spend.
 * Durability restored like applyRepair (要修理 only).
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
  const creditsNeed = EXAMPLE_TYPED_REPAIR_COST.credits;
  if (state.hub.credits < creditsNeed) {
    return { ...state, notice: `クレジット不足（要 ${creditsNeed}）` };
  }
  if (!canAffordYieldCost(state.hub.inventory, costBag)) {
    return { ...state, notice: "型付き資材/パーツ不足" };
  }
  const nextInv = spendYieldBag(state.hub.inventory, costBag);
  if (!nextInv) return { ...state, notice: "型付き消費失敗" };
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
  const next: HangarState = {
    ...state,
    hub,
    selectedDeployIds: selectDeployableInstanceIds(hub.fleet),
    log: pushLog(state.log, `修理(型付き) ${instanceId}`),
    notice: "型付きコストで修理完了 → 健在",
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
  const fleet = wearFleetAfterSortie(state.hub.fleet, ids, kind);
  const hub = normalizeHubSnapshot({ ...state.hub, fleet });
  const next: HangarState = {
    ...state,
    hub,
    lastDeployedIds: [],
    selectedDeployIds: selectDeployableInstanceIds(hub.fleet),
    log: pushLog(state.log, `シミュ帰還 ${kind} ×${ids.length}`),
    notice: `シミュ帰還（${kind}）で摩耗適用`,
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

export { MECH_STATUS_LABEL_JA, MECH_FLEET_RULES, EXAMPLE_TYPED_REPAIR_COST, canDeploy, repairCost, yieldBagFromTypedRepairCost, canAffordRepair, canAffordYieldCost };
