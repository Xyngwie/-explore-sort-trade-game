/** Shared player / expedition state across explore → sort → trade. */
export interface PlayerExpeditionState {
  carrierCapacity: number;
  maxOperationTimeSec: number;
  ammoStock: number;

  isExtracted: boolean;
  salvagedContainers: number;
  totalStockPieces: number;

  yieldFood: number;
  yieldMaterial: number;
  yieldEnergy: number;
  scrapLossCount: number;
  craftMultiplier: number;

  credits: number;
  avatarDirtLevel: number;
}

export const PIECES_PER_CONTAINER = 25;

export function stockFromContainers(containers: number): number {
  return Math.max(0, Math.floor(containers)) * PIECES_PER_CONTAINER;
}
