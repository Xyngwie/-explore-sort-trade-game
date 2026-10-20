import { obstacleMove, updateCoverMovement } from "./coverMovement";
import { showCombatFeedback } from "./combatFeedback";
/** Enemy PR2–PR5. Runtime state is included in the existing sortie checkpoint. */
import { canSee } from "./vision";
import { noteMoveHeading } from "./facing";
import { effectRate, cargoSlotBonus, rankEnemyMultiplier, type HubSnapshot } from "@estg/shared";
import { makeEnemyIdentity, type EnemyCircuitData } from "./enemyIdentity";
import { dist, clamp, type Vec2 } from "./math";
import type { Unit, World } from "./types";
import { BALANCE } from "./balance";
import { sortieAmmoCap, effectiveBatteryCapacity } from "./circuitPlay";
import { getCoverObjects } from "./coverObjects";
import { loadSpeedRatio } from "./carry";

export type EnemyState = {
  ammo: number;
  activity: number;
  capacity: number;
  ammoCap: number;
  cargo: number;
  targetCrate: string | null;
  collectT: number;
  wander: Vec2 | null;
  dormant: boolean;
  zombie: boolean;
  deathHandled: boolean;
  recovered: boolean;
};
export type SupplyDrop = { id: string; pos: Vec2; ammo: number; power: number; /** 10/17: split drops carry one resource each (absent = old combined drop). */ kind?: "ammo" | "power" };

/** Half the gap between a split ammo drop and its power drop (world units). */
export const SUPPLY_SPLIT_HALF_GAP = 6;

/**
 * 10/17 神宮: one ammo drop and one power drop side by side at `pos`; a resource of 0 makes no drop.
 * Pickup stays the same: both sit well inside one interact radius.
 */
export function splitSupplyDrops(id: string, pos: Vec2, ammo: number, power: number): SupplyDrop[] {
  const out: SupplyDrop[] = [];
  const both = ammo > 0.00001 && power > 0.00001;
  if (ammo > 0.00001) out.push({ id: `${id}-ammo`, pos: { x: pos.x - (both ? SUPPLY_SPLIT_HALF_GAP : 0), y: pos.y }, ammo, power: 0, kind: "ammo" });
  if (power > 0.00001) out.push({ id: `${id}-power`, pos: { x: pos.x + (both ? SUPPLY_SPLIT_HALF_GAP : 0), y: pos.y }, ammo: 0, power, kind: "power" });
  return out;
}

/** Old checkpoints hold combined drops: split them in place (and carry their faint images over). */
export function backfillSplitSupplies(world: World): void {
  if (!world.enemySupplies?.some((d) => !d.kind)) return;
  const ghosts = world.squadIntel?.ghosts;
  world.enemySupplies = world.enemySupplies.flatMap((d) => {
    if (d.kind) return [d];
    const parts = splitSupplyDrops(d.id, d.pos, d.ammo, d.power);
    const g = ghosts?.[`supply:${d.id}`];
    if (ghosts && g) {
      delete ghosts[`supply:${d.id}`];
      for (const p of parts) ghosts[`supply:${p.id}`] = { ...g, id: p.id, pos: { ...p.pos } };
    }
    return parts;
  });
}
export type RecallSpawn = { at: number; angle: number; spawned: boolean };
export type EnemyMode = "rush" | "range" | "ambush" | "scavenge";

