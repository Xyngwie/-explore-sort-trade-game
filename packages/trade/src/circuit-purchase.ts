/** 10000c for an unrestored used circuit (CIRCUIT_SQUAD_DESIGN_V0 §2.2). */
import {
  RESTORE_MAX_SIDE,
  craftMaxSize,
  createEmptyCircuitBoard,
  edgeCount,
  encodeEdgeState,
  buildSizedTruePuzzleIdV2,
  normalizeHubSnapshot,
  rollPerfectCircuit,
  type EdgeMark,
  type HubSnapshot,
  type HubCircuitRecord,
} from "@estg/shared";
import { backfillPerfectMaxSize } from "./junk-craft";

export const CIRCUIT_PURCHASE_PRICE = 10000;

export function purchaseMaxSide(hub: HubSnapshot): number {
  return Math.min(
    RESTORE_MAX_SIDE,
    craftMaxSize(backfillPerfectMaxSize(hub)) + 1,
  );
}

export type CircuitPurchaseResult =
  | { ok: true; hub: HubSnapshot; record: HubCircuitRecord }
  | {
      ok: false;
      hub: HubSnapshot;
      reason: "no_credits" | "duplicate_id" | "invalid_id";
    };

/** Failed purchases never spend money or draw a new circuit. */
export function purchaseCircuit(
  hub: HubSnapshot,
  opts: {
    circuitId: string;
    trueBoardRate: number;
    rng?: () => number;
    at?: Date;
  },
): CircuitPurchaseResult {
  if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(opts.circuitId))
    return { ok: false, hub, reason: "invalid_id" };
  if (hub.circuits.some((c) => c.circuitId === opts.circuitId))
    return { ok: false, hub, reason: "duplicate_id" };
  if (!Number.isFinite(hub.credits) || hub.credits < CIRCUIT_PURCHASE_PRICE)
    return { ok: false, hub, reason: "no_credits" };
  const rng = opts.rng ?? Math.random;
  const cap = purchaseMaxSide(hub);
  const side =
    2 + Math.min(cap - 2, Math.floor(Math.max(0, rng()) * (cap - 1)));
  const trueBoard = rollPerfectCircuit(rng, { rate: opts.trueBoardRate });
  const puzzleId = trueBoard
    ? buildSizedTruePuzzleIdV2(opts.circuitId, side, side)
    : opts.circuitId;
  const board = createEmptyCircuitBoard(side, side, puzzleId);
  const marks: EdgeMark[] = Array.from(
    { length: edgeCount(side, side) },
    () => Math.min(2, Math.floor(Math.max(0, rng()) * 3)) as EdgeMark,
  );
  // A purchase is used, never a white board, even when the draw happens to be blank.
  if (!marks.some((mark) => mark === 1)) marks[0] = 1;
  board.edgeState = encodeEdgeState(marks);
  const at = (opts.at ?? new Date()).toISOString();
  const record: HubCircuitRecord = {
    circuitId: opts.circuitId,
    circuitBoard: board,
    origin: "bought",
    restoreState: "unrestored",
    outcome: "offline",
    equippedTo: null,
    acquiredAt: at,
    updatedAt: at,
  };
  const next = normalizeHubSnapshot({
    ...hub,
    credits: hub.credits - CIRCUIT_PURCHASE_PRICE,
    circuits: [record, ...hub.circuits],
  });
  return {
    ok: true,
    hub: next,
    record: next.circuits.find((c) => c.circuitId === opts.circuitId)!,
  };
}
