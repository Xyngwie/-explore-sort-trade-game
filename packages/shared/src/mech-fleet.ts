/**
 * Persistent owned-mech fleet (hangar) — catalog MechId is the template;
 * OwnedMech is the persisted instance with durability / status.
 *
 * Status JP labels (docs / UI): operational=健在, needs_repair=要修理, destroyed=大破.
 */

import { isMechId, type MechId } from "./catalog";

export const MECH_STATUSES = [
  "operational",
  "needs_repair",
  "destroyed",
] as const;
export type MechStatus = (typeof MECH_STATUSES)[number];

/** Japanese display labels for UI / docs. */
export const MECH_STATUS_LABEL_JA: Record<MechStatus, string> = {
  operational: "健在",
  needs_repair: "要修理",
  destroyed: "大破",
};

export type OwnedMech = {
  /** Stable instance id within a hub save (not a catalog id). */
  instanceId: string;
  /** Catalog template. */
  catalogId: MechId;
  status: MechStatus;
  /** Current durability points (0 .. durabilityMax). */
  durability: number;
  durabilityMax: number;
};

/** Provisional balance — tune later; documented in docs/MECH_FLEET.md. */
export const MECH_FLEET_RULES = {
  defaultDurabilityMax: 100,
  /** Durability above this (exclusive of 0 floor) stays / becomes 健在 after clamp. */
  operationalMinDurability: 41,
  /** 1..operationalMinDurability-1 → 要修理; 0 → 大破. */
  /** Wear applied on return from a sortie (per deployed instance). */
  wearOnExtract: 15,
  wearOnFail: 35,
  wearOnAbort: 20,
  /** Repair (要修理 → 健在, full durability). 大破は修理不可. */
  repairCredits: 50,
  repairMaterials: 30,
  /** Scrap yields by status (base; gen2 gets a small bonus). */
  scrapByStatus: {
    operational: { credits: 40, materials: 15 },
    needs_repair: { credits: 20, materials: 10 },
    destroyed: { credits: 10, materials: 5 },
  },
  gen2ScrapBonus: { credits: 10, materials: 5 },
} as const;

export type SortieReturnKind = "extract" | "fail" | "abort";

export type RepairCost = {
  credits: number;
  materials: number;
};

export type ScrapYield = {
  credits: number;
  materials: number;
};

export function isMechStatus(value: string): value is MechStatus {
  return (MECH_STATUSES as readonly string[]).includes(value);
}

export function statusFromDurability(
  durability: number,
  rules: typeof MECH_FLEET_RULES = MECH_FLEET_RULES,
): MechStatus {
  const d = Math.max(0, Math.floor(durability));
  if (d <= 0) return "destroyed";
  if (d < rules.operationalMinDurability) return "needs_repair";
  return "operational";
}

export function syncMechStatus(mech: OwnedMech): OwnedMech {
  const durability = Math.max(
    0,
    Math.min(mech.durabilityMax, Math.floor(mech.durability)),
  );
  return {
    ...mech,
    durability,
    status: statusFromDurability(durability),
  };
}

export function canDeploy(mech: OwnedMech): boolean {
  return mech.status === "operational" && mech.durability > 0;
}

export function countDeployable(fleet: readonly OwnedMech[]): number {
  return fleet.reduce((n, m) => n + (canDeploy(m) ? 1 : 0), 0);
}

let instanceSeq = 0;

/** Deterministic-ish id for tests; pass `id` to pin. */
export function createOwnedMech(
  catalogId: MechId,
  opts?: { instanceId?: string; durability?: number; durabilityMax?: number },
): OwnedMech {
  const durabilityMax =
    opts?.durabilityMax ?? MECH_FLEET_RULES.defaultDurabilityMax;
  const durability =
    opts?.durability != null
      ? Math.max(0, Math.min(durabilityMax, Math.floor(opts.durability)))
      : durabilityMax;
  instanceSeq += 1;
  const instanceId =
    opts?.instanceId ??
    `owned_${catalogId}_${Date.now().toString(36)}_${instanceSeq}`;
  return syncMechStatus({
    instanceId,
    catalogId,
    status: "operational",
    durability,
    durabilityMax,
  });
}

export function wearAfterSortie(
  mech: OwnedMech,
  kind: SortieReturnKind,
  rules: typeof MECH_FLEET_RULES = MECH_FLEET_RULES,
): OwnedMech {
  if (mech.status === "destroyed") return syncMechStatus(mech);
  const wear =
    kind === "extract"
      ? rules.wearOnExtract
      : kind === "fail"
        ? rules.wearOnFail
        : rules.wearOnAbort;
  return syncMechStatus({
    ...mech,
    durability: mech.durability - wear,
  });
}

/** Apply the same return kind to every deployed instance id present in fleet. */
export function wearFleetAfterSortie(
  fleet: readonly OwnedMech[],
  deployedInstanceIds: readonly string[],
  kind: SortieReturnKind,
): OwnedMech[] {
  const set = new Set(deployedInstanceIds);
  return fleet.map((m) => (set.has(m.instanceId) ? wearAfterSortie(m, kind) : m));
}

export function repairCost(
  mech: OwnedMech,
  rules: typeof MECH_FLEET_RULES = MECH_FLEET_RULES,
): RepairCost | null {
  if (mech.status !== "needs_repair") return null;
  return {
    credits: rules.repairCredits,
    materials: rules.repairMaterials,
  };
}

