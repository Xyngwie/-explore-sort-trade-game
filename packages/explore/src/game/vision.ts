// EXPLORE_FACING_AIM_V0 PR2 vision-cones: front 60° sees 2× range, the 270° periphery
// (front included) sees range, the rear 90° is blind. Obstacles block sight.
import type { Vec2 } from "./math";
import type { Unit, World } from "./types";
import { getCoverObjects } from "./coverObjects";
import { visionMul } from "./circuitPlay";
import { wrapAngle } from "./facing";

export const FRONT_HALF_RAD = Math.PI / 6; // 60°
export const PERIPHERY_HALF_RAD = (135 * Math.PI) / 180; // 270°
export const FRONT_RANGE_MUL = 2;
/** Lost enemies stay on the map this long. */
export const LAST_SEEN_SEC = 5;

/** Base range for this viewer (circuits scale front and periphery alike). */
export function viewRange(world: World, u: Unit): number {
  const mul = u.kind === "enemy" ? 1 : visionMul(world, u.id);
  return world.balance.visionRange * mul;
}

/** Segment a→b passes through an obstacle (one that holds neither end). */
export function sightBlocked(world: World, a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  for (const c of getCoverObjects(world)) {
    const r2 = c.radius * c.radius;
    if ((a.x - c.pos.x) ** 2 + (a.y - c.pos.y) ** 2 <= r2) continue;
    if ((b.x - c.pos.x) ** 2 + (b.y - c.pos.y) ** 2 <= r2) continue;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((c.pos.x - a.x) * dx + (c.pos.y - a.y) * dy) / len2)) : 0;
    const px = a.x + dx * t - c.pos.x, py = a.y + dy * t - c.pos.y;
    if (px * px + py * py < r2) return true;
  }
  return false;
}

/** Can this one unit see `pos` right now (cone + range + line of sight)? */
export function canSee(world: World, u: Unit, pos: Vec2): boolean {
  if (!u.alive) return false;
  const dx = pos.x - u.pos.x, dy = pos.y - u.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return true;
  const rel = Math.abs(wrapAngle(Math.atan2(dy, dx) - u.heading));
  const R = viewRange(world, u);
  const lim = rel <= FRONT_HALF_RAD ? R * FRONT_RANGE_MUL : rel <= PERIPHERY_HALF_RAD ? R : 0;
  if (d > lim) return false;
  return !sightBlocked(world, u.pos, pos);
}

export type SquadIntel = {
  /** Enemy ids some living ally sees this tick (shared by all allies). */
  visible: string[];
  /** Last seen position of lost enemies; dropped after LAST_SEEN_SEC. */
  lastSeen: Record<string, { pos: Vec2; t: number }>;
};

export function squadIntel(world: World): SquadIntel {
  if (!world.squadIntel) world.squadIntel = { visible: [], lastSeen: {} };
  world.squadIntel.visible ??= [];
  world.squadIntel.lastSeen ??= {};
  return world.squadIntel;
}

export function squadSees(world: World, pos: Vec2): boolean {
  return [world.leader, ...world.wingmen].some((u) => u?.alive && canSee(world, u, pos));
}

/** Refresh the shared squad knowledge (call once per tick, after facing). */
export function updateSquadIntel(world: World): void {
  const intel = squadIntel(world);
  const was = new Set(intel.visible);
  const now: string[] = [];
  for (const e of world.enemies) {
    if (!e.alive) continue;
    if (squadSees(world, e.pos)) now.push(e.id);
  }
  const nowSet = new Set(now);
  for (const id of was) {
    if (nowSet.has(id)) continue;
    const e = world.enemies.find((x) => x.id === id);
    if (e?.alive) intel.lastSeen[id] = { pos: { ...e.pos }, t: world.elapsed };
  }
  for (const id of now) delete intel.lastSeen[id];
  for (const [id, m] of Object.entries(intel.lastSeen)) {
    const e = world.enemies.find((x) => x.id === id);
    if (world.elapsed - m.t > LAST_SEEN_SEC || !e?.alive) delete intel.lastSeen[id];
  }
  intel.visible = now;
}

export function enemyVisibleToSquad(world: World, e: Unit): boolean {
  return squadIntel(world).visible.includes(e.id);
}

/** 0..1 fade of a last-seen marker (1 = just lost). */
export function lastSeenFade(world: World, t: number): number {
  return Math.max(0, 1 - (world.elapsed - t) / LAST_SEEN_SEC);
}
