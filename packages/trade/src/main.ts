import "./style.css";
import {
  BASIC_MATERIAL_LABEL_JA,
  PART_LABEL_JA,
  isBasicMaterialId,
  isPartId,
  type YieldItemId,
} from "@estg/shared";
import {
  EXAMPLE_TYPED_REPAIR_COST,
  MECH_FLEET_RULES,
  MECH_STATUS_LABEL_JA,
  buildDeployUrl,
  canAffordRepair,
  canAffordYieldCost,
  canDeploy,
  clearHandoffFromUrl,
  createInitialHangar,
  durabilityBarClass,
  grantDemoInventory,
  grantStarterFleet,
  ingestLocationSearch,
  markDeployed,
  repairClassic,
  repairCost,
  repairTyped,
  resetHangar,
  scrapMech,
  selectAllDeployable,
  setDeploySelection,
  simulateReturn,
  statusClass,
  yieldBagFromTypedRepairCost,
  type HangarState,
} from "./hangar";

const root = document.querySelector<HTMLDivElement>("#app")!;

let state: HangarState = createInitialHangar();
{
  const ingested = ingestLocationSearch(state, window.location.search);
  state = ingested.state;
  if (ingested.consumed) clearHandoffFromUrl();
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

function inventoryRows(hub: HangarState["hub"]): string {
  const entries = Object.entries(hub.inventory).filter(
    ([, n]) => (n ?? 0) > 0,
  ) as Array<[YieldItemId, number]>;
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

function fleetCards(s: HangarState): string {
  if (s.hub.fleet.length === 0) {
    return `<p class="muted">艦隊が空です。「機体を受領」でデモ機を追加してください。</p>`;
  }
  return s.hub.fleet
    .map((m) => {
      const pct = Math.round((m.durability / m.durabilityMax) * 100);
      const deployable = canDeploy(m);
      const checked = s.selectedDeployIds.includes(m.instanceId);
      const classicCost = repairCost(m);
      const classicOk =
        classicCost != null &&
        canAffordRepair(m, {
          credits: s.hub.credits,
          materials: s.hub.materials,
        });
      const typedBag = yieldBagFromTypedRepairCost(EXAMPLE_TYPED_REPAIR_COST);
      const typedOk =
        m.status === "needs_repair" &&
        s.hub.credits >= EXAMPLE_TYPED_REPAIR_COST.credits &&
        canAffordYieldCost(s.hub.inventory, typedBag);

      return `
      <div class="fleet-row" data-id="${escapeHtml(m.instanceId)}">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div>
            <strong>${escapeHtml(m.catalogId)}</strong>
            <span class="${statusClass(m.status)}"> ${MECH_STATUS_LABEL_JA[m.status]}</span>
            <div class="mono muted">${escapeHtml(m.instanceId)}</div>
          </div>
          <label class="check">
            <input type="checkbox" data-act="select" data-id="${escapeHtml(m.instanceId)}" ${
              deployable ? "" : "disabled"
            } ${checked && deployable ? "checked" : ""} />
            出撃
          </label>
        </div>
        <div style="margin-top:0.35rem">
          耐久 ${m.durability}/${m.durabilityMax}
          <span class="${durabilityBarClass(m.status)}"><span style="width:${pct}%"></span></span>
        </div>
        <div class="row">
          <button type="button" data-act="repair-classic" data-id="${escapeHtml(m.instanceId)}" ${
            classicOk ? "" : "disabled"
          }>修理（集計 ${MECH_FLEET_RULES.repairCredits}c/${MECH_FLEET_RULES.repairMaterials}m）</button>
          <button type="button" data-act="repair-typed" data-id="${escapeHtml(m.instanceId)}" ${
            typedOk ? "" : "disabled"
          }>修理（型付き）</button>
          <button type="button" class="secondary" data-act="scrap" data-id="${escapeHtml(m.instanceId)}">解体</button>
        </div>
      </div>`;
    })
    .join("");
}

function render() {
  const deployUrl = buildDeployUrl(state);
  const typedCost = yieldBagFromTypedRepairCost(EXAMPLE_TYPED_REPAIR_COST);
  const typedCostText = Object.entries(typedCost)
    .map(([k, v]) => `${k}:${v}`)
    .join(" · ");

  root.innerHTML = `
    <p class="pill">MODULE 3 · TRADE · HANGAR V0</p>
    <h1>BASE HUB 最小ハンガー</h1>
    <p class="muted">フリート循環・ハンドオフ・型付き在庫の契約を見える化するスタブです。</p>
    ${
      state.notice
        ? `<p class="ok">${escapeHtml(state.notice)}</p>`
        : ""
    }

    <div class="card">
      <table>
        <tr><td>クレジット</td><td>${state.hub.credits}</td></tr>
        <tr><td>資材（集計）</td><td>${state.hub.materials}</td></tr>
        <tr><td>弾薬合計</td><td>${
          state.hub.ammoLoad.ammo_standard +
          state.hub.ammoLoad.ammo_ap +
          state.hub.ammoLoad.ammo_hp
        }</td></tr>
        <tr><td>直近搬入</td><td>${state.hub.importedMaterials}</td></tr>
        <tr><td>艦隊</td><td>${state.hub.fleet.length} / 3</td></tr>
      </table>
      <div class="row">
        <button type="button" id="btn-grant">機体を受領</button>
        <button type="button" class="secondary" id="btn-inv">デモ資材バッグ</button>
        <button type="button" class="secondary" id="btn-reset">デモ初期化</button>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">ハンガー</h2>
      ${fleetCards(state)}
      <div class="row">
        <button type="button" class="secondary" id="btn-select-all">健在を全選択</button>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">型付き在庫 (YieldBag)</h2>
      <table>${inventoryRows(state.hub)}</table>
      <p class="muted" style="margin-top:0.5rem">型付き修理例: ${EXAMPLE_TYPED_REPAIR_COST.credits}c + ${escapeHtml(typedCostText || "—")}</p>
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">出撃 → Explore</h2>
      ${
        deployUrl
          ? `<div class="row">
              <a class="btn" id="link-deploy" href="${escapeHtml(deployUrl)}" target="_top" rel="noopener">探索へ配備</a>
            </div>
            <p class="mono muted" style="margin-top:0.75rem">${escapeHtml(deployUrl)}</p>`
          : `<p class="warn">健在機がありません。受領するか修理してください。</p>`
      }
      <p class="muted" style="margin-top:0.5rem">帰還は explore の「拠点へ摩耗報告」（returnKind / mechWear）か下のシミュ。localhost では :5173 ↔ :5175。</p>
      <div class="row">
        <button type="button" class="secondary" data-sim="extract">シミュ帰還 extract</button>
        <button type="button" class="secondary" data-sim="abort">シミュ帰還 abort</button>
        <button type="button" class="secondary" data-sim="fail">シミュ帰還 fail</button>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">ログ</h2>
      <ul class="muted" style="margin:0;padding-left:1.1rem;font-size:0.8rem">
        ${state.log.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}
      </ul>
    </div>
  `;

  document.getElementById("btn-grant")?.addEventListener("click", () => {
    state = grantStarterFleet(state);
    render();
  });
  document.getElementById("btn-inv")?.addEventListener("click", () => {
    state = grantDemoInventory(state);
    render();
  });
  document.getElementById("btn-reset")?.addEventListener("click", () => {
    state = resetHangar();
    render();
  });
  document.getElementById("btn-select-all")?.addEventListener("click", () => {
    state = selectAllDeployable(state);
    render();
  });
  document.getElementById("link-deploy")?.addEventListener("click", () => {
    const url = buildDeployUrl(state);
    if (!url) return;
    const u = new URL(url);
    const ids = (u.searchParams.get("deployedInstanceIds") ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    state = markDeployed(state, ids);
  });

  root.querySelectorAll<HTMLInputElement>('input[data-act="select"]').forEach((el) => {
    el.addEventListener("change", () => {
      const id = el.dataset.id!;
      state = setDeploySelection(state, id, el.checked);
      render();
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.id!;
      const act = el.dataset.act!;
      if (act === "repair-classic") state = repairClassic(state, id);
      else if (act === "repair-typed") state = repairTyped(state, id);
      else if (act === "scrap") {
        if (!window.confirm(`解体しますか？\n${id}`)) return;
        state = scrapMech(state, id);
      }
      render();
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-sim]").forEach((el) => {
    el.addEventListener("click", () => {
      const kind = el.dataset.sim as "extract" | "abort" | "fail";
      state = simulateReturn(state, kind);
      render();
    });
  });
}

render();
