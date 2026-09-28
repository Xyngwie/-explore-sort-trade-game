/**
 * Canonical resource model for the Sort puzzle engine.
 *
 * The engine is being migrated incrementally from the legacy names
 * food/material/energy. Nothing outside this module should need to know the
 * legacy vocabulary once the migration is complete.
 */
import {
  SORT_RESOURCE_IDS,
  SORT_VALID_RESOURCE_IDS,
  type SortResourceId,
  type SortValidResourceId,
} from "@estg/shared";

export type SortPieceKind = SortResourceId;
export type SortValidPieceKind = SortValidResourceId;

export const SORT_PIECE_KINDS = SORT_RESOURCE_IDS;
export const SORT_VALID_PIECE_KINDS = SORT_VALID_RESOURCE_IDS;

export const SORT_PIECE_LABEL_JA = {
  ammo: "弾薬",
  armor: "装甲パーツ",
  power: "電力パーツ",
  junk: "ジャンク",
} as const satisfies Record<SortPieceKind, string>;

export type SortClearedCounts = Record<SortValidPieceKind, number>;

/** Legacy vocabulary retained only at the migration boundary. */
export type LegacySortPieceKind = "food" | "material" | "energy" | "junk";
export type LegacyClearedCounts = {
  food: number;
  material: number;
  energy: number;
};

const LEGACY_TO_SORT: Record<LegacySortPieceKind, SortPieceKind> = {
  food: "ammo",
  material: "armor",
  energy: "power",
  junk: "junk",
};

const SORT_TO_LEGACY: Record<SortPieceKind, LegacySortPieceKind> = {
  ammo: "food",
  armor: "material",
  power: "energy",
  junk: "junk",
};

export function fromLegacyPieceKind(kind: LegacySortPieceKind): SortPieceKind {
  return LEGACY_TO_SORT[kind];
}

export function toLegacyPieceKind(kind: SortPieceKind): LegacySortPieceKind {
  return SORT_TO_LEGACY[kind];
}

export function fromLegacyBoard(board: readonly (LegacySortPieceKind | null)[]):
  (SortPieceKind | null)[] {
  return board.map((kind) => (kind == null ? null : fromLegacyPieceKind(kind)));
}

export function toLegacyBoard(board: readonly (SortPieceKind | null)[]):
  (LegacySortPieceKind | null)[] {
  return board.map((kind) => (kind == null ? null : toLegacyPieceKind(kind)));
}

export function fromLegacyBag(bag: readonly LegacySortPieceKind[]): SortPieceKind[] {
  return bag.map(fromLegacyPieceKind);
}

export function toLegacyBag(bag: readonly SortPieceKind[]): LegacySortPieceKind[] {
  return bag.map(toLegacyPieceKind);
}

export function fromLegacyCleared(cleared: LegacyClearedCounts): SortClearedCounts {
  return {
    ammo: cleared.food,
    armor: cleared.material,
    power: cleared.energy,
  };
}

export function toLegacyCleared(cleared: SortClearedCounts): LegacyClearedCounts {
  return {
    food: cleared.ammo,
    material: cleared.armor,
    energy: cleared.power,
  };
}

export function emptySortCleared(): SortClearedCounts {
  return { ammo: 0, armor: 0, power: 0 };
}

export function addSortCleared(
  a: SortClearedCounts,
  b: SortClearedCounts,
): SortClearedCounts {
  return {
    ammo: a.ammo + b.ammo,
    armor: a.armor + b.armor,
    power: a.power + b.power,
  };
}

export function isSortPieceKind(value: string): value is SortPieceKind {
  return (SORT_PIECE_KINDS as readonly string[]).includes(value);
}

export function isSortValidPieceKind(value: string): value is SortValidPieceKind {
  return (SORT_VALID_PIECE_KINDS as readonly string[]).includes(value);
}
