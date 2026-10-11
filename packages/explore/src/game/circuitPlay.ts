/**
 * Circuit actions during a sortie. No-op unless `world.circuitPlay.rules`
 * or a loadout is attached, so existing sorties stay on the old path.
 */
import {
  AIR_SUPPORT_COOLDOWN_SEC,
  AIR_SUPPORT_COST,
  COLLECT_SECONDS,
  COVER_DR_BASE,
  COVER_DR_CAP,
  DISTRIBUTE_SEC,
  DODGE_COOLDOWN_MIN_SEC,
  DODGE_COOLDOWN_SEC,
  EMP_DURATION_SEC,
  EMP_SLOW_BASE,
  EMP_SLOW_CAP,
  GUN_EFFECT_ORDER,
  ORDER_MOVE_SPEED,
  SMG_CYCLE,
  SMG_INTERVAL_SEC,
  SMG_TAIL_SEC,
  SUPPRESS_SEC,
  TRENCH_SETUP_MIN_SEC,
  TRENCH_SETUP_SEC,
  addDestroyedGen1,
  classifyCircuit,
  discoverTrueOneByOne,
  effectRate,
  ensureCaptainFalseOneByOne,
  hasTrueOneByOne,
  loadHubSaveFromLocalStorage,
  readAirSupportCooldownSec,
  saveHubSaveToLocalStorage,
  type ClassifiedCircuit,
  type CircuitEffectKey,
  type GunEffectKey,
  type HubCircuitRecord,
  type HubSnapshot,
} from "@estg/shared";
import { COVER_RADIUS, getCoverObjects } from "./coverObjects";
import { dist, norm, type Vec2 } from "./math";
import type { Bullet, Unit, World } from "./types";

export type CircuitOrder =
  | { kind: "protect"; allyId: string }
  | { kind: "focus"; enemyId: string }
  | { kind: "pincer"; enemyId: string; points: Record<string, Vec2> }
  | { kind: "forced_march"; x: number; y: number }
  | { kind: "trench"; x: number; y: number; left: number; r: number }
  | { kind: "distribute"; x: number; y: number; left: number }
  | { kind: "suppress"; enemyId: string; left: number }
  | { kind: "haul"; prevStance: Unit["stance"] }
  | null;

export type CircuitPlayState = {
  rules: boolean;
  captainOneByOne: boolean;
  captainTrueOne: boolean;
  wingTrueOne: Record<string, boolean>;
  wingFalseOne: Record<string, boolean>;
  loadout: Record<string, ClassifiedCircuit[]>;
  order: CircuitOrder;
  pending: { kind: string; pick: "enemy" | "ally" | "map" | "none" } | null;
  cooldownSec: number;
  fogOpen: Uint8Array | null;
  lastSeen: Record<string, Vec2>;
  dodgeReady: Record<string, number>;
  emp: Record<string, { until: number; slow: number }>;
  baseMaxHp: Record<string, number>;
  baseBattery: Record<string, number>;
  smg: Record<string, { n: number; wait: number }>;
  airWrecks: { id: string; pos: Vec2; recovered: boolean }[];
  grantTrue: boolean;
  discoverDone: boolean;
  stepDt: number;
  baseAmmo: Record<string, number>;
};

const ORDER_LABEL: Record<string, string> = {
  protect: "保護",
  focus: "集中",
  pincer: "挟撃",
  forced_march: "強行軍",
  trench: "塹壕",
  distribute: "分配",
  suppress: "牽制",
  haul: "運搬",
  air_support: "航空支援",
};

function blank(rules: boolean): CircuitPlayState {
  return {
    rules,
    captainOneByOne: false,
    captainTrueOne: false,
    wingTrueOne: {},
    wingFalseOne: {},
    loadout: {},
    order: null,
    pending: null,
    cooldownSec: 0,
    fogOpen: null,
    lastSeen: {},
    dodgeReady: {},
    emp: {},
    baseMaxHp: {},
    baseBattery: {},
    smg: {},
    airWrecks: [],
    grantTrue: false,
    discoverDone: false,
    stepDt: 0.016,
    baseAmmo: {},
  };
}

function friendlies(world: World): Unit[] {
  return [world.leader, ...world.wingmen];
}

function living(world: World): Unit[] {
  return friendlies(world).filter((u) => u.alive);
}

export function playOf(world: World): CircuitPlayState | null {
  return world.circuitPlay ?? null;
}

export function movementLocked(world: World): boolean {
  const p = playOf(world);
  return !!p?.rules && !p.captainOneByOne;
}

function own(world: World, unitId: string): ClassifiedCircuit[] {
  return playOf(world)?.loadout[unitId] ?? [];
}

function anyone(world: World, key: CircuitEffectKey): boolean {
  const p = playOf(world);
  if (!p) return false;
  return Object.values(p.loadout).some((list) => list.some((c) => c.effectKey === key && (c.effect > 0 || c.trueBoard)));
}

function selfKey(world: World, unitId: string, key: CircuitEffectKey): ClassifiedCircuit | null {
  return own(world, unitId).find((c) => c.effectKey === key && c.effect > 0) ?? null;
}

function trueRate(world: World, key: CircuitEffectKey): number {
  const p = playOf(world);
  if (!p) return 0;
  let r = 0;
  for (const list of Object.values(p.loadout)) {
    for (const c of list) {
      if (c.trueBoard && c.effectKey === key && c.effect > 0) r += c.r;
    }
  }
  return r;
}

