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
  sellRareItem,
  isCircuitLocked,
  isCraftSignatureLocked,
  type HangarState,
} from "./hangar";

const root = document.querySelector<HTMLDivElement>("#app")!;

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
          <button type="button" data-act="repair-classic" data-id="${escapeHtml(m.instanceId)}" ${
            classicClickable ? "" : "disabled"
          } title="集計クレジット/資材を消費して健在へ">${
            classicAfford
              ? `修理（集計 −${MECH_FLEET_RULES.repairCredits}c/−${MECH_FLEET_RULES.repairMaterials}m）`
              : `修理（集計 ${MECH_FLEET_RULES.repairCredits}c/${MECH_FLEET_RULES.repairMaterials}m）`
          }</button>
          <button type="button" data-act="repair-typed" data-id="${escapeHtml(m.instanceId)}" ${
            typedClickable ? "" : "disabled"
          } title="型付き YieldBag + クレジットを消費して健在へ">${
            typedAfford
              ? `修理（型付き ${escapeHtml(typedSpend)}）`
              : "修理（型付き）"
          }</button>
          <button type="button" class="secondary" data-act="scrap" data-id="${escapeHtml(m.instanceId)}">解体</button>
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
  return `<table style="margin-top:0.5rem">
    <thead><tr><th>circuitId</th><th>outcome / 刻印</th><th></th></tr></thead>
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
              <div class="row" style="margin:0">
                <button type="button" class="secondary" data-act="select-circuit" data-id="${escapeHtml(c.circuitId)}">選択</button>
                <a class="btn secondary" href="${escapeHtml(url)}" target="_top" rel="noopener" data-circuit-open="${escapeHtml(c.circuitId)}">${locked ? "閲覧へ" : "修復へ"}</a>
              </div>
            </td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}

function render() {
  const deployUrl = buildDeployUrl(state);
  const invadeUrl = buildInvadeUrl(state);
  const restoreUrl = buildRestoreUrl(state);
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
        ? `<p class="${noticeClass(state.notice)}">${escapeHtml(state.notice)}</p>`
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
        <button type="button" id="btn-seed">シード読込</button>
        <button type="button" class="secondary" id="btn-grant">機体を受領</button>
        <button type="button" class="secondary" id="btn-inv">デモ資材バッグ</button>
        <button type="button" class="secondary" id="btn-reset">デモ初期化</button>
      </div>
      <div class="row" style="margin-top:0.5rem">
        <button type="button" class="secondary" id="btn-verify-true" title="可解な 2×2 真盤（未解）を HubSave.circuits へ">検証用真盤を受領</button>
        <button type="button" class="secondary" id="btn-verify-perfect" title="既に完璧ロック済みの検証盤（刻印付き）">検証用・既に完璧</button>
      </div>
      <p class="muted" style="margin-top:0.5rem">「シード読込」= 健在2機 + 要修理1機・クレジット/型付き資材（EXAMPLE_TYPED_REPAIR_COST×3）/弾薬入り。要修理機を型付き修理 → 出撃選択に載るループ用。回路デモは Perfect inject（DEV/localhost 33% · 本番 1% · <span class="mono">?perfectRate=</span> 上書き）で稀に真盤。</p>
      <p class="muted" style="margin-top:0.35rem">検証用真盤 = 保証可解の小さな回路（解く→完璧ロック）。検証用・既に完璧 = ロック UI / 刻印の即確認用。</p>
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
      <table>
        <thead><tr><th>アイテム</th><th>数量</th><th>売却（仮）</th></tr></thead>
        <tbody>${inventoryRows(state.hub)}</tbody>
      </table>
      <p class="muted" style="margin-top:0.5rem">「レア」タグ付きのみ売却可。価格は仮（TBD）。型付き修理例: ${EXAMPLE_TYPED_REPAIR_COST.credits}c + ${escapeHtml(typedCostText || "—")}</p>
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">出撃 → Explore</h2>
      <p class="ok" style="margin:0 0 0.5rem">回路ボーナス: ${escapeHtml(formatCircuitBonusesJa(hubCircuitBonuses(state.hub)))}</p>
      ${
        deployUrl
          ? `<div class="row">
              <a class="btn" id="link-deploy" href="${escapeHtml(deployUrl)}" target="_top" rel="noopener">探索へ配備</a>
            </div>
            <p class="mono muted" style="margin-top:0.75rem">${escapeHtml(deployUrl)}</p>`
          : `<p class="warn">健在機がありません。受領するか修理してください。</p>`
      }
      <p class="muted" style="margin-top:0.5rem">帰還は explore の「拠点へ摩耗報告」（returnKind / mechWear）か下のシミュ。localhost では :5173 ↔ :5175。配備 URL に circuitBonuses（摩耗緩衝）が付きます。</p>
      <div class="row">
        <button type="button" class="secondary" data-sim="extract">シミュ帰還 extract</button>
        <button type="button" class="secondary" data-sim="abort">シミュ帰還 abort</button>
        <button type="button" class="secondary" data-sim="fail">シミュ帰還 fail</button>
      </div>
    </div>


    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">署名（刻印）</h2>
      <p class="muted" style="margin:0 0 0.5rem">回路を Hub に戻すときの職人名。一度確定すると変更不可。</p>
      <div class="row" style="align-items:center">
        <input type="text" id="input-signature" maxlength="32" placeholder="署名" value="${escapeHtml(state.craftSignature)}" ${
          isCraftSignatureLocked() ? "disabled" : ""
        } style="flex:1;min-width:8rem;padding:0.5rem 0.65rem;border-radius:8px;border:1px solid #3d444d;background:#0d1014;color:#e8eaed" />
        <button type="button" id="btn-signature" ${
          isCraftSignatureLocked() ? "disabled" : ""
        }>確定</button>
      </div>
      <p class="muted" style="margin-top:0.5rem">${
        isCraftSignatureLocked()
          ? `確定済み: <span class="engraved">${escapeHtml(state.craftSignature)}</span>`
          : "未確定（初期値はプレースホルダ。確定で localStorage に刻印）"
      }</p>
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">戦線 / 回路（M4·M5）</h2>
      <p class="muted" style="margin:0 0 0.5rem">任意ルート。本 salvage は払わない。回路結果は HubSave.circuits に永続（旧 hubM45Stash から移行可）。セクターはスタッシュのみ。</p>
      <div class="row">
        <a class="btn secondary" id="link-invade" href="${escapeHtml(invadeUrl)}" target="_top" rel="noopener">戦線へ（任意）</a>
        <a class="btn secondary" id="link-restore" href="${escapeHtml(restoreUrl)}" target="_top" rel="noopener">回路修復へ（選択中）</a>
      </div>
      ${
        state.lastInvadeSector
          ? `<p class="ok" style="margin-top:0.75rem">直近セクター: (${state.lastInvadeSector.sectorX},${state.lastInvadeSector.sectorY}) dens=${state.lastInvadeSector.density.toFixed(3)}${
              state.lastInvadeSector.intelFlags?.length
                ? ` · ${escapeHtml(state.lastInvadeSector.intelFlags.join(", "))}`
                : ""
            }</p>`
          : `<p class="muted" style="margin-top:0.75rem">セクター未取込（invade → ?sectorX=&sectorY=&density=）</p>`
      }
      <h3 style="font-size:0.9rem;margin:0.75rem 0 0">保有回路（HubSave）</h3>
      <p class="muted" style="margin:0.35rem 0 0;font-size:0.75rem">検証用ヒント（ネタバレ軽め）: ${escapeHtml(VERIFY_TRUE_SOLUTION_HINT)}</p>
      ${circuitRows(state)}
      <p class="mono muted" style="margin-top:0.75rem">${escapeHtml(invadeUrl)}</p>
      <p class="mono muted" style="margin-top:0.35rem">${escapeHtml(restoreUrl)}</p>
    </div>

    <div class="card">
      <h2 style="font-size:1rem;margin:0 0 0.5rem">ログ</h2>
      <ul class="muted" style="margin:0;padding-left:1.1rem;font-size:0.8rem">
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
    state = loadPlaytestSeed(state, { injectRate });
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
