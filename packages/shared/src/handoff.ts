import { MODULE_URLS, PIECES_PER_CONTAINER } from "./constants";
import type { CraftingPuzzleResult } from "./expedition";
import {
  encodeYieldBagCompact,
  parseYieldBagCompact,
  yieldBagFromClearedWithMultiplier,
  type YieldBag,
} from "./sort-yield";
import {
  filterToDeployableIds,
  selectDeployableInstanceIds,
  type OwnedMech,
  type SortieReturnKind,
} from "./mech-fleet";

/** explore → sort */
export type ExploreToSortPayload = {
  salvagedContainers: number;
  totalStockPieces: number;
  isExtracted: boolean;
};

/** sort → trade
 *
 * v1: importMaterials + craftMultiplier
 * v2 (additive): yieldBag of typed basic materials / parts for repair.
 */
export type SortToTradePayload = {
  importMaterials: number;
  craftMultiplier: number;
  /** Yield v2: typed bag (omit for v1-compatible handoff). */
  yieldBag?: YieldBag;
};

/**
 * trade → explore
 *
 * v1: deployableMechs count + startingAmmo
 * v2 (additive): deployedInstanceIds of 健在 mechs only.
 * When ids are present, deployableMechs should match ids.length (builders enforce this).
 */
export type TradeToExplorePayload = {
  deployableMechs: number;
  startingAmmo: number;
  /** Operational owned-mech instance ids committed to this sortie. */
  deployedInstanceIds?: string[];
};

/** explore → hub wear return (salvage still goes explore → sort). */
export type ExploreToHubWearPayload = {
  returnKind: SortieReturnKind;
  mechWear: Array<{ instanceId: string; durabilityAfter: number }>;
};

const SORTIE_RETURN_KINDS: readonly SortieReturnKind[] = [
  "extract",
  "fail",
  "abort",
];

function isSortieReturnKind(value: string): value is SortieReturnKind {
  return (SORTIE_RETURN_KINDS as readonly string[]).includes(value);
}

function encodeInstanceIds(ids: readonly string[]): string {
  return ids
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .join(",");
}

function parseInstanceIds(raw: string | null): string[] {
  if (raw == null || raw.trim() === "") return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function encodeMechWearCompact(
  wear: ExploreToHubWearPayload["mechWear"],
): string {
  return wear
    .map(
      (w) =>
        `${w.instanceId.trim()}:${Math.max(0, Math.floor(w.durabilityAfter))}`,
    )
    .filter((s) => !s.startsWith(":"))
    .join(";");
}

function parseMechWearCompact(
  raw: string | null,
): ExploreToHubWearPayload["mechWear"] {
  if (raw == null || raw.trim() === "") return [];
  const out: ExploreToHubWearPayload["mechWear"] = [];
  const seen = new Set<string>();
  for (const part of raw.split(";")) {
    const chunk = part.trim();
    if (!chunk) continue;
    const colon = chunk.lastIndexOf(":");
    if (colon <= 0) continue;
    const instanceId = chunk.slice(0, colon).trim();
    const durabilityAfter = Number.parseInt(chunk.slice(colon + 1), 10);
    if (!instanceId || !Number.isFinite(durabilityAfter) || seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    out.push({
      instanceId,
      durabilityAfter: Math.max(0, durabilityAfter),
    });
  }
  return out;
}

/**
 * Build trade→explore payload from hangar fleet.
 * Only 健在 mechs are included; needs_repair / destroyed are excluded.
 */
export function buildTradeToExplorePayloadFromFleet(
  fleet: readonly OwnedMech[],
  startingAmmo: number,
  requestedInstanceIds?: readonly string[],
): TradeToExplorePayload {
  const deployedInstanceIds =
    requestedInstanceIds != null
      ? filterToDeployableIds(fleet, requestedInstanceIds)
      : selectDeployableInstanceIds(fleet);
  return {
    deployableMechs: deployedInstanceIds.length,
    startingAmmo: Math.max(0, Math.floor(startingAmmo)),
    deployedInstanceIds,
  };
}

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
  if (payload.yieldBag != null) {
    const encoded = encodeYieldBagCompact(payload.yieldBag);
    if (encoded) u.searchParams.set("yieldBag", encoded);
  }
  return u.toString();
}

/**
 * Build sort→trade payload from puzzle result.
 * Uses result.yieldBag when present; otherwise derives from yield* counts.
 */
export function buildSortToTradePayloadFromResult(
  result: Pick<
    CraftingPuzzleResult,
    | "yieldFood"
    | "yieldMaterial"
    | "yieldEnergy"
    | "craftMultiplier"
    | "yieldBag"
  >,
): SortToTradePayload {
  const craftMultiplier = Number(result.craftMultiplier) || 1;
  const yieldBag =
    result.yieldBag != null
      ? result.yieldBag
      : yieldBagFromClearedWithMultiplier(
          {
            food: result.yieldFood,
            material: result.yieldMaterial,
            energy: result.yieldEnergy,
          },
          craftMultiplier,
        );
  const payload: SortToTradePayload = {
    importMaterials: importedMaterialsFromResult(result),
    craftMultiplier,
  };
  if (Object.keys(yieldBag).length > 0) {
    payload.yieldBag = yieldBag;
  }
  return payload;
}

export function buildSortToTradeUrlFromResult(
  result: Pick<
    CraftingPuzzleResult,
    | "yieldFood"
    | "yieldMaterial"
    | "yieldEnergy"
    | "craftMultiplier"
    | "yieldBag"
  >,
  baseUrl: string = MODULE_URLS.trade,
): string {
  return buildSortToTradeUrl(buildSortToTradePayloadFromResult(result), baseUrl);
}

export function parseSortToTradeSearch(
  search: string,
): SortToTradePayload | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  if (
    !p.has("importMaterials") &&
    !p.has("craftMultiplier") &&
    !p.has("yieldBag")
  ) {
    return null;
  }
  const payload: SortToTradePayload = {
    importMaterials: parseNonNegInt(p.get("importMaterials"), 0),
    craftMultiplier: Number.parseFloat(p.get("craftMultiplier") ?? "1") || 1,
  };
  const bag = parseYieldBagCompact(p.get("yieldBag"));
  if (Object.keys(bag).length > 0) {
    payload.yieldBag = bag;
  }
  return payload;
}

