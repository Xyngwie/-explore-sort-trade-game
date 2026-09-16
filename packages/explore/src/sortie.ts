import {
  type ExploreResult,
  createExpeditionState,
  stockFromContainers,
  wingmanCountFromMechs,
  parseTradeToExploreSearch,
  DEFAULT_EXPEDITION_LOADOUT,
} from "@estg/shared";

export type SortieLive = {
  phase: "briefing" | "sortie" | "result";
  carrierCapacity: number;
  unitCapacity: number;
  wingmanCount: number;
  ammoStock: number;
  maxOperationTimeSec: number;
  salvaged: number;
  extracted: boolean;
  failReason: "timeout" | "abort" | null;
  timeLeftSec: number;
  note: string;
};

export function createSortieFromLocationSearch(search: string): SortieLive {
  const inbound = parseTradeToExploreSearch(search);
  const wingmanCount =
    inbound?.deployableMechs != null
      ? wingmanCountFromMechs(inbound.deployableMechs)
      : 2;
  const ammoStock =
    inbound?.startingAmmo != null
      ? inbound.startingAmmo
      : DEFAULT_EXPEDITION_LOADOUT.ammoStock;
  const unitCapacity = 2;
  const craft = 1 + wingmanCount;
  const carrierCapacity = unitCapacity * craft;
  const note =
    inbound != null
      ? `HUB 受取 · 配備 ${craft} 機（僚機 ${wingmanCount}） · 実弾 ${ammoStock}`
      : "デモ編成 · 僚機 2 · 既定実弾";

  return {
    phase: "briefing",
    carrierCapacity,
    unitCapacity,
    wingmanCount,
    ammoStock,
    maxOperationTimeSec: DEFAULT_EXPEDITION_LOADOUT.maxOperationTimeSec,
    salvaged: 0,
    extracted: false,
    failReason: null,
    timeLeftSec: DEFAULT_EXPEDITION_LOADOUT.maxOperationTimeSec,
    note,
  };
}

export function startSortie(s: SortieLive): SortieLive {
  return {
    ...s,
    phase: "sortie",
    salvaged: 0,
    extracted: false,
    failReason: null,
    timeLeftSec: s.maxOperationTimeSec,
  };
}

export function salvageOne(s: SortieLive): SortieLive {
  if (s.phase !== "sortie" || s.extracted) return s;
  if (s.salvaged >= s.carrierCapacity) return s;
  return { ...s, salvaged: s.salvaged + 1 };
}

export function extract(s: SortieLive): SortieLive {
  if (s.phase !== "sortie") return s;
  return {
    ...s,
    phase: "result",
    extracted: true,
    failReason: null,
  };
}

export function failTimeout(s: SortieLive): SortieLive {
  if (s.phase !== "sortie") return s;
  return {
    ...s,
    phase: "result",
    extracted: false,
    failReason: "timeout",
    salvaged: 0,
  };
}

export function tick(s: SortieLive, dtSec: number): SortieLive {
  if (s.phase !== "sortie") return s;
  const timeLeftSec = Math.max(0, s.timeLeftSec - dtSec);
  if (timeLeftSec <= 0) return failTimeout({ ...s, timeLeftSec: 0 });
  return { ...s, timeLeftSec };
}

export function toExploreResult(s: SortieLive): ExploreResult {
  const salvaged = s.extracted ? s.salvaged : 0;
  const state = createExpeditionState({
    carrierCapacity: s.carrierCapacity,
    maxOperationTimeSec: s.maxOperationTimeSec,
    ammoStock: s.ammoStock,
    isExtracted: s.extracted,
    salvagedContainers: salvaged,
    totalStockPieces: stockFromContainers(salvaged),
  });
  return {
    carrierCapacity: state.carrierCapacity,
    maxOperationTimeSec: state.maxOperationTimeSec,
    ammoStock: state.ammoStock,
    isExtracted: state.isExtracted,
    salvagedContainers: state.salvagedContainers,
    totalStockPieces: state.totalStockPieces,
  };
}
