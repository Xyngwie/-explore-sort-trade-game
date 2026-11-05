/**
 * HUB side of the Sort return (#332): the back-refund of reserved containers.
 * Shared by the existing DOCK page (unopened-sort-back-guard.ts) and the canvas
 * edition. No DOM side effects.
 */
import {cancelIntroOpening, parseYieldBagCompact, yieldBagTotal} from '@estg/shared';
import { validateAndConsumeSortHandoff } from "./sort-handoff-guard";
import { loadHubSaveFromLocalStorage, saveHubSaveToLocalStorage, type HubSnapshot } from "@estg/shared";

const PENDING_SORT_UNOPENED_KEY = "wreckline.pendingSortUnopenedBack.v1";
const INTRO_PENDING_KEY="wreckline.pendingIntroOpening.v1";
const SORT_HANDOFF_KEYS = ["introResultId", "introCancelId","fromSort", "importMaterials" /* old URL marker */, "craftMultiplier", "yieldBag", "depositUnopenedContainers"];

function readCount(raw: string | null): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function readSavedHub(): HubSnapshot | null {
  try {
    // HubSave v3 load order (v3 key → legacy-key migration) via shared.
    return loadHubSaveFromLocalStorage()?.hub ?? null;
  } catch {
    return null;
  }
}

function saveHubWithUnopened(unopenedContainers: number): void {
  const hub = readSavedHub();
  if (!hub) return;
  const next = Math.max(0, Math.floor(unopenedContainers));
  if (hub.unopenedContainers >= next) return;
  try {
    saveHubSaveToLocalStorage({ ...hub, unopenedContainers: next });
  } catch {
    // Never block HUB navigation because a storage write failed.
  }
}

export function hasSortHandoff(search: string = window.location.search): boolean {
  const params = new URLSearchParams(search);
  return SORT_HANDOFF_KEYS.some((key) => params.has(key));
}

export function clearPendingSort(): void {
  sessionStorage.removeItem(PENDING_SORT_UNOPENED_KEY);
  sessionStorage.removeItem(INTRO_PENDING_KEY);
}

/** Refund containers reserved for a Sort run left with browser back; `reopen` shows the refreshed HUB. */
export function restorePendingSortOnBack(reopen: () => void): void {
  const pending = readCount(sessionStorage.getItem(PENDING_SORT_UNOPENED_KEY));
  if (pending < 1) return;
  const hub = readSavedHub();
  if (!hub) return;
  const introId = sessionStorage.getItem(INTRO_PENDING_KEY);
  if (introId) {
    const opening = hub.newGameIntro?.opening;
    if (opening?.id === introId) {
      if (
        !saveHubSaveToLocalStorage({
          ...cancelIntroOpening(hub, introId),
          unopenedContainers: hub.unopenedContainers + opening.containerCount,
        })
      )
        return;
    }
  } else saveHubWithUnopened(hub.unopenedContainers + pending);
  clearPendingSort();
  reopen();
}


const RESOURCE_KEYS = [
  "yieldBag",
  "introResultId",
  "introCancelId",
  "depositUnopenedContainers",
];

/**
 * Sort→HUB token check (sort-handoff-gate.ts). A resource grant without a
 * valid single-use token is stripped from the URL before anything reads it.
 * Returns the URL to `replaceState` to, or null when the URL stays as it is.
 */
export function gateSortHandoff(search: string, href: string): string | null {
  const hasResourceGrant = RESOURCE_KEYS.some((key) => new URLSearchParams(search).has(key));
  if (!hasResourceGrant || validateAndConsumeSortHandoff(search)) return null;
  const url = new URL(href);
  for (const key of RESOURCE_KEYS) url.searchParams.delete(key);
  url.searchParams.delete("handoffId");
  return url.toString();
}

/** Sort → Trade bookkeeping (wallet-summary.ts): last Sort yield total. */
const LAST_SORT_YIELD_TOTAL_KEY = "wreckline.lastSortYieldTotal.v0";
const HANDOFF_QUERY_KEYS = [
  "fromSort",
  "importMaterials", // old URL marker (grants nothing)
  "craftMultiplier",
  "yieldBag",
  "depositUnopenedContainers",
];

export function captureSortYieldFromHandoff(search: string = window.location.search) {
  const params = new URLSearchParams(search);
  if (!HANDOFF_QUERY_KEYS.some((key) => params.has(key))) return;

  if (params.has("yieldBag")) {
    const bag = parseYieldBagCompact(params.get("yieldBag"));
    localStorage.setItem(LAST_SORT_YIELD_TOTAL_KEY, String(yieldBagTotal(bag)));
  } else {
    localStorage.setItem(LAST_SORT_YIELD_TOTAL_KEY, "0");
  }
}

