/**
 * Subtle corner keyboard-shortcut overlay for Explore sortie.
 * Includes the manual cover toggle, available near solid obstacles.
 */
import type { ExploreCommandId } from "./commandUnlock";

export const SHORTCUTS_HIDDEN_KEY = "estg.explore.shortcutsHidden";

export const EXPLORE_SHORTCUTS: ReadonlyArray<{
  keys: ReadonlyArray<string>;
  label: string;
  /** Commands issued by this row (hidden when all are locked). Omit → always shown. */
  commands?: ReadonlyArray<ExploreCommandId>;
  /** Per-command key (same order as `commands`); a partly locked row lists only the unlocked keys. */
  commandKeys?: ReadonlyArray<string>;
}> = [
  { keys: ["WASD"], label: "移動", commands: ["move"] },
  { keys: ["Space", "F"], label: "射撃", commands: ["fire"] },
  { keys: ["V"], label: "カバー切替（障害物付近）" },
  { keys: ["E"], label: "回収（任意）", commands: ["collect"] },
  { keys: ["X"], label: "帰還要請", commands: ["extract"] },
  { keys: ["C"], label: "キャンプ", commands: ["camp_set"] },
  { keys: ["U"], label: "荷下ろし", commands: ["camp_unload"] },
  { keys: ["G"], label: "積込", commands: ["camp_pickup"] },
  { keys: ["P"], label: "パージ", commands: ["purge"] },
  { keys: ["1–4"], label: "僚機方針", commands: ["wing_escort", "wing_patrol", "wing_recover", "wing_raid"], commandKeys: ["1", "2", "3", "4"] },
  { keys: ["?"], label: "この表示" },
];

function storage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function isShortcutsOverlayHidden(
  store?: Pick<Storage, "getItem"> | null,
): boolean {
  const s = store ?? storage();
  if (!s) return false;
  try {
    return s.getItem(SHORTCUTS_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setShortcutsOverlayHidden(
  hidden: boolean,
  store?: Pick<Storage, "setItem"> | null,
): void {
  const s = store ?? storage();
  if (!s) return;
  try {
    s.setItem(SHORTCUTS_HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export function buildKeyboardShortcutsOverlayHtml(opts?: {
  hidden?: boolean;
  /**
   * Circuit lock predicate. C20-a (2026-10-07 神宮): locked commands are not
   * shown — a row whose commands are ALL locked is omitted; a partly locked row
   * with `commandKeys` lists only the unlocked keys.
   */
  isLocked?: (id: ExploreCommandId) => boolean;
}): string {
  const hidden = opts?.hidden === true;
  if (hidden) {
    return `<div class="kb-overlay collapsed" id="kb-overlay" role="region" aria-label="キーボードショートカット">
      <button type="button" class="kb-show" id="kb-overlay-toggle" title="ショートカット表示（?）" aria-expanded="false">キー</button>
    </div>`;
  }
  const isLocked = opts?.isLocked;
  const rows = EXPLORE_SHORTCUTS.map((row) => {
    let keys = row.keys;
    if (isLocked != null && row.commands != null && row.commands.length > 0) {
      const open = row.commands.map((id) => !isLocked(id));
      if (open.every((o) => !o)) return "";
      if (row.commandKeys != null && open.some((o) => !o)) {
        keys = row.commandKeys.filter((_, i) => open[i]);
      }
    }
    return `<div class="kb-row"><span class="kb-keys">${keys
      .map((k) => `<kbd>${k}</kbd>`)
      .join("")}</span><span class="kb-label">${row.label}</span></div>`;
  }).join("");
  return `<div class="kb-overlay" id="kb-overlay" role="region" aria-label="キーボードショートカット">
    <div class="kb-head">
      <span class="kb-title">操作</span>
      <button type="button" class="kb-hide" id="kb-overlay-toggle" title="隠す（?）" aria-expanded="true">隠す</button>
    </div>
    <div class="kb-body">${rows}</div>
  </div>`;
}
