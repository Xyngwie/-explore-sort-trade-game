import {
  HUB_SAVE_STORAGE_KEY,
  RESOURCE_IDS,
  RESOURCE_LABEL_JA,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  saveHubSaveToLocalStorage,
  type HubSnapshot,
  type ResourceId,
} from "@estg/shared";

const SELL_PRICE = 5;
const BUY_PRICE = 6;
const TRADE_RESOURCE_CARD_ID = "four-resource-trade";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resourceRows(hub: HubSnapshot): string {
  return RESOURCE_IDS.map((id) => {
    const quantity = Math.max(0, Math.floor(hub.inventory?.[id] ?? 0));
    const label = RESOURCE_LABEL_JA[id];
    return `<tr>
      <td><strong>${escapeHtml(label)}</strong><div class="mono muted">${id}</div></td>
      <td>${quantity}</td>
      <td>
        <div class="row" style="margin:0;gap:0.35rem;flex-wrap:wrap">
          <button type="button" class="secondary" data-resource-trade="sell" data-resource-id="${id}" ${quantity < 1 ? "disabled" : ""}>売却 ${SELL_PRICE}c</button>
          <button type="button" class="secondary" data-resource-trade="buy" data-resource-id="${id}">購入 ${BUY_PRICE}c</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

function renderTradeCard(existing: HTMLElement, hub: HubSnapshot): void {
  existing.id = TRADE_RESOURCE_CARD_ID;
  existing.innerHTML = `
    <h2 style="font-size:1rem;margin:0 0 0.5rem">資源取引</h2>
    <p class="muted" style="margin:0 0 0.5rem;font-size:0.75rem">
      Sortで得た4資源をここで売買。売値 ${SELL_PRICE}c / 買値 ${BUY_PRICE}c（取引手数料 1c）。
    </p>
    <table>
      <thead><tr><th>資源</th><th>在庫</th><th>取引</th></tr></thead>
      <tbody>${resourceRows(hub)}</tbody>
    </table>
  `;
  existing.querySelectorAll<HTMLButtonElement>("[data-resource-trade]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.resourceId as ResourceId | undefined;
      const action = button.dataset.resourceTrade;
      if (!id || !RESOURCE_IDS.includes(id)) return;
      tradeResource(id, action === "buy" ? "buy" : "sell");
    });
  });
}

function tradeResource(id: ResourceId, action: "buy" | "sell"): void {
  const save = loadHubSaveFromLocalStorage();
  if (!save) return;
  const hub = normalizeHubSnapshot(save.hub);
  const current = Math.max(0, Math.floor(hub.inventory?.[id] ?? 0));

  if (action === "sell") {
    if (current < 1) return;
    const inventory = { ...hub.inventory };
    if (current === 1) delete inventory[id];
    else inventory[id] = current - 1;
    saveHubSaveToLocalStorage({
      ...hub,
      credits: hub.credits + SELL_PRICE,
      inventory,
    });
  } else {
    if (hub.credits < BUY_PRICE) return;
    const inventory = { ...hub.inventory, [id]: current + 1 };
    saveHubSaveToLocalStorage({
      ...hub,
      credits: hub.credits - BUY_PRICE,
      inventory,
    });
  }

  window.location.reload();
}

function installFourResourceTradeWindow(): void {
  const install = () => {
    const heading = Array.from(document.querySelectorAll("h2")).find(
      (el) => el.textContent?.trim() === "型付き在庫",
    );
    if (!(heading instanceof HTMLElement)) return;
    const card = heading.closest(".card");
    if (!(card instanceof HTMLElement)) return;
    if (card.id === TRADE_RESOURCE_CARD_ID) return;
    const save = loadHubSaveFromLocalStorage();
    if (!save) return;
    renderTradeCard(card, normalizeHubSnapshot(save.hub));
  };

  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  install();
}

if (typeof window !== "undefined" && typeof MutationObserver !== "undefined") {
  installFourResourceTradeWindow();
}
