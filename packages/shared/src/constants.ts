/** Canonical preview hosts on GitHub Pages (single project site, module subpaths). */
export const MODULE_URLS = {
  explore: "https://xyngwie.github.io/-explore-sort-trade-game/explore/",
  sort: "https://xyngwie.github.io/-explore-sort-trade-game/sort/",
  trade: "https://xyngwie.github.io/-explore-sort-trade-game/",
  invade: "https://xyngwie.github.io/-explore-sort-trade-game/invade/",
  restore: "https://xyngwie.github.io/-explore-sort-trade-game/restore/",
} as const;

/** Former split-.grok.me hosts (migration / reference only). */
export const LEGACY_GROK_MODULE_URLS = {
  explore: "https://blend-honey-branch-scarlet.grok.me",
  sort: "https://brush-green-zinc-crystal.grok.me",
  trade: "https://mist-river-velvet-drum.grok.me",
} as const;

/** Local vite ports when developing the monorepo (see package vite configs). */
export const LOCAL_DEV_MODULE_URLS = {
  explore: "http://localhost:5173/",
  sort: "http://localhost:5174/",
  trade: "http://localhost:5175/",
  invade: "http://localhost:5176/",
  restore: "http://localhost:5177/",
} as const;

export type ModuleKey = keyof typeof MODULE_URLS;

/**
 * Prefer localhost vite URLs when the page is served from localhost / 127.0.0.1.
 * Falls back to MODULE_URLS (GitHub Pages) otherwise.
 *
 * Optional overrides (forks / custom hosts): pass `overrides`, or pass an
 * explicit `baseUrl` to handoff URL builders.
 */
export function resolveModuleBaseUrl(
  key: ModuleKey,
  opts?: {
    hostname?: string | null;
    overrides?: Partial<Record<ModuleKey, string>>;
  },
): string {
  const fromOverride = opts?.overrides?.[key]?.trim();
  if (fromOverride) return fromOverride;

  const host =
    opts?.hostname ??
    (typeof globalThis !== "undefined" &&
    typeof (globalThis as { location?: { hostname?: string } }).location ===
      "object" &&
    (globalThis as { location?: { hostname?: string } }).location
      ? (globalThis as { location: { hostname: string } }).location.hostname
      : null);
  if (host === "localhost" || host === "127.0.0.1") {
    return LOCAL_DEV_MODULE_URLS[key];
  }
  return MODULE_URLS[key];
}

export const PIECES_PER_CONTAINER = 25;

export const HUB_SAVE_STORAGE_KEY = "wreckline.hubSave.v1";

export const HANDOFF_QUERY_KEYS = {
  exploreToSort: ["salvagedContainers", "totalStockPieces", "isExtracted"] as const,
  sortToTrade: ["importMaterials", "craftMultiplier", "yieldBag"] as const,
  tradeToExplore: [
    "deployableMechs",
    "startingAmmo",
    "deployedInstanceIds",
    "mechDurability",
    "circuitBonuses",
  ] as const,
  exploreToHubWear: ["returnKind", "mechWear"] as const,
  /** Module 4: hub → invade (minimal context; invade optional). */
  tradeToInvade: ["fromHub", "deployableMechs", "startingAmmo"] as const,
  /** Module 4: invade → hub (sector/intel only — never YieldBag). */
  invadeToTrade: ["sectorX", "sectorY", "density", "intelFlags"] as const,
  /** Module 4: invade → explore (sector + optional engage combat handoff). */
  invadeToExplore: [
    "sectorX",
    "sectorY",
    "density",
    "intelFlags",
    "engage",
    "enemyCells",
  ] as const,
  /** Module 5: hub → restore (circuit instance + compact board). */
  tradeToRestore: ["circuitId", "circuitBoard"] as const,
  /** Module 5: restore → hub (updated board + outcome). */
  restoreToTrade: ["circuitId", "circuitBoard", "circuitOutcome"] as const,
};
