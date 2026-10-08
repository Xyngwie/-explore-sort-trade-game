/**
 * 項目5-2 (2026-10-07 神宮, 設計メモ §7.1): the captain's wreck does not end
 * the sortie. Wingmen keep fighting until the player confirms a rescue abort,
 * or until nobody is left alive (then the rescue happens at once, no countdown).
 * Explore does not keep the wallet. The return carries `rescueFeeCredits`
 * and the hub deducts it once per sortieId.
 */
import { loadHubSaveFromLocalStorage, rescueFeeCredits } from "@estg/shared";
import { isWingmanMobileFor } from "./commandUnlock";
import { recoverStrandedDropsAtLiftOff } from "./circuitDrops";
import { recoverStrandedAtLiftOff } from "./lostMechs";
import { dist } from "./math";
import { pushLog } from "./orders";
import type { Unit, World } from "./types";
import { recoverSortieWrecksAtLiftOff, sortieWrecksLeft, sortieWreckUnits } from "./wrecks";

/** Thin ring around the rescue center once the 30s warning is up. Not the boarding circle (green `#3dd68c` / blue `#3d8bfd`). */
export const FORCED_RESCUE_RING = "#c084fc";

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

/** 項目5-2b: timeout with a downed captain charges floor(所持金 × 3 / 4). Same `rescueFee` field. */
function timeoutRescueFeeCredits(credits: number): number {
  const held = Math.max(0, Math.floor(Number(credits) || 0));
  return Math.floor((held * 3) / 4);
}

/**
 * Shared losses of a rescue abort (button or dead-captain timeout).
 * The caller writes the one log line.
 */
function applyRescueLosses(world: World, fee: number): void {
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
}

/**
 * Rescue abort. `credits` is the wallet at this moment (0 when Explore has
 * no HubSave). Living wingmen are left behind. Cargo and the camp site are
 * lost. Wrecks stay where they fell. Fee is floor(所持金 / 2).
 */
export function rescueAbortSortie(world: World, credits: number): "rescued" | "ignored" {
  if (world.phase !== "sortie") return "ignored";
  const fee = rescueFeeCredits(credits);
  const wiped = !world.leader.alive && livingWingmen(world).length === 0;
  applyRescueLosses(world, fee);
  pushLog(world, wiped ? `全滅。救助撤退。救助費用 ${fee}c。` : `救助撤退。救助費用 ${fee}c。`);
  return "rescued";
}

/**
 * 項目5-2b: the clock hit 0 and no boarding circle is in progress.
 * One log line. Alive captain: bring back only what is inside the return
 * radius, no fee, `returnKind` abort (wear 20) without setting `extracted`.
 * Downed captain: the same losses as a rescue abort, fee floor(所持金 × 3 / 4).
 */
export function resolveForcedRescueTimeout(world: World): void {
  if (world.phase !== "sortie") return;
  world.operationTimedOut = true;
  pushLog(world, "時間切れ。強制救助。");
  if (!world.leader.alive) {
    applyRescueLosses(world, timeoutRescueFeeCredits(readHubCredits()));
    return;
  }
  const center = { ...world.leader.pos };
  const radius = world.balance.boardingRadius;
  const circle = { center, radius, requestedAt: world.elapsed, cargoArrived: true };
  const alive = [world.leader, ...world.wingmen].filter((u) => u.alive);
  const outside = alive.filter((u) => dist(u.pos, center) > radius);
  world.leftBehind = outside
    .filter((u) => u.kind === "wingman")
    .map((u) => ({
      id: u.id,
      name: u.name,
      reason: isWingmanMobileFor(world, u.id) ? ("outside_circle" as const) : ("no_circuit" as const),
    }));
  recoverStrandedAtLiftOff(world, circle, true);
  recoverSortieWrecksAtLiftOff(world, circle, true);
  recoverStrandedDropsAtLiftOff(world, circle, true);
  let kept = 0;
  for (const c of world.containers) {
    if (c.taken) continue;
    if (dist(c.pos, center) <= radius) {
      c.taken = true;
      c.discovered = true;
      c.glowT = 0;
      kept += 1;
    }
  }
  for (const u of alive) {
    if (dist(u.pos, center) <= radius) kept += u.salvagedCount;
  }
  if (world.camp && dist(world.camp.pos, center) <= radius) kept += world.camp.stashedCount;
  world.salvaged = kept;
  world.camp = null;
  world.boarding = null;
  world.extracted = false;
  world.failReason = null;
  world.rescueAbort = false;
  world.phase = "result";
}

/** Alive-captain timeout: abort wear, but the in-radius containers stay on the sort handoff. */
export function isAliveForcedRescue(world: World): boolean {
  return (
    world.phase === "result" &&
    world.operationTimedOut &&
    !world.rescueAbort &&
    !world.extracted &&
    world.failReason == null
  );
}

/** 隊長が無事なあいだは撤退ボタンを出さない。 */
export function retreatButtonShown(leaderAlive: boolean): boolean {
  return !leaderAlive;
}

/** 確認: 今の所持金と、半分を切り捨てて引いたあと。 */
export function rescueConfirmCopy(credits: number): string {
  const held = Math.max(0, Math.floor(Number(credits) || 0));
  const fee = rescueFeeCredits(held);
  const after = Math.max(0, held - fee);
  return `救助費用：所持金の半分（今 ${held} c → ${after} c）`;
}

export function previewHeldCredits(): number {
  return readHubCredits();
}

