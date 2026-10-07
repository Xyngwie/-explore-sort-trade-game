/**
 * Camp-related sortie texts (2026-10-07 神宮): while camp is NOT unlocked
 * (`camp_set` locked per `isCommandUnlockedFor`), the player sees no camp text:
 *   - the top HUD status 「キャンプ 未設置」 is not rendered,
 *   - the help sentence 「時間切れ後はキャンプ防衛フォーカス（…）」 is dropped,
 *   - the time-up banner shows just 「時間切れ」 (no 「キャンプ防衛モード」 etc.).
 * With camp unlocked (all-unlocked preview) the texts are the same as before.
 */
import type { ExploreCommandId } from "./commandUnlock";
import { campDefenseHudModel, campDrHudFragment } from "./orders";
import type { World } from "./types";

export type CommandLockedFn = (id: ExploreCommandId) => boolean;

/** Camp texts follow the camp command (`camp_set`). */
export function isCampUnlocked(isLocked: CommandLockedFn): boolean {
  return !isLocked("camp_set");
}

/** Top HUD camp status, or null when camp is locked (the HUD item is not rendered). */
export function campHudText(world: World, campUnlocked: boolean): string | null {
  if (!campUnlocked) return null;
  if (!world.camp) return "キャンプ 未設置";
  return world.camp.stashedCount > 0
    ? `キャンプ 置場${world.camp.stashedCount}·防衛 ${campDrHudFragment(world)}`
    : `キャンプ 置場${world.camp.stashedCount}`;
}

/** Help sentence about time-up camp defense ("" when camp is locked). */
export function timeUpHelpSentence(campUnlocked: boolean): string {
  return campUnlocked ? "時間切れ後はキャンプ防衛フォーカス（移動ロック・戦闘継続）。" : "";
}

/** Time-up banner HTML ("" before time-up). Camp locked → just 「時間切れ」. */
export function timeoutLockBannerHtmlFor(world: World, campUnlocked: boolean): string {
  const model = campDefenseHudModel(world);
  if (!model.active) return "";
  if (!campUnlocked) {
    return `<div class="timeout-lock-banner camp-defense" id="timeout-lock-banner" role="status" aria-live="polite">
    <strong>時間切れ</strong>
  </div>`;
  }
  const boardingNote = world.boarding
    ? "進行中の搭乗円は継続（円内なら離昇可）。"
    : "円外なら移動不可のため新規の帰還要請は不可 — キャンプ防衛／カバー／撤退で決着。";
  return `<div class="timeout-lock-banner camp-defense" id="timeout-lock-banner" role="status" aria-live="polite">
    <strong>${model.title}</strong>
    <span>時間切れ · 移動・積み下ろしロック · 戦闘継続</span>
    <span class="defense-focus">${model.stockLine} · ${model.coverHint}</span>
    <span class="defense-note">${boardingNote}</span>
  </div>`;
}

/** Briefing (pre-sortie) help line — camp keys only while unlocked (C20-a: locked commands are not shown). */
export function briefingHelpText(isLocked: CommandLockedFn): string {
  const items: Array<[ExploreCommandId | null, string]> = [
    [null, "WASD 移動"],
    [null, "クリック移動"],
    [null, "Space/F 射撃"],
    [null, "発見コンテナ上で自動回収（E 任意）"],
    [null, "X 帰還要請"],
    ["camp_set", "C キャンプ設置"],
    ["camp_unload", "U 荷下ろし"],
    ["camp_pickup", "G キャンプから積込"],
    [null, "V カバー"],
    [null, "右パネルで僚機命令（画面外も可）"],
  ];
  return items.filter(([id]) => id == null || !isLocked(id)).map(([, t]) => t).join(" · ");
}
