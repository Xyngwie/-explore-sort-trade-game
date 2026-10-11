/**
 * Circuit effect actions (Issue #269).
 * Effect value stays computed from the board. effectKey is chosen once.
 * 1×1 and 20×20 are fixed. 2×2..19×19 pick one saved action.
 */
import {
  boardHasClosedLoop,
  type CircuitClueGrid,
} from "./circuit-effect";
import {
  decodeEdgeState,
  edgeCount,
  encodeEdgeState,
  createEmptyCircuitBoard,
  type CircuitBoardState,
  type EdgeMark,
} from "./circuit-board";
import { isCircuitRestoreStateActive } from "./circuit-board";
import {
  computeCircuitEffectForBoard,
  resolveCluesForCircuitBoard,
} from "./circuit-clues";
import { loadHubSaveFromLocalStorage, type HubCircuitRecord, type HubSnapshot } from "./hub-save";
import { createOwnedMech, syncMechStatus } from "./mech-fleet";
import { scaleYieldBag, type YieldBag } from "./sort-yield";

export const FALSE_BOARD_EFFECT_KEYS = [
  "escort_range",
  "raid_attack",
  "scout_activity",
  "point_defense_armor",
  "orbit_speed",
  "cover_fight",
  "dodge",
  "melee",
  "smg",
  "shotgun",
  "mmr",
  "lmg",
  "fast_round",
  "homing_round",
  "emp_round",
  "haul_speed",
  "cargo_slots",
  "cover_move",
] as const;

export const TRUE_BOARD_EFFECT_KEYS = [
  "march",
  "protect",
  "scatter",
  "focus",
  "pincer",
  "entrench_hold",
  "forced_march",
  "read_ahead",
  "squad_haul",
  "trench",
  "distribute",
  "lure",
  "suppress",
  "sort_yield",
  "perfect_rate",
  "gun_tune",
  "armor_tune",
  "power_tune",
] as const;

export const CIRCUIT_EFFECT_KEYS = [
  ...FALSE_BOARD_EFFECT_KEYS,
  ...TRUE_BOARD_EFFECT_KEYS,
] as const;

export type FalseBoardEffectKey = (typeof FALSE_BOARD_EFFECT_KEYS)[number];
export type TrueBoardEffectKey = (typeof TRUE_BOARD_EFFECT_KEYS)[number];
export type CircuitEffectKey = (typeof CIRCUIT_EFFECT_KEYS)[number];

const FALSE_SET = new Set<string>(FALSE_BOARD_EFFECT_KEYS);
const TRUE_SET = new Set<string>(TRUE_BOARD_EFFECT_KEYS);
const ALL_KEYS = new Set<string>(CIRCUIT_EFFECT_KEYS);

export const GUN_EFFECT_ORDER = [
  "smg",
  "shotgun",
  "mmr",
  "lmg",
  "fast_round",
  "homing_round",
  "emp_round",
] as const;

export type GunEffectKey = (typeof GUN_EFFECT_ORDER)[number];

export const AIR_SUPPORT_COST = 600;
export const AIR_SUPPORT_COOLDOWN_SEC = 200;
export const PERFECT_RATE_CAP_PT = 30;
export const FALSE_20_PERFECT_PT = 10;
export const CLEARED_TRUE_BOARD_RATE = 0.01;
export const TRUE_BOARD_RATE_CAP = 0.31;
export const ACTIVITY_CAP_INITIAL = 300;
export const ORDER_MOVE_SPEED = 120;
export const COLLECT_SECONDS = 8;
export const TRENCH_SETUP_SEC = 15;
export const TRENCH_SETUP_MIN_SEC = 5;
export const DODGE_COOLDOWN_SEC = 5;
export const DODGE_COOLDOWN_MIN_SEC = 2;
export const EMP_SLOW_BASE = 0.3;
export const EMP_SLOW_CAP = 0.6;
export const EMP_DURATION_SEC = 3;
export const COVER_DR_BASE = 0.3;
export const COVER_DR_CAP = 0.6;
export const SUPPRESS_SEC = 8;
export const DISTRIBUTE_SEC = 20;
export const SMG_INTERVAL_SEC = 0.2;
export const SMG_CYCLE = 5;
export const SMG_TAIL_SEC = 1;

export function isCircuitEffectKey(value: string | null | undefined): value is CircuitEffectKey {
  return typeof value === "string" && ALL_KEYS.has(value);
}

