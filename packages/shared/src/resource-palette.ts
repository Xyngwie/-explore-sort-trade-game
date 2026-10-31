/**
 * PR2b HUD resupply/trade palette (bottom sheet). docs/FULLSCREEN_SHELL_V0.md §8.
 * Uses the shared trade functions and one hub save per trade; updates in place
 * (no reload). Screens holding hub state in memory listen to
 * PALETTE_TRADE_EVENT and reload it from the save.
 */
import { loadHubSaveFromLocalStorage, saveHubSaveToLocalStorage, type HubSnapshot } from "./hub-save";
import { RESOURCE_LABEL_JA, type ResourceId } from "./sort-yield";
import { UNOPENED_CONTAINER_PRICE_CREDITS } from "./constants";
import { playLogBlocked, setPlayLogOperation } from "./play-log-hooks";
import {
  HOLD_START_DELAY_MS, HOLD_STEP_MS, PALETTE_RESOURCE_IDS, RESOURCE_BUY_PRICE, RESOURCE_SELL_PRICE,
  applyContainerBuy, applyResourceTrade, holdQuantity, maxContainerBuy, maxResourceTrade,
  resourceSellConfirmText, resourceStock, shortfallText, signedDelta, type TradeAction,
} from "./resource-trade";

export const PALETTE_TRADE_EVENT = "wreckline:palette-trade";
export type PaletteFocus = "credits" | ResourceId;
const SHEET_ID = "wl-palette";
const ROW_COLOR: Record<ResourceId, string> = { ammo: "#f85149", armor: "#58a6ff", power: "#d4a72c", junk: "#c9d1d9" };
const SHORT: Record<ResourceId, string> = { ammo: "弾", armor: "装", power: "電", junk: "ジャンク" };

export const PALETTE_CSS = `
#wl-palette-backdrop{position:fixed;inset:0;z-index:2147483000;background:#0008}
#wl-palette{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:100%;max-width:960px;box-sizing:border-box;z-index:2147483001;background:#161b22;border-top:1px solid #30363d;border-radius:12px 12px 0 0;padding:6px 12px calc(12px + env(safe-area-inset-bottom));max-height:80dvh;overflow:auto;font:13px/1.35 system-ui,sans-serif;color:#c9d1d9;touch-action:pan-y}
#wl-palette .wl-pal-grip{display:flex;align-items:center;justify-content:space-between;padding:4px 0 8px;touch-action:none}
#wl-palette .wl-pal-grip::before{content:"";width:36px;height:4px;border-radius:2px;background:#484f58;position:absolute;left:50%;top:6px;transform:translateX(-50%)}
#wl-palette .wl-pal-x{all:unset;cursor:pointer;padding:4px 8px;font-size:18px;color:#c9d1d9}
#wl-palette .wl-pal-row{display:grid;grid-template-columns:1fr auto auto;gap:6px 8px;align-items:center;padding:8px 0;border-top:1px solid #21262d}
#wl-palette .wl-pal-row.focus{background:#1f6feb22}
#wl-palette .wl-pal-name{font-weight:700}
#wl-palette .wl-pal-price,#wl-palette .wl-pal-short{color:#8b949e;font-size:12px}
#wl-palette .wl-pal-btn{position:relative;min-width:72px;min-height:40px;border-radius:6px;border:1px solid #30363d;background:#21262d;color:#c9d1d9;font:600 13px system-ui,sans-serif;user-select:none;-webkit-user-select:none;touch-action:none}
#wl-palette .wl-pal-btn:disabled{color:#484f58}
#wl-palette .wl-pal-btn.max-flash{animation:wl-pal-max .4s}
@keyframes wl-pal-max{from{outline:2px solid #d4a72c}to{outline:2px solid transparent}}
#wl-palette .wl-pal-bubble{position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);white-space:nowrap;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:3px 6px;font-size:12px;pointer-events:none}
#wl-palette .wl-pal-delta{grid-column:1/-1;font-size:12px}
#wl-palette .gain{color:#56d364}#wl-palette .spend{color:#ff8b8b}#wl-palette .zero{color:#8b949e}
`;

function readHub(): HubSnapshot | null {
  try { return loadHubSaveFromLocalStorage()?.hub ?? null; } catch { return null; }
}

type Delta = { key: string; text: string };
type Btn = { label: string; act: string; max: number; unit: number; sign: 1 | -1; short: string; run: (q: number) => Delta[] | null; confirm?: (q: number) => string; noHold?: boolean };

