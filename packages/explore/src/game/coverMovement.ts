import { dist, dot, norm, type Vec2 } from "./math";
import { getCoverObjects } from "./coverObjects";
import type { Unit, World } from "./types";

const COVER_ESCAPE_GRACE_SEC = 0.35;
const COVER_SNAP_MARGIN = 8;
const COVER_REENTRY_DISTANCE = 100;

type CoverState = {
  coverId: string | null;
  blockedCoverId: string | null;
  escapeT: number;
};
const states = new WeakMap<Unit, CoverState>();

function stateFor(unit: Unit): CoverState {
  let state = states.get(unit);
  if (!state) {
    state = { coverId: null, blockedCoverId: null, escapeT: 0 };
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

    // Any deliberate movement while covered is an explicit request to leave.
    const moving = Math.hypot(moveInput.x, moveInput.y) > 0.01;
    const targetLeavesCover = unit.moveTarget != null && dist(unit.moveTarget, active.pos) > 2;
    const delta = { x: active.pos.x - unit.pos.x, y: active.pos.y - unit.pos.y };
    const outward = moving && dot(norm(moveInput), norm(delta)) < -0.2;
    if (moving || targetLeavesCover || outward) {
      unit.inCover = false;
      state.coverId = null;
      // Do not allow the same cover to immediately reclaim the unit.
      state.blockedCoverId = active.id;
      state.escapeT = COVER_ESCAPE_GRACE_SEC;
      return;
    }
    return;
  }

  if (state.escapeT > 0) return;

  // The cover just left remains disabled until another cover is entered or
  // the unit deliberately moves at least 100px away from it.
  if (state.blockedCoverId) {
    const blocked = covers.find((cover) => cover.id === state.blockedCoverId);
    if (!blocked || dist(unit.pos, blocked.pos) >= COVER_REENTRY_DISTANCE) {
      state.blockedCoverId = null;
    }
  }

  let nearest: ReturnType<typeof getCoverObjects>[number] | null = null;
  let nearestDistance = Infinity;
  for (const cover of covers) {
    const d = dist(unit.pos, cover.pos);
    if (cover.id === state.blockedCoverId && d < COVER_REENTRY_DISTANCE) continue;
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = cover;
    }
  }
  if (!nearest) return;

  const snapRadius = nearest.radius + unit.radius + COVER_SNAP_MARGIN;
  if (nearestDistance > snapRadius) return;

  unit.pos = { x: nearest.pos.x, y: nearest.pos.y };
  unit.vel = { x: 0, y: 0 };
  unit.moveTarget = { x: nearest.pos.x, y: nearest.pos.y };
  unit.inCover = true;
  state.coverId = nearest.id;
  // Entering a different cover clears the previous cover lockout.
  state.blockedCoverId = null;
  state.escapeT = 0;
}
