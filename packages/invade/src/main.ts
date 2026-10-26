import { bindBoardInput, type BoardAction, type Coord } from "./boardInput";
import { chordCells } from "./chord";
import { mountShieldDebugConsole } from "@estg/shared";
import "./style.css";
import {
  CTA_CHIP,
  invadeRankOf,
  unlockedInvadeRank,
  CTA_COPY,
  FIRST_CLEAR_DISCOVERY_LINE_JA,
  HANDOFF_QUERY_KEYS,
  SECTOR_FRONT_DISTANCE,
  SECTOR_WALL_DISTANCE,
  buildInvadeToExploreUrl,
  buildInvadeToTradeUrl,
  firstClearDiscoveredOnBoard,
  parseTradeToInvadeSearch,
  resolveModuleBaseUrl,
  sectorDensityAt,
  stripHandoffParams,
  type EngageMode,
  type EnemyCellCoord,
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
  forcedEngageTargets,
  getCell,
  mergeBoardIntel,
  minesRemaining,
  openCell,
  raidEngageTarget,
  toggleFlag,
  type MsBoard,
} from "./board";
import {
  cellFeelClasses,
  dangerBandAtCell,
  dangerBandHintJa,
  dangerBandLabelJa,
  dangerBandRangeJa,
  exploredFeelLabelJa,
  frontProgressFeel,
  isPendingMineCell,
  isResolvedMineCell,
  mineCellStatusJa,
} from "./front-feel";
import {
  buildFlagOpsGuideHtml,
} from "./touchFlag";
import {
  clearPersistedFrontProgress,
  changeFrontRank,
  loadOrCreateFrontSession,
  persistFrontSessionWithClear,
  readStoredHub,
  regenerateFrontSession,
} from "./hub-persist";
import {
  cellKey,
  fieldDropSortieLineJa,
  fieldDropTitleJa,
  lostMechSortieLineJa,
  lostMechTitleJa,
  wreckSortieLineJa,
  wreckTitleJa,
} from "./lost-mechs";
import {
  armForcedLockHistory,
  forcedLockBackAction,
  isForcedCombatLock,
  markForcedHandoffIntent,
} from "./forced-combat";

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
const initialSession = loadOrCreateFrontSession();
let board: MsBoard = initialSession.board;
/** Route focus for handoff (last interacted playable cell, or HQ). */
let selected: SectorSel | null = initialSession.focus;
/** Inert skip flag (quick-battle wording only — no URL nav). */
let skipped = selected == null;
/** Last board action log line for UI. */
let lastBoardLog: string | null = initialSession.restored
  ? `前線進捗を HubSave から復元 — 敵 ${board.mineCount} · seed ${board.seed ?? "—"}`
  : `前線盤生成 — ${BOARD_SPAN}×${BOARD_SPAN} · 敵 ${board.mineCount} · HQ 開放 · seed ${board.seed ?? "—"}`;
/** Left-behind mechs on this board per cell (HubSave.lostMechs; display only). */
let lostByCell: Map<string, string[]> = initialSession.lostByCell;
/** Circuit field drops on this board per cell (HubSave.fieldDrops; display only). */
let dropsByCell: Map<string, string[]> = initialSession.dropsByCell;
/** 項目5-1b③: wrecks on this board per cell (HubSave.lostMechs kind "wreck"; display only). */
let wrecksByCell: Map<string, string[]> = initialSession.wrecksByCell;
/** Flag-mode: next cell click toggles flag instead of open. */
let reversedTouch = false;
/** History trap armed for current forced-combat lock. */
let forcedLockHistoryArmed = false;

/** Board status at the last save; a change to "won" is the sweep (first-clear.ts). */
let lastSavedStatus = board.status;
/** HubSave says the first clear was on this board → one extra banner line. */
let firstClearOnThisBoard = firstClearDiscoveredOnBoard(readStoredHub(), board.seed);

function saveFrontProgress(): void {
  const justWon = board.status === "won" && lastSavedStatus !== "won";
  const r = persistFrontSessionWithClear(board, selected, undefined, { justWon });
  if (r.saved) lastSavedStatus = board.status;
  else lastBoardLog = "進捗を保存できませんでした。段位の更新は保存されていません。";
  if (r.discovered) firstClearOnThisBoard = true;
}