function falseRate(world: World, unitId: string, key: CircuitEffectKey): number {
  const c = selfKey(world, unitId, key);
  return c && !c.trueBoard ? c.r : 0;
}

export type UnitMods = {
  attack: number;
  range: number;
  vision: number;
  speed: number;
  armor: number;
  activity: number;
  damage: number;
  coverDr: number;
  armorDr: number;
  gun: GunEffectKey | null;
  melee: number;
  dodge: number;
  cargo: number;
  orbit: number;
};

export function modsFor(world: World, unitId: string): UnitMods {
  const m: UnitMods = {
    attack: 1, range: 1, vision: 1, speed: 1, armor: 1, activity: 1, damage: 1,
    coverDr: 0, armorDr: 0, gun: null, melee: 0, dodge: 0, cargo: 0, orbit: 0,
  };
  const p = playOf(world);
  if (!p?.rules) return m;
  const list = own(world, unitId);
  for (const c of list) {
    if (!(c.effect > 0) || !c.effectKey || c.trueBoard) continue;
    const r = c.r;
    switch (c.effectKey) {
      case "escort_range": m.range += r; break;
      case "raid_attack": m.attack += r; break;
      case "scout_activity": m.activity += r; break;
      case "point_defense_armor": m.armor += r; break;
      case "haul_speed": m.speed += r; break;
      case "orbit_speed": m.orbit += r; break;
      case "cover_fight": m.coverDr = Math.max(m.coverDr, r); break;
      case "dodge": m.dodge = Math.max(m.dodge, r); break;
      case "melee": m.melee = Math.max(m.melee, r); break;
      case "cargo_slots": m.cargo += c.cargoSlots; break;
      default: break;
    }
  }
  for (const key of GUN_EFFECT_ORDER) {
    if (list.some((c) => !c.trueBoard && c.effectKey === key && c.effect > 0)) {
      m.gun = key;
      break;
    }
  }
  const add = (key: CircuitEffectKey, field: keyof UnitMods) => {
    const r = trueRate(world, key);
    if (r > 0 && typeof m[field] === "number") (m[field] as number) += r;
  };
  add("gun_tune", "attack");
  add("gun_tune", "range");
  add("raid_attack", "attack");
  add("focus", "damage");
  add("pincer", "damage");
  add("power_tune", "activity");
  add("power_tune", "speed");
  add("march", "speed");
  add("distribute", "speed");
  add("scout_activity", "activity");
  add("read_ahead", "activity");
  add("read_ahead", "vision");
  add("scatter", "vision");
  add("squad_haul", "activity");
  add("suppress", "activity");
  add("point_defense_armor", "armor");
  add("protect", "armor");
  add("entrench_hold", "armor");
  add("forced_march", "armor");
  add("armor_tune", "armor");
  m.armorDr = trueRate(world, "armor_tune");
  const wing = p.wingFalseOne[unitId];
  if (wing) {
    m.attack += 1;
    m.range += 1;
    m.vision += 1;
  }
  return m;
}

function unitById(world: World, id: string): Unit | null {
  return friendlies(world).find((u) => u.id === id) ?? null;
}

export function attachCircuitPlay(world: World, hub: HubSnapshot | null, rules: boolean): void {
  const play = blank(rules);
  play.cooldownSec = readAirSupportCooldownSec(hub);
  const ids = world.deployedInstanceIds;
  const unitIds = ["leader", "wing-a", "wing-b"];
  if (hub) {
    for (let i = 0; i < Math.min(ids.length, unitIds.length); i++) {
      const inst = ids[i]!;
      const unitId = unitIds[i]!;
      const recs = hub.circuits.filter((c) => c.equippedTo === inst);
      play.loadout[unitId] = recs.map(classifyCircuit);
    }
  }
  const leader = play.loadout.leader ?? [];
  play.captainTrueOne = leader.some((c) => c.oneByOne === "true");
  play.captainOneByOne = leader.some((c) => c.oneByOne === "true" || c.oneByOne === "false");
  for (const id of unitIds) {
    const list = play.loadout[id] ?? [];
    if (list.some((c) => c.oneByOne === "true")) play.wingTrueOne[id] = true;
    if (list.some((c) => c.oneByOne === "false")) play.wingFalseOne[id] = true;
  }
  play.discoverDone = hub ? hasTrueOneByOne(hub) : false;
  world.circuitPlay = play;
}

export function refreshStarterCircuit(hub: HubSnapshot): HubSnapshot {
  return ensureCaptainFalseOneByOne(hub);
}

export function circuitButtons(world: World): { id: string; label: string }[] {
  const p = playOf(world);
  if (!p?.rules) return [];
  const out: { id: string; label: string }[] = [];
  const alive = living(world);
  const has = (key: CircuitEffectKey) =>
    alive.some((u) => own(world, u.id).some((c) => c.effectKey === key));
  if (has("protect")) out.push({ id: "protect", label: ORDER_LABEL.protect! });
  if (has("focus")) out.push({ id: "focus", label: ORDER_LABEL.focus! });
  if (has("pincer")) out.push({ id: "pincer", label: ORDER_LABEL.pincer! });
  if (has("forced_march")) out.push({ id: "forced_march", label: ORDER_LABEL.forced_march! });
  if (has("trench")) out.push({ id: "trench", label: ORDER_LABEL.trench! });
  if (has("distribute")) out.push({ id: "distribute", label: ORDER_LABEL.distribute! });
  if (has("suppress")) out.push({ id: "suppress", label: ORDER_LABEL.suppress! });
  if (has("haul_speed") || has("squad_haul")) out.push({ id: "haul", label: ORDER_LABEL.haul! });
  if (p.captainTrueOne && p.cooldownSec <= 0) out.push({ id: "air_support", label: ORDER_LABEL.air_support! });
  return out;
}

