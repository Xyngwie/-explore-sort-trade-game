import type { CraftingPuzzleResult } from "@estg/shared";
import * as legacy from "./refine-legacy";
import { fromLegacyBoard, fromLegacyBag, fromLegacyCleared, toLegacyBoard, toLegacyBag, toLegacyCleared, type SortClearedCounts, type SortPieceKind } from "./resource-model";
import {
  applyGravity as boardApplyGravityCore,
  boardNeedsSettle as boardNeedsSettleCore,
  indexOf as boardIndexOfCore,
  refillFromAbove as boardRefillFromAboveCore,
  settleMotionIndices as boardSettleMotionIndicesCore,
  spawnTopFromBag as boardSpawnTopFromBagCore,
  stepGravityOnce as boardStepGravityOnceCore,
} from "./refine-board";
import {
  clearMatches as matchingClearMatches,
  countOnBoard as matchingCountOnBoard,
  findLineMatches as matchingFindLineMatches,
  remainingValidInBag as matchingRemainingValidInBag,
  remainingValidOnBoard as matchingRemainingValidOnBoard,
  resolveChains as matchingResolveChains,
} from "./refine-matching";

export const SORT_V0_RULES = legacy.SORT_V0_RULES;
export const TEST_PLAY_CONTAINERS = legacy.TEST_PLAY_CONTAINERS;
export type PieceKind = SortPieceKind;
export type Cell = SortPieceKind | null;
export type ClearedCounts = SortClearedCounts;
export type RefinePhase = legacy.RefinePhase;
export type PlayMode = legacy.PlayMode;
export type RefineLive = Omit<legacy.RefineLive, "bag" | "board" | "cleared" | "lastClearDelta"> & { bag: SortPieceKind[]; board: Cell[]; cleared: ClearedCounts; lastClearDelta: ClearedCounts | null };
export type SwipeAxis = legacy.SwipeAxis;
export type JunkGaugeLevel = legacy.JunkGaugeLevel;
export type ValidSupplyGauge = legacy.ValidSupplyGauge;
export type ControlAction = legacy.ControlAction;

function toLegacyState(s: RefineLive): legacy.RefineLive { return { ...s, board: toLegacyBoard(s.board), bag: toLegacyBag(s.bag), cleared: toLegacyCleared(s.cleared), lastClearDelta: s.lastClearDelta == null ? null : toLegacyCleared(s.lastClearDelta) }; }
function fromLegacyState(s: legacy.RefineLive): RefineLive { return { ...s, board: fromLegacyBoard(s.board), bag: fromLegacyBag(s.bag), cleared: fromLegacyCleared(s.cleared), lastClearDelta: s.lastClearDelta == null ? null : fromLegacyCleared(s.lastClearDelta) }; }

export const computeBudgets = legacy.computeBudgets;
export const canStartRefine = legacy.canStartRefine;
export const moveBudgetFor = legacy.moveBudgetFor;
export const indexOf = boardIndexOfCore;
export const isActiveChain = legacy.isActiveChain;
export const areAdjacent = legacy.areAdjacent;
export const areHorizontalAdjacent = legacy.areHorizontalAdjacent;
export const canSwapAdjacent = legacy.canSwapAdjacent;
export const classifySwipeAxis = legacy.classifySwipeAxis;
export const resolveSwipeNeighbor = legacy.resolveSwipeNeighbor;
export const settleMotionIndices = (before: Cell[], after: Cell[]) => boardSettleMotionIndicesCore(fromLegacyBoard(toLegacyBoard(before)), fromLegacyBoard(toLegacyBoard(after)));
export const remainingValidOnBoard = (board: Cell[]) => matchingRemainingValidOnBoard(fromLegacyBoard(toLegacyBoard(board)));
export const remainingValidInBag = (bag: SortPieceKind[]) => matchingRemainingValidInBag(fromLegacyBag(toLegacyBag(bag)));

