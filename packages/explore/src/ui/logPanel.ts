import type { IdentityRepairLog } from "@estg/shared";
import { LogSelectionGuard } from "./logSelectionGuard";

export type LogRow = { key: string; text: string; kind: "tactical" | "battle" | "repair"; repair?: IdentityRepairLog };
type Anchor = { key: string; offset: number };
const repairNames = { counter: "カウンター修復", duplicate: "個体ID修復", source: "出自ID補完" };
export function repairSummary(log: IdentityRepairLog): string {
  const stamp = new Date(log.at).toLocaleString("ja-JP");
  return `${stamp} セーブ自動修復：${Object.entries(log.counts).filter(([, n]) => n > 0)
    .map(([kind, n]) => `${repairNames[kind as keyof typeof repairNames]} ${n}件`).join("・")}`;
}
export function repairDetails(log: IdentityRepairLog): string {
  return [`修復時刻（UTC）：${log.at}`, repairSummary(log), ...log.repairs.map(r =>
    `${repairNames[r.kind]}／対象：${r.target}\n変更前：${JSON.stringify(r.before)}\n変更後：${JSON.stringify(r.after)}`)].join("\n");
}
export function unreadLabel(count: number): string { return `新着ログ ${count >= 1000 ? "999+" : count}件`; }

