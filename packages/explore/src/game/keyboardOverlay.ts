/**
 * Subtle corner keyboard-shortcut overlay for Explore sortie.
 * Lists only keys wired in main.ts input handlers.
 */

export const SHORTCUTS_HIDDEN_KEY = "estg.explore.shortcutsHidden";

/** Keys actually handled in Explore (see main.ts keydown / syncMoveFromKeys). */
export const EXPLORE_SHORTCUTS: ReadonlyArray<{
  keys: ReadonlyArray<string>;
  label: string;
}> = [
  { keys: ["WASD"], label: "移動" },
  { keys: ["Space", "F"], label: "射撃" },
  { keys: ["E"], label: "回収（任意）" },
  { keys: ["X"], label: "抽出要請" },
  { keys: ["C"], label: "キャンプ" },
  { keys: ["U"], label: "荷下ろし" },
  { keys: ["G"], label: "積込" },
  { keys: ["P"], label: "パージ" },
  { keys: ["V"], label: "カバー" },
  { keys: ["1–4"], label: "僚機方針" },
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
}): string {
  const hidden = opts?.hidden === true;
  if (hidden) {
    return `<div class="kb-overlay collapsed" id="kb-overlay" role="region" aria-label="キーボードショートカット">
      <button type="button" class="kb-show" id="kb-overlay-toggle" title="ショートカット表示（?）" aria-expanded="false">キー</button>
    </div>`;
  }
  const rows = EXPLORE_SHORTCUTS.map(
    (row) =>
      `<div class="kb-row"><span class="kb-keys">${row.keys
        .map((k) => `<kbd>${k}</kbd>`)
        .join("")}</span><span class="kb-label">${row.label}</span></div>`,
  ).join("");
  return `<div class="kb-overlay" id="kb-overlay" role="region" aria-label="キーボードショートカット">
    <div class="kb-head">
      <span class="kb-title">操作</span>
      <button type="button" class="kb-hide" id="kb-overlay-toggle" title="隠す（?）" aria-expanded="true">隠す</button>
    </div>
    <div class="kb-body">${rows}</div>
  </div>`;
}
