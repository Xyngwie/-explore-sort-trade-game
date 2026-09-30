import { circuitsForUnit, type EquippedByUnit } from "./circuitJudgement";
/**
 * Circuit-based Explore command unlock — FOUNDATION ONLY.
 *
 * - Basic 4 (歩く / 戦う / 回収する / 帰還する) are always available.
 * - Other player-issued Explore commands are "circuit" tier: in release mode
 *   they need an equipped circuit whose unlock row lists them.
 * - The real circuit→command table is NOT decided yet (Phase 3). The production
 *   table below is intentionally empty; tests inject a provisional table.
 * - The active mode (all_unlocked vs release) comes from `unlockMode.ts`
 *   (single build flag + debug localStorage toggle). See docs/EXPLORE_COMMAND_UNLOCK_V0.md.
 *
 * This module is pure (no DOM / storage) so it is usable from sim, UI and tests.
 */

export type BasicCommandId = "move" | "fire" | "collect" | "extract" | "abort";

export type CircuitCommandId =
  | "camp_set"
  | "camp_unload"
  | "camp_pickup"
  | "purge"
  | "scatter_search"
  | "wing_escort"
  | "wing_patrol"
  | "wing_recover"
  | "wing_raid"
  /** Ability (not a player command): wingman may move (follow / stance movement / collect). */
  | "wing_mobility";

export type ExploreCommandId = BasicCommandId | CircuitCommandId;

export type CommandTier = "basic" | "circuit";

export type ExploreCommandDef = {
  id: ExploreCommandId;
  tier: CommandTier;
  /** Short JA label for UI / lock messages. */
  label: string;
  /** Keyboard keys (lowercase `KeyboardEvent.key`) that issue this command. */
  keys: readonly string[];
};

