/**
 * U9 (CIRCUIT_DATA_MODEL_V0 §5.4・§9 U9): apply one Explore sortie return to
 * the hub. Explore calls this when the sortie reaches its result (direct save
 * to HubSave); trade calls the same function for a return URL, so a return
 * that Explore already saved is skipped by `sortieId` / `appliedSortieIds`
 * and a legacy return URL alone still applies once.
 */
import { applySortieReport } from "./circuit-inventory";
import type { ExploreToHubWearPayload } from "./handoff";
import type { HubSnapshot } from "./hub-save";
import {
  applyWearReportsToFleet,
  normalizeBattery,
  normalizeCurrentAmmo,
  type OwnedMech,
} from "./mech-fleet";

/**
 * Write returned per-mech carried ammo / battery into the fleet. 0 is written
 * as 0; mechs not in the report are unchanged.
 */
export function applyReturnedMechState(
  fleet: readonly OwnedMech[],
  wear: Pick<ExploreToHubWearPayload, "mechCurrentAmmo" | "mechBattery">,
): OwnedMech[] {
  const ammo = new Map(
    (wear.mechCurrentAmmo ?? []).map((row) => [row.instanceId, row.currentAmmo]),
  );
  const battery = new Map(
    (wear.mechBattery ?? []).map((row) => [row.instanceId, row.battery]),
  );
  if (ammo.size === 0 && battery.size === 0) return [...fleet];
  return fleet.map((m) => {
    let next = m;
    if (ammo.has(m.instanceId)) {
      next = { ...next, currentAmmo: normalizeCurrentAmmo(ammo.get(m.instanceId)) };
    }
    if (battery.has(m.instanceId)) {
      next = { ...next, battery: normalizeBattery(battery.get(m.instanceId)) };
    }
    return next;
  });
}

export type ApplyExploreReturnResult = {
  hub: HubSnapshot;
  /** false when `sortieId` was already applied (hub unchanged). */
  applied: boolean;
};

/**
 * Sortie report (wrecked mechs, left-behind `lostMechs`, inventory drops) →
 * wear (durabilityAfter) → returned carried ammo / battery. Idempotent when
 * `sortieId` is present. Without `sortieId` (legacy URL) it applies every call.
 */
export function applyExploreReturnToHub(
  hub: HubSnapshot,
  wear: ExploreToHubWearPayload,
  at = new Date(),
): ApplyExploreReturnResult {
  let next = hub;
  if (wear.sortieId) {
    const report = applySortieReport(
      hub,
      {
        sortieId: wear.sortieId,
        cell: null,
        frontSeed: null,
        lostMechInstanceIds: [],
        lostCause: {},
        recoveredDropIds: [],
        acquiredCircuits: [],
        inventoryDrops: wear.inventoryDrops ?? [],
        recoveredInventoryDropIds: wear.recoveredInventoryDropIds ?? [],
        wreckedMechInstanceIds: wear.wreckedMechInstanceIds ?? [],
        lostMechs: wear.lostMechs ?? [],
      },
      at,
    );
    if (!report.applied) return { hub, applied: false };
    next = report.hub;
  }
  return {
    hub: {
      ...next,
      fleet: applyReturnedMechState(
        applyWearReportsToFleet(next.fleet, wear.mechWear),
        wear,
      ),
    },
    applied: true,
  };
}
