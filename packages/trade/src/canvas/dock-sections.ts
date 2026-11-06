/**
 * DOCK sections on canvas (docs/CANVAS_UNIFIED_V0.md §4). Every action calls
 * the same hangar / trade function as the existing DOCK (`main.ts` and its
 * cards); drawing only reads `HangarState`.
 */
import {
  CANVAS_THEME,
  CTA_COPY,
  P_SHIELD_CIRCUIT_DESCRIPTION_JA,
  RESOURCE_IDS,
  RESOURCE_LABEL_JA,
  RESOURCE_SELL_PRICE,
  RESTORE_MAX_SIDE,
  SHIELD_CIRCUIT_DESCRIPTION_JA,
  SORTIE_GUARD_RETURN_KEY,
  DEBUG_FIXTURE_ACTIVE,
  applyResourceTrade,
  drawMechGauge,
  ensureCaptainFalseOneByOne,
  firstSortieError,
  formatCircuitBonusesJa,
  hubVisibleCircuits,
  isPerfectCircuitDebugContext,
  loadHubSaveFromLocalStorage,
  loadHubSaveWithStatus,
  normalizeHubSnapshot,
  playLogBlocked,
  playLogNavigate,
  resolvePerfectCircuitInjectRate,
  resolveSortieSelection,
  resourceSellConfirmText,
  saveHubSaveToLocalStorage,
  setPlayLogOperation,
  sortieGuardGuide,
  squadCircuitLimit,
  squadCircuitUsage,
  squadEquipmentError,
  toggleButton,
  isBasicMaterialId,
  isPartId,
  BASIC_MATERIAL_LABEL_JA,
  PART_LABEL_JA,
  type CanvasUI,
  type ConfirmSpec,
  type Flow,
  type HubCircuitRecord,
  type HubSnapshot,
  type PickerSpec,
  type Rect,
} from "@estg/shared";
import {
  BUY_MECH_LABEL_JA,
  CIRCUIT_SELL_BASE_CREDITS,
  CIRCUIT_SELL_CREDITS_PER_EFFECT,
  MECH_STATUS_LABEL_JA,
  RARE_SELL_PRICE_TABLE,
  buildDeployUrl,
  buildInvadeUrl,
  buildNextSortieReadiness,
  buildNextSortieReturnDigest,
  buildRestoreUrl,
  buyNewMech,
  canDeploy,
  chargeMech,
  circuitRestoreStateLabelJa,
  circuitSellPerfectSide,
  createInitialHangar,
  createMechLabelJa,
  createNewMech,
  formatCircuitHubBrief,
  formatCircuitSellPriceJa,
  grantDemoInventory,
  grantStarterFleet,
  grantVerifyPerfectLockedCircuit,
  grantVerifyTrueCircuit,
  hubCircuitBonuses,
  isCircuitLocked,
  isRareYieldItemId,
  launchSortFromUnopened,
  loadPlaytestSeed,
  lostMechCountLineJa,
  markDeployed,
  onHangarExploreLink,
  rareSellPriceCredits,
  repairCost,
  repairMech,
  repairMechLabelJa,
  resolveHangarPerfectInjectRate,
  reviveMechCost,
  reviveMechLabelJa,
  reviveWreck,
  scrapMech,
  selectAllDeployable,
  selectCircuit,
  sellCircuit,
  sellHangarWreck,
  sellRareItem,
  setDeploySelection,
  simulateReturn,
  sortieAmmoShortLineJa,
  wreckCountLineJa,
  wreckSaleConfirmText,
  bulletinUnlockedLineHtml,
  type HangarState,
} from "../hangar";
import { hubMechGaugeModel } from "../mech-gauge-hub";
import { hubTreeModel, type HubTreeKey } from "../hub-tree";
import { saveMigrationNotice } from "../save-migration-notice";
import { equipHubCircuit, equipRefusalMessageJa, unequipHubCircuit } from "../lost-mech-circuits";
import { backfillPerfectMaxSize, craftJunkCircuit, heldJunk, junkCraftConfirmText, junkCraftMaxSide, junkCraftOptions } from "../junk-craft";
import { CIRCUIT_PURCHASE_PRICE, purchaseCircuit, purchaseMaxSide } from "../circuit-purchase";
import { formatSignedAmount, resourceHistoryFromLog } from "../resourceHistory";

/** Anchors (content coordinates) used by the HUB tree, the guard banner and the SORT tab. */
export const DOCK_ANCHOR = {
  squad: "hub-anchor-squad",
  reserve: "hub-anchor-reserve",
  circuits: "hub-anchor-circuits",
  market: "four-resource-trade",
  unopened: "unopened-panel",
} as const;
const TREE_TARGET: Record<HubTreeKey, string> = { squad: DOCK_ANCHOR.squad, reserve: DOCK_ANCHOR.reserve, circuits: DOCK_ANCHOR.circuits, market: DOCK_ANCHOR.market };

/** #266: a second press within this time (double click / tap) does not pay twice. */
export const MONEY_CLICK_GUARD_MS = 600;
const GAUGE_TEXT_MS = 1500; // Q7

export type DockEnv = {
  navigate: (url: string) => void;
  now: () => number;
  /** sessionStorage-like (guard banner flag). */
  session: Pick<Storage, "getItem" | "removeItem"> | null;
  /** Persistent storage for the hangar functions (default: window.localStorage via the play log). */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  search: string;
  hostname: string;
  isDev: boolean;
  envRate: string | null;
  newId: (prefix: string) => string;
  /** Debug area available (localhost or ?debug=1, 神宮決定 2026-11-06). */
  debug?: boolean;
  /** Open the HTML debug area under the canvas. */
  openDebug?: () => void;
};

