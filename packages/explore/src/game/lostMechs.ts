/**
 * Left-behind mechs and the front (CIRCUIT_DATA_MODEL_V0 §5.6, decided
 * 2026-10-03; recovery PR 2 — Explore).
 *
 * - Sortie via Invade (sector cell + HubSave `frontProgress.seed`): a wingman
 *   left outside the boarding circle is recorded in `HubSave.lostMechs` with
 *   its place (`frontSeed` + `cell`). On a later sortie to the same front cell
 *   it reappears near the drop zone (`strandedMechs`); if it is inside the
 *   boarding circle when the ship lifts off (captain aboard) it is recovered
 *   (`recoveredLostMechInstanceIds` → back to the fleet with its circuits /
 *   ammo / battery). Reappeared but not recovered → the same lostMechs entry
 *   is updated (latest place / time / sortie id), never duplicated.
 * - Sortie not via Invade (direct deploy from the hangar): a left-behind
 *   wingman is lost outright with its circuits (`abandonedMechInstanceIds`;
 *   not kept in lostMechs).
 * - 項目5-1b: a `kind: "wreck"` row (shot down, circuits inside) reappears at
 *   its saved position in Explore (`pos`), not on the drop-zone ring, and is
 *   recovered the same way (it comes back destroyed, W7 A). See wrecks.ts.
 */
import {
  type HubSnapshot,
  type LostMechReturnState,
} from "@estg/shared";
import { dist, type Vec2 } from "./math";
import type { BoardingState, InvadeSectorContext, World } from "./types";
import { strandedDropsFor } from "./circuitDrops";
import { placeWreckInWorld, wreckLabel } from "./wrecks";

/** FrontCellCoord bound (shared `normalizeFrontCoord`). */
const FRONT_COORD_MAX = 32;

export type SortieLocation = { frontSeed: number; cell: { sx: number; sy: number } };

export type StrandedMech = {
  instanceId: string;
  name: string;
  pos: Vec2;
  /** The HubSave lostMechs row it came from (ammo / battery / circuits / copy). */
  row: LostMechReturnState;
  /** 項目5-1b: a wreck (shot down, circuits inside) rather than a left-behind mech. */
  wreck?: boolean;
};

/** Place of this sortie on the Invade front; null when not via Invade (or no saved front seed). */
export function sortieLocationFor(
  invadeSector: Pick<InvadeSectorContext, "sectorX" | "sectorY"> | null,
  hub: Pick<HubSnapshot, "frontProgress"> | null,
): SortieLocation | null {
  if (!invadeSector) return null;
  const seed = hub?.frontProgress?.seed;
  if (seed == null || !Number.isFinite(seed)) return null;
  const sx = Math.trunc(invadeSector.sectorX);
  const sy = Math.trunc(invadeSector.sectorY);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  if (Math.abs(sx) > FRONT_COORD_MAX || Math.abs(sy) > FRONT_COORD_MAX) return null;
  return { frontSeed: seed >>> 0, cell: { sx, sy } };
}

/** Distance from the drop zone at which reappeared mechs wait (inside a circle called at the drop zone). */
export const STRANDED_RING_RADIUS = 70;

/**
 * lostMechs rows left on this front cell (same `frontSeed` and `cell`),
 * excluding mechs that are deployed. They wait around the drop zone `spawn`.
 */
export function strandedMechsFor(
  hub: Pick<HubSnapshot, "lostMechs"> | null,
  location: SortieLocation | null,
  deployedInstanceIds: readonly string[],
  spawn: Vec2,
): StrandedMech[] {
  if (!hub || !location) return [];
  const deployed = new Set(deployedInstanceIds);
  const rows = (hub.lostMechs ?? []).filter(
    (m) =>
      !deployed.has(m.instanceId) &&
      m.frontSeed === location.frontSeed &&
      m.cell != null &&
      m.cell.sx === location.cell.sx &&
      m.cell.sy === location.cell.sy,
  );
  // Left-behind mechs wait on the ring around the drop zone; a wreck with a
  // saved position stays where it was destroyed (項目5-1b W3 C).
  let ringIndex = 0;
  return rows.map((row) => {
    const copy: LostMechReturnState = {
      ...row,
      battery: { ...row.battery },
      circuitIds: [...row.circuitIds],
      ...(row.pos ? { pos: { ...row.pos } } : {}),
      ...(row.cell ? { cell: { ...row.cell } } : {}),
    };
    if (row.kind === "wreck" && row.pos) {
      return {
        instanceId: row.instanceId,
        name: wreckLabel(row.instanceId),
        pos: { x: row.pos.x, y: row.pos.y },
        row: copy,
        wreck: true,
      };
    }
    const i = ringIndex++;
    const angle = Math.PI * 0.75 + i * 0.55;
    const r = STRANDED_RING_RADIUS + 18 * Math.floor(i / 6);
    return {
      instanceId: row.instanceId,
      name: row.kind === "wreck" ? wreckLabel(row.instanceId) : `置き去り機 ${row.instanceId}`,
      pos: { x: spawn.x + Math.cos(angle) * r, y: spawn.y - Math.sin(angle) * r },
      row: copy,
      ...(row.kind === "wreck" ? { wreck: true } : {}),
    };
  });
}

/** Attach the front place, reappeared mechs, and circuit drops to a freshly created world. */
export function attachLostMechContext(world: World, hub: HubSnapshot | null): World {
  const location = sortieLocationFor(world.invadeSector, hub);
  world.sortieLocation = location;
  world.strandedMechs = strandedMechsFor(hub, location, world.deployedInstanceIds, world.leader.pos).map((m) =>
    m.wreck && m.row.pos ? { ...m, pos: placeWreckInWorld(world, m.pos) } : m,
  );
  world.recoveredLostMechIds = [];
  world.recoveredWreckUnitIds = [];
  world.strandedDrops = strandedDropsFor(hub, location, world.leader.pos);
  world.recoveredDropIds = [];
  world.initialOwnedCircuitIds = hub ? hub.circuits.map((c) => c.circuitId) : [];
  return world;
}

/** Lift-off: reappeared mechs inside the boarding circle are recovered (only when the ship lifts off). */
export function recoverStrandedAtLiftOff(world: World, boarding: BoardingState, captainIn: boolean): string[] {
  if (!captainIn) return [];
  const ids = (world.strandedMechs ?? [])
    .filter((m) => dist(m.pos, boarding.center) <= boarding.radius)
    .map((m) => m.instanceId);
  world.recoveredLostMechIds = [...new Set([...(world.recoveredLostMechIds ?? []), ...ids])];
  return ids;
}

/** Reappeared mechs not recovered this sortie (their lostMechs entries get updated). */
export function strandedNotRecovered(world: World): StrandedMech[] {
  const recovered = new Set(world.recoveredLostMechIds ?? []);
  return (world.strandedMechs ?? []).filter((m) => !recovered.has(m.instanceId));
}
