/** Persistent rank progression. First clear of rank r unlocks r+1, never farming rewards. */
import type { HubSnapshot } from "./hub-save";
export type InvadeRankProgress = { current: number; highestCleared: number };
export function normalizeInvadeRank(
  raw: unknown,
): InvadeRankProgress | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.current !== "number" ||
    typeof r.highestCleared !== "number" ||
    !Number.isSafeInteger(r.current) ||
    !Number.isSafeInteger(r.highestCleared) ||
    r.current < 0 ||
    r.highestCleared < -1 ||
    r.highestCleared >= Number.MAX_SAFE_INTEGER
  )
    return undefined;
  return {
    current: Math.min(r.current, r.highestCleared + 1),
    highestCleared: r.highestCleared,
  };
}
/** Only an explicit old first-clear record proves rank zero was cleared. */
export function invadeRankOf(
  hub: Pick<HubSnapshot, "invadeRank" | "firstInvadeClear">,
): InvadeRankProgress {
  return (
    normalizeInvadeRank(hub.invadeRank) ?? {
      current: 0,
      highestCleared: hub.firstInvadeClear ? 0 : -1,
    }
  );
}
export function unlockedInvadeRank(
  hub: Pick<HubSnapshot, "invadeRank" | "firstInvadeClear">,
): number {
  return invadeRankOf(hub).highestCleared + 1;
}
export function ensureInvadeRank(hub: HubSnapshot): HubSnapshot {
  return hub.invadeRank ? hub : { ...hub, invadeRank: invadeRankOf(hub) };
}
export function completeInvadeRank(hub: HubSnapshot): HubSnapshot {
  const r = invadeRankOf(hub);
  return {
    ...hub,
    invadeRank: {
      current: r.current,
      highestCleared: Math.max(r.highestCleared, r.current),
    },
  };
}
export function selectInvadeRank(
  hub: HubSnapshot,
  rank: number,
): HubSnapshot | null {
  if (!Number.isSafeInteger(rank) || rank < 0 || rank > unlockedInvadeRank(hub))
    return null;
  return { ...hub, invadeRank: { ...invadeRankOf(hub), current: rank } };
}
export function rankEnemyMultiplier(rank: number): number {
  return Math.min(
    Number.MAX_VALUE / 100,
    Math.pow(1.01, Math.max(0, Number.isFinite(rank) ? Math.floor(rank) : 0)),
  );
}
