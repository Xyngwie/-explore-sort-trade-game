import { wreckCarrierId } from "./carry";
import { isWingmanMobileFor } from "./commandUnlock";
import { dist, type Vec2 } from "./math";
import type { Unit, World } from "./types";

/** Individual wing-ID commands only; ordinary AI and squad circuit orders are not individual origins. */
export function hasIndividualWingOrder(world: World, unit: Unit): boolean {
  const play = world.circuitPlay;
  return !!(unit.individualOrder || unit.holdOrder || play?.wingMove?.[unit.id] ||
    play?.wingRecover?.[unit.id] || play?.wingHold?.[unit.id]?.manual);
}

/**
 * Null means normal movement retains ownership. A position (including the
 * current position) owns movement until boarding ends, without changing the
 * wingman's stance, waypoint, or command state. Use the usual collision/power
 * movement path to reach it, never assign this target directly to unit.pos.
 */
export function boardingAssemblyTarget(world: World, unit: Unit): Vec2 | null {
  const circle = world.boarding;
  if (!circle || world.phase !== "sortie" || unit.kind !== "wingman" || !unit.alive ||
      !isWingmanMobileFor(world, unit.id) || wreckCarrierId(world, unit.id) ||
      hasIndividualWingOrder(world, unit)) return null;
  // moveToward stops within 4 px. Leave both that tolerance and the mech's
  // radius inside the circle: 110 - 14 - 4 = 92 for today's normal mech.
  const innerRadius = Math.max(0, circle.radius - unit.radius - 4);
  const d = dist(unit.pos, circle.center);
  if (d <= innerRadius || d === 0) return { ...unit.pos };
  const ratio = innerRadius / d;
  return {
    x: circle.center.x + (unit.pos.x - circle.center.x) * ratio,
    y: circle.center.y + (unit.pos.y - circle.center.y) * ratio,
  };
}
