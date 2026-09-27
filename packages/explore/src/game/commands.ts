/**
 * Execution-side gate for player-issued Explore commands.
 * Every discrete command (buttons AND keyboard) goes through
 * `executeExploreCommand`, which consults `isCommandUnlockedFor` before running.
 * Continuous basic inputs (move / fire / collect) stay in tickWorld; they are
 * basic tier and therefore always unlocked.
 */
import {
  applyOrder,
  applyOrderToAllWingmen,
  pickUpFromCamp,
  purgeCargo,
  pushLog,
  rallyWingman,
  scatterSearch,
  setCampOrDeposit,
  unloadAtCamp,
} from "./orders";
import { requestExtract } from "./sim";
import {
  isCommandUnlockedFor,
  lockedCommandMessage,
  type ExploreCommandId,
} from "./commandUnlock";
import type { Stance, World } from "./types";

export type WingOrderCommandId =
  | "wing_escort"
  | "wing_patrol"
  | "wing_recover"
  | "wing_raid";

export const WING_COMMAND_FOR_STANCE: Record<Stance, WingOrderCommandId> = {
  escort: "wing_escort",
  patrol: "wing_patrol",
  recover: "wing_recover",
  raid: "wing_raid",
};

const STANCE_FOR_WING_COMMAND: Record<WingOrderCommandId, Stance> = {
  wing_escort: "escort",
  wing_patrol: "patrol",
  wing_recover: "recover",
  wing_raid: "raid",
};

export type ExploreCommandRequest =
  | { id: "extract" }
  | { id: "abort" }
  | { id: "camp_set" }
  | { id: "camp_unload" }
  | { id: "camp_pickup" }
  | { id: "purge" }
  | { id: "scatter_search" }
  | {
      id: WingOrderCommandId;
      /** Target wingman; omit → all living wingmen (squad bar / keys 1–4). */
      wingId?: string;
      /** 召還 button (escort via rallyWingman). */
      rally?: boolean;
    };

export type ExploreCommandOutcome =
  | { status: "locked"; id: ExploreCommandId }
  | { status: "done"; id: ExploreCommandId; result: string | number | boolean };

/** 撤退 — same state change the sortie 撤退 button always performed. */
export function abortSortie(world: World): "aborted" {
  world.phase = "result";
  world.extracted = false;
  world.failReason = null;
  world.salvaged = 0;
  world.boarding = null;
  world.camp = null;
  return "aborted";
}

export function isExploreCommandAvailable(world: World, id: ExploreCommandId): boolean {
  return isCommandUnlockedFor(world, id);
}

function denyLocked(world: World, id: ExploreCommandId): ExploreCommandOutcome {
  const msg = lockedCommandMessage(id);
  // Avoid flooding the log on key repeat.
  if (world.logs[0]?.text !== msg) pushLog(world, msg);
  return { status: "locked", id };
}

export function executeExploreCommand(
  world: World,
  req: ExploreCommandRequest,
): ExploreCommandOutcome {
  const id = req.id;
  if (!isCommandUnlockedFor(world, id)) return denyLocked(world, id);
  switch (req.id) {
    case "extract":
      return { status: "done", id, result: requestExtract(world) };
    case "abort":
      return { status: "done", id, result: abortSortie(world) };
    case "camp_set":
      return { status: "done", id, result: setCampOrDeposit(world) };
    case "camp_unload":
      return { status: "done", id, result: unloadAtCamp(world) };
    case "camp_pickup":
      return { status: "done", id, result: pickUpFromCamp(world) };
    case "purge":
      return { status: "done", id, result: purgeCargo(world) };
    case "scatter_search":
      return { status: "done", id, result: scatterSearch(world) };
    case "wing_escort":
    case "wing_patrol":
    case "wing_recover":
    case "wing_raid": {
      const stance = STANCE_FOR_WING_COMMAND[req.id];
      if (req.wingId == null) {
        return { status: "done", id, result: applyOrderToAllWingmen(world, stance) };
      }
      const wing = world.wingmen.find((w) => w.id === req.wingId);
      if (!wing) return { status: "done", id, result: "denied" };
      const result =
        req.rally === true ? rallyWingman(world, wing) : applyOrder(world, wing, stance);
      return { status: "done", id, result };
    }
  }
}

/** Keyboard → command request (lowercase `KeyboardEvent.key`). Basic continuous keys are not here. */
export function commandRequestForKey(key: string): ExploreCommandRequest | null {
  switch (key) {
    case "x":
      return { id: "extract" };
    case "c":
      return { id: "camp_set" };
    case "u":
      return { id: "camp_unload" };
    case "g":
      return { id: "camp_pickup" };
    case "p":
      return { id: "purge" };
    case "1":
      return { id: "wing_escort" };
    case "2":
      return { id: "wing_patrol" };
    case "3":
      return { id: "wing_recover" };
    case "4":
      return { id: "wing_raid" };
    default:
      return null;
  }
}

const SQUAD_KEYS = new Set(["1", "2", "3", "4"]);

/**
 * Key-input execution path used by main.ts keydown.
 * Returns null when the key is not a sortie command (or ignored, e.g. squad key repeat).
 */
export function dispatchExploreKey(
  world: World,
  key: string,
  opts?: { repeat?: boolean },
): ExploreCommandOutcome | null {
  if (world.phase !== "sortie") return null;
  const req = commandRequestForKey(key);
  if (!req) return null;
  if (opts?.repeat === true && SQUAD_KEYS.has(key)) return null;
  return executeExploreCommand(world, req);
}
