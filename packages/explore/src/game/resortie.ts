/**
 * 再出撃 (2026-10-03 参謀の決定・案 A): rebuild the squad from HubSave after the
 * direct save. Mechs = those of the previous sortie that can still sortie
 * (`canDeploy`: lost mechs are no longer in `fleet`, wrecked ones are
 * `destroyed`), with their saved carried ammo, durability and battery.
 * Once STATUS item 15 (hangar sortie selection) exists, 再出撃 should follow
 * that selection instead of "the previous sortie's mechs".
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
  const loaded = loadHubSaveFromLocalStorage(storage ?? undefined);
  const saved = loaded?.hub ? normalizeHubSnapshot(loaded.hub) : null;
  if (saved && payload.sortieId && (saved.appliedSortieIds ?? []).includes(payload.sortieId)) {
    return saved;
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
  return applyExploreReturnToHub(synthetic, payload).hub;
}

/**
 * Deploy query for 再出撃. Returns null when none of the previous sortie's
 * mechs can sortie. Keeps the original Invade sector params, circuits and
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
