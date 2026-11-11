import { buildVerifyPerfectLockedBoard } from "./perfect-circuit-seed";
import { buildSizedTruePuzzleIdV2, resolveSizedTruePuzzle } from "./perfect-circuit-sized";
import { TRUE_BOARD_EFFECT_KEYS, FALSE_BOARD_EFFECT_KEYS, PLATOON_LEADER_SIDE, type CircuitEffectKey } from "./circuit-actions";
import { edgeCount, encodeEdgeState } from "./circuit-board";
import type { HubCircuitRecord } from "./hub-save";

/** #318's wired fixture board, reused by both presets and the free editor. */
export function buildDebugCircuit(id: string, owner: string | null, key: CircuitEffectKey, trueBoard: boolean, online = true): HubCircuitRecord {
  const pool: readonly string[] = trueBoard ? TRUE_BOARD_EFFECT_KEYS : FALSE_BOARD_EFFECT_KEYS;
  if (!pool.includes(key)) throw new Error("この効果は選択した真盤・偽盤では使用できません");
  const board = buildVerifyPerfectLockedBoard("DEBUG_FIXTURE");
  if (key === "platoon_leader") {
    // 小隊長 exists on the side-10 true board only (2026-11-11): a solved 10×10 board.
    const puzzleId = buildSizedTruePuzzleIdV2("DEBUG_PLATOON", PLATOON_LEADER_SIDE, PLATOON_LEADER_SIDE);
    const sized = resolveSizedTruePuzzle(puzzleId)!;
    board.cols = sized.cols; board.rows = sized.rows; board.puzzleId = puzzleId; board.edgeState = encodeEdgeState(sized.solution);
  }
  if (!trueBoard) { board.puzzleId = "debug-normal-shield"; board.perfect = false; board.locked = false; }
  const state = online ? trueBoard ? "fully_awakened" : "bypass" : "offline";
  board.outcome = state;
  if (!online) {
    board.edgeState = encodeEdgeState(Array.from({length:edgeCount(board.cols,board.rows)},()=>0));
    board.perfect = false;board.locked = false;
  }
  return {circuitId:id,circuitBoard:board,outcome:state,restoreState:state,locked:online&&trueBoard,origin:"crafted",equippedTo:owner,effectKey:key};
}
