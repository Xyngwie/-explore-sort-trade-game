/**
 * Browser-back during forced engage → wipe all mechs (大破) and hand off to trade.
 * Mirrors invade forced-combat wipe using shared HubSave + wear URL only.
 */
import {
  INITIAL_HUB,
  applyWearReportsToFleet,
  buildExploreToHubWearUrl,
  clearFrontProgressHitMine,
  buildInvadeToTradeUrl,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  resolveModuleBaseUrl,
  saveHubSaveToLocalStorage,
  type InvadeToTradePayload,
} from "@estg/shared";

export const ALL_DESTROYED_INTEL = "allDestroyed";
export const FORCED_EXPLORE_HANDOFF_INTENT_KEY = "estg.explore.forcedHandoffIntent";
export const FORCED_EXPLORE_HISTORY_STATE = "estgExploreForcedCombat";

export function markExploreForcedHandoffIntent(
  store?: Pick<Storage, "setItem"> | null,
): void {
  try {
    const s = store ?? (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    s?.setItem(FORCED_EXPLORE_HANDOFF_INTENT_KEY, "1");
  } catch {
    /* ignore */
  }
}

function readHandoffIntent(store?: Pick<Storage, "getItem"> | null): boolean {
  try {
    const s = store ?? (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    return s?.getItem(FORCED_EXPLORE_HANDOFF_INTENT_KEY) === "1";
  } catch {
    return false;
  }
}

function clearHandoffIntent(store?: Pick<Storage, "removeItem"> | null): void {
  try {
    const s = store ?? (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    s?.removeItem(FORCED_EXPLORE_HANDOFF_INTENT_KEY);
  } catch {
    /* ignore */
  }
}

export function armExploreForcedHistory(
  historyLike: Pick<History, "state" | "pushState"> = history,
  href: string = typeof location !== "undefined" ? location.href : "",
): boolean {
  const st = historyLike.state;
  if (st && typeof st === "object" && (st as Record<string, unknown>)[FORCED_EXPLORE_HISTORY_STATE]) {
    return false;
  }
  historyLike.pushState({ [FORCED_EXPLORE_HISTORY_STATE]: true }, "", href);
  return true;
}


/** Clear invade forced-combat lock after forced engage reaches a terminal result. */
export function clearInvadeForcedLockAfterResolve(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): boolean {
  const loaded = loadHubSaveFromLocalStorage(storage ?? undefined);
  const hub = loaded?.hub
    ? normalizeHubSnapshot(loaded.hub)
    : normalizeHubSnapshot(INITIAL_HUB);
  if (hub.frontProgress?.hitMine !== true) return false;
  const next = clearFrontProgressHitMine(hub);
  return saveHubSaveToLocalStorage(next, storage ?? undefined);
}

export function wipeFleetAndBuildTradeUrl(
  sector: InvadeToTradePayload | null,
  tradeBaseUrl: string = resolveModuleBaseUrl("trade"),
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): string {
  const loaded = loadHubSaveFromLocalStorage(storage ?? undefined);
  const hub = loaded?.hub
    ? normalizeHubSnapshot(loaded.hub)
    : normalizeHubSnapshot(INITIAL_HUB);
  const mechWear = hub.fleet.map((m) => ({
    instanceId: m.instanceId,
    durabilityAfter: 0,
  }));
  const fleet = applyWearReportsToFleet(hub.fleet, mechWear);
  // Terminal forced outcome (back wipe) — clear stale invade forced lock.
  const next = clearFrontProgressHitMine(
    normalizeHubSnapshot({ ...hub, fleet }),
  );
  saveHubSaveToLocalStorage(next, storage ?? undefined);

  const flags = [...(sector?.intelFlags ?? [])];
  if (!flags.includes(ALL_DESTROYED_INTEL)) flags.push(ALL_DESTROYED_INTEL);
  const sectorPayload: InvadeToTradePayload = {
    sectorX: sector?.sectorX ?? 0,
    sectorY: sector?.sectorY ?? 0,
    density: sector?.density ?? 0,
    intelFlags: flags,
  };
  const withSector = buildInvadeToTradeUrl(sectorPayload, tradeBaseUrl);
  return buildExploreToHubWearUrl(
    { returnKind: "fail", mechWear },
    withSector,
  );
}

/** Returns trade URL if wipe applied; null if intentional handoff. */
export function resolveExploreForcedBackWipe(args: {
  sector: InvadeToTradePayload | null;
  session?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  tradeBaseUrl?: string;
}): string | null {
  if (readHandoffIntent(args.session)) {
    clearHandoffIntent(args.session);
    return null;
  }
  return wipeFleetAndBuildTradeUrl(
    args.sector,
    args.tradeBaseUrl,
    args.storage,
  );
}
