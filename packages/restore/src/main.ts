import "./style.css";
import {
  CIRCUIT_OUTCOMES,
  createEmptyCircuitBoard,
  edgeCount,
  encodeEdgeState,
  decodeEdgeState,
  type EdgeMark,
} from "@estg/shared";

const root = document.querySelector<HTMLDivElement>("#app")!;

const demo = createEmptyCircuitBoard(8, 8, "scaffold-8");
const marks = decodeEdgeState(demo.edgeState, edgeCount(demo.cols, demo.rows));
// Touch a few edges so encode round-trip is visible in the scaffold UI.
marks[0] = 1;
marks[1] = 2;
marks[2] = 1;
const touchedEnc = encodeEdgeState(marks as EdgeMark[]);
const roundTrip = decodeEdgeState(touchedEnc, marks.length);
const roundOk =
  roundTrip.length === marks.length &&
  roundTrip.every((m, i) => m === marks[i]);

root.innerHTML = `
  <p class="pill">MODULE 5 · RESTORE · SCAFFOLD</p>
  <h1>精密回路修復 — ひな型</h1>
  <p class="muted">Slitherlink 系回路の受け皿。タイマーなし。他モジュールへの URL ハンドオフは未配線。</p>

  <div class="card">
    <table>
      <tr><td>v</td><td>${demo.v}</td></tr>
      <tr><td>cols × rows</td><td>${demo.cols} × ${demo.rows}</td></tr>
      <tr><td>edgeCount</td><td>${edgeCount(demo.cols, demo.rows)}</td></tr>
      <tr><td>puzzleId</td><td>${demo.puzzleId ?? "—"}</td></tr>
      <tr><td>edgeState (empty)</td><td class="mono">${demo.edgeState || "(empty)"}</td></tr>
      <tr><td>edgeState (touched)</td><td class="mono">${touchedEnc}</td></tr>
      <tr><td>encode↔decode</td><td>${roundOk ? "ok" : "fail"}</td></tr>
    </table>
  </div>

  <div class="card">
    <p class="muted">成果状態（ドラフト語彙・未判定）</p>
    <div class="outcomes">
      ${CIRCUIT_OUTCOMES.map(
        (o) =>
          `<div><strong>${o}</strong> <span>— ${
            o === "fully_awakened"
              ? "Fully Awakened"
              : o === "bypass"
                ? "Bypass"
                : "Offline"
          }</span></div>`,
      ).join("")}
    </div>
    <p class="ok" style="margin-top:0.75rem">仕様ドラフト: docs/RESTORE_V0.md</p>
    <p class="warn">制限タイマーは置かない。辺トグル本編は後続スタブ。</p>
  </div>
`;
