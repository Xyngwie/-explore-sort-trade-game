import { wreckWasStripped } from "./strippingRuntime";
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
  /** Per fog cell: elapsed time it was last watched (-1 = never seen). */
  fogT: number[];
  /** Faint images of static objects (containers, wrecks, enemy supplies), keyed by kind:id. */
  ghosts: Record<string, Ghost>;
};

export type GhostKind = "container" | "enemyWreck" | "allyWreck" | "supply" | "stray" | "drop";
export type Ghost = { kind: GhostKind; id: string; pos: Vec2; t: number };

/** Fog returns to grey over this long once nobody watches a place. */
export const FOG_RETURN_SEC = 60;
/** Faint image opacity. */
export const GHOST_ALPHA = 0.35;
/** Info older than this is not trusted by the AI. */
export const GHOST_TRUST_SEC = 120;

export function squadIntel(world: World): SquadIntel {
  if (!world.squadIntel) world.squadIntel = { visible: [], lastSeen: {}, fogT: [], ghosts: {} };
  const s = world.squadIntel;
  s.visible ??= [];
  s.lastSeen ??= {};
  s.ghosts ??= {};
  const n = fogCols(world) * fogRows(world);
  if (!Array.isArray(s.fogT) || s.fogT.length !== n) s.fogT = Array.from({ length: n }, (_, i) => (Array.isArray(s.fogT) && typeof s.fogT[i] === "number" ? s.fogT[i]! : -1));
  return s;
}

export function squadSees(world: World, pos: Vec2): boolean {
  return [world.leader, ...world.wingmen].some((u) => u?.alive && canSee(world, u, pos));
}

export function fogCols(world: World): number { return Math.ceil(world.balance.worldW / world.balance.fogCell); }
export function fogRows(world: World): number { return Math.ceil(world.balance.worldH / world.balance.fogCell); }
export function fogCellCenter(world: World, i: number): Vec2 {
  const cols = fogCols(world), c = world.balance.fogCell;
  return { x: (i % cols) * c + c / 2, y: Math.floor(i / cols) * c + c / 2 };
}
/** 0 = watched now (black ground) … 1 = full grey fog. */
export function fogGrey(world: World, i: number): number {
  const t = squadIntel(world).fogT[i] ?? -1;
  if (t < 0) return 1;
  return Math.max(0, Math.min(1, (world.elapsed - t) / FOG_RETURN_SEC));
}

/** Static objects that exist on the field right now, keyed like ghosts. */
function presentStatics(world: World): Ghost[] {
  const out: Ghost[] = [];
  for (const c of world.containers) if (c.discovered && !c.taken) out.push({ kind: "container", id: c.id, pos: c.pos, t: 0 });
  for (const e of world.enemies) if (!wreckWasStripped(world,e.id) && !e.alive && !e.enemyState?.recovered) out.push({ kind: "enemyWreck", id: e.id, pos: e.pos, t: 0 });
  for (const u of world.wingmen) if (!wreckWasStripped(world,u.id) && !u.alive && u.instanceId && !(world.recoveredWreckUnitIds ?? []).includes(u.id)) out.push({ kind: "allyWreck", id: u.id, pos: u.pos, t: 0 });
  if (!wreckWasStripped(world,world.leader.id) && !world.leader.alive && world.leader.instanceId && !(world.recoveredWreckUnitIds ?? []).includes(world.leader.id)) out.push({ kind: "allyWreck", id: world.leader.id, pos: world.leader.pos, t: 0 });
  for (const d of world.enemySupplies ?? []) out.push({ kind: "supply", id: d.id, pos: d.pos, t: 0 });
  const recLost = new Set(world.recoveredLostMechIds ?? []), recDrop = new Set(world.recoveredDropIds ?? []);
  for (const m of world.strandedMechs ?? []) if (!wreckWasStripped(world,`s:${m.instanceId}`) && m.found !== false && !recLost.has(m.instanceId)) out.push({ kind: "stray", id: m.instanceId, pos: m.pos, t: 0 });
  for (const d of world.strandedDrops ?? []) if (d.found !== false && !recDrop.has(d.dropId)) out.push({ kind: "drop", id: d.dropId, pos: d.pos, t: 0 });
  return out;
}
const gkey = (g: { kind: GhostKind; id: string }) => `${g.kind}:${g.id}`;

/** Fog and faint images: watched cells go black; seen statics refresh their image; a watched spot whose object is gone drops it. */
export function updateSquadMemory(world: World): void {
  const intel = squadIntel(world);
  for (let i = 0; i < intel.fogT.length; i++) if (squadSees(world, fogCellCenter(world, i))) intel.fogT[i] = world.elapsed;
  const present = new Map(presentStatics(world).map((g) => [gkey(g), g]));
  for (const [k, g] of present) if (squadSees(world, g.pos)) intel.ghosts[k] = { kind: g.kind, id: g.id, pos: { ...g.pos }, t: world.elapsed };
  for (const [k, g] of Object.entries(intel.ghosts)) {
    const now = present.get(k);
    if (squadSees(world, g.pos) && (!now || Math.hypot(now.pos.x - g.pos.x, now.pos.y - g.pos.y) > 1)) delete intel.ghosts[k];
  }
}

export function ghostOf(world: World, kind: GhostKind, id: string): Ghost | null {
  return squadIntel(world).ghosts[`${kind}:${id}`] ?? null;
}

/** AI trust in a faint image: 1 fresh … 0 at GHOST_TRUST_SEC and older (not trusted). */
export function ghostTrust(world: World, g: Ghost): number {
  return Math.max(0, 1 - (world.elapsed - g.t) / GHOST_TRUST_SEC);
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