function nearestUnit(units: Unit[], pt: Vec2, max = 48): Unit | null {
  let best: Unit | null = null;
  let d = max;
  for (const u of units) {
    if (!u.alive) continue;
    const dd = dist(u.pos, pt);
    if (dd < d) { d = dd; best = u; }
  }
  return best;
}

function holders(world: World, key: CircuitEffectKey): Unit[] {
  return living(world).filter((u) => own(world, u.id).some((c) => c.effectKey === key));
}

export function pincerPoints(captain: Vec2, enemy: Vec2, units: Unit[]): Record<string, Vec2> {
  const sorted = [...units].sort((a, b) => {
    const ai = a.instanceId ?? "";
    const bi = b.instanceId ?? "";
    if (ai && bi && ai !== bi) return ai < bi ? -1 : 1;
    if (ai && !bi) return -1;
    if (!ai && bi) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const n = sorted.length;
  const A = Math.atan2(enemy.y - captain.y, enemy.x - captain.x);
  const out: Record<string, Vec2> = {};
  for (let k = 0; k < n; k++) {
    const theta = A + Math.PI / 2 + k * ((Math.PI * 2) / n);
    out[sorted[k]!.id] = {
      x: enemy.x + Math.cos(theta) * 160,
      y: enemy.y + Math.sin(theta) * 160,
    };
  }
  return out;
}

export function beginCircuitButton(world: World, id: string): void {
  const p = playOf(world);
  if (!p?.rules || world.phase !== "sortie") return;
  if (id === "haul") {
    issueHaul(world);
    p.pending = null;
    return;
  }
  if (id === "air_support") {
    p.pending = { kind: id, pick: "enemy" };
    return;
  }
  const pick =
    id === "protect" ? "ally" :
    id === "focus" || id === "pincer" || id === "suppress" ? "enemy" :
    "map";
  p.pending = { kind: id, pick };
}

export function consumeCircuitClick(world: World, pt: Vec2): boolean {
  const p = playOf(world);
  if (!p?.pending) return false;
  const pending = p.pending;
  p.pending = null;
  if (pending.pick === "enemy") {
    const enemy = nearestUnit(world.enemies, pt);
    if (!enemy) return true;
    if (pending.kind === "air_support") tryAirSupport(world, enemy);
    else if (pending.kind === "focus") p.order = { kind: "focus", enemyId: enemy.id };
    else if (pending.kind === "suppress") p.order = { kind: "suppress", enemyId: enemy.id, left: SUPPRESS_SEC };
    else if (pending.kind === "pincer") {
      const who = holders(world, "pincer");
      p.order = { kind: "pincer", enemyId: enemy.id, points: pincerPoints(world.leader.pos, enemy.pos, who) };
    }
    return true;
  }
  if (pending.pick === "ally") {
    const ally = nearestUnit(world.wingmen, pt);
    if (!ally) return true;
    p.order = { kind: "protect", allyId: ally.id };
    return true;
  }
  if (pending.kind === "forced_march") p.order = { kind: "forced_march", x: pt.x, y: pt.y };
  else if (pending.kind === "trench") {
    const r = holders(world, "trench").reduce((s, u) => s + (selfKey(world, u.id, "trench")?.r ?? 0), 0);
    const left = Math.max(TRENCH_SETUP_MIN_SEC, TRENCH_SETUP_SEC * (1 - Math.min(0.9, r)));
    p.order = { kind: "trench", x: pt.x, y: pt.y, left, r };
  } else if (pending.kind === "distribute") {
    p.order = { kind: "distribute", x: pt.x, y: pt.y, left: DISTRIBUTE_SEC };
  }
  return true;
}

function issueHaul(world: World): void {
  const p = playOf(world);
  if (!p) return;
  if (!world.camp) world.camp = { pos: { ...world.leader.pos }, stashedCount: 0 };
  p.order = { kind: "haul", prevStance: world.leader.stance };
}

function tryAirSupport(world: World, enemy: Unit): void {
  const p = playOf(world);
  if (!p?.captainTrueOne || !enemy.alive) return;
  if (p.cooldownSec > 0) return;
  const loaded = loadHubSaveFromLocalStorage();
  const hub = loaded?.hub;
  if (!hub || hub.credits < AIR_SUPPORT_COST) return;
  const next = {
    ...hub,
    credits: hub.credits - AIR_SUPPORT_COST,
    airSupportCooldownSec: AIR_SUPPORT_COOLDOWN_SEC,
  };
  saveHubSaveToLocalStorage(next);
  p.cooldownSec = AIR_SUPPORT_COOLDOWN_SEC;
  enemy.hp = 0;
  enemy.alive = false;
  p.airWrecks.push({ id: enemy.id, pos: { ...enemy.pos }, recovered: false });
}

export function noteCircuitExtract(world: World, captainIn: boolean): void {
  const p = playOf(world);
  if (!p || !captainIn) return;
  const circle = world.boarding;
  if (circle) {
    for (const w of p.airWrecks) {
      if (dist(w.pos, circle.center) <= circle.radius) w.recovered = true;
    }
  }
  if (world.invadeSector && !p.discoverDone) p.grantTrue = true;
}

export function applyCircuitHubSide(world: World, hub: HubSnapshot): HubSnapshot {
  const p = playOf(world);
  if (!p) return hub;
  let next = hub;
  if (p.grantTrue && !hasTrueOneByOne(next)) next = discoverTrueOneByOne(next);
  if (p.cooldownSec > 0) next = { ...next, airSupportCooldownSec: p.cooldownSec };
  else if (next.airSupportCooldownSec) {
    const { airSupportCooldownSec: _drop, ...rest } = next;
    next = rest;
  }
  const n = p.airWrecks.filter((w) => w.recovered).length;
  for (let i = 0; i < n; i++) next = addDestroyedGen1(next);
  return next;
}

function fogSize(world: World): { cols: number; rows: number } {
  const cell = world.balance.fogCell;
  return {
    cols: Math.ceil(world.balance.worldW / cell),
    rows: Math.ceil(world.balance.worldH / cell),
  };
}

function ensureFog(world: World): Uint8Array {
  const p = playOf(world)!;
  const { cols, rows } = fogSize(world);
  if (!p.fogOpen || p.fogOpen.length !== cols * rows) p.fogOpen = new Uint8Array(cols * rows);
  return p.fogOpen;
}

function cellCenter(world: World, i: number): Vec2 {
  const { cols } = fogSize(world);
  const cell = world.balance.fogCell;
  const x = i % cols;
  const y = Math.floor(i / cols);
  return { x: x * cell + cell / 2, y: y * cell + cell / 2 };
}

function updateFog(world: World): void {
  const open = ensureFog(world);
  const { cols, rows } = fogSize(world);
  for (const u of living(world)) {
    const see = world.balance.visionRange * modsFor(world, u.id).vision;
    for (let i = 0; i < cols * rows; i++) {
      if (open[i]) continue;
      const c = cellCenter(world, i);
      if (dist(u.pos, c) <= see) open[i] = 1;
    }
  }
}

function rememberEnemies(world: World): void {
  const p = playOf(world);
  if (!p) return;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    for (const u of living(world)) {
      const see = world.balance.visionRange * modsFor(world, u.id).vision;
      if (dist(u.pos, e.pos) <= see) {
        p.lastSeen[e.id] = { ...e.pos };
        break;
      }
    }
  }
}

function seenEnemy(world: World, unit: Unit): boolean {
  const see = world.balance.visionRange * modsFor(world, unit.id).vision;
  return world.enemies.some((e) => e.alive && dist(unit.pos, e.pos) <= see);
}

function nearestFog(world: World, from: Vec2, pred: (c: Vec2) => boolean): Vec2 | null {
  const p = playOf(world);
  if (!p?.fogOpen) return null;
  let best: Vec2 | null = null;
  let d = Infinity;
  for (let i = 0; i < p.fogOpen.length; i++) {
    if (p.fogOpen[i]) continue;
    const c = cellCenter(world, i);
    if (c.x < 0 || c.y < 0 || c.x > world.balance.worldW || c.y > world.balance.worldH) continue;
    if (!pred(c)) continue;
    const dd = dist(from, c);
    if (dd < d) { d = dd; best = c; }
  }
  return best;
}

function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function syncCaps(world: World): void {
  const p = playOf(world);
  if (!p) return;
  for (const u of friendlies(world)) {
    if (p.baseMaxHp[u.id] == null) p.baseMaxHp[u.id] = u.maxHp;
    const armor = modsFor(world, u.id).armor;
    u.maxHp = p.baseMaxHp[u.id]! * armor;
    if (u.hp > u.maxHp) u.hp = u.maxHp;
    const inst = u.instanceId;
    if (!inst) continue;
    const bat = world.mechBattery[inst];
    if (!bat) continue;
    if (p.baseBattery[inst] == null) p.baseBattery[inst] = bat.capacity || 300;
    bat.capacity = Math.max(1, Math.round(p.baseBattery[inst]! * modsFor(world, u.id).activity));
    if (p.baseAmmo[inst] == null) {
      const cur = world.currentAmmo[inst];
      p.baseAmmo[inst] = cur != null ? cur : 28;
    }
    const ammoCap = Math.max(1, Math.round(p.baseAmmo[inst]! * ammoMaxMul(world, u.id)));
    const ammo = world.currentAmmo[inst];
    if (ammo != null && ammo > ammoCap) world.currentAmmo[inst] = ammoCap;
  }
}

function orderOwns(world: World, unit: Unit): boolean {
  const order = playOf(world)?.order;
  if (!order) return false;
  if (order.kind === "focus" || order.kind === "distribute") return true;
  if (order.kind === "haul" && (anyone(world, "squad_haul") || selfKey(world, unit.id, "haul_speed") || selfKey(world, unit.id, "squad_haul"))) {
    return anyone(world, "squad_haul") || !!selfKey(world, unit.id, "haul_speed") || !!selfKey(world, unit.id, "squad_haul");
  }
  if (order.kind === "protect") return unit.id === order.allyId;
  if (order.kind === "pincer") return order.points[unit.id] != null;
  if (order.kind === "forced_march") return !!selfKey(world, unit.id, "forced_march");
  if (order.kind === "trench") return !!selfKey(world, unit.id, "trench");
  if (order.kind === "suppress") return false;
  return false;
}

function alwaysMove(world: World, unit: Unit): Vec2 | null {
  const scatter = anyone(world, "scatter");
  if (scatter) {
    const heading = unit.heading;
    if (seenEnemy(world, unit)) {
      return nearestFog(world, unit.pos, (c) => angleDelta(Math.atan2(c.y - unit.pos.y, c.x - unit.pos.x), heading) >= Math.PI / 2)
        ?? nearestFog(world, unit.pos, () => true);
    }
    return nearestFog(world, unit.pos, () => true);
  }
  const hpHalf = unit.hp <= unit.maxHp * 0.5;
  if (selfKey(world, unit.id, "cover_fight") && hpHalf) {
    const covers = getCoverObjects(world);
    let best: Vec2 | null = null;
    let d = Infinity;
    for (const c of covers) {
      const dd = dist(unit.pos, c.pos);
      if (dd < d) { d = dd; best = c.pos; }
    }
    if (best) return best;
  }
  if (selfKey(world, unit.id, "orbit_speed")) {
    let foe: Unit | null = null;
    let d = world.balance.weaponRange * modsFor(world, unit.id).range;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const dd = dist(unit.pos, e.pos);
      if (dd <= d) { d = dd; foe = e; }
    }
    if (foe) {
      const r = falseRate(world, unit.id, "orbit_speed");
      const dt = playOf(world)?.stepDt ?? 0.016;
      unit.patrolAngle += world.balance.patrolAngularSpeed * (1 + r) * dt;
      return {
        x: foe.pos.x + Math.cos(unit.patrolAngle) * world.balance.patrolRadius,
        y: foe.pos.y + Math.sin(unit.patrolAngle) * world.balance.patrolRadius,
      };
    }
  }
  if (selfKey(world, unit.id, "read_ahead")) {
    const h = world.leader.heading;
    const lim = world.balance.visionRange * modsFor(world, unit.id).vision;
    return nearestFog(world, unit.pos, (c) => dist(world.leader.pos, c) <= lim && angleDelta(Math.atan2(c.y - world.leader.pos.y, c.x - world.leader.pos.x), h) <= Math.PI / 2);
  }
  if (selfKey(world, unit.id, "entrench_hold")) {
    const covers = getCoverObjects(world);
    const taken = new Set<string>();
    const ordered = holders(world, "entrench_hold").slice().sort((a, b) => a.id < b.id ? -1 : 1);
    let mine: Vec2 | null = null;
    for (const u of ordered) {
      let best: { id: string; pos: Vec2 } | null = null;
      let d = Infinity;
      for (const c of covers) {
        if (taken.has(c.id)) continue;
        const dd = dist(u.pos, c.pos);
        if (dd < d) { d = dd; best = c; }
      }
      if (best) {
        taken.add(best.id);
        if (u.id === unit.id) mine = best.pos;
      }
    }
    return mine;
  }
  if (selfKey(world, unit.id, "march")) {
    const h = world.leader.heading;
    const distF = world.balance.escortFollowDist;
    return {
      x: world.leader.pos.x + Math.cos(h) * distF,
      y: world.leader.pos.y + Math.sin(h) * distF,
    };
  }
  if (selfKey(world, unit.id, "cover_move")) {
    const covers = getCoverObjects(world);
    let best: Vec2 | null = null;
    let d = Infinity;
    for (const c of covers) {
      const dd = dist(unit.pos, c.pos);
      if (dd < d) { d = dd; best = c.pos; }
    }
    return best;
  }
  return null;
}

