/**
 * Sortie from Invade takes the squad along (STATUS 項目15 decision: "Invade
 * からの出撃も部隊を連れて出る。Explore は HubSave を直接読む"). Invade's
 * explore link carries only the sector (sectorX / sectorY / density / intel /
 * engage). When such a link has no deploy keys, Explore builds them from
 * HubSave the same way trade's 出撃 link does: the hangar's sortie selection
 * (`resolveSortieSelection`, ≤3 deployable mechs) with their durability,
 * carried ammo, battery, equipped circuits and circuit bonuses.
 */
import {
  aggregateCircuitBonuses,
  ammoTotal,
  buildMechCircuitsForDeploy,
  buildTradeToExplorePayloadFromFleet,
  buildTradeToExploreUrl,
  parseInvadeToExploreSearch,
  parseTradeToExploreSearch,
  resolveSortieSelection,
  type HubSnapshot,
} from "@estg/shared";

/**
 * Deploy query for an Invade sortie link without deploy keys, built from
 * HubSave; null when the link already has a squad, is not from Invade, or
 * there is no save / nobody can sortie.
 */
export function invadeSquadSearch(search: string, hub: HubSnapshot | null): string | null {
  if (!hub || parseInvadeToExploreSearch(search) == null) return null;
  const inbound = parseTradeToExploreSearch(search);
  if ((inbound?.deployedInstanceIds ?? []).length > 0) return null;
  const ids = resolveSortieSelection(hub);
  if (ids.length === 0) return null;
  const payload = buildTradeToExplorePayloadFromFleet(hub.fleet, ammoTotal(hub.ammoLoad), ids);
  if ((payload.deployedInstanceIds ?? []).length === 0) return null;
  const mechCircuits = buildMechCircuitsForDeploy(hub, payload.deployedInstanceIds ?? []);
  if (Object.keys(mechCircuits).length > 0) payload.mechCircuits = mechCircuits;
  const bonuses = aggregateCircuitBonuses(hub.circuits ?? []);
  if (bonuses.durabilityBuffer > 0 || bonuses.craftMultiplier > 1 || bonuses.repairDiscount > 0) {
    payload.circuitBonuses = {
      craftMultiplier: bonuses.craftMultiplier,
      repairDiscount: bonuses.repairDiscount,
      durabilityBuffer: bonuses.durabilityBuffer,
    };
  }
  const params = new URL(buildTradeToExploreUrl(payload, "https://estg.invalid/explore/")).searchParams;
  // keep every original key (sector / engage / intel …); deploy keys come from HubSave
  const original = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  original.forEach((v, k) => {
    if (!params.has(k)) params.set(k, v);
  });
  const out = params.toString();
  return out ? `?${out}` : "";
}
