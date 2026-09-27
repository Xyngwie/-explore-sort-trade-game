import {
  RESTORE_MAX_SIDE,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  saveHubSaveToLocalStorage,
} from "@estg/shared";
import {
  backfillPerfectMaxSize,
  craftJunkCircuit,
  heldJunk,
  junkCraftConfirmText,
  junkCraftMaxSide,
  junkCraftOptions,
  type JunkCraftOption,
} from "./junk-craft";

const CARD_ID = "junk-circuit-craft";
const SIZE_SELECT_ID = "junk-circuit-craft-size";

function makeCircuitId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `junk_craft_${crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to the compatibility generator.
  }
  return `junk_craft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getHub() {
  const save = loadHubSaveFromLocalStorage();
  // Same backfill as hangar load, so the cap is right even before hangar persists.
  return backfillPerfectMaxSize(normalizeHubSnapshot(save?.hub));
}

function optionLabel(o: JunkCraftOption): string {
  const cost = `ジャンク${o.junk}・${o.credits}c`;
  if (o.reason === "over_cap") return `${o.side}×${o.side}（${cost}・未解放）`;
  if (o.reason === "no_junk") return `${o.side}×${o.side}（${cost}・ジャンク不足）`;
  if (o.reason === "no_credits") return `${o.side}×${o.side}（${cost}・クレジット不足）`;
  return `${o.side}×${o.side}（${cost}）`;
}

function craftCircuit(side: number): void {
  // Same style as the sell confirm; only for 100c and up (8×8+).
  const confirmText = junkCraftConfirmText(side);
  if (confirmText && !window.confirm(confirmText)) return;
  const result = craftJunkCircuit(getHub(), side, { circuitId: makeCircuitId() });
  if (!result.ok) return;
  saveHubSaveToLocalStorage(result.hub);
  window.location.reload();
}

function render(card: HTMLElement): void {
  const hub = getHub();
  const junk = heldJunk(hub);
  const cap = junkCraftMaxSide(hub);
  // List every size up to 20; over-cap / unaffordable sizes are disabled.
  const options = junkCraftOptions(hub, RESTORE_MAX_SIDE);
  // Default to the smallest enabled size so nobody spends a lot by accident.
  const firstEnabled = options.find((o) => o.enabled) ?? null;

  card.id = CARD_ID;
  card.innerHTML = `
    <h2 style="font-size:1rem;margin:0 0 0.5rem">回路作成</h2>
    <p class="muted" style="margin:0 0 0.5rem;font-size:0.75rem">
      ジャンクとクレジットで N×N の回路を1枚作成します（最大 ${cap}×${cap}。パーフェクトで直した最大サイズ＋1）。
    </p>
    <div class="row" style="justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">
      <span>ジャンク：${junk} · ${Math.max(0, Math.floor(hub.credits))}c</span>
      <select id="${SIZE_SELECT_ID}" aria-label="回路サイズ">
        ${options
          .map(
            (o) =>
              `<option value="${o.side}" ${o.enabled ? "" : "disabled"} ${
                firstEnabled?.side === o.side ? "selected" : ""
              }>${optionLabel(o)}</option>`,
          )
          .join("")}
      </select>
      <button type="button" class="secondary" data-junk-circuit-craft ${firstEnabled ? "" : "disabled"}>
        回路を作成
      </button>
    </div>
  `;

  const select = card.querySelector<HTMLSelectElement>(`#${SIZE_SELECT_ID}`);
  const button = card.querySelector<HTMLButtonElement>("[data-junk-circuit-craft]");
  const sync = () => {
    const side = Number(select?.value);
    const opt = options.find((o) => o.side === side);
    if (button) button.disabled = !opt?.enabled;
  };
  select?.addEventListener("change", sync);
  sync();
  button?.addEventListener("click", () => {
    const side = Number(select?.value);
    if (Number.isFinite(side)) craftCircuit(side);
  });
}

function findAnchorCard(): HTMLElement | null {
  const headings = Array.from(document.querySelectorAll("h2"));
  const heading = headings.find((el) => el.textContent?.trim() === "資源取引");
  const card = heading?.closest(".card");
  return card instanceof HTMLElement ? card : null;
}

function install(): void {
  if (document.getElementById(CARD_ID)) return;

  const anchor = findAnchorCard();
  if (!anchor) return;

  const card = document.createElement("section");
  card.className = anchor.className;
  anchor.insertAdjacentElement("afterend", card);
  render(card);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", install, { once: true });
  install();
}
