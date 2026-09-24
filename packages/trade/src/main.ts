import "./style.css";
import {
  CTA_COPY,
  BASIC_MATERIAL_LABEL_JA,
  PART_LABEL_JA,
  isBasicMaterialId,
  isPartId,
  isPerfectCircuitDebugContext,
  type YieldItemId,
} from "@estg/shared";
import {
  EXAMPLE_TYPED_REPAIR_COST,
  MECH_FLEET_RULES,
  MECH_STATUS_LABEL_JA,
  buildDeployUrl,
  buildInvadeUrl,
  buildRestoreUrl,
  canAffordRepair,
  canAffordYieldCost,
  canDeploy,
  circuitOutcomeLabelJa,
  clearHandoffFromUrl,
  createInitialHangar,
  describeTypedRepairShortfall,
  durabilityBarClass,
  formatTypedRepairSpend,
  grantDemoInventory,
  grantStarterFleet,
  grantVerifyPerfectLockedCircuit,
  grantVerifyTrueCircuit,
  ingestLocationSearch,
  loadPlaytestSeed,
  resolveHangarPerfectInjectRate,
  VERIFY_TRUE_SOLUTION_HINT,
  markDeployed,
  repairClassic,
  repairCost,
  repairTyped,
  resetHangar,
  scrapMech,
  selectAllDeployable,
  selectCircuit,
  setCraftSignature,
  setDeploySelection,
  simulateReturn,
  statusClass,
  yieldBagFromTypedRepairCost,
  hubCircuitBonuses,
  formatCircuitBonusesJa,
  applyRepairDiscountToCost,
  isRareYieldItemId,
  rareSellPriceCredits,
  RARE_SELL_PRICE_TABLE,
  sellRareItem,
  sellCircuit,
  formatCircuitSellPriceJa,
  isCircuitLocked,
  isCraftSignatureLocked,
  buildNextSortieReadiness,
  buildNextSortieReturnDigest,
  formatInvadeIntelBrief,
  formatCircuitHubBrief,
  buyUnopenedContainers,
  launchSortFromUnopened,
  UNOPENED_CONTAINER_PRICE_CREDITS,
  type HangarState,
} from "./hangar";
import { buildResourceHistoryHtml } from "./resourceHistory";

const root = document.querySelector<HTMLDivElement>("#app")!;
const showInjectionDetails = isPerfectCircuitDebugContext({
  search: window.location.search,
  hostname: window.location.hostname,
  isDev: Boolean(import.meta.env.DEV),
});

/** M4/M5: trade→invade / trade→restore links + invade/restore query ingest (HANDOFF_M45). */

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

/** Failure / blocked notices → warn; success → ok. */
function noticeClass(notice: string): string {
  if (/不足|失敗|なし|のみ|対象なし|機体なし|摩耗対象/.test(notice)) return "warn";
  return "ok";
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
    return `<tr><td colspan="3" class="muted">（空）</td></tr>`;
  }
  return entries
    .map(([id, n]) => {
      const rare = isRareYieldItemId(id);
      const price = rareSellPriceCredits(id);
      const sellCell =
        rare && price != null
          ? `<button type="button" class="secondary sell-rare" data-act="sell-rare" data-id="${escapeHtml(id)}" title="1個売却（仮価格）">売却 仮${price}c</button>`
          : `<span class="muted">—</span>`;
      const rareTag = rare
        ? ` <span class="pill rare-tag">レア</span>`
        : "";
      return `<tr>
        <td>${escapeHtml(labelYield(id))}${rareTag}<div class="mono muted">${escapeHtml(id)}</div></td>
        <td>${n}</td>
        <td>${sellCell}</td>
      </tr>`;
    })
    .join("");
}


function rarePriceTableRows(): string {
  return RARE_SELL_PRICE_TABLE.map((row) => {
    const label = labelYield(row.id);
    return `<tr>
        <td>${escapeHtml(label)} <span class="pill rare-tag">レア</span><div class="mono muted">${escapeHtml(row.id)}</div></td>
        <td class="mono">${row.kind}</td>
        <td>仮 ${row.credits}c</td>
        <td><span class="pill tbd-tag">${escapeHtml(row.balance)}</span></td>
      </tr>`;
  }).join("");
}