function tradeBaseUrl(): string {
  return resolveModuleBaseUrl("trade");
}

function exploreBaseUrl(): string {
  return resolveModuleBaseUrl("explore");
}

function forcedLockActive(): boolean {
  return isForcedCombatLock(board);
}

function armForcedLockIfNeeded(): void {
  if (!forcedLockActive() || forcedLockHistoryArmed) return;
  armForcedLockHistory();
  forcedLockHistoryArmed = true;
}

function bindForcedHandoffLinks(scope: ParentNode): void {
  scope.querySelectorAll<HTMLAnchorElement>("a[data-forced-handoff]").forEach((a) => {
    a.addEventListener("click", () => {
      markForcedHandoffIntent();
    });
  });
}

function lostIdsAt(sx: number, sy: number): string[] {
  return lostByCell.get(cellKey(sx, sy)) ?? [];
}

function dropCircuitIdsAt(sx: number, sy: number): string[] {
  return dropsByCell.get(cellKey(sx, sy)) ?? [];
}

function wreckIdsAt(sx: number, sy: number): string[] {
  return wrecksByCell.get(cellKey(sx, sy)) ?? [];
}

/** Sortie bar + lines when left-behind mechs or circuit field drops wait on the selected cell. */
function cellSortieBarHtml(sel: SectorSel | null): string {
  const html = cellSortieBarBaseHtml(sel);
  if (sel == null) return html;
  const lostN = lostIdsAt(sel.sx, sel.sy).length;
  const dropN = dropCircuitIdsAt(sel.sx, sel.sy).length;
  const wreckN = wreckIdsAt(sel.sx, sel.sy).length;
  const lines: string[] = [];
  if (lostN > 0) {
    lines.push(`<p class="muted lost-mech-line">${escapeHtml(lostMechSortieLineJa(lostN))}</p>`);
  }
  if (wreckN > 0) {
    lines.push(`<p class="muted wreck-line">${escapeHtml(wreckSortieLineJa(wreckN))}</p>`);
  }
  if (dropN > 0) {
    lines.push(`<p class="muted field-drop-line">${escapeHtml(fieldDropSortieLineJa(dropN))}</p>`);
  }
  if (lines.length === 0) return html;
  const extra = lines.join("");
  const at = html.indexOf("</p>");
  return at < 0 ? html + extra : html.slice(0, at + 4) + extra + html.slice(at + 4);
}

let rankListPage = Math.floor(invadeRankOf(readStoredHub()).current / 100);
const RANK_PAGE_SIZE = 100;
function rankPanelHtml(): string {
  const hub = readStoredHub();
  const progress = invadeRankOf(hub);
  const max = unlockedInvadeRank(hub);
  const start = Math.min(rankListPage * RANK_PAGE_SIZE, Math.floor(max / RANK_PAGE_SIZE) * RANK_PAGE_SIZE);
  const ranks = Array.from({length:Math.min(RANK_PAGE_SIZE,max-start+1)},(_,i)=>start+i);
  const options = ranks.map(i=>`<option value="${i}" ${i===progress.current?'selected':''}>${i}段</option>`).join('');
  const lower = ranks.filter(i=>i<progress.current).map(i=>`<option value="${i}">${i}段</option>`).join('');
  const locked = forcedLockActive();
  return `<section class="card" id="rank-panel"><h2>段位</h2><p>挑戦中 ${progress.current}段 · 解放済み 0〜${max}段</p>
    ${max>=RANK_PAGE_SIZE ? `<p>一覧 ${start}〜${start+ranks.length-1}段 <button type="button" id="rank-page-prev" ${start===0?'disabled':''}>前の100段</button><button type="button" id="rank-page-next" ${start+ranks.length>max?'disabled':''}>次の100段</button></p>` : ''}
    <label>次に挑む段 <select id="rank-select" ${locked || board.status!=='won'?'disabled':''}>${options}</select></label>
    <button type="button" id="btn-rank-start" ${locked || board.status!=='won'?'disabled':''}>選んだ段に挑む</button>
    <label>撤退先 <select id="rank-retreat-select" ${locked || !lower?'disabled':''}>${lower}</select></label>
    <button type="button" id="btn-rank-retreat" ${locked || !lower || board.status==='won'?'disabled':''}>この盤面を諦めて下の段へ</button>
  </section>`;
}
function moveToRank(rank:number, retreat:boolean):void {
  if(forcedLockActive())return;
  const current=invadeRankOf(readStoredHub()).current;
  if(retreat ? rank>=current || board.status==='won' : board.status!=='won')return;
  if(!window.confirm(`${retreat?'この盤面を諦めて':'新しい盤面で'}${rank}段に挑みますか？`))return;
  const session=changeFrontRank(rank);
  if(!session){lastBoardLog='段を変更できませんでした。保存状態を確認してください。';render();return;}
  board=session.board; selected=session.focus; lastSavedStatus=board.status;
  firstClearOnThisBoard=firstClearDiscoveredOnBoard(readStoredHub(),board.seed);
  lostByCell=session.lostByCell;dropsByCell=session.dropsByCell;wrecksByCell=session.wrecksByCell;
  skipped=false;reversedTouch=false;forcedLockHistoryArmed=false;
  rankListPage=Math.floor(rank/RANK_PAGE_SIZE);
  boardInput.reset();lastBoardLog=`${rank}段の盤を開始`;render();
}

