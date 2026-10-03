/**
 * 再出撃 (2026-10-03 参謀の決定・案 A): rebuild the squad from HubSave after the
 * direct save. Mechs = those of the previous sortie that can still sortie
 * (`canDeploy`: lost mechs are no longer in `fleet`, wrecked ones are
 * `destroyed`), with their saved carried ammo, durability and battery.
 * Since item 15 (2026-10-03) the squad follows the hangar's saved sortie
 * selection (`HubSave.sortieSelection`, resolved by `resolveSortieSelection`:
 * selected mechs that can still sortie, in fleet order, ≤3; no selection left →
 * the first 3 deployable) — the same value the hangar shows, so 再出撃 and the
 * hangar never disagree. Without a save holding this return, it falls back to
 * the previous deploy's mechs.
 */
import {
  HANDOFF_QUERY_KEYS,
  applyExploreReturnToHub,
  buildTradeToExplorePayloadFromFleet,
  buildTradeToExploreUrl,
  createOwnedMech,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  parseTradeToExploreSearch,
  resolveSortieSelection,
  INITIAL_HUB,
  type ExploreToHubWearPayload,
  type HubSnapshot,
} from "@estg/shared";
import type { World } from "./types";

type Store = Pick<Storage, "getItem">;

/**
 * Hub to rebuild from: the saved HubSave when it already holds this return
 * (direct save happened); otherwise the previous deploy URL's mechs with the
 * same return applied in memory (local dev cross-origin / no save).
 */
export function hubForResortie(
  originalSearch: string,
  world: Pick<World, "deployedInstanceIds" | "deployedDurability" | "mechBattery">,
  payload: ExploreToHubWearPayload,
  storage?: Store | null,
): HubSnapshot {
  return resortieSource(originalSearch, world, payload, storage).hub;
}

/**
 * Hub + squad for 再出撃. From the save: the hangar's sortie selection
 * (`resolveSortieSelection`; left-behind / non-deployable mechs dropped).
 * Without it: the previous deploy's mechs.
 */
export function resortiePlan(
  originalSearch: string,
  world: Pick<World, "deployedInstanceIds" | "deployedDurability" | "mechBattery">,
  payload: ExploreToHubWearPayload,
  storage?: Store | null,
): { hub: HubSnapshot; ids: string[]; fromSave: boolean } {
  const src = resortieSource(originalSearch, world, payload, storage);
  const ids = src.fromSave ? resolveSortieSelection(src.hub) : [...world.deployedInstanceIds];
  return { ...src, ids };
}

function resortieSource(
  originalSearch: string,
  world: Pick<World, "deployedInstanceIds" | "deployedDurability" | "mechBattery">,
  payload: ExploreToHubWearPayload,
  storage?: Store | null,
): { hub: HubSnapshot; fromSave: boolean } {
  const loaded = loadHubSaveFromLocalStorage(storage ?? undefined);
  const saved = loaded?.hub ? normalizeHubSnapshot(loaded.hub) : null;
  if (saved && payload.sortieId && (saved.appliedSortieIds ?? []).includes(payload.sortieId)) {
    return { hub: saved, fromSave: true };
  }
  const inbound = parseTradeToExploreSearch(originalSearch);
  const ammoById = new Map((inbound?.mechCurrentAmmo ?? []).map((r) => [r.instanceId, r.currentAmmo]));
  const fleet = world.deployedInstanceIds.map((id) => {
    const ammo = ammoById.get(id);
    const mech = createOwnedMech("mech_gen1", {
      instanceId: id,
      durability: world.deployedDurability[id] ?? 100,
      ...(ammo != null ? { currentAmmo: ammo } : {}),
    });
    const battery = world.mechBattery[id];
    return battery ? { ...mech, battery: { ...battery } } : mech;
  });
  const synthetic = normalizeHubSnapshot({ ...INITIAL_HUB, fleet });
  return { hub: applyExploreReturnToHub(synthetic, payload).hub, fromSave: false };
}

/**
 * Deploy query for 再出撃 (`ids` from `resortiePlan`). Returns null when none
 * of them can sortie. Keeps the original Invade sector params, circuits and
 * circuit bonuses of the mechs that go out again.
 */
export function resortieSearch(
  originalSearch: string,
  hub: HubSnapshot,
  previousIds: readonly string[],
): { search: string; deployedInstanceIds: string[] } | null {
  const inbound = parseTradeToExploreSearch(originalSearch);
  const startingAmmo = inbound?.startingAmmo ?? 0;
  const payload = buildTradeToExplorePayloadFromFleet(hub.fleet, startingAmmo, previousIds);
  const deployedInstanceIds = payload.deployedInstanceIds ?? [];
  if (deployedInstanceIds.length === 0) return null;
  const keep = new Set(deployedInstanceIds);
  if (inbound?.mechCircuits) {
    const mechCircuits = Object.fromEntries(
      Object.entries(inbound.mechCircuits).filter(([id]) => keep.has(id)),
    );
    if (Object.keys(mechCircuits).length > 0) payload.mechCircuits = mechCircuits;
  }
  if (inbound?.circuitBonuses) payload.circuitBonuses = inbound.circuitBonuses;
  const params = new URL(buildTradeToExploreUrl(payload, "https://estg.invalid/explore/")).searchParams;
  const original = new URLSearchParams(originalSearch);
  for (const key of HANDOFF_QUERY_KEYS.invadeToExplore) {
    const v = original.get(key);
    if (v != null) params.set(key, v);
  }
  const search = params.toString();
  return { search: search ? `?${search}` : "", deployedInstanceIds };
}
