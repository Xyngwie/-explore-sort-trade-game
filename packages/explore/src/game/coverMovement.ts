import { dist, dot, norm, type Vec2 } from "./math";
import { getCoverObjects } from "./coverObjects";
import type { Unit, World } from "./types";

const COVER_ATTRACT_TRIGGER = 18;
const COVER_ATTRACT_SPEED = 55;
const COVER_ESCAPE_GRACE_SEC = 0.35;
const COVER_ESCAPE_RELEASE_MARGIN = 6;

type CoverState = { coverId: string | null; escapeT: number };
const states = new WeakMap<Unit, CoverState>();

function stateFor(unit: Unit): CoverState {
  let state = states.get(unit);
  if (!state) {
    state = { coverId: null, escapeT: 0 };
    states.set(unit, state);
  }
  return state;
}

/** Apply the provisional cover magnet / escape rule before normal movement. */
export function updateCoverMovement(
  world: World,
  unit: Unit,
  moveInput: Vec2,
  dt: number,
): void {
  if (!unit.alive) return;

  const state = stateFor(unit);
  state.escapeT = Math.max(0, state.escapeT - dt);

  let nearest: ReturnType<typeof getCoverObjects>[number] | null = null;
  let nearestDistance = Infinity;
  for (const cover of getCoverObjects(world)) {
    const d = dist(unit.pos, cover.pos);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = cover;
    }
  }

  if (!nearest) {
    unit.inCover = false;
    state.coverId = null;
    return;
  }

  const delta = { x: nearest.pos.x - unit.pos.x, y: nearest.pos.y - unit.pos.y };
  const centerDistance = Math.hypot(delta.x, delta.y);
  const coverBoundary = Math.max(0, nearest.radius - unit.radius);
  const moving = Math.hypot(moveInput.x, moveInput.y) > 0.01;
  const outward = moving && dot(norm(moveInput), norm(delta)) < -0.2;

  if (unit.inCover) {
    if (outward) {
      unit.inCover = false;
      state.coverId = null;
      state.escapeT = COVER_ESCAPE_GRACE_SEC;
    }
    return;
  }

  if (state.escapeT > 0 || !moving || outward) return;
  if (centerDistance > nearest.radius + COVER_ATTRACT_TRIGGER) return;

  const pull = norm(delta);
  unit.moveTarget = {
    x: unit.pos.x + pull.x * COVER_ATTRACT_SPEED * dt,
    y: unit.pos.y + pull.y * COVER_ATTRACT_SPEED * dt,
  };

  if (centerDistance <= coverBoundary) {
    unit.inCover = true;
    state.coverId = nearest.id;
  }
}
