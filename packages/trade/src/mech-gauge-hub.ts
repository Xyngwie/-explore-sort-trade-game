/** PR3: HUB fleet card gauge inputs (display only). */
import { mechAmmoCap, mechGaugeModel, type HubSnapshot, type MechGaugeModel, type OwnedMech } from "@estg/shared";
export function hubMechGaugeModel(hub: Pick<HubSnapshot, "circuits">, m: OwnedMech): MechGaugeModel {
  const cap = mechAmmoCap(hub, m.instanceId);
  return mechGaugeModel({
    armor: [m.durability, m.durabilityMax],
    power: m.battery ? [m.battery.activity, m.battery.capacity] : null,
    ammo: [m.currentAmmo == null ? cap : m.currentAmmo, cap],
    destroyed: m.status !== "operational" && m.status !== "needs_repair",
  });
}
