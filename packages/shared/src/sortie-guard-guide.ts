/**
 * Sortie-guard guidance（暫定 ★・FULLSCREEN_SHELL_V0 §16）.
 * When Explore's briefing refuses 出撃 and the player goes back to HUB, the HUB
 * shows one banner saying what is missing and a button to the place that fixes it.
 * Reads the save only; nothing is written (session flag lives in sessionStorage).
 */
import type { HubSnapshot } from "./hub-save";
import { firstSortieError } from "./onboarding";
import { squadEquipmentError } from "./invade-rank";
import { isCircuitRestoreStateActive } from "./circuit-board";

export type SortieGuardCode = "first_circuit_unrepaired" | "first_circuit_unequipped" | "first_leader" | "squad_full" | "category_full";
export type SortieGuardGuide = { code: SortieGuardCode; text: string; action: string; target: string };

/** sessionStorage flag set by Explore's 格納庫へ link（暫定 ★: banner only after a guard return）. */
export const SORTIE_GUARD_RETURN_KEY = "estg.sortieGuardReturn";

export function sortieGuardGuide(hub: HubSnapshot, ids: readonly string[]): SortieGuardGuide | null {
  const leaderId = ids[0] ?? null;
  if (firstSortieError(hub, leaderId)) {
    const intro = hub.newGameIntro!;
    if (!leaderId) return { code: "first_leader", text: "出撃する隊長機が選ばれていません。", action: "格納庫へ移動", target: "hub-anchor-reserve" };
    const crafted = hub.circuits.filter((c) => intro.craftedCircuitIds.includes(c.circuitId) && c.origin === "crafted");
    const repaired = crafted.some((c) => isCircuitRestoreStateActive(c.restoreState));
    return repaired
      ? { code: "first_circuit_unequipped", text: "回路が未装備です。修復済みの回路を隊長機に装備してください。", action: "回路を装備する", target: "hub-anchor-circuits" }
      : { code: "first_circuit_unrepaired", text: "回路が未装備です。1×1回路を作成・修復して隊長機に装備してください。", action: "修復へ移動", target: "hub-anchor-circuits" };
  }
  const e = squadEquipmentError(hub, ids);
  if (e === "squad_full") return { code: e, text: "出撃部隊の回路上限を超えています。", action: "回路欄へ移動", target: "hub-anchor-circuits" };
  if (e === "category_full") return { code: e, text: "同じ種類の回路を付けすぎています。", action: "回路欄へ移動", target: "hub-anchor-circuits" };
  return null;
}

export function sortieGuardBannerHtml(g: SortieGuardGuide): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<div class="card warn" id="sortie-guard-guide" role="status" data-guard="${g.code}"><p style="margin:0 0 .5rem">${esc(g.text)}</p><div class="row"><button type="button" id="sortie-guard-go" data-target="${g.target}">${esc(g.action)}</button> <button type="button" class="secondary" id="sortie-guard-close" aria-label="閉じる">✕</button></div></div>`;
}