function orderMove(world: World, unit: Unit): Vec2 | null {
  const order = playOf(world)?.order;
  if (!order) return null;
  if (order.kind === "protect" && unit.id === order.allyId) {
    const h = world.leader.heading;
    const d = world.balance.escortFollowDist;
    return {
      x: world.leader.pos.x - Math.cos(h) * d,
      y: world.leader.pos.y - Math.sin(h) * d,
    };
  }
  if (order.kind === "focus") return null;
  if (order.kind === "pincer") return order.points[unit.id] ?? null;
  if (order.kind === "forced_march" && selfKey(world, unit.id, "forced_march")) {
    return { x: order.x, y: order.y };
  }
  if (order.kind === "trench" && selfKey(world, unit.id, "trench")) {
    return { x: order.x, y: order.y };
  }
  if (order.kind === "distribute") return { x: order.x, y: order.y };
  if (order.kind === "haul") {
    const squad = anyone(world, "squad_haul");
    const mine = !!selfKey(world, unit.id, "haul_speed") || !!selfKey(world, unit.id, "squad_haul");
    if (!squad && !mine) return null;
    return world.camp ? { ...world.camp.pos } : { ...world.leader.pos };
  }
  return null;
}

function arrived(unit: Unit, pt: Vec2, world: World): boolean {
  return dist(unit.pos, pt) <= world.balance.waypointArriveDist;
}

