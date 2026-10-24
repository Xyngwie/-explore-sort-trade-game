/**
 * AUTONOMOUS_LEARNING_V0 — spec checks (docs/AUTONOMOUS_LEARNING_V0.md §確認すること).
 */
import assert from "node:assert/strict";
import {
  chooseLearningAction,
  learningExpectation,
  LEARNING_ACTION_ORDER,
  noteLearningEvent,
  type LearningStage,
} from "./game/learning";

const stage: LearningStage = {
  distance: "mid",
  circle: "late",
  hp: "high",
  cargo: "holding",
};

function survivalCell(action: (typeof LEARNING_ACTION_ORDER)[number], tries: number) {
  return {
    ledger: "survival" as const,
    action,
    subject: "none" as const,
    ...stage,
    tries,
    survived: 0,
    died: 0,
    leftBehind: 0,
  };
}

// Unexperienced actions are tried before experienced ones; index uses decisionCount.
{
  const cells = [survivalCell("hold", 3), survivalCell("drop", 0), survivalCell("flee", 3)];
  const pick = chooseLearningAction(cells, {
    stance: "escort",
    alive: true,
    timedOut: false,
    unitLoad: 2,
    droppedThisSortie: false,
    hasBoarding: true,
    seesEnemy: false,
    recoverSalvageOk: false,
    decisionCount: 0,
    subjects: { fight: "normal", carry: "container", drop: "container", holdTransport: "container" },
  }, stage);
  assert.equal(pick.action, "drop", "unexperienced drop first in fixed order");
}

// Same score → fixed order wins (drop before flee).
{
  const cells = LEARNING_ACTION_ORDER.map((a) => survivalCell(a, 1));
  const pick = chooseLearningAction(cells, {
    stance: "escort",
    alive: true,
    timedOut: false,
    unitLoad: 2,
    droppedThisSortie: false,
    hasBoarding: true,
    seesEnemy: true,
    recoverSalvageOk: false,
    decisionCount: 0,
    subjects: { fight: "normal", carry: "container", drop: "container", holdTransport: "container" },
  }, stage);
  assert.equal(pick.action, "drop");
}

// Container + late circle: bad survival makes drop beat hold.
{
  const neutral = (action: (typeof LEARNING_ACTION_ORDER)[number]) => ({ ...survivalCell(action, 2), survived: 1, died: 0, leftBehind: 0 });
  const holdSurvival = { ...survivalCell("hold", 5), survived: 0, died: 5, leftBehind: 0 };
  const dropSurvival = { ...survivalCell("drop", 5), survived: 5, died: 0, leftBehind: 0 };
  const transport = {
    ledger: "transport" as const,
    action: "hold" as const,
    subject: "container" as const,
    ...stage,
    tries: 5,
    quizSuccess: 5,
    quizFailure: 0,
    broughtHome: 5,
    abandoned: 0,
  };
  const cells = [
    neutral("flee"),
    neutral("fight"),
    neutral("extract"),
    holdSurvival,
    dropSurvival,
    transport,
  ];
  const pick = chooseLearningAction(cells, {
    stance: "escort",
    alive: true,
    timedOut: false,
    unitLoad: 1,
    droppedThisSortie: false,
    hasBoarding: false,
    seesEnemy: false,
    recoverSalvageOk: false,
    decisionCount: 0,
    subjects: { fight: "normal", carry: "container", drop: "container", holdTransport: "container" },
  }, stage);
  assert.equal(pick.action, "drop", "container late + bad survival → drop");
}

// Circuit cargo: drop expectation lower than hold even with bad survival.
{
  const badSurvival = (action: (typeof LEARNING_ACTION_ORDER)[number]) => ({
    ...survivalCell(action, 3),
    survived: 0,
    died: 3,
    leftBehind: 0,
  });
  const circuitHold = {
    ledger: "transport" as const,
    action: "hold" as const,
    subject: "circuit" as const,
    ...stage,
    tries: 3,
    broughtHome: 3,
    abandoned: 0,
  };
  const circuitDropFail = {
    ledger: "transport" as const,
    action: "drop" as const,
    subject: "circuit" as const,
    ...stage,
    tries: 3,
    quizFailure: 3,
    quizSuccess: 0,
  };
  const cells = [
    badSurvival("flee"),
    badSurvival("fight"),
    badSurvival("extract"),
    badSurvival("hold"),
    badSurvival("drop"),
    circuitHold,
    circuitDropFail,
  ];
  const pick = chooseLearningAction(cells, {
    stance: "escort",
    alive: true,
    timedOut: false,
    unitLoad: 2,
    droppedThisSortie: false,
    hasBoarding: false,
    seesEnemy: false,
    recoverSalvageOk: false,
    decisionCount: 0,
    subjects: { fight: "normal", carry: "circuit", drop: "circuit", holdTransport: "circuit" },
  }, stage);
  assert.equal(pick.action, "hold", "circuit +40 home keeps hold over drop");
}

// flee beats fight when combat history is deadly (normal +2 kill vs -100 death).
{
  const fleeCells = [
    { ...survivalCell("hold", 2), survived: 2, died: 0, leftBehind: 0 },
    { ...survivalCell("drop", 2), survived: 0, died: 2, leftBehind: 0 },
    { ...survivalCell("flee", 4), survived: 4, died: 0, leftBehind: 0 },
    {
      ledger: "combat" as const,
      action: "fight" as const,
      subject: "normal" as const,
      ...stage,
      tries: 4,
      hits: 4,
      misses: 0,
      kills: 0,
    },
    { ...survivalCell("fight", 4), survived: 0, died: 4, leftBehind: 0 },
  ];
  const pick = chooseLearningAction(fleeCells, {
    stance: "raid",
    alive: true,
    timedOut: false,
    unitLoad: 0,
    droppedThisSortie: false,
    hasBoarding: false,
    seesEnemy: true,
    recoverSalvageOk: false,
    decisionCount: 0,
    subjects: { fight: "normal", carry: "container", drop: null, holdTransport: null },
  }, stage);
  assert.equal(pick.action, "flee");
}

// Quiz vs settlement counters stay separate.
{
  let cells = noteLearningEvent([], stage, "carry", { kind: "quizSuccess", subject: "container" });
  cells = noteLearningEvent(cells, stage, "hold", { kind: "broughtHome", subject: "container" });
  const quiz = cells.find((c) => c.quizSuccess === 1);
  const home = cells.find((c) => c.broughtHome === 1);
  assert.ok(quiz);
  assert.ok(home);
  assert.notEqual(quiz, home);
}

assert.ok(learningExpectation({ ...survivalCell("hold", 1), survived: 1 }) > 0);

console.log("explore learning selftest: ok");
