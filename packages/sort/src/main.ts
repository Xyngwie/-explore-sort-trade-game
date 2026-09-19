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
  createRefineFromLocationSearch,
  demoQueryExample,
  finishRefine,
  startRefine,
  tapCell,
  toCraftingResult,
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
  const cells = s.board
    .map((kind, i) => {
      const selected = s.selected === i ? " selected" : "";
      const label = kind == null ? "" : PIECE_LABEL_JA[kind].slice(0, 1);
      const title =
        kind == null
          ? ""
          : kind === "junk"
            ? "ジャンク（消去不可）"
            : `${PIECE_LABEL_JA[kind]}（3つ以上つなげてタップ）`;
      return `<button type="button" class="${pieceClass(kind)}${selected}" data-idx="${i}" title="${escapeHtml(title)}" ${
        s.phase !== "play" ? "disabled" : ""
      }>${escapeHtml(label)}</button>`;
    })
    .join("");
  return `<div class="board" style="--cols:${s.cols}">${cells}</div>`;
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
    <p class="pill">MODULE 2 · SORT · MINIMAL v0</p>
    <h1>Athanor 最小精製</h1>
    <p class="muted">コンテナ予算→有効ピース、ジャンクは消せない、消した種類が成果。本編 match-3 ではありません。</p>

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
            <p>配合フェーズなし。盤上の<strong>同色3つ以上</strong>をタップで消去。ジャンクはタップしても消えません。</p>
            <div class="row">
              <button type="button" id="btn-start">精製開始</button>
            </div>
          </div>`
        : ""
    }

    ${
      state.phase === "play"
        ? `<div class="card">
            <table>
              <tr><td>残り手数</td><td>${state.movesLeft}</td></tr>
              <tr><td>袋の残り</td><td>${state.bag.length}</td></tr>
              <tr><td>消去 食料/部品/電力</td><td>${state.cleared.food} / ${state.cleared.material} / ${state.cleared.energy}</td></tr>
            </table>
            <div class="legend">
              <span class="swatch food">食</span>
              <span class="swatch material">部</span>
              <span class="swatch energy">電</span>
              <span class="swatch junk">ジャ</span>
            </div>
            ${boardHtml(state)}
            <div class="row">
              <button type="button" class="secondary" id="btn-finish">精製を終える</button>
            </div>
            ${
              state.selected != null && state.board[state.selected] === "junk"
                ? `<p class="warn">ジャンクはマッチ／消去できません。</p>`
                : ""
            }
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
  root.querySelectorAll<HTMLButtonElement>("button.cell[data-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      if (!Number.isFinite(idx)) return;
      state = tapCell(state, idx);
      render();
    });
  });
}

render();