/** Single under-grid CTA cluster: 探索へ (+ engage chip) · 格納庫へ. */
function cellSortieBarBaseHtml(sel: SectorSel | null): string {
  if (sel == null) {
    return `<p class="muted cell-sortie-hint">セルを開く／旗すると、この直下から「${CTA_COPY.toExplore}」できます。</p>`;
  }
  const info = sectorDensityAt(sel.sx, sel.sy);
  if (info.blocked) {
    return `<p class="muted cell-sortie-hint">壁セルでは出撃できません。</p>`;
  }
  const cell = getCell(board, sel.sx, sel.sy);
  const locked = forcedLockActive();
  const base = sectorPayload(sel);
  const toTrade = buildInvadeToTradeUrl(base, tradeBaseUrl());
  const hangarBtn = `<a class="btn secondary" href="${escapeHtml(toTrade)}" target="_top" rel="noopener">${CTA_COPY.toHangar}</a>`;

  const forcedTargets =
    cell && cell.open && cell.mine
      ? forcedEngageTargets(board, sel.sx, sel.sy)
      : [];
  const forcedPayload =
    forcedTargets.length > 0
      ? sectorPayload(sel, { mode: "forced", enemyCells: forcedTargets })
      : null;
  const toForced =
    forcedPayload != null
      ? buildInvadeToExploreUrl(forcedPayload, exploreBaseUrl())
      : null;

  if (locked) {
    if (toForced == null) {
      return `<div class="cell-sortie-bar locked" role="alert">
        <p class="warn"><strong>強制戦闘ロック</strong> — 他操作不可。</p>
        <p class="muted">地雷マスを選ぶと「${CTA_COPY.toExplore}」（${CTA_CHIP.forcedCombat}）が表示されます。</p>
      </div>`;
    }
    return `<div class="cell-sortie-bar locked" role="alert">
      <p class="warn"><strong>強制戦闘ロック</strong>（地雷踏み）— 解決／ハンドオフまで他操作不可。</p>
      <p class="muted mono">cell (${sel.sx},${sel.sy}) · enemyCells: ${escapeHtml(formatEnemyCells(forcedTargets))}</p>
      <div class="actions cta-cluster">
        <span class="cta-chip danger" aria-label="${CTA_CHIP.forcedCombat}">${CTA_CHIP.forcedCombat}</span>
        <a class="btn danger" data-forced-handoff href="${escapeHtml(toForced)}" target="_top" rel="noopener">${CTA_COPY.toExplore}</a>
      </div>
    </div>`;
  }

  const raidTargets =
    cell && cell.flagged && !cell.open
      ? raidEngageTarget(board, sel.sx, sel.sy)
      : [];
  const raidPayload =
    raidTargets.length > 0
      ? sectorPayload(sel, { mode: "raid", enemyCells: raidTargets })
      : null;
  const toRaid =
    raidPayload != null
      ? buildInvadeToExploreUrl(raidPayload, exploreBaseUrl())
      : null;

  const toExplore = buildInvadeToExploreUrl(base, exploreBaseUrl());

  if (toRaid != null) {
    return `<div class="cell-sortie-bar" role="status">
      <p class="ok"><strong>このセルから出撃</strong>（旗 · engage=raid）</p>
      <p class="muted mono">(${sel.sx},${sel.sy}) · enemyCells: ${escapeHtml(formatEnemyCells(raidTargets))}</p>
      <div class="actions cta-cluster">
        <span class="cta-chip" aria-label="${CTA_CHIP.raid}">${CTA_CHIP.raid}</span>
        <a class="btn" href="${escapeHtml(toRaid)}" target="_top" rel="noopener">${CTA_COPY.toExplore}</a>
        ${hangarBtn}
      </div>
    </div>`;
  }

  // Resolved open mine (#75 cleared hitMine): still sortie-able, distinct look/copy
  if (cell && isResolvedMineCell(cell, board) && toForced != null) {
    return `<div class="cell-sortie-bar resolved" role="status">
      <p class="ok"><strong>交戦解決済</strong> — ${CTA_COPY.sortieAgain}できます（${sel.sx},${sel.sy}）</p>
      <p class="muted mono">cell (${sel.sx},${sel.sy}) · enemyCells: ${escapeHtml(formatEnemyCells(forcedTargets))} · ロック解除済</p>
      <div class="actions cta-cluster">
        <span class="cta-chip" aria-label="${CTA_CHIP.forcedCombat}">${CTA_CHIP.forcedCombat}</span>
        <a class="btn" href="${escapeHtml(toForced)}" target="_top" rel="noopener">${CTA_COPY.toExplore}</a>
        ${hangarBtn}
      </div>
    </div>`;
  }

  if (cell && (cell.open || cell.flagged)) {
    const blankHint =
      cell.open && !cell.mine && cell.adjacent === 0
        ? " · 探索済空白"
        : cell.flagged
          ? " · 旗"
          : "";
    return `<div class="cell-sortie-bar" role="status">
      <p class="ok"><strong>このセルから出撃</strong>（${sel.sx},${sel.sy}${blankHint}）</p>
      <div class="actions cta-cluster">
        <a class="btn" href="${escapeHtml(toExplore)}" target="_top" rel="noopener">${CTA_COPY.toExplore}</a>
        ${hangarBtn}
      </div>
    </div>`;
  }

  return `<div class="cell-sortie-bar" role="status">
    <p class="muted">セル (${sel.sx},${sel.sy}) を開くか旗を立てると、ここから出撃できます。</p>
  </div>`;
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
  engage?: { mode: EngageMode; enemyCells: EnemyCellCoord[] },
): InvadeToTradePayload & InvadeToExplorePayload {
  const info = sectorDensityAt(sel.sx, sel.sy);
  const out: InvadeToTradePayload & InvadeToExplorePayload = {
    sectorX: sel.sx,
    sectorY: sel.sy,
    density: densityAfterBoard(info.density, board),
    invadeRank: invadeRankOf(readStoredHub()).current,
    neighborCount: getCell(board,sel.sx,sel.sy)?.adjacent ?? 0,
    intelFlags: mergeBoardIntel(baseIntelFlags(sel.sx, sel.sy), board),
  };
  if (engage != null) {
    out.engage = engage.mode;
    if (engage.enemyCells.length > 0) out.enemyCells = engage.enemyCells;
  }
  return out;
}