function tickOrder(world: World, dt: number): void {
  const p = playOf(world);
  if (!p?.order) return;
  const order = p.order;
  if (order.kind === "focus") {
    const foe = world.enemies.find((e) => e.id === order.enemyId);
    if (!foe?.alive) p.order = null;
    return;
  }
  if (order.kind === "pincer") {
    const foe = world.enemies.find((e) => e.id === order.enemyId);
    if (!foe?.alive) { p.order = null; return; }
    const who = Object.keys(order.points);
    if (who.every((id) => {
      const u = unitById(world, id);
      const pt = order.points[id];
      return !u?.alive || (pt != null && arrived(u, pt, world));
    })) {
      /* stay until wreck or another order */
    }
    return;
  }
  if (order.kind === "forced_march") {
    const who = holders(world, "forced_march");
    if (who.length === 0 || who.every((u) => arrived(u, order, world))) p.order = null;
    return;
  }
  if (order.kind === "trench") {
    order.left -= dt;
    if (order.left <= 0) {
      const covers = getCoverObjects(world);
      covers.push({ id: `trench-${covers.length}`, pos: { x: order.x, y: order.y }, radius: COVER_RADIUS });
      p.order = null;
    }
    return;
  }
  if (order.kind === "distribute") {
    order.left -= dt;
    const pt = { x: order.x, y: order.y };
    const near = living(world).filter((u) => dist(u.pos, pt) <= world.balance.interactRadius);
    if (order.left <= 0 || near.length === living(world).length) {
      if (near.length > 0) {
        let ammo = 0;
        let act = 0;
        const ammos: { id: string; cap: number }[] = [];
        const acts: { id: string; cap: number }[] = [];
        for (const u of near) {
          const id = u.instanceId;
          if (!id) continue;
          const a = world.currentAmmo[id];
          if (a != null) {
            const cap = Math.max(1, Math.round((p.baseAmmo[id] ?? a) * ammoMaxMul(world, u.id)));
            ammo += a;
            ammos.push({ id, cap });
          }
          const b = world.mechBattery[id];
          if (b) { act += b.activity; acts.push({ id, cap: b.capacity }); }
        }
        if (ammos.length > 0) {
          const avg = Math.floor(ammo / ammos.length);
          for (const row of ammos) world.currentAmmo[row.id] = Math.min(row.cap, avg);
        }
        if (acts.length > 0) {
          const avg = Math.floor(act / acts.length);
          for (const row of acts) {
            const b = world.mechBattery[row.id];
            if (b) b.activity = Math.min(row.cap, avg);
          }
        }
      }
      p.order = null;
    }
    return;
  }
  if (order.kind === "suppress") {
    order.left -= dt;
    const foe = world.enemies.find((e) => e.id === order.enemyId);
    if (!foe?.alive || order.left <= 0) p.order = null;
    return;
  }
  if (order.kind === "haul" && world.camp) {
    const squad = anyone(world, "squad_haul");
    const who = living(world).filter((u) => squad || selfKey(world, u.id, "haul_speed") || selfKey(world, u.id, "squad_haul"));
    if (who.length > 0 && who.every((u) => dist(u.pos, world.camp!.pos) <= world.balance.interactRadius)) {
      for (const u of who) {
        if (u.salvagedCount > 0 && world.camp) {
          world.camp.stashedCount += u.salvagedCount;
          u.salvagedCount = 0;
        }
      }
      p.order = null;
    }
  }
}

