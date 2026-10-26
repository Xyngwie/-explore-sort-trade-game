import { BOARD_INPUT } from './boardInput';
/** Release-based touch actions. Mouse never uses long-press flagging. */
export const FLAG_LONG_PRESS_MS=BOARD_INPUT.holdMs;
export function shouldArmFlagLongPress(e:{button:number;pointerType?:string}):boolean {return e.button===0 && (e.pointerType==='touch'||e.pointerType==='pen');}
export function buildFlagOpsGuideHtml(reversed:boolean):string {
 return `<div class="flag-ops-guide" role="note" aria-label="盤面の操作ガイド"><p><strong>タッチ：${reversed?'タップで開く／長押しして離すと旗':'タップで旗／長押しして離すと開く'}</strong>（未開放マスのみ）</p><p>長押しは約${BOARD_INPUT.holdMs/1000}秒。押している間は操作せず、スイープすると盤面移動。ピンチでズーム。広く見ている時のダブルタップでその位置を拡大。</p><p>開いた数字をタップ：周囲の旗数が一致した時だけ周囲開放。反転の影響なし。誤った旗では敵に接触し得ます。</p><p>マウス：左クリックで開く／右クリックで旗。数字で左右同時押しは旗数一致時のみ周囲開放。中ボタンドラッグで移動、ホイールでズーム。マウス長押しで旗は立ちません。</p></div>`;
}