export const EXPLORE_COMMANDS: readonly ExploreCommandDef[] = [
  // Basic 4 — always on (captain can always walk / fight / collect / return).
  { id: "move", tier: "basic", label: "移動", keys: ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"] },
  { id: "fire", tier: "basic", label: "射撃", keys: [" ", "f"] },
  { id: "collect", tier: "basic", label: "回収", keys: ["e"] },
  { id: "extract", tier: "basic", label: "抽出要請", keys: ["x"] },
  { id: "abort", tier: "basic", label: "撤退", keys: [] },
  // Circuit tier — lock candidates (mapping decided later).
  { id: "camp_set", tier: "circuit", label: "キャンプ設置", keys: ["c"] },
  { id: "camp_unload", tier: "circuit", label: "小隊荷下ろし", keys: ["u"] },
  { id: "camp_pickup", tier: "circuit", label: "キャンプから積込", keys: ["g"] },
  { id: "purge", tier: "circuit", label: "パージ", keys: ["p"] },
  { id: "scatter_search", tier: "circuit", label: "散開捜索", keys: [] },
  { id: "wing_escort", tier: "circuit", label: "僚機 帯同／召還", keys: ["1"] },
  { id: "wing_patrol", tier: "circuit", label: "僚機 哨戒", keys: ["2"] },
  { id: "wing_recover", tier: "circuit", label: "僚機 回収", keys: ["3"] },
  { id: "wing_raid", tier: "circuit", label: "僚機 遊撃", keys: ["4"] },
  { id: "wing_mobility", tier: "circuit", label: "僚機 移動", keys: [] },
];

const DEF_BY_ID: ReadonlyMap<ExploreCommandId, ExploreCommandDef> = new Map(
  EXPLORE_COMMANDS.map((d) => [d.id, d]),
);

export const BASIC_COMMAND_IDS: readonly BasicCommandId[] = [
  "move",
  "fire",
  "collect",
  "extract",
  "abort",
];

export function commandDef(id: ExploreCommandId): ExploreCommandDef {
  return DEF_BY_ID.get(id)!;
}

export function isBasicCommand(id: ExploreCommandId): id is BasicCommandId {
  return DEF_BY_ID.get(id)?.tier === "basic";
}

/**
 * Circuit key (circuit id / tag) → commands it unlocks.
 * Keys are opaque strings so a later task can key by circuitId, outcome or a
 * dedicated circuit kind without changing this API.
 */
export type CircuitCommandUnlockTable = Readonly<
  Record<string, readonly CircuitCommandId[]>
>;

/**
 * Production mapping — intentionally EMPTY until the mapping task (Phase 3).
 * Do not add game-design rows here without an approved spec.
 */
export const CIRCUIT_COMMAND_UNLOCKS: CircuitCommandUnlockTable = Object.freeze({});

/**
 * all_unlocked: every command runs (current playtest behavior).
 * release: basic 4 always; circuit-tier only via equipped circuits + table.
 */
export type CommandUnlockMode = "all_unlocked" | "release";

export type CommandUnlockOptions = {
  mode?: CommandUnlockMode;
  table?: CircuitCommandUnlockTable;
};

/**
 * THE single unlock check. Pure.
 * Default mode is "release" (the rule itself); callers pass the active mode.
 */
export function isCommandUnlocked(
  commandId: ExploreCommandId,
  equippedCircuits: readonly string[] | null | undefined,
  opts: CommandUnlockOptions = {},
): boolean {
  const def = DEF_BY_ID.get(commandId);
  if (!def) return false;
  if (def.tier === "basic") return true;
  const mode = opts.mode ?? "release";
  if (mode === "all_unlocked") return true;
  const table = opts.table ?? CIRCUIT_COMMAND_UNLOCKS;
  if (!equippedCircuits || equippedCircuits.length === 0) return false;
  for (const circuit of equippedCircuits) {
    if (typeof circuit !== "string") continue;
    const row = Object.prototype.hasOwnProperty.call(table, circuit)
      ? table[circuit]
      : undefined;
    if (row && row.includes(commandId as CircuitCommandId)) return true;
  }
  return false;
}

/** Explore-local per-sortie unlock context stored on World (not a save contract). */
export type CommandUnlockState = {
  mode: CommandUnlockMode;
  /** Active circuit ids grouped by Explore unit id (leader / wing-a / wing-b). */
  equippedByUnit: EquippedByUnit;
  /** Test-only / provisional table override. Omit in production. */
  table?: CircuitCommandUnlockTable;
};

export function defaultCommandUnlockState(
  mode: CommandUnlockMode = "all_unlocked",
  equippedByUnit: EquippedByUnit = {},
): CommandUnlockState {
  return { mode, equippedByUnit };
}

function isWingCommand(commandId: ExploreCommandId): commandId is CircuitCommandId {
  return (
    commandId === "wing_escort" ||
    commandId === "wing_patrol" ||
    commandId === "wing_recover" ||
    commandId === "wing_raid" ||
    commandId === "wing_mobility"
  );
}

/**
 * Unlock check against an Explore World-ish holder.
 * - Captain commands use the leader's circuit list.
 * - Wing commands with a target use that wing's list.
 * - Squad-level wing commands are available when at least one live-target
 *   circuit list unlocks them; execution filters locked wingmen separately.
 * Missing command state preserves the legacy all-unlocked behavior.
 */
export function isCommandUnlockedFor(
  holder: { commandUnlock?: CommandUnlockState | null },
  commandId: ExploreCommandId,
  unitId?: string,
): boolean {
  const st = holder.commandUnlock;
  if (!st) return true;
  if (st.mode === "all_unlocked") return true;
  if (isWingCommand(commandId)) {
    if (unitId != null) {
      return isCommandUnlocked(commandId, circuitsForUnit(st.equippedByUnit, unitId), {
        mode: st.mode,
        table: st.table,
      });
    }
    return Object.values(st.equippedByUnit).some((circuits) =>
      isCommandUnlocked(commandId, circuits, { mode: st.mode, table: st.table }),
    );
  }
  return isCommandUnlocked(commandId, circuitsForUnit(st.equippedByUnit, "leader"), {
    mode: st.mode,
    table: st.table,
  });
}

/** JA lock message used in logs / tooltips. */
export function lockedCommandMessage(commandId: ExploreCommandId): string {
  return `🔒 ${commandDef(commandId).label}：回路未装備のためロック中（基本の 移動・射撃・回収・帰還 は常時可）。`;
}

/**
 * Wingman mobility (`wing_mobility`). Without it (release mode, no unlocking
 * circuit) a wingman still sorties but stands still and only fights in
 * self-defense (see brain.ts). Takes a wingman id so per-wingman circuits can be
 * supported later; today every wingman shares the sortie's equipped circuits.
 */
export function isWingmanMobilityUnlocked(
  _wingmanId: string,
  equippedCircuits: readonly string[] | null | undefined,
  opts: CommandUnlockOptions = {},
): boolean {
  return isCommandUnlocked("wing_mobility", equippedCircuits, opts);
}

/** World-level mobility check (missing unlock state → mobile, legacy behavior). */
export function isWingmanMobileFor(
  holder: { commandUnlock?: CommandUnlockState | null },
  wingmanId: string,
): boolean {
  const st = holder.commandUnlock;
  if (!st) return true;
  if (st.mode === "all_unlocked") return true;
  return isWingmanMobilityUnlocked(wingmanId, circuitsForUnit(st.equippedByUnit, wingmanId), {
    mode: st.mode,
    table: st.table,
  });
}

export const WINGMAN_IMMOBILE_LABEL = "回路なし：自衛のみ";