export function actionCircuit(e: Unit): EnemyCircuitData | null {
  let best: EnemyCircuitData | null = null;
  for (const c of e.enemyIdentity?.circuits ?? [])
    if (!best || c.effect > best.effect) best = c;
  return best;
}
export function enemyMode(e: Unit): EnemyMode {
  const key = actionCircuit(e)?.effectKey;
  if (["raid_attack", "melee", "smg", "shotgun"].includes(key ?? ""))
    return "rush";
  if (
    [
      "escort_range",
      "mmr",
      "lmg",
      "fast_round",
      "homing_round",
      "emp_round",
    ].includes(key ?? "")
  )
    return "range";
  if (
    [
      "shield",
      "point_defense_armor",
      "cover_fight",
      "cover_move",
      "dodge",
      "orbit_speed",
    ].includes(key ?? "")
  )
    return "ambush";
  return "scavenge";
}
export function enemyRate(e: Unit, key: string): number {
  return (e.enemyIdentity?.circuits ?? [])
    .filter((c) => c.effectKey === key)
    .reduce((r, c) => r + effectRate(c.effect), 0);
}
export function canLoot(e: Unit): boolean {
  return (e.enemyIdentity?.circuits ?? []).some(
    (c) => c.effectKey === "recover" && c.effect > 0,
  );
}
export function initializeEnemy(
  e: Unit,
  rng: () => number = Math.random,
  zombie = false,
): void {
  if (e.enemyState) return;
  const capacity = 300 * (1 + enemyRate(e, "scout_activity"));
  const band = rng();
  const ammo =
    band < 0.7
      ? 3 + Math.floor(rng() * 6)
      : band < 0.9
        ? 9 + Math.floor(rng() * 12)
        : 28;
  const p = rng();
  const activity =
    capacity *
    (p < 0.7 ? 0.15 + rng() * 0.2 : p < 0.9 ? 0.35 + rng() * 0.35 : 1);
  e.enemyState = {
    ammo,
    activity,
    capacity,
    ammoCap: 28,
    cargo: 0,
    targetCrate: null,
    collectT: 0,
    wander: null,
    dormant:
      !zombie &&
      (e.enemyIdentity?.circuits ?? []).some((c) => c.effect === 0) &&
      !(e.enemyIdentity?.circuits ?? []).some((c) => c.effect > 0),
    zombie,
    deathHandled: false,
    recovered: false,
  };
}
export function backfillEnemyState(world: World): void {
  for (const e of world.enemies) initializeEnemy(e);
  world.enemySupplies ??= [];
  // Old in-flight recall checkpoints must not invent a second wave.
  if (world.boarding && !world.recallSpawns) world.recallSpawns = [];
}
export function moveEnemy(
  world: World,
  e: Unit,
  target: Vec2 | null,
  speed: number,
  dt: number,
): void {
  const s = e.enemyState!;
  e.vel = { x: 0, y: 0 };
  if (!target || s.activity <= s.capacity * 0.1 || s.dormant) return;
  const d = dist(e.pos, target);
  if (d < 4) return;
  const step = Math.min(
    d,
    speed * dt,
    ((s.activity - s.capacity * 0.1) * speed) / 0.5,
  );
  const dx = (target.x - e.pos.x) / d,
    dy = (target.y - e.pos.y) / d;
  const before = { ...e.pos };
  e.pos.x = clamp(e.pos.x + dx * step, 20, world.balance.worldW - 20);
  e.pos.y = clamp(e.pos.y + dy * step, 20, world.balance.worldH - 20);
  e.pos = obstacleMove(world, { ...e, pos: before }, e.pos);
  updateCoverMovement(world, e, {x:0,y:0}, dt);
  const travelled = dist(before, e.pos);
  if (travelled > 0) {
    s.activity = Math.max(
      s.capacity * 0.1,
      s.activity - (0.5 * travelled) / Math.max(speed, 0.001),
    );
    e.vel = { x: dx * speed, y: dy * speed };
    noteMoveHeading(e, Math.atan2(dy, dx));
  }
}
export function nearestEnemyTarget(world: World, e: Unit): Unit | null {
  let best: Unit | null = null,
    d = Infinity;
  for (const u of [world.leader, ...world.wingmen, ...world.enemies]) {
    if (u === e || !u.alive) continue;
    if (!canSee(world, e, u.pos)) continue; // PR2: own cones only, enemies do not share
    const dd = dist(e.pos, u.pos);
    if (dd < d) {
      d = dd;
      best = u;
    }
  }
  return best;
}
/** Return true while recover-equipped enemies are seeking / using a crate. */
export function lootEnemy(
  world: World,
  e: Unit,
  dt: number,
  speed: number,
): boolean {
  const s = e.enemyState!;
  if (!canLoot(e)) return false;
  const cap =
    2 +
    (e.enemyIdentity?.circuits ?? [])
      .filter((c) => c.effectKey === "cargo_slots")
      .reduce((n, c) => n + cargoSlotBonus(c.effect), 0);
  const needs = s.ammo < s.ammoCap || s.activity < s.capacity;
  if (
    s.cargo >= cap &&
    !needs &&
    world.containers.some(
      (c) =>
        c.id === s.targetCrate &&
        !c.taken &&
        dist(e.pos, c.pos) <= world.balance.interactRadius,
    )
  ) {
    s.collectT = 0;
    e.vel = { x: 0, y: 0 };
    return true;
  }
  let crate = world.containers.find((c) => c.id === s.targetCrate && !c.taken);
  if (!crate) {
    crate = world.containers
      .filter((c) => !c.taken)
      .sort((a, b) => dist(e.pos, a.pos) - dist(e.pos, b.pos))[0];
    s.targetCrate = crate?.id ?? null;
    s.collectT = 0;
  }
  if (!crate) return false;
  if (dist(e.pos, crate.pos) > world.balance.interactRadius) {
    moveEnemy(world, e, crate.pos, speed, dt);
    s.collectT = 0;
    return true;
  }
  e.vel = { x: 0, y: 0 };
  s.collectT += dt;
  if (s.collectT >= 8) {
    s.ammo = s.ammoCap;
    s.activity = s.capacity;
    s.collectT = 0;
    if (s.cargo < cap) {
      crate.taken = true;
      s.cargo++;
      s.targetCrate = null;
    }
  }
  return true;
}
export function enemySpeed(world: World, e: Unit): number {
  return (
    BALANCE.enemySpeed *
    (1 + enemyRate(e, "haul_speed") + enemyRate(e, "orbit_speed")) *
    loadSpeedRatio(e.enemyState!.cargo)
  );
}
export function enemyDestination(
  world: World,
  e: Unit,
  target: Unit | null,
): Vec2 | null {
  const s = e.enemyState!,
    mode = enemyMode(e);
  if (target) {
    const d = dist(e.pos, target.pos),
      range = world.balance.weaponRange;
    if (d > range) return target.pos;
    if (mode === "rush") return enemyRate(e, "melee") > 0 ? target.pos : null;
    if (mode === "range" && d < range * 0.8) {
      const a = Math.atan2(e.pos.y - target.pos.y, e.pos.x - target.pos.x);
      return {
        x: target.pos.x + Math.cos(a) * range * 0.95,
        y: target.pos.y + Math.sin(a) * range * 0.95,
      };
    }
    if (mode === "ambush") {
      if (enemyRate(e, "cover_move") > 0) {
        const cover = getCoverObjects(world)
          .filter((c) => dist(e.pos, c.pos) < 220)
          .sort((a, b) => dist(e.pos, a.pos) - dist(e.pos, b.pos))[0];
        if (cover && dist(e.pos, cover.pos) > cover.radius * 0.5)
          return cover.pos;
      }
      if (enemyRate(e, "orbit_speed") > 0) {
        const a =
          Math.atan2(e.pos.y - target.pos.y, e.pos.x - target.pos.x) + 0.3;
        return {
          x: target.pos.x + Math.cos(a) * range * 0.8,
          y: target.pos.y + Math.sin(a) * range * 0.8,
        };
      }
      return null;
    }
    return null;
  }
  if (mode === "ambush") {
    const supply = (world.enemySupplies ?? [])
      .filter((d) => d.power > 0)
      .sort((a, b) => dist(e.pos, a.pos) - dist(e.pos, b.pos))[0];
    return supply && dist(e.pos, supply.pos) < 220 ? supply.pos : null;
  }
  if (!s.wander || dist(e.pos, s.wander) < 5) {
    const a = Math.random() * Math.PI * 2,
      r = mode === "scavenge" ? 100 : 60;
    s.wander = {
      x: clamp(e.pos.x + Math.cos(a) * r, 20, world.balance.worldW - 20),
      y: clamp(e.pos.y + Math.sin(a) * r, 20, world.balance.worldH - 20),
    };
  }
  return s.wander;
}
export function enemyDamageMultiplier(e: Unit): number {
  return 1 + enemyRate(e, "raid_attack");
}
export function enemyArmorMultiplier(e: Unit): number {
  return 1 + enemyRate(e, "point_defense_armor");
}
export function handleEnemyDeaths(world: World): void {
  world.enemySupplies ??= [];
  for (const e of world.enemies) {
    const s = e.enemyState;
    if (e.alive || e.hp > 0 || !s || s.deathHandled) continue;
    s.deathHandled = true;
    world.enemySupplies.push(...splitSupplyDrops(`supply-${e.id}`, e.pos, s.ammo, s.activity));
    s.ammo = 0;
    s.activity = 0;
    for (let i = 0; i < s.cargo; i++)
      world.containers.push({
        id: `cargo-${e.id}-${i}`,
        pos: { x: e.pos.x + i * 8, y: e.pos.y },
        taken: false,
        discovered: false,
        glowT: 4,
      });
    s.cargo = 0;
  }
}
export function collectSupplies(world: World): void {
  for (const d of world.enemySupplies ?? [])
    for (const u of [world.leader, ...world.wingmen, ...world.enemies]) {
      if (!u.alive || dist(u.pos, d.pos) > world.balance.interactRadius)
        continue;
      if (u.kind === "enemy") {
        const s = u.enemyState!;
        const a = Math.min(d.ammo, s.ammoCap - s.ammo),
          p = Math.min(d.power, s.capacity - s.activity);
        s.ammo += a;
        s.activity += p;
        d.ammo -= a;
        d.power -= p;
      } else if (u.instanceId) {
        const b = world.mechBattery[u.instanceId];
        const cap = sortieAmmoCap(world, u);
        const a = Math.min(
          d.ammo,
          Math.max(0, cap - (world.currentAmmo[u.instanceId] ?? cap)),
        );
        world.currentAmmo[u.instanceId] =
          (world.currentAmmo[u.instanceId] ?? cap) + a;
        d.ammo -= a;
        showCombatFeedback(world, u, "ammo", a);
        if (b) {
          const effectiveCap = effectiveBatteryCapacity(world, u) ?? b.capacity;
          const p = Math.min(d.power, Math.max(0, effectiveCap * (1 - b.activity / b.capacity)));
          b.activity = Number(Math.min(b.capacity, b.activity + p * b.capacity / effectiveCap).toFixed(10));
          d.power = Number(Math.max(0, d.power - p).toFixed(10));
          showCombatFeedback(world, u, "power", p);
        }
      }
    }
  world.enemySupplies = (world.enemySupplies ?? []).filter(
    (d) => d.ammo > 0.00001 || d.power > 0.00001,
  );
}
/** Schedule once at first recall, not each frame or after reload. */
export function scheduleRecall(
  world: World,
  rng: () => number = Math.random,
): void {
  if (world.recallSpawns) return;
  const n = Math.min(
    8,
    Math.max(0, Math.floor(world.invadeSector?.neighborCount ?? 0)),
  );
  world.recallSpawns = Array.from({ length: n }, () => ({
    at: world.elapsed + rng() * world.balance.boardingLiftOffDelaySec,
    angle: rng() * Math.PI * 2,
    spawned: false,
  })).sort((a, b) => a.at - b.at);
}
export function spawnRecall(world: World): void {
  if (!world.boarding) return;
  for (const [i, ev] of (world.recallSpawns ?? []).entries()) {
    if (ev.spawned || ev.at > world.elapsed) continue;
    ev.spawned = true;
    const template = world.enemies[0] ?? world.leader;
    const r = world.boarding.radius + 220 + 30;
    let pos = { x: 0, y: 0 };
    for (let attempt = 0; attempt < 64; attempt++) {
      const a = ev.angle + (attempt * Math.PI) / 32;
      pos = {
        x: clamp(
          world.boarding.center.x + Math.cos(a) * r,
          20,
          world.balance.worldW - 20,
        ),
        y: clamp(
          world.boarding.center.y + Math.sin(a) * r,
          20,
          world.balance.worldH - 20,
        ),
      };
      if (dist(pos, world.boarding.center) > world.boarding.radius + 220) break;
    }
    const e: Unit = {
      ...template,
      id: `stray-${world.sortieNonce}-${i}`,
      instanceId: null,
      name: "所属不明",
      kind: "enemy",
      pos,
      vel: { x: 0, y: 0 },
      hp: world.balance.enemyHp * rankEnemyMultiplier(world.invadeSector?.invadeRank ?? 0),
      maxHp: world.balance.enemyHp * rankEnemyMultiplier(world.invadeSector?.invadeRank ?? 0),
      alive: true,
      cooldown: 0,
      salvagedCount: 0,
      salvageId: null,
      salvageT: 0,
      enemyIdentity: undefined,
      enemyState: undefined,
    };
    e.enemyIdentity = makeEnemyIdentity(e);
    e.enemyIdentity.circuits = [];
    initializeEnemy(e, Math.random, true);
    world.enemies.push(e);
  }
}
