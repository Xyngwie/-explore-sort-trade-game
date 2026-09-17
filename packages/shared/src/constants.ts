/** Canonical preview hosts during the split-.grok.me phase. */
export const MODULE_URLS = {
  explore: "https://blend-honey-branch-scarlet.grok.me",
  sort: "https://brush-green-zinc-crystal.grok.me",
  trade: "https://mist-river-velvet-drum.grok.me",
} as const;

export type ModuleKey = keyof typeof MODULE_URLS;

export const PIECES_PER_CONTAINER = 25;

export const HUB_SAVE_STORAGE_KEY = "wreckline.hubSave.v1";

export const HANDOFF_QUERY_KEYS = {
  exploreToSort: ["salvagedContainers", "totalStockPieces", "isExtracted"] as const,
  sortToTrade: ["importMaterials", "craftMultiplier", "yieldBag"] as const,
  tradeToExplore: [
    "deployableMechs",
    "startingAmmo",
    "deployedInstanceIds",
  ] as const,
  exploreToHubWear: ["returnKind", "mechWear"] as const,
};
