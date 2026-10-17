import { SPAWN_POINT } from "./balance";
import type { Vec2 } from "./math";
import type { World } from "./types";

export type CoverObject = { id: string; pos: Vec2; radius: number };

const COVER_COUNT = 10;
export const COVER_RADIUS = 30;
const MIN_SEPARATION = 110;
const SPAWN = SPAWN_POINT;
const SPAWN_AVOID_RADIUS = 170;

const layouts = new WeakMap<object, CoverObject[]>();

export function getCoverObjects(world: World): CoverObject[] {
  const cached = layouts.get(world);
  if (cached) return cached;
  if (Array.isArray(world.coverObjects)) { layouts.set(world, world.coverObjects); return world.coverObjects; }
  const covers: CoverObject[] = [];
  const margin = COVER_RADIUS + 20;
  let attempts = 0;
  while (covers.length < COVER_COUNT && attempts < 1000) {
    attempts += 1;
    const pos = {
      x: margin + Math.random() * (world.balance.worldW - margin * 2),
      y: margin + Math.random() * (world.balance.worldH - margin * 2),
    };
    if (Math.hypot(pos.x - SPAWN.x, pos.y - SPAWN.y) < SPAWN_AVOID_RADIUS) continue;
    if (covers.some((cover) => Math.hypot(cover.pos.x - pos.x, cover.pos.y - pos.y) < MIN_SEPARATION)) continue;
    covers.push({ id: `cover-${covers.length}`, pos, radius: COVER_RADIUS });
  }
  layouts.set(world, covers);
  world.coverObjects = covers;
  return covers;
}
