import "./style.css";
import {
  BASIC_MATERIAL_LABEL_JA,
  PART_LABEL_JA,
  buildSortToTradeUrlFromResult,
  importedMaterialsFromResult,
  isBasicMaterialId,
  isPartId,
  resolveModuleBaseUrl,
  type YieldItemId,
} from "@estg/shared";
import {
  PIECE_LABEL_JA,
  SORT_V0_RULES,
  commitClearStep,
  createRefineFromLocationSearch,
  demoQueryExample,
  finishRefine,
  startRefine,
  swapPanels,
  tapCell,
  toCraftingResult,
  type PieceKind,
  type RefineLive,
} from "./refine";

const root = document.querySelector<HTMLDivElement>("#app")!;
let state: RefineLive = createRefineFromLocationSearch(window.location.search);
let chainTimer: ReturnType<typeof setTimeout> | null = null;

function tradeBaseUrl(): string {
  return resolveModuleBaseUrl("trade");
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function labelYield(id: string): string {
  if (isBasicMaterialId(id)) return BASIC_MATERIAL_LABEL_JA[id];
  if (isPartId(id)) return PART_LABEL_JA[id];
  return id;
}

function pieceClass(kind: PieceKind | null): string {
  if (kind == null) return "cell empty";
  return `cell ${kind}`;
}

function clearChainTimer() {
  if (chainTimer != null) {
    clearTimeout(chainTimer);
    chainTimer = null;
  }
}

function scheduleChainWindow() {
  clearChainTimer();
  if (state.phase !== "play" || state.playMode !== "clearing") return;
  const delay = Math.max(120, state.chainWindowMsLeft || SORT_V0_RULES.chainWindowMs);
  chainTimer = setTimeout(() => {
    state = commitClearStep(state);
    render();
    if (state.playMode === "clearing") {
      scheduleChainWindow();
    }
  }, delay);
}

function setState(next: RefineLive) {
  const wasClearing = state.playMode === "clearing";
  state = next;
  if (state.playMode === "clearing") {
    // (Re)arm window on enter or when mid-chain swap extends it.
    scheduleChainWindow();
  } else if (wasClearing) {
    clearChainTimer();
  }
  render();
}

function boardHtml(s: RefineLive): string {
  const pending = new Set(s.pendingClear);
  const cells = s.board
    .map((kind, i) => {
      const extras = [
        pending.has(i) ? "pending" : "",
        s.selected === i ? "selected" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const label = kind == null ? "" : PIECE_LABEL_JA[kind].slice(0, 1);
      const title =
        kind == null
          ? ""
          : kind === "junk"
            ? "ジャンク（消去不可）"
            : PIECE_LABEL_JA[kind];
      return `<button type="button" class="${pieceClass(kind)}${extras ? ` ${extras}` : ""}" data-idx="${i}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title || "空")}">${escapeHtml(label)}</button>`;
    })
    .join("");
  return `<div class="board" style="--cols:${s.cols}" role="grid" aria-label="精製盤">${cells}</div>`;
}

function controlsHtml(s: RefineLive): string {
  const chainHint =
    s.playMode === "clearing"
      ? `<p class="hint ok">連鎖ウィンドウ！ 消える前にスワップして次のマッチを仕込もう（×${s.chainCount}）</p>`
      : `<p class="hint muted">タップで選択→上下左右の隣をタップ、またはスワイプでスワップ。消えたあと上から補充。せり上げ／トップアウトなし。</p>`;
  return `
    <div class="controls" aria-label="操作">
      <p class="hint muted" style="margin:0">スマホ: スワイプで隣と入れ替え · 点滅中もスワイプ可（アクティブ連鎖）</p>
    </div>
    ${chainHint}
  `;
}

function yieldBagRows(bag: Record<string, number | undefined>): string {
  const entries = Object.entries(bag).filter(([, n]) => (n ?? 0) > 0) as Array<
    [YieldItemId, number]
  >;
  if (entries.length === 0) {
    return `<tr><td colspan="2" class="muted">（空）</td></tr>`;
  }
  return entries
    .map(
      ([id, n]) =>
        `<tr><td>${escapeHtml(labelYield(id))}<div class="mono muted">${escapeHtml(id)}</div></td><td>${n}</td></tr>`,
    )
    .join("");
}

function render() {
  const result = state.phase === "result" ? toCraftingResult(state) : null;
  const handoffUrl =
    result != null
      ? buildSortToTradeUrlFromResult(result, tradeBaseUrl())
      : "";
  const importMats =
    result != null ? importedMaterialsFromResult(result) : 0;

  root.innerHTML = `
    <p class="pill">MODULE 2 · SORT · ZOO KEEPER + ACTIVE CHAIN</p>
    <h1>Athanor 精製（Zoo Keeper）</h1>
    <p class="muted">コンテナ予算→有効ピース。盤は<strong>最初から埋まっている</strong>。パネルを<strong>上下左右</strong>の隣とスワップして 3 つ以上そろえると消去→上から補充。消去ウィンドウ中もスワップして<strong>アクティブ連鎖</strong>を伸ばせる。せり上げ／トップアウトなし。ジャンクは消えない。</p>

    <div class="card">
      <div class="muted">${escapeHtml(state.note)}</div>
      <table>
        <tr><td>salvagedContainers</td><td>${state.inbound.salvagedContainers}</td></tr>
        <tr><td>validPieceBudget</td><td>${state.validPieceBudget}</td></tr>
        <tr><td>invalidPieceCount</td><td>${state.invalidPieceCount}</td></tr>
        <tr><td>isExtracted</td><td>${String(state.inbound.isExtracted)}</td></tr>
        <tr><td>craftMultiplier</td><td>${(state.inbound.craftMultiplier ?? 1).toFixed(3)}</td></tr>
      </table>
      <p class="mono muted" style="margin-top:0.5rem">サンプル: ${escapeHtml(demoQueryExample())}</p>
    </div>

    ${
      state.phase === "blocked"
        ? `<div class="card">
            <p class="warn">${escapeHtml(state.blockReason ?? "開始不可")}</p>
            <p class="muted">クエリ例を付けてリロードしてください。</p>
            <div class="row">
              <a class="btn secondary" href="${escapeHtml(demoQueryExample())}">デモクエリで開く</a>
            </div>
          </div>`
        : ""
    }

    ${
      state.phase === "briefing"
        ? `<div class="card">
            <p>配合フェーズなし。<strong>盤面は開始時に埋まっています</strong>（Zoo Keeper）。パネルを<strong>上下左右の隣とスワップ</strong>して同色を縦・横に 3 つ以上そろえると消去→重力→袋から上補充。消えるあいだもスワップでき、<strong>アクティブ連鎖</strong>でコンボを伸ばせます。せり上げ圧・トップアウトはありません。ジャンクはマッチしません。</p>
            <div class="row">
              <button type="button" id="btn-start">精製開始</button>
            </div>
          </div>`
        : ""
    }

    ${
      state.phase === "play"
        ? `<div class="card play-card">
            <table>
              <tr><td>残り手数</td><td>${state.movesLeft}</td></tr>
              <tr><td>袋の残り</td><td>${state.bag.length}</td></tr>
              <tr><td>消去 食料/部品/電力</td><td>${state.cleared.food} / ${state.cleared.material} / ${state.cleared.energy}</td></tr>
              <tr><td>連鎖</td><td>${state.playMode === "clearing" ? `進行中 ×${state.chainCount}` : state.lastChain > 0 ? `前回 ×${state.lastChain}` : "—"}</td></tr>
            </table>
            <div class="legend">
              <span class="swatch food">食</span>
              <span class="swatch material">部</span>
              <span class="swatch energy">電</span>
              <span class="swatch junk">ジャ</span>
            </div>
            ${boardHtml(state)}
            ${
              state.statusMsg
                ? `<p class="ok status-msg">${escapeHtml(state.statusMsg)}</p>`
                : ""
            }
            ${controlsHtml(state)}
            <div class="row">
              <button type="button" class="secondary" id="btn-finish">精製を終える</button>
            </div>
          </div>`
        : ""
    }

    ${
      state.phase === "result" && result
        ? `<div class="card">
            <p class="ok">精製結果</p>
            <table>
              <tr><td>yieldFood</td><td>${result.yieldFood}</td></tr>
              <tr><td>yieldMaterial</td><td>${result.yieldMaterial}</td></tr>
              <tr><td>yieldEnergy</td><td>${result.yieldEnergy}</td></tr>
              <tr><td>scrapLossCount</td><td>${result.scrapLossCount}</td></tr>
              <tr><td>craftMultiplier</td><td>${result.craftMultiplier.toFixed(3)}</td></tr>
              <tr><td>importMaterials</td><td>${importMats}</td></tr>
              <tr><td>lastChain</td><td>×${state.lastChain}</td></tr>
            </table>
            <h2 class="sub">YieldBag</h2>
            <table>${yieldBagRows(result.yieldBag ?? {})}</table>
            <div class="row">
              <a class="btn" href="${escapeHtml(handoffUrl)}" target="_top" rel="noopener">格納庫へ渡す</a>
              <button type="button" class="secondary" id="btn-again">もう一度</button>
            </div>
            <p class="mono muted" style="margin-top:0.75rem">${escapeHtml(handoffUrl)}</p>
          </div>`
        : ""
    }
  `;

  document.getElementById("btn-start")?.addEventListener("click", () => {
    setState(startRefine(state));
  });
  document.getElementById("btn-finish")?.addEventListener("click", () => {
    clearChainTimer();
    setState(finishRefine(state));
  });
  document.getElementById("btn-again")?.addEventListener("click", () => {
    clearChainTimer();
    setState(createRefineFromLocationSearch(window.location.search));
  });
  root.querySelectorAll<HTMLButtonElement>("button.cell[data-idx]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const idx = Number(btn.dataset.idx);
      if (!Number.isFinite(idx)) return;
      setState(tapCell(state, idx));
    });
  });
}

