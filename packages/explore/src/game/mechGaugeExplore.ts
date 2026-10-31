/** PR3: Explore panel gauge inputs (display only; reads world, never writes). */
import { mechGaugeModel, type MechGaugeModel } from "@estg/shared";
import type { Unit, World } from "./types";
import { effectiveBatteryCapacity, sortieAmmoCap, usableAmmo } from "./circuitPlay";
import { effectiveActivity } from "./power";
export function exploreMechGaugeModel(world: World, u: Unit): MechGaugeModel {
  const act = effectiveActivity(world, u);
  const cap = u.instanceId ? (effectiveBatteryCapacity(world, u) ?? world.mechBattery[u.instanceId]?.capacity ?? null) : null;
  const hasAmmo = u.instanceId != null && world.currentAmmo[u.instanceId] != null;
  return mechGaugeModel({
    armor: [u.hp, u.maxHp],
    power: act == null || cap == null ? null : [act, cap],
    ammo: hasAmmo ? [usableAmmo(world, u), sortieAmmoCap(world, u)] : null,
    destroyed: !u.alive,
    leader: u.kind === "leader",
  });
}
