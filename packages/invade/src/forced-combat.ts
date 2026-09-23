/**
 * Forced-combat lock + browser-back fleet wipe (Module 4).
 * Pure helpers + HubSave wipe — UI wires popstate / CTA in main.ts.
 */

import {
  INITIAL_HUB,
  applyWearReportsToFleet,
  buildExploreToHubWearUrl,
  buildInvadeToTradeUrl,
  clearFrontProgressHitMine,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  resolveModuleBaseUrl,
  saveHubSaveToLocalStorage,
  type HubSnapshot,
  type InvadeToTradePayload,
} from "@estg/shared";
import type { MsBoard } from "./board";

/** intelFlags token: browser-back (or equivalent) wiped the fleet. */
export const ALL_DESTROYED_INTEL = "allDestroyed";

/** sessionStorage: intentional forced handoff — popstate must not wipe. */
export const FORCED_HANDOFF_INTENT_KEY = "estg.invade.forcedHandoffIntent";

/** history.state marker so we can push a back-trap entry. */
export const FORCED_LOCK_HISTORY_STATE = "estgForcedCombatLock";

export type MechWearRow = {
  instanceId: string;
  durabilityAfter: number;
};

export type FleetWipeResult = {
  wipedCount: number;
  mechWear: MechWearRow[];
  hub: HubSnapshot;
};

function readHub(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): HubSnapshot {
  const loaded = loadHubSaveFromLocalStorage(storage ?? undefined);
  return loaded?.hub
    ? normalizeHubSnapshot(loaded.hub)
    : normalizeHubSnapshot(INITIAL_HUB);
}

/** True while a mine-step forced fight is unresolved on this board. */
export function isForcedCombatLock(
  board: Pick<MsBoard, "hitMine">,
  opts?: { handoffIntent?: boolean },
): boolean {
  if (opts?.handoffIntent) return false;
  return board.hitMine === true;
}

/** Drop in-memory forced lock (does not touch HubSave). */
export function releaseForcedCombatLock(board: { hitMine: boolean }): void {
  board.hitMine = false;
}

/**
 * Clear pending forced lock in HubSave.frontProgress (keep board progress).
 * Call after forced combat reaches any terminal outcome, or on back-wipe.
 */
export function clearPendingForcedCombat(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): boolean {
  const hub = readHub(storage);
  if (hub.frontProgress?.hitMine !== true) return false;
  const next = clearFrontProgressHitMine(hub);
  return saveHubSaveToLocalStorage(next, storage ?? undefined);
}

export function readHandoffIntent(
  store?: Pick<Storage, "getItem"> | null,
): boolean {
  try {
    const s =
      store ??
      (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    return s?.getItem(FORCED_HANDOFF_INTENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markForcedHandoffIntent(
  store?: Pick<Storage, "setItem"> | null,
): void {
  try {
    const s =
      store ??
      (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    s?.setItem(FORCED_HANDOFF_INTENT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearForcedHandoffIntent(
  store?: Pick<Storage, "removeItem"> | null,
): void {
  try {
    const s =
      store ??
      (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    s?.removeItem(FORCED_HANDOFF_INTENT_KEY);
  } catch {
    /* ignore */
  }
}

/** Persist all fleet mechs as 大破 (durability 0) into HubSave. */
export function wipeAllMechsDestroyed(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): FleetWipeResult {
  const hub = readHub(storage);
  const mechWear: MechWearRow[] = hub.fleet.map((m) => ({
    instanceId: m.instanceId,
    durabilityAfter: 0,
  }));
  const fleet = applyWearReportsToFleet(hub.fleet, mechWear);
  // Back-wipe ends the forced obligation — do not leave stale lock on re-entry.
  const next = clearFrontProgressHitMine(
    normalizeHubSnapshot({ ...hub, fleet }),
  );
  saveHubSaveToLocalStorage(next, storage ?? undefined);
  return { wipedCount: mechWear.length, mechWear, hub: next };
}

/**
 * Build trade URL carrying sector intel + allDestroyed + wear (durability 0).
 * Trade already consumes explore→hub wear and invade→trade on the same search.
 */
export function buildForcedWipeToTradeUrl(
  sector: InvadeToTradePayload,
  mechWear: readonly MechWearRow[],
  tradeBaseUrl: string = resolveModuleBaseUrl("trade"),
): string {
  const flags = [...(sector.intelFlags ?? [])];
  if (!flags.includes(ALL_DESTROYED_INTEL)) flags.push(ALL_DESTROYED_INTEL);
  const withSector = buildInvadeToTradeUrl(
    { ...sector, intelFlags: flags },
    tradeBaseUrl,
  );
  return buildExploreToHubWearUrl(
    {
      returnKind: "fail",
      mechWear: mechWear.map((w) => ({
        instanceId: w.instanceId,
        durabilityAfter: w.durabilityAfter,
      })),
    },
    withSector,
  );
}

/** Ensure a history entry exists so browser Back fires popstate during lock. */
export function armForcedLockHistory(
  historyLike: Pick<History, "state" | "pushState"> = history,
  locationHref: string = typeof location !== "undefined" ? location.href : "",
): boolean {
  const st = historyLike.state;
  if (
    st &&
    typeof st === "object" &&
    (st as Record<string, unknown>)[FORCED_LOCK_HISTORY_STATE]
  ) {
    return false;
  }
  historyLike.pushState(
    { [FORCED_LOCK_HISTORY_STATE]: true },
    "",
    locationHref,
  );
  return true;
}

export function isForcedLockHistoryState(state: unknown): boolean {
  return (
    !!state &&
    typeof state === "object" &&
    (state as Record<string, unknown>)[FORCED_LOCK_HISTORY_STATE] === true
  );
}

/**
 * Apply wipe + return trade redirect URL when back is used under forced lock.
 * Returns null when handoff intent is set (intentional CTA navigation).
 */
export function resolveForcedBackWipe(args: {
  board: Pick<MsBoard, "hitMine">;
  sector: InvadeToTradePayload;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  session?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  tradeBaseUrl?: string;
}): { url: string; wipe: FleetWipeResult } | null {
  if (readHandoffIntent(args.session)) {
    clearForcedHandoffIntent(args.session);
    return null;
  }
  if (!isForcedCombatLock(args.board)) return null;
  const wipe = wipeAllMechsDestroyed(args.storage);
  const url = buildForcedWipeToTradeUrl(
    args.sector,
    wipe.mechWear,
    args.tradeBaseUrl,
  );
  return { url, wipe };
}

/** Merge allDestroyed into an intel flag list (idempotent). */
export function withAllDestroyedIntel(
  flags: readonly string[] | undefined,
): string[] {
  const out = [...(flags ?? [])];
  if (!out.includes(ALL_DESTROYED_INTEL)) out.push(ALL_DESTROYED_INTEL);
  return out;
}
