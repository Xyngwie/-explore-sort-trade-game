/** HUB charging: one stock power part restores one base activity point. */
import type { HubSnapshot } from "./hub-save";
export function chargeMechPower(hub: HubSnapshot, instanceId: string): { hub: HubSnapshot; spent: number; gained: number; reason?: "no_mech" | "full" | "no_power" } {
  const mech = hub.fleet.find(m => m.instanceId === instanceId);
  if (!mech) return { hub, spent: 0, gained: 0, reason: "no_mech" };
  const missing = Math.max(0, mech.battery.capacity - mech.battery.activity);
  if (missing <= 0) return { hub, spent: 0, gained: 0, reason: "full" };
  const stock = Math.max(0, Math.floor(hub.inventory.power ?? 0));
  const spent = Math.min(stock, Math.ceil(missing));
  if (!spent) return { hub, spent: 0, gained: 0, reason: "no_power" };
  const gained = Math.min(missing, spent);
  return { spent, gained, hub: { ...hub, inventory: { ...hub.inventory, power: stock - spent }, fleet: hub.fleet.map(m => m.instanceId === instanceId ? { ...m, battery: { ...m.battery, activity: Math.min(m.battery.capacity, m.battery.activity + gained) } } : m) } };
}
