import "./style.css";
import { STANCE_LABEL, type Stance, type World } from "./game/types";
import {
  bootstrapFromSearch,
  createWorld,
  startSortie,
} from "./game/world";
import { applyOrder, rallyWingman } from "./game/orders";
import { isWingmanOffscreen, tickWorld, tryExtract, type PlayerInput } from "./game/sim";
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
let world: World = createWorld(boot);

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

window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  if (["w", "a", "s", "d", " "].includes(e.key.toLowerCase())) e.preventDefault();
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

function wingPanelHtml(): string {
  return world.wingmen
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
        <div class="muted">HP ${Math.max(0, Math.ceil(w.hp))}/${w.maxHp} · 積載 ${w.salvagedCount}/${w.capacity}</div>
        <div class="row">
          <button type="button" class="secondary" data-rally="${w.id}">召還</button>
          ${btns}
        </div>
      </div>`;
    })
    .join("");
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

  if (world.phase === "briefing") {
    root.innerHTML = `
      <p class="pill">MODULE 1 · EXPLORE · BEHAVIOR v0</p>
      <h1>WRECKLINE 探索（振る舞い垂直スライス）</h1>
      <p class="muted">モノレポ正本。旧 grok.me Module1 は練習用／退役 — URL 非依存。</p>
      <div class="card">
        <div class="muted">${escapeHtml(world.note)}</div>
        <table>
          <tr><td>僚機</td><td>${world.wingmen.length}</td></tr>
          <tr><td>積載上限</td><td>${world.carrierCapacity}</td></tr>
          <tr><td>実弾</td><td>${world.ammo}</td></tr>
          <tr><td>活動限界</td><td>${world.maxOperationTimeSec}s</td></tr>
          <tr><td>I/O v2 ids</td><td>${world.deployedInstanceIds.length ? world.deployedInstanceIds.join(", ") : "（なし・件数互換）"}</td></tr>
        </table>
        <div class="row"><button type="button" id="btn-start">出撃</button></div>
        <p class="help">WASD 移動 · クリック移動 · Space/F 射撃 · E 回収 · 右パネルで僚機命令（画面外も可）</p>
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
      world = createWorld(bootstrapFromSearch(window.location.search));
      needsDom = true;
      renderDom();
    });
    return;
  }

  // sortie
  root.innerHTML = `
    <p class="pill">MODULE 1 · SORTIE</p>
    <h1>WRECKLINE</h1>
    <div class="hud">
      <span>残時間 <strong id="hud-time">${world.timeLeft.toFixed(1)}s</strong></span>
      <span>回収 <strong id="hud-salvage">${world.salvaged}/${world.carrierCapacity}</strong></span>
      <span>実弾 <strong id="hud-ammo">${world.ammo}</strong></span>
      <span>隊長HP <strong id="hud-hp">${Math.ceil(world.leader.hp)}</strong></span>
    </div>
    <div class="layout">
      <div>
        <div class="canvas-wrap">
          <canvas id="map" width="720" height="420"></canvas>
        </div>
        <div class="row">
          <button type="button" id="btn-extract">脱出（EXTRACT上）</button>
          <button type="button" class="secondary" id="btn-abort">撤退</button>
        </div>
        <p class="help">未発見コンテナは非表示。発見後に黄四角。遊撃は地点指定なし。</p>
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
    tryExtract(world);
    needsDom = true;
  });
  document.getElementById("btn-abort")?.addEventListener("click", () => {
    world.phase = "result";
    world.extracted = false;
    world.failReason = null;
    world.salvaged = 0;
    needsDom = true;
  });
  root.querySelectorAll<HTMLButtonElement>("[data-order]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.dataset.order;
      if (!raw) return;
      const [id, stance] = raw.split(":") as [string, Stance];
      order(id, stance);
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-rally]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.rally;
      if (id) rally(id);
    });
  });
}

function paintHudOnly(): void {
  const t = document.getElementById("hud-time");
  if (t) t.textContent = `${world.timeLeft.toFixed(1)}s`;
  const s = document.getElementById("hud-salvage");
  if (s) s.textContent = `${world.salvaged}/${world.carrierCapacity}`;
  const a = document.getElementById("hud-ammo");
  if (a) a.textContent = String(world.ammo);
  const h = document.getElementById("hud-hp");
  if (h) h.textContent = String(Math.ceil(world.leader.hp));

  const panel = document.getElementById("wing-panel");
  if (panel) panel.innerHTML = wingPanelHtml();
  // rebind wing buttons after innerHTML replace
  panel?.querySelectorAll<HTMLButtonElement>("[data-order]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.dataset.order;
      if (!raw) return;
      const [id, stance] = raw.split(":") as [string, Stance];
      order(id, stance);
    });
  });
  panel?.querySelectorAll<HTMLButtonElement>("[data-rally]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.rally;
      if (id) rally(id);
    });
  });

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
    needsDom = true;
    renderDom();
  }

  requestAnimationFrame(frame);
}

renderDom();
requestAnimationFrame(frame);
