/**
 * Touch-friendly flag plant helpers for Invade minesweeper board.
 * PC right-click remains; touch uses long-press and/or flag-mode toggle.
 */

/** Hold duration (ms) before a closed cell toggles flag on touch/pen/mouse. */
export const FLAG_LONG_PRESS_MS = 480;

/** Short JA operation guide under the board actions. */
export function buildFlagOpsGuideHtml(flagMode: boolean): string {
  const modeNote = flagMode
    ? "旗モード ON — タップで旗トグル（開かない）"
    : "旗モード OFF — タップで開く／焦点";
  return `<div class="flag-ops-guide" role="note" aria-label="旗の操作ガイド">
    <p class="flag-ops-title">旗の立て方</p>
    <ul class="flag-ops-list">
      <li><strong>長押し</strong>（約0.5秒）— タッチ／ペン／マウスで旗トグル</li>
      <li><strong>旗モード</strong>ボタン — ${modeNote}</li>
      <li><strong>右クリック</strong> — PC でも旗トグル可</li>
    </ul>
  </div>`;
}

/**
 * Decide whether a pointer should arm long-press flag.
 * Primary button only; ignore secondary (context menu handles that).
 */
export function shouldArmFlagLongPress(ev: {
  button: number;
  pointerType?: string;
}): boolean {
  if (ev.button !== 0) return false;
  return true;
}
