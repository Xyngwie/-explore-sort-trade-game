/** PR3: HUB fleet card gauge inputs (display only). */
import { mechAmmoCap, mechGaugeModel, type HubSnapshot, type MechGaugeModel, type OwnedMech } from "@estg/shared";
export function hubMechGaugeModel(hub: Pick<HubSnapshot, "circuits">, m: OwnedMech, leaderId?: string | null): MechGaugeModel {
  // Detail 8: the leader is the first selected deploy mech (same rule as Explore world.ts / firstSortieError).
  const cap = mechAmmoCap(hub, m.instanceId);
  return mechGaugeModel({
    armor: [m.durability, m.durabilityMax],
    power: m.battery ? [m.battery.activity, m.battery.capacity] : null,
    ammo: [m.currentAmmo == null ? cap : m.currentAmmo, cap],
    destroyed: m.status !== "operational" && m.status !== "needs_repair",
    leader: leaderId != null && m.instanceId === leaderId,
  });
}