// Keyboard: arrows swap with selected neighbor (Shift+arrow moves selection)
window.addEventListener("keydown", (e) => {
  if (state.phase !== "play") return;
  if (state.selected == null) return;
  const cols = state.cols;
  const sel = state.selected;
  const r = Math.floor(sel / cols);
  const c = sel % cols;
  let target: number | null = null;
  if (e.key === "ArrowLeft" && c > 0) target = sel - 1;
  if (e.key === "ArrowRight" && c + 1 < cols) target = sel + 1;
  if (e.key === "ArrowUp" && r > 0) target = sel - cols;
  if (e.key === "ArrowDown" && r + 1 < state.rows) target = sel + cols;
  if (target == null) return;
  e.preventDefault();
  if (e.shiftKey) {
    setState({ ...state, selected: target });
  } else {
    setState(swapPanels(state, sel, target));
  }
});

// Touch swipe on board cells: adjacent swap (H + V) — works during active-chain window
let touchStartX = 0;
let touchStartY = 0;
let touchIdx: number | null = null;
root.addEventListener(
  "touchstart",
  (e) => {
    if (state.phase !== "play" || e.touches.length !== 1) return;
    const t = e.touches[0]!;
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const cell = el?.closest?.("button.cell[data-idx]") as HTMLElement | null;
    if (!cell) {
      touchIdx = null;
      return;
    }
    touchIdx = Number(cell.dataset.idx);
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  },
  { passive: true },
);
root.addEventListener(
  "touchend",
  (e) => {
    if (state.phase !== "play" || touchIdx == null || e.changedTouches.length !== 1) {
      touchIdx = null;
      return;
    }
    const t = e.changedTouches[0]!;
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = 24;
    const cols = state.cols;
    const sel = touchIdx;
    touchIdx = null;

    if (absX < threshold && absY < threshold) {
      // Tap handled by click on button
      return;
    }

    const r = Math.floor(sel / cols);
    const c = sel % cols;
    let target: number | null = null;
    if (absX > absY) {
      if (dx > 0 && c + 1 < cols) target = sel + 1;
      if (dx < 0 && c > 0) target = sel - 1;
    } else {
      if (dy > 0 && r + 1 < state.rows) target = sel + cols;
      if (dy < 0 && r > 0) target = sel - cols;
    }
    if (target == null) return;
    e.preventDefault();
    setState(swapPanels(state, sel, target));
  },
  { passive: false },
);

render();
