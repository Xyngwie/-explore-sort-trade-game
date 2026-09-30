import type { MechCircuitEntry } from "@estg/shared";

export type EquippedByUnit = Record<string, string[]>;

const ACTIVE_RESTORE_STATES = new Set<MechCircuitEntry["restoreState"]>([
  "fully_awakened",
  "bypass",
]);

/**
 * Convert the optional trade→explore mechCircuits handoff into the
 * Explore-local unit map used by command judgement.
 *
 * Unit ids are stable Explore ids; circuit ownership is keyed by the
 * deployed mech instance id in the shared handoff.
 */
export function buildEquippedByUnit(
  deployedInstanceIds: readonly string[],
  mechCircuits?: Record<string, readonly MechCircuitEntry[]>,
): EquippedByUnit {
  const out: EquippedByUnit = {};
  if (!mechCircuits) return out;

  const unitIds = ["leader", "wing-a", "wing-b"];
  for (let i = 0; i < Math.min(unitIds.length, deployedInstanceIds.length); i += 1) {
    const instanceId = deployedInstanceIds[i]!;
    const entries = mechCircuits[instanceId];
    if (!entries) continue;
    const active = entries
      .filter((entry) => ACTIVE_RESTORE_STATES.has(entry.restoreState))
      .map((entry) => entry.circuitId)
      .filter((id) => typeof id === "string" && id.length > 0);
    if (active.length > 0) out[unitIds[i]!] = active;
  }
  return out;
}

export function circuitsForUnit(
  equippedByUnit: EquippedByUnit | null | undefined,
  unitId: string,
): readonly string[] {
  return equippedByUnit?.[unitId] ?? [];
}