export function buildTradeToExploreUrl(
  payload: TradeToExplorePayload,
  baseUrl: string = MODULE_URLS.explore,
): string {
  const u = new URL(baseUrl);
  const ids =
    payload.deployedInstanceIds != null
      ? payload.deployedInstanceIds
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      : [];
  const deployableMechs =
    ids.length > 0
      ? ids.length
      : Math.max(0, Math.floor(payload.deployableMechs));
  u.searchParams.set("deployableMechs", String(deployableMechs));
  u.searchParams.set(
    "startingAmmo",
    String(Math.max(0, Math.floor(payload.startingAmmo))),
  );
  if (ids.length > 0) {
    u.searchParams.set("deployedInstanceIds", encodeInstanceIds(ids));
  }
  return u.toString();
}

export function parseTradeToExploreSearch(
  search: string,
): TradeToExplorePayload | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  if (
    !p.has("deployableMechs") &&
    !p.has("startingAmmo") &&
    !p.has("deployedInstanceIds")
  ) {
    return null;
  }
  const deployedInstanceIds = parseInstanceIds(p.get("deployedInstanceIds"));
  const deployableMechs =
    deployedInstanceIds.length > 0
      ? deployedInstanceIds.length
      : parseNonNegInt(p.get("deployableMechs"), 0);
  const payload: TradeToExplorePayload = {
    deployableMechs,
    startingAmmo: parseNonNegInt(p.get("startingAmmo"), 0),
  };
  if (deployedInstanceIds.length > 0) {
    payload.deployedInstanceIds = deployedInstanceIds;
  }
  return payload;
}

export function buildExploreToHubWearUrl(
  payload: ExploreToHubWearPayload,
  baseUrl: string = MODULE_URLS.trade,
): string {
  const u = new URL(baseUrl);
  u.searchParams.set("returnKind", payload.returnKind);
  u.searchParams.set("mechWear", encodeMechWearCompact(payload.mechWear));
  return u.toString();
}

export function parseExploreToHubWearSearch(
  search: string,
): ExploreToHubWearPayload | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  if (!p.has("returnKind") && !p.has("mechWear")) return null;
  const kindRaw = (p.get("returnKind") ?? "").trim();
  if (!isSortieReturnKind(kindRaw)) return null;
  return {
    returnKind: kindRaw,
    mechWear: parseMechWearCompact(p.get("mechWear")),
  };
}

/** Compact wear list from full MechWearReport-like rows. */
export function toExploreToHubWearPayload(
  returnKind: SortieReturnKind,
  mechWear: readonly { instanceId: string; durabilityAfter: number }[],
): ExploreToHubWearPayload {
  return {
    returnKind,
    mechWear: mechWear.map((w) => ({
      instanceId: w.instanceId,
      durabilityAfter: Math.max(0, Math.floor(w.durabilityAfter)),
    })),
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
