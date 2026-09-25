const HUB_SAVE_STORAGE_KEY = "wreckline.hubSave.v1";
const PIECES_PER_CONTAINER = 25;

function readHubUnopenedContainers(): number {
  try {
    const raw = localStorage.getItem(HUB_SAVE_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { hub?: { unopenedContainers?: unknown } };
    const n = Number(parsed.hub?.unopenedContainers ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

function spendOneHubContainer(): boolean {
  try {
    const raw = localStorage.getItem(HUB_SAVE_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      v?: number;
      savedAt?: string;
      hub?: { unopenedContainers?: unknown } & Record<string, unknown>;
    };
    if (!parsed.hub) return false;
    const have = Number(parsed.hub.unopenedContainers ?? 0);
    if (!Number.isFinite(have) || have < 1) return false;
    parsed.hub.unopenedContainers = Math.floor(have) - 1;
    parsed.savedAt = new Date().toISOString();
    localStorage.setItem(HUB_SAVE_STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

function isExploreHandoffQuery(): boolean {
  const p = new URLSearchParams(window.location.search);
  return p.has("salvagedContainers") || p.has("totalStockPieces") || p.has("isExtracted");
}

function addOneContainerToQuery(): void {
  const u = new URL(window.location.href);
  const containers = Math.max(0, Number.parseInt(u.searchParams.get("salvagedContainers") ?? "0", 10) || 0);
  const stock = Math.max(
    0,
    Number.parseInt(u.searchParams.get("totalStockPieces") ?? "0", 10) ||
      containers * PIECES_PER_CONTAINER,
  );
  u.searchParams.set("salvagedContainers", String(containers + 1));
  u.searchParams.set("totalStockPieces", String(stock + PIECES_PER_CONTAINER));
  if (!u.searchParams.has("isExtracted")) u.searchParams.set("isExtracted", "1");
  window.location.assign(u.toString());
}

function installContainerButton(): void {
  if (!isExploreHandoffQuery()) return;
  const actions = document.querySelector<HTMLElement>(".stage-overlay[aria-label='精製ブリーフィング'] .stage-actions");
  if (!actions || actions.querySelector("#btn-add-hub-container")) return;

  const remaining = readHubUnopenedContainers();
  if (remaining <= 0) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "btn-add-hub-container";
  button.className = "secondary";
  button.textContent = `＋ 未開封コンテナを1個追加（HUB残り ${remaining}）`;
  button.title = "HUBに保管している未開封コンテナを今回の精製へ追加します";
  button.addEventListener("click", () => {
    button.disabled = true;
    if (!spendOneHubContainer()) {
      button.disabled = false;
      return;
    }
    addOneContainerToQuery();
  });
  actions.appendChild(button);
}

const observer = new MutationObserver(installContainerButton);
observer.observe(document.body, { childList: true, subtree: true });
installContainerButton();