function formatEnemyCells(cells: readonly EnemyCellCoord[]): string {
  return cells.map((c) => `(${c.sx},${c.sy})`).join(" · ") || "—";
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
  if (forcedLockActive()) {
    return `<p class="warn">強制戦闘ロック中 — グリッド直下の「${CTA_COPY.toExplore}」（${CTA_CHIP.forcedCombat}）のみ可。</p>
      <p class="muted">${CTA_COPY.toHangar}／通常出撃／盤面操作はハンドオフまで禁止。</p>`;
  }
  if (sel == null) {
    return `<p class="muted">セルを開く／旗／選択するとグリッド直下に「${CTA_COPY.toExplore}」と「${CTA_COPY.toHangar}」が出ます（invade→explore / invade→trade）。</p>`;
  }
  const info = sectorDensityAt(sel.sx, sel.sy);
  if (info.blocked) {
    return `<p class="muted">壁セルはルートにできません。内側のセクターを選んでください。</p>`;
  }
  const cell = getCell(board, sel.sx, sel.sy);
  const base = sectorPayload(sel);
  const flags = (base.intelFlags ?? []).join(", ") || "—";

  const forcedTargets =
    cell && cell.open && cell.mine
      ? forcedEngageTargets(board, sel.sx, sel.sy)
      : [];
  const raidTargets =
    cell && cell.flagged && !cell.open
      ? raidEngageTarget(board, sel.sx, sel.sy)
      : [];

  let engageNote = `<p class="muted" style="margin-top:0.5rem">地雷踏み → ${CTA_CHIP.forcedCombat}（隣接敵も巻込み）。旗を立ててそのセルを選択 → ${CTA_CHIP.raid}（当該のみ）。CTA はグリッド直下の単一クラスタのみ。</p>`;
  if (forcedTargets.length > 0 && cell && isPendingMineCell(cell, board)) {
    engageNote = `<p class="warn" style="margin-top:0.5rem"><strong>${CTA_CHIP.forcedCombat}</strong> · enemyCells: ${escapeHtml(formatEnemyCells(forcedTargets))}（ロック中 · CTA は直下）</p>`;
  } else if (forcedTargets.length > 0 && cell && isResolvedMineCell(cell, board)) {
    engageNote = `<p class="ok" style="margin-top:0.5rem"><strong>解決済接触</strong> — ${CTA_COPY.sortieAgain}可 · enemyCells: ${escapeHtml(formatEnemyCells(forcedTargets))}</p>`;
  } else if (raidTargets.length > 0) {
    engageNote = `<p class="ok" style="margin-top:0.5rem"><strong>${CTA_CHIP.raid}</strong> · enemyCells: ${escapeHtml(formatEnemyCells(raidTargets))}</p>`;
  }

  return `
    <p class="muted mono">route (${sel.sx},${sel.sy}) · density: ${base.density.toFixed(3)} · intelFlags: ${escapeHtml(flags)}</p>
    <p class="muted">出撃／格納庫のボタンはグリッド直下の CTA クラスタに集約（重複なし）。</p>
    ${engageNote}
    <p class="muted" style="margin-top:0.5rem">地雷マス＝敵位置。engage / enemyCells は explore が戦闘に使う（本 salvage なし）。</p>
  `;
}

