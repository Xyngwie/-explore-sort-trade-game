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
  resolveNearStuckHint,
  tapCell,
  testPlayQueryExample,
  tickSettleStep,
  toCraftingResult,
  validSupplyGaugeState,
  TEST_PLAY_CONTAINERS,
  type JunkGaugeLevel,
  type PieceKind,
  type RefineLive,
} from "./refine";
import {
  buildCargoSkipHubCtaHtml,
  buildCargoSkipToHubUrl,
  buildEmptySkipHubCtaHtml,
  buildEmptySkipToHubUrl,
  buildResultRibbonHtml,
  buildResultYieldCompactHtml,
  canSkipWithCargo,
  isEmptyCargoEntry,
  resolveRestartState,
  toStagePhase,
  type SessionSource,
} from "./resultOverlay";
import {
  buildBriefingBagDifficultyHtml,
  buildPlayHudHtml,
  nextYieldPreviewMode,
  type YieldPreviewMode,
} from "./playHud";

const root = document.querySelector<HTMLDivElement>("#app")!;
let state: RefineLive = createRefineFromLocationSearch(window.location.search);
let chainTimer: ReturnType<typeof setTimeout> | null = null;
/** Cell indices to play fall-in animation on the next render (settle tick only). */
let fallInIndices: Set<number> = new Set();
/** Suppress the synthetic click that follows a successful touch/pen swipe. */
let suppressCellClick = false;
/** Session start source — used by 「もう一度」 to keep test-play budget. */
let sessionSource: SessionSource = "location";
/** Until this timestamp (ms), show bag-difficulty intro flash at top HUD. */
let bagIntroUntil = 0;
let bagIntroTimer: ReturnType<typeof setTimeout> | null = null;
/** Until this timestamp (ms), show short junk-tension telegraph (gauge-driven). */
let junkTensionUntil = 0;
let junkTensionTimer: ReturnType<typeof setTimeout> | null = null;
/** Last observed gauge level — detect rising into tension for one-shot telegraph. */
let lastGaugeLevel: JunkGaugeLevel | null = null;
/** Yield chips: per-clear wave vs session cumulative (toggle in HUD). */
let yieldPreviewMode: YieldPreviewMode = "wave";

function clearBagIntroTimer() {
  if (bagIntroTimer != null) {
    clearTimeout(bagIntroTimer);
    bagIntroTimer = null;
  }
}

function armBagIntroFlash(ms = 2800) {
  clearBagIntroTimer();
  bagIntroUntil = Date.now() + ms;
  bagIntroTimer = setTimeout(() => {
    bagIntroTimer = null;
    bagIntroUntil = 0;
    if (state.phase === "play") render();
  }, ms);
}

function clearJunkTensionTimer() {
  if (junkTensionTimer != null) {
    clearTimeout(junkTensionTimer);
    junkTensionTimer = null;
  }
}

function armJunkTensionFlash(ms = 2200) {
  clearJunkTensionTimer();
  junkTensionUntil = Date.now() + ms;
  junkTensionTimer = setTimeout(() => {
    junkTensionTimer = null;
    junkTensionUntil = 0;
    if (state.phase === "play") render();
  }, ms);
}

/** Fire a short telegraph when the gauge first enters tension (not depleted). */
function maybeArmJunkTensionFromState(s: RefineLive) {
  if (s.phase !== "play") {
    lastGaugeLevel = null;
    return;
  }
  const level = validSupplyGaugeState(s).level;
  const enteredTension =
    level === "tension" && lastGaugeLevel != null && lastGaugeLevel !== "tension";
  lastGaugeLevel = level;
  if (enteredTension) armJunkTensionFlash();
}

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
  maybeArmJunkTensionFromState(state);
  render();
}

