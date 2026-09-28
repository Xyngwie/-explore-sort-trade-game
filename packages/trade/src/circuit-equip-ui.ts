/** HUB circuit equipment UI (Module 3).
 *
 * Keeps the interaction intentionally small: choose a circuit and a mech,
 * equip/unequip for free. The actual slot rules live in shared/circuit-inventory.
 */
import {
  equipCircuit,
  unequipCircuit,
  loadHubSaveWithStatus,
  mechSlotCapacity,
  saveHubSaveToLocalStorage,
  type HubCircuitRecord,
  type HubSnapshot,
} from "@estg/shared";
import { saveMigrationNotice } from "./save-migration-notice";

const CARD_ID = "circuit-equip-panel";
const SAVE_NOTICE_ID = "save-migration-notice";

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stateLabel(c: HubCircuitRecord): string {
  switch (c.restoreState) {
    case "fully_awakened": return "Fully Awakened";
    case "bypass": return "Bypass";
    case "offline": return "Offline";
    default: return "未Restore";
  }
}

function loadHub(): HubSnapshot | null {
  return loadHubSaveWithStatus()?.save?.hub ?? null;
}

function renderSaveNotice(): void {
  const existing = document.getElementById(SAVE_NOTICE_ID);
  if (existing instanceof HTMLElement) existing.remove();

  const result = loadHubSaveWithStatus();
  const message = saveMigrationNotice(result);
  if (!message) return;

  const anchor = Array.from(document.querySelectorAll("h2")).find(
    (el) => el.textContent?.trim() === "保有回路",
  );
  const anchorCard = anchor?.closest(".card");
  if (!(anchorCard instanceof HTMLElement)) return;

  const card = document.createElement("div");
  card.id = SAVE_NOTICE_ID;
  card.className = "card";
  card.innerHTML = `<p style="margin:0">${esc(message)}</p>`;
  anchorCard.insertAdjacentElement("beforebegin", card);
}

function render(): void {
  renderSaveNotice();

  const existing = document.getElementById(CARD_ID);
  if (existing instanceof HTMLElement && existing.isConnected) return;

  const anchor = Array.from(document.querySelectorAll("h2")).find(
    (el) => el.textContent?.trim() === "保有回路",
  );
  const anchorCard = anchor?.closest(".card");
  if (!(anchorCard instanceof HTMLElement)) return;

  const loaded = loadHub();
  if (!loaded) return;
  const hub = loaded;
  const circuits = hub.circuits ?? [];
  const fleet = hub.fleet ?? [];

  const card = document.createElement("div");
  card.id = CARD_ID;
  card.className = "card";

  const equipped = circuits.filter((c) => c.equippedTo != null);
  const rows = fleet.length === 0
    ? `<p class="muted">装備先の機体がありません。</p>`
    : fleet.map((mech) => {
        const mine = circuits.filter((c) => c.equippedTo === mech.instanceId);
        const cap = mechSlotCapacity(mech);
        const names = mine.length === 0
          ? "なし"
          : mine.map((c) => `${esc(c.circuitId)}（${stateLabel(c)}）`).join("、");
        return `<div class="fleet-row">
          <div class="row" style="justify-content:space-between;align-items:center">
            <strong>${esc(mech.catalogId)}</strong>
            <span class="muted">${mine.length}/${cap}枠</span>
          </div>
          <div class="muted" style="font-size:0.8rem">${names}</div>
        </div>`;
      }).join("");

  const circuitOptions = circuits.map((c) => {
    const owner = c.equippedTo ? `装備: ${c.equippedTo}` : "倉庫";
    return `<option value="${esc(c.circuitId)}">${esc(c.circuitId)} — ${stateLabel(c)} — ${owner}</option>`;
  }).join("");
  const mechOptions = fleet.map((m) =>
    `<option value="${esc(m.instanceId)}">${esc(m.catalogId)} (${esc(m.instanceId)})</option>`,
  ).join("");

  card.innerHTML = `
    <h2 style="font-size:1rem;margin:0 0 0.5rem">回路装備</h2>
    <p class="muted" style="margin:0 0 0.5rem;font-size:0.75rem">
      HUBでのみ付け替え可能。装備・取り外しは無料です。
    </p>
    ${circuits.length === 0
      ? `<p class="muted">回路がありません。</p>`
      : `<div class="row" style="align-items:center;flex-wrap:wrap;gap:0.5rem">
          <label>回路
            <select id="circuit-equip-select">${circuitOptions}</select>
          </label>
          <label>機体
            <select id="circuit-equip-mech">${mechOptions}</select>
          </label>
          <button type="button" class="secondary" data-equip-action="equip">装備</button>
          <button type="button" class="secondary" data-equip-action="unequip">取り外す</button>
        </div>`}
    <div style="margin-top:0.75rem">
      <div class="muted" style="font-size:0.75rem;margin-bottom:0.35rem">現在の装備状況（${equipped.length}枚）</div>
      ${rows}
    </div>
  `;

  const action = (kind: "equip" | "unequip") => {
    const circuitId = card.querySelector<HTMLSelectElement>("#circuit-equip-select")?.value;
    const mechId = card.querySelector<HTMLSelectElement>("#circuit-equip-mech")?.value;
    if (!circuitId || !mechId) return;

    const current = loadHub();
    if (!current) return;
    const result = kind === "equip"
      ? equipCircuit(current, circuitId, mechId)
      : { hub: unequipCircuit(current, circuitId), ok: true as const };

    if (!result.ok) {
      const message = result.reason === "slot_full"
        ? "その機体の回路枠がいっぱいです。"
        : result.reason === "no_mech"
          ? "装備先の機体がありません。"
          : "回路が見つかりません。";
      window.alert(message);
      return;
    }
    saveHubSaveToLocalStorage(result.hub);
    window.location.reload();
  };

  card.querySelector<HTMLButtonElement>("[data-equip-action=\"equip\"]")?.addEventListener("click", () => action("equip"));
  card.querySelector<HTMLButtonElement>("[data-equip-action=\"unequip\"]")?.addEventListener("click", () => action("unequip"));
  anchorCard.insertAdjacentElement("afterend", card);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const observer = new MutationObserver(() => render());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", render, { once: true });
  render();
}
