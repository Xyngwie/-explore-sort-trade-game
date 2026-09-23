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
  createTestPlayRefine,
  demoQueryExample,
  finishRefine,
  resolveSwipeNeighbor,
  settleMotionIndices,
  startRefine,
  swapPanels,
  tapCell,
  testPlayQueryExample,
  tickSettleStep,
  toCraftingResult,
  TEST_PLAY_CONTAINERS,
  type PieceKind,
  type RefineLive,
} from "./refine";
import {
  buildResultRibbonHtml,
  resolveRestartState,
  type SessionSource,
} from "./resultOverlay";

const root = document.querySelector<HTMLDivElement>("#app")!;
let state: RefineLive = createRefineFromLocationSearch(window.location.search);
let chainTimer: ReturnType<typeof setTimeout> | null = null;
/** Cell indices to play fall-in animation on the next render (settle tick only). */
let fallInIndices: Set<number> = new Set();
/** Suppress the synthetic click that follows a successful touch/pen swipe. */
let suppressCellClick = false;
/** Session start source — used by 「もう一度」 to keep test-play budget. */
let sessionSource: SessionSource = "location";

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

function schedulePlayTimers() {
  clearChainTimer();
  if (state.phase !== "play") return;

  if (state.playMode === "clearing") {
    const delay = Math.max(
      80,
      state.chainWindowMsLeft || SORT_V0_RULES.clearBlinkMs,
    );
    chainTimer = setTimeout(() => {
      state = commitClearStep(state);
      render();
      schedulePlayTimers();
    }, delay);
    return;
  }

  if (state.playMode === "settling") {
    const delay = Math.max(40, SORT_V0_RULES.settleStepMs);
    chainTimer = setTimeout(() => {
      const before = state.board;
      state = tickSettleStep(state);
      fallInIndices = new Set(settleMotionIndices(before, state.board));
      render();
      fallInIndices = new Set();
      schedulePlayTimers();
    }, delay);
  }
}

function setState(next: RefineLive) {
  const prevMode = state.playMode;
  state = next;
  // Non-timer updates (swaps / taps) should not reuse stale fall-in marks.
  fallInIndices = new Set();
  if (
    state.playMode === "clearing" ||
    state.playMode === "settling" ||
    prevMode === "clearing" ||
    prevMode === "settling"
  ) {
    schedulePlayTimers();
  }
  render();
}

