/**
 * Subtle corner keyboard-shortcut overlay for Explore sortie.
 * Lists only keys that remain player-facing after cover became object-based.
 */
import type { ExploreCommandId } from "./commandUnlock";

export const SHORTCUTS_HIDDEN_KEY = "estg.explore.shortcutsHidden";

export const EXPLORE_SHORTCUTS: ReadonlyArray<{
  keys: ReadonlyArray<string>;
  label: string;
  /** Commands issued by this row (for circuit lock display). Omit → never locked. */
  commands?: ReadonlyArray<ExploreCommandId>;
}> = [
  { keys: ["WASD"], label: "移動", commands: ["move"] },
  { keys: ["Space", "F"], label: "射撃", commands: ["fire"] },
  { keys: ["E"], label: "回収（任意）", commands: ["collect"] },
  { keys: ["X"], label: "抽出要請", commands: ["extract"] },
  { keys: ["C"], label: "キャンプ", commands: ["camp_set"] },
  { keys: ["U"], label: "荷下ろし", commands: ["camp_unload"] },
  { keys: ["G"], label: "積込", commands: ["camp_pickup"] },
  { keys: ["P"], label: "パージ", commands: ["purge"] },
  { keys: ["1–4"], label: "僚機方針", commands: ["wing_escort", "wing_patrol", "wing_recover", "wing_raid"] },
  { keys: ["?"], label: "この表示" },
];

/**
 * Cover is now entered only by physically reaching a cover object.
 * Keep the legacy V/button UI from invoking the old global toggle while the
 * legacy handler remains in main.ts. This guard can be removed once that
 * handler is deleted in the follow-up cleanup.
 */
function installLegacyCoverUiGuard(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key.toLowerCase() !== "v") return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  const hideLegacyButton = (): void => {
    document.getElementById("btn-cover")?.remove();
  };

  hideLegacyButton();
  const observer = new MutationObserver(hideLegacyButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

installLegacyCoverUiGuard();

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
  /** Circuit lock predicate; a row is shown locked when ALL its commands are locked. */
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
    const locked =
      isLocked != null &&
      row.commands != null &&
      row.commands.length > 0 &&
      row.commands.every((id) => isLocked(id));
    const cls = locked ? "kb-row locked" : "kb-row";
    const label = locked ? `🔒 ${row.label}（回路）` : row.label;
    return `<div class="${cls}"><span class="kb-keys">${row.keys
      .map((k) => `<kbd>${k}</kbd>`)
      .join("")}</span><span class="kb-label">${label}</span></div>`;
  }).join("");
  return `<div class="kb-overlay" id="kb-overlay" role="region" aria-label="キーボードショートカット">
    <div class="kb-head">
      <span class="kb-title">操作</span>
      <button type="button" class="kb-hide" id="kb-overlay-toggle" title="隠す（?）" aria-expanded="true">隠す</button>
    </div>
    <div class="kb-body">${rows}</div>
  </div>`;
}
