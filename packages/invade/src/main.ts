import "./style.css";
import {
  SECTOR_FRONT_DISTANCE,
  SECTOR_WALL_DISTANCE,
  sectorDensityAt,
} from "@estg/shared";

const root = document.querySelector<HTMLDivElement>("#app")!;

/** Tiny 5×5 preview centered on HQ (scaffold only — no selection / handoff). */
function previewGridHtml(): string {
  const half = 2;
  const cells: string[] = [];
  for (let y = half; y >= -half; y--) {
    for (let x = -half; x <= half; x++) {
      if (x === 0 && y === 0) {
        cells.push(`<div class="cell hq" title="HQ">HQ</div>`);
        continue;
      }
      const info = sectorDensityAt(x, y);
      const label = info.blocked ? "壁" : info.density.toFixed(1);
      cells.push(
        `<div class="cell ring" title="(${x},${y}) d=${info.distance}">${label}</div>`,
      );
    }
  }
  return `<div class="grid">${cells.join("")}</div>`;
}

const sample = sectorDensityAt(10, 0);
const wall = sectorDensityAt(12, 0);

root.innerHTML = `
  <p class="pill">MODULE 4 · INVADE / FRONT · SCAFFOLD</p>
  <h1>戦線マップ — ひな型</h1>
  <p class="muted">HQ 中心の Chebyshev 密度プレースホルダのみ。探索・ソート・トレードへの URL ハンドオフは未配線。</p>

  <div class="card">
    <p class="muted">5×5 プレビュー（中央 = HQ）。数値は仮 density（壁セルは「壁」）。</p>
    ${previewGridHtml()}
  </div>

  <div class="card">
    <table>
      <tr><td>フロント目安 d</td><td>${SECTOR_FRONT_DISTANCE}</td></tr>
      <tr><td>壁 d</td><td>≥ ${SECTOR_WALL_DISTANCE}</td></tr>
      <tr><td>サンプル (10,0)</td><td>d=${sample.distance} · density=${sample.density.toFixed(2)} · blocked=${String(sample.blocked)}</td></tr>
      <tr><td>サンプル (12,0)</td><td>d=${wall.distance} · blocked=${String(wall.blocked)}</td></tr>
    </table>
    <p class="ok" style="margin-top:0.75rem">仕様ドラフト: docs/INVADE_V0.md</p>
    <p class="warn">報酬はインテル／ルート想定。本 salvage の二重払いはしない。quick-battle スキップ方針あり（未実装）。</p>
  </div>
`;
