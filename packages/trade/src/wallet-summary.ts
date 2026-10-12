import { parseYieldBagCompact, yieldBagTotal } from "@estg/shared";

/**
 * Sort → Trade handoff bookkeeping (last Sort yield total).
 *
 * 2026-10-12 (fix/hangar-money-followups): this file used to reorder and
 * rewrite the hangar holdings bar after main.ts rendered it. That rewrite read
 * 弾薬 from the old typed `ammoLoad`, summed all four resources into 資材, and
 * never actually ran its value updates (it handed the raw localStorage string
 * to `parseHubSave`, which wants the parsed object), so only the reorder took
 * effect. The bar is now rendered once from the real stock by main.ts
 * (`holdingPills`: 弾薬 `inventory.ammo`, 装甲パーツ `inventory.armor`,
 * 電力パーツ `inventory.power`) and this file no longer touches it.
 */
const LAST_SORT_YIELD_TOTAL_KEY = "wreckline.lastSortYieldTotal.v0";
const HANDOFF_QUERY_KEYS = [
  "importMaterials",
  "craftMultiplier",
  "yieldBag",
  "depositUnopenedContainers",
];

function captureSortYieldFromHandoff() {
  const params = new URLSearchParams(window.location.search);
  if (!HANDOFF_QUERY_KEYS.some((key) => params.has(key))) return;

  if (params.has("yieldBag")) {
    const bag = parseYieldBagCompact(params.get("yieldBag"));
    localStorage.setItem(LAST_SORT_YIELD_TOTAL_KEY, String(yieldBagTotal(bag)));
  } else if (params.has("importMaterials")) {
    localStorage.setItem(LAST_SORT_YIELD_TOTAL_KEY, "0");
  }
}

captureSortYieldFromHandoff();
