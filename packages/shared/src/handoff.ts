import {
  PIECES_PER_CONTAINER,
  resolveModuleBaseUrl,
} from "./constants";
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
import {
  encodeCircuitBoardCompact,
  isCircuitOutcome,
  parseCircuitBoardCompact,
  sanitizeEditorName,
  type CircuitBoardState,
  type CircuitOutcome,
} from "./circuit-board";
import {
  encodeCircuitBonusesCompact,
  parseCircuitBonusesCompact,
  type AggregatedCircuitBonuses,
} from "./circuit-bonuses";

/** explore → sort */
export type ExploreToSortPayload = {
  salvagedContainers: number;
  totalStockPieces: number;
  isExtracted: boolean;
  /**
   * Optional hub circuit craft multiplier (typically 1.0–1.25).
   * From deploy circuitBonuses or explicit ?craftMultiplier= (testing).
   * Omitted / unset → sort uses 1.0.
   */
  craftMultiplier?: number;
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
  /**
   * Sort skip-with-cargo: deposit inbound containers into Hub 未開封 stock.
   * Additive — omit / 0 → no stock change. Zero-yield handoff otherwise.
   */
  depositUnopenedContainers?: number;
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
  /**
   * Optional durability snapshot at deploy time (same compact shape as mechWear).
   * Lets explore compute durabilityAfter from real hub values instead of assuming 100.
   */
  deployedDurability?: Array<{ instanceId: string; durability: number }>;
  /**
   * Optional hub circuit outcome bonuses (aggregateCircuitBonuses).
   * Explore consumes durabilityBuffer on wear; craft/repair are informational on sortie.
   */
  circuitBonuses?: Pick<
    AggregatedCircuitBonuses,
    "craftMultiplier" | "repairDiscount" | "durabilityBuffer"
  >;
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
  const byId = new Map(fleet.map((m) => [m.instanceId, m]));
  const deployedDurability = deployedInstanceIds.map((id) => {
    const m = byId.get(id)!;
    return { instanceId: id, durability: m.durability };
  });
  return {
    deployableMechs: deployedInstanceIds.length,
    startingAmmo: Math.max(0, Math.floor(startingAmmo)),
    deployedInstanceIds,
    deployedDurability,
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

export function normalizeCraftMultiplier(raw: unknown, fallback = 1): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function buildExploreToSortUrl(
  payload: ExploreToSortPayload,
  baseUrl: string = resolveModuleBaseUrl("sort"),
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
  if (payload.craftMultiplier != null) {
    const m = normalizeCraftMultiplier(payload.craftMultiplier, 1);
    if (m !== 1) {
      u.searchParams.set("craftMultiplier", m.toFixed(3));
    }
  }
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
  // Precedence: explicit craftMultiplier > circuitBonuses compact craft > omit (sort defaults 1).
  let craftMultiplier: number | undefined;
  if (p.has("craftMultiplier")) {
    craftMultiplier = normalizeCraftMultiplier(p.get("craftMultiplier"), 1);
  } else if (p.has("circuitBonuses")) {
    const bon = parseCircuitBonusesCompact(p.get("circuitBonuses"));
    if (bon.craftMultiplier > 1) craftMultiplier = bon.craftMultiplier;
  }
  return {
    salvagedContainers,
    totalStockPieces,
    isExtracted: parseLooseBool(p.get("isExtracted"), false),
    ...(craftMultiplier != null ? { craftMultiplier } : {}),
  };
}

export function buildSortToTradeUrl(
  payload: SortToTradePayload,
  baseUrl: string = resolveModuleBaseUrl("trade"),
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
  const deposit = Math.max(
    0,
    Math.floor(Number(payload.depositUnopenedContainers) || 0),
  );
  if (deposit > 0) {
    u.searchParams.set("depositUnopenedContainers", String(deposit));
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
  baseUrl: string = resolveModuleBaseUrl("trade"),
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
    !p.has("yieldBag") &&
    !p.has("depositUnopenedContainers")
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
  if (p.has("depositUnopenedContainers")) {
    const deposit = parseNonNegInt(p.get("depositUnopenedContainers"), 0);
    if (deposit > 0) payload.depositUnopenedContainers = deposit;
  }
  return payload;
}

export function buildTradeToExploreUrl(
  payload: TradeToExplorePayload,
  baseUrl: string = resolveModuleBaseUrl("explore"),
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
  const durability =
    payload.deployedDurability != null
      ? payload.deployedDurability
          .filter((d) => d.instanceId.trim().length > 0)
          .map((d) => ({
            instanceId: d.instanceId.trim(),
            durabilityAfter: Math.max(0, Math.floor(d.durability)),
          }))
      : [];
  if (durability.length > 0) {
    // Reuse mechWear compact encoding (id:n;id:n).
    u.searchParams.set("mechDurability", encodeMechWearCompact(durability));
  }
  if (payload.circuitBonuses != null) {
    const enc = encodeCircuitBonusesCompact(payload.circuitBonuses);
    if (enc) u.searchParams.set("circuitBonuses", enc);
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
    !p.has("deployedInstanceIds") &&
    !p.has("mechDurability") &&
    !p.has("circuitBonuses")
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
  const durabilityRows = parseMechWearCompact(p.get("mechDurability"));
  if (durabilityRows.length > 0) {
    payload.deployedDurability = durabilityRows.map((r) => ({
      instanceId: r.instanceId,
      durability: r.durabilityAfter,
    }));
  }
  if (p.has("circuitBonuses")) {
    payload.circuitBonuses = parseCircuitBonusesCompact(p.get("circuitBonuses"));
  }
  return payload;
}

export function buildExploreToHubWearUrl(
  payload: ExploreToHubWearPayload,
  baseUrl: string = resolveModuleBaseUrl("trade"),
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

// ---------------------------------------------------------------------------
// Module 4 / 5 handoff KEY CONTRACTS (URL build/parse only — UI not wired)
// See docs/HANDOFF_M45_V0.md
// ---------------------------------------------------------------------------

/** trade → invade: minimal hub context. Invade remains optional. */
export type TradeToInvadePayload = {
  /** Always true when built from hub; encodes as fromHub=1. */
  fromHub: true;
  /** Optional operational mech count (display / planning — not a deploy commit). */
  deployableMechs?: number;
  /** Optional ammo snapshot for invade UI. */
  startingAmmo?: number;
};

/**
 * invade → trade: selected sector + density + optional intel flags.
 * Explicit non-goal: never carry full YieldBag / salvagedContainers.
 */
export type InvadeToTradePayload = {
  sectorX: number;
  sectorY: number;
  /** Provisional density 0..1 from sectorDensity helpers. */
  density: number;
  /** Optional short intel tokens (NOT salvage). */
  intelFlags?: string[];
};

/** Combat handoff mode from invade minesweeper → explore. */
export type EngageMode = "forced" | "raid";

/** One enemy/mine sector cell on the front map (world coords). */
export type EnemyCellCoord = { sx: number; sy: number };

/**
 * invade → explore: sector deploy context + optional engage combat handoff.
 * May coexist on explore URLs with trade→explore keys (no key collision).
 *
 * engage:
 * - `forced` — stepped a mine (punishment): focus cell + adjacent mine cells
 * - `raid` — voluntary: flagged cell selected; only that cell
 * enemyCells: compact query `sx,sy;sx,sy;...` (see encodeEnemyCells)
 */
export type InvadeToExplorePayload = {
  sectorX: number;
  sectorY: number;
  density: number;
  intelFlags?: string[];
  /** Combat mode when handing off to explore for a fight. */
  engage?: EngageMode;
  /** Enemy sector cells pulled into the fight (world coords). */
  enemyCells?: EnemyCellCoord[];
};

/** trade → restore: circuit instance id and/or compact CircuitBoardState. */
export type TradeToRestorePayload = {
  /** Hub-side circuit instance id when inventory tracks named boards. */
  circuitId?: string;
  /** Compact board for the restore session (preferred when starting a puzzle). */
  circuitBoard?: CircuitBoardState;
  /** Craft signature (署名) passed for 刻印 display / stamp on return. */
  editorName?: string;
  /** Forward Perfect Circuit lock when reopening from hub. */
  locked?: boolean;
  /** Engraved name when locked (optional; falls back to editorName). */
  lastEditorName?: string;
};

/** restore → trade: updated board + explicit outcome. */
export type RestoreToTradePayload = {
  circuitId?: string;
  circuitBoard: CircuitBoardState;
  /** Mirrors board.outcome; required for clear presence / strip keys. */
  outcome: CircuitOutcome;
  /** 刻印 — final editor name stamped into HubSave.circuits. */
  lastEditorName?: string;
  /** Perfect Circuit lock flag (URL; also mirrored onto board.locked). */
  locked?: boolean;
  /** Explicit perfect clearance flag. */
  perfect?: boolean;
};

const INTEL_FLAG_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;

function encodeIntelFlags(flags: readonly string[]): string {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of flags) {
    const t = f.trim();
    if (!INTEL_FLAG_RE.test(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.join(",");
}

function parseIntelFlags(raw: string | null): string[] {
  if (raw == null || raw.trim() === "") return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!INTEL_FLAG_RE.test(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function parseSignedInt(value: string | null, fallback: number): number {
  if (value == null || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function parseUnitFloat(value: string | null, fallback: number): number {
  if (value == null || value === "") return fallback;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

const ENGAGE_MODES = new Set<EngageMode>(["forced", "raid"]);

export function isEngageMode(v: string): v is EngageMode {
  return ENGAGE_MODES.has(v as EngageMode);
}

/**
 * Compact enemy cell list for URL: `sx,sy;sx,sy;...`
 * Sorted, deduped; truncates to max 64 cells.
 */
export function encodeEnemyCells(cells: readonly EnemyCellCoord[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of cells) {
    if (!Number.isFinite(c.sx) || !Number.isFinite(c.sy)) continue;
    const sx = Math.trunc(c.sx);
    const sy = Math.trunc(c.sy);
    const key = `${sx},${sy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= 64) break;
  }
  out.sort((a, b) => {
    const [ax, ay] = a.split(",").map(Number);
    const [bx, by] = b.split(",").map(Number);
    return ax !== bx ? ax! - bx! : ay! - by!;
  });
  return out.join(";");
}

export function parseEnemyCells(raw: string | null): EnemyCellCoord[] {
  if (raw == null || raw.trim() === "") return [];
  const out: EnemyCellCoord[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(";")) {
    const t = part.trim();
    if (!t) continue;
    const m = /^(-?\d+),(-?\d+)$/.exec(t);
    if (!m) continue;
    const sx = Number.parseInt(m[1]!, 10);
    const sy = Number.parseInt(m[2]!, 10);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
    const key = `${sx},${sy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sx, sy });
    if (out.length >= 64) break;
  }
  return out;
}

function sectorPayloadFromParams(
  p: URLSearchParams,
): { sectorX: number; sectorY: number; density: number; intelFlags?: string[] } | null {
  if (!p.has("sectorX") && !p.has("sectorY")) return null;
  const sectorX = parseSignedInt(p.get("sectorX"), 0);
  const sectorY = parseSignedInt(p.get("sectorY"), 0);
  const density = parseUnitFloat(p.get("density"), 0);
  const intelFlags = parseIntelFlags(p.get("intelFlags"));
  const out: {
    sectorX: number;
    sectorY: number;
    density: number;
    intelFlags?: string[];
  } = { sectorX, sectorY, density };
  if (intelFlags.length > 0) out.intelFlags = intelFlags;
  return out;
}

function applySectorParams(
  u: URL,
  payload: {
    sectorX: number;
    sectorY: number;
    density: number;
    intelFlags?: string[];
  },
): void {
  u.searchParams.set("sectorX", String(Math.trunc(payload.sectorX)));
  u.searchParams.set("sectorY", String(Math.trunc(payload.sectorY)));
  u.searchParams.set(
    "density",
    Number(Math.min(1, Math.max(0, payload.density))).toFixed(3),
  );
  if (payload.intelFlags != null && payload.intelFlags.length > 0) {
    const enc = encodeIntelFlags(payload.intelFlags);
    if (enc) u.searchParams.set("intelFlags", enc);
  }
}

export function buildTradeToInvadeUrl(
  payload: TradeToInvadePayload,
  baseUrl: string = resolveModuleBaseUrl("invade"),
): string {
  const u = new URL(baseUrl);
  u.searchParams.set("fromHub", "1");
  if (payload.deployableMechs != null) {
    u.searchParams.set(
      "deployableMechs",
      String(Math.max(0, Math.floor(payload.deployableMechs))),
    );
  }
  if (payload.startingAmmo != null) {
    u.searchParams.set(
      "startingAmmo",
      String(Math.max(0, Math.floor(payload.startingAmmo))),
    );
  }
  return u.toString();
}

export function parseTradeToInvadeSearch(
  search: string,
): TradeToInvadePayload | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  if (
    !p.has("fromHub") &&
    !p.has("deployableMechs") &&
    !p.has("startingAmmo")
  ) {
    return null;
  }
  // Reject explore-style deploy commits mistaken for invade context:
  // if deployedInstanceIds present without fromHub, treat as not trade→invade.
  if (!p.has("fromHub") && p.has("deployedInstanceIds")) return null;
  const payload: TradeToInvadePayload = { fromHub: true };
  if (p.has("deployableMechs")) {
    payload.deployableMechs = parseNonNegInt(p.get("deployableMechs"), 0);
  }
  if (p.has("startingAmmo")) {
    payload.startingAmmo = parseNonNegInt(p.get("startingAmmo"), 0);
  }
  return payload;
}

export function buildInvadeToTradeUrl(
  payload: InvadeToTradePayload,
  baseUrl: string = resolveModuleBaseUrl("trade"),
): string {
  const u = new URL(baseUrl);
  applySectorParams(u, payload);
  return u.toString();
}

export function parseInvadeToTradeSearch(
  search: string,
): InvadeToTradePayload | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  return sectorPayloadFromParams(p);
}

function applyEngageParams(u: URL, payload: InvadeToExplorePayload): void {
  if (payload.engage != null && isEngageMode(payload.engage)) {
    u.searchParams.set("engage", payload.engage);
  }
  if (payload.enemyCells != null && payload.enemyCells.length > 0) {
    const enc = encodeEnemyCells(payload.enemyCells);
    if (enc) u.searchParams.set("enemyCells", enc);
  }
}

export function buildInvadeToExploreUrl(
  payload: InvadeToExplorePayload,
  baseUrl: string = resolveModuleBaseUrl("explore"),
): string {
  const u = new URL(baseUrl);
  applySectorParams(u, payload);
  applyEngageParams(u, payload);
  return u.toString();
}

export function parseInvadeToExploreSearch(
  search: string,
): InvadeToExplorePayload | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  const base = sectorPayloadFromParams(p);
  if (base == null) return null;
  const payload: InvadeToExplorePayload = { ...base };
  const engageRaw = (p.get("engage") ?? "").trim();
  if (isEngageMode(engageRaw)) payload.engage = engageRaw;
  const enemyCells = parseEnemyCells(p.get("enemyCells"));
  if (enemyCells.length > 0) payload.enemyCells = enemyCells;
  return payload;
}

/**
 * Merge invade sector context onto an existing explore URL (e.g. trade→explore).
 * Does not remove deploy keys; sets/overwrites sector* / density / intelFlags /
 * engage / enemyCells when present on the sector payload.
 */
export function mergeInvadeSectorOntoExploreUrl(
  exploreUrl: string,
  sector: InvadeToExplorePayload,
): string {
  const u = new URL(exploreUrl);
  applySectorParams(u, sector);
  applyEngageParams(u, sector);
  return u.toString();
}

export function buildTradeToRestoreUrl(
  payload: TradeToRestorePayload,
  baseUrl: string = resolveModuleBaseUrl("restore"),
): string {
  const u = new URL(baseUrl);
  if (payload.circuitId != null && payload.circuitId.trim() !== "") {
    u.searchParams.set("circuitId", payload.circuitId.trim().slice(0, 64));
  }
  if (payload.circuitBoard != null) {
    u.searchParams.set(
      "circuitBoard",
      encodeCircuitBoardCompact(payload.circuitBoard),
    );
  }
  const editor = sanitizeEditorName(payload.editorName);
  if (editor) u.searchParams.set("editorName", editor);
  const engraved = sanitizeEditorName(payload.lastEditorName);
  if (engraved) u.searchParams.set("lastEditorName", engraved);
  const locked =
    payload.locked === true || payload.circuitBoard?.locked === true;
  if (locked) u.searchParams.set("circuitLocked", "1");
  return u.toString();
}

export function parseTradeToRestoreSearch(
  search: string,
): TradeToRestorePayload | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  if (!p.has("circuitId") && !p.has("circuitBoard")) return null;
  const payload: TradeToRestorePayload = {};
  const id = (p.get("circuitId") ?? "").trim();
  if (id) payload.circuitId = id.slice(0, 64);
  const board = parseCircuitBoardCompact(p.get("circuitBoard"));
  if (board) payload.circuitBoard = board;
  const editor = sanitizeEditorName(p.get("editorName"));
  if (editor) payload.editorName = editor;
  const engraved = sanitizeEditorName(p.get("lastEditorName"));
  if (engraved) payload.lastEditorName = engraved;
  const locked =
    p.get("circuitLocked") === "1" || p.get("circuitLocked") === "true";
  if (locked) {
    payload.locked = true;
    if (payload.circuitBoard) {
      payload.circuitBoard = {
        ...payload.circuitBoard,
        locked: true,
        perfect: true,
        lastEditorName:
          engraved ??
          editor ??
          payload.circuitBoard.lastEditorName,
      };
    }
  }
  if (!payload.circuitId && !payload.circuitBoard) return null;
  return payload;
}

export function buildRestoreToTradeUrl(
  payload: RestoreToTradePayload,
  baseUrl: string = resolveModuleBaseUrl("trade"),
): string {
  const u = new URL(baseUrl);
  if (payload.circuitId != null && payload.circuitId.trim() !== "") {
    u.searchParams.set("circuitId", payload.circuitId.trim().slice(0, 64));
  }
  const board: CircuitBoardState = {
    ...payload.circuitBoard,
    outcome: payload.outcome,
  };
  u.searchParams.set("circuitBoard", encodeCircuitBoardCompact(board));
  u.searchParams.set("circuitOutcome", payload.outcome);
  const editor =
    sanitizeEditorName(payload.lastEditorName) ??
    sanitizeEditorName(payload.circuitBoard.lastEditorName);
  if (editor) u.searchParams.set("lastEditorName", editor);
  const locked = payload.locked === true || payload.circuitBoard.locked === true;
  const perfect =
    payload.perfect === true || payload.circuitBoard.perfect === true;
  if (locked) u.searchParams.set("circuitLocked", "1");
  if (perfect) u.searchParams.set("circuitPerfect", "1");
  return u.toString();
}

export function parseRestoreToTradeSearch(
  search: string,
): RestoreToTradePayload | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  if (
    !p.has("circuitBoard") &&
    !p.has("circuitOutcome") &&
    !p.has("circuitId")
  ) {
    return null;
  }
  const board = parseCircuitBoardCompact(p.get("circuitBoard"));
  const outcomeRaw = (p.get("circuitOutcome") ?? "").trim();
  const outcome: CircuitOutcome | null = isCircuitOutcome(outcomeRaw)
    ? outcomeRaw
    : board?.outcome != null && isCircuitOutcome(board.outcome)
      ? board.outcome
      : null;
  if (!board || outcome == null) return null;
  const payload: RestoreToTradePayload = {
    circuitBoard: { ...board, outcome },
    outcome,
  };
  const id = (p.get("circuitId") ?? "").trim();
  if (id) payload.circuitId = id.slice(0, 64);
  const editor =
    sanitizeEditorName(p.get("lastEditorName")) ??
    sanitizeEditorName(board.lastEditorName);
  const locked =
    p.get("circuitLocked") === "1" ||
    p.get("circuitLocked") === "true" ||
    board.locked === true;
  const perfect =
    p.get("circuitPerfect") === "1" ||
    p.get("circuitPerfect") === "true" ||
    board.perfect === true;
  let nextBoard = payload.circuitBoard;
  if (editor) {
    payload.lastEditorName = editor;
    nextBoard = { ...nextBoard, lastEditorName: editor };
  }
  if (perfect) {
    payload.perfect = true;
    nextBoard = { ...nextBoard, perfect: true };
  }
  if (locked) {
    payload.locked = true;
    nextBoard = { ...nextBoard, locked: true, perfect: true };
  }
  payload.circuitBoard = nextBoard;
  return payload;
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
