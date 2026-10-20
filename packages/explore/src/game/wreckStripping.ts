import { registerWreckIdentity, shieldIdentityFromWreck, type FieldObjectIdentities } from "@estg/shared";
import type { Vec2 } from "./math";

export const STRIP_SECONDS = 8;
export const STRIPPED_SHIELD_HP = 50; // base; #314 adds the source mech shield circuit effect
export type StrippedCircuit = { circuitId: string; side: number; effect: number };
export type StrippingSource = {
  targetId: string;
  instanceId: string | null;
  circuits: StrippedCircuit[];
  shieldMaxHp?: number; // frozen at operation creation; absence uses the old base of 50
  learningValue: null; // owner Q4=A: unassessed, never invent a score
};
export type StrippingJob = {
  source: StrippingSource;
  wreckKey: string;
  seconds: number;
  reservation: { unitId: string; at: Vec2 } | null;
  completed: boolean;
};
export type StrippingState = { jobs: Record<string, StrippingJob> };
export type StripCompletion = { source: StrippingSource; shieldKey: string; at: Vec2 };

/** Caller checks actual wreck existence, distance and competing carry operations.
 * Reservations belong to a wreck, so progress survives a change of worker.
 */
export function reserveStripping(state: StrippingState, identities: FieldObjectIdentities,
  source: StrippingSource, unitId: string, at: Vec2):
  { status: "started"; identities: FieldObjectIdentities } | { status: "busy" | "consumed" } {
  let job = state.jobs[source.targetId];
  if (job?.completed) return { status: "consumed" };
  if (job?.reservation && job.reservation.unitId !== unitId) return { status: "busy" };
  // Allocate once, at the first actual operation, rather than on every tap.
  if (!job) {
    const wreckKey = `strip-wreck:${identities.nextWreckId}`;
    identities = registerWreckIdentity(identities, wreckKey);
    job = state.jobs[source.targetId] = {
      source: JSON.parse(JSON.stringify(source)) as StrippingSource,
      wreckKey, seconds: 0, reservation: null, completed: false,
    };
  }
  cancelUnitStripping(state, unitId);
  job.reservation = { unitId, at: { ...at } };
  return { status: "started", identities };
}

export function cancelUnitStripping(state: StrippingState | undefined, unitId: string): void {
  for (const job of Object.values(state?.jobs ?? {})) {
    if (job.reservation?.unitId === unitId) job.reservation = null;
  }
}

/** No frame-time guessing: caller supplies the worker's real, post-movement
 * position and validity. Failed/moving/dead operations preserve wreck progress.
 * Successful conversion is prepared before marking completed, so failure cannot
 * consume a wreck or leave an operation partially committed.
 */
export function advanceStripping(state: StrippingState, identities: FieldObjectIdentities,
  targetId: string, worker: { alive: boolean; pos: Vec2 } | null,
  targetAvailable: boolean, targetPos: Vec2, dt: number):
  { identities: FieldObjectIdentities; completion: StripCompletion | null } {
  const job = state.jobs[targetId], reservation = job?.reservation;
  if (!job || job.completed || !reservation) return { identities, completion: null };
  if (!worker?.alive || !targetAvailable || worker.pos.x !== reservation.at.x || worker.pos.y !== reservation.at.y) {
    job.reservation = null;
    return { identities, completion: null };
  }
  if (!Number.isFinite(dt) || dt <= 0) return { identities, completion: null };
  const seconds = Math.min(STRIP_SECONDS, job.seconds + dt);
  if (seconds < STRIP_SECONDS) {
    job.seconds = seconds;
    return { identities, completion: null };
  }
  const shieldKey = `strip-shield:${job.wreckKey}`;
  const hp=job.source.shieldMaxHp ?? STRIPPED_SHIELD_HP;
  const converted = shieldIdentityFromWreck(identities, job.wreckKey, shieldKey,
    { hp, maxHp: hp });
  job.seconds = seconds;
  job.completed = true;
  job.reservation = null;
  return { identities: converted, completion: { source: job.source, shieldKey, at: { ...targetPos } } };
}
