/**
 * 小隊長の完全自律と指揮学習 (2026-11-11 神宮 TASK_ASSIGNMENT; docs/AUTONOMOUS_LEARNING_V0.md
 * 「小隊長の指揮学習」) and the 2026-11-12 follow-up 「小隊長の続き（通信・分担）」.
 * Decisions P1–P4, C1–C4, L1–L2, S1–S4, K1–K2, G1–G3, plus T1–T5 and B1–B5.
 *
 * - A unit is a 小隊長 when it has an instanceId and equips the side-10 Fully Awakened
 *   `platoon_leader` circuit (circuitPlay.platoonLeader).
 * - The captain (中隊長) transmits within commandRangeCaptain (7500). A living wingman 小隊長
 *   transmits within commandRangePlatoonLeader (1500), and only to living wingmen who are
 *   outside the captain's circle and inside its own (not to itself). Distance only.
 * - A mission outside the issuer's radius is held (commandPending) and delivered when the
 *   recipient enters. `tries` counts on delivery, on the issuer's instanceId (P3・B5).
 * - Missions are the four squad stances. Settlement uses the last mission a wingman received.
 */
import type { MechCommandCell, MechCommandStance, MechCommandSubject } from "@estg/shared";
import { applyOrder } from "./orders";
import { highestCargoSubjectForUnit } from "./learning";
import { dist } from "./math";
import type { Unit, World } from "./types";

/** C1: the four missions, in their fixed order (tie-break and untried rotation). */
export const COMMAND_STANCE_ORDER: readonly MechCommandStance[] = ["escort", "patrol", "recover", "raid"];
/**
 * E1 ★A 暫定: the 小隊長 picks a mission itself at the start and whenever no mission was issued
 * (by the player or by itself) for this many seconds.
 */
export const COMMAND_DECISION_SEC = 20;

export function isPlatoonLeaderUnit(world: Pick<World, "circuitPlay">, unit: Unit): boolean {
  return !!unit.instanceId?.trim() && world.circuitPlay?.platoonLeader?.[unit.id] === true;
}

/** C2/C4: the captain is the 小隊長 (still true after it is wrecked: the command continues). */
export function captainIsPlatoonLeader(world: Pick<World, "circuitPlay" | "leader">): boolean {
  return isPlatoonLeaderUnit(world, world.leader);
}

