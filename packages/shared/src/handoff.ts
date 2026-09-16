import { MODULE_URLS, PIECES_PER_CONTAINER } from "./constants";
import type { CraftingPuzzleResult } from "./expedition";

/** explore → sort */
export type ExploreToSortPayload = {
  salvagedContainers: number;
  totalStockPieces: number;
  isExtracted: boolean;
};

/** sort → trade */
export type SortToTradePayload = {
  importMaterials: number;
  craftMultiplier: number;
};

/** trade → explore */
export type TradeToExplorePayload = {
  deployableMechs: number;
  startingAmmo: number;
};

export function importedMaterialsFromResult(
  result: Pick<
    CraftingPuzzleResult,
    "yieldFood" | "yieldMaterial" | "yieldEnergy" | "craftMultiplier"
  >,
): number {
  const refined =
    result.yieldFood + result.yieldMaterial + result.yieldEnergy;
  return Math.max(0, Math.floor(refined * result.craftMultiplier));
}

function parseNonNegInt(value: string | null, fallback: number): number {
  if (value == null || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function parseLooseBool(value: string | null, fallback = false): boolean {
  if (value == null || value === "") return fallback;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

export function buildExploreToSortUrl(
  payload: ExploreToSortPayload,
  baseUrl: string = MODULE_URLS.sort,
): string {
  const u = new URL(baseUrl);
  const containers = Math.max(0, Math.floor(payload.salvagedContainers));
  const stock =
    payload.totalStockPieces > 0
      ? Math.floor(payload.totalStockPieces)
      : containers * PIECES_PER_CONTAINER;
  u.searchParams.set("salvagedContainers", String(containers));
  u.searchParams.set("totalStockPieces", String(stock));
  u.searchParams.set("isExtracted", payload.isExtracted ? "1" : "0");
  return u.toString();
}

export function parseExploreToSortSearch(
  search: string,
): ExploreToSortPayload | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  if (
    !p.has("salvagedContainers") &&
    !p.has("totalStockPieces") &&
    !p.has("isExtracted")
  ) {
    return null;
  }
  const salvagedContainers = parseNonNegInt(p.get("salvagedContainers"), 0);
  const stockParam = p.get("totalStockPieces");
  const totalStockPieces =
    stockParam == null || stockParam === ""
      ? salvagedContainers * PIECES_PER_CONTAINER
      : parseNonNegInt(stockParam, 0);
  return {
    salvagedContainers,
    totalStockPieces,
    isExtracted: parseLooseBool(p.get("isExtracted"), false),
  };
}

export function buildSortToTradeUrl(
  payload: SortToTradePayload,
  baseUrl: string = MODULE_URLS.trade,
): string {
  const u = new URL(baseUrl);
  u.searchParams.set(
    "importMaterials",
    String(Math.max(0, Math.floor(payload.importMaterials))),
  );
  u.searchParams.set(
    "craftMultiplier",
    Number(payload.craftMultiplier).toFixed(3),
  );
  return u.toString();
}

export function buildSortToTradeUrlFromResult(
  result: Pick<
    CraftingPuzzleResult,
    "yieldFood" | "yieldMaterial" | "yieldEnergy" | "craftMultiplier"
  >,
  baseUrl: string = MODULE_URLS.trade,
): string {
  return buildSortToTradeUrl(
    {
      importMaterials: importedMaterialsFromResult(result),
      craftMultiplier: result.craftMultiplier,
    },
    baseUrl,
  );
}

export function parseSortToTradeSearch(
  search: string,
): SortToTradePayload | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  if (!p.has("importMaterials") && !p.has("craftMultiplier")) return null;
  return {
    importMaterials: parseNonNegInt(p.get("importMaterials"), 0),
    craftMultiplier: Number.parseFloat(p.get("craftMultiplier") ?? "1") || 1,
  };
}

export function buildTradeToExploreUrl(
  payload: TradeToExplorePayload,
  baseUrl: string = MODULE_URLS.explore,
): string {
  const u = new URL(baseUrl);
  u.searchParams.set(
    "deployableMechs",
    String(Math.max(0, Math.floor(payload.deployableMechs))),
  );
  u.searchParams.set(
    "startingAmmo",
    String(Math.max(0, Math.floor(payload.startingAmmo))),
  );
  return u.toString();
}

export function parseTradeToExploreSearch(
  search: string,
): TradeToExplorePayload | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  if (!p.has("deployableMechs") && !p.has("startingAmmo")) return null;
  return {
    deployableMechs: parseNonNegInt(p.get("deployableMechs"), 0),
    startingAmmo: parseNonNegInt(p.get("startingAmmo"), 0),
  };
}

/** Map hub deployableMechs → explore wingman count (leader always present). */
export function wingmanCountFromMechs(deployableMechs: number): number {
  const n = Math.floor(deployableMechs);
  return Math.max(0, Math.min(2, n - 1));
}

export function stripHandoffParams(
  url: string | URL,
  keys: readonly string[],
): string {
  const u = typeof url === "string" ? new URL(url, "https://example.invalid") : new URL(url.toString());
  for (const key of keys) u.searchParams.delete(key);
  const qs = u.searchParams.toString();
  // If caller passed a relative path-only string, preserve path+query+hash
  if (typeof url === "string" && url.startsWith("/")) {
    return u.pathname + (qs ? `?${qs}` : "") + u.hash;
  }
  if (typeof url === "string" && !/^https?:/i.test(url) && url.includes("?")) {
    return u.pathname + (qs ? `?${qs}` : "") + u.hash;
  }
  return u.pathname + (qs ? `?${qs}` : "") + u.hash;
}
