import {playLogNavigate} from '@estg/shared';
import { clearPendingSort, hasSortHandoff, restorePendingSortOnBack } from "./sort-return-core";

// Accepted launches record the actual quantity in hangar.ts; failed clicks reserve nothing.

// A real Sort→HUB handoff is committed, so the reservation is no longer
// refundable when the user later navigates back through history.
if (hasSortHandoff()) clearPendingSort();

window.addEventListener("pageshow", (event) => {
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (event.persisted || navigation?.type === "back_forward") restorePendingSortOnBack(() => playLogNavigate(window.location.href));
});