/** r = round(√効果値 × 2%) to the nearest 1%. 8→6%, 49→14%, 100→20%, 225→30%. */
export function effectRate(effectValue: number): number {
  if (!Number.isFinite(effectValue) || effectValue <= 0) return 0;
  const pct = Math.sqrt(effectValue) * 2;
  return Math.round(pct) / 100;
}

export function cargoSlotBonus(effectValue: number): number {
  if (!Number.isFinite(effectValue) || effectValue <= 0) return 0;
  const n = Math.round(Math.sqrt(effectValue) / 4);
  return Math.min(4, Math.max(1, n));
}

/** +round(√効果値 / 2) pt. 8→1, 49→4, 225→8. */
export function perfectRatePoints(effectValue: number): number {
  if (!Number.isFinite(effectValue) || effectValue <= 0) return 0;
  return Math.round(Math.sqrt(effectValue) / 2);
}

export function readAirSupportCooldownSec(hub: { airSupportCooldownSec?: number } | null | undefined): number {
  const n = hub?.airSupportCooldownSec;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return 0;
  return n;
}

export function readBulletinUnlocked(hub: { bulletinUnlocked?: boolean } | null | undefined): boolean {
  return hub?.bulletinUnlocked === true;
}

function squareSide(board: Pick<CircuitBoardState, "cols" | "rows">): number | null {
  if (board.cols !== board.rows) return null;
  if (!Number.isInteger(board.cols) || board.cols < 1) return null;
  return board.cols;
}

function loopOn(board: CircuitBoardState): boolean {
  try {
    const marks = decodeEdgeState(board.edgeState, edgeCount(board.cols, board.rows));
    return boardHasClosedLoop(marks, board.cols, board.rows);
  } catch {
    return false;
  }
}

function activeEffect(rec: Pick<HubCircuitRecord, "circuitBoard" | "locked" | "restoreState">): number {
  if (!isCircuitRestoreStateActive(rec.restoreState)) return 0;
  try {
    return computeCircuitEffectForBoard(rec.circuitBoard, {
      perfect: rec.circuitBoard.perfect ?? rec.locked,
    }).effect;
  } catch {
    return 0;
  }
}

function clueGrid(board: CircuitBoardState): CircuitClueGrid {
  try {
    return resolveCluesForCircuitBoard(board);
  } catch {
    return [];
  }
}

export type ClassifiedCircuit = {
  circuitId: string;
  effect: number;
  r: number;
  effectKey: CircuitEffectKey | null;
  trueBoard: boolean;
  oneByOne: "true" | "false" | null;
  side: number;
  conductive: boolean;
  cargoSlots: number;
  perfectPt: number;
  false20: boolean;
  true20: boolean;
};

export function classifyCircuit(rec: HubCircuitRecord): ClassifiedCircuit {
  const side = squareSide(rec.circuitBoard) ?? 0;
  const conductive = loopOn(rec.circuitBoard);
  const effect = activeEffect(rec);
  const trueBoard = rec.restoreState === "fully_awakened";
  const clues = side === 1 ? clueGrid(rec.circuitBoard) : null;
  const digit = clues?.[0]?.[0] ?? null;
  let oneByOne: "true" | "false" | null = null;
  if (side === 1 && conductive && digit === 4) oneByOne = "true";
  else if (side === 1 && conductive && digit === 0 && !trueBoard) oneByOne = "false";
  const true20 = side === 20 && trueBoard;
  const false20 = side === 20 && conductive && !trueBoard;
  const keyOk = keyMatchesBoard(rec) ? (rec.effectKey as CircuitEffectKey) : null;
  const inRange = side >= 2 && side <= 19;
  const effectKey = inRange && effect > 0 ? keyOk : null;
  const r = effect > 0 ? effectRate(effect) : 0;
  return {
    circuitId: rec.circuitId,
    effect,
    r,
    effectKey,
    trueBoard,
    oneByOne,
    side,
    conductive,
    cargoSlots: effectKey === "cargo_slots" ? cargoSlotBonus(effect) : 0,
    perfectPt: effectKey === "perfect_rate" && effect > 0 ? perfectRatePoints(effect) : 0,
    false20,
    true20,
  };
}

function hashIndex(circuitId: string, n: number): number {
  let h = 2166136261;
  const s = `${circuitId}\0effectKey`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % n;
}

/**
 * A saved key belongs to the board's kind: false board → normal action,
 * true board (fully_awakened) → squad action. A Restore that turns a false
 * board into a true board leaves a normal-action key behind; that key no
 * longer fits and is replaced once (#270 technical check, 10/12).
 */
