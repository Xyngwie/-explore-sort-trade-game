/**
 * Command-unlock MODE switch — the ONE place that decides preview vs release.
 *
 * Build flag: `VITE_EXPLORE_RELEASE_LOCKS` (Vite env, read ONLY here).
 *   - unset / anything else → false (default: preview / playtest build)
 *   - "1" or "true"          → release build: always "release" mode, debug toggle hidden
 *
 * Preview builds (GitHub Pages today) default to "all_unlocked" and expose a
 * DEBUG toggle whose choice is persisted in localStorage under
 * `COMMAND_UNLOCK_MODE_STORAGE_KEY`. This is a local debug setting, NOT part of
 * HubSave / handoff contracts.
 */
import type { CommandUnlockMode } from "./commandUnlock";

export const COMMAND_UNLOCK_MODE_STORAGE_KEY = "estg.explore.debugCommandUnlockMode";

export function parseReleaseLocksFlag(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true";
}

function readBuildFlag(): unknown {
  try {
    // Vite statically replaces import.meta.env at build time; under tsx/node it is undefined.
    return import.meta.env?.VITE_EXPLORE_RELEASE_LOCKS;
  } catch {
    return undefined;
  }
}

/** Single source of truth for "is this a release build that always locks". */
export const EXPLORE_RELEASE_LOCKS: boolean = parseReleaseLocksFlag(readBuildFlag());

type Store = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): Store | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Debug toggle is shown only on non-release builds. */
export function isDebugUnlockToggleVisible(
  releaseLocks: boolean = EXPLORE_RELEASE_LOCKS,
): boolean {
  return !releaseLocks;
}

/** Stored debug choice (preview builds only). Unknown / missing → all_unlocked. */
export function readDebugCommandUnlockMode(store?: Pick<Storage, "getItem"> | null): CommandUnlockMode {
  const s = store === undefined ? defaultStore() : store;
  if (!s) return "all_unlocked";
  try {
    return s.getItem(COMMAND_UNLOCK_MODE_STORAGE_KEY) === "release"
      ? "release"
      : "all_unlocked";
  } catch {
    return "all_unlocked";
  }
}

export function writeDebugCommandUnlockMode(
  mode: CommandUnlockMode,
  store?: Pick<Storage, "setItem"> | null,
): void {
  const s = store === undefined ? defaultStore() : store;
  if (!s) return;
  try {
    s.setItem(COMMAND_UNLOCK_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Active mode for a new sortie / world.
 * Release build → always "release" (debug storage ignored).
 * Preview build → debug choice, default "all_unlocked".
 */
export function resolveCommandUnlockMode(opts?: {
  releaseLocks?: boolean;
  store?: Pick<Storage, "getItem"> | null;
}): CommandUnlockMode {
  const release = opts?.releaseLocks ?? EXPLORE_RELEASE_LOCKS;
  if (release) return "release";
  return readDebugCommandUnlockMode(opts?.store);
}

export const COMMAND_UNLOCK_MODE_LABEL: Record<CommandUnlockMode, string> = {
  all_unlocked: "全コマンド解放（プレイテスト）",
  release: "リリース相当（回路なし＝基本4のみ）",
};
