/**
 * One localStorage checkpoint on the same origin as HubSave. Not a HubSave field.
 *
 * Key: `estg.sortieCheckpoint`
 * Version: `v` = 1
 * Kinds: `sortie` (mid-sortie), `result` (operation result), `done` (finished mark only)
 * Temp key: `estg.sortieCheckpoint.tmp` — write staging only. Never read as a save.
 */
import { resolveModuleBaseUrl } from "./constants";

export const SORTIE_CHECKPOINT_KEY = "estg.sortieCheckpoint";
export const SORTIE_CHECKPOINT_TEMP_KEY = "estg.sortieCheckpoint.tmp";
export const SORTIE_CHECKPOINT_VERSION = 1;

/** Screen copy for a paused sortie. No other new copy. */
export const SORTIE_PAUSE_LABEL = "一時停止中 — タップで再開";

export const EXPLORE_SORTIE_BACK_TRAP = "estgExploreSortieBack";
export const SORT_BACK_TRAP = "estgSortBack";

export type SortieCheckpointKind = "sortie" | "result" | "done";

export type SortieCheckpointRecord =
  | { v: 1; kind: "sortie"; body: unknown }
  | { v: 1; kind: "result"; body: unknown }
  | { v: 1; kind: "done" };

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStore(): Store | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* private mode / no window */
  }
  return null;
}

function resolveStore(storage?: Store | null): Store | null {
  return storage === undefined ? defaultStore() : storage;
}

export type CheckpointRead =
  | { status: "absent" }
  | { status: "unreadable" }
  | { status: "ok"; record: SortieCheckpointRecord };

function parseRecord(raw: string): SortieCheckpointRecord | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const o = value as Record<string, unknown>;
    if (o.v !== SORTIE_CHECKPOINT_VERSION) return null;
    if (o.kind === "done") return { v: 1, kind: "done" };
    if ((o.kind === "sortie" || o.kind === "result") && "body" in o) {
      return { v: 1, kind: o.kind, body: o.body };
    }
    return null;
  } catch {
    return null;
  }
}

export function readSortieCheckpoint(storage?: Store | null): CheckpointRead {
  const store = resolveStore(storage);
  if (!store) return { status: "absent" };
  let raw: string | null;
  try {
    raw = store.getItem(SORTIE_CHECKPOINT_KEY);
  } catch {
    return { status: "unreadable" };
  }
  if (raw == null || raw === "") return { status: "absent" };
  const record = parseRecord(raw);
  if (!record) return { status: "unreadable" };
  return { status: "ok", record };
}

/** Drop the checkpoint and the staging key. Staging is not a second save. */
export function discardSortieCheckpoint(storage?: Store | null): void {
  const store = resolveStore(storage);
  if (!store) return;
  try {
    store.removeItem(SORTIE_CHECKPOINT_KEY);
  } catch {
    /* ignore */
  }
  try {
    store.removeItem(SORTIE_CHECKPOINT_TEMP_KEY);
  } catch {
    /* ignore */
  }
}

export function clearSortieCheckpoint(storage?: Store | null): void {
  discardSortieCheckpoint(storage);
}

/**
 * Write the temp key, read it back, then point the one checkpoint key at that
 * text. A cut before the pointer switches leaves the previous checkpoint.
 * The temp key is removed and is never treated as a save.
 */
