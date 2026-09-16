import { PIECES_PER_CONTAINER } from "./constants";

/**
 * Shared player / expedition payload across explore → sort → trade.
 * Fields not produced by a given module may be 0 / defaults.
 */
export interface PlayerExpeditionState {
  /** Max salvage slots per craft (explore / hub-influenced). */
  carrierCapacity: number;
  /** Sortie time budget in seconds. */
  maxOperationTimeSec: number;
  /** Carried live rounds at export (or remaining). */
  ammoStock: number;

  /** True if the squad extracted successfully. */
  isExtracted: boolean;
  /** Containers recovered on a successful extract (else typically 0). */
  salvagedContainers: number;
  /** Puzzle stock; usually salvagedContainers * PIECES_PER_CONTAINER. */
  totalStockPieces: number;

  /** Sort (Athanor) refine outputs. */
  yieldFood: number;
  yieldMaterial: number;
  yieldEnergy: number;
  scrapLossCount: number;
  /** Craft quality multiplier, typically 1.0–1.1. */
  craftMultiplier: number;

  /** Persistent currency (owned by trade/hub long-term). */
  credits: number;
  avatarDirtLevel: number;
}

export type ExpeditionDefaults = Pick<
  PlayerExpeditionState,
  "carrierCapacity" | "maxOperationTimeSec" | "ammoStock"
>;

export const DEFAULT_EXPEDITION_LOADOUT: ExpeditionDefaults = {
  carrierCapacity: 2,
  maxOperationTimeSec: 180,
  ammoStock: 28,
};

export function stockFromContainers(containers: number): number {
  return Math.max(0, Math.floor(containers)) * PIECES_PER_CONTAINER;
}

export function createExpeditionState(
  partial?: Partial<PlayerExpeditionState>,
): PlayerExpeditionState {
  return {
    carrierCapacity: DEFAULT_EXPEDITION_LOADOUT.carrierCapacity,
    maxOperationTimeSec: DEFAULT_EXPEDITION_LOADOUT.maxOperationTimeSec,
    ammoStock: DEFAULT_EXPEDITION_LOADOUT.ammoStock,
    isExtracted: false,
    salvagedContainers: 0,
    totalStockPieces: 0,
    yieldFood: 0,
    yieldMaterial: 0,
    yieldEnergy: 0,
    scrapLossCount: 0,
    craftMultiplier: 1,
    credits: 0,
    avatarDirtLevel: 0,
    ...partial,
  };
}

/** Explore module export boundary (sort input core). */
export type ExploreResult = Pick<
  PlayerExpeditionState,
  | "carrierCapacity"
  | "maxOperationTimeSec"
  | "ammoStock"
  | "isExtracted"
  | "salvagedContainers"
  | "totalStockPieces"
>;

/** Sort module refine result written back toward trade. */
export interface CraftingPuzzleResult {
  yieldFood: number;
  yieldMaterial: number;
  yieldEnergy: number;
  scrapLossCount: number;
  craftMultiplier: number;
  recipeAccuracy?: number;
  stabilizationScore?: number;
  totalTilesCleared?: number;
  finalQualityRank?: "Standard" | "Superior" | "Masterwork";
}

export function applyPuzzleResult(
  state: PlayerExpeditionState,
  result: CraftingPuzzleResult,
): PlayerExpeditionState {
  return {
    ...state,
    yieldFood: result.yieldFood,
    yieldMaterial: result.yieldMaterial,
    yieldEnergy: result.yieldEnergy,
    scrapLossCount: result.scrapLossCount,
    craftMultiplier: result.craftMultiplier,
  };
}

export function puzzleInputFromExpedition(
  state: Pick<
    PlayerExpeditionState,
    "salvagedContainers" | "totalStockPieces" | "isExtracted"
  >,
): {
  salvagedContainers: number;
  totalStockPieces: number;
  isExtracted: boolean;
} {
  const containers = Math.max(0, Math.floor(state.salvagedContainers));
  return {
    salvagedContainers: containers,
    totalStockPieces:
      state.totalStockPieces > 0
        ? Math.floor(state.totalStockPieces)
        : stockFromContainers(containers),
    isExtracted: Boolean(state.isExtracted),
  };
}
