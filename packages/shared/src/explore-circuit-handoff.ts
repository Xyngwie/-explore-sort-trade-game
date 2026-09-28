import type { HubCircuitRecord } from "./hub-save";

/**
 * Explore-facing snapshot of one circuit equipped to a mech.
 *
 * This is intentionally a data-only boundary: Explore can inspect the
 * equipped circuit without depending on HubSave mutation or UI concerns.
 * Circuit effects / command unlocks are applied in later work.
 */
export type ExploreCircuit = {
  circuitId: string;
  restoreState: HubCircuitRecord["restoreState"];
  origin: HubCircuitRecord["origin"];
  equippedTo: string;
  effectKey?: string;
};

/**
 * Build the immutable circuit loadout for one mech instance.
 * Only circuits explicitly equipped to that instance cross the boundary.
 */
export function buildExploreCircuitLoadout(
  circuits: readonly HubCircuitRecord[],
  mechInstanceId: string,
): ExploreCircuit[] {
  const id = mechInstanceId.trim();
  if (!id) return [];

  return circuits
    .filter((circuit) => circuit.equippedTo === id)
    .map((circuit) => ({
      circuitId: circuit.circuitId,
      restoreState: circuit.restoreState,
      origin: circuit.origin,
      equippedTo: id,
      ...(circuit.effectKey ? { effectKey: circuit.effectKey } : {}),
    }));
}

/** Build loadouts for every mech that currently has an equipped circuit. */
export function buildExploreCircuitLoadouts(
  circuits: readonly HubCircuitRecord[],
): Record<string, ExploreCircuit[]> {
  const out: Record<string, ExploreCircuit[]> = {};
  for (const circuit of circuits) {
    const mechId = circuit.equippedTo?.trim();
    if (!mechId) continue;
    (out[mechId] ??= []).push({
      circuitId: circuit.circuitId,
      restoreState: circuit.restoreState,
      origin: circuit.origin,
      equippedTo: mechId,
      ...(circuit.effectKey ? { effectKey: circuit.effectKey } : {}),
    });
  }
  return out;
}