function counter(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function find(cells: MechCommandCell[], stance: MechCommandStance, subject: MechCommandSubject): MechCommandCell | undefined {
  return cells.find((c) => c.stance === stance && c.subject === subject);
}

type CommandField = "tries" | "survived" | "died" | "leftBehind" | "broughtHome" | "abandoned" | "kills";

export function addCommandCount(
  cells: MechCommandCell[],
  stance: MechCommandStance,
  subject: MechCommandSubject,
  field: CommandField,
  delta = 1,
  maxCells = 4096,
): MechCommandCell[] {
  const idx = cells.findIndex((c) => c.stance === stance && c.subject === subject);
  if (idx >= 0) {
    const next = [...cells];
    const row = { ...next[idx]! };
    row[field] = counter(row[field]) + delta;
    next[idx] = row;
    return next;
  }
  if (cells.length >= maxCells) return cells;
  return [...cells, { ledger: "command", stance, subject, [field]: delta }];
}

/** S1 暫定: the individual ledger's provisional points. */
const HOME_POINTS: Record<"container" | "circuit" | "wreck", number> = { container: 8, circuit: 40, wreck: 40 };
const KILL_POINTS_NORMAL = 2;

/** S2: the expectation of issuing `stance` (survival + recover's bring-home + raid's kills). */
export function commandExpectation(cells: MechCommandCell[], stance: MechCommandStance): number {
  const base = find(cells, stance, "none");
  const survived = counter(base?.survived);
  const died = counter(base?.died);
  const left = counter(base?.leftBehind);
  const den = survived + died + left;
  let sum = den > 0 ? (survived * 100 + died * -100 + left * -80) / den : 0;
  if (stance === "recover") {
    for (const subject of ["container", "circuit", "wreck"] as const) {
      const c = find(cells, stance, subject);
      const home = counter(c?.broughtHome);
      const lost = counter(c?.abandoned);
      if (home + lost > 0) sum += (home / (home + lost)) * HOME_POINTS[subject];
    }
  }
  if (stance === "raid") {
    const tries = counter(base?.tries);
    const kills = counter(find(cells, stance, "normal")?.kills);
    if (tries > 0) sum += (kills / tries) * KILL_POINTS_NORMAL;
  }
  return sum;
}

/** S4: untried missions first (fixed order, rotated by the decision count); then the best expectation. */
export function chooseCommandStance(
  cells: MechCommandCell[],
  menu: readonly MechCommandStance[],
  decisionCount: number,
): MechCommandStance | null {
  if (menu.length === 0) return null;
  const ordered = COMMAND_STANCE_ORDER.filter((s) => menu.includes(s));
  const untried = ordered.filter((s) => counter(find(cells, s, "none")?.tries) === 0);
  if (untried.length > 0) return untried[decisionCount % untried.length]!;
  let best = ordered[0]!;
  let bestScore = commandExpectation(cells, best);
  for (const s of ordered) {
    const score = commandExpectation(cells, s);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best;
}

function commandCells(world: World, id: string): MechCommandCell[] {
  world.mechCommandWork ??= {};
  return (world.mechCommandWork[id] ??= []);
}

function unitById(world: World, id: string): Unit | null {
  if (world.leader.id === id) return world.leader;
  return world.wingmen.find((w) => w.id === id) ?? null;
}

function unitByInstanceId(world: World, instanceId: string): Unit | null {
  if (world.leader.instanceId?.trim() === instanceId) return world.leader;
  return world.wingmen.find((w) => w.instanceId?.trim() === instanceId) ?? null;
}

/** P3: command cells are written only for a 小隊長 that has an instanceId. */
function recordableIssuerId(world: World, unit: Unit): string | null {
  if (!isPlatoonLeaderUnit(world, unit)) return null;
  return unit.instanceId!.trim();
}

/** T1: the captain always uses 7500. A wingman issuer uses 1500. Distance only (not vision). */
export function commandRangeOf(world: World, unit: Unit): number {
  return unit.kind === "leader" ? world.balance.commandRangeCaptain : world.balance.commandRangePlatoonLeader;
}

export function unitInCommandRange(world: World, issuer: Unit, target: { pos: { x: number; y: number } }): boolean {
  return dist(issuer.pos, target.pos) <= commandRangeOf(world, issuer);
}

/** A mission that reached `wing`. `tries` is the issuer's, and only when that issuer is a 小隊長 (P3・B5). */
export function noteCommandIssued(world: World, wing: Unit, stance: MechCommandStance, issuer: Unit = world.leader): void {
  if (wing.kind !== "wingman") return;
  wing.commandOrder = stance;
  const instanceId = issuer.instanceId?.trim() || "";
  if (instanceId) wing.commandIssuerId = instanceId;
  else delete wing.commandIssuerId;
  const id = recordableIssuerId(world, issuer);
  if (!id) return;
  world.mechCommandWork ??= {};
  world.mechCommandWork[id] = addCommandCount(commandCells(world, id), stance, "none", "tries");
}

/** L2: a raid recipient killed an enemy (normal in v0). Credited to the issuer of the raid. */
export function noteCommandKill(world: World, shooter: Unit): void {
  if (shooter.kind !== "wingman" || shooter.commandOrder !== "raid" || shooter.stance !== "raid") return;
  const instanceId = shooter.commandIssuerId?.trim() || "";
  if (!instanceId) return;
  const issuer = unitByInstanceId(world, instanceId);
  if (!issuer || !recordableIssuerId(world, issuer)) return;
  world.mechCommandWork ??= {};
  world.mechCommandWork[instanceId] = addCommandCount(commandCells(world, instanceId), "raid", "normal", "kills");
}

/** L2: what a recover recipient carried while on that mission (for bring-home / abandoned). */
export function trackCommandCargo(world: World, wing: Unit): void {
  if (wing.commandOrder !== "recover" || !wing.alive) return;
  const subject = highestCargoSubjectForUnit(world, wing);
  if (subject === "container" || subject === "circuit" || subject === "wreck") {
    wing.commandHeldSubjects ??= {};
    wing.commandHeldSubjects[subject] = true;
  }
}

/** L2・E3・B5: settlement once per sortie, on the last mission, into that mission's issuer. */
export function finalizeCommandSortie(world: World): void {
  if (world.mechCommandFinalized) return;
  world.mechCommandFinalized = true;
  const leftIds = new Set((world.leftBehind ?? []).map((e) => e.id));
  for (const w of world.wingmen) {
    const stance = w.commandOrder;
    const id = w.commandIssuerId?.trim() || "";
    if (!stance || !id) continue;
    const issuer = unitByInstanceId(world, id);
    if (!issuer || !recordableIssuerId(world, issuer)) continue;
    let cells = commandCells(world, id);
    if (!w.alive) cells = addCommandCount(cells, stance, "none", "died");
    else if (leftIds.has(w.id)) cells = addCommandCount(cells, stance, "none", "leftBehind");
    else if (world.extracted) cells = addCommandCount(cells, stance, "none", "survived");
    if (stance === "recover") {
      const held = w.commandHeldSubjects ?? {};
      const inside = w.alive && world.extracted && !leftIds.has(w.id);
      for (const subject of ["container", "circuit", "wreck"] as const) {
        if (!held[subject]) continue;
        const still = highestCargoSubjectForUnit(world, w) === subject;
        cells = addCommandCount(cells, "recover", subject, inside && still ? "broughtHome" : "abandoned");
      }
    }
    world.mechCommandWork![id] = cells;
  }
}

/** The missions the 小隊長 can issue now (recover needs a discovered container, as the order itself does). */
export function commandMenu(world: World): MechCommandStance[] {
  const canRecover = world.containers.some((c) => c.discovered && !c.taken);
  return COMMAND_STANCE_ORDER.filter((s) => s !== "recover" || canRecover);
}

/** T3 暫定: one undelivered mission, held until the recipient is inside the issuer's radius. */
export type CommandPending = {
  issuerUnitId: string;
  issuerInstanceId: string | null;
  wingId: string;
  stance: MechCommandStance;
  individual: boolean;
};

/** ★A 暫定: a range ring kept from the moment of transmission. `until` is world.elapsed. */
export type CommandRing = {
  issuerUnitId: string;
  x: number;
  y: number;
  radius: number;
  until: number;
};

/** ★2 ★A 暫定: how long a ring stays up. The same issuer issuing again restarts it. */
export const COMMAND_RING_SEC = 2;

type Candidate = {
  issuer: Unit;
  wing: Unit;
  stance: MechCommandStance;
  individual: boolean;
};

function recoverBlocked(world: World, stance: MechCommandStance): boolean {
  return stance === "recover" && !world.containers.some((c) => c.discovered && !c.taken);
}

/** ★9 ★A 暫定: a newer undelivered mission from the same issuer replaces the older one. */
function rememberPending(world: World, next: CommandPending): void {
  const rest = (world.commandPending ?? []).filter(
    (p) => !(p.issuerUnitId === next.issuerUnitId && p.wingId === next.wingId),
  );
  rest.push(next);
  world.commandPending = rest;
}

function dropPending(world: World, issuerUnitId: string, wingId: string): void {
  if (!world.commandPending) return;
  world.commandPending = world.commandPending.filter(
    (p) => !(p.issuerUnitId === issuerUnitId && p.wingId === wingId),
  );
}

/** ★5 ★A 暫定: only the issuer who just transmitted. ★2 restarts that issuer's 2 s. */
function markRing(world: World, issuer: Unit): void {
  const rings = (world.commandRings ?? []).filter((r) => r.issuerUnitId !== issuer.id && r.until > world.elapsed);
  rings.push({
    issuerUnitId: issuer.id,
    x: issuer.pos.x,
    y: issuer.pos.y,
    radius: commandRangeOf(world, issuer),
    until: world.elapsed + COMMAND_RING_SEC,
  });
  world.commandRings = rings;
}

/** Rings still on screen. Tests read this; renderWorld strokes it. */
export function activeCommandRings(world: World): CommandRing[] {
  return (world.commandRings ?? []).filter((r) => r.until > world.elapsed && Number.isFinite(r.radius));
}

/**
 * Stage one recipient. In range → candidate. Out of range → pending (T2 keeps the old stance,
 * because applyOrder is not called). A recover with nothing discovered is denied, as before.
 */
function stageOffer(
  world: World,
  issuer: Unit,
  wing: Unit,
  stance: MechCommandStance,
  individual: boolean,
  bucket: Candidate[],
): "pending" | "staged" | "denied" {
  if (!wing.alive || wing.kind !== "wingman" || wing.id === issuer.id) return "denied";
  if (recoverBlocked(world, stance)) {
    applyOrder(world, wing, stance, { individual });
    return "denied";
  }
  if (!unitInCommandRange(world, issuer, wing)) {
    rememberPending(world, {
      issuerUnitId: issuer.id,
      issuerInstanceId: issuer.instanceId?.trim() || null,
      wingId: wing.id,
      stance,
      individual,
    });
    return "pending";
  }
  dropPending(world, issuer.id, wing.id);
  bucket.push({ issuer, wing, stance, individual });
  return "staged";
}

/** B3 暫定: captain first (player orders included), then the nearer 小隊長, then earlier in wingmen. */
function preferCandidate(world: World, a: Candidate, b: Candidate): Candidate {
  const aLead = a.issuer.kind === "leader";
  const bLead = b.issuer.kind === "leader";
  if (aLead !== bLead) return aLead ? a : b;
  const da = dist(a.issuer.pos, a.wing.pos);
  const db = dist(b.issuer.pos, b.wing.pos);
  if (da < db) return a;
  if (db < da) return b;
  const ia = world.wingmen.findIndex((w) => w.id === a.issuer.id);
  const ib = world.wingmen.findIndex((w) => w.id === b.issuer.id);
  return ia <= ib ? a : b;
}

function deliverCandidates(world: World, bucket: Candidate[]): number {
  const best = new Map<string, Candidate>();
  for (const c of bucket) {
    const prev = best.get(c.wing.id);
    best.set(c.wing.id, prev ? preferCandidate(world, prev, c) : c);
  }
  let delivered = 0;
  for (const c of best.values()) {
    if (applyOrder(world, c.wing, c.stance, { individual: c.individual }) !== "applied") continue;
    noteCommandIssued(world, c.wing, c.stance, c.issuer);
    delivered += 1;
  }
  return delivered;
}

function enqueueInRangePending(world: World, bucket: Candidate[]): void {
  const keep: CommandPending[] = [];
  for (const p of world.commandPending ?? []) {
    const issuer = unitById(world, p.issuerUnitId);
    const wing = world.wingmen.find((w) => w.id === p.wingId);
    // ★7 ★A 暫定: a wrecked wingman 小隊長 does not keep transmitting. A wrecked captain does (T5).
    if (!issuer || !wing || !wing.alive || (issuer.kind === "wingman" && !issuer.alive)) continue;
    if (!unitInCommandRange(world, issuer, wing)) {
      keep.push(p);
      continue;
    }
    bucket.push({ issuer, wing, stance: p.stance, individual: p.individual });
  }
  if (world.commandPending) world.commandPending = keep;
}

/**
 * Player wing order (the four stances and 召還). In-range living wingmen receive it now.
 * The rest is held. Resets the captain's 20 s when the captain is a 小隊長 and something
 * was actually issued (delivered or held). Draws the ring at this moment (★6 ★A).
 */
export function issueCaptainOrders(
  world: World,
  wings: readonly Unit[],
  stance: MechCommandStance,
  individual: boolean,
): { delivered: number; pending: number; denied: number } {
  const bucket: Candidate[] = [];
  let pending = 0;
  let denied = 0;
  for (const wing of wings) {
    const result = stageOffer(world, world.leader, wing, stance, individual, bucket);
    if (result === "pending") pending += 1;
    else if (result === "denied") denied += 1;
  }
  const delivered = deliverCandidates(world, bucket);
  if (pending + delivered > 0) {
    if (captainIsPlatoonLeader(world)) world.commandDecisionAt = world.elapsed;
    markRing(world, world.leader);
  }
  return { delivered, pending, denied };
}

function issueCaptainAuto(world: World, bucket: Candidate[]): void {
  if (!captainIsPlatoonLeader(world)) return;
  if (world.commandDecisionAt != null && world.elapsed - world.commandDecisionAt < COMMAND_DECISION_SEC) return;
  const wings = world.wingmen.filter((w) => w.alive);
  world.commandDecisionAt = world.elapsed;
  if (wings.length === 0) return;
  const id = world.leader.instanceId!.trim();
  const count = world.commandDecisionCount ?? 0;
  const stance = chooseCommandStance(commandCells(world, id), commandMenu(world), count);
  world.commandDecisionCount = count + 1;
  if (!stance) return;
  let accepted = 0;
  for (const w of wings) {
    const result = stageOffer(world, world.leader, w, stance, false, bucket);
    if (result === "pending" || result === "staged") accepted += 1;
  }
  if (accepted > 0) markRing(world, world.leader);
}

/** B1・B2 ★A 暫定: living wingman 小隊長, own cells, own 20 s, never to itself, never while wrecked. */
function issueWingmanPlatoons(world: World, bucket: Candidate[]): void {
  const captainR = world.balance.commandRangeCaptain;
  const platoonR = world.balance.commandRangePlatoonLeader;
  for (const issuer of world.wingmen) {
    if (!issuer.alive || !isPlatoonLeaderUnit(world, issuer)) continue;
    const due = issuer.commandIssuedAt == null || world.elapsed - issuer.commandIssuedAt >= COMMAND_DECISION_SEC;
    if (!due) continue;
    const targets = world.wingmen.filter((w) => {
      if (!w.alive || w.id === issuer.id) return false;
      if (dist(world.leader.pos, w.pos) <= captainR) return false;
      return dist(issuer.pos, w.pos) <= platoonR;
    });
    if (targets.length === 0) continue;
    const id = issuer.instanceId!.trim();
    const count = issuer.commandDecisionCount ?? 0;
    const stance = chooseCommandStance(commandCells(world, id), commandMenu(world), count);
    issuer.commandDecisionCount = count + 1;
    issuer.commandIssuedAt = world.elapsed;
    if (!stance) continue;
    markRing(world, issuer);
    for (const w of targets) stageOffer(world, issuer, w, stance, false, bucket);
  }
}

/**
 * E1 for the captain, B2 for each wingman 小隊長, then anything that has entered range.
 * tickWorld calls this after placeCarried, so a carried captain is centered on leader.pos (T5 暫定).
 */
export function tickPlatoonCommand(world: World): void {
  if (world.phase !== "sortie") return;
  const bucket: Candidate[] = [];
  issueCaptainAuto(world, bucket);
  issueWingmanPlatoons(world, bucket);
  enqueueInRangePending(world, bucket);
  deliverCandidates(world, bucket);
}
