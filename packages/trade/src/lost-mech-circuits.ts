/**
 * Circuits on a left-behind mech (HubSave.lostMechs) in the HUB — lostMechs
 * recovery follow-up (2026-10-03 神宮): they stay in HubSave and come back with
 * the mech when it is recovered, but the HUB treats them as out of its hands:
 * not listed, not counted, not sellable, not re-equippable (shared
 * `hubVisibleCircuits` / `isCircuitOnLostMech`). The list filtering is the
 * main guard; these refuse on the processing side as well.
 */
import {
  equipCircuit,
  hubVisibleCircuits,
  isCircuitOnLostMech,
  unequipCircuit,
  type EquipResult,
  type HubSnapshot,
} from "@estg/shared";

/** True when `circuitId` is in HubSave but attached to a left-behind mech. */
export function isHubCircuitOnLostMech(hub: HubSnapshot, circuitId: string | null | undefined): boolean {
  const id = circuitId?.trim();
  if (!id) return false;
  const rec = hub.circuits.find((c) => c.circuitId === id);
  return rec != null && isCircuitOnLostMech(hub, rec);
}

/** HUB 付け替え: refuses circuits on a left-behind mech (and shared's other reasons). */
export function equipHubCircuit(hub: HubSnapshot, circuitId: string, mechInstanceId: string): EquipResult {
  if (isHubCircuitOnLostMech(hub, circuitId)) return { hub, ok: false, reason: "on_lost_mech" };
  return equipCircuit(hub, circuitId, mechInstanceId);
}

/** HUB 取り外し: refuses circuits on a left-behind mech instead of silently doing nothing. */
export function unequipHubCircuit(hub: HubSnapshot, circuitId: string): EquipResult {
  if (isHubCircuitOnLostMech(hub, circuitId)) return { hub, ok: false, reason: "on_lost_mech" };
  if (!hubVisibleCircuits(hub).some((c) => c.circuitId === circuitId.trim())) return { hub, ok: false, reason: "no_circuit" };
  return { hub: unequipCircuit(hub, circuitId), ok: true };
}

/**
 * Alert text for a refused 装備／取り外し (the existing texts). A circuit on a
 * left-behind mech is not listed, so the UI cannot reach `on_lost_mech`; it
 * falls under the existing "not found" text (no new wording — 神宮's call).
 */
export function equipRefusalMessageJa(reason: EquipResult["reason"]): string {
  if (reason === "slot_full") return "その機体の回路枠がいっぱいです。";
  if (reason === "no_mech") return "装備先の機体がありません。";
  return "回路が見つかりません。";
}
