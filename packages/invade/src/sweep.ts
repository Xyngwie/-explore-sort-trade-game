/**
 * Thin invade sweep — minesweeper-lite scout/flag for one selected sector.
 * Invade-only; feeds existing handoff via intelFlags (no new URL keys).
 */

export type CellMark = "none" | "flagged" | "cleared" | "hazard";

export type SweepKind = "flagged" | "cleared" | "hazard";

export type SweepOutcome = {
  kind: SweepKind;
  mark: Exclude<CellMark, "none">;
  /** Short tokens valid for HANDOFF_M45 intelFlags. */
  intelAdded: readonly string[];
};

/** Intel tokens produced by thin sweep (must match INTEL_FLAG_RE in shared). */
export const SWEEP_INTEL = {
  flagged: "sectorFlagged",
  cleared: "scoutClear",
  hazard: "scoutHazard",
} as const;

/**
 * Hazard chance for a scout roll, scaled by provisional sector density.
 * HQ (density 0) → always clear; front (density 1) → always hazard.
 */
export function hazardChanceFromDensity(density: number): number {
  if (!Number.isFinite(density)) return 0;
  return Math.min(1, Math.max(0, density));
}

/** Flag a sector without rolling — marks suspected hazard / interest. */
export function resolveFlag(): SweepOutcome {
  return {
    kind: "flagged",
    mark: "flagged",
    intelAdded: [SWEEP_INTEL.flagged],
  };
}

/**
 * Scout / sweep the sector: density-scaled hazard roll.
 * @param rng unit interval sampler; inject for tests (default Math.random).
 */
export function resolveSweep(
  density: number,
  rng: () => number = Math.random,
): SweepOutcome {
  const p = hazardChanceFromDensity(density);
  const roll = rng();
  if (roll < p) {
    return {
      kind: "hazard",
      mark: "hazard",
      intelAdded: [SWEEP_INTEL.hazard],
    };
  }
  return {
    kind: "cleared",
    mark: "cleared",
    intelAdded: [SWEEP_INTEL.cleared],
  };
}

/** Map cell mark → intel tokens (empty when unscanned). */
export function intelForMark(mark: CellMark): string[] {
  switch (mark) {
    case "flagged":
      return [SWEEP_INTEL.flagged];
    case "cleared":
      return [SWEEP_INTEL.cleared];
    case "hazard":
      return [SWEEP_INTEL.hazard];
    default:
      return [];
  }
}

/**
 * Merge route-base intel with thin-sweep mark tokens (deduped, stable order).
 */
export function mergeIntelFlags(
  base: readonly string[],
  mark: CellMark,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...base, ...intelForMark(mark)]) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Optional density nudge for handoff after scout (still 0..1).
 * cleared → slight cool-down; hazard → slight heat; flag/none → unchanged.
 */
export function densityAfterSweep(density: number, mark: CellMark): number {
  const d = Number.isFinite(density) ? Math.min(1, Math.max(0, density)) : 0;
  if (mark === "cleared") return Math.min(1, Math.max(0, Number((d * 0.9).toFixed(3))));
  if (mark === "hazard") return Math.min(1, Number((Math.min(1, d + 0.05)).toFixed(3)));
  return Number(d.toFixed(3));
}

export function cellKey(sx: number, sy: number): string {
  return `${sx},${sy}`;
}
