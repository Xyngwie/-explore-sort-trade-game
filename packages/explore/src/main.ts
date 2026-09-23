import "./style.css";
import {
  HANDOFF_QUERY_KEYS,
  stripHandoffParams,
} from "@estg/shared";
import { STANCE_LABEL, type Stance, type World } from "./game/types";
import {
  bootstrapFromSearch,
  createWorld,
  startSortie,
} from "./game/world";
import { invadeIntelBannerText } from "./game/invadeIntelBanner";
import {
  armExploreForcedHistory,
  markExploreForcedHandoffIntent,
  resolveExploreForcedBackWipe,
} from "./game/forcedBackWipe";
import {
  applyOrder,
  applyOrderToAllWingmen,
  inCampAura,
  pickUpFromCamp,
  purgeCargo,
  rallyWingman,
  scatterSearch,
  setCampOrDeposit,
  unloadAtCamp,
  unitMoveSpeedMul,
} from "./game/orders";
import {
  boardingCargoEta,
  boardingLiftOffEta,
  boardingRequirementsHud,
  isWingmanOffscreen,
  requestExtract,
  tickWorld,
  type PlayerInput,
} from "./game/sim";
import { renderWorld, worldFromCanvas } from "./game/render";
import {
  buildSortieOutcome,
  hubWearHandoffUrl,
  sortHandoffUrl,
  toExploreResult,
  returnKindFromWorld,
} from "./game/outcome";

const root = document.querySelector<HTMLDivElement>("#app")!;
const boot = bootstrapFromSearch(window.location.search);
if (boot.invadeSector != null) {
  const cleaned = stripHandoffParams(
    window.location.href,
    HANDOFF_QUERY_KEYS.invadeToExplore,
  );
  const current =
    window.location.pathname + window.location.search + window.location.hash;
  if (cleaned !== current) {
    history.replaceState(null, "", cleaned);
  }
}
let world: World = createWorld(boot);

const forcedEngageActive = world.invadeSector?.engage === "forced";
if (forcedEngageActive) {
  armExploreForcedHistory();
}

window.addEventListener("popstate", () => {
  if (world.invadeSector?.engage !== "forced") return;
  if (world.phase === "result") return;
  const sector =
    world.invadeSector != null
      ? {
          sectorX: world.invadeSector.sectorX,
          sectorY: world.invadeSector.sectorY,
          density: world.invadeSector.density,
          intelFlags: [...world.invadeSector.intelFlags],
        }
      : null;
  const url = resolveExploreForcedBackWipe({ sector });
  if (url == null) return;
  window.location.replace(url);
});


const keys = new Set<string>();
const input: PlayerInput = {
  move: { x: 0, y: 0 },
  clickMove: null,
  fire: false,
  interact: false,
};

let canvas: HTMLCanvasElement | null = null;
let last = performance.now();
let needsDom = true;

