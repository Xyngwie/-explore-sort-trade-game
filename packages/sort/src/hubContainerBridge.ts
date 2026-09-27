import { loadHubSaveFromLocalStorage, saveHubSaveToLocalStorage } from "@estg/shared";

// HubSave v3: read/write through the shared contract (v3 key, legacy-key migration,
// newer-version read-only guard). docs/HUB_SAVE_CONTRACT.md §12.
const PIECES_PER_CONTAINER = 25;

function readHubUnopenedContainers(): number {
  try {
    const n = Number(loadHubSaveFromLocalStorage()?.hub.unopenedContainers ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

function spendHubContainers(count: number): boolean {
  if (count < 1) return false;
  try {
    const hub = loadHubSaveFromLocalStorage()?.hub;
    if (!hub) return false;
    const have = Number(hub.unopenedContainers ?? 0);
    if (!Number.isFinite(have) || have < count) return false;
    return saveHubSaveToLocalStorage({ ...hub, unopenedContainers: Math.floor(have) - count });
  } catch {
    return false;
  }
}

function isExploreHandoffQuery(): boolean {
  const p = new URLSearchParams(window.location.search);
  return p.has("salvagedContainers") || p.has("totalStockPieces") || p.has("isExtracted");
}

function addContainersToQuery(count: number): void {
  const u = new URL(window.location.href);
  const containers = Math.max(0, Number.parseInt(u.searchParams.get("salvagedContainers") ?? "0", 10) || 0);
  const stock = Math.max(
    0,
    Number.parseInt(u.searchParams.get("totalStockPieces") ?? "0", 10) ||
      containers * PIECES_PER_CONTAINER,
  );
  u.searchParams.set("salvagedContainers", String(containers + count));
  u.searchParams.set("totalStockPieces", String(stock + count * PIECES_PER_CONTAINER));
  if (!u.searchParams.has("isExtracted")) u.searchParams.set("isExtracted", "1");
  window.location.assign(u.toString());
}

function installContainerButtons(): void {
  if (!isExploreHandoffQuery()) return;
  const actions = document.querySelector<HTMLElement>(".stage-overlay[aria-label='精製ブリーフィング'] .stage-actions");
  if (!actions || actions.querySelector("#btn-add-hub-container")) return;

  const remaining = readHubUnopenedContainers();
  if (remaining <= 0) return;

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.id = "btn-add-hub-container";
  addButton.className = "secondary";
  addButton.textContent = `＋1 未開封コンテナ（残り ${remaining}）`;
  addButton.title = "HUBの未開封コンテナを1個だけ今回の精製へ追加します";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.id = "btn-add-all-hub-containers";
  allButton.className = "secondary";
  allButton.textContent = `＋ALL（${remaining}個）`;
  allButton.title = "HUBに残っている未開封コンテナをすべて今回の精製へ追加します";

  const handleAdd = (count: number) => {
    addButton.disabled = true;
    allButton.disabled = true;
    if (!spendHubContainers(count)) {
      addButton.disabled = false;
      allButton.disabled = false;
      return;
    }
    addContainersToQuery(count);
  };

  addButton.addEventListener("click", () => handleAdd(1));
  allButton.addEventListener("click", () => handleAdd(remaining));

  actions.appendChild(addButton);
  actions.appendChild(allButton);
}

const observer = new MutationObserver(installContainerButtons);
observer.observe(document.body, { childList: true, subtree: true });
installContainerButtons();
