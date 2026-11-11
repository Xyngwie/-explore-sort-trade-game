/**
 * 小隊長の完全自律と指揮学習 (2026-11-11 神宮 TASK_ASSIGNMENT; docs/AUTONOMOUS_LEARNING_V0.md
 * 「小隊長の指揮学習」). Decisions P1–P4, C1–C4, L1–L2, S1–S4, K1–K2, G1–G3.
 *
 * - A unit is a 小隊長 when it has an instanceId and equips the side-10 Fully Awakened
 *   `platoon_leader` circuit (circuitPlay.platoonLeader). Only the captain issues missions today
 *   (a wingman 小隊長 has the ledger slot but issues nothing until the split is decided).
 * - Missions are the four squad stances (escort / patrol / recover / raid). Every mission the
 *   captain-小隊長 issues counts `tries` once per unit that received it, in the captain's
 *   command cells. At settlement each recipient adds survived / died / leftBehind to the stance
 *   of the last mission it received; recover adds broughtHome / abandoned; raid kills add `kills`.
 * - The same provisional scores as the individual ledger (S1). The expectation picks the next
 *   mission; untried missions first (S4).
 */
import type { MechCommandCell, MechCommandStance, MechCommandSubject } from "@estg/shared";
import { applyOrder } from "./orders";
import { highestCargoSubjectForUnit } from "./learning";
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

function leaderCommandId(world: World): string | null {
  return captainIsPlatoonLeader(world) ? world.leader.instanceId!.trim() : null;
}

function commandCells(world: World, id: string): MechCommandCell[] {
  world.mechCommandWork ??= {};
  return (world.mechCommandWork[id] ??= []);
}

/** A mission the captain-小隊長 issued reached `wing` (L1・S3: counted per recipient). */
export function noteCommandIssued(world: World, wing: Unit, stance: MechCommandStance): void {
  const id = leaderCommandId(world);
  if (!id || wing.kind !== "wingman") return;
  world.mechCommandWork![id] = addCommandCount(commandCells(world, id), stance, "none", "tries");
  wing.commandOrder = stance;
  world.commandDecisionAt = world.elapsed;
}

/** L2: a raid recipient killed an enemy (normal in v0). */
export function noteCommandKill(world: World, shooter: Unit): void {
  const id = leaderCommandId(world);
  if (!id || shooter.kind !== "wingman" || shooter.commandOrder !== "raid" || shooter.stance !== "raid") return;
  world.mechCommandWork![id] = addCommandCount(commandCells(world, id), "raid", "normal", "kills");
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

/** L2: settlement once per sortie, per recipient, on the stance of the last mission it received. */
export function finalizeCommandSortie(world: World): void {
  if (world.mechCommandFinalized) return;
  world.mechCommandFinalized = true;
  const id = leaderCommandId(world);
  if (!id) return;
  const leftIds = new Set((world.leftBehind ?? []).map((e) => e.id));
  let cells = commandCells(world, id);
  for (const w of world.wingmen) {
    const stance = w.commandOrder;
    if (!stance) continue;
    if (!w.alive) cells = addCommandCount(cells, stance, "none", "died");
    else if (leftIds.has(w.id)) cells = addCommandCount(cells, stance, "none", "leftBehind");
    else if (world.extracted) cells = addCommandCount(cells, stance, "none", "survived");
    if (stance !== "recover") continue;
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

/** The missions the 小隊長 can issue now (recover needs a discovered container, as the order itself does). */
export function commandMenu(world: World): MechCommandStance[] {
  const canRecover = world.containers.some((c) => c.discovered && !c.taken);
  return COMMAND_STANCE_ORDER.filter((s) => s !== "recover" || canRecover);
}

/**
 * E1 ★A 暫定: the captain-小隊長 issues a mission to every living wingman by itself at the
 * start and after {@link COMMAND_DECISION_SEC} s without any mission. Player missions reset it.
 */
export function tickPlatoonCommand(world: World): void {
  const id = leaderCommandId(world);
  if (!id || world.phase !== "sortie") return;
  if (world.commandDecisionAt != null && world.elapsed - world.commandDecisionAt < COMMAND_DECISION_SEC) return;
  const wings = world.wingmen.filter((w) => w.alive);
  world.commandDecisionAt = world.elapsed;
  if (wings.length === 0) return;
  const count = world.commandDecisionCount ?? 0;
  const stance = chooseCommandStance(commandCells(world, id), commandMenu(world), count);
  world.commandDecisionCount = count + 1;
  if (!stance) return;
  for (const w of wings) {
    if (applyOrder(world, w, stance) === "applied") noteCommandIssued(world, w, stance);
  }
}
