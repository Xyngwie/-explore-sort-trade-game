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
  type LostMechReturnState,
  type ExploreToHubWearPayload,
} from "@estg/shared";
import type { World } from "./types";
import { strandedNotRecovered } from "./lostMechs";
import { abandonedWreckInstanceIds, sortieWreckRows } from "./wrecks";

export function returnKindFromWorld(world: World): SortieReturnKind {
  if (world.extracted) return "extract";
  // Note: clock expiry no longer sets failReason=timeout (overtime lock).
  // "timeout" remains only for legacy/manual fail wear paths.
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
    ammoStock: world.ammoStock,
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
 * I/O v2 scaffold: flat returnKind wear via shared helpers for the mechs
 * that survived; a mech shot down during the sortie returns destroyed
 * (項目5-1). Per-hit wear accumulation is deferred (see EXPLORE_BEHAVIOR_V0 §9).
 */
export function buildSortieOutcome(world: World): ExploreSortieOutcome | null {
  if (world.deployedInstanceIds.length === 0) return null;
  const result = toExploreResult(world);
  const kind = returnKindFromWorld(world);
  // Rebuild a minimal fleet snapshot from deploy-time durability (hub is SoT).
  const fleet = world.deployedInstanceIds.map((id) => {
    const durability = world.deployedDurability[id] ?? 100;
    const currentAmmo = world.currentAmmo[id];
    const mech = createOwnedMech(
      "mech_gen1",
      currentAmmo == null
        ? { instanceId: id, durability }
        : { instanceId: id, durability, currentAmmo },
    );
    // Carry the deployed battery through (Explore does not consume it yet);
    // never report createOwnedMech's default 300/300 for a mech we were not given.
    const battery = world.mechBattery[id];
    return battery ? { ...mech, battery: { ...battery } } : mech;
  });
  const created = createExploreSortieOutcome({
    result,
    returnKind: kind,
    fleet,
    deployedInstanceIds: world.deployedInstanceIds,
  });
  const outcome: ExploreSortieOutcome = {
    ...created,
    mechBattery: (created.mechBattery ?? []).filter((row) => world.mechBattery[row.instanceId] != null),
  };
  const buffer = Math.max(0, Math.floor(world.circuitDurabilityBuffer ?? 0));
  const downed = downedInstanceIds(world);
  // Absorb circuit durability buffer from flat returnKind wear (per mech).
  const buffered =
    buffer <= 0
      ? outcome.mechWear
      : outcome.mechWear.map((w) => {
          const reduced = applyDurabilityBufferToWear(w.wearApplied, buffer);
          const durabilityAfter = w.durabilityBefore - reduced;
          const after = Math.max(0, durabilityAfter);
          return {
            ...w,
            durabilityAfter: after,
            wearApplied: reduced,
            statusAfter: statusFromDurability(after),
          };
        });
  if (buffer <= 0 && downed.size === 0) return outcome;
  // 項目5-1: a mech shot down during the sortie (Unit.alive=false) comes back
  // destroyed whatever the ending; the flat returnKind wear above stays for
  // the surviving mechs only (their values are unchanged).
  return {
    ...outcome,
    mechWear: buffered.map((w) =>
      downed.has(w.instanceId)
        ? {
            ...w,
            durabilityAfter: 0,
            wearApplied: Math.max(0, w.durabilityBefore),
            statusAfter: statusFromDurability(0),
          }
        : w,
    ),
  };
}

/**
 * Deployed mechs whose Unit was shot down this sortie (`alive=false` at the
 * end): leader and wingmen alike (項目5-1). They return as wrecks.
 */
export function downedInstanceIds(world: World): Set<string> {
  const deployed = new Set(world.deployedInstanceIds);
  const out = new Set<string>();
  for (const u of [world.leader, ...world.wingmen]) {
    const id = u.instanceId?.trim() ?? "";
    if (id && !u.alive && deployed.has(id)) out.add(id);
  }
  return out;
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

function sortieIdForWorld(world: World, kind: SortieReturnKind): string {
  const source = JSON.stringify({
    ids: world.deployedInstanceIds,
    kind,
    elapsed: Math.round(world.elapsed * 1000),
    salvaged: world.salvaged,
    ammo: JSON.stringify(world.currentAmmo),
    nonce: world.sortieNonce ?? "",
  });
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `explore_${(hash >>> 0).toString(16)}`;
}

/** instanceIds of the wingmen left behind at lift-off this sortie. */
function leftBehindInstanceIds(world: World): Array<{ unitId: string; instanceId: string }> {
  const out: Array<{ unitId: string; instanceId: string }> = [];
  const seen = new Set<string>();
  for (const entry of world.leftBehind ?? []) {
    const unit = world.wingmen.find((w) => w.id === entry.id);
    const instanceId = unit?.instanceId?.trim() ?? "";
    if (!instanceId || seen.has(instanceId)) continue;
    seen.add(instanceId);
    out.push({ unitId: entry.id, instanceId });
  }
  return out;
}

/**
 * lostMechs rows of the return (CIRCUIT_DATA_MODEL_V0 §5.6). Only for a
 * sortie via Invade (`world.sortieLocation`): the wingmen left behind this
 * sortie, plus reappeared mechs that were not recovered (same row, updated
 * with this sortie's place). Each row carries `frontSeed` + `cell`.
 */
function lostMechsFromWorld(world: World): LostMechReturnState[] {
  const loc = world.sortieLocation ?? null;
  if (!loc) return [];
  const place = { frontSeed: loc.frontSeed, cell: { sx: loc.cell.sx, sy: loc.cell.sy } };
  const out: LostMechReturnState[] = [];
  for (const { unitId, instanceId } of leftBehindInstanceIds(world)) {
    const battery = world.mechBattery[instanceId];
    if (!battery) continue;
    out.push({
      instanceId,
      currentAmmo: world.currentAmmo[instanceId],
      battery: { ...battery },
      circuitIds: [...(world.circuitIdsByUnit[unitId] ?? [])],
      ...place,
    });
  }
  // 項目5-1b: this sortie's wrecks left on the field (kind "wreck" + pos).
  for (const row of sortieWreckRows(world)) {
    if (out.some((m) => m.instanceId === row.instanceId)) continue;
    out.push(row);
  }
  const seen = new Set(out.map((m) => m.instanceId));
  for (const m of strandedNotRecovered(world)) {
    if (seen.has(m.instanceId)) continue;
    seen.add(m.instanceId);
    out.push({
      instanceId: m.instanceId,
      currentAmmo: m.row.currentAmmo,
      battery: { ...m.row.battery },
      circuitIds: [...m.row.circuitIds],
      // a reappeared wreck stays a wreck at its saved coordinates (W3 C)
      ...(m.row.kind ? { kind: m.row.kind } : {}),
      ...(m.row.pos ? { pos: { x: m.row.pos.x, y: m.row.pos.y } } : {}),
      ...place,
    });
  }
  return out;
}

/** Not via Invade: the wingmen left behind are lost outright with their circuits (#206 leftover). */
function abandonedFromWorld(world: World): string[] {
  if (world.sortieLocation) return [];
  const ids = leftBehindInstanceIds(world).map((r) => r.instanceId);
  // 項目5-1b W4 A: wrecks of a sortie not via Invade are lost with their circuits.
  for (const id of abandonedWreckInstanceIds(world)) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/**
 * The sortie return (U9). Explore writes it to HubSave at sortie end
 * (`hubDirectSave.ts`) and also puts it in the 格納庫 return URL, which trade
 * still reads (applied once by sortieId; skipped when already saved).
 */
export function exploreReturnPayload(world: World): ExploreToHubWearPayload | null {
  const outcome = buildSortieOutcome(world);
  if (!outcome) return null;
  const wreckedMechInstanceIds = outcome.mechWear
    .filter((w) => w.durabilityAfter <= 0)
    .map((w) => w.instanceId);
  const loc = world.sortieLocation ?? null;
  const payload = toExploreToHubWearPayload(
    outcome.returnKind,
    outcome.mechWear.map((w) => ({
      instanceId: w.instanceId,
      durabilityAfter: w.durabilityAfter,
    })),
    {
      sortieId: sortieIdForWorld(world, outcome.returnKind),
      wreckedMechInstanceIds,
      mechCurrentAmmo: outcome.mechCurrentAmmo,
      mechBattery: outcome.mechBattery,
      lostMechs: lostMechsFromWorld(world),
      abandonedMechInstanceIds: abandonedFromWorld(world),
      recoveredLostMechInstanceIds: [...(world.recoveredLostMechIds ?? [])],
      recoveredDropIds: [...(world.recoveredDropIds ?? [])],
      ...(loc
        ? { frontSeed: loc.frontSeed, cell: { sx: loc.cell.sx, sy: loc.cell.sy } }
        : {}),
      ...(world.rescueAbort
        ? { rescueFeeCredits: Math.max(0, Math.floor(world.rescueFeeCredits ?? 0)) }
        : {}),
    },
  );
  return payload;
}

export { wreckResultLines, wreckResultHtml } from "./wrecks";

export function hubWearHandoffUrl(world: World): string | null {
  const payload = exploreReturnPayload(world);
  if (!payload) return null;
  return buildExploreToHubWearUrl(payload, resolveModuleBaseUrl("trade"));
}

export {
  recoveredCircuitResultLines,
  recoveredCircuitResultHtml,
} from "./circuitDrops";
