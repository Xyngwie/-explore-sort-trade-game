/**
 * Invade ↔ HubSave.frontProgress bridge (load on enter, save after opens/flags).
 * Additive only — never clobbers unrelated hub fields.
 */

import {
  INITIAL_HUB,
  clearFrontProgressInHub,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  saveHubSaveToLocalStorage,
  setFrontProgressInHub,
  type FrontCellCoord,
  type HubSnapshot,
  type InvadeFrontProgress,
} from "@estg/shared";
import {
  AOI_HALF,
  captureFrontProgress,
  generateBoard,
  randomBoardSeed,
  restoreBoardFromProgress,
  type MsBoard,
} from "./board";

export type FrontSession = {
  board: MsBoard;
  focus: FrontCellCoord | null;
  /** True when restored from HubSave.frontProgress. */
  restored: boolean;
};

function readHub(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): HubSnapshot {
  const loaded = loadHubSaveFromLocalStorage(storage ?? undefined);
  return loaded?.hub
    ? normalizeHubSnapshot(loaded.hub)
    : normalizeHubSnapshot(INITIAL_HUB);
}

/** Load front board from HubSave, or generate a seeded board and persist it. */
export function loadOrCreateFrontSession(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): FrontSession {
  const hub = readHub(storage);
  const progress = hub.frontProgress;
  if (progress) {
    const restored = restoreBoardFromProgress(progress, AOI_HALF);
    if (restored) {
      return {
        board: restored.board,
        // null focus = quick-battle skip (persisted intentionally)
        focus: restored.focus,
        restored: true,
      };
    }
  }

  const seed = randomBoardSeed();
  const board = generateBoard(AOI_HALF, seed);
  const focus: FrontCellCoord = { sx: 0, sy: 0 };
  persistFrontSession(board, focus, storage);
  return { board, focus, restored: false };
}

/** Write current board+focus into HubSave.frontProgress (merge with hub). */
export function persistFrontSession(
  board: MsBoard,
  focus: FrontCellCoord | null,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): boolean {
  const snap = captureFrontProgress(board, focus);
  if (!snap) return false;
  const hub = readHub(storage);
  const next = setFrontProgressInHub(hub, snap);
  return saveHubSaveToLocalStorage(next, storage ?? undefined);
}

/** Clear front progress after regenerate-board (keeps rest of hub). */
export function clearPersistedFrontProgress(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): boolean {
  const hub = readHub(storage);
  const next = clearFrontProgressInHub(hub);
  return saveHubSaveToLocalStorage(next, storage ?? undefined);
}

/** Regenerate with a fresh seed and persist (replaces prior progress). */
export function regenerateFrontSession(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): FrontSession {
  const seed = randomBoardSeed();
  const board = generateBoard(AOI_HALF, seed);
  const focus: FrontCellCoord = { sx: 0, sy: 0 };
  persistFrontSession(board, focus, storage);
  return { board, focus, restored: false };
}

export type { InvadeFrontProgress };