export function stepCircuitPlay(world: World, dt: number): void {
  const p = playOf(world);
  if (!p?.rules) return;
  p.stepDt = dt;
  if (anyone(world, "lure") && p.order?.kind === "suppress") p.order = null;
  if (p.cooldownSec > 0) p.cooldownSec = Math.max(0, p.cooldownSec - dt);
  for (const id of Object.keys(p.smg)) {
    const s = p.smg[id]!;
    if (s.wait > 0) s.wait = Math.max(0, s.wait - dt);
  }
  updateFog(world);
  rememberEnemies(world);
  syncCaps(world);
  tickOrder(world, dt);
}

export function circuitMoveTarget(world: World, unit: Unit): Vec2 | null {
  const p = playOf(world);
  if (!p?.rules) return null;
  if (p.order?.kind === "focus") return null;
  if (orderOwns(world, unit)) return orderMove(world, unit);
  if (p.order && (p.order.kind === "distribute" || (p.order.kind === "haul" && anyone(world, "squad_haul")))) {
    return orderMove(world, unit);
  }
  return alwaysMove(world, unit);
}

export function circuitSpeed(world: World, unit: Unit): number | null {
  if (!playOf(world)?.rules) return null;
  const target = circuitMoveTarget(world, unit);
  if (!target && !orderOwns(world, unit)) return null;
  const m = modsFor(world, unit.id);
  let extra = m.speed - 1;
  if (target && selfKey(world, unit.id, "cover_move")) {
    const covers = getCoverObjects(world);
    if (covers.some((c) => dist(c.pos, target) <= c.radius)) extra += falseRate(world, unit.id, "cover_move");
  }
  return ORDER_MOVE_SPEED * (1 + Math.max(0, extra));
}

export function rangeMul(world: World, unitId: string): number {
  return modsFor(world, unitId).range;
}
export function visionMul(world: World, unitId: string): number {
  return modsFor(world, unitId).vision;
}
export function attackMul(world: World, unitId: string): number {
  return modsFor(world, unitId).attack * modsFor(world, unitId).damage;
}