export function keyMatchesBoard(rec: Pick<HubCircuitRecord, "effectKey" | "restoreState">): boolean {
  if (!isCircuitEffectKey(rec.effectKey)) return false;
  return rec.restoreState === "fully_awakened" ? TRUE_SET.has(rec.effectKey) : FALSE_SET.has(rec.effectKey);
}

/** Stable equal-weight pick. Saved keys that fit the board are not redrawn. Effect 0 gets no key. */
export function effectKeyForCircuit(rec: HubCircuitRecord): CircuitEffectKey | undefined {
  if (keyMatchesBoard(rec)) return rec.effectKey as CircuitEffectKey;
  const side = squareSide(rec.circuitBoard);
  if (side == null || side < 2 || side > 19) return undefined;
  const effect = activeEffect(rec);
  if (!(effect > 0)) return undefined;
  const list = rec.restoreState === "fully_awakened" ? TRUE_BOARD_EFFECT_KEYS : FALSE_BOARD_EFFECT_KEYS;
  return list[hashIndex(rec.circuitId, list.length)];
}

export function assignMissingEffectKeys(circuits: readonly HubCircuitRecord[]): HubCircuitRecord[] {
  return circuits.map((rec) => {
    if (keyMatchesBoard(rec)) return rec;
    const key = effectKeyForCircuit(rec);
    if (!key) return rec;
    return { ...rec, effectKey: key };
  });
}

export function isTrueOneByOne(rec: HubCircuitRecord): boolean {
  return classifyCircuit(rec).oneByOne === "true";
}

/** Base slot 1. A true 1×1 adds one slot and itself occupies one. False 1×1 does not. */
export function slotCapacity(
  equipped: readonly HubCircuitRecord[],
  incoming?: HubCircuitRecord | null,
): number {
  const grant = equipped.some(isTrueOneByOne) || (incoming != null && isTrueOneByOne(incoming));
  return 1 + (grant ? 1 : 0);
}

function oneByOneEdges(): string {
  const n = edgeCount(1, 1);
  const marks = Array.from({ length: n }, () => 1 as EdgeMark);
  return encodeEdgeState(marks);
}

function puzzleIdWithDigit0(): string {
  for (let i = 0; i < 4000; i++) {
    const id = `k${i.toString(36)}`;
    const clues = resolveCluesForCircuitBoard({ cols: 1, rows: 1, puzzleId: id });
    if (clues[0]?.[0] === 0) return id;
  }
  return "k9";
}

export function makeFalseOneByOne(circuitId: string): HubCircuitRecord {
  const puzzleId = puzzleIdWithDigit0();
  const board = {
    ...createEmptyCircuitBoard(1, 1, puzzleId),
    edgeState: oneByOneEdges(),
    outcome: "bypass" as const,
  };
  return {
    circuitId,
    circuitBoard: board,
    restoreState: "bypass",
    origin: "crafted",
    equippedTo: null,
    outcome: "bypass",
  };
}

export function makeTrueOneByOne(circuitId: string): HubCircuitRecord {
  const board = {
    ...createEmptyCircuitBoard(1, 1, circuitId),
    edgeState: oneByOneEdges(),
    outcome: "fully_awakened" as const,
    perfect: true,
    locked: true,
  };
  return {
    circuitId,
    circuitBoard: board,
    restoreState: "fully_awakened",
    origin: "picked_up",
    equippedTo: null,
    outcome: "fully_awakened",
    locked: true,
  };
}

function lostIds(hub: HubSnapshot): Set<string> {
  return new Set((hub.lostMechs ?? []).map((m) => m.instanceId));
}

/**
 * Equipped on hangar mechs, including those not sortieing (Q5, 神宮 10/12:
 * equipped circuits only). Stash, enemies, wrecks, left-behind excluded.
 * Q4 (神宮 10/12): circuits on a `destroyed` hangar mech do not count until repaired.
 */
export function hangarEquippedCircuits(hub: HubSnapshot): HubCircuitRecord[] {
  const fleet = new Set(hub.fleet.filter((m) => m.status !== "destroyed").map((m) => m.instanceId));
  const lost = lostIds(hub);
  return hub.circuits.filter((c) => c.equippedTo != null && fleet.has(c.equippedTo) && !lost.has(c.equippedTo));
}

export function hasTrueOneByOne(hub: HubSnapshot): boolean {
  return hub.circuits.some(isTrueOneByOne);
}