export function writeSortieCheckpoint(
  record: SortieCheckpointRecord,
  storage?: Store | null,
): boolean {
  const store = resolveStore(storage);
  if (!store) return false;
  const json = JSON.stringify(record);
  try {
    store.setItem(SORTIE_CHECKPOINT_TEMP_KEY, json);
    const back = store.getItem(SORTIE_CHECKPOINT_TEMP_KEY);
    if (back !== json) {
      try {
        store.removeItem(SORTIE_CHECKPOINT_TEMP_KEY);
      } catch {
        /* ignore */
      }
      return false;
    }
    store.setItem(SORTIE_CHECKPOINT_KEY, back);
    try {
      store.removeItem(SORTIE_CHECKPOINT_TEMP_KEY);
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    try {
      store.removeItem(SORTIE_CHECKPOINT_TEMP_KEY);
    } catch {
      /* ignore */
    }
    return false;
  }
}

export function writeSortieSnapshot(
  kind: "sortie" | "result",
  body: unknown,
  storage?: Store | null,
): boolean {
  return writeSortieCheckpoint({ v: 1, kind, body }, storage);
}

export function writeSortieDoneMark(storage?: Store | null): boolean {
  return writeSortieCheckpoint({ v: 1, kind: "done" }, storage);
}

export function isSortieDoneMark(storage?: Store | null): boolean {
  const read = readSortieCheckpoint(storage);
  return read.status === "ok" && read.record.kind === "done";
}

/**
 * visibility hidden / pagehide. A done mark is not replaced by sortie or result.
 * While a sortie is in progress, a later hide may replace the same key with
 * the latest mid-sortie snapshot (or a result, once the phase is result).
 */
export function writeHideCheckpoint(
  kind: "sortie" | "result",
  body: unknown,
  storage?: Store | null,
): boolean {
  if (isSortieDoneMark(storage)) return false;
  return writeSortieSnapshot(kind, body, storage);
}

export type ExploreCheckpointBoot =
  | { action: "continue" }
  | { action: "hub" }
  | { action: "sortie"; body: unknown }
  | { action: "result"; body: unknown };

/** Absent key: sortie as before. Unreadable or done: hub. Result is not the hub. */
export function exploreBootFromCheckpoint(read: CheckpointRead): ExploreCheckpointBoot {
  if (read.status === "absent") return { action: "continue" };
  if (read.status === "unreadable") return { action: "hub" };
  if (read.record.kind === "done") return { action: "hub" };
  if (read.record.kind === "sortie") return { action: "sortie", body: read.record.body };
  return { action: "result", body: read.record.body };
}

export function exploreHubUrl(): string {
  return resolveModuleBaseUrl("trade");
}

export function checkpointKindOnHide(
  phase: "briefing" | "sortie" | "result",
  done: boolean,
): "sortie" | "result" | "none" {
  if (done) return "none";
  if (phase === "sortie") return "sortie";
  if (phase === "result") return "result";
  return "none";
}

/** The 180s clock runs only when the frame calls tickWorld. */
export function sortieFrameShouldTick(
  phase: "briefing" | "sortie" | "result",
  paused: boolean,
): boolean {
  return phase === "sortie" && !paused;
}

/** Visible again does not resume. A tap does. */
export function sortiePausedAfter(
  event: "hidden" | "visible" | "tap",
  paused: boolean,
): boolean {
  if (event === "hidden") return true;
  if (event === "tap") return false;
  return paused;
}

/** Back is swallowed only while Explore phase is sortie. Never writes 全機大破. */
export function exploreBackBlocked(phase: "briefing" | "sortie" | "result"): boolean {
  return phase === "sortie";
}

export function exploreBackAction(phase: "briefing" | "sortie" | "result"): {
  block: boolean;
  wipe: false;
} {
  return { block: exploreBackBlocked(phase), wipe: false };
}

/** Sort blocks back until the done mark exists. Never writes 全機大破. */
export function sortBackBlocked(storage?: Store | null): boolean {
  return !isSortieDoneMark(storage);
}

export function sortBackAction(storage?: Store | null): { block: boolean; wipe: false } {
  return { block: sortBackBlocked(storage), wipe: false };
}

/**
 * Container count 0: mark only after saved or already_applied.
 * salvagedContainers >= 1: Explore's own save does not mark.
 * no_save, write_refused, and any other status do not mark.
 */
export function shouldMarkDoneAfterExploreSave(
  salvagedContainers: number,
  status: string,
): boolean {
  if (Math.floor(Number(salvagedContainers) || 0) >= 1) return false;
  if (status === "no_save" || status === "write_refused" || status === "false") return false;
  return status === "saved" || status === "already_applied";
}

export function markDoneIfZeroContainersSaved(
  salvagedContainers: number,
  status: string,
  storage?: Store | null,
): boolean {
  if (!shouldMarkDoneAfterExploreSave(salvagedContainers, status)) return false;
  return writeSortieDoneMark(storage);
}

/**
 * Trade marks after a successful HubSave write that added unopened containers,
 * or that wrote importMaterials / yieldBag. A false write does not mark.
 */
export function shouldMarkDoneAfterTradeWrite(args: {
  saved: boolean;
  depositUnopenedContainers: number;
  importMaterials: number;
  yieldBag: boolean;
}): boolean {
  if (args.saved !== true) return false;
  if (Math.floor(Number(args.depositUnopenedContainers) || 0) >= 1) return true;
  if (Math.floor(Number(args.importMaterials) || 0) >= 1) return true;
  if (args.yieldBag) return true;
  return false;
}

export function pushHistoryTrap(
  historyLike: Pick<History, "state" | "pushState">,
  marker: string,
  href: string,
): boolean {
  const st = historyLike.state;
  if (st && typeof st === "object" && (st as Record<string, unknown>)[marker] === true) {
    return false;
  }
  historyLike.pushState({ [marker]: true }, "", href);
  return true;
}

export function historyTrapIsCurrent(
  historyLike: Pick<History, "state">,
  marker: string,
): boolean {
  const st = historyLike.state;
  return !!st && typeof st === "object" && (st as Record<string, unknown>)[marker] === true;
}