export function previewRescueConfirmCopy(): string {
  return rescueConfirmCopy(readHubCredits());
}

/** Sortie retreat control. Empty while the captain is alive. */
export function sortieRetreatHtml(leaderAlive: boolean, confirming: boolean, credits: number): string {
  if (!retreatButtonShown(leaderAlive)) return "";
  if (confirming) {
    return `<span class="rescue-confirm" id="rescue-confirm">${escapeText(rescueConfirmCopy(credits))}<button type="button" id="btn-rescue-yes">撤退</button><button type="button" class="secondary" id="btn-rescue-no">やめる</button></span>`;
  }
  return `<button type="button" id="btn-rescue">救助撤退</button>`;
}

export function leaderDownBannerHtml(world: World): string {
  if (world.phase !== "sortie" || world.leader.alive) return "";
  return `<div class="timeout-lock-banner" id="leader-down-banner" role="status" aria-live="polite"><span>隊長機大破 — 撤退できます（救助費用：所持金の半分）</span><span class="defense-note">時間切れまで待つと、救助費用は所持金の¾</span></div>`;
}

/** 残り 30 秒の帯。時間切れのあとは出さない。 */
export function forcedRescueWarningHtml(world: World): string {
  if (world.phase !== "sortie" || world.operationTimedOut) return "";
  if (!(world.timeLeft > 0 && world.timeLeft <= 30)) return "";
  return `<div class="timeout-lock-banner" id="forced-rescue-warning" role="status" aria-live="polite">あと30秒で強制救助</div>`;
}

/** 30 秒で赤、10 秒から大きく。時間切れの「0.0s · 時間切れ」表示は使わない。 */
export function hudTimePresentation(world: World): { text: string; className: string } {
  const text = `${world.timeLeft.toFixed(1)}s`;
  if (world.phase !== "sortie" || world.timeLeft > 30) return { text, className: "" };
  return { text, className: world.timeLeft <= 10 ? "timed-out time-critical" : "timed-out" };
}

/** Warning ring: boarding-circle center when one is out, otherwise the captain. Radius is the return circle. */
export function forcedRescueRing(world: World): { center: { x: number; y: number }; radius: number } | null {
  if (world.phase !== "sortie" || world.timeLeft > 30) return null;
  const center = world.boarding ? { ...world.boarding.center } : { ...world.leader.pos };
  return { center, radius: world.balance.boardingRadius };
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
  const fee = Math.max(0, Math.floor(world.rescueFeeCredits ?? 0));
  const feeLine = world.operationTimedOut ? `救助費用 ${fee}c（所持金の¾）` : `救助費用 ${fee}c`;
  const lines = [feeLine];
  if (world.rescueLostCargo) lines.push("積荷を失った");
  if (world.rescueLostCamp) lines.push("キャンプの置場を失った");
  const summary = rescueWreckSummary(world);
  if (summary) lines.push(summary);
  const loc = world.sortieLocation ?? null;
  if (loc) lines.push(`場所：Invade (${loc.cell.sx}, ${loc.cell.sy})`);
  return lines;
}

/** Alive-captain timeout: what came home, what stayed, and the place. */
export function forcedRescueAliveLines(world: World): string[] {
  if (!isAliveForcedRescue(world)) return [];
  const leftIds = new Set((world.leftBehind ?? []).map((e) => e.id));
  const returned = [world.leader, ...world.wingmen].filter((u) => u.alive && !leftIds.has(u.id));
  const recovered = new Set(world.recoveredWreckUnitIds ?? []);
  const wrecksBack = sortieWreckUnits(world).filter((u) => recovered.has(u.id));
  const wrecksLeft = sortieWrecksLeft(world);
  const loc = world.sortieLocation ?? null;
  const where = loc ? `Invade (${loc.cell.sx}, ${loc.cell.sy}) に残る` : "回路ごと失われる";
  const lines = [`回収：${returned.map((u) => (u.kind === "leader" ? "隊長" : u.name)).join("・") || "なし"}`];
  if (wrecksBack.length > 0) {
    lines.push(`回収：残骸 ${wrecksBack.map((u) => (u.kind === "leader" ? "隊長機" : u.name)).join("・")}`);
  }
  lines.push(`回収：コンテナ ${world.salvaged}`);
  const stayed = [
    ...(world.leftBehind ?? []).map((e) => e.name),
    ...wrecksLeft.map((u) => `残骸 ${u.kind === "leader" ? "隊長機" : u.name}`),
  ];
  if (stayed.length > 0) lines.push(`残したもの：${stayed.join("・")} — ${where}`);
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

export function forcedRescueAliveHtml(world: World): string {
  const lines = forcedRescueAliveLines(world);
  if (lines.length === 0) return "";
  return `<ul class="rescue" id="result-forced-rescue">${lines.map((l) => `<li>${escapeText(l)}</li>`).join("")}</ul>`;
}

/**
 * Result heading when 5-2 changes it. Null keeps today's 「生還」／「失敗」.
 * T22: a wreck recovered by a boarding circle that was already out is a free
 * return, with no rescue-fee line.
 */
export function resultHeading(world: World): string | null {
  if (world.rescueAbort && world.operationTimedOut) return "強制救助（隊長大破・時間切れ）";
  if (world.rescueAbort) return "救助撤退";
  if (isAliveForcedRescue(world)) return "強制救助（時間切れ）";
  if (world.extracted && !world.leader.alive) return "帰還成功（隊長の残骸を回収）";
  return null;
}
