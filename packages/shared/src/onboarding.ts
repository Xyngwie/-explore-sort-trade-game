import { canDeploy } from "./mech-fleet";
import { isCircuitRestoreStateActive } from "./circuit-board";
/** New-game-only progress. Absence means an existing save, never a migration. */
import type { HubSnapshot } from "./hub-save";
import { classifyCircuit } from "./circuit-actions";
export type NewGameIntro = {
  version: 1;
  initialOpened: number;
  initialHarvest: number;
  zeroHarvestAwarded: boolean;
  craftedCircuitIds: string[];
  opening?: {
    id: string;
    initialCount: number;
    containerCount: number;
    url?: string;
  };
  results: Array<{
    id: string;
    harvest: Record<string, number>;
  }>;
  firstSortie?: { nonce: string; leaderId: string; circuitId: string };
};
export function normalizeNewGameIntro(raw: unknown): NewGameIntro | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as NewGameIntro;
  if (
    r.version !== 1 ||
    !Number.isInteger(r.initialOpened) ||
    r.initialOpened < 0 ||
    r.initialOpened > 10 ||
    !Number.isFinite(r.initialHarvest) ||
    r.initialHarvest < 0 ||
    !Array.isArray(r.craftedCircuitIds)
  )
    return undefined;
  return {
    version: 1,
    initialOpened: r.initialOpened,
    initialHarvest: r.initialHarvest,
    zeroHarvestAwarded: r.zeroHarvestAwarded === true,
    results: Array.isArray(r.results)
      ? r.results
          .filter(
            (x) =>
              x &&
              typeof x.id === "string" &&
              x.harvest &&
              typeof x.harvest === "object",
          )
          .map((x) => ({
            id: x.id,
            harvest: Object.fromEntries(
              Object.entries(x.harvest).filter(
                ([k, v]) =>
                  ["ammo", "armor", "power", "junk"].includes(k) &&
                  Number.isFinite(v) &&
                  v >= 0,
              ),
            ),
          }))
      : [],
    craftedCircuitIds: [
      ...new Set(r.craftedCircuitIds.filter((x) => typeof x === "string")),
    ],
    ...(r.opening &&
    typeof r.opening.id === "string" &&
    Number.isInteger(r.opening.initialCount) &&
    r.opening.initialCount >= 0 &&
    Number.isInteger(r.opening.containerCount) &&
    r.opening.containerCount > 0 &&
    r.opening.containerCount >= r.opening.initialCount &&
    r.opening.initialCount <= 10 - r.initialOpened
      ? { opening: { ...r.opening } }
      : {}),
    ...(r.firstSortie &&
    typeof r.firstSortie.nonce === "string" &&
    typeof r.firstSortie.leaderId === "string" &&
    typeof r.firstSortie.circuitId === "string"
      ? { firstSortie: { ...r.firstSortie } }
      : {}),
  };
}
export const FIRST_SORTIE_HELP =
  "初出撃には、自分で作成した1×1不完全回路を修復し、出撃する隊長機に装備してください。格納庫で作成・修復・装備できます。";
export function firstSortieCircuit(
  hub: HubSnapshot,
  leaderId: string | null | undefined,
): string | null {
  const intro = hub.newGameIntro;
  if (!intro || intro.firstSortie) return null;
  return (
    hub.circuits.find(
      (c) =>
        c.equippedTo === leaderId &&
        intro.craftedCircuitIds.includes(c.circuitId) &&
        c.origin === "crafted" &&
        isCircuitRestoreStateActive(c.restoreState) &&
        classifyCircuit(c).oneByOne === "false",
    )?.circuitId ?? null
  );
}
export function firstSortieError(
  hub: HubSnapshot,
  leaderId: string | null | undefined,
): string {
  if (!hub.newGameIntro || hub.newGameIntro.firstSortie) return "";
  return leaderId &&
    hub.fleet.some((m) => m.instanceId === leaderId && canDeploy(m)) &&
    firstSortieCircuit(hub, leaderId)
    ? ""
    : FIRST_SORTIE_HELP;
}

/** Reserve provenance, not an opening. The count advances only on a completed result. */
export function reserveIntroOpening(
  hub: HubSnapshot,
  id: string,
  count: number,
  url?: string,
  initialCount = count,
): HubSnapshot {
  const intro = hub.newGameIntro;
  if (!intro) return hub;
  if (
    !id ||
    !Number.isInteger(count) ||
    count < 1 ||
    !Number.isInteger(initialCount) ||
    initialCount < 0 ||
    initialCount > count ||
    initialCount > 10 - intro.initialOpened
  )
    throw new Error("invalid_initial_opening");
  return {
    ...hub,
    newGameIntro: {
      ...intro,
      opening: {
        id,
        initialCount,
        containerCount: count,
        ...(url ? { url } : {}),
      },
    },
  };
}
export function cancelIntroOpening(hub: HubSnapshot, id: string): HubSnapshot {
  if (hub.newGameIntro?.opening?.id !== id) return hub;
  const { opening: _, ...intro } = hub.newGameIntro;
  return { ...hub, newGameIntro: intro };
}
export function completeIntroOpening(
  hub: HubSnapshot,
  id: string,
  harvest: Record<string, number | undefined>,
): HubSnapshot {
  const intro = hub.newGameIntro;
  if (!intro || intro.opening?.id !== id) return hub;
  let total = 0;
  for (const qty of Object.values(harvest)) {
    if (qty == null) continue;
    if (!Number.isFinite(qty) || qty < 0)
      throw new Error("invalid_initial_harvest");
    total += qty;
  }
  if (!Number.isFinite(total + intro.initialHarvest))
    throw new Error("invalid_initial_harvest");
  const { opening, ...rest } = intro;
  const initialOpened = intro.initialOpened + opening.initialCount;
  const initialHarvest =
    intro.initialHarvest + (opening.initialCount > 0 ? total : 0);
  const award =
    opening.initialCount > 0 &&
    initialOpened === 10 &&
    initialHarvest === 0 &&
    !intro.zeroHarvestAwarded;
  return {
    ...hub,
    credits: hub.credits + (award ? 5_000_000 : 0),
    newGameIntro: {
      ...rest,
      initialOpened,
      initialHarvest,
      zeroHarvestAwarded: intro.zeroHarvestAwarded || award,
      results: [
        ...intro.results,
        {
          id,
          harvest: Object.fromEntries(
            Object.entries(harvest).filter(
              (pair): pair is [string, number] => pair[1] != null,
            ),
          ),
        },
      ],
    },
  };
}

/** Grant the fixed, already recorded result once, never trust a replayed URL bag. */
export function receiveIntroOpening(hub: HubSnapshot, id: string): HubSnapshot {
  const intro = hub.newGameIntro,
    result = intro?.results.find((r) => r.id === id);
  if (!intro || !result) return hub;
  const inventory = { ...hub.inventory };
  for (const [key, value] of Object.entries(result.harvest)) {
    if (!["ammo", "armor", "power", "junk"].includes(key))
      throw new Error("invalid_initial_harvest");
    const k = key as "ammo" | "armor" | "power" | "junk";
    inventory[k] = (inventory[k] ?? 0) + value;
  }
  return {
    ...hub,
    inventory,
    newGameIntro: {
      ...intro,
      // Receipt absence is a no-op, never a fallback to the URL bag. Full
      // receipt history remains in the append-only play log, not this live queue.
      results: intro.results.filter((r) => r.id !== id),
    },
  };
}
