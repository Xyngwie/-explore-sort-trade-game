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
import { lostMechsByCell, placeLostOnFront, type FrontPlacementResult } from "./lost-mechs";

export type FrontSession = {
  board: MsBoard;
  focus: FrontCellCoord | null;
  /** True when restored from HubSave.frontProgress. */
  restored: boolean;
  /** Left-behind mechs on this board per cell ("sx,sy" → instanceIds). */
  lostByCell: Map<string, string[]>;
  /** What was moved / placed onto this board (lost-mechs.ts). */
  placement: Omit<FrontPlacementResult, "hub">;
};

/**
 * Put left-behind mechs / circuit field drops on this board (same coordinates
 * from another board, start cell for rows without a place) and save when
 * anything changed. Returns the marks for the board.
 */
export function syncLostMechsToBoard(
  board: MsBoard,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): Pick<FrontSession, "lostByCell" | "placement"> {
  const hub = readHub(storage);
  const empty = { changed: false, moved: [], placed: [], movedDrops: [], movedInventoryDrops: [] };
  if (board.seed == null || !Number.isFinite(board.seed)) {
    return { lostByCell: new Map(), placement: empty };
  }
  const res = placeLostOnFront(hub, board.seed, board.aoiHalf);
  if (res.changed) saveHubSaveToLocalStorage(res.hub, storage ?? undefined);
  const { hub: next, ...placement } = res;
  return { lostByCell: lostMechsByCell(next, board.seed), placement };
}

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
        ...syncLostMechsToBoard(restored.board, storage),
      };
    }
  }

  const seed = randomBoardSeed();
  const board = generateBoard(AOI_HALF, seed);
  const focus: FrontCellCoord = { sx: 0, sy: 0 };
  persistFrontSession(board, focus, storage);
  return { board, focus, restored: false, ...syncLostMechsToBoard(board, storage) };
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
  // left-behind mechs / circuit field drops move to the same coordinates on the new board
  return { board, focus, restored: false, ...syncLostMechsToBoard(board, storage) };
}

export type { InvadeFrontProgress };
