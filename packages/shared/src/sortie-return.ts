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
  MECH_FLEET_RULES,
  applyWearReportsToFleet,
  normalizeBattery,
  normalizeCurrentAmmo,
  statusFromDurability,
  type OwnedMech,
} from "./mech-fleet";

/**
 * The copy of a mech left behind in this sortie (rows with `lostSortieId ===
 * sortieId`) takes this sortie's wear (`mechWear.durabilityAfter`), so a
 * recovered mech comes back as it was when it was left.
 */
function withLostMechWear(hub: HubSnapshot, wear: ExploreToHubWearPayload): HubSnapshot {
  if (!wear.sortieId || (hub.lostMechs ?? []).length === 0) return hub;
  const after = new Map(wear.mechWear.map((w) => [w.instanceId, w.durabilityAfter]));
  let changed = false;
  const lostMechs = hub.lostMechs.map((m) => {
    if (m.lostSortieId !== wear.sortieId || !after.has(m.instanceId) || m.durability == null) return m;
    const max = m.durabilityMax ?? MECH_FLEET_RULES.defaultDurabilityMax;
    const durability = Math.max(0, Math.min(max, Math.floor(after.get(m.instanceId)!)));
    changed = true;
    return { ...m, durability, status: statusFromDurability(durability) };
  });
  return changed ? { ...hub, lostMechs } : hub;
}

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
  const abandoned = [...new Set((wear.abandonedMechInstanceIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (wear.sortieId) {
    const report = applySortieReport(
      hub,
      {
        sortieId: wear.sortieId,
        cell: null,
        frontSeed: null,
        // Left behind outside Invade: lost outright. With cell null their
        // circuits are lost too (lostForever), never moved to the stash.
        lostMechInstanceIds: abandoned,
        lostCause: Object.fromEntries(abandoned.map((id) => [id, "left_behind" as const])),
        recoveredDropIds: [],
        acquiredCircuits: [],
        inventoryDrops: wear.inventoryDrops ?? [],
        recoveredInventoryDropIds: wear.recoveredInventoryDropIds ?? [],
        wreckedMechInstanceIds: wear.wreckedMechInstanceIds ?? [],
        lostMechs: wear.lostMechs ?? [],
        recoveredLostMechInstanceIds: wear.recoveredLostMechInstanceIds ?? [],
      },
      at,
    );
    if (!report.applied) return { hub, applied: false };
    next = withLostMechWear(report.hub, wear);
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
