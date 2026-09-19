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
import {
  type CellMark,
  cellKey,
  densityAfterSweep,
  hazardChanceFromDensity,
  mergeIntelFlags,
  resolveFlag,
  resolveSweep,
} from "./sweep";

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
/** Per-cell thin-sweep marks (flag / clear / hazard). */
const marks = new Map<string, CellMark>();
/** Last scout/flag log line for UI. */
let lastSweepLog: string | null = null;

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

function markAt(sx: number, sy: number): CellMark {
  return marks.get(cellKey(sx, sy)) ?? "none";
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
  const m = markAt(sx, sy);
  if (m === "flagged") return "⚑";
  if (m === "cleared") return "✓";
  if (m === "hazard") return "✕";
  return info.distance.toString();
}

/** Short intel tokens only — never YieldBag / salvage. */
function baseIntelFlags(info: SectorDensityInfo): string[] {
  const flags: string[] = ["routeHint"];
  if (info.distance >= SECTOR_FRONT_DISTANCE) flags.push("frontLine");
  if (info.density >= 0.7) flags.push("rareSignal");
  return flags;
}

function sectorPayload(
  sel: SectorSel,
  info: SectorDensityInfo,
): InvadeToTradePayload & InvadeToExplorePayload {
  const mark = markAt(sel.sx, sel.sy);
  return {
    sectorX: sel.sx,
    sectorY: sel.sy,
    density: densityAfterSweep(info.density, mark),
    intelFlags: mergeIntelFlags(baseIntelFlags(info), mark),
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
    <p class="muted mono">density: ${payload.density.toFixed(3)} · intelFlags: ${escapeHtml(flags)}</p>
    <div class="actions">
      <a class="btn" href="${escapeHtml(toTrade)}" target="_top" rel="noopener">格納庫へ渡す（invade→trade）</a>
      <a class="btn secondary" href="${escapeHtml(toExplore)}" target="_top" rel="noopener">探索へ渡す（invade→explore）</a>
    </div>
  `;
}

function sweepPanelHtml(
  sel: SectorSel | null,
  info: SectorDensityInfo | null,
): string {
  if (sel == null || info == null || info.blocked) {
    return `
      <div class="card">
        <h2 class="card-title">薄掃討（thin sweep）</h2>
        <p class="muted">セクターを選ぶと、旗立て / 偵察掃討ができます（本編マインスイーパではない）。</p>
      </div>
    `;
  }
  const mark = markAt(sel.sx, sel.sy);
  const pHaz = hazardChanceFromDensity(info.density);
  const markJa =
    mark === "flagged"
      ? "旗"
      : mark === "cleared"
        ? "掃討成功"
        : mark === "hazard"
          ? "接触（hazard）"
          : "未掃討";
  return `
    <div class="card">
      <h2 class="card-title">薄掃討（thin sweep）</h2>
      <p class="muted">選択セルを旗立て、または密度連動の hazard 確率で偵察掃討。結果は既存 intelFlags / density に載せる。</p>
      <table>
        <tr><td>セル状態</td><td>${escapeHtml(markJa)}</td></tr>
        <tr><td>hazard 確率</td><td>${(pHaz * 100).toFixed(0)}%（density ${info.density.toFixed(2)}）</td></tr>
      </table>
      ${
        lastSweepLog
          ? `<p class="mono" style="margin-top:0.5rem">${escapeHtml(lastSweepLog)}</p>`
          : ""
      }
      <div class="actions">
        <button type="button" class="btn" id="btn-flag">旗立て（Flag）</button>
        <button type="button" class="btn secondary" id="btn-sweep">偵察掃討（Sweep）</button>
        <button type="button" class="btn ghost" id="btn-unmark" ${mark === "none" ? "disabled" : ""}>マーク解除</button>
      </div>
      <p class="ok" style="margin-top:0.75rem">報酬はインテルのみ。コンテナ／YieldBag は払わない。</p>
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
      const mark = markAt(x, y);
      const cls = [
        "cell",
        isHq ? "hq" : "",
        info.blocked ? "blocked" : "pickable",
        isSel ? "selected" : "",
        !info.blocked && info.distance >= SECTOR_FRONT_DISTANCE ? "front" : "",
        mark !== "none" ? `mark-${mark}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const title = isHq
        ? "HQ (0,0)"
        : `(${x},${y}) d=${info.distance} dens=${info.density.toFixed(2)}${
            info.blocked ? " WALL" : ""
          }${mark !== "none" ? ` [${mark}]` : ""}`;
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
    <p class="pill">MODULE 4 · INVADE / FRONT · THIN SWEEP</p>
    <h1>戦線マップ</h1>
    <p class="muted">HQ 中心の小 AOI。セクター選択 → 薄掃討（旗／偵察）→ Hub または探索へルート情報を渡す（本 salvage なし）。</p>

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
      <p class="muted">AOI ${cols}×${cols}（半辺 ${AOI_HALF}）。色＝仮 density / 数字＝Chebyshev d。壁 d≥${SECTOR_WALL_DISTANCE} は選択不可。⚑旗 ✓掃討 ✕hazard。</p>
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
    </div>

    ${sweepPanelHtml(selected, selInfo)}

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
      lastSweepLog = null;
      render();
    });
  });

  root.querySelector("#btn-clear")?.addEventListener("click", () => {
    selected = null;
    lastSweepLog = null;
    render();
  });

  root.querySelector("#btn-skip")?.addEventListener("click", () => {
    selected = null;
    skipped = true;
    lastSweepLog = null;
    render();
  });

  root.querySelector("#btn-flag")?.addEventListener("click", () => {
    if (selected == null) return;
    const out = resolveFlag();
    marks.set(cellKey(selected.sx, selected.sy), out.mark);
    lastSweepLog = `Flag → ${out.intelAdded.join(",")}`;
    render();
  });

  root.querySelector("#btn-sweep")?.addEventListener("click", () => {
    if (selected == null) return;
    const info = sectorDensityAt(selected.sx, selected.sy);
    if (info.blocked) return;
    const out = resolveSweep(info.density);
    marks.set(cellKey(selected.sx, selected.sy), out.mark);
    const p = hazardChanceFromDensity(info.density);
    lastSweepLog =
      out.kind === "hazard"
        ? `Sweep HAZARD (p=${(p * 100).toFixed(0)}%) → ${out.intelAdded.join(",")}`
        : `Sweep CLEAR (p=${(p * 100).toFixed(0)}%) → ${out.intelAdded.join(",")}`;
    render();
  });

  root.querySelector("#btn-unmark")?.addEventListener("click", () => {
    if (selected == null) return;
    marks.delete(cellKey(selected.sx, selected.sy));
    lastSweepLog = "マーク解除";
    render();
  });
}

render();