/** Stable DOM rows: selection ranges survive new logs and regular HUD paints. */
export class LogPanel {
  readonly element = document.createElement("div");
  readonly list = document.createElement("ul");
  readonly tag = document.createElement("div");
  readonly unreadButton = document.createElement("button");
  readonly guard: LogSelectionGuard;
  private nodes = new Map<string, HTMLLIElement>();
  private rows = new Map<string, LogRow>();
  private follow = true;
  private unread = 0;
  private initialized = false;
  private anchor: Anchor | null = null;
  private resizeAnchor: Anchor | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private expectedScroll: number | null = null;
  private manualScrollIntent = false;
  private size = "";
  private attached = false;
  constructor(private notify: (text: string) => void) {
    this.element.id = "log-panel"; this.element.className = "card";
    const title = document.createElement("strong"); title.textContent = "戦術／戦報";
    this.list.id = "log-list"; this.list.className = "log"; this.list.tabIndex = 0;
    this.list.setAttribute("aria-label", "戦術／戦報ログ");
    this.unreadButton.type = "button"; this.unreadButton.className = "log-unread"; this.unreadButton.hidden = true;
    this.tag.className = "tactical enemy-tag"; this.tag.hidden = true;
    this.element.append(title, this.tag, this.list, this.unreadButton);
    this.guard = new LogSelectionGuard(this.list, selected => this.selectionChanged(selected));
    this.list.addEventListener("scroll", this.scrolled, { passive: true });
    this.list.addEventListener("wheel", () => { this.manualScrollIntent = true; }, { passive: true });
    this.list.addEventListener("pointerdown", () => { this.manualScrollIntent = true; }, { passive: true });
    this.unreadButton.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") e.stopPropagation();
    });
    this.list.addEventListener("click", e => {
      const row = (e.target as Element).closest<HTMLLIElement>("li[data-log-key]");
      if (row) void this.copy(row.dataset.logKey!);
    });
    this.list.addEventListener("keydown", e => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) this.manualScrollIntent = true;
      if (e.key !== "Enter" && e.key !== " ") return;
      const row = (e.target as HTMLElement).closest<HTMLLIElement>("li[data-log-key]");
      if (!row?.classList.contains("repair")) return;
      e.preventDefault(); e.stopPropagation();
      if (this.guard.selected()) { window.getSelection()?.removeAllRanges(); this.selectionChanged(false); return; }
      void this.copy(row.dataset.logKey!);
    });
    this.unreadButton.addEventListener("click", () => {
      this.cancelResize(); this.follow = true; this.unread = 0;
      this.toLatest(); this.paintUnread();
    });
    new ResizeObserver(() => this.resized()).observe(this.list);
  }
  reset(): void {
    this.cancelResize(); this.nodes.clear(); this.rows.clear(); this.list.replaceChildren();
    this.follow = true; this.unread = 0; this.initialized = false;
    this.anchor = null; this.expectedScroll = null; this.paintUnread();
  }
  /** Reuse this exact panel when main rebuilds other controls. */
  mount(placeholder: HTMLElement): void {
    placeholder.replaceWith(this.element); this.attached = true;
    if (this.follow) this.toLatest(); else if (this.anchor) this.restore(this.anchor);
  }
  update(rows: LogRow[]): void {
    let added = 0;
    for (const row of rows) {
      if (this.nodes.has(row.key)) continue;
      const li = document.createElement("li"); li.dataset.logKey = row.key;
      li.className = row.kind; li.textContent = row.text;
      if (row.repair) { li.tabIndex = 0; li.setAttribute("role", "button"); li.title = "タップで修復詳細をコピー"; }
      this.nodes.set(row.key, li); this.rows.set(row.key, row); this.list.append(li); added++;
    }
    if (this.initialized && added && (!this.follow || this.guard.selected())) this.unread += added;
    this.initialized = true;
    if (this.follow && !this.guard.selected()) { this.unread = 0; this.toLatest(); }
    this.paintUnread();
    if (!this.resizeTimer) this.anchor = this.capture();
  }
  private async copy(key: string): Promise<void> {
    const log = this.rows.get(key)?.repair;
    if (!log) return;
    try { await navigator.clipboard.writeText(repairDetails(log)); this.notify("修復詳細をコピーしました"); }
    catch { this.notify("コピーに失敗しました"); }
  }
  private paintUnread(): void {
    this.unreadButton.hidden = this.unread === 0;
    this.unreadButton.textContent = unreadLabel(this.unread);
  }
  private latestVisible(): boolean {
    const last = this.list.lastElementChild;
    if (!last) return true;
    const row = last.getBoundingClientRect(), panel = this.list.getBoundingClientRect();
    // Actual intersection with the latest ROW, never scrollHeight/pixel tolerance.
    return row.bottom > panel.top && row.top < panel.bottom;
  }
  private toLatest(): void {
    if (!this.element.isConnected) return;
    this.list.scrollTop = this.list.scrollHeight;
    this.expectedScroll = this.list.scrollTop;
    this.anchor = this.capture();
  }
  private capture(): Anchor | null {
    if (!this.element.isConnected) return this.anchor;
    const top = this.list.getBoundingClientRect().top;
    // Logs can exceed 999 rows; find the first visible row without measuring
    // every historical row during each HUD paint.
    let lo = 0, hi = this.list.children.length - 1, first = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.list.children[mid]!.getBoundingClientRect().bottom > top) { first = mid; hi = mid - 1; }
      else lo = mid + 1;
    }
    const li = first >= 0 ? this.list.children[first] as HTMLElement : null;
    return li ? { key: li.dataset.logKey!, offset: li.getBoundingClientRect().top - top } : null;
  }
  private restore(anchor: Anchor): void {
    const li = this.nodes.get(anchor.key);
    if (!li || !this.element.isConnected) return;
    this.list.scrollTop += li.getBoundingClientRect().top - this.list.getBoundingClientRect().top - anchor.offset;
    this.expectedScroll = this.list.scrollTop;
    this.anchor = this.capture();
  }
  private scrolled = (): void => {
    if (!this.element.isConnected) return;
    if (this.expectedScroll != null && Math.abs(this.list.scrollTop - this.expectedScroll) < .5) {
      this.expectedScroll = null; this.anchor = this.capture(); return;
    }
    this.expectedScroll = null;
    // Layout can clamp scrollTop during resize. That is not the user's Q156
    // scroll gesture and must not cancel the pending original-row restoration.
    if (this.resizeTimer && !this.manualScrollIntent) return;
    this.manualScrollIntent = false;
    this.cancelResize(); this.anchor = this.capture();
    if (!this.guard.selected()) {
      this.follow = this.latestVisible();
      if (this.follow) this.unread = 0;
    }
    this.paintUnread();
  };
  private selectionChanged(selected: boolean): void {
    this.cancelResize();
    if (selected) { this.follow = false; }
    this.anchor = this.capture();
    // Clearing selection alone never resumes auto-follow (Q142).
  }
  private cancelResize(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = null; this.resizeAnchor = null;
  }
  private resized(): void {
    if (!this.attached || !this.element.isConnected) return;
    const rect = this.list.getBoundingClientRect(), size = `${rect.width}:${rect.height}`;
    if (size === this.size) return;
    this.size = size;
    if (!this.resizeTimer) this.resizeAnchor = this.anchor;
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    if (this.follow && !this.guard.selected()) this.toLatest();
    this.resizeTimer = setTimeout(() => {
      const anchor = this.resizeAnchor; this.resizeTimer = null; this.resizeAnchor = null;
      if (this.follow && !this.guard.selected()) this.toLatest();
      else if (anchor) this.restore(anchor);
      this.anchor = this.capture();
    }, 100);
  }
}
