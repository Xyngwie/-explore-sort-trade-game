/**
 * DOCK 物資市場 (canvas stage 1) — purchase model. docs/CANVAS_SHELL_V0.md §5.
 *
 * Uses the existing trade functions (`applyResourceTrade`, `applyContainerBuy`)
 * and the same commit path as the HUD palette: refuse while the play log is
 * busy, name the play-log operation, then exactly one hub save per purchase.
 * Prices and save format are unchanged.
 */
import {
  RESOURCE_BUY_PRICE,
  RESOURCE_IDS,
  RESOURCE_LABEL_JA,
  UNOPENED_CONTAINER_PRICE_CREDITS,
  applyContainerBuy,
  applyResourceTrade,
  containerBuyConfirmText,
  loadHubSaveFromLocalStorage,
  maxContainerBuy,
  maxResourceTrade,
  playLogBlocked,
  saveHubSaveToLocalStorage,
  setPlayLogOperation,
  shortfallText,
  type HubSnapshot,
  type ResourceId,
} from "@estg/shared";

export type MarketItem = ResourceId | "unopened";
export const MARKET_ITEMS: readonly MarketItem[] = [...RESOURCE_IDS, "unopened"];
export const MARKET_SHORT: Record<MarketItem, string> = { ammo: "弾", armor: "装", power: "電", junk: "ジャンク", unopened: "箱" };
export const MARKET_NAME: Record<MarketItem, string> = { ...RESOURCE_LABEL_JA, unopened: "未開封コンテナ" };
export const MARKET_COLOR: Record<MarketItem, string> = { ammo: "#f85149", armor: "#58a6ff", power: "#d4a72c", junk: "#c9d1d9", unopened: "#ffffff" };

/** Quantity buttons (CANVAS-Q2: no HTML number field). CANVAS-D3 (神宮決定 2026-11-04). */
export const QTY_STEPS = [-10, -1, 1, 10] as const;

export function unitPrice(item: MarketItem): number {
  return item === "unopened" ? UNOPENED_CONTAINER_PRICE_CREDITS : RESOURCE_BUY_PRICE;
}
export function stockOf(hub: HubSnapshot | null, item: MarketItem): number {
  if (!hub) return 0;
  const v = item === "unopened" ? hub.unopenedContainers : hub.inventory?.[item];
  return Math.max(0, Math.floor(Number(v) || 0));
}
export function maxBuy(hub: HubSnapshot | null, item: MarketItem): number {
  if (!hub) return 0;
  return item === "unopened" ? maxContainerBuy(hub) : maxResourceTrade(hub, item, "buy");
}
/** Clamp a chosen quantity to 1..max (stays 1 when nothing is affordable). */
export function clampQty(q: number, max: number): number {
  return Math.max(1, Math.min(Math.max(1, Math.floor(max)), Math.floor(Number(q) || 1)));
}
/** CANVAS-D2 (神宮決定 2026-11-04): box purchases confirm every time (§10-6 text); resource buys do not (existing rule). */
export function needsConfirm(item: MarketItem): boolean {
  return item === "unopened";
}
export function confirmText(item: MarketItem, qty: number): string {
  return item === "unopened" ? containerBuyConfirmText(qty) : `${MARKET_NAME[item]}を ${qty} 個購入しますか？（${unitPrice(item) * qty}c）`;
}
export function shortText(hub: HubSnapshot | null, item: MarketItem): string {
  return shortfallText(unitPrice(item), Math.max(0, Math.floor(Number(hub?.credits) || 0)));
}

export type Delta = { label: string; value: number };
export type PurchaseResult =
  | { ok: true; hub: HubSnapshot; deltas: Delta[] }
  | { ok: false; reason: "blocked" | "no_save" | "insufficient" | "save_failed" };

export type MarketDeps = {
  read: () => HubSnapshot | null;
  save: (hub: HubSnapshot) => boolean;
  blocked: () => boolean;
  operation: (kind: string, ctx: { id?: string; quantity: number }) => void;
};
export const browserMarketDeps: MarketDeps = {
  read: () => { try { return loadHubSaveFromLocalStorage()?.hub ?? null; } catch { return null; } },
  save: (hub) => { try { return saveHubSaveToLocalStorage(hub) === true; } catch { return false; } },
  blocked: () => playLogBlocked(),
  operation: (kind, ctx) => setPlayLogOperation(kind, ctx),
};

/**
 * One purchase = one save = one play-log operation (`resource.buy` /
 * `unopened.buy`, the names the HUD palette already records). Always reads the
 * latest save first, so a stale screen cannot overspend.
 */
export function purchase(item: MarketItem, qty: number, deps: MarketDeps = browserMarketDeps): PurchaseResult {
  if (deps.blocked()) return { ok: false, reason: "blocked" };
  const hub = deps.read();
  if (!hub) return { ok: false, reason: "no_save" };
  const q = Math.floor(qty);
  if (!(q >= 1) || q > maxBuy(hub, item)) return { ok: false, reason: "insufficient" };
  const next = item === "unopened" ? applyContainerBuy(hub, q) : applyResourceTrade(hub, item, "buy", q);
  if (!next) return { ok: false, reason: "insufficient" };
  if (item === "unopened") deps.operation("unopened.buy", { quantity: q });
  else deps.operation("resource.buy", { id: item, quantity: q });
  if (!deps.save(next)) return { ok: false, reason: "save_failed" };
  const saved = deps.read() ?? next;
  return {
    ok: true,
    hub: saved,
    deltas: [{ label: "Cr", value: -unitPrice(item) * q }, { label: MARKET_SHORT[item], value: q }],
  };
}

export function failureNotice(reason: Exclude<PurchaseResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "blocked": return "記録の保存中です。保存が終わってからもう一度押してください。";
    case "no_save": return "セーブが見つかりません。既存版の格納庫で開始してください。";
    case "insufficient": return "クレジットが足りません。購入していません。";
    case "save_failed": return "保存できませんでした。購入していません。";
  }
}