export function canAffordRepair(
  mech: OwnedMech,
  wallet: { credits: number; materials: number },
): boolean {
  const cost = repairCost(mech);
  if (!cost) return false;
  return wallet.credits >= cost.credits && wallet.materials >= cost.materials;
}

/**
 * Spend cost and restore to full 健在. Returns null if not 要修理 or cannot afford.
 * Does not mutate inputs.
 */
export function applyRepair(
  mech: OwnedMech,
  wallet: { credits: number; materials: number },
): { mech: OwnedMech; wallet: { credits: number; materials: number } } | null {
  const cost = repairCost(mech);
  if (!cost) return null;
  if (wallet.credits < cost.credits || wallet.materials < cost.materials) {
    return null;
  }
  return {
    mech: syncMechStatus({
      ...mech,
      durability: mech.durabilityMax,
    }),
    wallet: {
      credits: wallet.credits - cost.credits,
      materials: wallet.materials - cost.materials,
    },
  };
}

export function scrapYield(
  mech: OwnedMech,
  rules: typeof MECH_FLEET_RULES = MECH_FLEET_RULES,
): ScrapYield {
  const base = rules.scrapByStatus[mech.status];
  const bonus =
    mech.catalogId === "mech_gen2"
      ? rules.gen2ScrapBonus
      : { credits: 0, materials: 0 };
  return {
    credits: base.credits + bonus.credits,
    materials: base.materials + bonus.materials,
  };
}

/**
 * Remove mech from fleet and credit scrap. Returns null if instance missing.
 */
export function applyScrap(
  fleet: readonly OwnedMech[],
  instanceId: string,
  wallet: { credits: number; materials: number },
): {
  fleet: OwnedMech[];
  wallet: { credits: number; materials: number };
  yielded: ScrapYield;
} | null {
  const idx = fleet.findIndex((m) => m.instanceId === instanceId);
  if (idx < 0) return null;
  const mech = fleet[idx]!;
  const yielded = scrapYield(mech);
  const nextFleet = fleet.filter((_, i) => i !== idx);
  return {
    fleet: nextFleet,
    wallet: {
      credits: wallet.credits + yielded.credits,
      materials: wallet.materials + yielded.materials,
    },
    yielded,
  };
}

/** Migrate legacy hub fleet entries (catalog ids) into owned instances. */
export function migrateLegacyFleetIds(
  legacy: readonly unknown[],
  maxMechs: number,
): OwnedMech[] {
  const out: OwnedMech[] = [];
  for (const raw of legacy) {
    if (out.length >= maxMechs) break;
    if (typeof raw === "string" && isMechId(raw)) {
      out.push(
        createOwnedMech(raw, {
          instanceId: `migrated_${raw}_${out.length + 1}`,
        }),
      );
      continue;
    }
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      const normalized = normalizeOwnedMech(o);
      if (normalized) out.push(normalized);
    }
  }
  return out;
}

export function normalizeOwnedMech(
  raw: Partial<OwnedMech> | Record<string, unknown> | null | undefined,
): OwnedMech | null {
  if (!raw || typeof raw !== "object") return null;
  const catalogRaw =
    typeof raw.catalogId === "string"
      ? raw.catalogId
      : typeof (raw as { mechId?: unknown }).mechId === "string"
        ? String((raw as { mechId: string }).mechId)
        : "";
  if (!isMechId(catalogRaw)) return null;
  const durabilityMaxRaw = Number(
    (raw as OwnedMech).durabilityMax ?? MECH_FLEET_RULES.defaultDurabilityMax,
  );
  const durabilityMax =
    Number.isFinite(durabilityMaxRaw) && durabilityMaxRaw > 0
      ? Math.floor(durabilityMaxRaw)
      : MECH_FLEET_RULES.defaultDurabilityMax;
  const durabilityRaw = Number(
    (raw as OwnedMech).durability ?? durabilityMax,
  );
  const durability = Number.isFinite(durabilityRaw)
    ? Math.max(0, Math.min(durabilityMax, Math.floor(durabilityRaw)))
    : durabilityMax;
  const instanceId =
    typeof (raw as OwnedMech).instanceId === "string" &&
    (raw as OwnedMech).instanceId.length > 0
      ? (raw as OwnedMech).instanceId
      : `owned_${catalogRaw}_anon`;
  const statusRaw =
    typeof (raw as OwnedMech).status === "string"
      ? (raw as OwnedMech).status
      : "";
  const status = isMechStatus(statusRaw)
    ? statusRaw
    : statusFromDurability(durability);
  // Prefer durability-derived status when inconsistent with destroyed/operational floors.
  return syncMechStatus({
    instanceId,
    catalogId: catalogRaw,
    status,
    durability,
    durabilityMax,
  });
}

export function normalizeFleet(
  raw: unknown,
  maxMechs: number,
): OwnedMech[] {
  if (!Array.isArray(raw)) return [];
  // Legacy: string MechId[]
  if (raw.every((x) => typeof x === "string")) {
    return migrateLegacyFleetIds(raw, maxMechs);
  }
  const out: OwnedMech[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= maxMechs) break;
    if (typeof item === "string") {
      const migrated = migrateLegacyFleetIds([item], 1);
      if (migrated[0] && !seen.has(migrated[0].instanceId)) {
        seen.add(migrated[0].instanceId);
        out.push(migrated[0]);
      }
      continue;
    }
    const m = normalizeOwnedMech(item as Record<string, unknown>);
    if (!m || seen.has(m.instanceId)) continue;
    seen.add(m.instanceId);
    out.push(m);
  }
  return out;
}
