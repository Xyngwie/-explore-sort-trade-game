/**
 * Circuit actions during a sortie (Issue #269, 神宮 10/11–12 decisions).
 * - `rules`: circuit effects are live (attached in both unlock modes; a
 *   sortie with no effect circuits plays exactly as before).
 * - `release`: release-mode extras only — command locks via 1×1, the
 *   false-1×1 wingman ×2 (Q3a/Q3c), and the #269 rework of the basic
 *   collect / second return press. In `all_unlocked` these stay off.
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
  MECH_AMMO_BASE_CAPACITY,
  ORDER_MOVE_SPEED,
  SMG_CYCLE,
  SMG_INTERVAL_SEC,
  SMG_TAIL_SEC,
  SUPPRESS_SEC,
  TRENCH_SETUP_MIN_SEC,
  TRENCH_SETUP_SEC,
  addDestroyedGen1,
  classifyCircuit,
  effectRate,
  cargoSlotBonus,
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
import { pushLog, spawnContainersAt } from "./orders";
import { LOAD_PER_WRECK, canTakeContainer, loadLineJa, loadSpeedRatio, roomFor, unitLoad, wreckCarrierId } from "./carry";
import type { Bullet, Unit, World } from "./types";
import { IDENTITY_ABILITY_SCALE, releaseAbilityScale, type AbilityScale } from "./releaseAbility";

export type CircuitOrder =
  | { kind: "protect"; allyId: string }
  | { kind: "focus"; enemyId: string }
  | { kind: "pincer"; enemyId: string; points: Record<string, Vec2> }
  | { kind: "forced_march"; x: number; y: number }
  | { kind: "trench"; x: number; y: number; left: number; r: number }
  | { kind: "distribute"; x: number; y: number; left: number }
  | { kind: "suppress"; enemyId: string; left: number }
  | { kind: "haul"; prevStance: Record<string, Unit["stance"]> }
  | null;

export type CircuitPlayState = {
  /** Circuit effects are live (both unlock modes). */
  rules: boolean;
  /** Release mode: command locks, Q3a ×2 and the #269 basic-command rework. */
  release: boolean;
  captainOneByOne: boolean;
  captainTrueOne: boolean;
  wingTrueOne: Record<string, boolean>;
  wingFalseOne: Record<string, boolean>;
  loadout: Record<string, ClassifiedCircuit[]>;
  order: CircuitOrder;
  pending: { kind: string; pick: "enemy" | "ally" | "map" | "none"; unitIds?: string[] } | null;
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
  /** Second press of an open return circle pulls living units outside it inward. */
  pullOutside: boolean;
  /** Last wreck tapped for the existing collect command. Not a save key. */
  collectTap: string | null;
  collectDown: boolean;
  /** 項目4-1: wreck spot ids each unit is carrying (unit id → ids). Rides in the 5-3 checkpoint; backfilled from the old leader-only `carried`. */
  carry: Record<string, string[]>;
  /** 項目4-1: an 8 s wreck pickup in progress per unit (unit id → wreck id + seconds). */
  wreckChannel: Record<string, { id: string; t: number }>;
  /** Pre-4-1 checkpoints: wreck ids in the leader inventory (read once by the backfill). */
  carried?: string[];
  /** PR-B: release-only nine-ability scale per unit (releaseAbility.ts). Not a save key. */
  ability: Record<string, AbilityScale>;
  /** PR-B N1: point a non-autonomous wingman was ordered to move to. Not a save key. */
  wingMove: Record<string, Vec2>;
  /** PR-B: ammo held back by the max-ammo scale (kept in stock, never spent). Not a save key. */
  ammoFloor: Record<string, number>;
  /** PR-B P1: wingmen selected for the palette under the map (+ palette step). Not a save key. */
  wingSelect?: { ids: string[]; step: "root" | "move" } | null;
  /** 項目4-2 C1: wingman 「回収」 target (wreck spot id or container id; n0 = containers held at the order). Not a save key. */
  wingRecover?: Record<string, { kind: "wreck" | "crate"; id: string; n0: number }>;
  /** 項目4-2 C1d: where a wingman waits after picking up (manual: moved by a map tap while carrying the captain). Not a save key. */
  wingHold?: Record<string, { x: number; y: number; manual: boolean }>;
  /** fix/circuit-ammo-activity-refill: last sortie ammo cap per mech (cap changes move ammoFloor). Not a save key. */
  ammoCapAt?: Record<string, number>;
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