function boardHtml(
  s: RefineLive,
  opts?: { inert?: boolean; hint?: { a: number; b: number } | null },
): string {
  const pending = new Set(s.pendingClear);
  const settleMs = SORT_V0_RULES.settleStepMs;
  const inert = opts?.inert === true;
  const hintSet = new Set(
    opts?.hint != null ? [opts.hint.a, opts.hint.b] : [],
  );
  const cells = s.board
    .map((kind, i) => {
      const extras = [
        pending.has(i) ? "pending" : "",
        !inert && s.selected === i ? "selected" : "",
        !inert && fallInIndices.has(i) && kind != null ? "fall-in" : "",
        !inert && hintSet.has(i) ? "hint" : "",
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
      const tag = inert ? "div" : "button";
      const typeAttr = inert ? "" : ' type="button"';
      return `<${tag}${typeAttr} class="${pieceClass(kind)}${extras ? ` ${extras}` : ""}" data-idx="${i}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title || "空")}"${inert ? ' aria-hidden="true"' : ""}>${escapeHtml(label)}</${tag}>`;
    })
    .join("");
  const settling = !inert && s.playMode === "settling" ? " settling" : "";
  const inertCls = inert ? " board-inert" : "";
  return `<div class="board${settling}${inertCls}" style="--cols:${s.cols};--settle-ms:${settleMs}ms" role="grid" aria-label="精製盤">${cells}</div>`;
}

/** Empty silhouette board so briefing/blocked still sit on the same field. */
function boardPlaceholderHtml(cols: number, rows: number): string {
  const cells = Array.from({ length: cols * rows }, () => {
    return `<div class="cell empty" aria-hidden="true"></div>`;
  }).join("");
  return `<div class="board board-placeholder" style="--cols:${cols}" role="presentation" aria-hidden="true">${cells}</div>`;
}

function playHintHtml(s: RefineLive): string {
  // Mid-play chain/status live in the top HUD; footer stays a quiet control tip.
  if (s.playMode === "settling" || s.playMode === "clearing") {
    return `<p class="field-hint muted">操作: スワイプ／隣タップ（連鎖中は無料）</p>`;
  }
  return `<p class="field-hint muted">スワイプ／隣タップでスワップ · <strong>idle でマッチなしは即終了</strong> · 落下・点滅中の仕込みは無料</p>`;
}

function briefingOverlayHtml(s: RefineLive, cargoSkipHubUrl?: string): string {
  const cargoSkip =
    canSkipWithCargo(s) && Boolean(cargoSkipHubUrl)
      ? `
        <p class="stage-copy muted">精製せず、受取コンテナを<strong>未開封</strong>のまま格納庫へ預けられます（資材産出なし）。</p>
        <div class="row stage-actions">
          ${buildCargoSkipHubCtaHtml(cargoSkipHubUrl!)}
        </div>`
      : "";
  return `
    <div class="stage-overlay" role="region" aria-label="精製ブリーフィング">
      <div class="stage-panel">
        <p class="stage-kicker">BRIEFING</p>
        <h2 class="stage-title">精製準備</h2>
        <ul class="brief-stats">
          <li><span>コンテナ</span><strong>${s.inbound.salvagedContainers}</strong></li>
          <li><span>有効予算</span><strong>${s.validPieceBudget}</strong></li>
          <li><span>craft</span><strong>${(s.inbound.craftMultiplier ?? 1).toFixed(3)}</strong></li>
          ${buildBriefingBagDifficultyHtml(s)}
        </ul>
        <p class="stage-copy">盤は開始時に埋まります。上下左右にスワップして 3 つ以上そろえると消去→ゆっくり落下補充。落下中もスワップして<strong>アクティブ連鎖</strong>。idle でマッチしないスワップは即終了。有効が尽きたらオジャマのみ。</p>
        <div class="row stage-actions">
          <button type="button" id="btn-start">精製開始</button>
          <button type="button" class="secondary" id="btn-test-play">コンテナ${TEST_PLAY_CONTAINERS}でテストプレイ</button>
        </div>
        ${cargoSkip}
        <p class="mono muted stage-meta">${escapeHtml(s.note)}</p>
      </div>
    </div>
  `;
}

function blockedOverlayHtml(s: RefineLive, skipHubUrl?: string): string {
  const emptyCargo = isEmptyCargoEntry(s) && Boolean(skipHubUrl);
  if (emptyCargo && skipHubUrl) {
    return `
    <div class="stage-overlay" role="region" aria-label="仕分けなし">
      <div class="stage-panel">
        <p class="stage-kicker">EMPTY CARGO</p>
        <h2 class="stage-title">仕分けるものがありません</h2>
        <p class="stage-copy">コンテナ 0 · 有効予算 0。精製盤には進みません。</p>
        <p class="stage-copy muted">仕分けせずに格納庫（HUB）へ戻れます。</p>
        <div class="row stage-actions">
          ${buildEmptySkipHubCtaHtml(skipHubUrl)}
          <button type="button" class="secondary" id="btn-test-play">コンテナ${TEST_PLAY_CONTAINERS}でテストプレイ</button>
        </div>
        <p class="mono muted stage-meta">${escapeHtml(s.note)}</p>
      </div>
    </div>
  `;
  }
  return `
    <div class="stage-overlay" role="region" aria-label="開始不可">
      <div class="stage-panel">
        <p class="stage-kicker warn">BLOCKED</p>
        <h2 class="stage-title">開始できません</h2>
        <p class="warn">${escapeHtml(s.blockReason ?? "開始不可")}</p>
        <p class="stage-copy muted">クエリ例を付けてリロードするか、下のテストプレイを使ってください。</p>
        <div class="row stage-actions">
          <a class="btn secondary" href="${escapeHtml(demoQueryExample())}">デモクエリで開く</a>
          <button type="button" class="secondary" id="btn-test-play">コンテナ${TEST_PLAY_CONTAINERS}でテストプレイ</button>
        </div>
        <p class="mono muted stage-meta">長時間: ${escapeHtml(testPlayQueryExample())}</p>
      </div>
    </div>
  `;
}

function resultOverlayHtml(
  handoffUrl: string,
  result: ReturnType<typeof toCraftingResult>,
  lastChain: number,
): string {
  const importMats = importedMaterialsFromResult(result);
  const bagEntries = Object.entries(result.yieldBag ?? {}).filter(
    ([, n]) => (n ?? 0) > 0,
  ) as Array<[YieldItemId, number]>;
  const bagLine =
    bagEntries.length === 0
      ? `<span class="muted">YieldBag（空）</span>`
      : bagEntries
          .slice(0, 6)
          .map(
            ([id, n]) =>
              `<span>${escapeHtml(labelYield(id))} ${n}</span>`,
          )
          .join("") +
        (bagEntries.length > 6
          ? `<span class="muted">+${bagEntries.length - 6}</span>`
          : "");

  return `
    <div class="stage-overlay result-overlay" role="region" aria-label="仕分結果">
      ${buildResultRibbonHtml(handoffUrl)}
      ${buildResultYieldCompactHtml({
        yieldFood: result.yieldFood,
        yieldMaterial: result.yieldMaterial,
        yieldEnergy: result.yieldEnergy,
        scrapLossCount: result.scrapLossCount,
        craftMultiplier: result.craftMultiplier,
        lastChain,
      })}
      <div class="result-bag-line" aria-label="YieldBag">${bagLine}</div>
      <p class="mono muted result-import">importMaterials ${importMats}</p>
    </div>
  `;
}

function render() {
  const stage = toStagePhase(state.phase);
  const result = state.phase === "result" ? toCraftingResult(state) : null;
  const handoffUrl =
    result != null
      ? buildSortToTradeUrlFromResult(result, tradeBaseUrl())
      : "";
  const emptySkipHubUrl =
    state.phase === "blocked" && isEmptyCargoEntry(state)
      ? buildEmptySkipToHubUrl(state, tradeBaseUrl())
      : "";
  const cargoSkipHubUrl =
    state.phase === "briefing" && canSkipWithCargo(state)
      ? buildCargoSkipToHubUrl(state, tradeBaseUrl())
      : "";

  const showLiveBoard = state.phase === "play";
  const showResultBoard = state.phase === "result";
  const showPlaceholder =
    state.phase === "briefing" || state.phase === "blocked";

  const showBagIntro =
    state.phase === "play" && bagIntroUntil > Date.now();
  const showJunkTension =
    state.phase === "play" && junkTensionUntil > Date.now();
  const nearStuckHint =
    state.phase === "play" ? resolveNearStuckHint(state) : null;

  const stageBoard = showLiveBoard
    ? boardHtml(state, { hint: nearStuckHint })
    : showResultBoard
      ? boardHtml(state, { inert: true })
      : boardPlaceholderHtml(state.cols, state.rows);

  const overlay =
    state.phase === "briefing"
      ? briefingOverlayHtml(state, cargoSkipHubUrl || undefined)
      : state.phase === "blocked"
        ? blockedOverlayHtml(state, emptySkipHubUrl || undefined)
        : state.phase === "result" && result
          ? resultOverlayHtml(handoffUrl, result, state.lastChain)
          : "";

  root.innerHTML = `
    <div class="shell">
      <header class="chrome">
        <p class="pill">MODULE 2 · SORT · ONE FIELD</p>
        <h1>Athanor 精製</h1>
      </header>

      <div class="play-field" data-phase="${escapeHtml(stage)}" aria-label="プレイフィールド">
        ${
          state.phase === "play"
            ? buildPlayHudHtml(state, {
                showBagIntro,
                showJunkTension,
                yieldMode: yieldPreviewMode,
              })
            : ""
        }
        <div class="stage">
          ${stageBoard}
          ${overlay}
        </div>
        ${
          state.phase === "play"
            ? `
          ${playHintHtml(state)}
          <div class="hud-footer">
            <button type="button" class="secondary" id="btn-finish">精製を終える</button>
          </div>`
            : ""
        }
      </div>
    </div>
  `;

  document.getElementById("btn-start")?.addEventListener("click", () => {
    armBagIntroFlash();
    setState(startRefine(state));
  });
  document.getElementById("btn-test-play")?.addEventListener("click", () => {
    clearChainTimer();
    // Dedicated long demo — does not alter explore handoff query defaults.
    sessionSource = "test-play";
    armBagIntroFlash();
    setState(startRefine(createTestPlayRefine(TEST_PLAY_CONTAINERS)));
  });
  document.getElementById("btn-finish")?.addEventListener("click", () => {
    clearChainTimer();
    clearBagIntroTimer();
    clearJunkTensionTimer();
    bagIntroUntil = 0;
    junkTensionUntil = 0;
    lastGaugeLevel = null;
    setState(finishRefine(state));
  });
  document.getElementById("btn-again")?.addEventListener("click", () => {
    clearChainTimer();
    clearBagIntroTimer();
    clearJunkTensionTimer();
    bagIntroUntil = 0;
    junkTensionUntil = 0;
    lastGaugeLevel = null;
    setState(resolveRestartState(sessionSource, window.location.search));
  });
  document.getElementById("btn-yield-mode")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    yieldPreviewMode = nextYieldPreviewMode(yieldPreviewMode);
    if (state.phase === "play") render();
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
