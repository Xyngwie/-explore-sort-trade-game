// EXPLORE_FACING_AIM_V0 PR1: facing is independent of movement; the muzzle is fixed forward.
import type { Unit, World } from "./types";
import { loadSpeedRatio, unitLoad, wreckCarrierId } from "./carry";

/** 90°/s, moving or stopped. Cargo slows it by the movement ratio. Uses no activity. */
export const TURN_RATE_RAD = Math.PI / 2;
/** 3° firing arc (1.5° each side). */
export const FIRE_HALF_ARC_RAD = (1.5 * Math.PI) / 180;

export function wrapAngle(a: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function turnRate(world: World, u: Unit): number {
  return wreckCarrierId(world, u.id) ? TURN_RATE_RAD : TURN_RATE_RAD * loadSpeedRatio(unitLoad(world, u));
}

/** Movement wants to face its travel direction (lower priority than aim). */
export function noteMoveHeading(u: Unit, angle: number): void {
  u.moveHeading = angle;
}

/** Ask to face the target; true when it is inside the 3° arc now. */
export function aimAt(u: Unit, target: Unit): boolean {
  const a = Math.atan2(target.pos.y - u.pos.y, target.pos.x - u.pos.x);
  u.aimWant = a;
  return Math.abs(wrapAngle(a - u.heading)) <= FIRE_HALF_ARC_RAD;
}

export function turnToward(u: Unit, want: number, rate: number, dt: number): void {
  const d = wrapAngle(want - u.heading);
  const step = rate * dt;
  u.heading = wrapAngle(Math.abs(d) <= step ? want : u.heading + Math.sign(d) * step);
}

export function updateFacing(world: World, dt: number): void {
  for (const u of [world.leader, ...world.wingmen, ...world.enemies]) {
    if (!u) continue;
    const riding = wreckCarrierId(world, u.id) != null;
    // Q1=A: a mounted unit keeps its own facing when idle, including old checkpoints.
    if (riding) u.moveHeading = null;
    const want = u.aimWant ?? (riding ? null : u.moveHeading);
    u.aimWant = null;
    if (!u.alive || want == null) continue;
    turnToward(u, want, turnRate(world, u), dt);
  }
}