function blank(release: boolean): CircuitPlayState {
  return {
    rules: true,
    release,
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
    pullOutside: false,
    collectTap: null,
    collectDown: false,
    carry: {},
    wreckChannel: {},
    ability: {},
    wingMove: {},
    ammoFloor: {},
    wingRecover: {},
    wingHold: {},
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

/**
 * Q3 (神宮 10/12, overrides #269): the captain can move, fire, collect,
 * return and retreat without any circuit. Kept as an API for callers.
 */
export function movementLocked(_world: World): boolean {
  return false;
}

/** Release-mode extras (Q3a ×2, #269 basic-command rework). */
function releaseOn(world: World): boolean {
  const p = playOf(world);
  return !!p?.rules && p.release;
}

function own(world: World, unitId: string): ClassifiedCircuit[] {
  const enemy = world.enemies.find(e => e.id === unitId);
  if (enemy) return (enemy.enemyIdentity?.circuits ?? []).map(c => ({ ...c, r: effectRate(c.effect), effectKey: c.effectKey as CircuitEffectKey, oneByOne: null, conductive: c.effect > 0, cargoSlots: c.effectKey === 'cargo_slots' ? cargoSlotBonus(c.effect) : 0, perfectPt: 0, false20: false, true20: false }));
  return playOf(world)?.loadout[unitId] ?? [];
}

/**
 * 項目4-2 C3 (W5 / Q4): circuits that act this sortie — living units, plus a wreck
 * that a living unit carries. An uncarried wreck's circuits do not act.
 */
function counted(world: World, unitId: string): boolean {
  const u = friendlies(world).find((x) => x.id === unitId);
  if (!u) return true; // loadout entry without a unit (tests / hub-only): keep today's behaviour
  if (u.alive) return true;
  const by = wreckCarrierId(world, u.id);
  return by != null && !!friendlies(world).find((x) => x.id === by && x.alive);
}

function anyone(world: World, key: CircuitEffectKey): boolean {
  const p = playOf(world);
  if (!p) return false;
  return Object.entries(p.loadout).some(([id, list]) => counted(world, id) && list.some((c) => c.effectKey === key && (c.effect > 0 || c.trueBoard)));
}

/** 項目4-2 N2: the wingman carrying the captain's wreck (manual control, air support, 帰還要請). */
export function captainRescuer(world: World): Unit | null {
  if (world.leader.alive || !world.leader.instanceId) return null;
  const by = wreckCarrierId(world, world.leader.id);
  if (!by) return null;
  return world.wingmen.find((w) => w.id === by && w.alive) ?? null;
}

/** 項目4-2: captain alive, or carried by a wingman — the captain's commands work. */
export function captainActive(world: World): boolean {
  return world.leader.alive || captainRescuer(world) != null;
}

function hasRecover(world: World, unitId: string): boolean {
  return !!selfKey(world, unitId, "recover");
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
  if (world.enemies.some(e => e.id === unitId)) return m;
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
  // PR-B: release-only nine-ability scale by the equipped 1×1 (Q3a ×2 for a
  // false-1×1 wingman is folded into the scale). Move speed, max ammo, bullet
  // speed, fire interval and max power are applied where they are used
  // (abilityOf). Max power stays out of `activity` so the scaled cap never
  // lands in world.mechBattery, which goes home with the mech.
  const s = abilityOf(world, unitId);
  m.attack *= s.attack;
  m.range *= s.range;
  m.vision *= s.vision;
  m.armor *= s.maxDurability;
  return m;
}

/** PR-B: the unit's release ability scale (×1 everywhere outside release). */
export function abilityOf(world: World, unitId: string): AbilityScale {
  const p = playOf(world);
  if (world.enemies.some(e => e.id === unitId) || !p?.rules || !p.release) return IDENTITY_ABILITY_SCALE;
  return p.ability[unitId] ?? abilityOfRelease(unitId);
}

/** Release scale for a unit with no loadout row (no 1×1 → provisional ×0.5). */
function abilityOfRelease(unitId: string): AbilityScale {
  return releaseAbilityScale({ release: true, isCaptain: unitId === "leader", oneByOneEffect: null, hasFalseOne: false });
}

function unitById(world: World, id: string): Unit | null {
  return friendlies(world).find((u) => u.id === id) ?? null;
}

/**
 * `release`: the active unlock mode is "release". Effects are attached in
 * both modes. Q4: circuits on a `destroyed` mech never count.
 */
export function attachCircuitPlay(world: World, hub: HubSnapshot | null, release: boolean): void {
  const play = blank(release);
  play.cooldownSec = readAirSupportCooldownSec(hub);
  const ids = world.deployedInstanceIds;
  const unitIds = ["leader", "wing-a", "wing-b"];
  if (hub) {
    for (let i = 0; i < Math.min(ids.length, unitIds.length); i++) {
      const inst = ids[i]!;
      const unitId = unitIds[i]!;
      const mech = hub.fleet.find((m) => m.instanceId === inst);
      if (mech?.status === "destroyed") continue;
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
  play.ability = abilityFromLoadout(play.loadout);
  play.discoverDone = hub ? hasTrueOneByOne(hub) : false;
  world.circuitPlay = play;
}

/** PR-B: the release scale of every unit from its loaded circuits (Q4 rows already skipped). */
export function abilityFromLoadout(loadout: Record<string, ClassifiedCircuit[]>): Record<string, AbilityScale> {
  const out: Record<string, AbilityScale> = {};
  for (const id of ["leader", "wing-a", "wing-b"]) {
    const list = loadout[id] ?? [];
    const ones = list.filter((c) => c.side === 1);
    out[id] = releaseAbilityScale({
      release: true,
      isCaptain: id === "leader",
      oneByOneEffect: ones.length === 0 ? null : (ones.some((c) => c.oneByOne === "true") ? 4 : 0),
      hasFalseOne: list.some((c) => c.oneByOne === "false"),
    });
  }
  return out;
}

/**
 * 5-3 resume: a checkpoint written before PR-B has no `ability` / `wingMove`
 * / `ammoFloor`; rebuild them (scale from the saved loadout, no pending moves,
 * floor recomputed on the first tick).
 */
export function backfillCircuitPlayState(play: Partial<CircuitPlayState> | null | undefined): void {
  if (!play || typeof play !== "object") return;
  if (!play.ability || typeof play.ability !== "object") play.ability = abilityFromLoadout(play.loadout ?? {});
  if (!play.wingMove || typeof play.wingMove !== "object") play.wingMove = {};
  if (!play.ammoFloor || typeof play.ammoFloor !== "object") play.ammoFloor = {};
  // 項目4-1: per-unit carry. Old checkpoints only had the leader's `carried` list.
  if (!play.carry || typeof play.carry !== "object") {
    const old = Array.isArray(play.carried) ? play.carried.filter((id): id is string => typeof id === "string") : [];
    play.carry = old.length > 0 ? { leader: old } : {};
  }
  delete play.carried;
  if (!play.wreckChannel || typeof play.wreckChannel !== "object") play.wreckChannel = {};
  // 項目4-2: wingman recovery orders / wait spots (none in an old checkpoint).
  if (!play.wingRecover || typeof play.wingRecover !== "object") play.wingRecover = {};
  if (!play.wingHold || typeof play.wingHold !== "object") play.wingHold = {};
}

export function refreshStarterCircuit(hub: HubSnapshot): HubSnapshot {
  return ensureCaptainFalseOneByOne(hub);
}

export function circuitButtons(world: World): { id: string; label: string }[] {
  const p = playOf(world);
  if (!p?.rules) return [];
  const out: { id: string; label: string }[] = [];
  const alive = friendlies(world).filter((u) => counted(world, u.id));
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
  // N2: once the leader is wrecked, air support is unavailable (and not shown) —
  // until a wingman carries the captain's wreck (項目4-2 C2).
  if (p.captainTrueOne && p.cooldownSec <= 0 && captainActive(world)) out.push({ id: "air_support", label: ORDER_LABEL.air_support! });
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
  p.wingSelect = null; // P1: another designated action takes over the next map tap

  if (id === "haul") {
    issueHaul(world);
    p.pending = null;
    return;
  }
  if (id === "air_support") {
    if (!captainActive(world)) { p.pending = null; return; } // N2 / 項目4-2 C2
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
  if (pending.kind === "wing_move") {
    issueWingmanMove(world, pending.unitIds ?? [], pt);
    p.wingSelect = null;
    return true;
  }
  if (pending.kind === "wing_recover") {
    // fix/rescue-palette-desktop: a tap that hits no wreck / container keeps the
    // pick armed (and the palette open), so a near miss costs one more tap, not
    // the whole 僚機 → 回収 → 対象 again.
    if (!recoverTargetAt(world, pt)) {
      p.pending = pending;
      pushLog(world, "回収する対象が無い（残骸かコンテナをタップ）。");
      return true;
    }
    issueWingmanRecover(world, pending.unitIds ?? [], pt);
    p.wingSelect = null;
    return true;
  }
  if (pending.pick === "enemy") {
    const enemy = nearestUnit(world.enemies, pt);
    if (!enemy) return true;
    if (pending.kind === "air_support") tryAirSupport(world, enemy);
    else if (pending.kind === "focus") assignOrder(world, { kind: "focus", enemyId: enemy.id });
    else if (pending.kind === "suppress") assignOrder(world, { kind: "suppress", enemyId: enemy.id, left: SUPPRESS_SEC });
    else if (pending.kind === "pincer") {
      const who = holders(world, "pincer");
      assignOrder(world, { kind: "pincer", enemyId: enemy.id, points: pincerPoints(world.leader.pos, enemy.pos, who) });
    }
    return true;
  }
  if (pending.pick === "ally") {
    const ally = nearestUnit(world.wingmen, pt);
    if (!ally) return true;
    assignOrder(world, { kind: "protect", allyId: ally.id });
    return true;
  }
  if (pending.kind === "forced_march") assignOrder(world, { kind: "forced_march", x: pt.x, y: pt.y });
  else if (pending.kind === "trench") {
    const r = holders(world, "trench").reduce((s, u) => s + (selfKey(world, u.id, "trench")?.r ?? 0), 0);
    const left = Math.max(TRENCH_SETUP_MIN_SEC, TRENCH_SETUP_SEC * (1 - Math.min(0.9, r)));
    assignOrder(world, { kind: "trench", x: pt.x, y: pt.y, left, r });
  } else if (pending.kind === "distribute") {
    assignOrder(world, { kind: "distribute", x: pt.x, y: pt.y, left: DISTRIBUTE_SEC });
  }
  return true;
}

function restoreHaul(world: World, order: { prevStance: Record<string, Unit["stance"]> }): void {
  for (const [id, stance] of Object.entries(order.prevStance)) {
    const u = friendlies(world).find((x) => x.id === id);
    if (u) u.stance = stance;
  }
}

function assignOrder(world: World, next: CircuitOrder): void {
  const p = playOf(world);
  if (!p) return;
  if (p.order?.kind === "haul") restoreHaul(world, p.order);
  p.order = next;
}

function issueHaul(world: World): void {
  const p = playOf(world);
  if (!p) return;
  if (p.order?.kind === "haul") restoreHaul(world, p.order);
  if (!world.camp) world.camp = { pos: { ...world.leader.pos }, stashedCount: 0 };
  const squad = anyone(world, "squad_haul");
  const who = living(world).filter((u) => squad || !!selfKey(world, u.id, "haul_speed") || !!selfKey(world, u.id, "squad_haul"));
  const prevStance: Record<string, Unit["stance"]> = {};
  for (const u of who) prevStance[u.id] = u.stance;
  p.order = { kind: "haul", prevStance };
}

function tryAirSupport(world: World, enemy: Unit): void {
  const p = playOf(world);
  if (!p?.captainTrueOne || !enemy.alive) return;
  if (!captainActive(world)) return; // N2 / 項目4-2 C2
  if (p.cooldownSec > 0) return;
  const loaded = loadHubSaveFromLocalStorage();
  const hub = loaded?.hub;
  if (!hub || hub.credits < AIR_SUPPORT_COST) return;
  const next = {
    ...hub,
    credits: hub.credits - AIR_SUPPORT_COST,
    airSupportCooldownSec: AIR_SUPPORT_COOLDOWN_SEC,
  };
  // The charge must land in HubSave before the strike: a refused write
  // (newer save elsewhere, storage error) means no strike and no cooldown.
  // Rescue fees (½ / ¾) read the wallet again at the moment of the rescue,
  // so they always see the balance after this charge (no stale balance).
  if (!saveHubSaveToLocalStorage(next)) return;
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
}

export function applyCircuitHubSide(world: World, hub: HubSnapshot): HubSnapshot {
  const p = playOf(world);
  if (!p) return hub;
  let next = hub;
  if (p.cooldownSec > 0) next = { ...next, airSupportCooldownSec: p.cooldownSec };
  else if (next.airSupportCooldownSec) {
    const { airSupportCooldownSec: _drop, ...rest } = next;
    next = rest;
  }
  const n = p.airWrecks.filter((w) => w.recovered && ![...world.enemies,...(world.recoveredEnemyUnits ?? [])].some(e=>e.id===w.id)).length;
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

/** Even split of `total` rounds under per-row caps; the remainder over every cap goes to row 0 (held back by syncCaps). */
export function splitAmmo(total: number, caps: readonly number[]): number[] {
  const out = caps.map(() => 0);
  let left = Math.max(0, Math.floor(total));
  for (;;) {
    const open = caps.map((c, i) => i).filter((i) => out[i]! < caps[i]!);
    if (left <= 0 || open.length === 0) break;
    const each = Math.max(1, Math.floor(left / open.length));
    for (const i of open) {
      if (left <= 0) break;
      const give = Math.min(each, caps[i]! - out[i]!, left);
      out[i]! += give;
      left -= give;
    }
  }
  if (left > 0 && out.length > 0) out[0]! += left;
  return out;
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
    // fix/circuit-ammo-activity-refill: the battery cap with circuits is a
    // sortie-only value (effectiveBatteryCapacity); world.mechBattery keeps
    // the pre-boost capacity, which is what the return writes home.
    const bat = world.mechBattery[inst];
    if (bat && p.baseBattery[inst] == null) p.baseBattery[inst] = bat.capacity || 300;
    // Ammo never leaves the mech here. Anything above this sortie's cap
    // (base 28 × gun × release scale) is held back in ammoFloor and goes home
    // with the mech (the hangar returns it to the stock).
    const now = world.currentAmmo[inst];
    if (now == null) continue;
    const cap = sortieAmmoCap(world, u);
    if (!p.ammoCapAt) p.ammoCapAt = {};
    const floor = p.ammoFloor[inst];
    if (floor == null) {
      p.ammoFloor[inst] = Math.max(0, now - cap);
    } else {
      const ready = Math.max(0, now - floor);
      const was = p.ammoCapAt[inst] ?? cap;
      if (ready > cap) {
        // the cap went down mid-sortie (gun circuit / mode): hold the rest back
        p.ammoFloor[inst] = now - cap;
      } else if (cap > was && floor > 0) {
        // the cap went up: held-back rounds become ready again (never created)
        p.ammoFloor[inst] = floor - Math.min(floor, cap - ready);
      }
    }
    p.ammoCapAt[inst] = cap;
  }
}

/**
 * Rounds a unit may carry ready to fire in this sortie: base 28 × its gun
 * circuit (MMR ÷5, LMG ×2) × the release max-ammo scale (P3/P4: sortie only).
 * Same base as the hangar cap (shared mechAmmoCap); never compounds.
 */
export function sortieAmmoCap(world: World, unit: Unit): number {
  return Math.max(1, Math.round(MECH_AMMO_BASE_CAPACITY * ammoMaxMul(world, unit.id) * abilityOf(world, unit.id).maxAmmo));
}

function orderOwns(world: World, unit: Unit): boolean {
  const order = playOf(world)?.order;
  if (!order) return false;
  if (order.kind === "distribute") return true;
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
    if (!foe?.alive) assignOrder(world, null);
    return;
  }
  if (order.kind === "pincer") {
    const foe = world.enemies.find((e) => e.id === order.enemyId);
    if (!foe?.alive) { assignOrder(world, null); return; }
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
    if (who.length === 0 || who.every((u) => arrived(u, order, world))) assignOrder(world, null);
    return;
  }
  if (order.kind === "trench") {
    order.left -= dt;
    if (order.left <= 0) {
      const covers = getCoverObjects(world);
      covers.push({ id: `trench-${covers.length}`, pos: { x: order.x, y: order.y }, radius: COVER_RADIUS });
      assignOrder(world, null);
    }
    return;
  }
  if (order.kind === "distribute") {
    order.left -= dt;
    const pt = { x: order.x, y: order.y };
    const near = living(world).filter((u) => dist(u.pos, pt) <= world.balance.interactRadius);
    if (order.left <= 0 || near.length === living(world).length) {
      if (near.length > 0) {
        let act = 0;
        const ammos: { id: string; floor: number; usable: number; cap: number }[] = [];
        const acts: { id: string; cap: number }[] = [];
        for (const u of near) {
          const id = u.instanceId;
          if (!id) continue;
          const a = world.currentAmmo[id];
          if (a != null) {
            const floor = Math.min(a, p.ammoFloor[id] ?? 0);
            ammos.push({ id, floor, usable: a - floor, cap: sortieAmmoCap(world, u) });
          }
          const b = world.mechBattery[id];
          if (b) { act += b.activity; acts.push({ id, cap: effectiveBatteryCapacity(world, u) ?? b.capacity }); }
        }
        if (ammos.length > 0) {
          // Share the ready rounds evenly up to each cap; nothing is thrown away
          // (a remainder nobody can take stays held back and goes home).
          const shares = splitAmmo(ammos.reduce((n, r) => n + r.usable, 0), ammos.map((r) => r.cap));
          ammos.forEach((r, i) => { world.currentAmmo[r.id] = r.floor + shares[i]!; });
        }
        if (acts.length > 0) {
          const avg = Math.floor(act / acts.length);
          for (const row of acts) {
            const b = world.mechBattery[row.id];
            if (b) b.activity = Math.min(row.cap, avg);
          }
        }
      }
      assignOrder(world, null);
    }
    return;
  }
  if (order.kind === "suppress") {
    order.left -= dt;
    const foe = world.enemies.find((e) => e.id === order.enemyId);
    if (!foe?.alive || order.left <= 0) assignOrder(world, null);
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
      assignOrder(world, null);
    }
  }
}

export function stepCircuitPlay(world: World, dt: number): void {
  const p = playOf(world);
  if (!p?.rules) return;
  p.stepDt = dt;
  placeCarried(world);
  tickWreckPickups(world, dt);
  if (p.cooldownSec > 0) p.cooldownSec = Math.max(0, p.cooldownSec - dt);
  for (const id of Object.keys(p.smg)) {
    const s = p.smg[id]!;
    if (s.wait > 0) s.wait = Math.max(0, s.wait - dt);
  }
  updateFog(world);
  rememberEnemies(world);
  syncCaps(world);
  tickWingmanMoves(world);
  tickWingmanRecover(world);
  tickOrder(world, dt);
}

export function circuitMoveTarget(world: World, unit: Unit): Vec2 | null {
  const p = playOf(world);
  if (!p?.rules) return null;
  if (p.pullOutside && world.boarding && dist(unit.pos, world.boarding.center) > world.boarding.radius) {
    return { ...world.boarding.center };
  }
  if (unit.kind === "wingman") {
    const own4 = recoverMove(world, unit);
    if (own4) return own4;
  }
  if (orderOwns(world, unit)) return orderMove(world, unit);
  if (p.order && (p.order.kind === "distribute" || (p.order.kind === "haul" && anyone(world, "squad_haul")))) {
    return orderMove(world, unit);
  }
  // The captain is player-driven: autonomous circuit moves (scatter, cover,
  // orbit, …) apply to wingmen only.
  if (unit.kind === "leader") return null;
  const wm = p.wingMove[unit.id];
  if (wm) return { ...wm };
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
  // 項目4-1/4-2: circuit-driven moves slow down with load too (load 0 → ×1).
  return ORDER_MOVE_SPEED * (1 + Math.max(0, extra)) * abilityOf(world, unit.id).moveSpeed * loadSpeedRatio(unitLoad(world, unit));
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
  const ammo = usableAmmo(world, from);
  const carried = world.currentAmmo[from.instanceId] ?? 0;
  const fi = abilityOf(world, from.id).fireInterval;
  const reach = dist(from.pos, target.pos);
  if (ammo <= 0 && m.melee > 0 && reach <= from.radius + target.radius) {
    target.hp -= (from.kind === "enemy" ? world.balance.enemyDamage : world.balance.bulletDamage) * (1 + m.melee) * m.attack;
    noteDamageBreaksSuppress(world, target);
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
    world.currentAmmo[from.instanceId] = carried - 1;
    st.n += 1;
    if (st.n >= SMG_CYCLE) { st.n = 0; st.wait = SMG_TAIL_SEC * fi; from.cooldown = 0; }
    else from.cooldown = SMG_INTERVAL_SEC * fi;
    return true;
  }
  if (from.cooldown > 0) return true;
  if (gun === "shotgun") {
    const angles = [-10, -5, 0, 5, 10];
    let left = ammo;
    let fired = 0;
    for (const deg of angles) {
      if (left <= 0) break;
      spawnShot(world, from, target, (1 / 4) * (1 + r) * m.attack, 1, false, (deg * Math.PI) / 180);
      left -= 1;
      fired += 1;
    }
    world.currentAmmo[from.instanceId] = carried - fired;
    from.cooldown = world.balance.fireCooldown * fi;
    return true;
  } else if (gun === "lmg") {
    spawnShot(world, from, target, m.attack, 1, false, 0);
    from.cooldown = (world.balance.fireCooldown / (2 * (1 + r))) * fi;
  } else if (gun === "fast_round") {
    spawnShot(world, from, target, m.attack, 1.5, false, 0);
    from.cooldown = (world.balance.fireCooldown / (1 + r)) * fi;
  } else if (gun === "homing_round") {
    spawnShot(world, from, target, m.attack, 0.75, false, 0, { homingId: target.id, bend: Math.min(0.3, r) });
    from.cooldown = world.balance.fireCooldown * fi;
  } else if (gun === "emp_round") {
    const slow = Math.min(EMP_SLOW_CAP, EMP_SLOW_BASE + r);
    spawnShot(world, from, target, m.attack, 1, true, 0, { empSlow: slow });
    from.cooldown = world.balance.fireCooldown * fi;
  } else {
    spawnShot(world, from, target, m.attack, 1, false, 0);
    from.cooldown = world.balance.fireCooldown * fi;
  }
  world.currentAmmo[from.instanceId] = carried - 1;
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
  const speed = world.balance.bulletSpeed * speedMul * abilityOf(world, from.id).bulletSpeed;
  const b: Bullet = {
    alive: true,
    pos: { ...from.pos },
    vel: { x: Math.cos(base) * speed, y: Math.sin(base) * speed },
    ttl: world.balance.bulletTtlSec,
    damage: (from.kind === "enemy" ? world.balance.enemyDamage : world.balance.bulletDamage) * damageMul,
    fromEnemy: from.kind === "enemy",
    ownerId: from.id,
    ...(emp ? { emp: true, empSlow: extra?.empSlow } : {}),
    ...(extra?.homingId ? { homingId: extra.homingId, bend: extra.bend } : {}),
  };
  world.bullets.push(b);
  from.heading = base;
}

export function bendHoming(world: World, b: Bullet, dt: number): void {
  if (!b.homingId || b.bend == null || !b.alive) return;
  const foe = [...world.enemies, ...friendlies(world)].find((e) => e.id === b.homingId);
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
  if (!playOf(world)?.rules || (unit.kind !== "enemy" && !b.fromEnemy) || !unit.alive) return false;
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
  const p = playOf(world);
  if (p?.order?.kind === "suppress" && p.order.enemyId === enemy.id) assignOrder(world, null);
  return true;
}

export function salvageSeconds(world: World): number | null {
  return releaseOn(world) ? COLLECT_SECONDS : null;
}

export function secondExtractPull(world: World): boolean {
  const p = playOf(world);
  if (!p || !releaseOn(world) || !world.boarding) return false;
  p.pullOutside = true;
  const c = world.boarding.center;
  for (const u of living(world)) {
    if (dist(u.pos, c) > world.boarding.radius) u.moveTarget = { ...c };
  }
  return true;
}

type WreckSpot = { id: string; pos: Vec2; move: (at: Vec2) => void };

function wreckSpots(world: World): WreckSpot[] {
  const out: WreckSpot[] = [];
  for (const u of [...friendlies(world), ...world.enemies]) {
    if (u.alive || (u.kind === "enemy" && u.hp > 0) || (u.kind !== "enemy" && !u.instanceId) || u.enemyState?.recovered) continue;
    out.push({
      id: u.id,
      pos: u.pos,
      move: (at) => {
        u.pos.x = at.x;
        u.pos.y = at.y;
      },
    });
  }
  for (const m of world.strandedMechs ?? []) {
    if (!m.wreck) continue;
    out.push({
      id: `s:${m.instanceId}`,
      pos: m.pos,
      move: (at) => {
        m.pos.x = at.x;
        m.pos.y = at.y;
      },
    });
  }
  for (const w of playOf(world)?.airWrecks ?? []) {
    if (w.recovered || world.enemies.some(e=>e.id===w.id)) continue;
    out.push({
      id: `a:${w.id}`,
      pos: w.pos,
      move: (at) => {
        w.pos.x = at.x;
        w.pos.y = at.y;
      },
    });
  }
  return out;
}

function wreckById(world: World, id: string): WreckSpot | null {
  return wreckSpots(world).find((w) => w.id === id) ?? null;
}

/** 項目4-1: carried wrecks ride on their carrier; a fallen carrier drops them where it fell (C6). */
function placeCarried(world: World): void {
  const p = playOf(world);
  if (!p) return;
  for (const [unitId, ids] of Object.entries(p.carry ?? {})) {
    const unit = friendlies(world).find((u) => u.id === unitId);
    if (!unit || !unit.alive) {
      if (unit && ids.length > 0) pushLog(world, `${unitName(unit)}が大破：積載していた残骸をその場に落とした。`);
      delete p.carry[unitId];
      continue;
    }
    const next: string[] = [];
    for (const id of ids) {
      const w = wreckById(world, id);
      if (!w) continue;
      w.move(unit.pos);
      next.push(id);
    }
    if (next.length > 0) p.carry[unitId] = next;
    else delete p.carry[unitId];
  }
}

function unitName(u: Unit): string {
  return u.kind === "leader" ? "隊長機" : u.name;
}

/** Drop everything a unit carries where it stands (containers and wrecks). */
function dropAllCargo(world: World, unit: Unit): void {
  dropContainerStack(world, unit);
  const p = playOf(world);
  if (p?.carry?.[unit.id]) delete p.carry[unit.id];
}

/** Wrecks someone can pick up: not carried, and not the picker itself. */
function freeWreckSpots(world: World, picker: Unit): WreckSpot[] {
  return wreckSpots(world).filter((w) => w.id !== picker.id && wreckCarrierId(world, w.id) == null);
}

export function wreckChannelOf(world: World, unitId: string): { id: string; t: number } | null {
  return playOf(world)?.wreckChannel?.[unitId] ?? null;
}

/** Start the 8 s wreck pickup for a unit (target must be within interactRadius). */
export function startWreckPickup(world: World, unit: Unit, wreckId: string): "started" | "far" | "taken" | "none" {
  const p = playOf(world);
  if (!p || !unit.alive) return "none";
  const w = wreckById(world, wreckId);
  if (!w || w.id === unit.id) return "none";
  if (wreckCarrierId(world, wreckId) != null) return "taken";
  if (dist(unit.pos, w.pos) > world.balance.interactRadius) return "far";
  p.wreckChannel[unit.id] = { id: wreckId, t: 0 };
  unit.salvageId = null;
  unit.salvageT = 0;
  return "started";
}

/** 8 s channel; moving out of interactRadius cancels it. On completion the #269 swap makes room. */
function tickWreckPickups(world: World, dt: number): void {
  const p = playOf(world);
  if (!p) return;
  for (const [unitId, ch] of Object.entries(p.wreckChannel ?? {})) {
    const unit = friendlies(world).find((u) => u.id === unitId);
    const w = wreckById(world, ch.id);
    if (!unit || !unit.alive || !w || wreckCarrierId(world, ch.id) != null || dist(unit.pos, w.pos) > world.balance.interactRadius) {
      if (unit?.alive && w && wreckCarrierId(world, ch.id) == null) pushLog(world, `${unitName(unit)}：残骸の回収を中断（離れた）。`);
      delete p.wreckChannel[unitId];
      continue;
    }
    ch.t += dt;
    if (ch.t < COLLECT_SECONDS) continue;
    delete p.wreckChannel[unitId];
    // #269: holding containers, taking a wreck drops the containers in place. When a
    // wreck still does not fit (already carrying one), drop the whole inventory too.
    if (roomFor(world, unit) < LOAD_PER_WRECK) dropContainerStack(world, unit);
    if (roomFor(world, unit) < LOAD_PER_WRECK) {
      const held = p.carry[unitId] ?? [];
      if (held.length > 0) pushLog(world, `${unitName(unit)}：積載していた残骸をその場に降ろした。`);
      delete p.carry[unitId];
    }
    p.carry[unitId] = [...(p.carry[unitId] ?? []), ch.id];
    w.move(unit.pos);
    pushLog(world, `${unitName(unit)}：残骸を積載（${loadLineJa(world, unit)}）。`);
  }
}

function dropContainerStack(world: World, unit: Unit): void {
  const n = unit.salvagedCount;
  if (n <= 0) return;
  unit.salvageId = null;
  unit.salvageT = 0;
  unit.salvagedCount = 0;
  world.salvaged = Math.max(0, world.salvaged - n);
  const spawned = spawnContainersAt(world, unit.pos, n, { discovered: true, idPrefix: "purge" });
  const glow = world.balance.deathDropGlowSec;
  for (const c of spawned) c.glowT = glow;
}


/** Map tap used by the existing collect command. A miss clears the wreck tap. */
export function noteCollectTap(world: World, pt: Vec2): void {
  const p = playOf(world);
  if (!p || !releaseOn(world)) return;
  let best: WreckSpot | null = null;
  let d: number = world.balance.interactRadius;
  for (const w of wreckSpots(world)) {
    const dd = dist(w.pos, pt);
    if (dd <= d) {
      d = dd;
      best = w;
    }
  }
  p.collectTap = best?.id ?? null;
}

/**
 * Collect press (#269 + 項目4-1). A tapped wreck within interactRadius starts the
 * 8 s pickup — empty-handed too; holding containers they are dropped when the wreck
 * goes in (#269 swap). Without a tap the nearest cargo is taken: a container keeps
 * the normal salvage channel, a wreck starts the 8 s pickup. Nothing near: drop the
 * whole inventory in place.
 */
export function applyCollectPress(world: World): void {
  const p = playOf(world);
  if (!p || !releaseOn(world) || !world.leader.alive) return;
  const leader = world.leader;
  const tap = p.collectTap;
  if (tap) {
    const wreck = wreckById(world, tap);
    if (!wreck || wreck.id === leader.id) { p.collectTap = null; return; }
    const r = startWreckPickup(world, leader, tap);
    if (r === "far") { pushLog(world, "残骸が遠い。近づいてから回収。"); return; }
    p.collectTap = null;
    if (r === "taken") { pushLog(world, "その残骸は積載中。"); return; }
    if (r === "started") pushLog(world, `残骸を回収中（${COLLECT_SECONDS}秒）。`);
    return;
  }
  const radius = world.balance.interactRadius;
  let crateD = Infinity;
  for (const c of world.containers) if (c.discovered && !c.taken) crateD = Math.min(crateD, dist(leader.pos, c.pos));
  let near: WreckSpot | null = null;
  let wreckD = Infinity;
  for (const w of freeWreckSpots(world, leader)) {
    const d = dist(leader.pos, w.pos);
    if (d < wreckD) { wreckD = d; near = w; }
  }
  if (near && wreckD <= radius && wreckD < crateD) {
    if (startWreckPickup(world, leader, near.id) === "started") pushLog(world, `残骸を回収中（${COLLECT_SECONDS}秒）。`);
    return;
  }
  if (crateD < radius) return;
  dropAllCargo(world, leader);
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

/**
 * PR-B: rounds this unit may still fire. The max-ammo scale holds back
 * `ammoFloor` (kept in stock, returned with the mech); outside release the
 * floor is 0 and this is the carried ammo.
 */
export function usableAmmo(world: World, unit: Unit): number {
  if (unit.instanceId == null) return 0;
  const cur = world.currentAmmo[unit.instanceId] ?? 0;
  const floor = playOf(world)?.ammoFloor[unit.instanceId] ?? 0;
  return Math.max(0, cur - floor);
}

/**
 * PR-B: the unit's max power in this sortie (battery cap × the release
 * scale). world.mechBattery keeps the home value, so the scale never
 * compounds over sorties.
 */
export function effectiveBatteryCapacity(world: World, unit: Unit): number | null {
  if (!unit.instanceId) return null;
  const b = world.mechBattery[unit.instanceId];
  if (!b) return null;
  // Circuit activity boost and the release max-power scale exist only during
  // the sortie; neither is written to world.mechBattery (no compounding).
  return Math.max(1, Math.round(b.capacity * modsFor(world, unit.id).activity * abilityOf(world, unit.id).maxPower));
}

/** One entry of the wingman action palette (N1). Locked actions are never listed. */
export type WingmanPaletteAction = { id: string; label: string; next?: WingmanPaletteAction[] };

/**
 * N1: the wingman command palette as data (extensible: e.g. a future
 * 「攻撃」→「指定した敵」). Only a non-autonomous wingman gets 「移動」 (arms the map pick),
 * and only once the captain carries the true 1×1 「4」 (the leader may be a
 * wreck: N3). Autonomous wingmen and locked actions give an empty list.
 */
export function wingmanPaletteActions(world: World, unitIds: string[]): WingmanPaletteAction[] {
  const p = playOf(world);
  if (!p?.rules || !p.release || world.phase !== "sortie") return [];
  const ids = unitIds.filter((id) => {
    const u = world.wingmen.find((w) => w.id === id);
    return !!u && u.alive && !p.wingTrueOne[id];
  });
  if (ids.length === 0) return [];
  const out: WingmanPaletteAction[] = [];
  // fix/explore-move-tap-panel: 「移動」 arms the map pick at once (「地点選択」 removed).
  if (p.captainTrueOne) out.push({ id: "move", label: "移動", next: [] });
  // 項目4-2 C1a/b: a wingman with the 「回収」 circuit gets 「回収」 without the captain's 「4」.
  if (ids.some((id) => hasRecover(world, id))) out.push({ id: "recover", label: "回収", next: [] });
  return out;
}

/** 項目4-2: the selected wingmen that can take 「回収」. */
function recoverIds(world: World, unitIds: string[]): string[] {
  const p = playOf(world);
  return unitIds.filter((id) => {
    const u = world.wingmen.find((w) => w.id === id);
    return !!u && u.alive && !p?.wingTrueOne[id] && hasRecover(world, id);
  });
}

/** 項目4-2 C1: arm the map pick for 「回収」 → tap a wreck (the captain's too) or a container. */
export function beginWingmanRecoverPick(world: World, unitIds: string[]): boolean {
  const p = playOf(world);
  const ids = recoverIds(world, unitIds);
  if (!p || ids.length === 0) return false;
  p.pending = { kind: "wing_recover", pick: "map", unitIds: ids };
  return true;
}

/** Nearest free wreck (including the captain's) or found container near a tap. */
function recoverTargetAt(world: World, pt: Vec2): { kind: "wreck" | "crate"; id: string } | null {
  const max = Math.max(40, world.balance.interactRadius * 1.5);
  let best: { kind: "wreck" | "crate"; id: string } | null = null;
  let d = max;
  for (const w of wreckSpots(world)) {
    if (wreckCarrierId(world, w.id) != null) continue;
    const dd = dist(w.pos, pt);
    if (dd <= d) { d = dd; best = { kind: "wreck", id: w.id }; }
  }
  for (const c of world.containers) {
    if (!c.discovered || c.taken) continue;
    const dd = dist(c.pos, pt);
    if (dd < d) { d = dd; best = { kind: "crate", id: c.id }; }
  }
  return best;
}

/** 項目4-2 C1c: no distance limit — the wingman walks there itself, then takes 8 s. */
export function issueWingmanRecover(world: World, unitIds: string[], pt: Vec2): string[] {
  const p = playOf(world);
  if (!p) return [];
  const ids = recoverIds(world, unitIds);
  if (ids.length === 0) return [];
  const target = recoverTargetAt(world, pt);
  if (!target) { pushLog(world, "回収する対象が無い（残骸かコンテナをタップ）。"); return []; }
  p.wingRecover ??= {};
  p.wingHold ??= {};
  const what = target.kind === "crate" ? "コンテナ" : target.id === world.leader.id ? "隊長機の残骸" : "残骸";
  for (const id of ids) {
    const u = world.wingmen.find((w) => w.id === id)!;
    if (target.id === id) continue;
    p.wingRecover[id] = { ...target, n0: u.salvagedCount };
    delete p.wingMove[id];
    delete p.wingHold[id];
    delete p.wreckChannel[id];
    pushLog(world, `${u.name}：${what}の回収へ向かう。`);
  }
  return ids;
}

/** 項目4-2: where a recovering / waiting / rescuing wingman goes (null: not ours). */
function recoverMove(world: World, unit: Unit): Vec2 | null {
  const p = playOf(world);
  if (!p) return null;
  const rec = p.wingRecover?.[unit.id];
  if (rec) {
    if (rec.kind === "wreck") {
      const w = wreckById(world, rec.id);
      if (w) return dist(unit.pos, w.pos) <= world.balance.interactRadius * 0.6 ? { ...unit.pos } : { ...w.pos };
    } else {
      const c = world.containers.find((x) => x.id === rec.id);
      if (c) return dist(unit.pos, c.pos) <= world.balance.interactRadius * 0.6 ? { ...unit.pos } : { ...c.pos };
    }
    return null;
  }
  const rescuing = captainRescuer(world)?.id === unit.id;
  if (rescuing && p.wingMove[unit.id]) return { ...p.wingMove[unit.id]! };
  const hold = p.wingHold?.[unit.id];
  if (!hold) return null;
  // C1d: wait where it picked up; once a circle is called, head there (captain wrecked too).
  if (!hold.manual && world.boarding) return { ...world.boarding.center };
  return { x: hold.x, y: hold.y };
}

/** 項目4-2: drive wingman 「回収」 orders (start the 8 s pickup on arrival, then wait). */
function tickWingmanRecover(world: World): void {
  const p = playOf(world);
  if (!p?.wingRecover) return;
  p.wingHold ??= {};
  for (const [id, rec] of Object.entries(p.wingRecover)) {
    const u = world.wingmen.find((w) => w.id === id);
    if (!u || !u.alive) { delete p.wingRecover[id]; continue; }
    if (rec.kind === "wreck") {
      if ((p.carry[id] ?? []).includes(rec.id)) {
        delete p.wingRecover[id];
        p.wingHold[id] = { x: u.pos.x, y: u.pos.y, manual: false };
        if (rec.id === world.leader.id) pushLog(world, `${u.name}が隊長機の残骸を積載。手動操作・航空支援・帰還要請が戻った（地図タップで${u.name}を移動）。`);
        continue;
      }
      const w = wreckById(world, rec.id);
      const by = w ? wreckCarrierId(world, rec.id) : null;
      if (!w || (by && by !== id)) { pushLog(world, `${u.name}：回収の対象が無くなった。`); delete p.wingRecover[id]; continue; }
      if (wreckChannelOf(world, id)) continue;
      if (dist(u.pos, w.pos) <= world.balance.interactRadius * 0.8) {
        if (startWreckPickup(world, u, rec.id) === "started") pushLog(world, `${u.name}：残骸を回収中（${COLLECT_SECONDS}秒）。`);
      }
      continue;
    }
    const c = world.containers.find((x) => x.id === rec.id);
    if (!c || c.taken) {
      if (u.salvagedCount > rec.n0) {
        p.wingHold[id] = { x: u.pos.x, y: u.pos.y, manual: false };
      } else pushLog(world, `${u.name}：回収の対象が無くなった。`);
      delete p.wingRecover[id];
      continue;
    }
    if (!canTakeContainer(world, u)) { pushLog(world, `${u.name}：積載が満杯（${loadLineJa(world, u)}）。コンテナは積めない。`); delete p.wingRecover[id]; continue; }
    if (dist(u.pos, c.pos) <= world.balance.interactRadius * 0.8 && !u.salvageId) u.salvageId = c.id;
  }
}

/** 項目4-2: the wingman is near its 「回収」 container and should run the salvage channel. */
export function wingRecoverWantsSalvage(world: World, unit: Unit): boolean {
  const rec = playOf(world)?.wingRecover?.[unit.id];
  if (!rec || rec.kind !== "crate") return false;
  const c = world.containers.find((x) => x.id === rec.id);
  return !!c && !c.taken && dist(unit.pos, c.pos) <= world.balance.interactRadius;
}

/** N1: arm the map pick for 「移動」→「地点選択」 (one wingman or several). */
export function beginWingmanMovePick(world: World, unitIds: string[]): boolean {
  const p = playOf(world);
  if (!p || wingmanPaletteActions(world, unitIds).length === 0) return false;
  p.pending = { kind: "wing_move", pick: "map", unitIds: [...unitIds] };
  return true;
}

/** P1: wingmen that can be put in the palette (alive, not autonomous, captain 「4」). */
export function paletteWingmen(world: World): string[] {
  return world.wingmen.filter((w) => wingmanPaletteActions(world, [w.id]).length > 0).map((w) => w.id);
}

/** P1: select wingmen and open the palette (root step). Locked → nothing opens. */
export function openWingPalette(world: World, unitIds: string[]): boolean {
  const p = playOf(world);
  const ids = unitIds.filter((id) => paletteWingmen(world).includes(id));
  if (!p || ids.length === 0) return false;
  if (p.pending?.kind === "wing_move" || p.pending?.kind === "wing_recover") p.pending = null;
  p.wingSelect = { ids, step: "root" };
  return true;
}

/** P1: close the palette (and an armed 「地点選択」). */
export function closeWingPalette(world: World): void {
  const p = playOf(world);
  if (!p) return;
  p.wingSelect = null;
  if (p.pending?.kind === "wing_move" || p.pending?.kind === "wing_recover") p.pending = null;
}

/** P1: press a palette entry: 「移動」 → wait for the map tap. */
export function pressWingPalette(world: World, actionId: string): boolean {
  const p = playOf(world);
  const sel = p?.wingSelect;
  if (!p || !sel) return false;
  // fix/explore-move-tap-panel: 「移動」 arms the map pick directly (3 taps: wingman → 移動 → map).
  // An old checkpoint can hold step "move" (the removed 「地点選択」 step): it reads as root,
  // and "point" still arms the pick so nothing saved is stuck.
  if (actionId === "move") return beginWingmanMovePick(world, sel.ids);
  if (actionId === "recover") return beginWingmanRecoverPick(world, sel.ids);
  if (sel.step === "move" && actionId === "point") return beginWingmanMovePick(world, sel.ids);
  return false;
}

/** P1: nearest palette-eligible wingman within `max` world units of `pt`. */
export function paletteWingmanAt(world: World, pt: Vec2, max: number): string | null {
  let best: string | null = null;
  let bd = max;
  for (const id of paletteWingmen(world)) {
    const u = world.wingmen.find((w) => w.id === id)!;
    const d = dist(u.pos, pt);
    if (d <= bd) { bd = d; best = id; }
  }
  return best;
}

/**
 * P1: one map tap. An armed pick (designated action or 「地点選択」) takes it
 * first (existing rule: the next tap is consumed). Else a tap near a
 * selectable wingman opens its palette; any other tap closes the palette and
 * moves the captain as before ("move").
 */
export function handleMapTap(world: World, pt: Vec2, wingPickRadius: number): "consumed" | "selected" | "move" {
  if (consumeCircuitClick(world, pt)) return "consumed";
  const id = paletteWingmanAt(world, pt, wingPickRadius);
  if (id && openWingPalette(world, [id])) return "selected";
  const p = playOf(world);
  if (p) p.wingSelect = null;
  // 項目4-2 N2: carrying the captain's wreck, the wingman is the one a map tap moves.
  const rescuer = captainRescuer(world);
  if (p && rescuer) {
    p.wingMove[rescuer.id] = { x: pt.x, y: pt.y };
    p.wingHold ??= {};
    p.wingHold[rescuer.id] = { x: pt.x, y: pt.y, manual: true };
    return "consumed";
  }
  return "move";
}

/**
 * N1: send non-autonomous wingmen to `pt`; each stops there and returns fire
 * (it also returns fire on the way). No escort / patrol for them.
 */
export function issueWingmanMove(world: World, unitIds: string[], pt: Vec2): string[] {
  const p = playOf(world);
  if (!p || wingmanPaletteActions(world, unitIds).length === 0) return [];
  const moved: string[] = [];
  for (const id of unitIds) {
    const u = world.wingmen.find((w) => w.id === id);
    if (!u || !u.alive || p.wingTrueOne[id]) continue;
    p.wingMove[id] = { x: pt.x, y: pt.y };
    delete p.wingRecover?.[id];
    delete p.wingHold?.[id];
    moved.push(id);
  }
  return moved;
}

/** N1: drop reached / dead wingman move targets (they then hold and return fire). */
function tickWingmanMoves(world: World): void {
  const p = playOf(world);
  if (!p) return;
  if (p.wingSelect) {
    const ok = paletteWingmen(world);
    const ids = p.wingSelect.ids.filter((id) => ok.includes(id));
    if (ids.length === 0) closeWingPalette(world);
    else if (ids.length !== p.wingSelect.ids.length) p.wingSelect = { ...p.wingSelect, ids };
  }
  for (const [id, pt] of Object.entries(p.wingMove)) {
    const u = world.wingmen.find((w) => w.id === id);
    if (!u || !u.alive || p.wingTrueOne[id] || dist(u.pos, pt) < 6) delete p.wingMove[id];
  }
}

export { effectRate };
