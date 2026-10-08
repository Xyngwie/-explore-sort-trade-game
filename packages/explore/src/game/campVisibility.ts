/**
 * Camp-related sortie texts (2026-10-07 神宮): while camp is NOT unlocked
 * (`camp_set` locked per `isCommandUnlockedFor`), the player sees no camp text:
 *   - the top HUD status 「キャンプ 未設置」 is not rendered,
 *   - the help sentence about time-up camp defense is not shown,
 *   - there is no time-up lock banner (項目5-2b removed camp defense).
 * With camp unlocked (all-unlocked preview) the camp status line is unchanged.
 */
import type { ExploreCommandId } from "./commandUnlock";
import { campDrHudFragment } from "./orders";
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

/**
 * Help sentence about time-up camp defense. 項目5-2b removed that mode,
 * so this is empty whether camp is unlocked or not.
 */
export function timeUpHelpSentence(_campUnlocked: boolean): string {
  return "";
}

/** Time-up lock banner. 項目5-2b removed it (the 30s warning is separate). */
export function timeoutLockBannerHtmlFor(_world: World, _campUnlocked: boolean): string {
  return "";
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