export function hasTrueTwenty(hub: HubSnapshot): boolean {
  return hub.circuits.some((c) => {
    const side = squareSide(c.circuitBoard);
    return side === 20 && c.restoreState === "fully_awakened";
  });
}

/**
 * New captain starts with one false 1×1 in the only slot.
 * No-op when the first mech already has a circuit, or the fleet is empty.
 */
export function ensureCaptainFalseOneByOne(hub: HubSnapshot): HubSnapshot {
  const captain = hub.fleet[0];
  if (!captain) return hub;
  const mine = hub.circuits.filter((c) => c.equippedTo === captain.instanceId);
  if (mine.length > 0) return hub;
  const rawId = `false-1x1-${captain.instanceId}`;
  const rec = { ...makeFalseOneByOne(rawId.length <= 64 ? rawId : rawId.slice(0, 64)), equippedTo: captain.instanceId };
  return { ...hub, circuits: [rec, ...hub.circuits] };
}

/**
 * First discovery of one true 1×1. Does not attach it to lost mechs or wrecks.
 * No-op when one is already owned.
 */
export function discoverTrueOneByOne(hub: HubSnapshot, circuitId = "true-1x1"): HubSnapshot {
  if (hasTrueOneByOne(hub)) return hub;
  if (hub.circuits.some((c) => c.circuitId === circuitId)) return hub;
  const rec = makeTrueOneByOne(circuitId);
  return { ...hub, circuits: [rec, ...hub.circuits] };
}

export function addDestroyedGen1(hub: HubSnapshot): HubSnapshot {
  const mech = syncMechStatus({
    ...createOwnedMech("mech_gen1", { durability: 0 }),
    durability: 0,
    status: "destroyed",
  });
  return { ...hub, fleet: [...hub.fleet, mech] };
}

export function qualityBonusPt(hub: HubSnapshot): number {
  let pt = 0;
  for (const rec of hangarEquippedCircuits(hub)) {
    const c = classifyCircuit(rec);
    if (c.false20 && c.effect > 0) pt += FALSE_20_PERFECT_PT;
    pt += c.perfectPt;
  }
  return Math.min(PERFECT_RATE_CAP_PT, Math.max(0, pt));
}

/**
 * Add hangar perfect-rate points on top of an existing inject rate.
 * No hub, a failed read, or a zero bonus leaves `baseRate` unchanged.
 * A missing `bulletinUnlocked` does not zero the rate.
 * Cap the sum at 31% only when the base itself is at or below 31%.
 */
export function circuitTrueBoardRate(hub: HubSnapshot | null | undefined, baseRate: number): number {
  const base = Number.isFinite(baseRate) ? baseRate : CLEARED_TRUE_BOARD_RATE;
  if (!hub) return base;
  let pt = 0;
  try {
    pt = qualityBonusPt(hub);
  } catch {
    return base;
  }
  if (!(pt > 0)) return base;
  const sum = base + pt / 100;
  if (base <= TRUE_BOARD_RATE_CAP) return Math.min(TRUE_BOARD_RATE_CAP, sum);
  return sum;
}

/** Load the hangar and add its bonus. Missing hub, failed load, or +0 keeps `base`. */
export function applyStoredHubPerfectBonus(base: number): number {
  if (!Number.isFinite(base)) return base;
  try {
    const save = loadHubSaveFromLocalStorage();
    if (!save?.hub) return base;
    return circuitTrueBoardRate(save.hub, base);
  } catch {
    return base;
  }
}

export function sortYieldRate(hub: HubSnapshot): number {
  let r = 0;
  for (const rec of hangarEquippedCircuits(hub)) {
    const c = classifyCircuit(rec);
    if (c.effectKey === "sort_yield" && c.effect > 0) r += c.r;
  }
  return r;
}

export function applySortYieldBonus(bag: YieldBag, rate: number): YieldBag {
  if (!Number.isFinite(rate) || rate <= 0) return bag;
  return scaleYieldBag(bag, 1 + rate);
}

export function boardGivesBulletin(rec: HubCircuitRecord): boolean {
  const side = squareSide(rec.circuitBoard);
  return side === 20 && rec.restoreState === "fully_awakened";
}

export function keyIsFalse(key: string | null | undefined): key is FalseBoardEffectKey {
  return typeof key === "string" && FALSE_SET.has(key);
}

export function keyIsTrue(key: string | null | undefined): key is TrueBoardEffectKey {
  return typeof key === "string" && TRUE_SET.has(key);
}
