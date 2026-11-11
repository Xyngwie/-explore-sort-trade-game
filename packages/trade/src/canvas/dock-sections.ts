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
  launchSortFromUnopened,
  loadPlaytestSeed,
  lostMechCountLineJa,
  markDeployed,
  onHangarExploreLink,
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
  setDeploySelection,
  simulateReturn,
  sortieAmmoShortLineJa,
  wreckCountLineJa,
  wreckSaleConfirmText,
  bulletinUnlockedLineHtml,
  type HangarState,
} from "../hangar";
import { hubMechGaugeModel } from "../mech-gauge-hub";
import { PALETTE_TITLE, PaletteNav, type PaletteId } from "./palette-tree";
import { QTY_STEPS, type MarketItem } from "./market";
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
/** Old section anchors → the palette that now holds that work (tabs, other scenes, older links). */
export const ANCHOR_PALETTE: Record<string, PaletteId> = {
  [DOCK_ANCHOR.squad]: "IT", [DOCK_ANCHOR.reserve]: "MM", [DOCK_ANCHOR.circuits]: "C", [DOCK_ANCHOR.market]: "T", [DOCK_ANCHOR.unopened]: "S",
};

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
  /** 資源売却 dialog with a quantity (神宮 2026-11-09); null = closed. */
  sell: { id: (typeof RESOURCE_IDS)[number]; qty: number } | null = null;
  /** The dialog to draw: a plain confirm, or the sale with its quantity row. */
  confirmSpec(): ConfirmSpec | null {
    if (this.confirm) return this.confirm;
    const sell = this.sell;
    if (!sell) return null;
    const stock = Math.max(0, Math.floor(this.state.hub.inventory?.[sell.id] ?? 0));
    const q = Math.max(1, Math.min(stock, sell.qty));
    return {
      id: "dock:confirm:sell", title: "売却の確認", text: resourceSellConfirmText(RESOURCE_LABEL_JA[sell.id], q), okLabel: "売却する",
      qty: { value: q, max: Math.max(1, stock), steps: QTY_STEPS, onChange: (n) => { if (this.sell) this.sell = { ...this.sell, qty: n }; } },
      onCancel: () => { this.sell = null; },
      onOk: () => {
        this.sell = null;
        const now = loadHubSaveFromLocalStorage(this.env.storage ?? undefined)?.hub;
        if (!now) return;
        // Re-read the save just before the sale: never more than the stock it has now.
        const n = Math.min(q, Math.max(0, Math.floor(now.inventory?.[sell.id] ?? 0)));
        const next = n > 0 ? applyResourceTrade(now, sell.id, "sell", n) : null;
        if (next) this.commitHub("resource.sell", { id: sell.id, quantity: n }, next);
      },
    };
  }
  /** null = the existing default (the whole stock, like `input-sort-unopened`). */
  private sortQty: number | null = null;
  private craftSide: number | null = null;
  private equipCircuit: string | null = null;
  private equipMech: string | null = null;
  guardDismissed = false;
  /** Where the player is in the palette tree (docs/CANVAS_PALETTE_RESTRUCTURE.md). Never saved. */
  readonly nav = new PaletteNav();
  /** Called after the palette changed (the scene resets the scroll and redraws). */
  onNavigate: () => void = () => {};
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
  /** Old anchor (SORT tab = 未開封 …) → open the palette that holds it. */
  goAnchor(id: string): void {
    const p = ANCHOR_PALETTE[id];
    if (p) this.goPalette(p);
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

  /* -------------------------------- palettes ------------------------------ */
  /** Open a palette from the current one (back returns here). */
  openPalette(id: PaletteId): void {
    if (playLogBlocked()) return;
    this.nav.open(id);
    this.state = { ...this.state, notice: "" };
    this.onNavigate();
  }
  /** Jump to a palette along its default path (tabs, guides, other scenes). */
  goPalette(id: PaletteId): void {
    this.nav.goTo(id);
    this.state = { ...this.state, notice: "" };
    this.onNavigate();
  }
  backPalette(): void { if (playLogBlocked()) return; this.nav.back(); this.state = { ...this.state, notice: "" }; this.onNavigate(); }
  homePalette(): void { if (playLogBlocked()) return; this.nav.home(); this.state = { ...this.state, notice: "" }; this.onNavigate(); }

  /** One full-width button per next action (selection palettes). */
  private choices(f: Flow, items: Array<{ to: PaletteId; label?: string; sub?: string; disabled?: boolean; id?: string; run?: () => void; variant?: "primary" | "normal" }>): void {
    f.buttons(items.map((it) => ({
      id: it.id ?? `dock:nav:${it.to}`, label: it.label ?? PALETTE_TITLE[it.to], sub: it.sub, disabled: it.disabled, variant: it.variant, w: f.w,
      onActivate: () => (it.run ? it.run() : this.openPalette(it.to)),
    })), { h: 56, gap: 8 });
  }
  private noticeCard(f: Flow): void {
    const s = this.state;
    if (!s.notice) return;
    const warn = warnText(s.notice);
    f.card("notice", (c) => c.text(s.notice, { color: warn ? "#ffdcd7" : "#aff5b4" }), { fill: warn ? "#3d1d1d" : "#12261e", edge: warn ? "#f85149" : "#2ea043" }).gap(8);
  }

  /** Draw the current palette. `drawMarket(f, items)` draws market rows (owned by the scene). */
  drawPalette(ui: CanvasUI, f: Flow, drawMarket: (f: Flow, items: readonly MarketItem[]) => void, side?: Flow): void {
    const id = this.nav.current;
    if (id !== "H") this.noticeCard(f);
    switch (id) {
      case "H": return this.drawHome(ui, f, side);
      case "T": return this.choices(f, [{ to: "B" }, { to: "V" }]);
      case "B": return this.choices(f, [
        { to: "BR", label: "資源", sub: "弾薬・装甲パーツ・電力パーツ・ジャンク" },
        { to: "BC", label: "未開封コンテナ", sub: `在庫 ${this.stock()}` },
        { to: "MC", label: "新品機体" },
        { to: "CB", label: "中古回路" },
      ]);
      case "BR": return drawMarket(f, ["ammo", "armor", "power", "junk"]);
      case "BC": return drawMarket(f, ["unopened"]);
      case "V": return this.choices(f, [
        { to: "VS", label: "資源" },
        { to: "CS", label: "回路", sub: `${hubVisibleCircuits(this.state.hub).length}枚` },
        { to: "MW", label: "残骸", sub: `${this.wrecks().length}機` },
      ]);
      case "VS": return this.drawSell(f);
      case "S": return this.drawUnopened(f);
      case "M": return this.choices(f, [{ to: "MM", label: "機体" }, { to: "C", label: "回路" }]);
      case "MM": return this.choices(f, [
        { to: "MN" }, { to: "EQ" }, { to: "MD", label: "処分" },
        // CANVAS-PR8 (神宮決定 2026-11-08): the existing repair / revive / charge work, as children of 機体整備.
        { to: "MR", label: "修理", sub: `${this.repairable().length}機` },
        { to: "MV", label: "残骸復活", sub: `${this.wrecks().length}機` },
        { to: "MQ", label: "充電" },
      ]);
      case "MN": return this.choices(f, [{ to: "MC", label: "購入" }, { to: "MF", label: "製作" }]);
      case "MC": return this.drawBuyMech(f);
      case "MF": return this.drawCreateMech(f);
      case "MD": return this.choices(f, [{ to: "MS", label: "分解" }, { to: "MW", label: "売却" }]);
      case "MS": return this.drawMechList(ui, f, "scrap");
      case "MW": return this.drawMechList(ui, f, "sellwreck");
      case "MR": return this.drawMechList(ui, f, "repair");
      case "MV": return this.drawMechList(ui, f, "revive");
      case "MQ": return this.drawMechList(ui, f, "charge");
      case "C": return this.choices(f, [
        { to: "CI", label: "所持回路", sub: `${hubVisibleCircuits(this.state.hub).length}枚` },
        { to: "CC", label: "製作" }, { to: "CB", label: "購入" }, { to: "EQ", label: "装備" }, { to: "CU", label: "取り外し" }, { to: "CS", label: "売却" },
      ]);
      case "CI": return this.drawCircuitList(f);
      case "CD": return this.drawCircuitDetail(f);
      case "CC": return this.drawCraft(f);
      case "CB": return this.drawCircuitBuy(f);
      case "CU": return this.drawUnequip(f);
      case "CS": return this.drawCircuitSell(f);
      case "EQ": return this.drawEquip(f);
      case "I": return this.drawInvadeChoice(f);
      case "IT": return this.drawSquad(ui, f);
      case "ITD": return this.drawSquadDetail(f);
      case "EQS": return this.drawEquipStatus(f);
      case "A": return this.choices(f, [{ to: "AI" }, { to: "AH" }, { to: "AL" }, { to: "AS" }]);
      case "AI": return this.drawInventory(f);
      case "AH": return this.drawHistory(f);
      case "AL": return this.drawLog(f);
      case "AS": return this.drawSignature(f);
    }
  }

  private stock(): number { return Math.max(0, Math.floor(this.state.hub.unopenedContainers ?? 0)); }
  private wrecks() { return this.state.hub.fleet.filter((m) => reviveMechCost(m)); }
  private repairable() { return this.state.hub.fleet.filter((m) => !reviveMechCost(m) && repairCost(m)); }

  /** H: 所持資産の表示 + 次の行動4モジュール（売買・仕分・整備・侵略）。 */
  private drawHome(ui: CanvasUI, f: Flow, side?: Flow): void {
    const s = this.state, hub = s.hub;
    const ready = buildNextSortieReadiness(s);
    const mig = saveMigrationNotice(loadHubSaveWithStatus(this.env.storage ?? undefined));
    if (mig) f.card("migration", (c) => c.text(mig, { color: CANVAS_THEME.muted })).gap(8);
    this.noticeCard(f);
    // New-game guide (#332): the first step is 仕分.
    // 神宮 2026-11-09: only until the 10 initial containers are opened.
    if (!DEBUG_FIXTURE_ACTIVE && hub.newGameIntro && !hub.newGameIntro.firstSortie && hub.newGameIntro.initialOpened < 10) {
      const intro = hub.newGameIntro;
      f.card("intro", (c) => {
        c.heading("初出撃の準備");
        c.text("まず未開封コンテナを仕分で開封してください。開封後は格納庫へ戻り、資源の売買で資金と材料を整え、機体と1×1回路を作成します。回路を修復して隊長機に装備し、既存の補給で出撃を準備してください。").gap(6);
        c.buttons([{ id: "dock:intro:open", label: "コンテナを開封する", onActivate: () => this.openPalette("S") }]).gap(6);
        c.text(`初期支給の開封済み ${intro.initialOpened}/10個。初期支給分は購入分と別に開封します。`, { color: CANVAS_THEME.muted });
      }).gap(8);
    }
    // Sortie-guard banner (§16): only after Explore's 格納庫へ. CANVAS-PR3 (神宮決定 2026-11-08): the button opens the palette for the cause.
    const flagged = !this.guardDismissed && this.env.session?.getItem(SORTIE_GUARD_RETURN_KEY) === "1" && !DEBUG_FIXTURE_ACTIVE;
    const guard = flagged ? sortieGuardGuide(hub, ready.selectedIds) : null;
    if (flagged && !guard) { try { this.env.session?.removeItem(SORTIE_GUARD_RETURN_KEY); } catch { /* */ } }
    if (guard) {
      const clear = () => { try { this.env.session?.removeItem(SORTIE_GUARD_RETURN_KEY); } catch { /* */ } this.guardDismissed = true; };
      f.card("guard", (c) => {
        c.text(guard.text, { color: "#ffdcd7" }).gap(6);
        c.buttons([
          { id: "dock:guard:go", label: guard.action, onActivate: () => { clear(); this.goGuard(guard.code); } },
          { id: "dock:guard:close", label: "✕", w: 48, onActivate: clear },
        ]);
      }, { fill: "#3d1d1d", edge: "#f85149" }).gap(8);
    }
    // 所持資産の表示 — CANVAS-PR7 (神宮決定 2026-11-08): this card is the way into 所持資産の詳細 (A).
    f.card("assets", (c) => {
      const top = c.y;
      const h = ui.memo.get("card:assets:h") ?? 120;
      ui.region("dock:nav:A", { x: c.x - 12, y: top - 12, w: c.w + 24, h }, { onActivate: () => this.openPalette("A") });
      c.kv("所持資産", "詳細 ›", { weight: 700 });
      c.kv(`所持金 ${Math.max(0, Math.floor(hub.credits)).toLocaleString("en-US")}c`, `未開封 ${this.stock()}`);
      c.text(RESOURCE_IDS.map((id) => `${RESOURCE_LABEL_JA[id]} ${Math.max(0, Math.floor(hub.inventory?.[id] ?? 0))}`).join("　"), { size: 12, color: CANVAS_THEME.muted });
      const ok = hub.fleet.filter((m) => m.status === "operational").length;
      c.text(`機体 ${hub.fleet.length}機（健在 ${ok}）　回路 ${hubVisibleCircuits(hub).length}枚`, { size: 12, color: CANVAS_THEME.muted });
    }).gap(10);
    // 次の行動4モジュール.
    const g = side ?? f;
    this.choices(g, [
      { to: "T", label: "売買" },
      { to: "S", label: "仕分", sub: `未開封 ${this.stock()}` },
      { to: "M", label: "整備" },
      { to: "I", label: "侵略", sub: ready.readinessLabelJa },
    ]);
    g.gap(8);
    this.drawDebug(g);
  }
  /** CANVAS-PR3 (神宮決定 2026-11-08): where the guard's button leads. */
  private goGuard(code: string): void {
    if (code === "first_leader") return this.goPalette("IT");
    if (code === "first_circuit_unrepaired") {
      const intro = this.state.hub.newGameIntro;
      const crafted = this.state.hub.circuits.find((c) => intro?.craftedCircuitIds.includes(c.circuitId) && c.origin === "crafted");
      if (crafted) this.state = selectCircuit(this.state, crafted.circuitId);
      return this.goPalette(crafted ? "CD" : "CI");
    }
    return this.goPalette("EQ"); // first_circuit_unequipped / squad_full / category_full
  }

  /** I: 部隊を選ぶ／戦線地図へ／直接出撃の準備へ。 */
  private drawInvadeChoice(f: Flow): void {
    const s = this.state;
    const ready = buildNextSortieReadiness(s);
    const deployUrl = buildDeployUrl(s);
    f.text(`次の出撃：${ready.readinessLabelJa}　出撃部隊の回路 ${squadCircuitUsage(s.hub, ready.selectedIds)}/${squadCircuitLimit(s.hub)}枚`, { size: 12, color: CANVAS_THEME.muted }).gap(8);
    this.choices(f, [
      { to: "IT", label: "部隊を選ぶ", sub: `${ready.selectedIds.length}機選択中` },
      { to: "I", id: "dock:sortie:invade", label: CTA_COPY.toFront, sub: "戦線地図（INVADE）", run: () => { if (!playLogBlocked()) this.env.navigate(buildInvadeUrl(this.state)); } },
      { to: "I", id: "dock:sortie:explore", label: deployUrl ? `▶ ${CTA_COPY.toExplore}` : CTA_COPY.toExplore, sub: "直接出撃の準備", variant: "primary", disabled: !deployUrl, run: () => this.goDeploy() },
    ]);
  }

  /** IT: the existing 次の出撃 information + the sortie selection of the hangar. */
  private drawSquad(ui: CanvasUI, f: Flow): void {
    const s = this.state, hub = s.hub;
    const ready = buildNextSortieReadiness(s);
    const digest = buildNextSortieReturnDigest(s);
    const equipmentError = squadEquipmentError(hub, ready.selectedIds);
    const equipmentNote = (DEBUG_FIXTURE_ACTIVE ? "" : firstSortieError(hub, ready.selectedIds[0])) || (equipmentError === "squad_full" ? "出撃部隊の回路上限を超えています。装備を外すか出撃機を変更してください。" : equipmentError === "category_full" ? "武器種・特殊弾・盾回路・P盾回路は各機体に各1枚までです。装備を変更してください。" : "");
    const emptyActivity = hub.fleet.filter((m) => ready.selectedIds.includes(m.instanceId) && m.battery.activity <= 0);
    const circuits = formatCircuitHubBrief(hubVisibleCircuits(hub), s.lastCircuit);
    const active = circuits.lines.find((l) => l.active) ?? circuits.lines[0] ?? null;
    const ammoShort = sortieAmmoShortLineJa(hub, ready.selectedIds);
    // CANVAS-G8 (神宮決定 2026-11-08): readiness + the warnings to act on here; the rest is 次の出撃の詳細 (ITD).
    f.card("sortie", (c) => {
      c.kv("次の出撃", ready.readinessLabelJa, { weight: 700, size: 16, lineH: 26 });
      c.text(`出撃部隊の回路 ${squadCircuitUsage(hub, ready.selectedIds)}/${squadCircuitLimit(hub)}枚`);
      if (equipmentNote) c.text(equipmentNote, { color: "#ffa198" });
      if (emptyActivity.length) c.text(`出撃部隊に活動量0の機体が${emptyActivity.length}機あります。出撃すると残骸になります。格納庫の各機体の「充電」で電力パーツを使って充電してください。`, { color: "#ffa198" });
      if (ammoShort) c.text(ammoShort, { color: "#ffa198" });
    }).gap(8);
    this.choices(f, [{ to: "ITD", label: "次の出撃の詳細" }]);
    f.gap(8);
    const bulletin = bulletinUnlockedLineHtml(hub).replace(/<[^>]+>/g, "").trim();
    if (bulletin) f.text(bulletin, { color: CANVAS_THEME.muted });
    f.buttons([{ id: "dock:hangar:all", label: "出撃可能な全機体", onActivate: () => this.act("btn-select-all", {}, selectAllDeployable) }]).gap(6);
    f.text("出撃する機体を選択（人数制限なし）（選択は保存され、次回・再出撃でも使われます）。先頭が隊長機です。", { color: CANVAS_THEME.muted, size: 12 }).gap(6);
    if (hub.fleet.length === 0) f.text("艦隊が空です。整備の新規機体で購入・製作してください。", { color: CANVAS_THEME.muted });
    const leaderId = ready.selectedIds[0] ?? null;
    for (const m of hub.fleet) {
      const deployable = canDeploy(m);
      const checked = s.selectedDeployIds.includes(m.instanceId) && deployable;
      this.mechCard(ui, f, m, leaderId, (r, top) => {
        toggleAt(ui, `dock:mech:${m.instanceId}:select`, { x: r.x + r.w - 92, y: top, w: 92, h: 44 }, "出撃", checked, !deployable,
          () => this.act("select", { act: "select", id: m.instanceId }, (st) => setDeploySelection(st, m.instanceId, !checked)));
      }, m.instanceId === leaderId ? "隊長機" : undefined);
    }
  }

  /** ITD: the rest of the existing 次の出撃 information (display only). */
  private drawSquadDetail(f: Flow): void {
    const s = this.state, hub = s.hub;
    const ready = buildNextSortieReadiness(s);
    const digest = buildNextSortieReturnDigest(s);
    const circuits = formatCircuitHubBrief(hubVisibleCircuits(hub), s.lastCircuit);
    const active = circuits.lines.find((l) => l.active) ?? circuits.lines[0] ?? null;
    f.text(`探索: ${digest.exploreJa}`, { color: s.lastExploreReturn ? "#aff5b4" : CANVAS_THEME.muted });
    f.text(`戦線: ${digest.invadeJa}`, { color: s.lastInvadeSector ? "#aff5b4" : CANVAS_THEME.muted });
    f.text(`回路: ${digest.restoreJa}`, { color: hubVisibleCircuits(hub).length ? "#aff5b4" : CANVAS_THEME.muted });
    f.text(`回路効果値 ${active?.effectJa ?? "効果 —"}`);
    f.text(`回路ボーナス: ${formatCircuitBonusesJa(hubCircuitBonuses(hub))}`, { color: CANVAS_THEME.muted });
    f.gap(4).text("配備予定", { weight: 700 });
    if (ready.selectedIds.length === 0) f.text("配備対象なし — 健在機を修理するか受領してください。", { color: CANVAS_THEME.muted });
    for (const id of ready.selectedIds) {
      const m = hub.fleet.find((x) => x.instanceId === id);
      if (m) f.text(`${m.catalogId}　耐久 ${m.durability}/${m.durabilityMax} (${Math.round((m.durability / m.durabilityMax) * 100)}%)`);
    }
    const lost = lostMechCountLineJa(hub), wreck = wreckCountLineJa(hub);
    if (lost) f.text(lost, { color: CANVAS_THEME.muted });
    if (wreck) f.text(wreck, { color: CANVAS_THEME.muted });
    f.text(ready.needsRepair === 0 ? "修理待ちなし — 出撃可" : `要修理 ${ready.needsRepair}機 — 整備の修理 / 処分へ`, { color: ready.needsRepair === 0 ? "#aff5b4" : "#ffa198" });
  }
  /** EQS: the existing 現在の装備状況 and the shield explanations (display only). */
  private drawEquipStatus(f: Flow): void {
    const hub = this.state.hub;
    const circuits = hubVisibleCircuits(hub);
    const equipped = circuits.filter((x) => x.equippedTo != null);
    if (circuits.some((x) => x.effectKey === "shield")) f.text(`盾：${SHIELD_CIRCUIT_DESCRIPTION_JA}`, { color: CANVAS_THEME.muted, size: 12 });
    if (circuits.some((x) => x.effectKey === "p_shield")) f.text(`P盾：${P_SHIELD_CIRCUIT_DESCRIPTION_JA}`, { color: CANVAS_THEME.muted, size: 12 });
    f.gap(4).text(`現在の装備状況（${equipped.length}枚）`, { weight: 700 });
    f.text(`出撃部隊の回路：${squadCircuitUsage(hub, resolveSortieSelection(hub))}/${squadCircuitLimit(hub)}枚。武器種・特殊弾・盾回路・P盾回路は各機体に各1枚まで。`, { size: 12 });
    for (const m of hub.fleet ?? []) {
      const mine = circuits.filter((x) => x.equippedTo === m.instanceId);
      f.text(`${m.catalogId}：${mine.length === 0 ? "なし" : mine.map((x) => `${x.circuitId}（${circuitKindPrefix(x)}${circuitRestoreStateLabelJa(x.restoreState)}）`).join("、")}`, { size: 12, color: CANVAS_THEME.muted });
    }
  }

  /** One mech: gauge (tap = numbers 1.5 s), type and status; `extra` adds the controls of the palette. */
  private mechCard(ui: CanvasUI, f: Flow, m: HubSnapshot["fleet"][number], leaderId: string | null, extra: (r: Flow, top: number) => void, tag?: string): void {
    const hub = this.state.hub;
    const now = this.env.now();
    f.card(`mech:${m.instanceId}`, (r) => {
      const top = r.y;
      const gm = hubMechGaugeModel(hub, m, leaderId);
      const size = 44;
      drawMechGauge(ui, gm, r.x, top, size);
      ui.region(`dock:gauge:${m.instanceId}`, { x: r.x, y: top, w: size, h: size }, { onActivate: () => { this.gaugeShown.set(m.instanceId, this.env.now() + GAUGE_TEXT_MS); setTimeout(() => this.redraw(), GAUGE_TEXT_MS + 30); } });
      const tx = r.x + size + 10, tw = r.w - size - 10 - 96;
      ui.text(`${m.catalogId}　${MECH_STATUS_LABEL_JA[m.status]}${tag ? `　${tag}` : ""}`, tx, top + 12, { size: 14, weight: 700, color: m.status === "operational" ? "#aff5b4" : m.status === "needs_repair" ? "#ffa198" : CANVAS_THEME.muted, maxW: tw });
      const shown = (this.gaugeShown.get(m.instanceId) ?? 0) > now;
      ui.text(shown ? gm.text : m.instanceId, tx, top + 32, { size: 11, color: shown ? CANVAS_THEME.text : CANVAS_THEME.faint, maxW: tw });
      extra(r, top);
      r.y = Math.max(r.y, top + size + 4);
    }, { pad: 10, fill: CANVAS_THEME.bg }).gap(6);
  }

  /** MS / MW / MR / MV / MQ: one kind of mech work on the mechs it applies to. */
  private drawMechList(ui: CanvasUI, f: Flow, kind: "scrap" | "sellwreck" | "repair" | "revive" | "charge"): void {
    const hub = this.state.hub;
    const leaderId = buildNextSortieReadiness(this.state).selectedIds[0] ?? null;
    const list = kind === "sellwreck" || kind === "revive" ? this.wrecks() : kind === "repair" ? this.repairable() : hub.fleet;
    const empty = { scrap: "解体できる機体がありません。", sellwreck: "売却できる残骸がありません（大破・耐久0の格納庫の残骸だけ）。", repair: "修理が必要な機体はありません。", revive: "復活できる残骸がありません。", charge: "機体がありません。" }[kind];
    if (kind === "charge") f.text(`電力パーツ在庫 ${Math.max(0, Math.floor(hub.inventory?.power ?? 0))}`, { size: 12, color: CANVAS_THEME.muted }).gap(6);
    if (list.length === 0) { f.text(empty, { color: CANVAS_THEME.muted }); return; }
    for (const m of list) {
      this.mechCard(ui, f, m, leaderId, (r, top) => {
        r.y = top + 44 + 8;
        const btn = (): Parameters<Flow["buttons"]>[0][number] => {
          if (kind === "scrap") return { id: `dock:mech:${m.instanceId}:scrap`, label: "解体", variant: "danger", onActivate: () => {
            if (this.moneyRecent()) return;
            this.ask({ id: "dock:confirm:scrap", title: "解体の確認", text: `解体しますか？\n${m.instanceId}`, okLabel: "解体する", okVariant: "danger", onOk: () => this.act("scrap", { act: "scrap", id: m.instanceId }, (st) => scrapMech(st, m.instanceId)) });
          } };
          if (kind === "sellwreck") return { id: `dock:mech:${m.instanceId}:sellwreck`, label: "残骸売却 400c", onActivate: () => {
            const text = wreckSaleConfirmText(this.state, m.instanceId);
            if (text) this.ask({ id: "dock:confirm:wreck", title: "残骸の売却", text, okLabel: "売却する", okVariant: "danger", onOk: () => this.act("sell-wreck", { act: "sell-wreck", id: m.instanceId }, (st) => sellHangarWreck(st, m.instanceId, this.env.storage)) });
          } };
          if (kind === "repair") return { id: `dock:mech:${m.instanceId}:repair`, label: repairMechLabelJa(m), onActivate: () => { if (this.moneyAllowed()) this.act("repair", { act: "repair", id: m.instanceId }, (st) => repairMech(st, m.instanceId)); } };
          if (kind === "revive") return { id: `dock:mech:${m.instanceId}:revive`, label: reviveMechLabelJa(m), onActivate: () => { if (this.moneyAllowed()) this.act("revive", { act: "revive", id: m.instanceId }, (st) => reviveWreck(st, m.instanceId)); } };
          return { id: `dock:mech:${m.instanceId}:charge`, label: "充電", sub: `活動量 ${m.battery.activity}/${m.battery.capacity}`, disabled: m.battery.activity >= m.battery.capacity, onActivate: () => this.act("charge", { act: "charge", id: m.instanceId }, (st) => chargeMech(st, m.instanceId)) };
        };
        r.buttons([btn()]);
      });
    }
  }

  /** MC: the existing new mech purchase (`buyNewMech`). */
  private drawBuyMech(f: Flow): void {
    f.text(`所持金 ${Math.max(0, Math.floor(this.state.hub.credits)).toLocaleString("en-US")}c`, { color: CANVAS_THEME.muted }).gap(6);
    f.buttons([{ id: "dock:hangar:buy", label: BUY_MECH_LABEL_JA, variant: "primary", w: f.w, onActivate: () => { if (this.moneyAllowed()) this.act("btn-buy-mech", {}, buyNewMech); } }]);
  }
  /** MF: the existing new mech creation (`createNewMech`). */
  private drawCreateMech(f: Flow): void {
    const hub = this.state.hub;
    f.text(`所持金 ${Math.max(0, Math.floor(hub.credits)).toLocaleString("en-US")}c　装甲パーツ ${Math.max(0, Math.floor(hub.inventory?.armor ?? 0))}`, { color: CANVAS_THEME.muted }).gap(6);
    f.buttons([{ id: "dock:hangar:create", label: createMechLabelJa(), variant: "primary", w: f.w, onActivate: () => { if (this.moneyAllowed()) this.act("btn-create-mech", {}, createNewMech); } }]);
  }

  /** S: 仕分に使う個数、GO（existing −1・+1・全部; 開封途中なら再開）. */
  private drawUnopened(f: Flow): void {
    const hub = this.state.hub;
    const stock = this.stock();
    const q = Math.max(1, Math.min(Math.max(1, stock), this.sortQty ?? stock));
    const resume = hub.newGameIntro?.opening?.url;
    if (resume) f.buttons([{ id: "dock:unopened:resume", label: "開封作業へ戻る", variant: "primary", w: f.w, onActivate: () => { if (!playLogBlocked()) this.env.navigate(resume); } }]).gap(8);
    f.kv(`未開封コンテナ 在庫 ${stock}`, "", { weight: 700 }).gap(4);
    f.text("仕分（SORT）に使う個数を選んで GO。購入は売買の「買う」。", { color: CANVAS_THEME.muted, size: 12 }).gap(6);
    f.buttons([
      { id: "dock:unopened:sort:-1", label: "−1", w: 52, disabled: stock < 1 || q <= 1, onActivate: () => { this.sortQty = Math.max(1, q - 1); } },
      { id: "dock:unopened:sort:qty", label: `×${q}`, w: 60, disabled: true },
      { id: "dock:unopened:sort:+1", label: "+1", w: 52, disabled: stock < 1 || q >= stock, onActivate: () => { this.sortQty = Math.min(stock, q + 1); } },
      { id: "dock:unopened:sort:all", label: "全部", w: 64, disabled: stock < 1 || q >= stock, onActivate: () => { this.sortQty = stock; } },
    ]).gap(8);
    f.buttons([{ id: "dock:unopened:sort:go", label: "GO", sub: stock < 1 ? undefined : `${q}個を仕分へ`, variant: "primary", w: f.w, disabled: stock < 1, onActivate: () => this.goSort(q) }]);
    if (stock < 1) f.gap(4).text("仕分出庫できる未開封がありません", { color: CANVAS_THEME.muted, size: 12 });
  }

  /** VS: the existing resource sale (1 tap 1 piece, confirm every time). */
  private drawSell(f: Flow): void {
    const hub = this.state.hub;
    f.text(`Sortで得た4資源を売却（売値 ${RESOURCE_SELL_PRICE}c、毎回確認。個数は確認の画面で選べます）。`, { color: CANVAS_THEME.muted, size: 12 }).gap(6);
    f.buttons(RESOURCE_IDS.map((id) => {
      const n = Math.max(0, Math.floor(hub.inventory?.[id] ?? 0));
      return {
        id: `dock:sell:${id}`, label: `${RESOURCE_LABEL_JA[id]} 売却`, sub: n > 0 ? `在庫 ${n} · +${RESOURCE_SELL_PRICE}c` : "在庫なし", disabled: n < 1, w: f.w,
        onActivate: () => { if (!playLogBlocked()) this.sell = { id, qty: 1 }; },
      };
    }), { h: 52 });
  }

  /** AI: the whole typed inventory (display only). */
  private drawInventory(f: Flow): void {
    const entries = Object.entries(this.state.hub.inventory).filter(([, n]) => (n ?? 0) > 0) as Array<[string, number]>;
    if (entries.length === 0) f.text("（空）", { color: CANVAS_THEME.muted });
    for (const [id, n] of entries) f.kv(labelYield(id), `${n}`);
  }
  private drawHistory(f: Flow): void {
    const entries = resourceHistoryFromLog(this.state.log);
    if (entries.length === 0) f.text("資源の増減ログはまだありません。探索帰還・精製搬入・売買がここに可視化されます。", { color: CANVAS_THEME.muted, size: 12 });
    for (const e of entries) {
      const chips = e.chips.map((x) => (x.amount == null ? x.label : `${x.label} ${formatSignedAmount(x.amount)}${x.unit ?? ""}`)).join("　");
      f.text(`${e.title}　${chips}`, { size: 12, color: e.polarity === "gain" ? CANVAS_THEME.gain : e.polarity === "spend" ? CANVAS_THEME.spend : CANVAS_THEME.muted });
    }
  }
  private drawLog(f: Flow): void {
    if (this.state.log.length === 0) f.text("（なし）", { color: CANVAS_THEME.muted, size: 12 });
    for (const l of this.state.log) f.text(l, { size: 12, color: CANVAS_THEME.muted });
  }
  private drawSignature(f: Flow): void {
    f.text(`確定済み: ${this.state.craftSignature}`, { weight: 600 });
    f.text("開始画面で確定した名前です。変更できません。", { color: CANVAS_THEME.muted, size: 12 });
  }

  /** CI: the visible circuits; choosing one selects it (existing `selectCircuit`) and opens its detail. */
  private drawCircuitList(f: Flow): void {
    const s = this.state;
    const list = hubVisibleCircuits(s.hub);
    const brief = formatCircuitHubBrief(list, s.lastCircuit);
    const byId = new Map(brief.lines.map((l) => [l.circuitId, l]));
    if (list.length === 0) { f.text("回路なし", { color: CANVAS_THEME.muted }); return; }
    for (const ci of list) {
      const line = byId.get(ci.circuitId);
      const selected = s.lastCircuit?.circuitId === ci.circuitId;
      f.buttons([{
        id: `dock:circuit:${ci.circuitId}:select`, label: `${ci.circuitId}${isCircuitLocked(ci) ? "（完璧）" : ""}`, w: f.w, variant: selected ? "primary" : "normal",
        sub: `${circuitKindPrefix(ci)}${circuitRestoreStateLabelJa(ci.restoreState)} · ${line?.effectJa ?? "効果 —"}${ci.equippedTo ? ` · 装備: ${ci.equippedTo}` : ""}`,
        onActivate: () => { this.act("select-circuit", { act: "select-circuit", id: ci.circuitId }, (st) => selectCircuit(st, ci.circuitId)); this.openPalette("CD"); },
      }], { h: 56 });
      f.gap(6);
    }
  }
  private selectedCircuit(): HubCircuitRecord | null {
    const id = this.state.lastCircuit?.circuitId;
    return id ? hubVisibleCircuits(this.state.hub).find((c) => c.circuitId === id) ?? null : null;
  }
  /** CD: the selected circuit and its next operations (RESTORE / 装備 / 取り外し / 売却). */
  private drawCircuitDetail(f: Flow): void {
    const ci = this.selectedCircuit();
    if (!ci) { f.text("回路が選ばれていません。所持回路から選んでください。", { color: CANVAS_THEME.muted }); return; }
    const line = formatCircuitHubBrief(hubVisibleCircuits(this.state.hub), this.state.lastCircuit).lines.find((l) => l.circuitId === ci.circuitId);
    const effect = line?.effect ?? 0;
    const price = formatCircuitSellPriceJa(effect, { perfectSide: circuitSellPerfectSide(ci) });
    const locked = isCircuitLocked(ci);
    const editor = ci.lastEditorName ?? ci.circuitBoard.lastEditorName ?? "—";
    f.card(`circuit:${ci.circuitId}`, (r) => {
      r.text(`${ci.circuitId}${locked ? "（完璧·編集不可）" : ""}`, { weight: 700, size: 14 });
      r.text(`${circuitRestoreStateLabelJa(ci.restoreState)} · 刻印 ${editor}${ci.equippedTo ? ` · 装備: ${ci.equippedTo}` : ""}`, { color: CANVAS_THEME.muted, size: 12 });
      r.text(`${circuitKindPrefix(ci).replace("・", " — ")}${line?.effectJa ?? `効果 ${effect}`}`, { weight: 600 });
      r.text(`売却 仮 ${price.total}c（${price.detailJa}）`, { color: CANVAS_THEME.muted, size: 12 });
    }).gap(10);
    this.choices(f, [
      { to: "CD", id: `dock:circuit:${ci.circuitId}:open`, label: locked ? CTA_COPY.view : CTA_COPY.toRestore, sub: "RESTORE", run: () => { if (!playLogBlocked()) this.env.navigate(buildRestoreUrl(this.state, ci.circuitId)); } },
      { to: "EQ", label: "装備", run: () => { this.equipCircuit = ci.circuitId; this.openPalette("EQ"); } },
      { to: "CU", label: "取り外し", disabled: !ci.equippedTo },
      { to: "CS", label: "売却" },
    ]);
  }
  /** CS: sell circuits (existing confirm). From 回路詳細, the selected circuit comes first. */
  private drawCircuitSell(f: Flow): void {
    const s = this.state;
    const list = [...hubVisibleCircuits(s.hub)];
    const sel = this.nav.parent === "CD" ? s.lastCircuit?.circuitId : null;
    if (sel) list.sort((a, b) => (a.circuitId === sel ? -1 : b.circuitId === sel ? 1 : 0));
    const brief = formatCircuitHubBrief(list, s.lastCircuit);
    const byId = new Map(brief.lines.map((l) => [l.circuitId, l]));
    f.text(`売却 仮 = 最低${CIRCUIT_SELL_BASE_CREDITS}c + 出来栄え（有効値×${CIRCUIT_SELL_CREDITS_PER_EFFECT}c）。`, { color: CANVAS_THEME.muted, size: 12 }).gap(6);
    if (list.length === 0) { f.text("回路なし", { color: CANVAS_THEME.muted }); return; }
    for (const ci of list) {
      const effect = byId.get(ci.circuitId)?.effect ?? 0;
      const price = formatCircuitSellPriceJa(effect, { perfectSide: circuitSellPerfectSide(ci) });
      f.buttons([{ id: `dock:circuit:${ci.circuitId}:sell`, label: `${ci.circuitId}　${price.buttonJa}`, sub: `${circuitKindPrefix(ci)}${byId.get(ci.circuitId)?.effectJa ?? `効果 ${effect}`}${ci.equippedTo ? ` · 装備: ${ci.equippedTo}` : ""}`, variant: ci.circuitId === sel ? "primary" : "normal", w: f.w, onActivate: () => this.ask({
        id: "dock:confirm:circuit", title: "回路の売却", okLabel: "売却する", okVariant: "danger",
        text: `回路を売却しますか？\n${ci.circuitId}\n仮 +${price.total}c${price.detailJa ? `\n${price.detailJa}` : ""}${ci.equippedTo ? `\n装備: ${ci.equippedTo} から外して売却します` : ""}`,
        onOk: () => this.act("sell-circuit", { act: "sell-circuit", id: ci.circuitId }, (st) => sellCircuit(st, ci.circuitId)),
      }) }], { h: 56 });
      f.gap(6);
    }
  }
  /** CU: unequip (existing free, HUB only). */
  private drawUnequip(f: Flow): void {
    const hub = this.state.hub;
    const equipped = hubVisibleCircuits(hub).filter((c) => c.equippedTo != null);
    f.text("HUBでのみ付け替え可能。装備・取り外しは無料です。", { color: CANVAS_THEME.muted, size: 12 }).gap(6);
    if (equipped.length === 0) { f.text("装備中の回路はありません。", { color: CANVAS_THEME.muted }); return; }
    for (const ci of equipped) {
      const m = hub.fleet.find((x) => x.instanceId === ci.equippedTo);
      f.buttons([{ id: `dock:unequip:${ci.circuitId}`, label: `${ci.circuitId} を取り外す`, sub: `${circuitKindPrefix(ci)}${circuitRestoreStateLabelJa(ci.restoreState)} · ${m ? m.catalogId : ci.equippedTo}`, w: f.w, onActivate: () => this.equip("unequip", ci.circuitId, ci.equippedTo ?? null) }], { h: 56 });
      f.gap(6);
    }
  }

  /** EQ: which circuit on which mech (equip). Unequip is its own palette (CU). */
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
    f.text("HUBでのみ付け替え可能。装備・取り外しは無料です。", { color: CANVAS_THEME.muted, size: 12 });
    f.gap(6);
    if (circuits.length === 0) f.text("回路がありません。", { color: CANVAS_THEME.muted });
    else if (fleet.length === 0) f.text("装備先の機体がありません。", { color: CANVAS_THEME.muted });
    else {
      f.buttons([
        { id: "dock:equip:circuit", label: `回路: ${cid}`, sub: cRec ? `${circuitKindPrefix(cRec)}${circuitRestoreStateLabelJa(cRec.restoreState)} — ${cRec.equippedTo ? `装備: ${cRec.equippedTo}` : "倉庫"}` : undefined, w: f.w, onActivate: () => {
          this.picker = { id: "dock:pick:circuit", title: "回路を選ぶ", options: circuits.map((x) => ({ key: x.circuitId, label: x.circuitId, sub: `${circuitKindPrefix(x)}${circuitRestoreStateLabelJa(x.restoreState)} — ${x.equippedTo ? `装備: ${x.equippedTo}` : "倉庫"}`, selected: x.circuitId === cid })), onPick: (k) => { this.equipCircuit = k; this.picker = null; }, onCancel: () => { this.picker = null; } };
        } },
        { id: "dock:equip:mech", label: `機体: ${mRec ? mRec.catalogId : "—"}`, sub: mid ?? undefined, w: f.w, onActivate: () => {
          this.picker = { id: "dock:pick:mech", title: "機体を選ぶ", options: fleet.map((m) => ({ key: m.instanceId, label: m.catalogId, sub: m.instanceId, selected: m.instanceId === mid })), onPick: (k) => { this.equipMech = k; this.picker = null; }, onCancel: () => { this.picker = null; } };
        } },
      ]).gap(6);
      f.buttons([{ id: "dock:equip:equip", label: "装備", variant: "primary", w: f.w, onActivate: () => this.equip("equip", cid, mid) }]).gap(8);
    }
    // CANVAS-G8 (神宮決定 2026-11-08): the status list and shield explanations are 装備状況 (EQS).
    const equipped = circuits.filter((x) => x.equippedTo != null);
    f.gap(8);
    this.choices(f, [{ to: "EQS", label: "装備状況", sub: `${equipped.length}枚装備中 · 出撃部隊の回路 ${squadCircuitUsage(hub, resolveSortieSelection(hub))}/${squadCircuitLimit(hub)}枚` }]);
    if (equipped.length) f.gap(8).buttons([{ id: "dock:nav:CU", label: "取り外す →", w: f.w, onActivate: () => this.openPalette("CU") }]);
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

  /** CC: circuit creation from junk and credits. */
  private drawCraft(f: Flow): void {
    const hub = backfillPerfectMaxSize(normalizeHubSnapshot(this.state.hub));
    const options = junkCraftOptions(hub, RESTORE_MAX_SIDE);
    const firstEnabled = options.find((o) => o.enabled) ?? null;
    if (this.craftSide != null && !options.find((o) => o.side === this.craftSide)?.enabled) this.craftSide = null;
    const side = this.craftSide ?? firstEnabled?.side ?? null;
    const opt = options.find((o) => o.side === side);
    const cap = junkCraftMaxSide(hub);
    const optLabel = (o: (typeof options)[number]) => `${o.side}×${o.side}（ジャンク${o.junk}・${o.credits}c${o.reason === "over_cap" ? "・未解放" : o.reason === "no_junk" ? "・ジャンク不足" : o.reason === "no_credits" ? "・クレジット不足" : ""}）`;
    f.text(`ジャンクとクレジットで N×N の回路を1枚作成します（最大 ${cap}×${cap}。パーフェクトで直した最大サイズ＋1）。`, { color: CANVAS_THEME.muted, size: 12 });
    f.kv(`ジャンク：${heldJunk(hub)} · ${Math.max(0, Math.floor(hub.credits))}c`, "").gap(4);
    f.buttons([
      { id: "dock:craft:size", label: opt ? optLabel(opt) : "作成できるサイズがありません", w: f.w, disabled: !firstEnabled, onActivate: () => {
        this.picker = { id: "dock:pick:size", title: "回路サイズ", options: options.map((o) => ({ key: String(o.side), label: optLabel(o), disabled: !o.enabled, selected: o.side === side })), onPick: (k) => { this.craftSide = Number(k); this.picker = null; }, onCancel: () => { this.picker = null; } };
      } },
    ]).gap(6);
    f.buttons([{ id: "dock:craft:go", label: "回路を作成", variant: "primary", w: f.w, disabled: !opt?.enabled, onActivate: () => { if (side != null) this.craft(side); } }]);
  }
  /** CB: the existing random used circuit purchase. */
  private drawCircuitBuy(f: Flow): void {
    const hub = backfillPerfectMaxSize(normalizeHubSnapshot(this.state.hub));
    const pcap = purchaseMaxSide(hub);
    f.text(`2×2〜${pcap}×${pcap} のランダムな中古回路を1枚購入します。`, { color: CANVAS_THEME.muted, size: 12 });
    f.text(`所持金 ${Math.max(0, Math.floor(hub.credits)).toLocaleString("en-US")}c`, { color: CANVAS_THEME.muted, size: 12 }).gap(6);
    const can = hub.credits >= CIRCUIT_PURCHASE_PRICE;
    f.buttons([{ id: "dock:craft:buy", label: `回路を購入 · ${CIRCUIT_PURCHASE_PRICE}c`, variant: "primary", w: f.w, disabled: !can, onActivate: () => this.buyCircuit() }]);
    if (!can) f.gap(4).text("クレジットが足りません。", { color: CANVAS_THEME.muted, size: 12 });
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

  /** Debug mode only: the test tools are in the HTML debug area under the canvas (神宮決定 2026-11-06). */
  private drawDebug(f: Flow): void {
    if (!this.env.debug) return;
    f.gap(8).text("検証用（開発版だけ）：シード・デモ操作・デモ初期化・プレイ記録・Alpha Lab は canvas の下の欄。", { color: CANVAS_THEME.muted, size: 12 }).gap(4);
    f.buttons([{ id: "dock:debug:open", label: "検証用の欄へ ▼", w: f.w, onActivate: () => this.env.openDebug?.() }]);
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
