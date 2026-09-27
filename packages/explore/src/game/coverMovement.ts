import { dist, dot, norm, type Vec2 } from "./math";
import { getCoverObjects } from "./coverObjects";
import type { Unit, World } from "./types";

const COVER_ESCAPE_GRACE_SEC = 0.35;
const COVER_SNAP_MARGIN = 8;

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

export function updateCoverMovement(world: World, unit: Unit, moveInput: Vec2, dt: number): void {
  if (!unit.alive) return;
  const state = stateFor(unit);
  state.escapeT = Math.max(0, state.escapeT - dt);

  const covers = getCoverObjects(world);
  if (unit.inCover) {
    const active = covers.find((cover) => cover.id === state.coverId);
    if (!active) {
      unit.inCover = false;
      state.coverId = null;
      return;
    }
    const delta = { x: active.pos.x - unit.pos.x, y: active.pos.y - unit.pos.y };
    const moving = Math.hypot(moveInput.x, moveInput.y) > 0.01;
    const outward = moving && dot(norm(moveInput), norm(delta)) < -0.2;
    if (outward) {
      unit.inCover = false;
      state.coverId = null;
      state.escapeT = COVER_ESCAPE_GRACE_SEC;
    }
    return;
  }

  if (state.escapeT > 0) return;

  let nearest: ReturnType<typeof getCoverObjects>[number] | null = null;
  let nearestDistance = Infinity;
  for (const cover of covers) {
    const d = dist(unit.pos, cover.pos);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = cover;
    }
  }
  if (!nearest) return;

  // Cover entry is a hard teleport, not an attraction animation. The extra
  // margin makes the trigger reliable at the visible edge of the object even
  // when the player crosses the boundary between simulation frames.
  const snapRadius = nearest.radius + unit.radius + COVER_SNAP_MARGIN;
  if (nearestDistance > snapRadius) return;

  unit.pos = { x: nearest.pos.x, y: nearest.pos.y };
  unit.vel = { x: 0, y: 0 };
  unit.moveTarget = { x: nearest.pos.x, y: nearest.pos.y };
  unit.inCover = true;
  state.coverId = nearest.id;
  state.escapeT = 0;
}
