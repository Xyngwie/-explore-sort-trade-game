/**
 * First Invade clear (初クリア) and the one-time discovery of the "4" 1×1
 * (神宮 10/12 Go; S1–S3 of 10/7).
 *
 * - Key: optional `HubSnapshot.firstInvadeClear`. Missing → not cleared (S2).
 *   Never derived from the board; an already-swept board in an old save does
 *   not count — the next sweep does.
 * - The record and the unrestored "4" are written in one snapshot, once.
 *   A second sweep, a reload, or a repeated save/apply finds the key and
 *   changes nothing.
 */
import { discoverTrueOneByOne } from "./circuit-actions";
import { normalizeHubSnapshot, type HubSnapshot } from "./hub-save";

/** circuitId of the discovered "4" in the stash. */
export const FIRST_CLEAR_CIRCUIT_ID = "true-1x1";

/** The one line added to Invade's clear banner. No effect text (神宮 10/12). */
export const FIRST_CLEAR_DISCOVERY_LINE_JA = "盤の奥で、小さな回路を1枚見つけた";

export function isFirstInvadeCleared(hub: Pick<HubSnapshot, "firstInvadeClear"> | null | undefined): boolean {
  return hub?.firstInvadeClear != null;
}

export type FirstClearResult = {
  hub: HubSnapshot;
  /** True only on the call that recorded the first clear. */
  discovered: boolean;
};

/**
 * Record the first clear of `boardSeed` and put the unrestored "4" into the
 * stash. No-op (discovered=false) when the hub already has the key.
 */
export function recordFirstInvadeClear(
  hub: HubSnapshot,
  boardSeed: number | null | undefined,
  at: Date = new Date(),
): FirstClearResult {
  if (isFirstInvadeCleared(hub)) return { hub, discovered: false };
  const iso = at.toISOString();
  const seed = typeof boardSeed === "number" && Number.isFinite(boardSeed) ? boardSeed >>> 0 : null;
  const withCircuit = discoverTrueOneByOne(hub, FIRST_CLEAR_CIRCUIT_ID, iso);
  const next = normalizeHubSnapshot({
    ...withCircuit,
    firstInvadeClear: { boardSeed: seed, at: iso },
  });
  return { hub: next, discovered: true };
}

/** The banner line belongs to the board that was swept first (and only that one). */
export function firstClearDiscoveredOnBoard(
  hub: Pick<HubSnapshot, "firstInvadeClear"> | null | undefined,
  boardSeed: number | null | undefined,
): boolean {
  const rec = hub?.firstInvadeClear;
  if (!rec || rec.boardSeed == null) return false;
  return typeof boardSeed === "number" && Number.isFinite(boardSeed) && rec.boardSeed === boardSeed >>> 0;
}
