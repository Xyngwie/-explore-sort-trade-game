/** Provisional URL-query handoff contracts (separate .grok.me origins). */

export type ExploreToSortQuery = {
  salvagedContainers: number;
  totalStockPieces: number;
  isExtracted: boolean;
};

export type SortToTradeQuery = {
  importMaterials: number;
  craftMultiplier: number;
};

export type TradeToExploreQuery = {
  deployableMechs: number;
  startingAmmo: number;
};

export function importedMaterialsFromYields(input: {
  yieldFood: number;
  yieldMaterial: number;
  yieldEnergy: number;
  craftMultiplier: number;
}): number {
  const raw = input.yieldFood + input.yieldMaterial + input.yieldEnergy;
  return Math.floor(raw * input.craftMultiplier);
}
