import "./style.css";
import {
  buildExploreToSortUrl,
  requestBrowserGeolocation,
  coarsenFix,
  type GeoResult,
} from "@estg/shared";
import {
  createSortieFromLocationSearch,
  startSortie,
  salvageOne,
  extract,
  tick,
  toExploreResult,
} from "./sortie";

const root = document.querySelector<HTMLDivElement>("#app")!;
let state = createSortieFromLocationSearch(window.location.search);
let geoLabel = "位置: 未取得";
let last = performance.now();
let lastPaint = 0;

function render() {
  const result = state.phase === "result" ? toExploreResult(state) : null;
  const handoffUrl =
    result != null
      ? buildExploreToSortUrl({
          salvagedContainers: result.salvagedContainers,
          totalStockPieces: result.totalStockPieces,
          isExtracted: result.isExtracted,
        })
      : "";

  root.innerHTML = `
    <p class="pill">MODULE 1 · EXPLORE · MINIMAL</p>
    <h1>WRECKLINE 最小出撃</h1>
    <p class="muted">データが通ることだけを確認する薄い実装です。本編グラフィックは後続。</p>

    <div class="card">
      <div class="muted">${escapeHtml(state.note)}</div>
      <div class="muted" style="margin-top:0.35rem">${escapeHtml(geoLabel)}</div>
      <div class="row">
        <button type="button" class="secondary" id="btn-geo">位置を取得</button>
      </div>
    </div>

    ${
      state.phase === "briefing"
        ? `<div class="card">
            <table>
              <tr><td>僚機</td><td>${state.wingmanCount}</td></tr>
              <tr><td>積載上限</td><td>${state.carrierCapacity}</td></tr>
              <tr><td>実弾</td><td>${state.ammoStock}</td></tr>
              <tr><td>活動限界</td><td>${state.maxOperationTimeSec}s</td></tr>
            </table>
            <div class="row">
              <button type="button" id="btn-start">出撃</button>
            </div>
          </div>`
        : ""
    }

    ${
      state.phase === "sortie"
        ? `<div class="card">
            <table>
              <tr><td>残時間</td><td>${state.timeLeftSec.toFixed(1)}s</td></tr>
              <tr><td>回収</td><td>${state.salvaged} / ${state.carrierCapacity}</td></tr>
            </table>
            <div class="row">
              <button type="button" id="btn-salvage" ${
                state.salvaged >= state.carrierCapacity ? "disabled" : ""
              }>コンテナ回収 +1</button>
              <button type="button" id="btn-extract">脱出</button>
            </div>
          </div>`
        : ""
    }

    ${
      state.phase === "result" && result
        ? `<div class="card">
            <p class="${result.isExtracted ? "ok" : "warn"}">${
              result.isExtracted ? "生還" : "失敗（未脱出）"
            }</p>
            <table>
              <tr><td>isExtracted</td><td>${String(result.isExtracted)}</td></tr>
              <tr><td>salvagedContainers</td><td>${result.salvagedContainers}</td></tr>
              <tr><td>totalStockPieces</td><td>${result.totalStockPieces}</td></tr>
              <tr><td>ammoStock</td><td>${result.ammoStock}</td></tr>
            </table>
            <div class="row">
              <a class="btn" href="${handoffUrl}" target="_top" rel="noopener">精製炉へ渡す</a>
              <button type="button" class="secondary" id="btn-again">再出撃</button>
            </div>
            <p class="mono muted" style="margin-top:0.75rem">${escapeHtml(handoffUrl)}</p>
            ${
              !result.isExtracted || result.salvagedContainers <= 0
                ? `<p class="warn">精製炉側で拒否される可能性があります。</p>`
                : ""
            }
          </div>`
        : ""
    }
  `;

  document.getElementById("btn-geo")?.addEventListener("click", onGeo);
  document.getElementById("btn-start")?.addEventListener("click", () => {
    state = startSortie(state);
    render();
  });
  document.getElementById("btn-salvage")?.addEventListener("click", () => {
    state = salvageOne(state);
    render();
  });
  document.getElementById("btn-extract")?.addEventListener("click", () => {
    state = extract(state);
    render();
  });
  document.getElementById("btn-again")?.addEventListener("click", () => {
    state = createSortieFromLocationSearch(window.location.search);
    render();
  });
}

async function onGeo() {
  geoLabel = "位置: 取得中…";
  render();
  const res: GeoResult = await requestBrowserGeolocation({
    enableHighAccuracy: false,
    timeoutMs: 8000,
  });
  if (res.ok) {
    const c = coarsenFix(res.fix);
    geoLabel = `位置: 粗い ${c.latitude.toFixed(2)}, ${c.longitude.toFixed(2)}（効果なし・Phase0）`;
  } else {
    geoLabel = `位置: ${res.reason} — 続行可`;
  }
  render();
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const before = state.phase;
  state = tick(state, dt);
  if (state.phase !== before || (state.phase === "sortie" && now - lastPaint > 200)) {
    lastPaint = now;
    render();
  }
  requestAnimationFrame(frame);
}

render();
requestAnimationFrame(frame);