function statusJa(): string {
  if (board.status === "won") return "前線掃討完了";
  if (board.status === "hazard" || board.hitMine) return "接触（hazard・強制戦闘ロック中）";
  const feel = frontProgressFeel(board);
  if (feel.openedMines > 0) return `偵察中（解決済接触 ${feel.openedMines} · 再出撃可）`;
  return `偵察中 — ${exploredFeelLabelJa(feel.exploredFeel)}`;
}

/** Existing cell tooltip + " · " + the left-behind mech IDs and circuit field drops. */
function cellTitleWithLost(cell: ReturnType<typeof getCell>): string {
  const base = cellTitle(cell);
  if (!cell) return base;
  const extras: string[] = [];
  const lostExtra = lostMechTitleJa(lostIdsAt(cell.sx, cell.sy));
  if (lostExtra) extras.push(lostExtra);
  const wreckExtra = wreckTitleJa(wreckIdsAt(cell.sx, cell.sy));
  if (wreckExtra) extras.push(wreckExtra);
  const dropExtra = fieldDropTitleJa(dropCircuitIdsAt(cell.sx, cell.sy));
  if (dropExtra) extras.push(dropExtra);
  return extras.length > 0 ? `${base} · ${extras.join(" · ")}` : base;
}

function cellTitle(cell: ReturnType<typeof getCell>): string {
  if (!cell) return "";
  if (cell.blocked) return `(${cell.sx},${cell.sy}) WALL d≥${SECTOR_WALL_DISTANCE}`;
  const band = dangerBandAtCell(cell.sx, cell.sy);
  const bandJa = dangerBandLabelJa(band);
  if (cell.open) {
    if (cell.mine) {
      const st = mineCellStatusJa(cell, board) ?? "敵接触";
      return `(${cell.sx},${cell.sy}) ${st} · ${bandJa}`;
    }
    if (cell.isHq) return "HQ (0,0) — 拠点（開始開放）";
    if (cell.adjacent === 0) return `(${cell.sx},${cell.sy}) 探索済空白 · ${bandJa}`;
    return `(${cell.sx},${cell.sy}) 周囲敵 ${cell.adjacent} · ${bandJa}`;
  }
  if (cell.flagged) return `(${cell.sx},${cell.sy}) 旗 · ${bandJa}`;
  const d = sectorDensityAt(cell.sx, cell.sy).distance;
  return `(${cell.sx},${cell.sy}) 未開 d=${d} · ${bandJa}（${dangerBandHintJa(band)}）`;
}


