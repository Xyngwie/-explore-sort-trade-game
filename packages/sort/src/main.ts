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
  applyControl,
  boardWithFalling,
  createRefineFromLocationSearch,
  demoQueryExample,
  finishRefine,
  ghostRow,
  indexOf,
  startRefine,
  toCraftingResult,
  type ControlAction,
  type PieceKind,
  type RefineLive,
} from "./refine";

const root = document.querySelector<HTMLDivElement>("#app")!;
let state: RefineLive = createRefineFromLocationSearch(window.location.search);

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

function boardHtml(s: RefineLive): string {
  const display = boardWithFalling(s);
  const ghost = ghostRow(s);
  const fallingIndices = new Set<number>();
  if (s.falling) {
    for (let i = 0; i < s.falling.gems.length; i++) {
      fallingIndices.add(indexOf(s.cols, s.falling.row + i, s.falling.col));
    }
  }
  const ghostIndices = new Set<number>();
  if (s.falling && ghost != null && ghost !== s.falling.row) {
    for (let i = 0; i < s.falling.gems.length; i++) {
      ghostIndices.add(indexOf(s.cols, ghost + i, s.falling.col));
    }
  }

  const cells = display
    .map((kind, i) => {
      const isFalling = fallingIndices.has(i);
      const isGhost = ghostIndices.has(i) && !isFalling;
      const extras = [
        isFalling ? "falling" : "",
        isGhost ? "ghost" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const label =
        kind == null
          ? ""
          : isGhost
            ? ""
            : PIECE_LABEL_JA[kind].slice(0, 1);
      const title =
        kind == null
          ? ""
          : kind === "junk"
            ? "ジャンク（消去不可）"
            : PIECE_LABEL_JA[kind];
      return `<div class="${pieceClass(isGhost ? null : kind)}${extras ? ` ${extras}` : ""}" data-idx="${i}" title="${escapeHtml(title)}">${escapeHtml(label)}</div>`;
    })
    .join("");
  return `<div class="board" style="--cols:${s.cols}" role="grid" aria-label="精製盤">${cells}</div>`;
}

function nextHtml(s: RefineLive): string {
  if (s.nextGems.length === 0) {
    return `<div class="next muted">NEXT —</div>`;
  }
  const gems = s.nextGems
    .map(
      (k) =>
        `<span class="swatch ${k}">${escapeHtml(PIECE_LABEL_JA[k].slice(0, 1))}</span>`,
    )
    .join("");
  return `<div class="next"><span class="muted">NEXT</span> ${gems}</div>`;
}

function controlsHtml(): string {
  return `
    <div class="controls" aria-label="操作">
      <button type="button" class="ctrl" data-act="left" aria-label="左へ">◀</button>
      <button type="button" class="ctrl" data-act="rotate" aria-label="回転">⟳</button>
      <button type="button" class="ctrl" data-act="right" aria-label="右へ">▶</button>
      <button type="button" class="ctrl" data-act="softDrop" aria-label="ソフトドロップ">▼</button>
      <button type="button" class="ctrl primary" data-act="hardDrop" aria-label="ハードドロップ">⏬ 落とす</button>
    </div>
    <p class="hint muted">キー: ← → ↑/X 回転 · ↓ ソフト · Space ハード · スワイプ可</p>
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

function doControl(action: ControlAction) {
  state = applyControl(state, action);
  render();
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
    <p class="pill">MODULE 2 · SORT · COLUMNS</p>
    <h1>Athanor 精製（Columns）</h1>
    <p class="muted">コンテナ予算→有効ピース。落下列を位置／回転して落とす。3つ以上一直線で消去・重力連鎖。ジャンクは消えない。</p>

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
            <p>配合フェーズなし。<strong>3 個の落下列</strong>を左右移動・回転して配置。同色が縦・横・斜めに 3 つ以上そろると消去され、重力と連鎖が起きます。ジャンクはマッチしません。</p>
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
              <tr><td>残り手数（配置）</td><td>${state.movesLeft}</td></tr>
              <tr><td>袋の残り</td><td>${state.bag.length}</td></tr>
              <tr><td>消去 食料/部品/電力</td><td>${state.cleared.food} / ${state.cleared.material} / ${state.cleared.energy}</td></tr>
            </table>
            ${nextHtml(state)}
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
            ${controlsHtml()}
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
    state = startRefine(state);
    render();
  });
  document.getElementById("btn-finish")?.addEventListener("click", () => {
    state = finishRefine(state);
    render();
  });
  document.getElementById("btn-again")?.addEventListener("click", () => {
    state = createRefineFromLocationSearch(window.location.search);
    render();
  });
  root.querySelectorAll<HTMLButtonElement>("button.ctrl[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act as ControlAction;
      doControl(act);
    });
  });
}

window.addEventListener("keydown", (e) => {
  if (state.phase !== "play") return;
  const map: Record<string, ControlAction> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowDown: "softDrop",
    ArrowUp: "rotate",
    x: "rotate",
    X: "rotate",
    " ": "hardDrop",
  };
  const act = map[e.key];
  if (!act) return;
  e.preventDefault();
  doControl(act);
});

// Touch swipe on the board area
let touchStartX = 0;
let touchStartY = 0;
root.addEventListener(
  "touchstart",
  (e) => {
    if (state.phase !== "play" || e.touches.length !== 1) return;
    touchStartX = e.touches[0]!.clientX;
    touchStartY = e.touches[0]!.clientY;
  },
  { passive: true },
);
root.addEventListener(
  "touchend",
  (e) => {
    if (state.phase !== "play" || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0]!.clientX - touchStartX;
    const dy = e.changedTouches[0]!.clientY - touchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = 28;
    if (absX < threshold && absY < threshold) {
      // Tap = rotate
      doControl("rotate");
      return;
    }
    if (absX > absY) {
      doControl(dx > 0 ? "right" : "left");
    } else if (dy > 0) {
      doControl(absY > 80 ? "hardDrop" : "softDrop");
    } else {
      doControl("rotate");
    }
  },
  { passive: true },
);

render();
