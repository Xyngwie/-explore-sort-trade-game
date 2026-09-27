/**
 * Canonical resource vocabulary shared by Sort and downstream modules.
 *
 * This is the only resource vocabulary that should cross the Sort boundary.
 * The puzzle engine migration is intentionally split into a later step so
 * this contract can land independently without changing gameplay behavior.
 */
export const SORT_RESOURCE_IDS = ["ammo", "armor", "power", "junk"] as const;

export type SortResourceId = (typeof SORT_RESOURCE_IDS)[number];
export type SortValidResourceId = Exclude<SortResourceId, "junk">;

export const SORT_VALID_RESOURCE_IDS: readonly SortValidResourceId[] = [
  "ammo",
  "armor",
  "power",
];

export const SORT_RESOURCE_LABEL_JA: Record<SortResourceId, string> = {
  ammo: "弾薬",
  armor: "装甲パーツ",
  power: "電力パーツ",
  junk: "ジャンク",
};

export function isSortResourceId(value: string): value is SortResourceId {
  return (SORT_RESOURCE_IDS as readonly string[]).includes(value);
}
