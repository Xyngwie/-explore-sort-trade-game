import { BOARD_INPUT } from './boardInput';
/** Release-based touch actions. Mouse never uses long-press flagging. */
export const FLAG_LONG_PRESS_MS=BOARD_INPUT.holdMs;
export function shouldArmFlagLongPress(e:{button:number;pointerType?:string}):boolean {return e.button===0 && (e.pointerType==='touch'||e.pointerType==='pen');}
export function buildFlagOpsGuideHtml(reversed:boolean):string {
 return `<div class="flag-ops-guide" role="note" aria-label="盤面の操作ガイド"><p><strong>タッチ：${reversed?'タップで開く／長押しして離すとマーク':'タップでマーク／長押しして離すと開く'}</strong>（未開放マスのみ）</p><p>長押しは${BOARD_INPUT.holdMs}msで予告、離すと確定。元のマスを外れるスイープですぐ盤面移動。ピンチでズーム。広域表示のダブルタップでその位置を拡大。「拠点へ」で視点を戻せます。</p><p>開いた数字をタップ：斥候が感知した周囲の敵数とマーク数が一致した時だけ周囲開放。反転の影響なし。推定が誤っていれば敵に接触し得ます。</p><p>マウス：左クリックで開く／右クリック・Ctrl＋左クリックで敵位置をマーク・マーク解除。数字で左右同時押しはマーク数一致時のみ周囲開放。中ボタンドラッグで移動、ホイールでズーム。マウス長押しはマーク操作になりません。</p></div>`;
}
