/**
 * Four-resource trade + HUD palette logic (docs/FULLSCREEN_SHELL_V0.md §8, PR2b).
 * Prices are the existing fixed DOCK card prices (unchanged). Trades move the
 * total stock (`inventory`) only — never a mech's loaded ammo.
 */
import { RESOURCE_IDS, type ResourceId } from "./sort-yield";
import { addUnopenedContainers, normalizeHubSnapshot, type HubSnapshot } from "./hub-save";
import { UNOPENED_CONTAINER_PRICE_CREDITS } from "./constants";

export const RESOURCE_SELL_PRICE = 5;
export const RESOURCE_BUY_PRICE = 6;
export type TradeAction = "buy" | "sell";
export const PALETTE_RESOURCE_IDS: readonly ResourceId[] = RESOURCE_IDS;

/* Long-press (decided 神宮 2026-11-01; kept as constants). */
export const HOLD_START_DELAY_MS = 400;
export const HOLD_STEP_MS = 100;
export const HOLD_STEPS_PER_TIER = 10;

const n0 = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
export function resourceStock(hub: Pick<HubSnapshot, "inventory">, id: ResourceId): number {
  return n0(hub.inventory?.[id]);
}
/** Max units one trade can move now (buy: what Cr buys; sell: stock). */
export function maxResourceTrade(hub: Pick<HubSnapshot, "credits" | "inventory">, id: ResourceId, action: TradeAction): number {
  return action === "sell" ? resourceStock(hub, id) : Math.floor(n0(hub.credits) / RESOURCE_BUY_PRICE);
}
export function maxContainerBuy(hub: Pick<HubSnapshot, "credits">): number {
  return Math.floor(n0(hub.credits) / UNOPENED_CONTAINER_PRICE_CREDITS);
}
/** Cr change of a trade (sell +, buy −). */
export function resourceTradeCredits(action: TradeAction, qty: number): number {
  return action === "sell" ? RESOURCE_SELL_PRICE * qty : -RESOURCE_BUY_PRICE * qty;
}
/**
 * The one resource trade. qty=1 is byte-identical to the pre-PR2b DOCK card
 * (key deleted when it reaches 0). Returns null when it cannot run (no partial trade).
 */
export function applyResourceTrade<H extends HubSnapshot>(hub: H, id: ResourceId, action: TradeAction, qty = 1): H | null {
  const q = Math.floor(qty);
  if (!RESOURCE_IDS.includes(id) || !(q >= 1)) return null;
  const current = resourceStock(hub, id);
  const inventory = { ...hub.inventory };
  if (action === "sell") {
    if (current < q) return null;
    if (current === q) delete inventory[id];
    else inventory[id] = current - q;
    return { ...hub, credits: hub.credits + RESOURCE_SELL_PRICE * q, inventory };
  }
  if (hub.credits < RESOURCE_BUY_PRICE * q) return null;
  inventory[id] = current + q;
  return { ...hub, credits: hub.credits - RESOURCE_BUY_PRICE * q, inventory };
}
/** Container buy shared with DOCK `buyUnopenedContainers` (same math). */
export function applyContainerBuy(hub: HubSnapshot, qty = 1): HubSnapshot | null {
  const n = Math.max(1, Math.floor(qty));
  const cost = UNOPENED_CONTAINER_PRICE_CREDITS * n;
  const credits = Math.floor(Number(hub.credits) || 0);
  if (credits < cost) return null;
  return addUnopenedContainers(normalizeHubSnapshot({ ...hub, credits: credits - cost }), n);
}
/** Q9: every sell confirms (palette and DOCK card share this text). */
export function resourceSellConfirmText(label: string, qty: number): string {
  return `売却しますか？\n${label} ×${qty}\n+${RESOURCE_SELL_PRICE * qty}c（売値 ${RESOURCE_SELL_PRICE}c）`;
}
/**
 * Hold quantity after `steps` ticks: 1..10, 20..100, 200..1000, …
 * (per tier `HOLD_STEPS_PER_TIER`), clamped to `max`.
 */
export function holdQuantity(steps: number, max: number, perTier = HOLD_STEPS_PER_TIER): { qty: number; atMax: boolean } {
  const m = n0(max);
  if (m < 1) return { qty: 0, atMax: true };
  let q = 1, unit = 1;
  for (let i = 0; i < Math.max(0, Math.floor(steps)); i++) {
    if (q >= unit * perTier) unit *= perTier;
    q += unit;
    if (q >= m) break;
  }
  return q >= m ? { qty: m, atMax: true } : { qty: q, atMax: false };
}
/** #300 signs: + / − (U+2212) / ±0. */
export function signedDelta(v: number): { text: string; cls: "gain" | "spend" | "zero" } {
  if (v > 0) return { text: `+${v}`, cls: "gain" };
  if (v < 0) return { text: `\u2212${-v}`, cls: "spend" };
  return { text: "±0", cls: "zero" };
}
/** '要 Xc / 持 Yc' line for an unaffordable buy. */
export function shortfallText(need: number, have: number): string {
  return `要 ${need}c / 持 ${n0(have)}c`;
}
