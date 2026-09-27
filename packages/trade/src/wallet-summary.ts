import {
  HUB_SAVE_STORAGE_KEY,
  RESOURCE_IDS,
  parseHubSave,
  saveHubSaveToLocalStorage,
  parseYieldBagCompact,
  yieldBagTotal,
} from "@estg/shared";

const LAST_SORT_YIELD_TOTAL_KEY = "wreckline.lastSortYieldTotal.v0";
const EXPECTED_UNOPENED_KEY = "wreckline.expectedUnopenedAfterHandoff.v0";
const HANDOFF_QUERY_KEYS = [
  "importMaterials",
  "craftMultiplier",
  "yieldBag",
  "depositUnopenedContainers",
];

function readHub() {
  try {
    const raw = localStorage.getItem(HUB_SAVE_STORAGE_KEY);
    return raw ? parseHubSave(raw)?.hub ?? null : null;
  } catch {
    return null;
  }
}

function readInt(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function captureSortYieldFromHandoff() {
  const params = new URLSearchParams(window.location.search);
  if (!HANDOFF_QUERY_KEYS.some((key) => params.has(key))) return;

  if (params.has("yieldBag")) {
    const bag = parseYieldBagCompact(params.get("yieldBag"));
    localStorage.setItem(LAST_SORT_YIELD_TOTAL_KEY, String(yieldBagTotal(bag)));
  } else if (params.has("importMaterials")) {
    // A skip / empty handoff produced no new resources.
    localStorage.setItem(LAST_SORT_YIELD_TOTAL_KEY, "0");
  }

  const deposit = readInt(params.get("depositUnopenedContainers"));
  if (deposit > 0) {
    const hub = readHub();
    if (hub) {
      sessionStorage.setItem(
        EXPECTED_UNOPENED_KEY,
        String(Math.max(0, Math.floor(hub.unopenedContainers ?? 0)) + deposit),
      );
    }
  }
}

function readLastSortYieldTotal(): number {
  return readInt(localStorage.getItem(LAST_SORT_YIELD_TOTAL_KEY));
}

function setStatValue(el: HTMLElement, label: string, value: number | string) {
  const key = el.querySelector<HTMLElement>(".stat-k");
  if (key) key.textContent = label;
  const textNode = Array.from(el.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
  );
  if (textNode) textNode.textContent = ` ${value}`;
}

function ensureUnopenedHandoffApplied(hub: ReturnType<typeof readHub>) {
  if (!hub) return;
  const expected = readInt(sessionStorage.getItem(EXPECTED_UNOPENED_KEY));
  if (expected <= 0) return;
  const actual = Math.max(0, Math.floor(hub.unopenedContainers ?? 0));
  if (actual < expected) {
    saveHubSaveToLocalStorage({
      ...hub,
      unopenedContainers: expected,
    });
  }
  sessionStorage.removeItem(EXPECTED_UNOPENED_KEY);
}

let updating = false;

function updateWalletSummary() {
  if (updating) return;
  const pills = document.querySelector<HTMLElement>(".wallet-card .stat-pills");
  if (!pills) return;
  updating = true;

  const children = Array.from(pills.children).filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  if (children.length < 6) {
    updating = false;
    return;
  }

  const keyByLabel: Record<string, string> = {
    Cr: "credits",
    クレジット: "credits",
    資材: "materials",
    弾薬: "ammo",
    艦隊: "fleet",
    未開封: "unopened",
    搬入: "imported",
  };
  for (const child of children) {
    const key = child.querySelector<HTMLElement>(".stat-k")?.textContent?.trim();
    if (key && keyByLabel[key]) child.dataset.walletKey = keyByLabel[key];
  }

  const byKey = new Map(
    Array.from(pills.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .map((node) => [node.dataset.walletKey, node] as const),
  );
  const orderedKeys = [
    "credits",
    "fleet",
    "ammo",
    "unopened",
    "imported",
    "materials",
  ];
  for (const key of orderedKeys) {
    const child = byKey.get(key);
    if (child && child.parentElement === pills) pills.appendChild(child);
  }

  const hub = readHub();
  if (!hub) {
    updating = false;
    return;
  }
  ensureUnopenedHandoffApplied(hub);
  const refreshedHub = readHub() ?? hub;

  const resourceTotal = RESOURCE_IDS.reduce(
    (sum, id) => sum + Math.max(0, Math.floor(refreshedHub.inventory?.[id] ?? 0)),
    0,
  );
  const ammoTotal = Object.values(refreshedHub.ammoLoad ?? {}).reduce(
    (sum, value) => sum + Math.max(0, Math.floor(Number(value) || 0)),
    0,
  );
  const fleetTotal = refreshedHub.fleet?.length ?? 0;
  const unopened = Math.max(0, Math.floor(refreshedHub.unopenedContainers ?? 0));

  const reordered = Array.from(pills.children) as HTMLElement[];
  setStatValue(reordered[0], "クレジット", Math.floor(refreshedHub.credits ?? 0));
  setStatValue(reordered[1], "艦隊", `${fleetTotal}/3`);
  setStatValue(reordered[2], "弾薬", ammoTotal);
  setStatValue(reordered[3], "未開封", unopened);
  setStatValue(reordered[4], "搬入", readLastSortYieldTotal());
  setStatValue(reordered[5], "資材", resourceTotal);

  pills.style.display = "grid";
  pills.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
  pills.style.gap = "0.4rem";
  updating = false;
}

captureSortYieldFromHandoff();

const observer = new MutationObserver(() => updateWalletSummary());
observer.observe(document.documentElement, { childList: true, subtree: true });

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", updateWalletSummary, { once: true });
} else {
  updateWalletSummary();
}

window.addEventListener("storage", updateWalletSummary);
