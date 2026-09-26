import { getCoverObjects, type CoverObject } from "./coverObjects";
import type { Unit, World } from "./types";

const COVER_ATTRACT_TRIGGER = 18;
const COVER_ATTRACT_SPEED = 55;
const COVER_ESCAPE_GRACE_SEC = 0.35;

function nearestCover(world: World, unit: Unit): CoverObject | null {
  let nearest: CoverObject | null = null;
  let best = Infinity;
  for (const cover of getCoverObjects(world)) {
    const dx = unit.pos.x - cover.pos.x;
    const dy = unit.pos.y - cover.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < best) {
      best = d;
      nearest = cover;
    }
  }
  return nearest;
}

/** Provisional cover entry/exit rule. Call before normal movement is applied. */
export function updateCoverMovement(
  world: World,
  unit: Unit,
  moveX: number,
  moveY: number,
  dt: number,
): { moveX: number; moveY: number } {
  if (!unit.alive) return { moveX, moveY };

  unit.coverEscapeT = Math.max(0, unit.coverEscapeT - dt);
  const cover = nearestCover(world, unit);
  if (!cover) {
    unit.inCover = false;
    unit.coverId = null;
    return { moveX, moveY };
  }

  const dx = cover.pos.x - unit.pos.x;
  const dy = cover.pos.y - unit.pos.y;
  const distance = Math.hypot(dx, dy);
  const boundary = Math.max(0, cover.radius - unit.radius);
  const moving = Math.hypot(moveX, moveY) > 0.01;
  const outward = moving && (moveX * dx + moveY * dy) < 0;

  // Leaving cover always wins: never pull the unit back while moving outward.
  if (unit.inCover && outward) {
    unit.inCover = false;
    unit.coverId = null;
    unit.coverEscapeT = COVER_ESCAPE_GRACE_SEC;
    return { moveX, moveY };
  }

  if (distance <= boundary) {
    unit.inCover = true;
    unit.coverId = cover.id;
    return { moveX, moveY };
  }

  if (unit.coverEscapeT > 0 || !moving || outward) {
    return { moveX, moveY };
  }

  // Near a cover, gently bias movement toward its center.
  if (distance <= cover.radius + COVER_ATTRACT_TRIGGER) {
    const nx = dx / Math.max(distance, 0.001);
    const ny = dy / Math.max(distance, 0.001);
    return {
      moveX: moveX + nx * COVER_ATTRACT_SPEED * dt,
      moveY: moveY + ny * COVER_ATTRACT_SPEED * dt,
    };
  }

  return { moveX, moveY };
}
