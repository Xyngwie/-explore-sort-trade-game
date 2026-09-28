/**
 * Restore entry. Large v2 Perfect boards (N ≥ 15) run a uniqueness search
 * while the app bootstraps; paint a 「生成中…」 notice first, then load the
 * app on the next frame so the page never appears frozen. Other boards load
 * the app immediately.
 */
import "./style.css";
import "./board-spacing.css";
import { slowPerfectBoardSide } from "./session";

const root = document.querySelector<HTMLDivElement>("#app")!;
const slowSide = slowPerfectBoardSide(window.location.search);

function loadApp(): void {
  void import("./app");
}

if (slowSide != null) {
  root.innerHTML = `
    <div class="card generating-notice" role="status" aria-live="polite">
      <p class="generating-title">生成中…</p>
      <p class="muted">${slowSide}×${slowSide} のパーフェクト基板を生成しています。大きい盤は少し時間がかかります。</p>
    </div>
  `;
  // rAF → setTimeout: the notice is painted before generation blocks the thread.
  requestAnimationFrame(() => setTimeout(loadApp, 0));
} else {
  loadApp();
}
