/**
 * Invade ↔ HubSave.frontProgress bridge (load on enter, save after opens/flags).
 * Additive only — never clobbers unrelated hub fields.
 */

import {
  INITIAL_HUB,
  ensureInvadeRank,
  completeInvadeRank,
  selectInvadeRank,
  clearFrontProgressInHub,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  recordFirstInvadeClear,
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
import {
  fieldDropsByCell,
  lostMechsByCell,
  placeLostOnFront,
  wrecksByCell,
  type FrontPlacementResult,
} from "./lost-mechs";

export type FrontSession = {
  board: MsBoard;
  focus: FrontCellCoord | null;
  /** True when restored from HubSave.frontProgress. */
  restored: boolean;
  /** Left-behind mechs on this board per cell ("sx,sy" → instanceIds). */
  lostByCell: Map<string, string[]>;
  /** Circuit field drops on this board per cell ("sx,sy" → circuitIds). */
  dropsByCell: Map<string, string[]>;
  /** 項目5-1b③: wrecks on this board per cell ("sx,sy" → instanceIds). */
  wrecksByCell: Map<string, string[]>;
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
): Pick<FrontSession, "lostByCell" | "dropsByCell" | "wrecksByCell" | "placement"> {
  const hub = readHub(storage);
  const empty = { changed: false, moved: [], placed: [], movedDrops: [], movedInventoryDrops: [] };
  if (board.seed == null || !Number.isFinite(board.seed)) {
    return { lostByCell: new Map(), dropsByCell: new Map(), wrecksByCell: new Map(), placement: empty };
  }
  const res = placeLostOnFront(hub, board.seed, board.aoiHalf);
  if (res.changed) saveHubSaveToLocalStorage(res.hub, storage ?? undefined);
  const { hub: next, ...placement } = res;
  return {
    lostByCell: lostMechsByCell(next, board.seed),
    dropsByCell: fieldDropsByCell(next, board.seed),
    wrecksByCell: wrecksByCell(next, board.seed),
    placement,
  };
}

function readHub(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): HubSnapshot {
  const loaded = loadHubSaveFromLocalStorage(storage ?? undefined);
  return loaded?.hub
    ? ensureInvadeRank(normalizeHubSnapshot(loaded.hub))
    : ensureInvadeRank(normalizeHubSnapshot(INITIAL_HUB));
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
  opts?: { justWon?: boolean },
): boolean {
  return persistFrontSessionWithClear(board, focus, storage, opts).saved;
}

/**
 * Same as {@link persistFrontSession}. When `justWon` (this action turned the
 * board into "won"), the first Invade clear is recorded in the same snapshot
 * and the unrestored "4" goes to the stash — once per save (first-clear.ts).
 * A board that was already won when loaded never records (S2).
 */
export function persistFrontSessionWithClear(
  board: MsBoard,
  focus: FrontCellCoord | null,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
  opts?: { justWon?: boolean },
): { saved: boolean; discovered: boolean } {
  const snap = captureFrontProgress(board, focus);
  if (!snap) return { saved: false, discovered: false };
  const hub = readHub(storage);
  let next = setFrontProgressInHub(hub, snap);
  let discovered = false;
  if (opts?.justWon === true && board.status === "won") {
    const r = recordFirstInvadeClear(next, board.seed ?? null);
    next = completeInvadeRank(r.hub);
    discovered = r.discovered;
  }
  const saved = saveHubSaveToLocalStorage(next, storage ?? undefined);
  return { saved, discovered: saved && discovered };
}

/** Hub as stored now (for the clear banner line). */
export function readStoredHub(
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): HubSnapshot {
  return readHub(storage);
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

/** Change rank and board in one write; refused writes do not switch the screen. */
export function changeFrontRank(rank:number, storage?: Pick<Storage,"getItem"|"setItem">|null):FrontSession|null {
  const hub=selectInvadeRank(readHub(storage),rank);
  if(!hub)return null;
  const board=generateBoard(AOI_HALF,randomBoardSeed());
  const focus={sx:0,sy:0};
  const snap=captureFrontProgress(board,focus);
  if(!snap)return null;
  const placed=placeLostOnFront(setFrontProgressInHub(hub,snap),board.seed!,board.aoiHalf);
  if(!saveHubSaveToLocalStorage(placed.hub,storage ?? undefined))return null;
  const {hub:next,...placement}=placed;
  return {board,focus,restored:false,placement,lostByCell:lostMechsByCell(next,board.seed!),dropsByCell:fieldDropsByCell(next,board.seed!),wrecksByCell:wrecksByCell(next,board.seed!)};
}
