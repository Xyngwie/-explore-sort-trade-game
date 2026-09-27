/**
 * Junk → circuit craft with size choice (impl B, docs/CIRCUIT_DATA_MODEL_V0.md
 * §7.2 / STATUS item 14). Pure functions — the DOM lives in
 * junk-circuit-craft-ui.ts.
 *
 * - Size: square N×N, 2 ≤ N ≤ craftMaxSize(hub) = min(perfectMaxSize + 1, 20)
 *   (at least 2).
 * - Cost: circuitCraftJunkCost(N) junk (2N) + circuitCraftCreditCost(N) credits
 *   (round(4 × 1.5^N)) — shared single source (circuit-craft-cost.ts).
 * - Circuit: empty N×N board, restoreState "offline", origin "crafted",
 *   equippedTo null. No count cap (the old 8-circuit truncation is gone).
 */
import {
  HUB_LIMITS,
  circuitCraftCreditCost,
  circuitCraftJunkCost,
  craftMaxSize,
  createEmptyCircuitBoard,
  derivePerfectMaxSize,
  normalizeHubSnapshot,
  type HubCircuitRecord,
  type HubSnapshot,
} from "@estg/shared";

export const JUNK_CRAFT_MIN_SIDE = 2;

/** Largest side the player may craft now (min(perfectMaxSize + 1, 20), ≥ 2). */
export function junkCraftMaxSide(hub: Pick<HubSnapshot, "perfectMaxSize">): number {
  return craftMaxSize(hub);
}

export function heldJunk(hub: Pick<HubSnapshot, "inventory">): number {
  return Math.max(0, Math.floor(Number(hub.inventory?.junk ?? 0) || 0));
}

function heldCredits(hub: Pick<HubSnapshot, "credits">): number {
  return Math.max(0, Math.floor(Number(hub.credits) || 0));
}

export type JunkCraftBlockReason = "over_cap" | "no_junk" | "no_credits" | "bad_size";

export type JunkCraftOption = {
  side: number;
  junk: number;
  credits: number;
  /** Within 2..craftMaxSize. */
  withinCap: boolean;
  affordable: boolean;
  enabled: boolean;
  reason?: JunkCraftBlockReason;
};

function blockReason(
  hub: Pick<HubSnapshot, "inventory" | "credits" | "perfectMaxSize">,
  side: number,
): JunkCraftBlockReason | undefined {
  if (!Number.isInteger(side) || side < JUNK_CRAFT_MIN_SIDE || side > HUB_LIMITS.maxRestoreSide) {
    return "bad_size";
  }
  if (side > junkCraftMaxSide(hub)) return "over_cap";
  if (heldJunk(hub) < circuitCraftJunkCost(side)) return "no_junk";
  if (heldCredits(hub) < circuitCraftCreditCost(side)) return "no_credits";
  return undefined;
}

/**
 * Picker rows for 2..`upTo` (default: the cap, so sizes above the cap are not
 * listed; pass 20 to list every size with over-cap rows disabled).
 */
export function junkCraftOptions(
  hub: Pick<HubSnapshot, "inventory" | "credits" | "perfectMaxSize">,
  upTo: number = junkCraftMaxSide(hub),
): JunkCraftOption[] {
  const last = Math.max(JUNK_CRAFT_MIN_SIDE, Math.min(HUB_LIMITS.maxRestoreSide, Math.floor(upTo)));
  const cap = junkCraftMaxSide(hub);
  const out: JunkCraftOption[] = [];
  for (let side = JUNK_CRAFT_MIN_SIDE; side <= last; side++) {
    const junk = circuitCraftJunkCost(side);
    const credits = circuitCraftCreditCost(side);
    const affordable = heldJunk(hub) >= junk && heldCredits(hub) >= credits;
    const reason = blockReason(hub, side);
    out.push({
      side,
      junk,
      credits,
      withinCap: side <= cap,
      affordable,
      enabled: reason == null,
      ...(reason ? { reason } : {}),
    });
  }
  return out;
}

export type JunkCraftResult = {
  ok: boolean;
  hub: HubSnapshot;
  reason?: JunkCraftBlockReason;
  record?: HubCircuitRecord;
};

/**
 * Craft one N×N circuit: deduct 2N junk + round(4×1.5^N) credits and add the
 * new circuit to the front of hub.circuits (stash). Returns the hub unchanged
 * with a reason when the size is over the cap or unaffordable.
 */
export function craftJunkCircuit(
  hub: HubSnapshot,
  side: number,
  opts: { circuitId: string; at?: Date },
): JunkCraftResult {
  const reason = blockReason(hub, side);
  if (reason) return { ok: false, hub, reason };
  const junkCost = circuitCraftJunkCost(side);
  const creditCost = circuitCraftCreditCost(side);
  const at = (opts.at ?? new Date()).toISOString();

  const board = createEmptyCircuitBoard(side, side, opts.circuitId);
  board.outcome = "offline";
  const record: HubCircuitRecord = {
    circuitId: opts.circuitId,
    circuitBoard: board,
    restoreState: "offline",
    origin: "crafted",
    equippedTo: null,
    outcome: "offline",
    acquiredAt: at,
    updatedAt: at,
  };

  const inventory = { ...hub.inventory };
  const remainingJunk = heldJunk(hub) - junkCost;
  if (remainingJunk > 0) inventory.junk = remainingJunk;
  else delete inventory.junk;

  const next = normalizeHubSnapshot({
    ...hub,
    credits: heldCredits(hub) - creditCost,
    inventory,
    circuits: [record, ...hub.circuits],
  });
  const saved = next.circuits.find((c) => c.circuitId === opts.circuitId);
  if (!saved) return { ok: false, hub, reason: "bad_size" };
  return { ok: true, hub: next, record: saved };
}

/**
 * One-time backfill (impl B): perfectMaxSize = max(saved value, largest side
 * of held Fully Awakened + locked circuits), capped at 20. Counts perfects
 * achieved between impl A and impl B. Never lowers the saved value.
 */
export function backfillPerfectMaxSize(hub: HubSnapshot): HubSnapshot {
  const derived = derivePerfectMaxSize(hub.circuits);
  const saved = Math.max(0, Math.floor(hub.perfectMaxSize ?? 0));
  const next = Math.min(HUB_LIMITS.maxRestoreSide, Math.max(saved, derived));
  return next === hub.perfectMaxSize ? hub : { ...hub, perfectMaxSize: next };
}
