import {
  HUB_LIMITS,
  createEmptyCircuitBoard,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  saveHubSaveToLocalStorage,
  type HubCircuitRecord,
} from "@estg/shared";

const JUNK_COST = 4;
const CARD_ID = "junk-circuit-craft";

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
  return normalizeHubSnapshot(save?.hub);
}

function craftCircuit(): void {
  const hub = getHub();
  const junk = Math.max(0, Math.floor(hub.inventory.junk ?? 0));
  if (junk < JUNK_COST) return;

  const circuitId = makeCircuitId();
  const board = createEmptyCircuitBoard(4, 4, circuitId);
  board.outcome = "offline";

  const record: HubCircuitRecord = {
    circuitId,
    circuitBoard: board,
    // HubSave v3 required fields; behavior unchanged (white board → unrestored is impl B).
    restoreState: "offline",
    origin: "crafted",
    equippedTo: null,
    outcome: "offline",
    updatedAt: new Date().toISOString(),
  };

  const inventory = { ...hub.inventory };
  const remainingJunk = junk - JUNK_COST;
  if (remainingJunk > 0) inventory.junk = remainingJunk;
  else delete inventory.junk;

  saveHubSaveToLocalStorage({
    ...hub,
    inventory,
    circuits: [record, ...hub.circuits].slice(0, HUB_LIMITS.maxCircuits),
  });

  window.location.reload();
}

function render(card: HTMLElement): void {
  const hub = getHub();
  const junk = Math.max(0, Math.floor(hub.inventory.junk ?? 0));
  const canCraft = junk >= JUNK_COST;

  card.id = CARD_ID;
  card.innerHTML = `
    <h2 style="font-size:1rem;margin:0 0 0.5rem">回路作成</h2>
    <p class="muted" style="margin:0 0 0.5rem;font-size:0.75rem">
      ジャンク ${JUNK_COST}個から回路を1枚作成します。
    </p>
    <div class="row" style="justify-content:space-between;align-items:center;gap:0.5rem">
      <span>ジャンク：${junk}</span>
      <button type="button" class="secondary" data-junk-circuit-craft ${canCraft ? "" : "disabled"}>
        回路を作成
      </button>
    </div>
  `;

  card.querySelector<HTMLButtonElement>("[data-junk-circuit-craft]")?.addEventListener("click", craftCircuit);
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
