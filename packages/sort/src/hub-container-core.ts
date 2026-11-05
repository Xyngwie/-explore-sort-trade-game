/**
 * HUB 未開封 → current Sort session (＋1 / ＋ALL), shared by the existing Sort
 * page (hubContainerBridge.ts) and the canvas edition. No DOM side effects.
 */
import { loadHubSaveFromLocalStorage, saveHubSaveToLocalStorage } from "@estg/shared";
// HubSave v3: read/write through the shared contract (v3 key, legacy-key migration,
// newer-version read-only guard). docs/HUB_SAVE_CONTRACT.md §12.
const PIECES_PER_CONTAINER = 25;

export function readHubUnopenedContainers(search: string = location.search): number {
  try {
    const hub = loadHubSaveFromLocalStorage()?.hub;
    let n = Number(hub?.unopenedContainers ?? 0);
    const intro = hub?.newGameIntro;
    if (intro && intro.initialOpened < 10) {
      if (
        intro.opening?.id !==
        new URLSearchParams(search).get("introOpening")
      )
        return 0;
      n = Math.min(n, 10 - intro.initialOpened - intro.opening!.initialCount);
    } else if (
      new URLSearchParams(search).has("introOpening") &&
      intro?.opening?.id !==
        new URLSearchParams(search).get("introOpening")
    )
      return 0;
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

export function spendHubContainers(count: number, url: string, search: string = location.search): boolean {
  if (count < 1) return false;
  try {
    const hub = loadHubSaveFromLocalStorage()?.hub;
    if (!hub) return false;
    const have = Number(hub.unopenedContainers ?? 0);
    if (!Number.isFinite(have) || have < count) return false;
    let next = { ...hub, unopenedContainers: Math.floor(have) - count };
    if (
      hub.newGameIntro &&
      new URLSearchParams(search).has("introOpening")
    ) {
      const intro = hub.newGameIntro,
        opening = intro.opening;
      const initial = intro.initialOpened < 10;
      if (
        !opening ||
        opening.id !==
          new URLSearchParams(search).get("introOpening") ||
        (initial && count > 10 - intro.initialOpened - opening.initialCount)
      )
        return false;
      next = {
        ...next,
        newGameIntro: {
          ...intro,
          opening: {
            ...opening,
            initialCount: opening.initialCount + (initial ? count : 0),
            containerCount: opening.containerCount + count,
            url,
          },
        },
      };
      sessionStorage.setItem(
        "wreckline.pendingSortUnopenedBack.v1",
        String(opening.containerCount + count),
      );
    }
    return saveHubSaveToLocalStorage(next);
  } catch {
    return false;
  }
}

export function isExploreHandoffQuery(search: string = window.location.search): boolean {
  const p = new URLSearchParams(search);
  return p.has("salvagedContainers") || p.has("totalStockPieces") || p.has("isExtracted");
}

export function addContainersToQuery(count: number, href: string = window.location.href): string {
  const u = new URL(href);
  const containers = Math.max(0, Number.parseInt(u.searchParams.get("salvagedContainers") ?? "0", 10) || 0);
  const stock = Math.max(
    0,
    Number.parseInt(u.searchParams.get("totalStockPieces") ?? "0", 10) ||
      containers * PIECES_PER_CONTAINER,
  );
  u.searchParams.set("salvagedContainers", String(containers + count));
  u.searchParams.set("totalStockPieces", String(stock + count * PIECES_PER_CONTAINER));
  if (!u.searchParams.has("isExtracted")) u.searchParams.set("isExtracted", "1");
  return u.toString();
}

