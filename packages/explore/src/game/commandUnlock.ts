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
  | "wing_raid";

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
  /**
   * Equipped circuit keys for this sortie. No source feeds this yet
   * (HubSave has no "equipped" concept; wiring it needs an approved
   * optional handoff field) → always [] in the live game.
   */
  equippedCircuits: string[];
  /** Test-only / provisional table override. Omit in production. */
  table?: CircuitCommandUnlockTable;
};

export function defaultCommandUnlockState(
  mode: CommandUnlockMode = "all_unlocked",
): CommandUnlockState {
  return { mode, equippedCircuits: [] };
}

/** Unlock check against an explore World-ish holder (missing state → all_unlocked, legacy behavior). */
export function isCommandUnlockedFor(
  holder: { commandUnlock?: CommandUnlockState | null },
  commandId: ExploreCommandId,
): boolean {
  const st = holder.commandUnlock;
  if (!st) return true;
  return isCommandUnlocked(commandId, st.equippedCircuits, {
    mode: st.mode,
    table: st.table,
  });
}

/** JA lock message used in logs / tooltips. */
export function lockedCommandMessage(commandId: ExploreCommandId): string {
  return `🔒 ${commandDef(commandId).label}：回路未装備のためロック中（基本の 移動・射撃・回収・帰還 は常時可）。`;
}

/**
 * Future hook shape (NOT enforced anywhere yet): wingman accompaniment will
 * need a wingman circuit. Kept separate from command ids so current sorties
 * keep deploying wingmen exactly as before. Always true in all_unlocked.
 */
export const WINGMAN_ACCOMPANY_HOOK_KEY = "wingman_accompany";
export function isWingmanAccompanyUnlocked(
  _equippedCircuits: readonly string[] | null | undefined,
  _opts: CommandUnlockOptions = {},
): boolean {
  // Hook only: returns true until the wingman-circuit task defines the rule.
  return true;
}
