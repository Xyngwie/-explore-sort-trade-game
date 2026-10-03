/**
 * U9 (CIRCUIT_DATA_MODEL_V0 §5.4・§9 U9, 2026-10-03 決定): when a sortie reaches
 * its result, Explore writes the return (wrecked / left-behind mechs, wear,
 * carried ammo, battery) straight into HubSave — whichever result button the
 * player presses next (Sort へ / 再出撃 / 格納庫へ). Trade skips the same
 * return URL afterwards by sortieId / appliedSortieIds.
 *
 * Same-origin only: local dev explore (:5173) and trade (:5175) do not share
 * localStorage, so there the 格納庫 return URL still carries the result.
 */
import {
  applyExploreReturnToHub,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  saveHubSaveToLocalStorage,
  type ExploreToHubWearPayload,
} from "@estg/shared";
import { exploreReturnPayload } from "./outcome";
import type { World } from "./types";

type Store = Pick<Storage, "getItem" | "setItem">;

export type DirectSaveResult =
  | { status: "saved"; payload: ExploreToHubWearPayload }
  | { status: "already_applied"; payload: ExploreToHubWearPayload }
  | { status: "skipped"; reason: "not_result" | "no_deploy" | "no_save" | "write_refused" };

export function saveSortieResultToHub(world: World, storage?: Store | null): DirectSaveResult {
  if (world.phase !== "result") return { status: "skipped", reason: "not_result" };
  const payload = exploreReturnPayload(world);
  if (!payload) return { status: "skipped", reason: "no_deploy" };
  const loaded = loadHubSaveFromLocalStorage(storage ?? undefined);
  // No HubSave here (e.g. local dev cross-origin, or Explore opened by hand):
  // do not invent one; the return URL still carries the result to trade.
  if (!loaded?.hub) return { status: "skipped", reason: "no_save" };
  const hub = normalizeHubSnapshot(loaded.hub);
  const applied = applyExploreReturnToHub(hub, payload);
  if (!applied.applied) return { status: "already_applied", payload };
  const ok = saveHubSaveToLocalStorage(normalizeHubSnapshot(applied.hub), storage ?? undefined);
  return ok ? { status: "saved", payload } : { status: "skipped", reason: "write_refused" };
}
