import type { MechLearningCell } from "@estg/shared";
import type { Stance, Unit, World } from "./types";

export const LEARNING_DECISION_SEC = 2;

export const LEARNING_ACTION_ORDER = [
  "drop",
  "flee",
  "fight",
  "carry",
  "extract",
  "hold",
] as const;

export type LearningAction = (typeof LEARNING_ACTION_ORDER)[number];

export type LearningDistance = "near" | "mid" | "far";
export type LearningCircle = "inside" | "close" | "late";
export type LearningHp = "high" | "low";
export type LearningCargo = "holding" | "dropped" | "none";
export type LearningSubject = "none" | "normal" | "container" | "circuit" | "wreck";

export type LearningStage = {
  distance: LearningDistance;
  circle: LearningCircle;
  hp: LearningHp;
  cargo: LearningCargo;
};

export type LearningMenuContext = {
  stance: Stance;
  alive: boolean;
  timedOut: boolean;
  unitLoad: number;
  droppedThisSortie: boolean;
  hasBoarding: boolean;
  seesEnemy: boolean;
  recoverSalvageOk: boolean;
};

export type LearningPickContext = LearningMenuContext & {
  decisionCount: number;
  subjects: {
    fight: LearningSubject;
    carry: LearningSubject;
    drop: LearningSubject | null;
    holdTransport: LearningSubject | null;
  };
};

export function cellKey(cell: Pick<MechLearningCell, "ledger" | "action" | "subject" | "distance" | "circle" | "hp" | "cargo">): string {
  return `${cell.ledger}|${cell.action}|${cell.subject}|${cell.distance}|${cell.circle}|${cell.hp}|${cell.cargo}`;
}

export function cloneCells(cells: MechLearningCell[]): MechLearningCell[] {
  return cells.map((c) => ({ ...c }));
}

