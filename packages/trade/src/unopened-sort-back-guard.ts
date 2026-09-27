import { HUB_SAVE_STORAGE_KEY, normalizeHubSnapshot, type HubSnapshot } from "@estg/shared";

const PENDING_SORT_UNOPENED_KEY = "wreckline.pendingSortUnopenedBack.v1";
const SORT_HANDOFF_KEYS = ["importMaterials", "craftMultiplier", "yieldBag", "depositUnopenedContainers"];

function readCount(raw: string | null): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function readSavedHub(): HubSnapshot | null {
  try {
    const raw = localStorage.getItem(HUB_SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { hub?: Partial<HubSnapshot> } | null;
    return parsed?.hub ? normalizeHubSnapshot(parsed.hub) : null;
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
    localStorage.setItem(
      HUB_SAVE_STORAGE_KEY,
      JSON.stringify({ v: 2, savedAt: new Date().toISOString(), hub: { ...hub, unopenedContainers: next } }),
    );
  } catch {
    // Never block HUB navigation because a storage write failed.
  }
}

function hasSortHandoff(): boolean {
  const params = new URLSearchParams(window.location.search);
  return SORT_HANDOFF_KEYS.some((key) => params.has(key));
}

function markPendingSort(): void {
  const target = document.activeElement?.closest<HTMLElement>("#btn-sort-unopened, #btn-sortie-sort");
  const input = target?.id === "btn-sort-unopened"
    ? document.getElementById("input-sort-unopened") as HTMLInputElement | null
    : null;
  const panel = target?.closest("#unopened-panel");
  const stockMatch = panel?.textContent?.match(/在庫\s*(\d+)/);
  const quantity = input
    ? Math.max(1, Math.floor(Number(input.value) || 1))
    : Math.max(1, readCount(stockMatch?.[1] ?? null));
  sessionStorage.setItem(PENDING_SORT_UNOPENED_KEY, String(quantity));
}

function clearPendingSort(): void {
  sessionStorage.removeItem(PENDING_SORT_UNOPENED_KEY);
}

function restorePendingSortOnBack(): void {
  const pending = readCount(sessionStorage.getItem(PENDING_SORT_UNOPENED_KEY));
  if (pending < 1) return;
  const hub = readSavedHub();
  if (!hub) return;
  saveHubWithUnopened(hub.unopenedContainers + pending);
  clearPendingSort();
  window.location.reload();
}

// This module is loaded before main.ts. Delegation therefore records the
// reservation before hangar.ts decrements and persists the stock.
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("#btn-sort-unopened, #btn-sortie-sort")) markPendingSort();
});

// A real Sort→HUB handoff is committed, so the reservation is no longer
// refundable when the user later navigates back through history.
if (hasSortHandoff()) clearPendingSort();

window.addEventListener("pageshow", (event) => {
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (event.persisted || navigation?.type === "back_forward") restorePendingSortOnBack();
});