export function circuitIncomingMul(world: World, target: Unit): number | null {
  if (!playOf(world)?.rules) return null;
  const m = modsFor(world, target.id);
  const moving = Math.hypot(target.vel.x, target.vel.y) > 8;
  const fighting = !!selfKey(world, target.id, "cover_fight") && target.hp <= target.maxHp * 0.5 && moving;
  let dr = 0;
  if (fighting) dr = COVER_DR_BASE + m.coverDr + m.armorDr;
  else if (target.inCover) dr = COVER_DR_BASE + m.armorDr;
  else dr = m.armorDr;
  if (dr <= 0 && !fighting && !target.inCover) return null;
  dr = Math.min(COVER_DR_CAP, Math.max(0, dr));
  return 1 - dr;
}

function gunR(world: World, unitId: string, gun: GunEffectKey): number {
  return selfKey(world, unitId, gun)?.r ?? 0;
}

export function circuitTryWeapon(world: World, from: Unit, target: Unit): boolean {
  const m = modsFor(world, from.id);
  if (!playOf(world)?.rules || from.instanceId == null) return false;
  const ammo = world.currentAmmo[from.instanceId] ?? 0;
  const reach = dist(from.pos, target.pos);
  if (ammo <= 0 && m.melee > 0 && reach <= from.radius + target.radius) {
    target.hp -= world.balance.bulletDamage * (1 + m.melee) * m.attack;
    if (target.hp <= 0) { target.hp = 0; target.alive = false; }
    from.cooldown = world.balance.fireCooldown;
    return true;
  }
  if (!m.gun) return false;
  if (ammo <= 0) return true;
  const gun = m.gun;
  const r = gunR(world, from.id, gun);
  const range = world.balance.weaponRange * m.range * (gun === "mmr" ? 3 * (1 + r) : 1);
  if (reach > range) return true;
  const p = playOf(world)!;
  if (gun === "smg") {
    const st = p.smg[from.id] ?? { n: 0, wait: 0 };
    p.smg[from.id] = st;
    if (st.wait > 0 || from.cooldown > 0) return true;
    spawnShot(world, from, target, (1 / 4) * (1 + r) * m.attack, 1, false, 0);
    world.currentAmmo[from.instanceId] = ammo - 1;
    st.n += 1;
    if (st.n >= SMG_CYCLE) { st.n = 0; st.wait = SMG_TAIL_SEC; from.cooldown = 0; }
    else from.cooldown = SMG_INTERVAL_SEC;
    return true;
  }
  if (from.cooldown > 0) return true;
  if (gun === "shotgun") {
    for (const deg of [-10, -5, 0, 5, 10]) {
      spawnShot(world, from, target, (1 + r) * m.attack, 1, false, (deg * Math.PI) / 180);
    }
    from.cooldown = world.balance.fireCooldown;
  } else if (gun === "lmg") {
    spawnShot(world, from, target, m.attack, 1, false, 0);
    from.cooldown = world.balance.fireCooldown / (2 * (1 + r));
  } else if (gun === "fast_round") {
    spawnShot(world, from, target, m.attack, 1.5, false, 0);
    from.cooldown = world.balance.fireCooldown / (1 + r);
  } else if (gun === "homing_round") {
    spawnShot(world, from, target, m.attack, 0.75, false, 0, { homingId: target.id, bend: Math.min(0.3, r) });
    from.cooldown = world.balance.fireCooldown;
  } else if (gun === "emp_round") {
    const slow = Math.min(EMP_SLOW_CAP, EMP_SLOW_BASE + r);
    spawnShot(world, from, target, m.attack, 1, true, 0, { empSlow: slow });
    from.cooldown = world.balance.fireCooldown;
  } else {
    spawnShot(world, from, target, m.attack, 1, false, 0);
    from.cooldown = world.balance.fireCooldown;
  }
  world.currentAmmo[from.instanceId] = ammo - 1;
  return true;
}

function spawnShot(
  world: World,
  from: Unit,
  to: Unit,
  damageMul: number,
  speedMul: number,
  emp: boolean,
  angleOff: number,
  extra?: { homingId?: string; bend?: number; empSlow?: number },
): void {
  const base = Math.atan2(to.pos.y - from.pos.y, to.pos.x - from.pos.x) + angleOff;
  const speed = world.balance.bulletSpeed * speedMul;
  const b: Bullet = {
    alive: true,
    pos: { ...from.pos },
    vel: { x: Math.cos(base) * speed, y: Math.sin(base) * speed },
    ttl: world.balance.bulletTtlSec,
    damage: world.balance.bulletDamage * damageMul,
    fromEnemy: false,
    ownerId: from.id,
    ...(emp ? { emp: true, empSlow: extra?.empSlow } : {}),
    ...(extra?.homingId ? { homingId: extra.homingId, bend: extra.bend } : {}),
  };
  world.bullets.push(b);
  from.heading = base;
}

