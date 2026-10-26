import { dropFriendlyWreckSupplies } from "./wreckSupplies";
/** Movement costs one effective activity point per second, independent of load. */
import { effectiveBatteryCapacity, placeCarried } from "./circuitPlay";
import { wreckCarrierId } from "./carry";
import { pushLog } from "./orders";
import type { Unit, World } from "./types";

const releasedAfter = new WeakMap<World, Map<string, number>>();
export function beginMovementPowerTick(world: World): void { releasedAfter.set(world, new Map()); }

export function effectiveActivity(world: World, unit: Unit): number | null {
  const b = unit.instanceId ? world.mechBattery[unit.instanceId] : null;
  if (!b) return null; // Legacy/dev URL with no battery: never invent a return value.
  return Math.max(0, b.activity / b.capacity * (effectiveBatteryCapacity(world, unit) ?? b.capacity));
}
export function movementTimeAvailable(world: World, unit: Unit, dt: number): number {
  if (wreckCarrierId(world, unit.id)) return 0;
  const available = Math.max(0, dt - (releasedAfter.get(world)?.get(unit.id) ?? 0));
  return Math.min(available, effectiveActivity(world, unit) ?? available);
}
export function consumeMovementPower(world: World, unit: Unit, seconds: number): void {
  if (seconds <= 0 || !unit.instanceId || wreckCarrierId(world, unit.id)) return;
  const b = world.mechBattery[unit.instanceId];
  if (!b) return;
  const capacity = effectiveBatteryCapacity(world, unit) ?? b.capacity;
  b.activity = Math.max(0, b.activity - seconds * b.capacity / capacity);
  if (b.activity <= 1e-8) {
    for (const id of world.circuitPlay?.carry[unit.id] ?? []) releasedAfter.get(world)?.set(id, seconds);
  }
  expireEmptyBatteries(world);
}
/** An empty powered mech becomes a wreck. Its living passengers dismount. */
export function expireEmptyBatteries(world: World): void {
  let changed = false;
  for (const u of [world.leader, ...world.wingmen]) {
    const b = u.instanceId ? world.mechBattery[u.instanceId] : null;
    if (!u.alive || !b || b.activity > 1e-8) continue;
    b.activity = 0;
    dropFriendlyWreckSupplies(world,u);
    u.alive = false; u.hp = 0;
    u.vel = { x: 0, y: 0 }; u.moveTarget = null; u.salvageId = null; u.salvageT = 0;
    pushLog(world, `${u.name}：活動量が尽きて残骸化。`);
    changed = true;
  }
  if (changed) placeCarried(world);
}
