/**
 * U-5b helpers for the canvas 探索 scene (docs/CANVAS_UNIFIED_V0.md §14.5):
 * the existing page's wing-card status, shortcut rows, sortie help line and
 * log feed, without the DOM. Read only: nothing here writes the world or saves.
 */
import type { LogLine, Stance, World } from "../game/types";
import type { LogRow } from "../ui/logPanel";
import { repairSummary } from "../ui/logPanel";
import { subscribeLogFeed } from "../game/logFeed";
import { isWingmanOffscreen } from "../game/sim";
import { isWingmanMobileFor, type ExploreCommandId } from "../game/commandUnlock";
import { STANCE_LABEL } from "../game/types";
import { EXPLORE_SHORTCUTS } from "../game/keyboardOverlay";
import { isCampUnlocked, timeUpHelpSentence } from "../game/campVisibility";
import { WING_COMMAND_FOR_STANCE } from "../game/commands";
import type { HubSnapshot } from "@estg/shared";

type Locked = (id: ExploreCommandId, wingId?: string) => boolean;

export type WingStatus = { tone: "" | "danger" | "combat" | "warn"; badge: string; offscreen: boolean };
/** Existing main.ts `wingCombatStatus` (badge text and its colour class). */
export function wingStatus(world: World, w: World["wingmen"][number]): WingStatus {
  if (!w.alive) return { tone: "", badge: "撃破", offscreen: false };
  const off = world.phase === "sortie" && isWingmanOffscreen(world, w);
  if (w.hitWarnT > 0) return { tone: "danger", badge: off ? "画面外·被弾警告" : "被弾警告", offscreen: off };
  if (w.engageWarnT > 0) return { tone: "combat", badge: off ? "画面外·交戦中" : "交戦中", offscreen: off };
  if (off) return { tone: "warn", badge: "画面外", offscreen: true };
  if (!isWingmanMobileFor(world, w.id)) return { tone: "warn", badge: "自衛のみ", offscreen: false };
  return { tone: "", badge: STANCE_LABEL[w.stance], offscreen: false };
}

export const SQUAD_ORDER_KEYS: ReadonlyArray<{ stance: Stance; key: string }> = [
  { stance: "escort", key: "1" },
  { stance: "patrol", key: "2" },
  { stance: "recover", key: "3" },
  { stance: "raid", key: "4" },
];

/** Existing shortcut overlay rows (C20-a: all-locked rows dropped, partly locked rows list the open keys). */
export function shortcutRows(isLocked: Locked): Array<{ keys: string[]; label: string }> {
  const out: Array<{ keys: string[]; label: string }> = [];
  for (const row of EXPLORE_SHORTCUTS) {
    let keys = [...row.keys];
    if (row.commands != null && row.commands.length > 0) {
      const open = row.commands.map((id) => !isLocked(id));
      if (open.every((o) => !o)) continue;
      if (row.commandKeys != null && open.some((o) => !o)) keys = row.commandKeys.filter((_, i) => open[i]);
    }
    out.push({ keys, label: row.label });
  }
  return out;
}

/** Existing help line under the map (only unlocked commands). */
export function sortieHelpText(isLocked: Locked): string {
  const keyItems: Array<[ExploreCommandId | null, string]> = [
    ["camp_set", "C キャンプ"],
    ["camp_unload", "U 小隊荷下ろし"],
    ["purge", "P パージ"],
    ["camp_pickup", "G 取り上げ"],
    [null, "V カバー"],
  ];
  const keys = keyItems.filter(([id]) => id == null || !isLocked(id)).map(([, t]) => t).join("・");
  const squadKeys = SQUAD_ORDER_KEYS.filter(({ stance }) => !isLocked(WING_COMMAND_FOR_STANCE[stance])).map(({ key }) => key);
  const squad = squadKeys.length === 0 ? "" : `僚機方針は ${squadKeys.length === SQUAD_ORDER_KEYS.length ? "1–4" : squadKeys.join("・")}。`;
  return `未発見コンテナは非表示。発見後に黄四角。敵撃破ドロップは発光＋DROP 表示。積載の上限は 2（コンテナ 1・残骸 2）。積むほど遅くなる。${keys}。${timeUpHelpSentence(isCampUnlocked(isLocked))}マップ上端の帰還 HUD。${squad}僚機に軽い癖（密着／囮／遠射）。`;
}

/** Repair rows from HubSave (existing `freshHub` cache). */
export function repairRowsOf(hub: HubSnapshot | null): LogRow[] {
  return (hub?.fieldObjectIdentities?.repairLogs ?? []).map((repair, index) => ({
    key: `repair:${index}:${repair.at}`, kind: "repair", text: repairSummary(repair), repair,
  }));
}

/**
 * The existing `paintLogPanel` feed without the DOM list: rows are appended in
 * the same order with the same keys; `follow` / `unread` follow the existing
 * rules (new rows while scrolled up count as unread).
 */
export class CanvasLogFeed {
  rows: LogRow[] = [];
  follow = true;
  unread = 0;
  private seen = new Set<string>();
  private world: World | null = null;
  private stop: (() => void) | null = null;
  private pending: LogLine[] = [];
  private keys = new WeakMap<LogLine, string>();
  private nextKey = 1;
  private paintedRepair: LogRow[] | null = null;

  /** Returns how many rows were added. */
  update(world: World, repairRows: LogRow[]): number {
    if (this.world !== world) {
      this.stop?.(); this.world = world; this.pending = []; this.paintedRepair = null;
      this.rows = []; this.seen.clear(); this.follow = true; this.unread = 0;
      this.stop = subscribeLogFeed(world, (line) => this.pending.push(line));
    }
    const arrivals = this.pending; this.pending = [];
    const queued = new Set(arrivals);
    const lines = [...world.logs].reverse().filter((l) => !queued.has(l)).concat(arrivals);
    const incoming: LogRow[] = this.paintedRepair === repairRows ? [] : [...repairRows];
    this.paintedRepair = repairRows;
    for (const line of lines) {
      let key = this.keys.get(line);
      if (!key) { key = `combat:${this.nextKey++}`; this.keys.set(line, key); }
      incoming.push({ key, text: line.text, kind: line.kind });
    }
    let added = 0;
    for (const r of incoming) {
      if (this.seen.has(r.key)) continue;
      this.seen.add(r.key); this.rows.push(r); added++;
    }
    if (added && !this.follow) this.unread += added;
    return added;
  }
  dispose(): void { this.stop?.(); this.stop = null; this.world = null; }
}