function flashCampToast(msg: string): void {
  const el = document.getElementById("camp-toast");
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
  el.classList.add("show");
  window.setTimeout(() => {
    el.classList.remove("show");
    el.hidden = true;
  }, 2800);
}

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (["w", "a", "s", "d", " "].includes(k)) e.preventDefault();
  if (k === "x" && world.phase === "sortie") {
    e.preventDefault();
    requestExtract(world);
    needsDom = true;
  }
  if (k === "c" && world.phase === "sortie") {
    e.preventDefault();
    setCampOrDeposit(world);
    needsDom = true;
  }
  if (k === "u" && world.phase === "sortie") {
    e.preventDefault();
    const result = unloadAtCamp(world);
    if (result === "unloaded" && world.camp) {
      flashCampToast(`置場 ${world.camp.stashedCount} · キャンプ圏で被弾軽減`);
    }
    needsDom = true;
  }
  if (k === "g" && world.phase === "sortie") {
    e.preventDefault();
    pickUpFromCamp(world);
    needsDom = true;
  }
  if (k === "p" && world.phase === "sortie") {
    e.preventDefault();
    purgeCargo(world);
    needsDom = true;
  }
  if (world.phase === "sortie" && !e.repeat) {
    const squadMap: Record<string, Stance> = {
      "1": "escort",
      "2": "patrol",
      "3": "recover",
      "4": "raid",
    };
    if (k in squadMap) {
      e.preventDefault();
      applyOrderToAllWingmen(world, squadMap[k]!);
      needsDom = true;
    }
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

function syncMoveFromKeys(): void {
  let x = 0;
  let y = 0;
  if (keys.has("w") || keys.has("arrowup")) y -= 1;
  if (keys.has("s") || keys.has("arrowdown")) y += 1;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;
  input.move = { x, y };
  input.fire = keys.has(" ") || keys.has("f");
  input.interact = keys.has("e");
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}


function extractReqHudHtml(): string {
  const hud = boardingRequirementsHud(world);
  // Top-edge HUD: compact when idle so the map center stays playable.
  if (!hud.active) {
    return `<div class="extract-req-hud idle top-edge" id="extract-req-hud" aria-live="polite">
      <div class="erq-title">EXTRACT</div>
      <div class="erq-seconds">未要請 · X で展開 · 必須:${hud.mustBeIn}</div>
    </div>`;
  }
  const danger = !hud.captainInside;
  const cls = danger
    ? "extract-req-hud active danger top-edge"
    : "extract-req-hud active top-edge";
  const seconds =
    hud.liftOffEta != null
      ? `離昇 ${hud.liftOffEta.toFixed(1)}s`
      : "離昇直前";
  const must = hud.captainInside
    ? `必須: 隊長円内 OK`
    : `必須: 隊長円外！戻れ`;
  const count =
    `円内 ${hud.insideCount}/${hud.aliveCount}` +
    (hud.outsideCount > 0
      ? ` 円外:${hud.outsideNames.join("・")}`
      : " 全員円内");
  const sub = hud.cargoArrived
    ? "貨物済·待機"
    : hud.cargoEta != null
      ? `貨物 ${hud.cargoEta.toFixed(1)}s`
      : "";
  return `<div class="${cls}" id="extract-req-hud" aria-live="polite">
    <div class="erq-title">EXTRACT / 帰還</div>
    <div class="erq-seconds" id="erq-seconds">${seconds}${sub ? " · " + sub : ""}</div>
    <div class="erq-must" id="erq-must">${must}</div>
    <div class="erq-count" id="erq-count">${count}</div>
  </div>`;
}

function order(wingId: string, stance: Stance): void {
  const wing = world.wingmen.find((w) => w.id === wingId);
  if (!wing) return;
  applyOrder(world, wing, stance);
  needsDom = true;
}

function rally(wingId: string): void {
  const wing = world.wingmen.find((w) => w.id === wingId);
  if (!wing) return;
  rallyWingman(world, wing);
  needsDom = true;
}

function doScatterSearch(): void {
  scatterSearch(world);
  needsDom = true;
}

function bindCanvas(): void {
  canvas = document.querySelector<HTMLCanvasElement>("#map");
  if (!canvas) return;
  canvas.width = 720;
  canvas.height = 420;
  canvas.addEventListener("pointerdown", (e) => {
    if (world.phase !== "sortie" || !canvas) return;
    const pt = worldFromCanvas(canvas, world, e.clientX, e.clientY);
    input.clickMove = pt;
  });
}

function squadOrderBarHtml(): string {
  const items: Array<{ stance: Stance; key: string }> = [
    { stance: "escort", key: "1" },
    { stance: "patrol", key: "2" },
    { stance: "recover", key: "3" },
    { stance: "raid", key: "4" },
  ];
  const btns = items
    .map(
      ({ stance, key }) =>
        `<button type="button" class="stance-${stance} squad-order" data-squad-order="${stance}" title="全僚機へ${STANCE_LABEL[stance]}（${key}）"><span class="hotkey">${key}</span>${STANCE_LABEL[stance]}</button>`,
    )
    .join("");
  return `<div class="squad-order-bar" role="group" aria-label="小隊方針">
    <span class="squad-label">小隊方針</span>
    ${btns}
  </div>`;
}

function wingPanelHtml(): string {
  const cards = world.wingmen
    .map((w) => {
      const off = world.phase === "sortie" && isWingmanOffscreen(world, w);
      const stances: Stance[] = ["escort", "patrol", "recover", "raid"];
      const btns = stances
        .map((s) => {
          const active = w.stance === s ? "active-stance" : "";
          return `<button type="button" class="stance-${s} ${active}" data-order="${w.id}:${s}">${STANCE_LABEL[s]}</button>`;
        })
        .join("");
      return `<div class="wing-card ${off ? "offscreen" : ""}">
        <h3>
          <span>${escapeHtml(w.name)} ${w.alive ? "" : "（撃破）"}</span>
          <span class="badge ${off ? "warn" : ""}">${off ? "画面外" : STANCE_LABEL[w.stance]}</span>
        </h3>
        <div class="muted">HP ${Math.max(0, Math.ceil(w.hp))}/${w.maxHp} · 積載 ${w.salvagedCount}</div>
        <div class="row wing-order-row">
          <button type="button" class="secondary" data-rally="${w.id}">召還</button>
          ${btns}
        </div>
      </div>`;
    })
    .join("");
  return `${squadOrderBarHtml()}${cards}`;
}

function logsHtml(): string {
  const lines = world.logs.slice(0, 18);
  if (lines.length === 0) {
    return `<li class="tactical">戦術／戦報はここに出ます。</li>`;
  }
  return lines
    .map(
      (l) =>
        `<li class="${l.kind}">${escapeHtml(l.text)}</li>`,
    )
    .join("");
}

function renderDom(): void {
  const result = world.phase === "result" ? toExploreResult(world) : null;
  const sortUrl = result ? sortHandoffUrl(world) : "";
  const wearUrl = world.phase === "result" ? hubWearHandoffUrl(world) : null;
  const invadeBanner = invadeIntelBannerText(world.invadeSector);
  const invadeBannerHtml = invadeBanner
    ? `<div class="invade-banner" role="status">${escapeHtml(invadeBanner)}</div>`
    : "";
  const invadeBannerThinHtml = invadeBanner
    ? `<div class="invade-banner thin" role="status">${escapeHtml(invadeBanner)}</div>`
    : "";

  if (world.phase === "briefing") {
    root.innerHTML = `
      <p class="pill">MODULE 1 · EXPLORE · BEHAVIOR v0</p>
      <h1>WRECKLINE 探索（振る舞い垂直スライス）</h1>
      <p class="muted">モノレポ正本。旧 grok.me Module1 は練習用／退役 — URL 非依存。</p>
      <div class="card">
        <div class="muted">${escapeHtml(world.note)}</div>
        ${invadeBannerHtml}
        <table>
          <tr><td>僚機</td><td>${world.wingmen.length}</td></tr>
          <tr><td>積載上限</td><td>なし（速度で制約）</td></tr>
          <tr><td>実弾</td><td>${world.ammo}</td></tr>
          <tr><td>活動限界</td><td>${world.maxOperationTimeSec}s</td></tr>
          <tr><td>I/O v2 ids</td><td>${world.deployedInstanceIds.length ? world.deployedInstanceIds.join(", ") : "（なし・件数互換）"}</td></tr>
          <tr><td>戦線セクター</td><td>${
            world.invadeSector
              ? `(${world.invadeSector.sectorX},${world.invadeSector.sectorY})`
              : "（なし・直接出撃）"
          }</td></tr>
          <tr><td>density</td><td>${
            world.invadeSector
              ? world.invadeSector.density.toFixed(3)
              : "—（基準脅威）"
          }</td></tr>
          <tr><td>脅威</td><td>敵 ${world.densityThreat.enemyCount} · 距離 ${Math.round(world.densityThreat.spawnDist)} · 速度×${world.densityThreat.enemySpeedMul.toFixed(2)}</td></tr>
                    ${
            world.invadeSector?.engage
              ? `<tr><td>交戦</td><td>${
                  world.invadeSector.engage === "forced"
                    ? "強制交戦・周囲引き込み"
                    : world.invadeSector.engage === "raid"
                      ? "任意侵入"
                      : escapeHtml(world.invadeSector.engage)
                }（engage=${escapeHtml(world.invadeSector.engage)}）</td></tr>`
              : ""
          }
          ${
            world.invadeSector?.enemyCells && world.invadeSector.enemyCells.length > 0
              ? `<tr><td>enemyCells</td><td>${escapeHtml(
                  world.invadeSector.enemyCells.map((c) => `${c.sx},${c.sy}`).join("; "),
                )}（${world.invadeSector.enemyCells.length}）</td></tr>`
              : ""
          }
          ${
            world.invadeSector && world.invadeSector.intelFlags.length > 0
              ? `<tr><td>intelFlags</td><td>${escapeHtml(world.invadeSector.intelFlags.join(", "))}</td></tr>`
              : ""
          }
        </table>
        <div class="row"><button type="button" id="btn-start">出撃</button></div>
        <p class="help">WASD 移動 · クリック移動 · Space/F 射撃 · 発見コンテナ上で自動回収（E 任意） · X 抽出要請 · C キャンプ設置 · U 荷下ろし · G キャンプから積込 · 右パネルで僚機命令（画面外も可）</p>
      </div>`;
    document.getElementById("btn-start")?.addEventListener("click", () => {
      startSortie(world);
      needsDom = true;
      renderDom();
      bindCanvas();
    });
    return;
  }

  if (world.phase === "result" && result) {
    const outcome = buildSortieOutcome(world);
    const wearRows =
      outcome && outcome.mechWear.length > 0
        ? outcome.mechWear
            .map(
              (w) =>
                `<tr><td class="mono">${escapeHtml(w.instanceId)}</td><td>${w.durabilityBefore} → ${w.durabilityAfter}</td><td>-${w.wearApplied}</td><td>${w.statusAfter}</td></tr>`,
            )
            .join("")
        : "";
    root.innerHTML = `
      <p class="pill">MODULE 1 · RESULT</p>
      <h1>作戦結果</h1>
      <div class="card">
        <p class="${result.isExtracted ? "ok" : "warn"}">${
          result.isExtracted ? "生還" : `失敗（${world.failReason ?? "abort"}）`
        }</p>
        <table>
          <tr><td>returnKind</td><td>${returnKindFromWorld(world)}</td></tr>
          <tr><td>isExtracted</td><td>${String(result.isExtracted)}</td></tr>
          <tr><td>salvagedContainers</td><td>${result.salvagedContainers}</td></tr>
          <tr><td>totalStockPieces</td><td>${result.totalStockPieces}</td></tr>
          <tr><td>ammoStock</td><td>${result.ammoStock}</td></tr>
        </table>
        ${
          wearRows
            ? `<h2 style="font-size:0.95rem;margin:0.85rem 0 0.35rem">機体摩耗 (MechWearReport)</h2>
               <table>
                 <tr><th>instanceId</th><th>耐久</th><th>減</th><th>状態</th></tr>
                 ${wearRows}
               </table>`
            : ""
        }
        <div class="row">
          <a class="btn" href="${sortUrl}" target="_top" rel="noopener">精製炉へ渡す</a>
          ${
            wearUrl
              ? `<a class="btn secondary" href="${wearUrl}" target="_top" rel="noopener">拠点へ摩耗報告</a>`
              : ""
          }
          <button type="button" class="secondary" id="btn-again">再出撃</button>
        </div>
        <p class="mono muted" style="margin-top:0.75rem">${escapeHtml(sortUrl)}</p>
        ${
          wearUrl
            ? `<p class="mono muted">${escapeHtml(wearUrl)}</p>
               <p class="muted">localhost では trade (:5175) へ直リンク。摩耗は returnKind フラット減（イベント積み上げは後続）。</p>`
            : `<p class="muted">deployedInstanceIds 無しのため摩耗 URL は省略（v1 互換）。</p>`
        }
      </div>`;
    document.getElementById("btn-again")?.addEventListener("click", () => {
      // Reuse boot so stripped invade/trade query still applies to re-sortie.
      world = createWorld(boot);
      needsDom = true;
      renderDom();
    });
    return;
  }

  // sortie
  const boardingActive = world.boarding != null;
  const cargoEta = boardingCargoEta(world);
  const liftEta = boardingLiftOffEta(world);
  const extractHud = boardingActive
    ? cargoEta != null
      ? `貨物 ${cargoEta.toFixed(1)}s / 離昇 ${(liftEta ?? 0).toFixed(1)}s`
      : `貨物到着 · 離昇 ${(liftEta ?? 0).toFixed(1)}s`
    : "待機（どこでも要請可）";
  const speedMul = unitMoveSpeedMul(world.leader, world);
  const speedHud =
    speedMul >= 0.999
      ? inCampAura(world, world.leader)
        ? "速度 軽装キャンプ圏"
        : "速度 100%"
      : `速度 ${Math.round(speedMul * 100)}%（積載遅延）`;
  const campHud = world.camp
    ? world.camp.stashedCount > 0
      ? `キャンプ 置場${world.camp.stashedCount}·防衛`
      : `キャンプ 置場${world.camp.stashedCount}`
    : "キャンプ 未設置";
  root.innerHTML = `
    <p class="pill">MODULE 1 · SORTIE</p>
    <h1>WRECKLINE</h1>
    ${invadeBannerThinHtml}
    <div class="hud">
      <span>残時間 <strong id="hud-time">${world.timeLeft.toFixed(1)}s</strong></span>
      <span>回収 <strong id="hud-salvage">${world.salvaged}</strong></span>
      <span>実弾 <strong id="hud-ammo">${world.ammo}</strong></span>
      <span>隊長HP <strong id="hud-hp">${Math.ceil(world.leader.hp)}</strong></span>
      <span>抽出 <strong id="hud-boarding">${extractHud}</strong></span>
      <span><strong id="hud-speed">${speedHud}</strong></span>
      <span><strong id="hud-camp">${campHud}</strong></span>
    </div>
    <div class="toast" id="camp-toast" hidden></div>
    <div class="layout">
      <div>
        <div class="canvas-wrap">
          <canvas id="map" width="720" height="420"></canvas>
          ${extractReqHudHtml()}
        </div>
        <div class="row">
          <button type="button" id="btn-extract" ${boardingActive ? "disabled" : ""} title="どこからでも抽出要請（X）。進行中はキャンセル不可。">${boardingActive ? "抽出シーケンス中…" : "抽出要請（搭乗円）"}</button>
          <button type="button" class="secondary" id="btn-camp" title="隊長位置に仮設キャンプを設置／空のキャンプを移設（C）。預けるのは荷下ろし。">キャンプ設置</button>
          <button type="button" class="secondary" id="btn-camp-unload" title="隊長がキャンプ付近なら小隊全機の積載を置場へ荷下ろし（U）。">小隊荷下ろし</button>
          <button type="button" class="secondary" id="btn-purge" title="パージ（小隊全機）：キャンプ付近は置場へ／それ以外は戦場投下（P）。">パージ／キャンプへ降ろす</button>
          <button type="button" class="secondary" id="btn-camp-pickup" title="キャンプ付近で置場から積込（G）。">キャンプから積込</button>
          <button type="button" class="stance-raid" id="btn-scatter" title="隊長＋生存僚機を遊撃にし、機首基準で三方向に散開（1v1向け一掃）。">散開捜索</button>
          <button type="button" class="secondary" id="btn-abort">撤退</button>
        </div>
        ${squadOrderBarHtml()}
        <p class="help">未発見コンテナは非表示。発見後に黄四角。敵撃破ドロップは発光＋DROP 表示。積載に上限なし（多いほど遅延）。C キャンプ・U 小隊荷下ろし・P パージ・G 取り上げ。マップ上端の EXTRACT HUD（未要請はコンパクト）。抽出→搭乗円内コンテナは離昇時に全回収。僚機方針は 1–4 または小隊バー。</p>
      </div>
      <div>
        <div class="card" style="margin:0">
          <strong>僚機指揮（オフスクリーン可）</strong>
          <div id="wing-panel">${wingPanelHtml()}</div>
        </div>
        <div class="card">
          <strong>戦術／戦報</strong>
          <ul class="log" id="log-list">${logsHtml()}</ul>
        </div>
      </div>
    </div>`;

  bindCanvas();
  document.getElementById("btn-extract")?.addEventListener("click", () => {
    requestExtract(world);
    needsDom = true;
  });
  document.getElementById("btn-camp")?.addEventListener("click", () => {
    setCampOrDeposit(world);
    needsDom = true;
  });
  document.getElementById("btn-camp-unload")?.addEventListener("click", () => {
    const result = unloadAtCamp(world);
    if (result === "unloaded" && world.camp) {
      flashCampToast(`置場 ${world.camp.stashedCount} · キャンプ圏で被弾軽減`);
    }
    needsDom = true;
  });
  document.getElementById("btn-purge")?.addEventListener("click", () => {
    purgeCargo(world);
    needsDom = true;
  });
  document.getElementById("btn-camp-pickup")?.addEventListener("click", () => {
    pickUpFromCamp(world);
    needsDom = true;
  });
  document.getElementById("btn-scatter")?.addEventListener("click", () => {
    doScatterSearch();
  });
  document.getElementById("btn-abort")?.addEventListener("click", () => {
    world.phase = "result";
    world.extracted = false;
    world.failReason = null;
    world.salvaged = 0;
    world.boarding = null;
    world.camp = null;
    needsDom = true;
  });
  bindWingControls(root);
}

function bindWingControls(scope: ParentNode): void {
  scope.querySelectorAll<HTMLButtonElement>("[data-order]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.dataset.order;
      if (!raw) return;
      const [id, stance] = raw.split(":") as [string, Stance];
      order(id, stance);
    });
  });
  scope.querySelectorAll<HTMLButtonElement>("[data-rally]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.rally;
      if (id) rally(id);
    });
  });
  scope.querySelectorAll<HTMLButtonElement>("[data-squad-order]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const stance = btn.dataset.squadOrder as Stance | undefined;
      if (!stance) return;
      applyOrderToAllWingmen(world, stance);
      needsDom = true;
    });
  });
}