export function browserDockEnv(): DockEnv {
  return {
    navigate: (url) => playLogNavigate(url),
    now: () => performance.now(),
    session: (() => { try { return sessionStorage; } catch { return null; } })(),
    search: location.search,
    hostname: location.hostname,
    isDev: Boolean(import.meta.env.DEV),
    envRate: (import.meta.env.VITE_PERFECT_CIRCUIT_RATE as string | undefined) ?? (import.meta.env.PERFECT_CIRCUIT_RATE as string | undefined) ?? null,
    newId: (prefix) => {
      try { if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`; } catch { /* fall through */ }
      return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    },
  };
}

function labelYield(id: string): string {
  if (isBasicMaterialId(id)) return BASIC_MATERIAL_LABEL_JA[id];
  if (isPartId(id)) return PART_LABEL_JA[id];
  return id;
}
function warnText(notice: string): boolean {
  return /不足|足りない|失敗|なし|のみ|対象なし|機体なし|摩耗対象|できません/.test(notice);
}
function circuitKindPrefix(c: HubCircuitRecord): string {
  return c.effectKey === "shield" ? "盾・" : c.effectKey === "p_shield" ? "P盾・" : "";
}

/**
 * Hangar state + actions + section drawing. The DOCK scene owns one of these
 * and asks it for dialogs (confirm / picker) to draw on top.
 */
export class DockSections {
  state: HangarState;
  confirm: ConfirmSpec | null = null;
  picker: PickerSpec | null = null;
  flashAnchor: { id: string; until: number } | null = null;
  scrollRequest: string | null = null;
  private lastMoneyAt = -Infinity;
  private gaugeShown = new Map<string, number>();
  /** null = the existing default (the whole stock, like `input-sort-unopened`). */
  private sortQty: number | null = null;
  private craftSide: number | null = null;
  private equipCircuit: string | null = null;
  private equipMech: string | null = null;
  guardDismissed = false;
  constructor(readonly env: DockEnv, private readonly onHubChanged: () => void, private readonly redraw: () => void, initial?: HangarState) {
    this.state = initial ?? createInitialHangar(env.storage);
    this.ensureCaptainCircuit();
  }
  /**
   * The existing DOCK (circuit-equip-ui) grants the captain's free 1×1 whenever
   * it renders. Here it runs on entering DOCK and right after each action
   * (same play-log operation), never from a redraw.
   */
  private ensureCaptainCircuit(): void {
    const granted = ensureCaptainFalseOneByOne(this.state.hub);
    if (granted !== this.state.hub && saveHubSaveToLocalStorage(granted, this.env.storage ?? undefined)) {
      this.state = { ...this.state, hub: granted };
    }
  }

  /* ------------------------------ state sync ------------------------------ */
  /** Re-read the hub from the save (after a market trade, another tab, …). Never writes. */
  reloadHub(): void {
    const h = loadHubSaveFromLocalStorage(this.env.storage ?? undefined)?.hub;
    if (h) this.state = { ...this.state, hub: normalizeHubSnapshot(h) };
  }
  private moneyAllowed(): boolean {
    const now = this.env.now();
    if (now - this.lastMoneyAt < MONEY_CLICK_GUARD_MS) return false;
    this.lastMoneyAt = now;
    return true;
  }
  private moneyRecent(): boolean { return this.env.now() - this.lastMoneyAt < MONEY_CLICK_GUARD_MS; }
  /**
   * Run one hangar action. The play-log operation is named like the existing
   * DOCK names its click (`trade.<act>`, {id, data}); functions that name
   * their own operation (seed, open, …) still override it.
   */
  act(kind: string, data: Record<string, string>, fn: (s: HangarState) => HangarState): void {
    if (playLogBlocked()) return;
    setPlayLogOperation(`trade.${kind}`, { id: kind, data });
    this.state = fn(this.state);
    this.ensureCaptainCircuit();
    this.onHubChanged();
  }
  /** Save a hub produced by a shared function (equip, craft, sell resource …). */
  private commitHub(kind: string, ctx: Record<string, string | number>, hub: HubSnapshot): boolean {
    if (playLogBlocked()) return false;
    setPlayLogOperation(kind, ctx);
    if (!saveHubSaveToLocalStorage(hub, this.env.storage ?? undefined)) { this.state = { ...this.state, notice: "保存できませんでした。変更していません。" }; return false; }
    this.reloadHub();
    this.ensureCaptainCircuit();
    this.onHubChanged();
    return true;
  }
  private ask(spec: Omit<ConfirmSpec, "onCancel" | "onOk"> & { onOk: () => void }): void {
    this.confirm = { ...spec, onOk: () => { this.confirm = null; spec.onOk(); }, onCancel: () => { this.confirm = null; } };
  }
  private trueBoardRate(): number {
    return resolvePerfectCircuitInjectRate({ search: this.env.search, hostname: this.env.hostname, isDev: this.env.isDev, envRate: this.env.envRate });
  }
  goAnchor(id: string): void {
    this.scrollRequest = id;
    this.flashAnchor = { id, until: this.env.now() + 1200 };
    setTimeout(() => this.redraw(), 1250);
  }

  /* ------------------------------ navigation ------------------------------ */
  goDeploy(): void {
    if (playLogBlocked()) return;
    onHangarExploreLink("link-deploy", this.env.storage);
    const url = buildDeployUrl(this.state);
    if (!url) return;
    const ids = (new URL(url).searchParams.get("deployedInstanceIds") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    setPlayLogOperation("trade.link-deploy", { id: "link-deploy", data: {} });
    this.state = markDeployed(this.state, ids);
    const refilled = buildDeployUrl(this.state); // M3: send the refilled values
    if (refilled) this.env.navigate(refilled);
  }
  goSort(qty: number): void {
    if (playLogBlocked()) return;
    setPlayLogOperation("trade.btn-sort-unopened", { id: "btn-sort-unopened", data: {} });
    const launched = launchSortFromUnopened(this.state, qty);
    this.state = launched.state;
    if (launched.url) this.env.navigate(launched.url);
    else this.onHubChanged();
  }

  /* -------------------------------- drawing ------------------------------- */
  /** Draws all sections; the market rows are drawn by the caller through `drawMarket`. */
  draw(ui: CanvasUI, f: Flow, drawMarket: (f: Flow) => void): void {
    const s = this.state, hub = s.hub;
    const ready = buildNextSortieReadiness(s);
    const now = this.env.now();
    const flash = (id: string) => !!this.flashAnchor && this.flashAnchor.id === id && now < this.flashAnchor.until;

    // Save migration notice + last notice.
    const mig = saveMigrationNotice(loadHubSaveWithStatus(this.env.storage ?? undefined));
    if (mig) f.card("migration", (c) => c.text(mig, { color: CANVAS_THEME.muted })).gap(8);
    if (s.notice) {
      const warn = warnText(s.notice);
      f.card("notice", (c) => c.text(s.notice, { color: warn ? "#ffdcd7" : "#aff5b4" }), { fill: warn ? "#3d1d1d" : "#12261e", edge: warn ? "#f85149" : "#2ea043" }).gap(8);
    }
    // New-game guide (#332).
    if (!DEBUG_FIXTURE_ACTIVE && hub.newGameIntro && !hub.newGameIntro.firstSortie) {
      const intro = hub.newGameIntro;
      f.card("intro", (c) => {
        c.heading("初出撃の準備");
        c.text("まず未開封コンテナを仕分で開封してください。開封後は格納庫へ戻り、資源の売買で資金と材料を整え、機体と1×1回路を作成します。回路を修復して隊長機に装備し、既存の補給で出撃を準備してください。").gap(6);
        c.buttons([{ id: "dock:intro:open", label: "コンテナを開封する", onActivate: () => this.goAnchor(DOCK_ANCHOR.unopened) }]).gap(6);
        c.text(`初期支給の開封済み ${intro.initialOpened}/10個。初期支給分は購入分と別に開封します。`, { color: CANVAS_THEME.muted });
      }).gap(8);
    }
    // Sortie-guard banner (§16): only after Explore's 格納庫へ.
    const flagged = !this.guardDismissed && this.env.session?.getItem(SORTIE_GUARD_RETURN_KEY) === "1" && !DEBUG_FIXTURE_ACTIVE;
    const guard = flagged ? sortieGuardGuide(hub, ready.selectedIds) : null;
    if (flagged && !guard) { try { this.env.session?.removeItem(SORTIE_GUARD_RETURN_KEY); } catch { /* */ } }
    if (guard) {
      const clear = () => { try { this.env.session?.removeItem(SORTIE_GUARD_RETURN_KEY); } catch { /* */ } this.guardDismissed = true; };
      f.card("guard", (c) => {
        c.text(guard.text, { color: "#ffdcd7" }).gap(6);
        c.buttons([
          { id: "dock:guard:go", label: guard.action, onActivate: () => { clear(); this.goAnchor(guard.target); } },
          { id: "dock:guard:close", label: "✕", w: 48, onActivate: clear },
        ]);
      }, { fill: "#3d1d1d", edge: "#f85149" }).gap(8);
    }
    // HUB tree (§10).
    f.card("tree", (c) => {
      c.text("母艦（キャリア）", { weight: 700 }).gap(4);
      const nodes = hubTreeModel(hub, ready.selectedIds);
      c.buttons(nodes.map((n) => ({ id: `dock:tree:${n.key}`, label: n.label, sub: n.count || undefined, onActivate: () => this.goAnchor(TREE_TARGET[n.key]) })), { fill: true, h: 48 });
    }).gap(8);
    f.mark(DOCK_ANCHOR.squad);
    this.drawNextSortie(f, flash(DOCK_ANCHOR.squad));
    f.gap(8);
    this.drawUnopened(f, flash(DOCK_ANCHOR.unopened));
    f.gap(8);
    f.mark(DOCK_ANCHOR.market);
    drawMarket(f);
    f.gap(8);
    this.drawSell(f, flash(DOCK_ANCHOR.market));
    f.gap(8);
    f.mark(DOCK_ANCHOR.reserve);
    this.drawHangar(ui, f, flash(DOCK_ANCHOR.reserve));
    f.gap(8);
    this.drawInventory(f);
    f.gap(8);
    f.card("signature", (c) => {
      c.heading("署名（刻印）");
      c.text(`確定済み: ${s.craftSignature}`, { weight: 600 });
      c.text("開始画面で確定した名前です。変更できません。", { color: CANVAS_THEME.muted, size: 12 });
    }).gap(8);
    f.mark(DOCK_ANCHOR.circuits);
    this.drawCircuits(f, flash(DOCK_ANCHOR.circuits));
    f.gap(8);
    this.drawEquip(f);
    f.gap(8);
    this.drawCraft(f);
    f.gap(8);
    this.drawHistory(f);
    f.gap(8);
    this.drawDebug(f);
  }

  private drawNextSortie(f: Flow, hi: boolean): void {
    const s = this.state, hub = s.hub;
    const ready = buildNextSortieReadiness(s);
    const digest = buildNextSortieReturnDigest(s);
    const equipmentError = squadEquipmentError(hub, ready.selectedIds);
    const equipmentNote = (DEBUG_FIXTURE_ACTIVE ? "" : firstSortieError(hub, ready.selectedIds[0])) || (equipmentError === "squad_full" ? "出撃部隊の回路上限を超えています。装備を外すか出撃機を変更してください。" : equipmentError === "category_full" ? "武器種・特殊弾・盾回路・P盾回路は各機体に各1枚までです。装備を変更してください。" : "");
    const emptyActivity = hub.fleet.filter((m) => ready.selectedIds.includes(m.instanceId) && m.battery.activity <= 0);
    const deployUrl = buildDeployUrl(s);
    const circuits = formatCircuitHubBrief(hubVisibleCircuits(hub), s.lastCircuit);
    const active = circuits.lines.find((l) => l.active) ?? circuits.lines[0] ?? null;
    const ammoShort = sortieAmmoShortLineJa(hub, ready.selectedIds);
    const stock = Math.max(0, Math.floor(hub.unopenedContainers ?? 0));
    f.card("sortie", (c) => {
      c.kv("次の出撃", ready.readinessLabelJa, { weight: 700, size: 16, lineH: 26 });
      c.text(`出撃部隊の回路 ${squadCircuitUsage(hub, ready.selectedIds)}/${squadCircuitLimit(hub)}枚`);
      if (equipmentNote) c.text(equipmentNote, { color: "#ffa198" });
      if (emptyActivity.length) c.text(`出撃部隊に活動量0の機体が${emptyActivity.length}機あります。出撃すると残骸になります。格納庫の各機体の「充電」で電力パーツを使って充電してください。`, { color: "#ffa198" });
      c.gap(4).text(`探索: ${digest.exploreJa}`, { color: s.lastExploreReturn ? "#aff5b4" : CANVAS_THEME.muted });
      c.text(`戦線: ${digest.invadeJa}`, { color: s.lastInvadeSector ? "#aff5b4" : CANVAS_THEME.muted });
      c.text(`回路: ${digest.restoreJa}`, { color: hubVisibleCircuits(hub).length ? "#aff5b4" : CANVAS_THEME.muted });
      c.text(`回路効果値 ${active?.effectJa ?? "効果 —"}`);
      c.text(`回路ボーナス: ${formatCircuitBonusesJa(hubCircuitBonuses(hub))}`, { color: CANVAS_THEME.muted });
      c.gap(4).text("配備予定", { weight: 700 });
      if (ready.selectedIds.length === 0) c.text("配備対象なし — 健在機を修理するか受領してください。", { color: CANVAS_THEME.muted });
      for (const id of ready.selectedIds) {
        const m = hub.fleet.find((x) => x.instanceId === id);
        if (m) c.text(`${m.catalogId}　耐久 ${m.durability}/${m.durabilityMax} (${Math.round((m.durability / m.durabilityMax) * 100)}%)`);
      }
      const lost = lostMechCountLineJa(hub), wreck = wreckCountLineJa(hub);
      if (lost) c.text(lost, { color: CANVAS_THEME.muted });
      if (wreck) c.text(wreck, { color: CANVAS_THEME.muted });
      c.text(ready.needsRepair === 0 ? "修理待ちなし — 出撃可" : `要修理 ${ready.needsRepair}機 — 下のハンガーで修理 / 解体`, { color: ready.needsRepair === 0 ? "#aff5b4" : "#ffa198" });
      if (ammoShort) c.text(ammoShort, { color: "#ffa198" });
      c.gap(6).buttons([
        { id: "dock:sortie:invade", label: CTA_COPY.toFront, onActivate: () => { if (!playLogBlocked()) this.env.navigate(buildInvadeUrl(this.state)); } },
        { id: "dock:sortie:explore", label: deployUrl ? `▶ ${CTA_COPY.toExplore}` : CTA_COPY.toExplore, variant: "primary", disabled: !deployUrl, onActivate: () => this.goDeploy() },
        { id: "dock:sortie:restore", label: CTA_COPY.toRestore, onActivate: () => { if (!playLogBlocked()) this.env.navigate(buildRestoreUrl(this.state)); } },
        { id: "dock:sortie:sort", label: CTA_COPY.toSort, disabled: stock < 1, onActivate: () => this.goSort(introSortQty(hub, stock)) },
      ], { fill: true });
    }, { highlight: hi });
  }

  private drawUnopened(f: Flow, hi: boolean): void {
    const hub = this.state.hub;
    const stock = Math.max(0, Math.floor(hub.unopenedContainers ?? 0));
    const q = Math.max(1, Math.min(Math.max(1, stock), this.sortQty ?? stock));
    f.mark(DOCK_ANCHOR.unopened);
    f.card("unopened", (c) => {
      c.heading("未開封コンテナ");
      const resume = hub.newGameIntro?.opening?.url;
      if (resume) c.buttons([{ id: "dock:unopened:resume", label: "開封作業へ戻る", variant: "primary", onActivate: () => { if (!playLogBlocked()) this.env.navigate(resume); } }]).gap(6);
      c.text("探索を経由せず仕分（Module 2）へ送れる在庫。購入は下の物資市場。", { color: CANVAS_THEME.muted, size: 12 });
      c.kv(`在庫 ${stock}`, "").gap(4);
      c.buttons([
        { id: "dock:unopened:sort:-1", label: "−1", w: 52, disabled: stock < 1 || q <= 1, onActivate: () => { this.sortQty = Math.max(1, q - 1); } },
        { id: "dock:unopened:sort:qty", label: `×${q}`, w: 60, disabled: true },
        { id: "dock:unopened:sort:+1", label: "+1", w: 52, disabled: stock < 1 || q >= stock, onActivate: () => { this.sortQty = Math.min(stock, q + 1); } },
        { id: "dock:unopened:sort:all", label: "全部", w: 64, disabled: stock < 1 || q >= stock, onActivate: () => { this.sortQty = stock; } },
        { id: "dock:unopened:sort:go", label: CTA_COPY.toSort, variant: "primary", disabled: stock < 1, onActivate: () => this.goSort(q) },
      ]);
      if (stock < 1) c.gap(4).text("仕分出庫できる未開封がありません", { color: CANVAS_THEME.muted, size: 12 });
    }, { highlight: hi });
  }

  private drawSell(f: Flow, hi: boolean): void {
    const hub = this.state.hub;
    f.card("sell", (c) => {
      c.heading("資源の売却");
      c.text(`Sortで得た4資源を売却（売値 ${RESOURCE_SELL_PRICE}c、毎回確認）。`, { color: CANVAS_THEME.muted, size: 12 }).gap(4);
      c.buttons(RESOURCE_IDS.map((id) => {
        const n = Math.max(0, Math.floor(hub.inventory?.[id] ?? 0));
        return {
          id: `dock:sell:${id}`, label: `${RESOURCE_LABEL_JA[id]} 売却`, sub: n > 0 ? `在庫 ${n} · +${RESOURCE_SELL_PRICE}c` : "在庫なし", disabled: n < 1,
          onActivate: () => this.ask({
            id: "dock:confirm:sell", title: "売却の確認", text: resourceSellConfirmText(RESOURCE_LABEL_JA[id], 1), okLabel: "売却する",
            onOk: () => {
              const now = loadHubSaveFromLocalStorage(this.env.storage ?? undefined)?.hub;
              const next = now ? applyResourceTrade(now, id, "sell", 1) : null;
              if (next) this.commitHub("resource.sell", { id, quantity: 1 }, next);
            },
          }),
        };
      }), { fill: true, h: 52 });
    }, { highlight: hi });
  }

  private drawHangar(ui: CanvasUI, f: Flow, hi: boolean): void {
    const s = this.state, hub = s.hub;
    const leaderId = buildNextSortieReadiness(s).selectedIds[0] ?? null;
    const now = this.env.now();
    f.card("hangar", (c) => {
      c.heading("ハンガー");
      const bulletin = bulletinUnlockedLineHtml(hub).replace(/<[^>]+>/g, "").trim();
      if (bulletin) c.text(bulletin, { color: CANVAS_THEME.muted });
      c.buttons([
        { id: "dock:hangar:all", label: "出撃可能な全機体", onActivate: () => this.act("btn-select-all", {}, selectAllDeployable) },
        { id: "dock:hangar:buy", label: BUY_MECH_LABEL_JA, onActivate: () => { if (this.moneyAllowed()) this.act("btn-buy-mech", {}, buyNewMech); } },
        { id: "dock:hangar:create", label: createMechLabelJa(), onActivate: () => { if (this.moneyAllowed()) this.act("btn-create-mech", {}, createNewMech); } },
      ]).gap(6);
      c.text("出撃する機体を選択（人数制限なし）（選択は保存され、次回・再出撃でも使われます）。", { color: CANVAS_THEME.muted, size: 12 }).gap(6);
      if (hub.fleet.length === 0) c.text("艦隊が空です。機体を購入・作成してください。", { color: CANVAS_THEME.muted });
      for (const m of hub.fleet) {
        c.card(`mech:${m.instanceId}`, (r) => {
          const top = r.y;
          const gm = hubMechGaugeModel(hub, m, leaderId);
          const size = 44;
          drawMechGauge(ui, gm, r.x, top, size);
          ui.region(`dock:gauge:${m.instanceId}`, { x: r.x, y: top, w: size, h: size }, { onActivate: () => { this.gaugeShown.set(m.instanceId, this.env.now() + GAUGE_TEXT_MS); setTimeout(() => this.redraw(), GAUGE_TEXT_MS + 30); } });
          const tx = r.x + size + 10, tw = r.w - size - 10 - 96;
          ui.text(`${m.catalogId}　${MECH_STATUS_LABEL_JA[m.status]}`, tx, top + 12, { size: 14, weight: 700, color: m.status === "operational" ? "#aff5b4" : m.status === "needs_repair" ? "#ffa198" : CANVAS_THEME.muted, maxW: tw });
          const shown = (this.gaugeShown.get(m.instanceId) ?? 0) > now;
          ui.text(shown ? gm.text : m.instanceId, tx, top + 32, { size: 11, color: shown ? CANVAS_THEME.text : CANVAS_THEME.faint, maxW: tw });
          const deployable = canDeploy(m);
          const checked = s.selectedDeployIds.includes(m.instanceId) && deployable;
          toggleAt(ui, `dock:mech:${m.instanceId}:select`, { x: r.x + r.w - 92, y: top, w: 92, h: 44 }, "出撃", checked, !deployable,
            () => this.act("select", { act: "select", id: m.instanceId }, (st) => setDeploySelection(st, m.instanceId, !checked)));
          r.y = top + size + 8;
          const btns: Parameters<Flow["buttons"]>[0] = [];
          if (reviveMechCost(m)) btns.push({ id: `dock:mech:${m.instanceId}:revive`, label: reviveMechLabelJa(m), onActivate: () => { if (this.moneyAllowed()) this.act("revive", { act: "revive", id: m.instanceId }, (st) => reviveWreck(st, m.instanceId)); } });
          else if (repairCost(m)) btns.push({ id: `dock:mech:${m.instanceId}:repair`, label: repairMechLabelJa(m), onActivate: () => { if (this.moneyAllowed()) this.act("repair", { act: "repair", id: m.instanceId }, (st) => repairMech(st, m.instanceId)); } });
          if (reviveMechCost(m)) btns.push({ id: `dock:mech:${m.instanceId}:sellwreck`, label: "残骸売却 400c", onActivate: () => {
            const text = wreckSaleConfirmText(this.state, m.instanceId);
            if (text) this.ask({ id: "dock:confirm:wreck", title: "残骸の売却", text, okLabel: "売却する", okVariant: "danger", onOk: () => this.act("sell-wreck", { act: "sell-wreck", id: m.instanceId }, (st) => sellHangarWreck(st, m.instanceId, this.env.storage)) });
          } });
          btns.push({ id: `dock:mech:${m.instanceId}:charge`, label: "充電", disabled: m.battery.activity >= m.battery.capacity, onActivate: () => this.act("charge", { act: "charge", id: m.instanceId }, (st) => chargeMech(st, m.instanceId)) });
          btns.push({ id: `dock:mech:${m.instanceId}:scrap`, label: "解体", variant: "danger", onActivate: () => {
            if (this.moneyRecent()) return;
            this.ask({ id: "dock:confirm:scrap", title: "解体の確認", text: `解体しますか？\n${m.instanceId}`, okLabel: "解体する", okVariant: "danger", onOk: () => this.act("scrap", { act: "scrap", id: m.instanceId }, (st) => scrapMech(st, m.instanceId)) });
          } });
          r.buttons(btns);
        }, { pad: 10, fill: CANVAS_THEME.bg }).gap(6);
      }
    }, { highlight: hi });
  }

  private drawInventory(f: Flow): void {
    const hub = this.state.hub;
    const entries = Object.entries(hub.inventory).filter(([, n]) => (n ?? 0) > 0) as Array<[string, number]>;
    f.card("inventory", (c) => {
      c.heading("型付き在庫");
      if (entries.length === 0) c.text("（空）", { color: CANVAS_THEME.muted });
      for (const [id, n] of entries) {
        const rare = isRareYieldItemId(id);
        const price = rareSellPriceCredits(id);
        c.kv(`${labelYield(id)}${rare ? "（レア）" : ""}`, `${n}`);
        if (rare && price != null) c.buttons([{ id: `dock:rare:${id}`, label: `売却 仮${price}c`, onActivate: () => this.act("sell-rare", { act: "sell-rare", id }, (st) => sellRareItem(st, id, 1)) }]).gap(4);
      }
      c.gap(4).text("レアのみ売却可。仮価格（バランス未調整）：" + RARE_SELL_PRICE_TABLE.map((r) => `${labelYield(r.id)} ${r.credits}c`).join("・"), { color: CANVAS_THEME.muted, size: 12 });
    });
  }

  private drawCircuits(f: Flow, hi: boolean): void {
    const s = this.state, hub = s.hub;
    const list = hubVisibleCircuits(hub);
    const brief = formatCircuitHubBrief(list, s.lastCircuit);
    const byId = new Map(brief.lines.map((l) => [l.circuitId, l]));
    f.card("circuits", (c) => {
      c.heading("保有回路");
      c.text(`効果値は Restore/Trade 共通スコア（最小閉ループ）。売却 仮 = 最低${CIRCUIT_SELL_BASE_CREDITS}c + 出来栄え（有効値×${CIRCUIT_SELL_CREDITS_PER_EFFECT}c）。`, { color: CANVAS_THEME.muted, size: 12 }).gap(4);
      if (list.length === 0) c.text("回路なし", { color: CANVAS_THEME.muted });
      for (const ci of list) {
        const line = byId.get(ci.circuitId);
        const effect = line?.effect ?? 0;
        const price = formatCircuitSellPriceJa(effect, { perfectSide: circuitSellPerfectSide(ci) });
        const locked = isCircuitLocked(ci);
        const editor = ci.lastEditorName ?? ci.circuitBoard.lastEditorName ?? "—";
        const selected = s.lastCircuit?.circuitId === ci.circuitId;
        c.card(`circuit:${ci.circuitId}`, (r) => {
          r.text(`${ci.circuitId}${locked ? "（完璧·編集不可）" : ""}`, { weight: 700, size: 13 });
          r.text(`${circuitRestoreStateLabelJa(ci.restoreState)} · 刻印 ${editor}${ci.equippedTo ? ` · 装備: ${ci.equippedTo}` : ""}${selected ? " · 選択中" : ""}`, { color: CANVAS_THEME.muted, size: 12 });
          r.text(`${circuitKindPrefix(ci).replace("・", " — ")}${line?.effectJa ?? `効果 ${effect}`}`, { weight: 600 });
          r.text(`売却 仮 ${price.total}c（${price.detailJa}）`, { color: CANVAS_THEME.muted, size: 12 }).gap(4);
          r.buttons([
            { id: `dock:circuit:${ci.circuitId}:select`, label: "選択", onActivate: () => this.act("select-circuit", { act: "select-circuit", id: ci.circuitId }, (st) => selectCircuit(st, ci.circuitId)) },
            { id: `dock:circuit:${ci.circuitId}:open`, label: locked ? CTA_COPY.view : CTA_COPY.toRestore, onActivate: () => { if (!playLogBlocked()) this.env.navigate(buildRestoreUrl(this.state, ci.circuitId)); } },
            { id: `dock:circuit:${ci.circuitId}:sell`, label: price.buttonJa, variant: "danger", onActivate: () => this.ask({
              id: "dock:confirm:circuit", title: "回路の売却", okLabel: "売却する", okVariant: "danger",
              text: `回路を売却しますか？\n${ci.circuitId}\n仮 +${price.total}c${price.detailJa ? `\n${price.detailJa}` : ""}${ci.equippedTo ? `\n装備: ${ci.equippedTo} から外して売却します` : ""}`,
              onOk: () => this.act("sell-circuit", { act: "sell-circuit", id: ci.circuitId }, (st) => sellCircuit(st, ci.circuitId)),
            }) },
          ]);
        }, { pad: 10, fill: CANVAS_THEME.bg, highlight: selected }).gap(6);
      }
    }, { highlight: hi });
  }

  private drawEquip(f: Flow): void {
    const hub = this.state.hub;
    const circuits = hubVisibleCircuits(hub);
    const fleet = hub.fleet ?? [];
    if (this.equipCircuit && !circuits.some((c) => c.circuitId === this.equipCircuit)) this.equipCircuit = null;
    if (this.equipMech && !fleet.some((m) => m.instanceId === this.equipMech)) this.equipMech = null;
    const cid = this.equipCircuit ?? circuits[0]?.circuitId ?? null;
    const mid = this.equipMech ?? fleet[0]?.instanceId ?? null;
    const cRec = circuits.find((c) => c.circuitId === cid);
    const mRec = fleet.find((m) => m.instanceId === mid);
    f.card("equip", (c) => {
      c.heading("回路装備");
      c.text("HUBでのみ付け替え可能。装備・取り外しは無料です。", { color: CANVAS_THEME.muted, size: 12 });
      if (circuits.some((x) => x.effectKey === "shield")) c.text(`盾：${SHIELD_CIRCUIT_DESCRIPTION_JA}`, { color: CANVAS_THEME.muted, size: 12 });
      if (circuits.some((x) => x.effectKey === "p_shield")) c.text(`P盾：${P_SHIELD_CIRCUIT_DESCRIPTION_JA}`, { color: CANVAS_THEME.muted, size: 12 });
      c.gap(4);
      if (circuits.length === 0) c.text("回路がありません。", { color: CANVAS_THEME.muted });
      else if (fleet.length === 0) c.text("装備先の機体がありません。", { color: CANVAS_THEME.muted });
      else {
        c.buttons([
          { id: "dock:equip:circuit", label: `回路: ${cid}`, sub: cRec ? `${circuitKindPrefix(cRec)}${circuitRestoreStateLabelJa(cRec.restoreState)} — ${cRec.equippedTo ? `装備: ${cRec.equippedTo}` : "倉庫"}` : undefined, w: c.w, onActivate: () => {
            this.picker = { id: "dock:pick:circuit", title: "回路を選ぶ", options: circuits.map((x) => ({ key: x.circuitId, label: x.circuitId, sub: `${circuitKindPrefix(x)}${circuitRestoreStateLabelJa(x.restoreState)} — ${x.equippedTo ? `装備: ${x.equippedTo}` : "倉庫"}`, selected: x.circuitId === cid })), onPick: (k) => { this.equipCircuit = k; this.picker = null; }, onCancel: () => { this.picker = null; } };
          } },
          { id: "dock:equip:mech", label: `機体: ${mRec ? mRec.catalogId : "—"}`, sub: mid ?? undefined, w: c.w, onActivate: () => {
            this.picker = { id: "dock:pick:mech", title: "機体を選ぶ", options: fleet.map((m) => ({ key: m.instanceId, label: m.catalogId, sub: m.instanceId, selected: m.instanceId === mid })), onPick: (k) => { this.equipMech = k; this.picker = null; }, onCancel: () => { this.picker = null; } };
          } },
        ]).gap(6);
        c.buttons([
          { id: "dock:equip:equip", label: "装備", variant: "primary", onActivate: () => this.equip("equip", cid, mid) },
          { id: "dock:equip:unequip", label: "取り外す", onActivate: () => this.equip("unequip", cid, mid) },
        ], { fill: true }).gap(6);
      }
      const equipped = circuits.filter((x) => x.equippedTo != null);
      c.text(`現在の装備状況（${equipped.length}枚）`, { color: CANVAS_THEME.muted, size: 12 });
      c.text(`出撃部隊の回路：${squadCircuitUsage(hub, resolveSortieSelection(hub))}/${squadCircuitLimit(hub)}枚。武器種・特殊弾・盾回路・P盾回路は各機体に各1枚まで。`, { size: 12 });
      for (const m of fleet) {
        const mine = circuits.filter((x) => x.equippedTo === m.instanceId);
        c.text(`${m.catalogId}：${mine.length === 0 ? "なし" : mine.map((x) => `${x.circuitId}（${circuitKindPrefix(x)}${circuitRestoreStateLabelJa(x.restoreState)}）`).join("、")}`, { size: 12, color: CANVAS_THEME.muted });
      }
    });
  }
  private equip(kind: "equip" | "unequip", cid: string | null, mid: string | null): void {
    if (!cid || !mid || playLogBlocked()) return;
    const current = loadHubSaveFromLocalStorage(this.env.storage ?? undefined)?.hub;
    if (!current) return;
    const hub = normalizeHubSnapshot(current);
    const result = kind === "equip" ? equipHubCircuit(hub, cid, mid) : unequipHubCircuit(hub, cid);
    if (!result.ok) { this.state = { ...this.state, notice: equipRefusalMessageJa(result.reason) }; return; }
    if (this.commitHub(`trade.equip-${kind}`, { circuitId: cid, mechId: mid }, result.hub)) this.state = { ...this.state, notice: kind === "equip" ? `装備しました（${cid} → ${mid}）` : `取り外しました（${cid}）` };
  }

  private drawCraft(f: Flow): void {
    const hub = backfillPerfectMaxSize(normalizeHubSnapshot(this.state.hub));
    const options = junkCraftOptions(hub, RESTORE_MAX_SIDE);
    const firstEnabled = options.find((o) => o.enabled) ?? null;
    if (this.craftSide != null && !options.find((o) => o.side === this.craftSide)?.enabled) this.craftSide = null;
    const side = this.craftSide ?? firstEnabled?.side ?? null;
    const opt = options.find((o) => o.side === side);
    const cap = junkCraftMaxSide(hub), pcap = purchaseMaxSide(hub);
    const optLabel = (o: (typeof options)[number]) => `${o.side}×${o.side}（ジャンク${o.junk}・${o.credits}c${o.reason === "over_cap" ? "・未解放" : o.reason === "no_junk" ? "・ジャンク不足" : o.reason === "no_credits" ? "・クレジット不足" : ""}）`;
    f.card("craft", (c) => {
      c.heading("回路作成");
      c.text(`ジャンクとクレジットで N×N の回路を1枚作成します（最大 ${cap}×${cap}。パーフェクトで直した最大サイズ＋1）。`, { color: CANVAS_THEME.muted, size: 12 });
      c.kv(`ジャンク：${heldJunk(hub)} · ${Math.max(0, Math.floor(hub.credits))}c`, "").gap(4);
      c.buttons([
        { id: "dock:craft:size", label: opt ? optLabel(opt) : "作成できるサイズがありません", w: c.w, disabled: !firstEnabled, onActivate: () => {
          this.picker = { id: "dock:pick:size", title: "回路サイズ", options: options.map((o) => ({ key: String(o.side), label: optLabel(o), disabled: !o.enabled, selected: o.side === side })), onPick: (k) => { this.craftSide = Number(k); this.picker = null; }, onCancel: () => { this.picker = null; } };
        } },
      ]).gap(6);
      c.buttons([{ id: "dock:craft:go", label: "回路を作成", variant: "primary", disabled: !opt?.enabled, onActivate: () => { if (side != null) this.craft(side); } }]).gap(10);
      c.heading("回路購入");
      c.text(`2×2〜${pcap}×${pcap} のランダムな中古回路を1枚購入します。`, { color: CANVAS_THEME.muted, size: 12 }).gap(4);
      const can = hub.credits >= CIRCUIT_PURCHASE_PRICE;
      c.buttons([{ id: "dock:craft:buy", label: `回路を購入 · ${CIRCUIT_PURCHASE_PRICE}c`, disabled: !can, onActivate: () => this.buyCircuit() }]);
      if (!can) c.gap(4).text("クレジットが足りません。", { color: CANVAS_THEME.muted, size: 12 });
    });
  }
  private craft(side: number): void {
    const run = () => {
      if (playLogBlocked()) return;
      const hub = backfillPerfectMaxSize(normalizeHubSnapshot(loadHubSaveFromLocalStorage(this.env.storage ?? undefined)?.hub));
      setPlayLogOperation("circuit.create", { side });
      const result = craftJunkCircuit(hub, side, { circuitId: this.env.newId("junk_craft"), trueBoardRate: this.trueBoardRate() });
      if (!result.ok) return;
      this.commitHub("circuit.create", { side }, result.hub);
    };
    const text = junkCraftConfirmText(side);
    if (text) this.ask({ id: "dock:confirm:craft", title: "回路作成の確認", text, okLabel: "作成する", onOk: run });
    else run();
  }
  private buyCircuit(): void {
    const cap = purchaseMaxSide(backfillPerfectMaxSize(normalizeHubSnapshot(this.state.hub)));
    this.ask({
      id: "dock:confirm:circuitbuy", title: "回路購入の確認", okLabel: "購入する",
      text: `回路を購入しますか？\n${CIRCUIT_PURCHASE_PRICE}c\n2×2〜${cap}×${cap} のランダムな中古回路`,
      onOk: () => {
        if (playLogBlocked()) return;
        const loaded = loadHubSaveFromLocalStorage(this.env.storage ?? undefined);
        if (!loaded) { this.state = { ...this.state, notice: "セーブを読み込めませんでした。購入していません。" }; return; }
        setPlayLogOperation("circuit.purchase");
        const result = purchaseCircuit(backfillPerfectMaxSize(normalizeHubSnapshot(loaded.hub)), { circuitId: this.env.newId("circuit_buy"), trueBoardRate: this.trueBoardRate() });
        if (!result.ok) { this.state = { ...this.state, notice: "クレジットが足りません。" }; return; }
        this.commitHub("circuit.purchase", {}, result.hub);
      },
    });
  }

  private drawHistory(f: Flow): void {
    const entries = resourceHistoryFromLog(this.state.log);
    f.card("history", (c) => {
      c.heading("資源履歴");
      if (entries.length === 0) c.text("資源の増減ログはまだありません。探索帰還・精製搬入・売買がここに可視化されます。", { color: CANVAS_THEME.muted, size: 12 });
      for (const e of entries) {
        const chips = e.chips.map((x) => (x.amount == null ? x.label : `${x.label} ${formatSignedAmount(x.amount)}${x.unit ?? ""}`)).join("　");
        c.text(`${e.title}　${chips}`, { size: 12, color: e.polarity === "gain" ? CANVAS_THEME.gain : e.polarity === "spend" ? CANVAS_THEME.spend : CANVAS_THEME.muted });
      }
      c.gap(8).heading("ログ");
      if (this.state.log.length === 0) c.text("（なし）", { color: CANVAS_THEME.muted, size: 12 });
      for (const l of this.state.log) c.text(l, { size: 12, color: CANVAS_THEME.muted });
    });
  }

  /** Debug mode only: the test tools are in the HTML debug area under the canvas (神宮決定 2026-11-06). */
  private drawDebug(f: Flow): void {
    if (!this.env.debug) return;
    f.card("debug", (c) => {
      c.heading("検証用");
      c.text("シード・デモ操作・デモ初期化・プレイ記録・Alpha Lab など、本来の流れではない検証用の機能は、canvas の下の「検証用の欄」にまとめています。", { color: CANVAS_THEME.muted, size: 12 }).gap(6);
      c.buttons([{ id: "dock:debug:open", label: "検証用の欄へ ▼", onActivate: () => this.env.openDebug?.() }]);
    });
  }

  /**
   * The DOCK test actions for the debug area (same functions, same play-log
   * operation names as the existing DOCK's 検証用 buttons).
   */
  debugActions(): Array<{ id: string; label: string; group: string; run: () => void }> {
    const showInjectionDetails = isPerfectCircuitDebugContext({ search: this.env.search, hostname: this.env.hostname, isDev: this.env.isDev });
    const sim = (k: "extract" | "abort" | "fail") => () => this.act(`sim-${k}`, { sim: k }, (st) => simulateReturn(st, k));
    return [
      { id: "seed", group: "DOCK", label: "検証用シード読込", run: () => this.act("btn-seed", {}, (st) => loadPlaytestSeed(st, { injectRate: resolveHangarPerfectInjectRate({ search: this.env.search, hostname: this.env.hostname, isDev: this.env.isDev, envRate: this.env.envRate }), showInjectionDetails })) },
      { id: "grant", group: "DOCK", label: "デモ機体を受領", run: () => this.act("btn-grant", {}, grantStarterFleet) },
      { id: "inv", group: "DOCK", label: "デモ物資", run: () => this.act("btn-inv", {}, grantDemoInventory) },
      { id: "verify-true", group: "DOCK", label: "検証用真盤", run: () => this.act("btn-verify-true", {}, grantVerifyTrueCircuit) },
      { id: "verify-perfect", group: "DOCK", label: "検証用・完璧", run: () => this.act("btn-verify-perfect", {}, grantVerifyPerfectLockedCircuit) },
      { id: "sim-extract", group: "シミュ帰還", label: "帰還", run: sim("extract") },
      { id: "sim-abort", group: "シミュ帰還", label: "撤退", run: sim("abort") },
      { id: "sim-fail", group: "シミュ帰還", label: "失敗", run: sim("fail") },
    ];
  }
}


/** Same stock rule as the existing 仕分へ in 次の出撃 (intro: at most the remaining initial 10). */
export function introSortQty(hub: HubSnapshot, stock: number): number {
  return Math.min(stock, hub.newGameIntro && hub.newGameIntro.initialOpened < 10 ? 10 - hub.newGameIntro.initialOpened : Infinity);
}

function toggleAt(ui: CanvasUI, id: string, r: Rect, label: string, on: boolean, disabled: boolean, onActivate: () => void): void {
  toggleButton(ui, id, r, label, on, { disabled, onActivate });
}
