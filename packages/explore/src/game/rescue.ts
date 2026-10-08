/**
 * 項目5-2 (2026-10-07 神宮, 設計メモ §7.1): the captain's wreck does not end
 * the sortie. Wingmen keep fighting until the player confirms a rescue abort,
 * or until nobody is left alive (then the rescue happens at once, no countdown).
 * Explore does not keep the wallet. The return carries `rescueFeeCredits`
 * and the hub deducts it once per sortieId.
 */
import { loadHubSaveFromLocalStorage, rescueFeeCredits } from "@estg/shared";
import { pushLog } from "./orders";
import type { Unit, World } from "./types";
import { sortieWrecksLeft } from "./wrecks";

export { rescueFeeCredits };

function readHubCredits(): number {
  try {
    const loaded = loadHubSaveFromLocalStorage();
    return Math.max(0, Math.floor(Number(loaded?.hub?.credits) || 0));
  } catch {
    return 0;
  }
}

/** Credits the confirm dialog and the auto rescue should charge. */
export function previewRescueFee(): number {
  return rescueFeeCredits(readHubCredits());
}

/** Rescue using the wallet in HubSave (0 when there is no save here). */
export function rescueAbortFromHub(world: World): "rescued" | "ignored" {
  return rescueAbortSortie(world, readHubCredits());
}

function livingWingmen(world: World): Unit[] {
  return world.wingmen.filter((w) => w.alive);
}

/** First tick after the captain falls: the sortie goes on. */
export function noteLeaderDown(world: World): void {
  if (world.leader.alive || world.leaderDownNoted) return;
  world.leaderDownNoted = true;
  pushLog(world, "隊長機大破。僚機は戦闘を続ける。救助撤退できます。");
}

/**
 * Rescue abort. `credits` is the wallet at this moment (0 when Explore has
 * no HubSave). Living wingmen are left behind. Cargo and the camp site are
 * lost. Wrecks stay where they fell.
 */
export function rescueAbortSortie(world: World, credits: number): "rescued" | "ignored" {
  if (world.phase !== "sortie") return "ignored";
  const fee = rescueFeeCredits(credits);
  const wiped = !world.leader.alive && livingWingmen(world).length === 0;
  world.leftBehind = livingWingmen(world).map((u) => ({
    id: u.id,
    name: u.name,
    reason: "rescue" as const,
  }));
  world.rescueLostCargo =
    world.salvaged > 0 ||
    world.containers.some((c) => c.taken) ||
    world.wingmen.some((w) => w.salvagedCount > 0) ||
    world.leader.salvagedCount > 0 ||
    (world.camp?.stashedCount ?? 0) > 0;
  world.rescueLostCamp = world.camp != null;
  world.salvaged = 0;
  world.camp = null;
  world.boarding = null;
  world.extracted = false;
  world.failReason = null;
  world.rescueAbort = true;
  world.rescueFeeCredits = fee;
  world.phase = "result";
  pushLog(world, wiped ? `全滅。救助撤退。救助費用 ${fee}c。` : `救助撤退。救助費用 ${fee}c。`);
  return "rescued";
}

/** 6A: nobody left alive → rescue immediately. No countdown. */
export function maybeAutoRescue(world: World): boolean {
  if (world.phase !== "sortie" || world.leader.alive) return false;
  if (livingWingmen(world).length > 0) return false;
  return rescueAbortSortie(world, readHubCredits()) === "rescued";
}

function wreckCircuitCount(world: World, units: readonly Unit[]): number {
  let n = 0;
  for (const u of units) n += (world.circuitIdsByUnit[u.id] ?? []).length;
  return n;
}

/** Q15: one line for the wrecks this rescue leaves behind. */
export function rescueWreckSummary(world: World): string | null {
  if (!world.rescueAbort) return null;
  const left = sortieWrecksLeft(world);
  const leader = left.some((u) => u.kind === "leader");
  const wings = left.filter((u) => u.kind === "wingman").length;
  const who = [leader ? "隊長機" : null, wings > 0 ? `僚機${wings}機` : null].filter(Boolean).join("・");
  const loc = world.sortieLocation ?? null;
  const where = loc ? `Invade (${loc.cell.sx}, ${loc.cell.sy}) に残る` : "回路ごと失われる";
  return `残骸：${who || "なし"}（回路${wreckCircuitCount(world, left)}枚）— ${where}`;
}

/** Result-screen lines for a rescue abort. Empty when this ending is not one. */
export function rescueResultLines(world: World): string[] {
  if (!world.rescueAbort) return [];
  const lines = [`救助費用 ${Math.max(0, Math.floor(world.rescueFeeCredits ?? 0))}c`];
  if (world.rescueLostCargo) lines.push("積荷を失った");
  if (world.rescueLostCamp) lines.push("キャンプの置場を失った");
  const summary = rescueWreckSummary(world);
  if (summary) lines.push(summary);
  const loc = world.sortieLocation ?? null;
  if (loc) lines.push(`場所：Invade (${loc.cell.sx}, ${loc.cell.sy})`);
  return lines;
}

function escapeText(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function rescueResultHtml(world: World): string {
  const lines = rescueResultLines(world);
  if (lines.length === 0) return "";
  return `<ul class="rescue" id="result-rescue">${lines.map((l) => `<li>${escapeText(l)}</li>`).join("")}</ul>`;
}

/**
 * Result heading when 5-2 changes it. Null keeps today's 「生還」／「失敗」.
 * T22: a wreck recovered by a boarding circle that was already out is a free
 * return, with no rescue-fee line.
 */
export function resultHeading(world: World): string | null {
  if (world.rescueAbort) return "救助撤退";
  if (world.extracted && !world.leader.alive) return "帰還成功（隊長の残骸を回収）";
  return null;
}
