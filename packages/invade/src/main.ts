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
  BOARD_SIZE,
  MAX_MINES,
  MIN_MINES,
  cellGlyph,
  countFlagged,
  densityAfterBoard,
  generateBoard,
  mergeBoardIntel,
  mineCountFromDensity,
  minesRemaining,
  openCell,
  toggleFlag,
  type MsBoard,
} from "./board";

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
/** Inner minesweeper for the selected sector (null when none). */
let board: MsBoard | null = null;
/** Last board action log line for UI. */
let lastBoardLog: string | null = null;
/** Flag-mode: next cell click toggles flag instead of open. */
let flagMode = false;

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
function baseIntelFlags(info: SectorDensityInfo): string[] {
  const flags: string[] = ["routeHint"];
  if (info.distance >= SECTOR_FRONT_DISTANCE) flags.push("frontLine");
  if (info.density >= 0.7) flags.push("rareSignal");
  return flags;
}

function ensureBoard(sel: SectorSel, info: SectorDensityInfo): MsBoard {
  if (
    board != null &&
    board.sectorX === sel.sx &&
    board.sectorY === sel.sy
  ) {
    return board;
  }
  board = generateBoard(sel.sx, sel.sy, info.density);
  lastBoardLog = `セクター (${sel.sx},${sel.sy}) 進入 — HQ 開放 · 敵 ${board.mineCount}（density ${info.density.toFixed(2)}）`;
  return board;
}