function fleetCards(s: HangarState): string {
  if (s.hub.fleet.length === 0) {
    return `<p class="muted">艦隊が空です。「シード読込」または「機体を受領」でデモ機を追加してください。</p>`;
  }
  const typedSpend = formatTypedRepairSpend();
  const circuitBonuses = hubCircuitBonuses(s.hub);
  return s.hub.fleet
    .map((m) => {
      const pct = Math.round((m.durability / m.durabilityMax) * 100);
      const deployable = canDeploy(m);
      const checked = s.selectedDeployIds.includes(m.instanceId);
      const classicBase = repairCost(m);
      const classicCost =
        classicBase != null
          ? applyRepairDiscountToCost(classicBase, circuitBonuses)
          : null;
      const needsRepair = m.status === "needs_repair";
      // Clickable when repairable so shortfall shows as notice (not only disabled).
      const classicClickable = classicCost != null;
      const classicAfford =
        classicCost != null &&
        s.hub.credits >= classicCost.credits &&
        s.hub.materials >= classicCost.materials;
      const typedClickable = needsRepair;
      const typedBag = yieldBagFromTypedRepairCost(EXAMPLE_TYPED_REPAIR_COST);
      const typedAfford =
        needsRepair &&
        s.hub.credits >= EXAMPLE_TYPED_REPAIR_COST.credits &&
        canAffordYieldCost(s.hub.inventory, typedBag);
      const typedHint = needsRepair
        ? typedAfford
          ? `<p class="muted" style="margin:0.35rem 0 0">型付き消費: ${escapeHtml(typedSpend)}</p>`
          : `<p class="warn" style="margin:0.35rem 0 0">${escapeHtml(
              describeTypedRepairShortfall(s.hub.credits, s.hub.inventory) ??
                "型付き資材不足",
            )}</p>`
        : "";
      const classicHint =
        needsRepair && classicCost && !classicAfford
          ? `<p class="warn" style="margin:0.2rem 0 0">集計不足（要 ${classicCost.credits}c / ${classicCost.materials}m · 持 ${s.hub.credits}c / ${s.hub.materials}m）</p>`
          : "";

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
          <button type="button" class="fleet-act" data-act="repair-classic" data-id="${escapeHtml(m.instanceId)}" ${
            classicClickable ? "" : "disabled"
          } title="集計クレジット/資材を消費して健在へ">${
            classicAfford
              ? `集計 −${MECH_FLEET_RULES.repairCredits}c/−${MECH_FLEET_RULES.repairMaterials}m`
              : `集計 ${MECH_FLEET_RULES.repairCredits}c/${MECH_FLEET_RULES.repairMaterials}m`
          }</button>
          <button type="button" class="fleet-act" data-act="repair-typed" data-id="${escapeHtml(m.instanceId)}" ${
            typedClickable ? "" : "disabled"
          } title="型付き YieldBag + クレジットを消費して健在へ">${
            typedAfford ? `型付き ${escapeHtml(typedSpend)}` : "型付き修理"
          }</button>
          <button type="button" class="secondary fleet-act" data-act="scrap" data-id="${escapeHtml(m.instanceId)}">解体</button>
        </div>
        ${typedHint}${classicHint}
      </div>`;
    })
    .join("");
}


function circuitRows(s: HangarState): string {
  const list = s.hub.circuits ?? [];
  if (list.length === 0) {
    return `<p class="muted" style="margin:0.5rem 0 0">回路なし（restore 取込またはシード読込で HubSave に残ります）</p>`;
  }
  const brief = formatCircuitHubBrief(list, s.lastCircuit);
  const effectById = new Map(brief.lines.map((l) => [l.circuitId, l]));
  return `<table style="margin-top:0.5rem">
    <thead><tr><th>circuitId</th><th>outcome / 刻印</th><th>効果値</th><th></th></tr></thead>
    <tbody>
      ${list
        .map((c) => {
          const active =
            s.lastCircuit?.circuitId === c.circuitId ? " · 選択中" : "";
          const url = buildRestoreUrl(s, c.circuitId);
          const locked = isCircuitLocked(c);
          const editor =
            c.lastEditorName ?? c.circuitBoard.lastEditorName ?? "—";
          const lockTag = locked
            ? ` <span class="pill lock-tag">完璧·編集不可</span>`
            : "";
          const line = effectById.get(c.circuitId);
          const effect = line?.effect ?? 0;
          const effectJa = line?.effectJa ?? `効果 ${effect}`;
          const effectBreakdownJa =
            line?.effectBreakdownJa ?? "内訳なし";
          const priceBrk = formatCircuitSellPriceJa(effect);
          const price = priceBrk.total;
          return `<tr>
            <td>
              <span class="mono">${escapeHtml(c.circuitId)}</span>${lockTag}
              ${
                c.circuitBoard.puzzleId
                  ? `<div class="mono muted">${escapeHtml(c.circuitBoard.puzzleId)}</div>`
                  : ""
              }
              <div class="muted" style="font-size:0.75rem">${escapeHtml(active.trim())}</div>
            </td>
            <td>
              ${escapeHtml(circuitOutcomeLabelJa(c.outcome))}
              <span class="mono muted">(${escapeHtml(c.outcome)})</span>
              <div class="engraved" style="font-size:0.8rem">刻印 ${escapeHtml(editor)}</div>
            </td>
            <td>
              <strong>${escapeHtml(effectJa)}</strong>
              <div class="muted effect-breakdown">${escapeHtml(effectBreakdownJa)}</div>
              <div class="mono muted">売却 仮 ${price}c（${escapeHtml(priceBrk.detailJa)}）</div>
            </td>
            <td>
              <div class="row" style="margin:0;justify-content:flex-end">
                <button type="button" class="secondary" data-act="select-circuit" data-id="${escapeHtml(c.circuitId)}">選択</button>
                <a class="btn secondary" href="${escapeHtml(url)}" target="_top" rel="noopener" data-circuit-open="${escapeHtml(c.circuitId)}">${locked ? CTA_COPY.view : CTA_COPY.toRestore}</a>
                <button type="button" class="secondary sell-circuit" data-act="sell-circuit" data-id="${escapeHtml(c.circuitId)}" data-price="${price}" data-price-detail="${escapeHtml(priceBrk.detailJa)}" title="最低${priceBrk.base}c + 出来栄え（有効値×3c）で売却">${escapeHtml(priceBrk.buttonJa)}</button>
              </div>
            </td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}

function unopenedPanel(s: HangarState): string {
  const stock = Math.max(0, Math.floor(s.hub.unopenedContainers ?? 0));
  const unit = UNOPENED_CONTAINER_PRICE_CREDITS;
  const credits = Math.floor(Number(s.hub.credits) || 0);
  const maxAfford = Math.floor(credits / unit);
  const buyDisabled = maxAfford < 1;
  const sortDisabled = stock < 1;
  return `
    <div class="card" id="unopened-panel">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">未開封コンテナ</h2>
      <p class="muted" style="margin:0 0 0.5rem;font-size:0.75rem">探索を経由せず仕分（Module 2）へ送れる在庫。スキップ預け / 購入（仮 ${unit}c/個）。</p>
      <div class="stat-pills" style="margin-bottom:0.5rem">
        <span class="stat-pill"><span class="stat-k">在庫</span> ${stock}</span>
        <span class="stat-pill muted"><span class="stat-k">単価</span> ${unit}c</span>
      </div>
      <div class="row" style="align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem">
        <label class="muted" for="input-buy-unopened">購入数</label>
        <input type="number" id="input-buy-unopened" min="1" step="1" value="1" ${buyDisabled ? "disabled" : ""} style="width:4.5rem" />
        <button type="button" id="btn-buy-unopened" ${buyDisabled ? "disabled" : ""} title="クレジット不足時は無効">購入（${unit}c×数量）</button>
        <span class="muted mono" id="buy-unopened-total">合計 ${unit}c</span>
      </div>
      <div class="row" style="align-items:center;flex-wrap:wrap;gap:0.5rem">
        <label class="muted" for="input-sort-unopened">仕分数</label>
        <input type="number" id="input-sort-unopened" min="1" max="${Math.max(1, stock)}" step="1" value="${stock > 0 ? stock : 1}" ${sortDisabled ? "disabled" : ""} style="width:4.5rem" />
        <button type="button" id="btn-sort-unopened" ${sortDisabled ? "disabled" : ""} title="在庫から仕分へ出庫（Explore なし）">${CTA_COPY.toSort}</button>
      </div>
      ${
        buyDisabled
          ? `<p class="muted" style="margin-top:0.5rem;font-size:0.75rem">購入不可（要 ${unit}c 以上）</p>`
          : ""
      }
      ${
        sortDisabled
          ? `<p class="muted" style="margin-top:0.35rem;font-size:0.75rem">仕分出庫できる未開封がありません</p>`
          : ""
      }
    </div>
  `;
}

function nextSortiePanel(s: HangarState): string {
  const ready = buildNextSortieReadiness(s);
  const digest = buildNextSortieReturnDigest(s);
  const deployUrl = buildDeployUrl(s);
  const invadeUrl = buildInvadeUrl(s);
  const restoreUrl = buildRestoreUrl(s);
  const circuits = formatCircuitHubBrief(s.hub.circuits, s.lastCircuit);
  const bonuses = formatCircuitBonusesJa(hubCircuitBonuses(s.hub));
  const readyToDeploy = ready.canDeployExplore && ready.needsRepair === 0;
  const emphasizeDeploy = readyToDeploy && !!deployUrl;

  const deployList =
    ready.selectedIds.length === 0
      ? `<p class="muted sortie-line">配備対象なし — 健在機を修理するか受領してください。</p>`
      : `<ul class="sortie-deploy-list">
          ${ready.selectedIds
            .map((id) => {
              const m = s.hub.fleet.find((x) => x.instanceId === id);
              if (!m) return `<li class="mono">${escapeHtml(id)}</li>`;
              const pct = Math.round((m.durability / m.durabilityMax) * 100);
              return `<li>
                <strong>${escapeHtml(m.catalogId)}</strong>
                <span class="muted">耐久 ${m.durability}/${m.durabilityMax} (${pct}%)</span>
              </li>`;
            })
            .join("")}
        </ul>`;

  const repairLine =
    ready.needsRepair === 0
      ? `<p class="ok sortie-line">修理待ちなし — 出撃可</p>`
      : `<p class="warn sortie-line">要修理 ${ready.needsRepair}機 — 下のハンガーで修理 / 解体</p>
         <ul class="sortie-deploy-list">
           ${ready.repairTargets
             .map(
               (t) =>
                 `<li><strong>${escapeHtml(t.catalogId)}</strong>
                   <span class="muted">${t.durability}/${t.durabilityMax}</span>
                   <span class="mono muted">${escapeHtml(t.instanceId)}</span></li>`,
             )
             .join("")}
         </ul>`;

  const hasExplore = s.lastExploreReturn != null;
  const hasIntel = s.lastInvadeSector != null;
  const hasCircuit = (s.hub.circuits?.length ?? 0) > 0;
  const activeLine =
    circuits.lines.find((l) => l.active) ?? circuits.lines[0] ?? null;
  const activeEffect = activeLine?.effectJa ?? "効果 —";
  const activeBreakdown = activeLine?.effectBreakdownJa ?? "";
  const unopenedStock = Math.max(
    0,
    Math.floor(s.hub.unopenedContainers ?? 0),
  );
  const sortReady = unopenedStock >= 1;

  return `
    <div class="card sortie-card sortie-hero${emphasizeDeploy ? " sortie-ready-deploy" : ""}">
      <div class="sortie-head">
        <div>
          <p class="sortie-kicker">HUB HERO</p>
          <h2>次の出撃</h2>
        </div>
        <span class="pill sortie-ready">${escapeHtml(ready.readinessLabelJa)}</span>
      </div>
      <p class="muted sortie-sub">帰還を確認し、短距離で次へ。戦線 / 探索 / 修復 / 仕分（未開封）。</p>
      <div class="sortie-returns" aria-label="帰還ワンライナー">
        <h3 class="sortie-h3">帰還サマリー</h3>
        <p class="${hasExplore ? "ok" : "muted"} sortie-line">探索: ${escapeHtml(digest.exploreJa)}</p>
        <p class="${hasIntel ? "ok" : "muted"} sortie-line">戦線: ${escapeHtml(digest.invadeJa)}</p>
        <p class="${hasCircuit ? "ok" : "muted"} sortie-line">回路: ${escapeHtml(digest.restoreJa)}</p>
        <p class="sortie-line effect-line"><span class="effect-k">回路効果値</span> <strong>${escapeHtml(activeEffect)}</strong></p>
        ${
          activeBreakdown
            ? `<p class="muted sortie-line effect-breakdown">${escapeHtml(activeBreakdown)}</p>`
            : ""
        }
        <p class="muted sortie-line">回路ボーナス: ${escapeHtml(bonuses)}</p>
      </div>
      <div class="sortie-grid">
        <div>
          <h3 class="sortie-h3">配備予定</h3>
          ${deployList}
        </div>
        <div>
          <h3 class="sortie-h3">摩耗 / 修理</h3>
          ${repairLine}
        </div>
      </div>
      <div class="row sortie-actions sortie-actions-tight${emphasizeDeploy ? " sortie-actions-hero" : ""}" aria-label="次の出撃ショートカット">
        <a class="btn secondary" id="link-invade" href="${escapeHtml(invadeUrl)}" target="_top" rel="noopener" title="Invade">${CTA_COPY.toFront}</a>
        ${
          deployUrl
            ? `<a class="btn${emphasizeDeploy ? " deploy-cta" : ""}" id="link-deploy" href="${escapeHtml(deployUrl)}" target="_top" rel="noopener" title="Explore">${emphasizeDeploy ? "▶ " + CTA_COPY.toExplore : CTA_COPY.toExplore}</a>`
            : `<button type="button" disabled title="健在機が必要（Explore）">${CTA_COPY.toExplore}</button>`
        }
        <a class="btn secondary" id="link-restore" href="${escapeHtml(restoreUrl)}" target="_top" rel="noopener" title="Restore">${CTA_COPY.toRestore}</a>
        ${
          sortReady
            ? `<button type="button" class="secondary" id="btn-sortie-sort" title="Sort · 未開封 ${unopenedStock} → 仕分">${CTA_COPY.toSort}</button>`
            : `<button type="button" class="secondary" id="btn-sortie-sort" disabled title="未開封在庫が必要（Sort）">${CTA_COPY.toSort}</button>`
        }
      </div>
      <details class="sortie-details">
        <summary>シミュ帰還 · URL</summary>
        <div class="row">
          <button type="button" class="secondary" data-sim="extract">extract</button>
          <button type="button" class="secondary" data-sim="abort">abort</button>
          <button type="button" class="secondary" data-sim="fail">fail</button>
        </div>
        ${
          deployUrl
            ? `<p class="mono muted" style="margin-top:0.5rem">${escapeHtml(deployUrl)}</p>`
            : ""
        }
        <p class="mono muted" style="margin-top:0.35rem">${escapeHtml(invadeUrl)}</p>
        <p class="mono muted" style="margin-top:0.35rem">${escapeHtml(restoreUrl)}</p>
      </details>
    </div>`;
}

function render() {
  const ready = buildNextSortieReadiness(state);
  const typedCost = yieldBagFromTypedRepairCost(EXAMPLE_TYPED_REPAIR_COST);
  const typedCostText = Object.entries(typedCost)
    .map(([k, v]) => `${k}:${v}`)
    .join(" · ");
  const ammoTotal =
    state.hub.ammoLoad.ammo_standard +
    state.hub.ammoLoad.ammo_ap +
    state.hub.ammoLoad.ammo_hp;

  root.innerHTML = `
    <p class="pill">MODULE 3 · TRADE · HANGAR V0</p>
    <h1>BASE HUB</h1>
    <p class="muted">次の出撃に向けて艦隊・資材・戻りインテルを整える拠点。</p>
    ${
      state.notice
        ? `<p class="${noticeClass(state.notice)}">${escapeHtml(state.notice)}</p>`
        : ""
    }

    ${nextSortiePanel(state)}

    <div class="card wallet-card">
      <div class="stat-pills">
        <span class="stat-pill"><span class="stat-k">Cr</span> ${state.hub.credits}</span>
        <span class="stat-pill"><span class="stat-k">資材</span> ${state.hub.materials}</span>
        <span class="stat-pill"><span class="stat-k">弾薬</span> ${ammoTotal}</span>
        <span class="stat-pill"><span class="stat-k">艦隊</span> ${ready.total}/3</span>
        <span class="stat-pill"><span class="stat-k">未開封</span> ${Math.max(0, Math.floor(state.hub.unopenedContainers ?? 0))}</span>
        <span class="stat-pill muted"><span class="stat-k">搬入</span> ${state.hub.importedMaterials}</span>
      </div>
      <div class="row">
        <button type="button" id="btn-seed">シード読込</button>
        <button type="button" class="secondary" id="btn-grant">機体を受領</button>
        <button type="button" class="secondary" id="btn-inv">デモ資材</button>
        <button type="button" class="secondary" id="btn-reset">初期化</button>
      </div>
      <details class="sortie-details">
        <summary>検証用回路 · ヘルプ</summary>
        <div class="row" style="margin-top:0.5rem">
          <button type="button" class="secondary" id="btn-verify-true" title="可解な 2×2 真盤（未解）を HubSave.circuits へ">検証用真盤</button>
          <button type="button" class="secondary" id="btn-verify-perfect" title="既に完璧ロック済みの検証盤（刻印付き）">検証用・完璧</button>
        </div>
        <p class="muted" style="margin-top:0.5rem">シード = 健在2 + 要修理1 · 型付き資材/弾薬。Perfect inject（DEV 33% / 本番 1% · <span class="mono">?perfectRate=</span>）。</p>
      </details>
    </div>

    ${unopenedPanel(state)}

    <div class="card">
      <div class="sortie-head">
        <h2 style="font-size:1rem;margin:0">ハンガー</h2>
        <button type="button" class="secondary compact" id="btn-select-all">健在を全選択</button>
      </div>
      ${fleetCards(state)}
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">型付き在庫</h2>
      <table>
        <thead><tr><th>アイテム</th><th>数量</th><th>売却</th></tr></thead>
        <tbody>${inventoryRows(state.hub)}</tbody>
      </table>
      <p class="muted" style="margin-top:0.5rem">レアのみ売却可。型付き修理例: ${EXAMPLE_TYPED_REPAIR_COST.credits}c + ${escapeHtml(typedCostText || "—")}</p>
      <details class="sortie-details">
        <summary>レア売却 仮価格表 <span class="pill tbd-tag">TBD</span></summary>
        <p class="muted" style="margin:0.5rem 0">明示テーブル（<span class="mono">RARE_SELL_PRICE_TABLE</span>）。バランス未調整。</p>
        <table>
          <thead><tr><th>アイテム</th><th>種別</th><th>仮価格</th><th>状態</th></tr></thead>
          <tbody>${rarePriceTableRows()}</tbody>
        </table>
      </details>
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">署名（刻印）</h2>
      <div class="row" style="align-items:center;margin-top:0.35rem">
        <input type="text" id="input-signature" maxlength="32" placeholder="署名" value="${escapeHtml(state.craftSignature)}" ${
          isCraftSignatureLocked() ? "disabled" : ""
        } class="sig-input" />
        <button type="button" id="btn-signature" ${
          isCraftSignatureLocked() ? "disabled" : ""
        }>確定</button>
      </div>
      <p class="muted" style="margin-top:0.5rem">${
        isCraftSignatureLocked()
          ? `確定済み: <span class="engraved">${escapeHtml(state.craftSignature)}</span>`
          : "未確定（確定で localStorage に刻印・変更不可）"
      }</p>
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">保有回路</h2>
      <p class="muted" style="margin:0 0 0.35rem;font-size:0.75rem">効果値は Restore/Trade 共通スコア（最小閉ループ）。売却 仮 = 最低30c + 出来栄え（有効値×3c）。効果0も +30c で売却可。</p>
      <p class="muted" style="margin:0 0 0.35rem;font-size:0.75rem">検証ヒント: ${escapeHtml(VERIFY_TRUE_SOLUTION_HINT)}</p>
      ${circuitRows(state)}
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">資源履歴</h2>
      ${buildResourceHistoryHtml(state.log)}
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">ログ</h2>
      <ul class="muted log-list">
        ${state.log.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}
      </ul>
    </div>
  `;

  document.getElementById("btn-signature")?.addEventListener("click", () => {
    const input = document.getElementById("input-signature") as HTMLInputElement | null;
    state = setCraftSignature(state, input?.value ?? "");
    render();
  });
  document.getElementById("btn-seed")?.addEventListener("click", () => {
    const injectRate = resolveHangarPerfectInjectRate({
      search: window.location.search,
      hostname: window.location.hostname,
      isDev: Boolean(import.meta.env.DEV),
      envRate:
        (import.meta.env.VITE_PERFECT_CIRCUIT_RATE as string | undefined) ??
        (import.meta.env.PERFECT_CIRCUIT_RATE as string | undefined) ??
        null,
    });
    state = loadPlaytestSeed(state, { injectRate, showInjectionDetails });
    render();
  });
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
  document.getElementById("btn-verify-true")?.addEventListener("click", () => {
    state = grantVerifyTrueCircuit(state);
    render();
  });
  document.getElementById("btn-verify-perfect")?.addEventListener("click", () => {
    state = grantVerifyPerfectLockedCircuit(state);
    render();
  });
  document.getElementById("btn-select-all")?.addEventListener("click", () => {
    state = selectAllDeployable(state);
    render();
  });
  const buyQtyInput = document.getElementById(
    "input-buy-unopened",
  ) as HTMLInputElement | null;
  const buyTotalEl = document.getElementById("buy-unopened-total");
  const syncBuyTotal = () => {
    if (!buyTotalEl || !buyQtyInput) return;
    const q = Math.max(1, Math.floor(Number(buyQtyInput.value) || 1));
    buyQtyInput.value = String(q);
    const total = q * UNOPENED_CONTAINER_PRICE_CREDITS;
    buyTotalEl.textContent = `合計 ${total}c`;
    const btn = document.getElementById(
      "btn-buy-unopened",
    ) as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = state.hub.credits < total;
    }
  };
  buyQtyInput?.addEventListener("input", syncBuyTotal);
  syncBuyTotal();
  document.getElementById("btn-buy-unopened")?.addEventListener("click", () => {
    const q = Math.max(1, Math.floor(Number(buyQtyInput?.value) || 1));
    state = buyUnopenedContainers(state, q);
    render();
  });
  document.getElementById("btn-sort-unopened")?.addEventListener("click", () => {
    const input = document.getElementById(
      "input-sort-unopened",
    ) as HTMLInputElement | null;
    const q = Math.max(1, Math.floor(Number(input?.value) || 1));
    const launched = launchSortFromUnopened(state, q);
    state = launched.state;
    if (launched.url) {
      window.location.assign(launched.url);
      return;
    }
    render();
  });
  document.getElementById("btn-sortie-sort")?.addEventListener("click", () => {
    const stock = Math.max(0, Math.floor(state.hub.unopenedContainers ?? 0));
    if (stock < 1) return;
    const launched = launchSortFromUnopened(state, stock);
    state = launched.state;
    if (launched.url) {
      window.location.assign(launched.url);
      return;
    }
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
      else if (act === "select-circuit") state = selectCircuit(state, id);
      else if (act === "sell-rare") state = sellRareItem(state, id, 1);
      else if (act === "sell-circuit") {
        const price = el.dataset.price ?? "?";
        const detail = el.dataset.priceDetail ?? "";
        const confirmExtra = detail ? `\n${detail}` : "";
        if (!window.confirm(`回路を売却しますか？\n${id}\n仮 +${price}c${confirmExtra}`)) return;
        state = sellCircuit(state, id);
      }
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
