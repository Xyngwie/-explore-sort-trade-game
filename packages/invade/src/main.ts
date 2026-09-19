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
  type TradeToInvadePayload,
} from "@estg/shared";
import {
  AOI_HALF,
  BOARD_SPAN,
  cellGlyph,
  countFlagged,
  densityAfterBoard,
  generateBoard,
  getCell,
  mergeBoardIntel,
  minesRemaining,
  openCell,
  toggleFlag,
  type MsBoard,
} from "./board";

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

/** The front AOI IS the minesweeper board (one unified grid). */
let board: MsBoard = generateBoard(AOI_HALF);
/** Route focus for handoff (last interacted playable cell, or HQ). */
let selected: SectorSel | null = { sx: 0, sy: 0 };
/** Inert skip flag (quick-battle wording only — no URL nav). */
let skipped = false;
/** Last board action log line for UI. */
let lastBoardLog: string | null =
  `前線盤生成 — ${BOARD_SPAN}×${BOARD_SPAN} · 敵 ${board.mineCount} · HQ 開放`;
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

/** Short intel tokens only — never YieldBag / salvage. */
function baseIntelFlags(sx: number, sy: number): string[] {
  const info = sectorDensityAt(sx, sy);
  const flags: string[] = ["routeHint"];
  if (info.distance >= SECTOR_FRONT_DISTANCE) flags.push("frontLine");
  if (info.density >= 0.7) flags.push("rareSignal");
  return flags;
}