function dangerLegendHtml(): string {
  const bands: Array<"near" | "mid" | "front"> = ["near", "mid", "front"];
  const swatches = bands
    .map((b) => {
      return `<span class="danger-swatch ${b}" title="${escapeHtml(dangerBandRangeJa(b))}"><span class="chip" aria-hidden="true"></span>${escapeHtml(dangerBandLabelJa(b))} · ${escapeHtml(dangerBandHintJa(b))}</span>`;
    })
    .join("");
  return `<div class="danger-legend" role="group" aria-label="危険度凡例">
    <span class="danger-swatch blank"><span class="chip" aria-hidden="true"></span>探索済空白</span>
    <span class="danger-swatch flag"><span class="chip" aria-hidden="true"></span>旗</span>
    <span class="danger-swatch pending"><span class="chip" aria-hidden="true"></span>敵接触・未解決</span>
    <span class="danger-swatch resolved"><span class="chip" aria-hidden="true"></span>解決済・再出撃可</span>
    <span class="danger-swatch lost-mech"><span class="chip" aria-hidden="true"></span>置き去り機</span>
    <span class="danger-swatch wreck"><span class="chip" aria-hidden="true"></span>残骸</span>
    <span class="danger-swatch field-drop"><span class="chip" aria-hidden="true"></span>落とし物</span>
    ${swatches}
  </div>
  <p class="muted" style="margin-top:0.35rem;font-size:0.72rem">未開マスの色は HQ からの距離帯（爆弾密度の手触り）。近傍薄 → 前線濃。</p>`;
}