/** Open the sheet (idempotent). Returns the sheet element. */
/** PR4 §10-6 (神宮決定 2026-11-01): box purchase confirm text, shared by the palette and DOCK. */
export function containerBuyConfirmText(q: number): string {
  return `未開封コンテナを ${q} 個購入しますか？（${UNOPENED_CONTAINER_PRICE_CREDITS * q}c）`;
}
export function openResourcePalette(doc: Document, focus: PaletteFocus): HTMLElement {
  closeResourcePalette(doc);
  const backdrop = doc.createElement("div");
  backdrop.id = "wl-palette-backdrop";
  const sheet = doc.createElement("div");
  sheet.id = SHEET_ID;
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "補給・売買");
  sheet.dataset.focus = focus;
  backdrop.addEventListener("click", () => closeResourcePalette(doc));
  doc.body.append(backdrop, sheet);
  let lastDelta: { row: string; parts: Delta[] } | null = null;

  const commit = (op: string, ctx: Record<string, string | number>, next: HubSnapshot | null): boolean => {
    if (!next || playLogBlocked()) return false;
    setPlayLogOperation(op, ctx);
    try { if (saveHubSaveToLocalStorage(next) === false) return false; } catch { return false; }
    doc.defaultView?.dispatchEvent(new Event(PALETTE_TRADE_EVENT));
    return true;
  };

  const render = () => {
    const hub = readHub();
    sheet.textContent = "";
    const grip = doc.createElement("div");
    grip.className = "wl-pal-grip";
    const title = doc.createElement("strong");
    title.textContent = "補給・売買";
    const x = doc.createElement("button");
    x.type = "button"; x.className = "wl-pal-x"; x.textContent = "✕"; x.setAttribute("aria-label", "閉じる");
    x.dataset.paletteClose = "1";
    x.addEventListener("click", () => closeResourcePalette(doc));
    grip.append(title, x);
    sheet.appendChild(grip);
    installSwipe(doc, grip);
    if (!hub) return;
    const credits = Math.max(0, Math.floor(hub.credits || 0));
    const addRow = (key: string, name: string, color: string, info: string, btns: Btn[]) => {
      const row = doc.createElement("div");
      row.className = "wl-pal-row" + (key === focus ? " focus" : "");
      row.dataset.paletteRow = key;
      const left = doc.createElement("div");
      const nm = doc.createElement("div");
      nm.className = "wl-pal-name"; nm.style.color = color; nm.textContent = name;
      const pr = doc.createElement("div");
      pr.className = "wl-pal-price"; pr.textContent = info;
      left.append(nm, pr);
      row.appendChild(left);
      for (const b of btns) {
        const cell = doc.createElement("div");
        const el = doc.createElement("button");
        el.type = "button"; el.className = "wl-pal-btn"; el.textContent = b.label;
        el.dataset.paletteAct = b.act; el.dataset.paletteRow = key; el.dataset.max = String(b.max);
        el.disabled = b.max < 1;
        cell.appendChild(el);
        if (b.max < 1) {
          const s = doc.createElement("div");
          s.className = "wl-pal-short"; s.dataset.paletteShort = b.act; s.textContent = b.short;
          cell.appendChild(s);
        }
        installHold(doc, el, b, (q) => {
          if (b.confirm && !doc.defaultView?.confirm(b.confirm(q))) return;
          const parts = b.run(q);
          if (!parts) return;
          lastDelta = { row: key, parts };
          render();
        });
        row.appendChild(cell);
      }
      if (lastDelta?.row === key) {
        const d = doc.createElement("div");
        d.className = "wl-pal-delta"; d.dataset.paletteDelta = key;
        for (const p of lastDelta.parts) {
          const s = doc.createElement("span");
          const sd = signedDelta(Number(p.text));
          s.className = sd.cls; s.textContent = `${p.key} ${sd.text}　`;
          d.appendChild(s);
        }
        row.appendChild(d);
      }
      sheet.appendChild(row);
    };
    const crInfo = doc.createElement("div");
    crInfo.className = "wl-pal-price"; crInfo.dataset.paletteCredits = String(credits);
    crInfo.textContent = `所持 Cr ${credits.toLocaleString("en-US")}`;
    sheet.appendChild(crInfo);
    for (const id of PALETTE_RESOURCE_IDS) {
      const stock = resourceStock(hub, id);
      const label = RESOURCE_LABEL_JA[id] ?? SHORT[id];
      addRow(id, `${SHORT[id]}　在庫 ${stock}`, ROW_COLOR[id], `買 ${RESOURCE_BUY_PRICE}c / 売 ${RESOURCE_SELL_PRICE}c`, [
        // PR4 To-do (1): Cr tap = purchase rows only (decided 「購入の行」); sell stays on 弾・装・電 taps.
        mk(id, "buy", hub, credits), ...(focus === "credits" ? [] : [mk(id, "sell", hub, credits, label)]),
      ]);
    }
    const cmax = maxContainerBuy(hub);
    addRow("unopened", `箱　在庫 ${Math.max(0, Math.floor(hub.unopenedContainers ?? 0))}`, "#ffffff", `買 ${UNOPENED_CONTAINER_PRICE_CREDITS}c`, [{
      label: "購入", act: "buy", max: cmax, unit: UNOPENED_CONTAINER_PRICE_CREDITS, sign: -1,
      short: shortfallText(UNOPENED_CONTAINER_PRICE_CREDITS, credits),
      // PR4 §10-6/7 (神宮決定 2026-11-01): confirm every box purchase; one box per tap (no long-press bulk).
      noHold: true, confirm: (q) => containerBuyConfirmText(q),
      run: (q) => commit("unopened.buy", { quantity: q }, applyContainerBuy(readHub() ?? hub, q))
        ? [{ key: "Cr", text: String(-UNOPENED_CONTAINER_PRICE_CREDITS * q) }, { key: "箱", text: String(q) }] : null,
    }]);
  };
  const mk = (id: ResourceId, action: TradeAction, hub: HubSnapshot, credits: number, label = ""): Btn => ({
    label: action === "buy" ? "購入" : "売却", act: action, max: maxResourceTrade(hub, id, action),
    unit: action === "buy" ? RESOURCE_BUY_PRICE : RESOURCE_SELL_PRICE, sign: action === "buy" ? -1 : 1,
    short: action === "buy" ? shortfallText(RESOURCE_BUY_PRICE, credits) : "在庫なし",
    confirm: action === "sell" ? (q) => resourceSellConfirmText(label, q) : undefined,
    run: (q) => {
      const now = readHub();
      return now && commit(`resource.${action}`, { id, quantity: q }, applyResourceTrade(now, id, action, q))
        ? [{ key: "Cr", text: String(action === "sell" ? RESOURCE_SELL_PRICE * q : -RESOURCE_BUY_PRICE * q) },
           { key: SHORT[id], text: String(action === "sell" ? -q : q) }]
        : null;
    },
  });
  render();
  return sheet;
}