function counter(cell: MechLearningCell, field: keyof MechLearningCell): number {
  const v = cell[field];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function ratio(num: number, den: number): number {
  if (den <= 0) return 0;
  return num / den;
}

function quizScore(subject: LearningSubject): { success: number; failure: number } {
  if (subject === "container") return { success: 1, failure: -1 };
  if (subject === "circuit" || subject === "wreck") return { success: 4, failure: -2 };
  if (subject === "normal") return { success: 1, failure: -1 };
  return { success: 0, failure: 0 };
}

function broughtHomeScore(subject: LearningSubject): number {
  if (subject === "container") return 8;
  if (subject === "circuit" || subject === "wreck") return 40;
  return 0;
}

function killScore(subject: LearningSubject): number {
  if (subject === "normal") return 2;
  if (subject === "circuit" || subject === "wreck") return 20;
  return 0;
}

/** Expected score for one ledger cell (spec §想定). Unknown ledger → 0. */
export function learningExpectation(cell: MechLearningCell): number {
  if (cell.ledger === "survival") {
    const survived = counter(cell, "survived");
    const died = counter(cell, "died");
    const leftBehind = counter(cell, "leftBehind");
    const den = survived + died + leftBehind;
    return ratio(survived * 100 + died * -100 + leftBehind * -80, den);
  }
  if (cell.ledger === "transport") {
    const quizSuccess = counter(cell, "quizSuccess");
    const quizFailure = counter(cell, "quizFailure");
    const broughtHome = counter(cell, "broughtHome");
    const abandoned = counter(cell, "abandoned");
    const q = quizScore(cell.subject);
    const quizTerm = ratio(quizSuccess * q.success + quizFailure * q.failure, quizSuccess + quizFailure);
    const homePts = broughtHomeScore(cell.subject);
    const homeTerm = ratio(broughtHome, broughtHome + abandoned) * homePts;
    return quizTerm + homeTerm;
  }
  if (cell.ledger === "combat") {
    const hits = counter(cell, "hits");
    const misses = counter(cell, "misses");
    const kills = counter(cell, "kills");
    const tries = counter(cell, "tries");
    const dodged = counter(cell, "dodged");
    const struck = counter(cell, "struck");
    const shootTerm = ratio(hits * 1 + misses * -1, hits + misses);
    const dodgeTerm = ratio(dodged * 1 + struck * -1, dodged + struck);
    const killTerm = ratio(kills, tries) * killScore(cell.subject);
    return shootTerm + dodgeTerm + killTerm;
  }
  return 0;
}

function findCell(cells: MechLearningCell[], key: string): MechLearningCell | undefined {
  return cells.find((c) => cellKey(c) === key);
}

function blankCell(
  partial: Pick<MechLearningCell, "ledger" | "action" | "subject" | "distance" | "circle" | "hp" | "cargo">,
): MechLearningCell {
  return { ...partial, tries: 0 };
}

export function upsertCellCounter(
  cells: MechLearningCell[],
  partial: Pick<MechLearningCell, "ledger" | "action" | "subject" | "distance" | "circle" | "hp" | "cargo">,
  field: keyof MechLearningCell,
  delta = 1,
  maxCells = 4096,
): MechLearningCell[] {
  const key = cellKey(partial);
  const idx = cells.findIndex((c) => cellKey(c) === key);
  if (idx >= 0) {
    const next = [...cells];
    const row = { ...next[idx]! };
    const cur = counter(row, field);
    if (field === "tries") row.tries = cur + delta;
    else if (field === "survived") row.survived = cur + delta;
    else if (field === "died") row.died = cur + delta;
    else if (field === "leftBehind") row.leftBehind = cur + delta;
    else if (field === "quizSuccess") row.quizSuccess = cur + delta;
    else if (field === "quizFailure") row.quizFailure = cur + delta;
    else if (field === "broughtHome") row.broughtHome = cur + delta;
    else if (field === "abandoned") row.abandoned = cur + delta;
    else if (field === "hits") row.hits = cur + delta;
    else if (field === "misses") row.misses = cur + delta;
    else if (field === "kills") row.kills = cur + delta;
    else if (field === "dodged") row.dodged = cur + delta;
    else if (field === "struck") row.struck = cur + delta;
    next[idx] = row;
    return next;
  }
  if (cells.length >= maxCells) return cells;
  const row = blankCell(partial);
  if (field === "tries") row.tries = delta;
  else if (field === "survived") row.survived = delta;
  else if (field === "died") row.died = delta;
  else if (field === "leftBehind") row.leftBehind = delta;
  else if (field === "quizSuccess") row.quizSuccess = delta;
  else if (field === "quizFailure") row.quizFailure = delta;
  else if (field === "broughtHome") row.broughtHome = delta;
  else if (field === "abandoned") row.abandoned = delta;
  else if (field === "hits") row.hits = delta;
  else if (field === "misses") row.misses = delta;
  else if (field === "kills") row.kills = delta;
  else if (field === "dodged") row.dodged = delta;
  else if (field === "struck") row.struck = delta;
  return [...cells, row];
}

function cellsForAction(ctx: LearningPickContext, stage: LearningStage, action: LearningAction): MechLearningCell[] {
  const base = { distance: stage.distance, circle: stage.circle, hp: stage.hp, cargo: stage.cargo };
  const out: MechLearningCell[] = [];
  out.push({ ledger: "survival", action, subject: "none", ...base, tries: 0 });
  if (action === "fight" || action === "flee") {
    out.push({ ledger: "combat", action, subject: ctx.subjects.fight, ...base, tries: 0 });
  }
  const transportSubject =
    action === "carry"
      ? ctx.subjects.carry
      : action === "drop"
        ? ctx.subjects.drop
        : action === "hold" || action === "extract"
          ? ctx.subjects.holdTransport
          : null;
  if (transportSubject) {
    out.push({ ledger: "transport", action, subject: transportSubject, ...base, tries: 0 });
  }
  return out;
}

function actionExpectation(cells: MechLearningCell[], ctx: LearningPickContext, stage: LearningStage, action: LearningAction): number {
  let sum = 0;
  for (const partial of cellsForAction(ctx, stage, action)) {
    const existing = findCell(cells, cellKey(partial));
    sum += learningExpectation(existing ?? partial);
  }
  return sum;
}

function survivalTries(cells: MechLearningCell[], ctx: LearningPickContext, stage: LearningStage, action: LearningAction): number {
  const partial = { ledger: "survival" as const, action, subject: "none" as const, ...stage };
  return counter(findCell(cells, cellKey(partial)) ?? blankCell(partial), "tries");
}

export function openLearningActions(ctx: LearningMenuContext): LearningAction[] {
  if (!ctx.alive) return [];
  const base: LearningAction[] =
    ctx.stance === "recover"
      ? ["hold", "carry", "fight", "flee", "drop", "extract"]
      : ["hold", "fight", "flee", "drop", "extract"];
  const out: LearningAction[] = [];
  for (const action of LEARNING_ACTION_ORDER) {
    if (!base.includes(action)) continue;
    if (action === "fight" && !ctx.seesEnemy) continue;
    if (action === "carry" && !ctx.recoverSalvageOk) continue;
    if (action === "drop" && (ctx.unitLoad <= 0 || ctx.timedOut)) continue;
    if (action === "extract" && !ctx.hasBoarding) continue;
    out.push(action);
  }
  return out;
}

export function chooseLearningAction(
  cells: MechLearningCell[],
  ctx: LearningPickContext,
  stage: LearningStage,
): { action: LearningAction; cells: MechLearningCell[] } {
  const menu = openLearningActions(ctx);
  if (menu.length === 0) return { action: "hold", cells };
  const inexperienced = menu.filter((a) => survivalTries(cells, ctx, stage, a) === 0);
  let pick: LearningAction;
  if (inexperienced.length > 0) {
    const idx = ctx.decisionCount % inexperienced.length;
    pick = inexperienced[idx]!;
  } else {
    let best = menu[0]!;
    let bestScore = actionExpectation(cells, ctx, stage, best);
    for (const action of menu) {
      const score = actionExpectation(cells, ctx, stage, action);
      if (score > bestScore) {
        best = action;
        bestScore = score;
      }
    }
    pick = best;
  }
  let next = cells;
  for (const partial of cellsForAction(ctx, stage, pick)) {
    next = upsertCellCounter(next, partial, "tries", 1);
  }
  return { action: pick, cells: next };
}

export type LearningEvent =
  | { kind: "hit" | "miss" | "kill" | "dodged" | "struck"; subject: LearningSubject }
  | { kind: "quizSuccess" | "quizFailure"; subject: Exclude<LearningSubject, "none"> }
  | { kind: "survived" | "died" | "leftBehind" }
  | { kind: "broughtHome" | "abandoned"; subject: Exclude<LearningSubject, "none" | "normal"> };

export function noteLearningEvent(
  cells: MechLearningCell[],
  stage: LearningStage,
  action: LearningAction,
  event: LearningEvent,
  maxCells = 4096,
): MechLearningCell[] {
  const base = { distance: stage.distance, circle: stage.circle, hp: stage.hp, cargo: stage.cargo, action };
  if (event.kind === "survived" || event.kind === "died" || event.kind === "leftBehind") {
    return upsertCellCounter(
      cells,
      { ledger: "survival", subject: "none", ...base },
      event.kind,
      1,
      maxCells,
    );
  }
  if (
    event.kind === "hit" ||
    event.kind === "miss" ||
    event.kind === "kill" ||
    event.kind === "dodged" ||
    event.kind === "struck"
  ) {
    const field =
      event.kind === "kill"
        ? "kills"
        : event.kind === "hit"
          ? "hits"
          : event.kind === "miss"
            ? "misses"
            : event.kind === "dodged"
              ? "dodged"
              : "struck";
    return upsertCellCounter(cells, { ledger: "combat", subject: event.subject, ...base }, field, 1, maxCells);
  }
  if (event.kind === "quizSuccess" || event.kind === "quizFailure") {
    return upsertCellCounter(
      cells,
      { ledger: "transport", subject: event.subject, ...base },
      event.kind,
      1,
      maxCells,
    );
  }
  if (event.kind === "broughtHome" || event.kind === "abandoned") {
    return upsertCellCounter(
      cells,
      { ledger: "transport", subject: event.subject, ...base },
      event.kind,
      1,
      maxCells,
    );
  }
  return cells;
}

export function isLearningWingman(unit: Unit): boolean {
  return unit.kind === "wingman" && !!unit.instanceId?.trim();
}

export function readLearningAction(unit: Unit): LearningAction {
  const a = unit.learningAction;
  if (a === "drop" || a === "flee" || a === "fight" || a === "carry" || a === "extract" || a === "hold") return a;
  return "hold";
}

function wreckSubject(world: World, wreckUnitId: string): LearningSubject {
  const ids = world.circuitIdsByUnit[wreckUnitId] ?? [];
  return ids.length > 0 ? "circuit" : "wreck";
}

export function highestCargoSubjectForUnit(world: World, unit: Unit): LearningSubject | null {
  const wrecks = (world.circuitPlay?.carry?.[unit.id] ?? []).slice();
  let hasWreck = false;
  let hasCircuit = false;
  for (const id of wrecks) {
    if (wreckSubject(world, id) === "circuit") hasCircuit = true;
    else hasWreck = true;
  }
  if (hasCircuit) return "circuit";
  if (hasWreck) return "wreck";
  if (unit.salvagedCount > 0) return "container";
  return null;
}