export function buildSupplyBag(validPieceBudget: number, invalidPieceCount = 0, seed = 1): SortPieceKind[] { return fromLegacyBag(legacy.buildSupplyBag(validPieceBudget, invalidPieceCount, seed)); }
export function applyGravity(board: Cell[], cols: number, rows: number): Cell[] { return fromLegacyBoard(boardApplyGravityCore(fromLegacyBoard(toLegacyBoard(board)), cols, rows)); }
export function stepGravityOnce(board: Cell[], cols: number, rows: number) { const r = boardStepGravityOnceCore(fromLegacyBoard(toLegacyBoard(board)), cols, rows); return { board: fromLegacyBoard(r.board), moved: r.moved }; }
export function spawnTopFromBag(board: Cell[], bag: SortPieceKind[], cols: number, rows: number) { const r = boardSpawnTopFromBagCore(fromLegacyBoard(toLegacyBoard(board)), fromLegacyBag(toLegacyBag(bag)), cols, rows); return { board: fromLegacyBoard(r.board), bag: fromLegacyBag(r.bag), spawned: r.spawned }; }
export function boardNeedsSettle(board: Cell[], bag: SortPieceKind[], cols: number, rows: number) { return boardNeedsSettleCore(fromLegacyBoard(toLegacyBoard(board)), fromLegacyBag(toLegacyBag(bag)), cols, rows); }
export function refillFromAbove(board: Cell[], bag: SortPieceKind[], cols: number, rows: number, junkWhenEmpty = false) { const r = boardRefillFromAboveCore(fromLegacyBoard(toLegacyBoard(board)), fromLegacyBag(toLegacyBag(bag)), cols, rows, junkWhenEmpty); return { board: fromLegacyBoard(r.board), bag: fromLegacyBag(r.bag) }; }
export function findLineMatches(board: Cell[], cols: number, rows: number, minLen = SORT_V0_RULES.minClearLine) { return matchingFindLineMatches(fromLegacyBoard(toLegacyBoard(board)), cols, rows, minLen); }
export function clearMatches(board: Cell[], matches: Set<number> | number[]) { const r = matchingClearMatches(fromLegacyBoard(toLegacyBoard(board)), matches); return { board: fromLegacyBoard(r.board), cleared: fromLegacyCleared(r.cleared) }; }
export function resolveChains(board: Cell[], cols: number, rows: number, bag: SortPieceKind[] = [], junkWhenEmpty = false) { const r = matchingResolveChains(fromLegacyBoard(toLegacyBoard(board)), cols, rows, fromLegacyBag(toLegacyBag(bag)), SORT_V0_RULES.minClearLine, junkWhenEmpty); return { board: fromLegacyBoard(r.board), cleared: fromLegacyCleared(r.cleared), chain: r.chain, bag: fromLegacyBag(r.bag) }; }
export function countOnBoard(board: Cell[]) { const r = matchingCountOnBoard(fromLegacyBoard(toLegacyBoard(board))); return { ...fromLegacyCleared(r), junk: r.junk, empty: r.empty }; }
export function isJunkOnlyStalemate(s: RefineLive) { return legacy.isJunkOnlyStalemate(toLegacyState(s)); }
export function fillInitialBoard(bag: SortPieceKind[], cols: number, rows: number, fillRows: number) { const r = legacy.fillInitialBoard(toLegacyBag(bag), cols, rows, fillRows); return { board: fromLegacyBoard(r.board), bag: fromLegacyBag(r.bag) }; }
export const parseInboundOrDemo = legacy.parseInboundOrDemo;
export function createRefineFromLocationSearch(search: string): RefineLive { return fromLegacyState(legacy.createRefineFromLocationSearch(search)); }
export function startRefine(s: RefineLive, seed = Date.now()): RefineLive { return fromLegacyState(legacy.startRefine(toLegacyState(s), seed)); }
export function swapPanels(s: RefineLive, a: number, b: number): RefineLive { return fromLegacyState(legacy.swapPanels(toLegacyState(s), a, b)); }
export function raiseStack(s: RefineLive): RefineLive { return fromLegacyState(legacy.raiseStack(toLegacyState(s))); }
export function commitClearStep(s: RefineLive): RefineLive { return fromLegacyState(legacy.commitClearStep(toLegacyState(s))); }
export function tickSettleStep(s: RefineLive): RefineLive { return fromLegacyState(legacy.tickSettleStep(toLegacyState(s))); }
export function tapCell(s: RefineLive, index: number): RefineLive { return fromLegacyState(legacy.tapCell(toLegacyState(s), index)); }
export function finishRefine(s: RefineLive): RefineLive { return fromLegacyState(legacy.finishRefine(toLegacyState(s))); }
export function scrapLossFromState(s: RefineLive): number { return legacy.scrapLossFromState(toLegacyState(s)); }
export const resolveCraftMultiplier = legacy.resolveCraftMultiplier;
export function toCraftingResult(s: RefineLive): CraftingPuzzleResult { return legacy.toCraftingResult(toLegacyState(s)); }
export const demoQueryExample = legacy.demoQueryExample;
export const testPlayQueryExample = legacy.testPlayQueryExample;
export function createTestPlayRefine(containers = TEST_PLAY_CONTAINERS): RefineLive { return fromLegacyState(legacy.createTestPlayRefine(containers)); }
export const applyControl = (s: RefineLive, action: ControlAction): RefineLive => fromLegacyState(legacy.applyControl(toLegacyState(s), action));
export const findHintSwap = (board: Cell[], cols: number, rows: number) => legacy.findHintSwap(toLegacyBoard(board), cols, rows);
export const countMatchingSwaps = (board: Cell[], cols: number, rows: number) => legacy.countMatchingSwaps(toLegacyBoard(board), cols, rows);
export const isNearStuckHint = (s: RefineLive) => legacy.isNearStuckHint(toLegacyState(s));
export const resolveNearStuckHint = (s: RefineLive) => legacy.resolveNearStuckHint(toLegacyState(s));
export const validSupplyGaugeState = (s: Pick<RefineLive, "bag" | "validPieceBudget">): ValidSupplyGauge => legacy.validSupplyGaugeState({ bag: toLegacyBag(s.bag), validPieceBudget: s.validPieceBudget });
export const PIECE_LABEL_JA: Record<PieceKind, string> = { ammo: "弾薬", armor: "装甲パーツ", power: "電力パーツ", junk: "ジャンク" };