export function closeResourcePalette(doc: Document): void {
  doc.getElementById(SHEET_ID)?.remove();
  doc.getElementById("wl-palette-backdrop")?.remove();
}

function installSwipe(doc: Document, grip: HTMLElement): void {
  let y0: number | null = null;
  grip.addEventListener("pointerdown", (e) => { y0 = e.clientY; });
  grip.addEventListener("pointerup", (e) => { if (y0 !== null && e.clientY - y0 > 60) closeResourcePalette(doc); y0 = null; });
  grip.addEventListener("pointercancel", () => { y0 = null; });
}

/** Tap = 1; hold grows ×N (bubble shows ×N / 合計); release runs once; slide off = cancel. */
function installHold(doc: Document, el: HTMLButtonElement, b: Btn, run: (q: number) => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let steps = -1, qty = 1, active = false, flashed = false, bubble: HTMLElement | null = null;
  const stop = () => { if (timer) clearTimeout(timer); timer = null; bubble?.remove(); bubble = null; active = false; };
  const show = (atMax: boolean) => {
    if (!bubble) { bubble = doc.createElement("div"); bubble.className = "wl-pal-bubble"; el.appendChild(bubble); }
    const total = signedDelta(b.sign * b.unit * qty);
    bubble.dataset.qty = String(qty);
    bubble.textContent = `×${qty}　合計 ${total.text}c${atMax ? "　最大" : ""}`;
    if (atMax && !flashed) { flashed = true; el.classList.remove("max-flash"); void el.offsetWidth; el.classList.add("max-flash"); }
  };
  const tick = () => {
    steps++;
    const h = holdQuantity(steps, b.max);
    qty = h.qty; show(h.atMax);
    if (!h.atMax) timer = setTimeout(tick, HOLD_STEP_MS);
  };
  el.addEventListener("pointerdown", (e) => {
    if (el.disabled || b.max < 1) return;
    el.setPointerCapture?.(e.pointerId);
    active = true; steps = -1; qty = 1; flashed = false;
    if (!b.noHold) timer = setTimeout(tick, HOLD_START_DELAY_MS);
  });
  el.addEventListener("pointerup", (e) => {
    if (!active) return;
    const r = el.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const q = qty; stop();
    if (inside) run(q);
  });
  el.addEventListener("pointercancel", stop);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  // Keyboard activation (no pointer) = one unit.
  el.addEventListener("click", (e) => { if (e.detail === 0 && !el.disabled) run(1); });
}
