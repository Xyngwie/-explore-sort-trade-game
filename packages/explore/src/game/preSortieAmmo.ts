/**
 * fix/circuit-ammo-activity-refill M3/M8: before a sortie that Explore builds
 * from HubSave itself (Invade link without a squad, 再出撃 from the save), top
 * the squad up from the 「弾薬」 stock and save, like trade's 出撃 link does.
 */
import {
  ammoShortLineJa,
  normalizeHubSnapshot,
  refillFleetAmmo,
  saveHubSaveToLocalStorage,
  type HubSnapshot,
} from "@estg/shared";

type Store = Pick<Storage, "setItem">;

export function refillBeforeSortie(
  hub: HubSnapshot,
  ids: readonly string[],
  storage?: Store | null,
): { hub: HubSnapshot; line: string } {
  if (ids.length === 0) return { hub, line: "" };
  const r = refillFleetAmmo(hub, ids);
  const next = normalizeHubSnapshot(r.hub);
  saveHubSaveToLocalStorage(next, storage ?? undefined);
  return { hub: next, line: ammoShortLineJa(r.short, ids) };
}