function sectorPayload(
  sel: SectorSel,
): InvadeToTradePayload & InvadeToExplorePayload {
  const info = sectorDensityAt(sel.sx, sel.sy);
  return {
    sectorX: sel.sx,
    sectorY: sel.sy,
    density: densityAfterBoard(info.density, board),
    intelFlags: mergeBoardIntel(baseIntelFlags(sel.sx, sel.sy), board),
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

function handoffActionsHtml(sel: SectorSel | null): string {
  if (sel == null) {
    return `<p class="muted">セルを開く／旗／選択すると Hub / 探索へのハンドオフリンクが表示されます。</p>`;
  }
  const info = sectorDensityAt(sel.sx, sel.sy);
  if (info.blocked) {
    return `<p class="muted">壁セルはルートにできません。内側のセクターを選んでください。</p>`;
  }
  const payload = sectorPayload(sel);
  const toTrade = buildInvadeToTradeUrl(payload, tradeBaseUrl());
  const toExplore = buildInvadeToExploreUrl(payload, exploreBaseUrl());
  const flags = (payload.intelFlags ?? []).join(", ") || "—";
  return `
    <p class="muted mono">route (${sel.sx},${sel.sy}) · density: ${payload.density.toFixed(3)} · intelFlags: ${escapeHtml(flags)}</p>
    <div class="actions">
      <a class="btn" href="${escapeHtml(toTrade)}" target="_top" rel="noopener">格納庫へ渡す（invade→trade）</a>
      <a class="btn secondary" href="${escapeHtml(toExplore)}" target="_top" rel="noopener">探索へ渡す（invade→explore）</a>
    </div>
    <p class="muted" style="margin-top:0.5rem">地雷マス＝敵位置。探索へ渡すと Module 1 で掃討する概念インテル（本 salvage なし）。</p>
  `;
}

function statusJa(): string {
  if (board.status === "won") return "前線掃討完了";
  if (board.status === "hazard") return "接触（hazard・前線は継続可）";
  return "偵察中";
}

function cellTitle(cell: ReturnType<typeof getCell>): string {
  if (!cell) return "";
  if (cell.blocked) return `(${cell.sx},${cell.sy}) WALL d≥${SECTOR_WALL_DISTANCE}`;
  if (cell.open) {
    if (cell.mine) return `(${cell.sx},${cell.sy}) 敵接触`;
    if (cell.isHq) return "HQ (0,0) — 拠点（開始開放）";
    if (cell.adjacent === 0) return `(${cell.sx},${cell.sy}) 探索済セーフ`;
    return `(${cell.sx},${cell.sy}) 周囲敵 ${cell.adjacent}`;
  }
  if (cell.flagged) return `(${cell.sx},${cell.sy}) 旗`;
  return `(${cell.sx},${cell.sy}) 未開 d=${sectorDensityAt(cell.sx, cell.sy).distance}`;
}

function render(): void {
  const cols = board.span;
  const cellsHtml: string[] = [];
  // Paint top→bottom (sy = +half … −half) so north is up
  for (let sy = AOI_HALF; sy >= -AOI_HALF; sy--) {
    for (let sx = -AOI_HALF; sx <= AOI_HALF; sx++) {
      const c = getCell(board, sx, sy)!;
      const isSel =
        selected != null && selected.sx === sx && selected.sy === sy;
      const cls = [
        "cell",
        "ms-cell",
        c.blocked ? "blocked" : "",
        c.open ? "open" : c.blocked ? "" : "closed",
        c.isHq ? "hq" : "",
        c.flagged && !c.open ? "flagged" : "",
        c.open && c.mine ? "mine" : "",
        c.open && !c.mine && !c.blocked && c.adjacent > 0 ? `n${c.adjacent}` : "",
        c.open && !c.mine && !c.blocked && c.adjacent === 0 ? "blank" : "",
        isSel ? "selected" : "",
        !c.blocked && !c.open ? "pickable" : "",
        c.open && !c.blocked ? "focusable" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const disabled = c.blocked ? "disabled" : "";
      cellsHtml.push(
        `<button type="button" class="${cls}" data-sx="${sx}" data-sy="${sy}" title="${escapeHtml(cellTitle(c))}" ${disabled}>${escapeHtml(cellGlyph(c))}</button>`,
      );
    }
  }

  const selInfo =
    selected != null ? sectorDensityAt(selected.sx, selected.sy) : null;
  const showFrontWarn =
    selInfo != null &&
    !selInfo.blocked &&
    selInfo.distance >= SECTOR_FRONT_DISTANCE;

  const statusBanner =
    board.status === "won"
      ? `<div class="banner ok-banner" role="status">前線掃討完了 — sectorCleared。探索へ敵残ゼロのインテルを渡せます。</div>`
      : board.status === "hazard"
        ? `<div class="banner warn-banner" role="status">敵接触（scoutHazard）。前線マップはロックしません — 続行・旗立て・ハンドオフ可。</div>`
        : "";

  root.innerHTML = `
    <p class="pill">MODULE 4 · INVADE / FRONT · FRONT = MINESWEEPER</p>
    <h1>戦線マップ</h1>
    <p class="muted">HQ 中心の前線格子<strong>そのもの</strong>がマインスイーパ。空白＝探索済 · 数字＝周囲の敵感知 · ✕＝敵（→ Module 1）· 壁 d≥${SECTOR_WALL_DISTANCE}。</p>

    <div class="card">
      <h2 class="card-title">到着（trade→invade）</h2>
      ${inboundSummaryHtml()}
    </div>

    ${
      showFrontWarn
        ? `<div class="banner warn-banner" role="status">⚠ ルート焦点 d≥${SECTOR_FRONT_DISTANCE} — 高密度帯（遠方ほど敵が濃い）。</div>`
        : ""
    }
    ${statusBanner}

    <div class="card">
      <h2 class="card-title">前線マインスイーパ（${BOARD_SPAN}×${BOARD_SPAN} · 半辺 ${AOI_HALF}）</h2>
      <p class="muted">P(敵) は HQ からの Chebyshev d で上昇（近傍薄・前線濃）。左クリック＝開く / 旗モードまたは右クリック＝旗。開いたセルをクリックでルート焦点。</p>
      <table>
        <tr><td>状態</td><td>${escapeHtml(statusJa())}</td></tr>
        <tr><td>敵（地雷）</td><td>${board.mineCount}</td></tr>
        <tr><td>残敵（概算）</td><td>${minesRemaining(board)}</td></tr>
        <tr><td>旗</td><td>${countFlagged(board)}</td></tr>
        <tr><td>ルート焦点</td><td>${
          selected
            ? `(${selected.sx}, ${selected.sy})`
            : skipped
              ? "—（quick-battle スキップ）"
              : "未選択"
        }</td></tr>
        <tr><td>距離 d</td><td>${selInfo ? String(selInfo.distance) : "—"}</td></tr>
        <tr><td>仮 density</td><td>${selInfo && !selInfo.blocked ? selInfo.density.toFixed(2) : "—"}</td></tr>
        <tr><td>壁</td><td>d ≥ ${SECTOR_WALL_DISTANCE}</td></tr>
      </table>
      ${
        lastBoardLog
          ? `<p class="mono" style="margin-top:0.5rem">${escapeHtml(lastBoardLog)}</p>`
          : ""
      }
      <div class="grid front-ms" style="--cols:${cols}">${cellsHtml.join("")}</div>
      <div class="actions">
        <button type="button" class="btn ${flagMode ? "secondary" : ""}" id="btn-flag-mode">${flagMode ? "旗モード ON" : "旗モード"}</button>
        <button type="button" class="btn ghost" id="btn-regen">盤を再生成</button>
        <button type="button" class="btn ghost" id="btn-clear" ${selected == null ? "disabled" : ""}>焦点クリア</button>
        <button type="button" class="btn ghost" id="btn-skip">スキップ（quick-battle・ナビなし）</button>
      </div>
      <p class="ok" style="margin-top:0.75rem">報酬はインテルのみ。コンテナ／YieldBag は払わない。</p>
    </div>

    <div class="card">
      <h2 class="card-title">出発ハンドオフ</h2>
      ${handoffActionsHtml(selected)}
    </div>
  `;

  root.querySelector("#btn-flag-mode")?.addEventListener("click", () => {
    flagMode = !flagMode;
    lastBoardLog = flagMode
      ? "旗モード ON — セルクリックで旗トグル"
      : "旗モード OFF — クリックで開く";
    render();
  });

  root.querySelector("#btn-regen")?.addEventListener("click", () => {
    board = generateBoard(AOI_HALF, () => Math.random());
    selected = { sx: 0, sy: 0 };
    skipped = false;
    flagMode = false;
    lastBoardLog = `盤再生成 — 敵 ${board.mineCount} · HQ 開放`;
    render();
  });

  root.querySelector("#btn-clear")?.addEventListener("click", () => {
    selected = { sx: 0, sy: 0 };
    lastBoardLog = "ルート焦点を HQ に戻した";
    render();
  });

  root.querySelector("#btn-skip")?.addEventListener("click", () => {
    selected = null;
    skipped = true;
    flagMode = false;
    lastBoardLog = "quick-battle スキップ（ナビなし）";
    render();
  });

  root.querySelectorAll<HTMLButtonElement>("button.cell:not(.blocked)").forEach((btn) => {
    const sx = Number(btn.dataset.sx);
    const sy = Number(btn.dataset.sy);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;

    const onPrimary = () => {
      const cell = getCell(board, sx, sy);
      if (!cell || cell.blocked) return;

      // Already open → set route focus only
      if (cell.open && !cell.mine) {
        selected = { sx, sy };
        skipped = false;
        lastBoardLog = `ルート焦点 (${sx},${sy})`;
        render();
        return;
      }

      if (flagMode) {
        const r = toggleFlag(board, sx, sy);
        if (r.ok) {
          selected = { sx, sy };
          skipped = false;
          lastBoardLog = r.flagged ? `旗立て (${sx},${sy})` : `旗解除 (${sx},${sy})`;
        }
        render();
        return;
      }

      if (cell.open && cell.mine) {
        selected = { sx, sy };
        skipped = false;
        render();
        return;
      }

      const r = openCell(board, sx, sy);
      if (!r.ok) {
        if (r.reason === "flagged") {
          lastBoardLog = "旗付きセルは開けません（旗モードで解除）";
        }
        render();
        return;
      }
      selected = { sx, sy };
      skipped = false;
      if (board.hitMine && getCell(board, sx, sy)?.mine) {
        lastBoardLog = `敵接触 (${sx},${sy}) → scoutHazard（前線は継続可）`;
      } else if (board.status === "won") {
        lastBoardLog = `掃討完了 — 開放 ${r.opened} → sectorCleared`;
      } else {
        lastBoardLog = `開放 (${sx},${sy}) ×${r.opened} · 残敵 ${minesRemaining(board)}`;
      }
      render();
    };

    btn.addEventListener("click", onPrimary);

    btn.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      const cell = getCell(board, sx, sy);
      if (!cell || cell.blocked) return;
      const r = toggleFlag(board, sx, sy);
      if (r.ok) {
        selected = { sx, sy };
        skipped = false;
        lastBoardLog = r.flagged ? `旗立て (${sx},${sy})` : `旗解除 (${sx},${sy})`;
      }
      render();
    });
  });
}

render();

// Silence unused import when tree-shaken oddly in some bundlers
