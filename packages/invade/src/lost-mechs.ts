/**
 * Left-behind mechs (HubSave.lostMechs) on the Invade front — lostMechs
 * recovery PR 3 (2026-10-03 神宮の決定).
 *
 * - The board marks the cells where left-behind mechs wait (rows whose
 *   `frontSeed` is this board's seed); the mark is display only and never
 *   touches mines / opening.
 * - Board regenerated (new seed): every placed row moves to the same
 *   coordinates on the new board (`frontSeed` rewritten), clamped into the
 *   playable range. Circuit field drops (`fieldDrops`) and general inventory
 *   field drops (`inventoryFieldDrops`) follow the same rule.
 * - Rows without a place (left behind before Explore recorded places) are put
 *   on the current board's start cell (HQ 0,0) when Invade opens; from then on
 *   they reappear / are recovered like any other row (Explore).
 */
import {
  SECTOR_WALL_DISTANCE,
  normalizeHubSnapshot,
  type FrontCellCoord,
  type HubSnapshot,
} from "@estg/shared";

/** The board's start cell (HQ). */
export const FRONT_START_CELL: FrontCellCoord = { sx: 0, sy: 0 };

/** Largest playable |coord| on a board of `aoiHalf` (inside the wall ring, Chebyshev d < wall). */
export function playableHalf(aoiHalf: number): number {
  return Math.max(0, Math.min(Math.trunc(aoiHalf), SECTOR_WALL_DISTANCE - 1));
}

/** Clamp a cell into the playable range of a board of `aoiHalf`. */
export function clampToFront(cell: FrontCellCoord, aoiHalf: number): FrontCellCoord {
  const h = playableHalf(aoiHalf);
  const c = (v: number) => Math.max(-h, Math.min(h, Math.trunc(v)));
  return { sx: c(cell.sx), sy: c(cell.sy) };
}

function sameCell(a: FrontCellCoord, b: FrontCellCoord): boolean {
  return a.sx === b.sx && a.sy === b.sy;
}

export type FrontPlacementResult = {
  hub: HubSnapshot;
  changed: boolean;
  /** lostMechs rows moved from another board (same coordinates, clamped). */
  moved: string[];
  /** lostMechs rows without a place, put on the start cell. */
  placed: string[];
  /** fieldDrops moved from another board. */
  movedDrops: string[];
  /** inventoryFieldDrops moved from another board. */
  movedInventoryDrops: string[];
};

/**
 * Put every left-behind mech (and circuit / inventory field drop) on the board with
 * `seed`: rows of another board keep their coordinates (clamped), rows without
 * a place go to the start cell. Rows already on this board are kept as they are
 * (only clamped if out of range).
 */
export function placeLostOnFront(hub: HubSnapshot, seed: number, aoiHalf: number): FrontPlacementResult {
  const s = seed >>> 0;
  const moved: string[] = [];
  const placed: string[] = [];
  const movedDrops: string[] = [];
  const movedInventoryDrops: string[] = [];
  const lostMechs = (hub.lostMechs ?? []).map((row) => {
    if (row.frontSeed == null || row.cell == null) {
      placed.push(row.instanceId);
      return { ...row, frontSeed: s, cell: { ...FRONT_START_CELL } };
    }
    const cell = clampToFront(row.cell, aoiHalf);
    if (row.frontSeed === s && sameCell(cell, row.cell)) return row;
    moved.push(row.instanceId);
    return { ...row, frontSeed: s, cell };
  });
  const fieldDrops = (hub.fieldDrops ?? []).map((d) => {
    const cell = clampToFront(d.cell, aoiHalf);
    if (d.frontSeed === s && sameCell(cell, d.cell)) return d;
    movedDrops.push(d.dropId);
    return { ...d, frontSeed: s, cell };
  });
  const inventoryFieldDrops = (hub.inventoryFieldDrops ?? []).map((d) => {
    const cell = clampToFront(d.cell, aoiHalf);
    if (d.frontSeed === s && sameCell(cell, d.cell)) return d;
    movedInventoryDrops.push(d.dropId);
    return { ...d, frontSeed: s, cell };
  });
  const changed = moved.length + placed.length + movedDrops.length + movedInventoryDrops.length > 0;
  return {
    hub: changed ? normalizeHubSnapshot({ ...hub, lostMechs, fieldDrops, inventoryFieldDrops }) : hub,
    changed,
    moved,
    placed,
    movedDrops,
    movedInventoryDrops,
  };
}

/** instanceIds of left-behind mechs per cell ("sx,sy") on the board with `seed`. */
export function lostMechsByCell(
  hub: Pick<HubSnapshot, "lostMechs"> | null,
  seed: number | null | undefined,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!hub || seed == null || !Number.isFinite(seed)) return out;
  const s = seed >>> 0;
  for (const row of hub.lostMechs ?? []) {
    if (row.frontSeed !== s || row.cell == null) continue;
    const key = cellKey(row.cell.sx, row.cell.sy);
    const list = out.get(key) ?? [];
    list.push(row.instanceId);
    out.set(key, list);
  }
  return out;
}

export function cellKey(sx: number, sy: number): string {
  return `${sx},${sy}`;
}

/** Tooltip addition: the mech IDs (and the count when more than one). */
export function lostMechTitleJa(ids: readonly string[]): string {
  if (ids.length === 0) return "";
  return ids.length === 1
    ? `置き去り機 ${ids[0]}`
    : `置き去り機 ${ids.length} 機: ${ids.join(", ")}`;
}

/** Sortie-bar line for a selected cell with left-behind mechs (神宮の決定の文言). */
export function lostMechSortieLineJa(count: number): string {
  return `置き去り機 ${count} 機：出撃して離陸すれば回収`;
}
