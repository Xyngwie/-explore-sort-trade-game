import {
  applyDurabilityBufferToWear,
  buildExploreToHubWearUrl,
  buildExploreToSortUrl,
  createExpeditionState,
  createExploreSortieOutcome,
  createOwnedMech,
  resolveModuleBaseUrl,
  statusFromDurability,
  stockFromContainers,
  toExploreToHubWearPayload,
  type ExploreResult,
  type ExploreSortieOutcome,
  type SortieReturnKind,
} from "@estg/shared";
import type { World } from "./types";

export function returnKindFromWorld(world: World): SortieReturnKind {
  if (world.extracted) return "extract";
  if (
    world.failReason === "timeout" ||
    world.failReason === "leader_down" ||
    world.failReason === "extract_missed"
  ) {
    return "fail";
  }
  return "abort";
}

export function toExploreResult(world: World): ExploreResult {
  const salvaged = world.extracted ? world.salvaged : 0;
  const state = createExpeditionState({
    carrierCapacity: world.carrierCapacity,
    maxOperationTimeSec: world.maxOperationTimeSec,
    ammoStock: world.ammo,
    isExtracted: world.extracted,
    salvagedContainers: salvaged,
    totalStockPieces: stockFromContainers(salvaged),
  });
  return {
    carrierCapacity: state.carrierCapacity,
    maxOperationTimeSec: state.maxOperationTimeSec,
    ammoStock: state.ammoStock,
    isExtracted: state.isExtracted,
    salvagedContainers: state.salvagedContainers,
    totalStockPieces: state.totalStockPieces,
  };
}

/**
 * I/O v2 scaffold: flat returnKind wear via shared helpers.
 * Per-hit wear accumulation is deferred (see EXPLORE_BEHAVIOR_V0 §9).
 */
export function buildSortieOutcome(world: World): ExploreSortieOutcome | null {
  if (world.deployedInstanceIds.length === 0) return null;
  const result = toExploreResult(world);
  const kind = returnKindFromWorld(world);
  // Rebuild a minimal fleet snapshot from deploy-time durability (hub is SoT).
  const fleet = world.deployedInstanceIds.map((id) => {
    const durability = world.deployedDurability[id] ?? 100;
    return createOwnedMech("mech_gen1", { instanceId: id, durability });
  });
  const outcome = createExploreSortieOutcome({
    result,
    returnKind: kind,
    fleet,
    deployedInstanceIds: world.deployedInstanceIds,
  });
  const buffer = Math.max(0, Math.floor(world.circuitDurabilityBuffer ?? 0));
  if (buffer <= 0) return outcome;
  // Absorb circuit durability buffer from flat returnKind wear (per mech).
  return {
    ...outcome,
    mechWear: outcome.mechWear.map((w) => {
      const reduced = applyDurabilityBufferToWear(w.wearApplied, buffer);
      const durabilityAfter = w.durabilityBefore - reduced;
      const after = Math.max(0, durabilityAfter);
      return {
        ...w,
        durabilityAfter: after,
        wearApplied: reduced,
        statusAfter: statusFromDurability(after),
      };
    }),
  };
}

export function sortHandoffUrl(world: World): string {
  const result = toExploreResult(world);
  const craft = world.circuitCraftMultiplier;
  return buildExploreToSortUrl(
    {
      salvagedContainers: result.salvagedContainers,
      totalStockPieces: result.totalStockPieces,
      isExtracted: result.isExtracted,
      ...(craft != null && Number.isFinite(craft) && craft > 1
        ? { craftMultiplier: craft }
        : {}),
    },
    resolveModuleBaseUrl("sort"),
  );
}

export function hubWearHandoffUrl(world: World): string | null {
  const outcome = buildSortieOutcome(world);
  if (!outcome) return null;
  const payload = toExploreToHubWearPayload(
    outcome.returnKind,
    outcome.mechWear.map((w) => ({
      instanceId: w.instanceId,
      durabilityAfter: w.durabilityAfter,
    })),
  );
  return buildExploreToHubWearUrl(payload, resolveModuleBaseUrl("trade"));
}
