import {
  INITIAL_HUB,
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
const CARD_ID = "four-resource-trade";
const LEGACY_HEADING = "型付き在庫";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getHub(): HubSnapshot {
  const save = loadHubSaveFromLocalStorage();
  return normalizeHubSnapshot(save?.hub ?? INITIAL_HUB);
}

function rows(hub: HubSnapshot): string {
  return RESOURCE_IDS.map((id) => {
    const quantity = Math.max(0, Math.floor(hub.inventory?.[id] ?? 0));
    return `<tr>
      <td><strong>${escapeHtml(RESOURCE_LABEL_JA[id])}</strong></td>
      <td>${quantity}</td>
      <td>
        <div class="row" style="margin:0;gap:0.35rem;flex-wrap:wrap">
          <button type="button" class="secondary" data-four-resource-action="sell" data-four-resource-id="${id}" ${quantity < 1 ? "disabled" : ""}>売却 ${SELL_PRICE}c</button>
          <button type="button" class="secondary" data-four-resource-action="buy" data-four-resource-id="${id}" ${hub.credits < BUY_PRICE ? "disabled" : ""}>購入 ${BUY_PRICE}c</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

function renderCard(card: HTMLElement): void {
  const hub = getHub();
  card.id = CARD_ID;
  card.innerHTML = `
    <h2 style="font-size:1rem;margin:0 0 0.5rem">資源取引</h2>
    <p class="muted" style="margin:0 0 0.5rem;font-size:0.75rem">
      Sortで得た4資源をここで売買。売値 ${SELL_PRICE}c / 買値 ${BUY_PRICE}c（取引手数料 1c）。
    </p>
    <table>
      <thead><tr><th>資源</th><th>在庫</th><th>取引</th></tr></thead>
      <tbody>${rows(hub)}</tbody>
    </table>
  `;

  card.querySelectorAll<HTMLButtonElement>("[data-four-resource-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.fourResourceId as ResourceId | undefined;
      const action = button.dataset.fourResourceAction;
      if (!id || !RESOURCE_IDS.includes(id)) return;

      const hubNow = getHub();
      const current = Math.max(0, Math.floor(hubNow.inventory?.[id] ?? 0));
      const inventory = { ...hubNow.inventory };

      if (action === "sell") {
        if (current < 1) return;
        if (current === 1) delete inventory[id];
        else inventory[id] = current - 1;
        saveHubSaveToLocalStorage({
          ...hubNow,
          credits: hubNow.credits + SELL_PRICE,
          inventory,
        });
      } else {
        if (hubNow.credits < BUY_PRICE) return;
        inventory[id] = current + 1;
        saveHubSaveToLocalStorage({
          ...hubNow,
          credits: hubNow.credits - BUY_PRICE,
          inventory,
        });
      }

      window.location.reload();
    });
  });
}

function findLegacyCard(): HTMLElement | null {
  const headings = Array.from(document.querySelectorAll("h2"));
  const heading = headings.find((el) => el.textContent?.trim() === LEGACY_HEADING);
  const card = heading?.closest(".card");
  return card instanceof HTMLElement ? card : null;
}

function install(): void {
  const existing = document.getElementById(CARD_ID);
  if (existing instanceof HTMLElement) return;

  const legacy = findLegacyCard();
  if (legacy) {
    renderCard(legacy);
    return;
  }

  // Render is synchronous in Module 3, but this also handles a delayed mount.
  window.setTimeout(install, 50);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", install, { once: true });
  install();
}