export function bendHoming(world: World, b: Bullet, dt: number): void {
  if (!b.homingId || b.bend == null || !b.alive) return;
  const foe = world.enemies.find((e) => e.id === b.homingId);
  if (!foe?.alive) return;
  const want = Math.atan2(foe.pos.y - b.pos.y, foe.pos.x - b.pos.x);
  const have = Math.atan2(b.vel.y, b.vel.x);
  let d = want - have;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const next = have + d * Math.min(0.3, b.bend) * dt;
  const sp = Math.hypot(b.vel.x, b.vel.y);
  b.vel = { x: Math.cos(next) * sp, y: Math.sin(next) * sp };
}

export function tryDodge(world: World, unit: Unit, b: Bullet): boolean {
  if (!playOf(world)?.rules || !b.fromEnemy || !unit.alive) return false;
  const m = modsFor(world, unit.id);
  if (!(m.dodge > 0) && !selfKey(world, unit.id, "dodge")) return false;
  const hit = unit.radius + world.balance.bulletHitPadding;
  if (dist(b.pos, unit.pos) > hit) return false;
  const p = playOf(world);
  if (!p) return false;
  const ready = p.dodgeReady[unit.id] ?? 0;
  if (world.elapsed < ready) return false;
  const vx = b.vel.x;
  const vy = b.vel.y;
  const left = { x: -vy, y: vx };
  const right = { x: vy, y: -vx };
  const ln = norm(left);
  const rn = norm(right);
  const step = world.balance.escortSide;
  const leftPos = { x: unit.pos.x + ln.x * step, y: unit.pos.y + ln.y * step };
  const rightPos = { x: unit.pos.x + rn.x * step, y: unit.pos.y + rn.y * step };
  const ld = dist(leftPos, b.pos);
  const rd = dist(rightPos, b.pos);
  const side = ld > rd ? ln : rd > ld ? rn : ln;
  unit.pos.x = Math.max(20, Math.min(world.balance.worldW - 20, unit.pos.x + side.x * step));
  unit.pos.y = Math.max(20, Math.min(world.balance.worldH - 20, unit.pos.y + side.y * step));
  const cd = Math.max(DODGE_COOLDOWN_MIN_SEC, DODGE_COOLDOWN_SEC * (1 - m.dodge));
  p.dodgeReady[unit.id] = world.elapsed + cd;
  return true;
}

export function noteEmpHit(world: World, target: Unit, b: Bullet): void {
  if (!b.emp || b.empSlow == null) return;
  const p = playOf(world);
  if (!p) return;
  p.emp[target.id] = { until: world.elapsed + EMP_DURATION_SEC, slow: b.empSlow };
}

export function noteDamageBreaksSuppress(world: World, target: Unit): void {
  const p = playOf(world);
  if (p?.order?.kind === "suppress" && p.order.enemyId === target.id) p.order = null;
}

export function enemyHeld(world: World, enemy: Unit): boolean {
  const p = playOf(world);
  if (p?.order?.kind === "suppress" && p.order.enemyId === enemy.id) return true;
  return false;
}

export function enemyEmpMul(world: World, enemy: Unit): { speed: number; interval: number } {
  const emp = playOf(world)?.emp[enemy.id];
  if (!emp || world.elapsed >= emp.until) return { speed: 1, interval: 1 };
  return { speed: 1 - emp.slow, interval: 1 + emp.slow };
}

/** Pull one enemy toward the nearest living ally. True when lure owns this enemy's move. */
export function applyLure(world: World, enemy: Unit, dt: number): boolean {
  if (!playOf(world)?.rules || !anyone(world, "lure") || !enemy.alive) return false;
  const r = trueRate(world, "lure");
  const reach = world.balance.weaponRange * 2 * (1 + r);
  let best: Unit | null = null;
  let d = reach;
  for (const u of living(world)) {
    const dd = dist(enemy.pos, u.pos);
    if (dd <= d) { d = dd; best = u; }
  }
  if (!best) return false;
  const stop = world.balance.weaponRange;
  if (d <= stop) {
    enemy.vel = { x: 0, y: 0 };
    return true;
  }
  const dir = norm({ x: best.pos.x - enemy.pos.x, y: best.pos.y - enemy.pos.y });
  const sp = 70;
  enemy.vel = { x: dir.x * sp, y: dir.y * sp };
  enemy.pos.x += enemy.vel.x * dt;
  enemy.pos.y += enemy.vel.y * dt;
  return true;
}

export function salvageSeconds(world: World): number | null {
  return playOf(world)?.rules ? COLLECT_SECONDS : null;
}

export function secondExtractPull(world: World): boolean {
  const p = playOf(world);
  if (!p?.rules || !world.boarding) return false;
  const c = world.boarding.center;
  for (const u of living(world)) {
    if (dist(u.pos, c) > world.boarding.radius) u.moveTarget = { ...c };
  }
  return true;
}

export function focusTarget(world: World, unit: Unit): Unit | null {
  if (!playOf(world)?.rules) return null;
  const order = playOf(world)?.order;
  if (order?.kind !== "focus") return null;
  const foe = world.enemies.find((e) => e.id === order.enemyId && e.alive);
  if (!foe) return null;
  const range = world.balance.weaponRange * modsFor(world, unit.id).range;
  if (dist(unit.pos, foe.pos) > range) return null;
  return foe;
}

export function ammoMaxMul(world: World, unitId: string): number {
  const gun = modsFor(world, unitId).gun;
  if (gun === "mmr") return 1 / 5;
  if (gun === "lmg") return 2;
  return 1;
}

export { effectRate };
