import "./style.css";
import {
  SECTOR_FRONT_DISTANCE,
  SECTOR_WALL_DISTANCE,
  sectorDensityAt,
  type SectorDensityInfo,
} from "@estg/shared";

/** Half-extent of the AOI around HQ (coords −AOI_HALF … +AOI_HALF). */
const AOI_HALF = 10;

type SectorSel = { sx: number; sy: number };

const root = document.querySelector<HTMLDivElement>("#app")!;

/** UI-only route selection — no handoff URL. */
let selected: SectorSel | null = null;
/** Inert skip flag (quick-battle wording only). */
let skipped = false;

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Map density 0..1 → CSS color (cool → hot). Blocked = wall slate. */
function densityStyle(info: SectorDensityInfo): string {
  if (info.blocked) return "background:#3d2a2a;border-color:#8b4545;color:#f85149";
  const t = info.density;
  const r = Math.round(20 + t * 180);
  const g = Math.round(40 + (1 - t) * 60);
  const b = Math.round(80 + (1 - t) * 40);
  const fg = t > 0.55 ? "#fff" : "#c9d1d9";
  return `background:rgb(${r},${g},${b});border-color:rgba(255,255,255,0.12);color:${fg}`;
}

function cellLabel(sx: number, sy: number, info: SectorDensityInfo): string {
  if (sx === 0 && sy === 0) return "HQ";
  if (info.blocked) return "壁";
  return info.distance.toString();
}

function render(): void {
  const cols = AOI_HALF * 2 + 1;
  const cells: string[] = [];
  for (let y = AOI_HALF; y >= -AOI_HALF; y--) {
    for (let x = -AOI_HALF; x <= AOI_HALF; x++) {
      const info = sectorDensityAt(x, y);
      const isHq = x === 0 && y === 0;
      const isSel =
        selected != null && selected.sx === x && selected.sy === y;
      const cls = [
        "cell",
        isHq ? "hq" : "",
        info.blocked ? "blocked" : "pickable",
        isSel ? "selected" : "",
        !info.blocked && info.distance >= SECTOR_FRONT_DISTANCE ? "front" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const title = isHq
        ? "HQ (0,0)"
        : `(${x},${y}) d=${info.distance} dens=${info.density.toFixed(2)}${
            info.blocked ? " WALL" : ""
          }`;
      const disabled = info.blocked ? "disabled" : "";
      cells.push(
        `<button type="button" class="${cls}" data-sx="${x}" data-sy="${y}" title="${escapeHtml(title)}" style="${densityStyle(info)}" ${disabled}>${escapeHtml(cellLabel(x, y, info))}</button>`,
      );
    }
  }

  const selInfo =
    selected != null ? sectorDensityAt(selected.sx, selected.sy) : null;
  const showFrontWarn =
    selInfo != null &&
    !selInfo.blocked &&
    selInfo.distance >= SECTOR_FRONT_DISTANCE;

  root.innerHTML = `
    <p class="pill">MODULE 4 · INVADE / FRONT · THIN STUB</p>
    <h1>戦線マップ</h1>
    <p class="muted">HQ 中心の小 AOI。セクターをクリックしてルート選択（UI 状態のみ・ハンドオフ未配線）。</p>

    ${
      showFrontWarn
        ? `<div class="banner warn-banner" role="status">⚠ 前線帯 d≥${SECTOR_FRONT_DISTANCE} — 高密度ルート。インテル価値は高いがリスクも大きい（仮）。</div>`
        : ""
    }

    <div class="card">
      <p class="muted">AOI ${cols}×${cols}（半辺 ${AOI_HALF}）。色＝仮 density / 数字＝Chebyshev d。壁 d≥${SECTOR_WALL_DISTANCE} は選択不可。</p>
      <div class="grid" style="--cols:${cols}">${cells.join("")}</div>
    </div>

    <div class="card">
      <table>
        <tr><td>選択ルート</td><td>${
          selected
            ? `(${selected.sx}, ${selected.sy})`
            : skipped
              ? "—（quick-battle スキップ）"
              : "未選択"
        }</td></tr>
        <tr><td>距離 d</td><td>${selInfo ? String(selInfo.distance) : "—"}</td></tr>
        <tr><td>仮 density</td><td>${selInfo ? selInfo.density.toFixed(2) : "—"}</td></tr>
        <tr><td>フロント目安</td><td>d = ${SECTOR_FRONT_DISTANCE}</td></tr>
        <tr><td>壁</td><td>d ≥ ${SECTOR_WALL_DISTANCE}</td></tr>
      </table>
      <div class="actions">
        <button type="button" class="btn" id="btn-clear" ${selected == null ? "disabled" : ""}>選択クリア</button>
        <button type="button" class="btn ghost" id="btn-skip">スキップ（quick-battle・未配線）</button>
      </div>
      <p class="ok" style="margin-top:0.75rem">報酬はインテル／ルート表現のみ。本 salvage は払わない。</p>
      <p class="warn">explore / sort / trade への URL ハンドオフなし。</p>
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>("button.cell.pickable").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sx = Number(btn.dataset.sx);
      const sy = Number(btn.dataset.sy);
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
      const info = sectorDensityAt(sx, sy);
      if (info.blocked) return;
      selected = { sx, sy };
      skipped = false;
      render();
    });
  });

  root.querySelector("#btn-clear")?.addEventListener("click", () => {
    selected = null;
    render();
  });

  root.querySelector("#btn-skip")?.addEventListener("click", () => {
    selected = null;
    skipped = true;
    render();
  });
}

render();