function boardHtml(s: RefineLive): string {
  const pending = new Set(s.pendingClear);
  const settleMs = SORT_V0_RULES.settleStepMs;
  const cells = s.board
    .map((kind, i) => {
      const extras = [
        pending.has(i) ? "pending" : "",
        s.selected === i ? "selected" : "",
        fallInIndices.has(i) && kind != null ? "fall-in" : "",
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
  const settling = s.playMode === "settling" ? " settling" : "";
  return `<div class="board${settling}" style="--cols:${s.cols};--settle-ms:${settleMs}ms" role="grid" aria-label="精製盤">${cells}</div>`;
}

function controlsHtml(s: RefineLive): string {
  const chainHint =
    s.playMode === "settling"
      ? `<p class="hint ok">落下補充中！ 着地済みの下段もスワップ可 — マッチすれば連鎖に加算（アクティブ連鎖 · ×${s.chainCount}）</p>`
      : s.playMode === "clearing"
        ? `<p class="hint ok">マッチ点滅中… 消えたあとゆっくり落下（約0.5秒/行）。落下中もスワップ可（×${s.chainCount}）</p>`
        : `<p class="hint muted">タップで選択→上下左右の隣をタップ、またはスワイプでスワップ。<strong>idle でマッチしないスワップは即終了</strong>。消えたあと上からゆっくり補充（約0.5秒/行）。落下・点滅中の仕込みスワップは無料。せり上げ／トップアウトなし。</p>`;
  return `
    <div class="controls" aria-label="操作">
      <p class="hint muted" style="margin:0">スマホ: スワイプで隣と入れ替え · <strong>落下補充中</strong>もスワップ可（アクティブ連鎖）</p>
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
    <p class="muted">コンテナ予算→有効ピースのみで開始。盤は<strong>最初から埋まっている</strong>。パネルを<strong>上下左右</strong>の隣とスワップして 3 つ以上そろえると消去→上から<strong>ゆっくり</strong>落下補充。落下中もスワップして<strong>アクティブ連鎖</strong>を伸ばせる。<strong>idle（連鎖外）でマッチしないスワップは即終了</strong>（残りを無限に並べ替えない）。せり上げ／トップアウトなし。<strong>有効がなくなったらオジャマ（ジャンク）だけが落ちて盤を埋める</strong>（マッチ不可）。</p>

    <div class="card">
      <div class="muted">${escapeHtml(state.note)}</div>
      <table>
        <tr><td>salvagedContainers</td><td>${state.inbound.salvagedContainers}</td></tr>
        <tr><td>validPieceBudget</td><td>${state.validPieceBudget}</td></tr>
        <tr><td>junk供給</td><td>有効袋が空になってから（固定比率なし）</td></tr>
        <tr><td>isExtracted</td><td>${String(state.inbound.isExtracted)}</td></tr>
        <tr><td>craftMultiplier</td><td>${(state.inbound.craftMultiplier ?? 1).toFixed(3)}</td></tr>
      </table>
      <p class="mono muted" style="margin-top:0.5rem">サンプル: ${escapeHtml(demoQueryExample())} · 長時間: ${escapeHtml(testPlayQueryExample())}</p>
    </div>

    ${
      state.phase === "blocked"
        ? `<div class="card">
            <p class="warn">${escapeHtml(state.blockReason ?? "開始不可")}</p>
            <p class="muted">クエリ例を付けてリロードしてください。</p>
            <div class="row">
              <a class="btn secondary" href="${escapeHtml(demoQueryExample())}">デモクエリで開く</a>
              <button type="button" class="secondary" id="btn-test-play">コンテナ${TEST_PLAY_CONTAINERS}でテストプレイ</button>
            </div>
          </div>`
        : ""
    }

    ${
      state.phase === "briefing"
        ? `<div class="card">
            <p>配合フェーズなし。<strong>盤面は開始時に埋まっています</strong>（Zoo Keeper）。パネルを<strong>上下左右の隣とスワップ</strong>して同色を縦・横に 3 つ以上そろえると消去→上から<strong>ゆっくり落下補充</strong>。<strong>穴が埋まりきるまえ</strong>もスワップでき、それが<strong>アクティブ連鎖</strong>です。<strong>idle でマッチしないスワップは即終了</strong>（残り並べ替えの無限ループ防止）。せり上げ圧・トップアウトはありません。最初は有効ピースのみ。<strong>有効がなくなったらオジャマだけが落ちて埋めます</strong>（マッチしません）。短いデモ予算なら下の「コンテナ${TEST_PLAY_CONTAINERS}でテストプレイ」を使うと長時間遊べます。</p>
            <div class="row">
              <button type="button" id="btn-start">精製開始</button>
              <button type="button" class="secondary" id="btn-test-play">コンテナ${TEST_PLAY_CONTAINERS}でテストプレイ</button>
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
              <tr><td>連鎖</td><td>${state.playMode === "clearing" || state.playMode === "settling" ? `進行中 ×${state.chainCount}${state.playMode === "settling" ? " · 落下中" : " · 点滅"}` : state.lastChain > 0 ? `前回 ×${state.lastChain}` : "—"}</td></tr>
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
        ? `<div class="result-stage">
            ${buildResultRibbonHtml(handoffUrl)}
            <div class="card result-summary">
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
              <p class="mono muted" style="margin-top:0.75rem">${escapeHtml(handoffUrl)}</p>
            </div>
          </div>`
        : ""
    }
  `;

  document.getElementById("btn-start")?.addEventListener("click", () => {
    setState(startRefine(state));
  });
  document.getElementById("btn-test-play")?.addEventListener("click", () => {
    clearChainTimer();
    // Dedicated long demo — does not alter explore handoff query defaults.
    sessionSource = "test-play";
    setState(startRefine(createTestPlayRefine(TEST_PLAY_CONTAINERS)));
  });
  document.getElementById("btn-finish")?.addEventListener("click", () => {
    clearChainTimer();
    setState(finishRefine(state));
  });
  document.getElementById("btn-again")?.addEventListener("click", () => {
    clearChainTimer();
    setState(resolveRestartState(sessionSource, window.location.search));
  });
  root.querySelectorAll<HTMLButtonElement>("button.cell[data-idx]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      // Swipe already consumed this gesture — ignore the trailing click.
      if (suppressCellClick) {
        suppressCellClick = false;
        return;
      }
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

// Pointer swipe on board cells: adjacent swap (H + V).
// Uses Pointer Events + setPointerCapture so:
// - settle-tick innerHTML rebuilds do not drop the gesture
// - pointerup outside the board still resolves
// - touch-action:none on .board/.cell avoids browser gesture hijack
// Works during blink + slow settle (active chain). Tap-tap remains via click.
let ptrId: number | null = null;
let ptrStartX = 0;
let ptrStartY = 0;
let ptrIdx: number | null = null;

function resetPointerGesture() {
  ptrId = null;
  ptrIdx = null;
}

root.addEventListener("pointerdown", (e) => {
  if (state.phase !== "play") return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const cell = (e.target as Element | null)?.closest?.(
    "button.cell[data-idx]",
  ) as HTMLElement | null;
  if (!cell) {
    resetPointerGesture();
    return;
  }
  const idx = Number(cell.dataset.idx);
  if (!Number.isFinite(idx)) {
    resetPointerGesture();
    return;
  }
  ptrId = e.pointerId;
  ptrIdx = idx;
  ptrStartX = e.clientX;
  ptrStartY = e.clientY;
  try {
    root.setPointerCapture(e.pointerId);
  } catch {
    /* capture optional — still track by pointerId */
  }
});

function finishPointerSwipe(e: PointerEvent) {
  if (ptrId !== e.pointerId || ptrIdx == null) {
    resetPointerGesture();
    return;
  }
  const sel = ptrIdx;
  const dx = e.clientX - ptrStartX;
  const dy = e.clientY - ptrStartY;
  resetPointerGesture();

  if (state.phase !== "play") return;

  const target = resolveSwipeNeighbor(
    state.cols,
    state.rows,
    sel,
    dx,
    dy,
  );
  if (target == null) {
    // Tap / rejected diagonal: leave to click handler (tap-tap select/swap).
    return;
  }
  // Consume trailing synthetic click so swipe does not also tap.
  // Clear shortly after in case the browser never emits click.
  suppressCellClick = true;
  window.setTimeout(() => {
    suppressCellClick = false;
  }, 350);
  e.preventDefault();
  setState(swapPanels(state, sel, target));
}

root.addEventListener("pointerup", finishPointerSwipe);
root.addEventListener("pointercancel", (e) => {
  if (ptrId === e.pointerId) resetPointerGesture();
});

render();
