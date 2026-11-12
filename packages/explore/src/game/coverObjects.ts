import type { Vec2 } from "./math";
import type { World } from "./types";
import { fieldRectOf } from "./fieldBounds";

export type CoverObject = { id: string; pos: Vec2; radius: number };

const COVER_COUNT = 10;
export const COVER_RADIUS = 30;
const MIN_SEPARATION = 110;
const SPAWN_AVOID_RADIUS = 170;

const layouts = new WeakMap<object, CoverObject[]>();

export function getCoverObjects(world: World): CoverObject[] {
  const cached = layouts.get(world);
  if (cached) return cached;
  if (Array.isArray(world.coverObjects)) { layouts.set(world, world.coverObjects); return world.coverObjects; }
  const covers: CoverObject[] = [];
  const margin = COVER_RADIUS + 20;
  const rect = fieldRectOf(world.balance);
  const spawn = world.extract?.pos ?? world.leader.pos;
  const spanX = Math.max(1, rect.maxX - rect.minX - margin * 2);
  const spanY = Math.max(1, rect.maxY - rect.minY - margin * 2);
  let attempts = 0;
  while (covers.length < COVER_COUNT && attempts < 1000) {
    attempts += 1;
    const pos = {
      x: rect.minX + margin + Math.random() * spanX,
      y: rect.minY + margin + Math.random() * spanY,
    };
    if (Math.hypot(pos.x - spawn.x, pos.y - spawn.y) < SPAWN_AVOID_RADIUS) continue;
    if (covers.some((cover) => Math.hypot(cover.pos.x - pos.x, cover.pos.y - pos.y) < MIN_SEPARATION)) continue;
    covers.push({ id: `cover-${covers.length}`, pos, radius: COVER_RADIUS });
  }
  layouts.set(world, covers);
  world.coverObjects = covers;
  return covers;
}