function paintHudOnly(): void {
  const t = document.getElementById("hud-time");
  if (t) t.textContent = `${world.timeLeft.toFixed(1)}s`;
  const s = document.getElementById("hud-salvage");
  if (s) s.textContent = String(world.salvaged);
  const a = document.getElementById("hud-ammo");
  if (a) a.textContent = String(world.ammo);
  const h = document.getElementById("hud-hp");
  if (h) h.textContent = String(Math.ceil(world.leader.hp));

  const boardingEl = document.getElementById("hud-boarding");
  if (boardingEl) {
    if (!world.boarding) {
      boardingEl.textContent = "待機（どこでも要請可）";
    } else {
      const cargoEta = boardingCargoEta(world);
      const liftEta = boardingLiftOffEta(world);
      boardingEl.textContent =
        cargoEta != null
          ? `貨物 ${cargoEta.toFixed(1)}s / 離昇 ${(liftEta ?? 0).toFixed(1)}s`
          : `貨物到着 · 離昇 ${(liftEta ?? 0).toFixed(1)}s`;
    }
  }

  const erq = document.getElementById("extract-req-hud");
  if (erq) {
    const wrap = erq.parentElement;
    // Replace overlay in place so canvas listeners stay bound
    const tmp = document.createElement("div");
    tmp.innerHTML = extractReqHudHtml();
    const next = tmp.firstElementChild;
    if (next && wrap) {
      wrap.replaceChild(next, erq);
    }
  }
  const extractBtn = document.getElementById("btn-extract") as HTMLButtonElement | null;
  if (extractBtn) {
    const active = world.boarding != null;
    extractBtn.disabled = active;
    extractBtn.textContent = active ? "抽出シーケンス中…" : "抽出要請（搭乗円）";
  }

  const speedEl = document.getElementById("hud-speed");
  if (speedEl) {
    const mul = unitMoveSpeedMul(world.leader, world);
    speedEl.textContent =
      mul >= 0.999
        ? inCampAura(world, world.leader)
          ? "速度 軽装キャンプ圏"
          : "速度 100%"
        : `速度 ${Math.round(mul * 100)}%（積載遅延）`;
  }
  const campEl = document.getElementById("hud-camp");
  if (campEl) {
    campEl.textContent = world.camp
      ? world.camp.stashedCount > 0
        ? `キャンプ 置場${world.camp.stashedCount}·防衛`
        : `キャンプ 置場${world.camp.stashedCount}`
      : "キャンプ 未設置";
  }

  const panel = document.getElementById("wing-panel");
  if (panel) {
    panel.innerHTML = wingPanelHtml();
    bindWingControls(panel);
  }

  const log = document.getElementById("log-list");
  if (log) log.innerHTML = logsHtml();
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const phaseBefore = world.phase;
  const logLen = world.logs.length;

  if (world.phase === "sortie") {
    syncMoveFromKeys();
    tickWorld(world, dt, input);
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) renderWorld(ctx, world, canvas.width, canvas.height);
    }
    // Light HUD refresh ~8Hz + on log/stance changes
    if (needsDom || world.logs.length !== logLen || Math.floor(now / 120) !== Math.floor((now - dt * 1000) / 120)) {
      paintHudOnly();
      needsDom = false;
    }
  }

  if (world.phase !== phaseBefore) {
    if (world.phase === "result" && forcedEngageActive) {
      markExploreForcedHandoffIntent();
    }
    needsDom = true;
    renderDom();
  }

  requestAnimationFrame(frame);
}

renderDom();
requestAnimationFrame(frame);
