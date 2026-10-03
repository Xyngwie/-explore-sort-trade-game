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

/** Hub purchase price for one 未開封コンテナ (provisional / 仮). */
export const UNOPENED_CONTAINER_PRICE_CREDITS = 15;

/**
 * HubSave storage key (HubSave v3 payload). Split from the legacy key so an
 * old build tab (which only knows v1/v2) never overwrites a v3 save.
 * See docs/HUB_SAVE_CONTRACT.md §12 / docs/CIRCUIT_DATA_MODEL_V0.md §3.2.
 */
export const HUB_SAVE_STORAGE_KEY = "wreckline.hubSave.v3";

/**
 * Legacy HubSave key (payload v1 / v2). Read-only fallback when the v3 key is
 * absent; never written or deleted by v3 code (kept as a backup), except by
 * the explicit reset (`clearHubSaveFromLocalStorage`).
 */
export const HUB_SAVE_LEGACY_STORAGE_KEY = "wreckline.hubSave.v1";

/** Unreadable save text is copied to `<prefix><ISO>` before anything can overwrite it. */
export const HUB_SAVE_CORRUPT_KEY_PREFIX = "wreckline.hubSave.corrupt.";

/** Hangar craft signature (署名) — engraved as circuit lastEditorName. */
export const CRAFT_SIGNATURE_STORAGE_KEY = "wreckline.craftSignature.v0";

export const HANDOFF_QUERY_KEYS = {
  exploreToSort: ["salvagedContainers", "totalStockPieces", "isExtracted", "craftMultiplier", "circuitBonuses"] as const,
  sortToTrade: ["importMaterials", "craftMultiplier", "yieldBag", "depositUnopenedContainers"] as const,
  tradeToExplore: [
    "deployableMechs",
    "startingAmmo",
    "deployedInstanceIds",
    "mechCurrentAmmo",
    "mechDurability",
    "circuitBonuses",
    /** Optional (HubSave v3 / CIRCUIT_DATA_MODEL_V0 §4): per-mech equipped circuits. */
    "mechCircuits",
  ] as const,
  exploreToHubWear: ["returnKind", "mechWear", "mechCurrentAmmo", "recoveredLostMechInstanceIds"] as const,
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
  /** Module 5: hub → restore (circuit instance + compact board + editor name). */
  tradeToRestore: [
    "circuitId",
    "circuitBoard",
    "editorName",
    "circuitLocked",
    "lastEditorName",
  ] as const,
  /** Module 5: restore → hub (updated board + outcome + 刻印). */
  restoreToTrade: [
    "circuitId",
    "circuitBoard",
    "circuitOutcome",
    "lastEditorName",
    "circuitLocked",
    "circuitPerfect",
  ] as const,
};
