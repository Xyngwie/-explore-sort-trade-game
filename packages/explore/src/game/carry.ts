/**
 * 項目4-1 積載と速度（2026-10-12 神宮・参謀の仕様）.
 *
 * - Load: a container counts 1, a wreck 2 (C3: a wreck's circuits do not add load).
 * - Cap (C4): 2 for everything (containers too); one wreck fills it. `cargo_slots`
 *   circuits add their existing bonus (`modsFor().cargo`).
 * - Speed by load 0..6: 120 / 75 / 60 / 45 / 30 / 15 / 0, for the captain and
 *   wingmen alike (load 0 = 120 for wingmen too: 2026-10-07 7:36 神宮; the base
 *   `moveSpeed` is 120, so the ratio × base is the table itself). C5: the release
 *   ability multiplier is applied on top by the caller (`abilityOf().moveSpeed`).
 * - C6: a carrier that is destroyed drops its containers and wrecks on the spot.
 *
 * Wrecks being carried live in `circuitPlay.carry[unitId]` (wreck spot ids).
 */
import { abilityOf, modsFor, playOf } from "./circuitPlay";
import type { Unit, World } from "./types";

export const LOAD_PER_CONTAINER = 1;
export const LOAD_PER_WRECK = 2;
export const BASE_LOAD_CAP = 2;
export const LOAD_SPEED_TABLE = [120, 75, 60, 45, 30, 15, 0] as const;

export function carriedWreckIds(world: World, unitId: string): string[] {
  return playOf(world)?.carry?.[unitId] ?? [];
}

export function unitLoad(world: World, unit: Unit): number {
  return Math.max(0, unit.salvagedCount) * LOAD_PER_CONTAINER + carriedWreckIds(world, unit.id).length * LOAD_PER_WRECK;
}

export function unitLoadCap(world: World, unit: Unit): number {
  return BASE_LOAD_CAP + Math.max(0, modsFor(world, unit.id).cargo);
}

/** Speed table value for a load (load ≥ 6 → 0). */
export function loadSpeedValue(load: number): number {
  const i = Math.max(0, Math.min(LOAD_SPEED_TABLE.length - 1, Math.floor(load)));
  return LOAD_SPEED_TABLE[i]!;
}

/** Multiplier on the unit's load-0 move speed. */
export function loadSpeedRatio(load: number): number {
  return loadSpeedValue(load) / LOAD_SPEED_TABLE[0];
}

/** Shown speed: the table value × the release ability multiplier (C5). */
export function shownSpeed(world: World, unit: Unit): number {
  return Math.round(loadSpeedValue(unitLoad(world, unit)) * abilityOf(world, unit.id).moveSpeed);
}

/** 「積載 2/2・速度 60」 (C8). */
export function loadLineJa(world: World, unit: Unit): string {
  return `積載 ${unitLoad(world, unit)}/${unitLoadCap(world, unit)}・速度 ${shownSpeed(world, unit)}`;
}

export function roomFor(world: World, unit: Unit): number {
  return Math.max(0, unitLoadCap(world, unit) - unitLoad(world, unit));
}

export function canTakeContainer(world: World, unit: Unit): boolean {
  return roomFor(world, unit) >= LOAD_PER_CONTAINER;
}

/** Who carries this wreck spot id (null when nobody). */
export function wreckCarrierId(world: World, wreckId: string): string | null {
  const carry = playOf(world)?.carry ?? {};
  for (const [unitId, ids] of Object.entries(carry)) if (ids.includes(wreckId)) return unitId;
  return null;
}
