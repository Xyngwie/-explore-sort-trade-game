import {cancelIntroOpening,playLogNavigate} from '@estg/shared';
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

function hasSortHandoff(): boolean {
  const params = new URLSearchParams(window.location.search);
  return SORT_HANDOFF_KEYS.some((key) => params.has(key));
}

function clearPendingSort(): void {
  sessionStorage.removeItem(PENDING_SORT_UNOPENED_KEY);
  sessionStorage.removeItem(INTRO_PENDING_KEY);
}

function restorePendingSortOnBack(): void {
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
  playLogNavigate(window.location.href);
}

// Accepted launches record the actual quantity in hangar.ts; failed clicks reserve nothing.

// A real Sort→HUB handoff is committed, so the reservation is no longer
// refundable when the user later navigates back through history.
if (hasSortHandoff()) clearPendingSort();

window.addEventListener("pageshow", (event) => {
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (event.persisted || navigation?.type === "back_forward") restorePendingSortOnBack();
});
