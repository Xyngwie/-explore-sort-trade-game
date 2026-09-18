import "./style.css";
import {
  HANDOFF_QUERY_KEYS,
  SECTOR_FRONT_DISTANCE,
  SECTOR_WALL_DISTANCE,
  buildInvadeToExploreUrl,
  buildInvadeToTradeUrl,
  parseTradeToInvadeSearch,
  resolveModuleBaseUrl,
  sectorDensityAt,
  stripHandoffParams,
  type InvadeToExplorePayload,
  type InvadeToTradePayload,
  type SectorDensityInfo,
  type TradeToInvadePayload,
} from "@estg/shared";

/** Half-extent of the AOI around HQ (coords −AOI_HALF … +AOI_HALF). */
const AOI_HALF = 10;

type SectorSel = { sx: number; sy: number };

const root = document.querySelector<HTMLDivElement>("#app")!;

/** Inbound hub context (trade → invade). Null when opened without handoff keys. */
const inbound: TradeToInvadePayload | null = parseTradeToInvadeSearch(
  window.location.search,
);

if (inbound != null) {
  const cleaned = stripHandoffParams(
    window.location.href,
    HANDOFF_QUERY_KEYS.tradeToInvade,
  );
  if (cleaned !== window.location.pathname + window.location.search + window.location.hash) {
    history.replaceState(null, "", cleaned);
  }
}

let selected: SectorSel | null = null;
/** Inert skip flag (quick-battle wording only — no URL nav). */
let skipped = false;

function tradeBaseUrl(): string {
  return resolveModuleBaseUrl("trade");
}

function exploreBaseUrl(): string {
  return resolveModuleBaseUrl("explore");
}

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

/** Short intel tokens only — never YieldBag / salvage. */
function intelFlagsFor(info: SectorDensityInfo): string[] {
  const flags: string[] = ["routeHint"];
  if (info.distance >= SECTOR_FRONT_DISTANCE) flags.push("frontLine");
  if (info.density >= 0.7) flags.push("rareSignal");
  return flags;
}

function sectorPayload(
  sel: SectorSel,
  info: SectorDensityInfo,
): InvadeToTradePayload & InvadeToExplorePayload {
  return {
    sectorX: sel.sx,
    sectorY: sel.sy,
    density: info.density,
    intelFlags: intelFlagsFor(info),
  };
}

function inboundSummaryHtml(): string {
  if (inbound == null) {
    return `<p class="muted">Hub からの到着クエリなし（直接オープン可）。</p>`;
  }
  const mechs =
    inbound.deployableMechs != null ? String(inbound.deployableMechs) : "—";
  const ammo =
    inbound.startingAmmo != null ? String(inbound.startingAmmo) : "—";
  return `
    <table>
      <tr><td>fromHub</td><td>はい</td></tr>
      <tr><td>deployableMechs</td><td>${escapeHtml(mechs)}</td></tr>
      <tr><td>startingAmmo</td><td>${escapeHtml(ammo)}</td></tr>
    </table>
    <p class="ok" style="margin-top:0.5rem">trade→invade 取込済（配備コミットではない）。</p>
  `;
}

function handoffActionsHtml(
  sel: SectorSel | null,
  info: SectorDensityInfo | null,
): string {
  if (sel == null || info == null || info.blocked) {
    return `<p class="muted">セクター選択後に Hub / 探索へのハンドオフリンクが表示されます。</p>`;
  }
  const payload = sectorPayload(sel, info);
  const toTrade = buildInvadeToTradeUrl(payload, tradeBaseUrl());
  const toExplore = buildInvadeToExploreUrl(payload, exploreBaseUrl());
  const flags = (payload.intelFlags ?? []).join(", ") || "—";
  return `
    <p class="muted mono">intelFlags: ${escapeHtml(flags)}</p>
    <div class="actions">
      <a class="btn" href="${escapeHtml(toTrade)}" target="_top" rel="noopener">格納庫へ渡す（invade→trade）</a>
      <a class="btn secondary" href="${escapeHtml(toExplore)}" target="_top" rel="noopener">探索へ渡す（invade→explore）</a>
    </div>
  `;
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
    <p class="pill">MODULE 4 · INVADE / FRONT · HANDOFF WIRE</p>
    <h1>戦線マップ</h1>
    <p class="muted">HQ 中心の小 AOI。セクターを選び、Hub または探索へルート情報を渡す（本 salvage なし）。</p>

    <div class="card">
      <h2 class="card-title">到着（trade→invade）</h2>
      ${inboundSummaryHtml()}
    </div>

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
        <button type="button" class="btn ghost" id="btn-skip">スキップ（quick-battle・ナビなし）</button>
      </div>
      <p class="ok" style="margin-top:0.75rem">報酬はインテル／ルート表現のみ。本 salvage は払わない。</p>
    </div>

    <div class="card">
      <h2 class="card-title">出発ハンドオフ</h2>
      ${handoffActionsHtml(selected, selInfo)}
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