function sectorPayload(
  sel: SectorSel,
  info: SectorDensityInfo,
): InvadeToTradePayload & InvadeToExplorePayload {
  const b = ensureBoard(sel, info);
  return {
    sectorX: sel.sx,
    sectorY: sel.sy,
    density: densityAfterBoard(info.density, b),
    intelFlags: mergeBoardIntel(baseIntelFlags(info), b),
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
    <p class="muted" style="margin-top:0.5rem">地雷マス＝敵位置の概念インテル。探索は当面 threat スケールに利用（本 salvage なし）。</p>
  `;
}

function statusJa(b: MsBoard): string {
  if (b.status === "won") return "セクター掃討完了";
  if (b.status === "hazard") return "接触（hazard・前線は継続可）";
  return "偵察中";
}

function minesweeperPanelHtml(
  sel: SectorSel | null,
  info: SectorDensityInfo | null,
): string {
  if (sel == null || info == null || info.blocked) {
    return `
      <div class="card">
        <h2 class="card-title">セクター内マインスイーパ</h2>
        <p class="muted">セクターを選ぶと ${BOARD_SIZE}×${BOARD_SIZE} の内盤が開きます。HQ 開放＝拠点 · 空白＝探索済 · 数字＝周囲の敵感知 · ✕＝敵（→ Module 1）。</p>
      </div>
    `;
  }
  const b = ensureBoard(sel, info);
  const expected = mineCountFromDensity(info.density);
  const cells: string[] = [];
  for (let y = 0; y < b.size; y++) {
    for (let x = 0; x < b.size; x++) {
      const c = b.cells[y]![x]!;
      const cls = [
        "ms-cell",
        c.open ? "open" : "closed",
        c.isHq ? "hq" : "",
        c.flagged && !c.open ? "flagged" : "",
        c.open && c.mine ? "mine" : "",
        c.open && !c.mine && c.adjacent > 0 ? `n${c.adjacent}` : "",
        c.open && !c.mine && c.adjacent === 0 ? "blank" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const title = c.open
        ? c.mine
          ? "敵接触"
          : c.isHq
            ? "HQ / base"
            : c.adjacent === 0
              ? "探索済セーフ"
              : `周囲敵 ${c.adjacent}`
        : c.flagged
          ? "旗"
          : "未開";
      cells.push(
        `<button type="button" class="${cls}" data-mx="${x}" data-my="${y}" title="${escapeHtml(title)}">${escapeHtml(cellGlyph(c))}</button>`,
      );
    }
  }
  const statusBanner =
    b.status === "won"
      ? `<div class="banner ok-banner" role="status">セクター掃討完了 — sectorCleared。探索へ敵残ゼロのインテルを渡せます。</div>`
      : b.status === "hazard"
        ? `<div class="banner warn-banner" role="status">敵接触（scoutHazard）。前線マップはロックしません — 続行・旗立て・ハンドオフ可。</div>`
        : "";

  return `
    <div class="card">
      <h2 class="card-title">セクター内マインスイーパ（${BOARD_SIZE}×${BOARD_SIZE}）</h2>
      <p class="muted">密度→敵数: ${MIN_MINES}…${MAX_MINES}（今 ${expected}）。左クリック＝開く / 旗モード＝旗。HQ は開始時から開放。</p>
      <table>
        <tr><td>状態</td><td>${escapeHtml(statusJa(b))}</td></tr>
        <tr><td>敵（地雷）</td><td>${b.mineCount}</td></tr>
        <tr><td>残敵（概算）</td><td>${minesRemaining(b)}</td></tr>
        <tr><td>旗</td><td>${countFlagged(b)}</td></tr>
      </table>
      ${statusBanner}
      ${
        lastBoardLog
          ? `<p class="mono" style="margin-top:0.5rem">${escapeHtml(lastBoardLog)}</p>`
          : ""
      }
      <div class="ms-grid" style="--ms:${b.size}">${cells.join("")}</div>
      <div class="actions">
        <button type="button" class="btn ${flagMode ? "secondary" : ""}" id="btn-flag-mode">${flagMode ? "旗モード ON" : "旗モード"}</button>
        <button type="button" class="btn ghost" id="btn-regen">盤を再生成</button>
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
    <p class="pill">MODULE 4 · INVADE / FRONT · SECTOR MINESWEEPER</p>
    <h1>戦線マップ</h1>
    <p class="muted">HQ 中心の小 AOI。セクター選択 → 内盤マインスイーパ → Hub または探索へルート／インテルを渡す（本 salvage なし）。</p>

    <div class="card">
      <h2 class="card-title">到着（trade→invade）</h2>
      ${inboundSummaryHtml()}
    </div>

    ${
      showFrontWarn
        ? `<div class="banner warn-banner" role="status">⚠ 前線帯 d≥${SECTOR_FRONT_DISTANCE} — 高密度ルート。内盤の敵も多い（仮）。</div>`
        : ""
    }

    <div class="card">
      <p class="muted">AOI ${cols}×${cols}（半辺 ${AOI_HALF}）。色＝仮 density / 数字＝Chebyshev d。壁 d≥${SECTOR_WALL_DISTANCE} は選択不可。選択後に内盤が開く。</p>
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

    ${minesweeperPanelHtml(selected, selInfo)}

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
      board = null;
      flagMode = false;
      lastBoardLog = null;
      ensureBoard(selected, info);
      render();
    });
  });

  root.querySelector("#btn-clear")?.addEventListener("click", () => {
    selected = null;
    board = null;
    flagMode = false;
    lastBoardLog = null;
    render();
  });

  root.querySelector("#btn-skip")?.addEventListener("click", () => {
    selected = null;
    board = null;
    skipped = true;
    flagMode = false;
    lastBoardLog = null;
    render();
  });

  root.querySelector("#btn-flag-mode")?.addEventListener("click", () => {
    flagMode = !flagMode;
    lastBoardLog = flagMode ? "旗モード ON — セルクリックで旗トグル" : "旗モード OFF — クリックで開く";
    render();
  });

  root.querySelector("#btn-regen")?.addEventListener("click", () => {
    if (selected == null) return;
    const info = sectorDensityAt(selected.sx, selected.sy);
    if (info.blocked) return;
    // Nudge seed via density epsilon so layout changes while staying in-bucket-ish
    board = generateBoard(
      selected.sx,
      selected.sy,
      info.density,
      BOARD_SIZE,
      () => Math.random(),
    );
    lastBoardLog = `盤再生成 — 敵 ${board.mineCount}`;
    render();
  });

  root.querySelectorAll<HTMLButtonElement>("button.ms-cell").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (board == null) return;
      const x = Number(btn.dataset.mx);
      const y = Number(btn.dataset.my);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      if (flagMode) {
        const r = toggleFlag(board, x, y);
        if (r.ok) {
          lastBoardLog = r.flagged ? `旗立て (${x},${y})` : `旗解除 (${x},${y})`;
        }
        render();
        return;
      }

      const r = openCell(board, x, y);
      if (!r.ok) {
        if (r.reason === "flagged") {
          lastBoardLog = "旗付きセルは開けません（旗モードで解除）";
        }
        render();
        return;
      }
      if (board.hitMine && board.cells[y]![x]!.mine) {
        lastBoardLog = `敵接触 (${x},${y}) → scoutHazard（前線は継続可）`;
      } else if (board.status === "won") {
        lastBoardLog = `掃討完了 — 開放 ${r.opened} → sectorCleared`;
      } else {
        lastBoardLog = `開放 (${x},${y}) ×${r.opened} · 残敵 ${minesRemaining(board)}`;
      }
      render();
    });

    btn.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      if (board == null) return;
      const x = Number(btn.dataset.mx);
      const y = Number(btn.dataset.my);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const r = toggleFlag(board, x, y);
      if (r.ok) {
        lastBoardLog = r.flagged ? `旗立て (${x},${y})` : `旗解除 (${x},${y})`;
      }
      render();
    });
  });
}

render();
