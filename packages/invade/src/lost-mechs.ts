/**
 * Left-behind mechs (HubSave.lostMechs) on the Invade front — lostMechs
 * recovery PR 3 (2026-10-03 神宮の決定).
 *
 * - The board marks the cells where left-behind mechs wait (rows whose
 *   `frontSeed` is this board's seed); the mark is display only and never
 *   touches mines / opening.
 * - 項目5-1b W3 C (2026-10-07 神宮): wreck rows (`kind: "wreck"`) do NOT
 *   move. A wreck of another board (or without a place) vanishes with the
 *   circuits inside it (`removeWreckRows`).
 * - Board regenerated (new seed): every placed left-behind row moves to the same
 *   coordinates on the new board (`frontSeed` rewritten), clamped into the
 *   playable range. Circuit field drops (`fieldDrops`) and general inventory
 *   field drops (`inventoryFieldDrops`) follow the same rule.
 * - Rows without a place (left behind before Explore recorded places) are put
 *   on the current board's start cell (HQ 0,0) when Invade opens; from then on
 *   they reappear / are recovered like any other row (Explore).
 */
import {
  SECTOR_WALL_DISTANCE,
  isWreckRow,
  normalizeHubSnapshot,
  removeWreckRows,
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
  /** 項目5-1b W3 C: wrecks of another board removed with their circuits. */
  removedWrecks?: string[];
};

/**
 * Put every left-behind mech (and circuit / inventory field drop) on the board with
 * `seed`: rows of another board keep their coordinates (clamped), rows without
 * a place go to the start cell. Rows already on this board are kept as they are
 * (only clamped if out of range).
 */
export function placeLostOnFront(hub: HubSnapshot, seed: number, aoiHalf: number): FrontPlacementResult {
  const s = seed >>> 0;
  // W3 C: wrecks stay only on their own board; on any other board they vanish (with circuits).
  const wreckSweep = removeWreckRows(
    hub,
    (row) => row.frontSeed == null || row.cell == null || row.frontSeed >>> 0 !== s,
  );
  hub = wreckSweep.hub;
  const removedWrecks = wreckSweep.removed;
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
  const moves = moved.length + placed.length + movedDrops.length + movedInventoryDrops.length > 0;
  const changed = moves || removedWrecks.length > 0;
  return {
    hub: moves ? normalizeHubSnapshot({ ...hub, lostMechs, fieldDrops, inventoryFieldDrops }) : hub,
    changed,
    moved,
    placed,
    movedDrops,
    movedInventoryDrops,
    ...(removedWrecks.length > 0 ? { removedWrecks } : {}),
  };
}

/**
 * instanceIds of left-behind mechs per cell ("sx,sy") on the board with `seed`.
 * 項目5-1b③: wreck rows (`kind: "wreck"`) are not left-behind mechs; they
 * have their own mark (`wrecksByCell`).
 */
export function lostMechsByCell(
  hub: Pick<HubSnapshot, "lostMechs"> | null,
  seed: number | null | undefined,
): Map<string, string[]> {
  return lostRowsByCell(hub, seed, false);
}

/** 項目5-1b③ (W6): instanceIds of wrecks per cell ("sx,sy") on the board with `seed`. */
export function wrecksByCell(
  hub: Pick<HubSnapshot, "lostMechs"> | null,
  seed: number | null | undefined,
): Map<string, string[]> {
  return lostRowsByCell(hub, seed, true);
}

function lostRowsByCell(
  hub: Pick<HubSnapshot, "lostMechs"> | null,
  seed: number | null | undefined,
  wrecks: boolean,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!hub || seed == null || !Number.isFinite(seed)) return out;
  const s = seed >>> 0;
  for (const row of hub.lostMechs ?? []) {
    if (row.frontSeed !== s || row.cell == null) continue;
    if (isWreckRow(row) !== wrecks) continue;
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

/** 項目5-1b③ tooltip addition: the wreck IDs (and the count when more than one). */
export function wreckTitleJa(ids: readonly string[]): string {
  if (ids.length === 0) return "";
  return ids.length === 1
    ? `残骸 ${ids[0]}`
    : `残骸 ${ids.length} 機: ${ids.join(", ")}`;
}

/** 項目5-1b③ sortie-bar line for a selected cell with wrecks (mirrors the left-behind line; W2 B). */
export function wreckSortieLineJa(count: number): string {
  return `残骸 ${count} 機：出撃して離陸すれば回収`;
}

/** Circuit IDs of circuit field drops per cell ("sx,sy") on the board with `seed`. */
export function fieldDropsByCell(
  hub: Pick<HubSnapshot, "fieldDrops"> | null,
  seed: number | null | undefined,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!hub || seed == null || !Number.isFinite(seed)) return out;
  const s = seed >>> 0;
  for (const row of hub.fieldDrops ?? []) {
    if (row.frontSeed !== s || row.cell == null) continue;
    const key = cellKey(row.cell.sx, row.cell.sy);
    const list = out.get(key) ?? [];
    const cid = row.circuit?.circuitId ?? row.dropId;
    list.push(cid);
    out.set(key, list);
  }
  return out;
}

/** Tooltip addition: the circuit IDs of field drops (and the count when more than one). */
export function fieldDropTitleJa(circuitIds: readonly string[]): string {
  if (circuitIds.length === 0) return "";
  return circuitIds.length === 1
    ? `落とし物 ${circuitIds[0]}`
    : `落とし物 ${circuitIds.length}: ${circuitIds.join(", ")}`;
}

/** Sortie-bar line for a selected cell with circuit field drops (隊長指示「落とし物 N：出撃して離陸すれば回収」). */
export function fieldDropSortieLineJa(count: number): string {
  return `落とし物 ${count}：出撃して離陸すれば回収`;
}