function progressFeelHtml(): string {
  const feel = frontProgressFeel(board);
  const pct = Math.round(feel.openSafeRatio * 100);
  return `<div class="progress-feel" role="status" aria-label="前線進捗">
    <p class="muted" style="margin:0;font-size:0.78rem"><strong style="color:#e8eaed">前線進捗</strong> — ${escapeHtml(exploredFeelLabelJa(feel.exploredFeel))}</p>
    <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${pct}%"></div></div>
    <div class="stats">
      <span>セーフ開放 <strong>${feel.openSafe}</strong>/${feel.playableSafe}（${pct}%）</span>
      <span>空白 <strong>${feel.blanksOpen}</strong></span>
      <span>旗 <strong>${feel.flagged}</strong></span>
      <span>残敵 <strong>${feel.minesRemaining}</strong>/${feel.mineCount}</span>
      <span>解決済接触 <strong>${board.hitMine ? 0 : feel.openedMines}</strong></span>
    </div>
  </div>`;
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
      const lostCount = lostIdsAt(sx, sy).length;
      const dropCount = dropCircuitIdsAt(sx, sy).length;
      const wreckCount = wreckIdsAt(sx, sy).length;
      const feel = cellFeelClasses(c, board);
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
        lostCount > 0 ? "lost-mech" : "",
        dropCount > 0 ? "field-drop" : "",
        wreckCount > 0 ? "wreck" : "",
        !c.blocked && !c.open ? "pickable" : "",
        c.open && !c.blocked ? "focusable" : "",
        ...feel,
      ]
        .filter(Boolean)
        .join(" ");
      const disabled = c.blocked ? "disabled" : "";
      const lostAttr = lostCount > 0 ? ` data-lost-count="${lostCount}"` : "";
      const dropAttr = dropCount > 0 ? ` data-drop-count="${dropCount}"` : "";
      const wreckAttr = wreckCount > 0 ? ` data-wreck-count="${wreckCount}"` : "";
      // 項目5-1b③: the wreck dot is a child (the cell's ::before / ::after are the drop / left-behind dots).
      const wreckDot = wreckCount > 0 ? `<span class="wreck-dot" aria-hidden="true"></span>` : "";
      cellsHtml.push(
        `<button type="button" class="${cls}" data-sx="${sx}" data-sy="${sy}"${lostAttr}${dropAttr}${wreckAttr} title="${escapeHtml(cellTitleWithLost(c))}" ${disabled}>${escapeHtml(cellGlyph(c, { hitMine: board.hitMine }))}${wreckDot}</button>`,
      );
    }
  }

  const selInfo =
    selected != null ? sectorDensityAt(selected.sx, selected.sy) : null;
  const showFrontWarn =
    selInfo != null &&
    !selInfo.blocked &&
    selInfo.distance >= SECTOR_FRONT_DISTANCE;

  const resolvedMineCount = frontProgressFeel(board).openedMines;
  const statusBanner =
    board.status === "won"
      ? `<div class="banner ok-banner" role="status">前線掃討完了 — sectorCleared。探索へ敵残ゼロのインテルを渡せます。${
          firstClearOnThisBoard ? `<br /><span data-first-clear-discovery>${escapeHtml(FIRST_CLEAR_DISCOVERY_LINE_JA)}</span>` : ""
        }</div>`
      : board.hitMine || board.status === "hazard"
        ? `<div class="banner warn-banner" role="status">敵接触（scoutHazard）。強制戦闘ロック — 強制出撃のみ可。</div>`
        : resolvedMineCount > 0
          ? `<div class="banner ok-banner" role="status">交戦解決済の接触マスが ${resolvedMineCount} — 「済」セルから再出撃できます（盤操作も再開）。</div>`
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
      <p class="muted">P(敵) は HQ からの Chebyshev d で上昇（近傍薄・前線濃）。未開マスの色＝危険帯。空白＝探索済。✕＝未解決接触、済＝解決済・再出撃可。マウスは左クリックで開く・右クリックで旗。タッチは下の操作割当を確認してください。数字の周囲開放は旗数一致時のみ。</p>
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
      ${progressFeelHtml()}
      ${dangerLegendHtml()}
      ${rankPanelHtml()}
      <div id="board-viewport" aria-label="前線盤面"><div class="grid front-ms${forcedLockActive() ? " locked" : ""}" style="--cols:${cols}">${cellsHtml.join("")}</div></div>
      ${cellSortieBarHtml(selected)}
      <div class="actions">
        <button type="button" class="btn secondary" id="btn-touch-mode" aria-pressed="${reversedTouch}" ${forcedLockActive() ? "disabled" : ""}>タッチ操作を反転：${reversedTouch ? "ON（タップで開く）" : "OFF（タップで旗）"}</button>
        <button type="button" class="btn ghost" id="btn-regen" title="保存済みの開いたマス・旗・シードを破棄して新しい盤にします" ${forcedLockActive() ? "disabled" : ""}>盤を再生成（進捗リセット）</button>
        <button type="button" class="btn ghost" id="btn-clear" ${selected == null || forcedLockActive() ? "disabled" : ""}>焦点クリア</button>
        <button type="button" class="btn ghost" id="btn-skip" ${forcedLockActive() ? "disabled" : ""}>スキップ（quick-battle・ナビなし）</button>
      </div>
      ${buildFlagOpsGuideHtml(reversedTouch)}
      <p class="muted" style="margin-top:0.5rem">開いたマス・旗・地雷シード・ルート焦点は HubSave.frontProgress に自動保存（リロード後も復元）。「盤を再生成」は確認のうえ進捗を消します。</p>
      <p class="ok" style="margin-top:0.5rem">報酬はインテルのみ。コンテナ／YieldBag は払わない。</p>
    </div>

    <div class="card">
      <h2 class="card-title">出発ハンドオフ</h2>
      ${handoffActionsHtml(selected)}
    </div>
  `;

    armForcedLockIfNeeded();
  bindForcedHandoffLinks(root);

  root.querySelector("#btn-touch-mode")?.addEventListener("click",()=>{
    if(forcedLockActive())return;
    boardInput.cancel();reversedTouch=!reversedTouch;render();
  });
  root.querySelector("#rank-page-prev")?.addEventListener("click",()=>{rankListPage=Math.max(0,rankListPage-1);render();});
  root.querySelector("#rank-page-next")?.addEventListener("click",()=>{rankListPage++;render();});
  root.querySelector("#btn-rank-start")?.addEventListener("click",()=>moveToRank(Number(root.querySelector<HTMLSelectElement>("#rank-select")?.value),false));
  root.querySelector("#btn-rank-retreat")?.addEventListener("click",()=>moveToRank(Number(root.querySelector<HTMLSelectElement>("#rank-retreat-select")?.value),true));
  root.querySelector("#btn-regen")?.addEventListener("click", () => {
    if (forcedLockActive()) return;
    const ok = window.confirm(
      "盤を再生成すると、保存済みの前線進捗（開いたマス・旗・地雷シード・ルート焦点）が消えます。よろしいですか？",
    );
    if (!ok) return;
    clearPersistedFrontProgress();
    const session = regenerateFrontSession();
    boardInput.reset();
    board = session.board;
    selected = session.focus;
    lastSavedStatus = board.status;
    firstClearOnThisBoard = firstClearDiscoveredOnBoard(readStoredHub(), board.seed);
    lostByCell = session.lostByCell;
    dropsByCell = session.dropsByCell;
    wrecksByCell = session.wrecksByCell;
    skipped = false;
    reversedTouch = false;
    forcedLockHistoryArmed = false;
    lastBoardLog = `盤再生成（進捗リセット）— 敵 ${board.mineCount} · HQ 開放 · seed ${board.seed ?? "—"}`;
    render();
  });

  root.querySelector("#btn-clear")?.addEventListener("click", () => {
    if (forcedLockActive()) return;
    selected = { sx: 0, sy: 0 };
    skipped = false;
    lastBoardLog = "ルート焦点を HQ に戻した";
    saveFrontProgress();
    render();
  });

  root.querySelector("#btn-skip")?.addEventListener("click", () => {
    if (forcedLockActive()) return;
    selected = null;
    skipped = true;
    reversedTouch = false;
    lastBoardLog = "quick-battle スキップ（ナビなし）";
    saveFrontProgress();
    render();
  });

  boardInput.paint();
}

function applyBoardAction(action:BoardAction,{sx,sy}:Coord):void {
  const cell=getCell(board,sx,sy);if(!cell||cell.blocked)return;
  if(forcedLockActive()){
    if(cell.open&&cell.mine){selected={sx,sy};skipped=false;saveFrontProgress();render();}
    return;
  }
  const flag=action==='right' || (action==='tap'&&!reversedTouch) || (action==='hold'&&reversedTouch);
  let chordHit:Coord|null=null;
  if(cell.open){
    if(!cell.mine && (action==='chord'||action==='tap')){
      const r=chordCells(board,sx,sy);chordHit=r.hit;
      lastBoardLog=`周囲開放 (${sx},${sy}) ×${r.opened}`;
    } else lastBoardLog=`ルート焦点 (${sx},${sy})`;
  } else if(action==='chord')return;
  else if(flag){const r=toggleFlag(board,sx,sy);if(!r.ok)return;lastBoardLog=r.flagged?`旗立て (${sx},${sy})`:`旗解除 (${sx},${sy})`;}
  else {
    const r=openCell(board,sx,sy);
    if(!r.ok){if(r.reason==='flagged'){selected={sx,sy};skipped=false;lastBoardLog=`旗付きマス (${sx},${sy}) は開けません`;saveFrontProgress();render();}return;}
    lastBoardLog=`開放 (${sx},${sy}) ×${r.opened} · 残敵 ${minesRemaining(board)}`;
  }
  selected=chordHit??{sx,sy};skipped=false;
  if(board.hitMine){lastBoardLog=`敵接触 (${selected.sx},${selected.sy}) → scoutHazard · 強制出撃 敵 ${forcedEngageTargets(board,selected.sx,selected.sy).length} マス`;}
  else if(board.status==='won')lastBoardLog='掃討完了 → sectorCleared';
  saveFrontProgress();render();
}
const boardInput=bindBoardInput(root,applyBoardAction);

render();

// Silence unused import when tree-shaken oddly in some bundlers

armForcedLockIfNeeded();

window.addEventListener("popstate", () => {
  if (!forcedLockBackAction(board).block) return;
  forcedLockHistoryArmed = false;
  armForcedLockIfNeeded();
});

mountShieldDebugConsole();
