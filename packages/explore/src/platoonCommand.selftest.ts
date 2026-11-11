/**
 * 小隊長の完全自律と指揮学習 (2026-11-11 神宮 TASK_ASSIGNMENT). docs/AUTONOMOUS_LEARNING_V0.md 「小隊長の指揮学習」.
 */
import assert from "node:assert/strict";
import {
  FALSE_BOARD_EFFECT_KEYS,
  TRUE_BOARD_EFFECT_KEYS,
  CIRCUIT_EFFECT_LABEL_JA,
  PLATOON_LEADER_SIDE,
  assignMissingEffectKeys,
  buildDebugCircuit,
  buildSizedTruePuzzleIdV2,
  classifyCircuit,
  copyMechCommandForInstance,
  copyMechLearningForInstance,
  createNewGameHub,
  createOwnedMech,
  effectKeyForCircuit,
  encodeEdgeState,
  isPlatoonLeaderCircuit,
  normalizeHubSnapshot,
  resolveSizedTruePuzzle,
  settleMechLearningOnHub,
  weaponCategory,
  type HubCircuitRecord,
  type HubSnapshot,
  type MechCommandCell,
} from "@estg/shared";
import { createWorld, bootstrapFromSearch, startSortie } from "./game/world";
import { tickWorld, updateBullets, type PlayerInput } from "./game/sim";
import { attachCircuitPlay } from "./game/circuitPlay";
import { isCommandUnlockedFor } from "./game/commandUnlock";
import { executeExploreCommand } from "./game/commands";
import {
  COMMAND_DECISION_SEC,
  captainIsPlatoonLeader,
  chooseCommandStance,
  commandExpectation,
  finalizeCommandSortie,
  isPlatoonLeaderUnit,
  tickPlatoonCommand,
} from "./game/platoonCommand";
import { applyMechLearningHubSide } from "./game/outcome";
import { getCoverObjects } from "./game/coverObjects";
import type { Bullet, World } from "./game/types";

// --- the key (K2・G1・G2・G3) ---------------------------------------------------------------
assert.equal(TRUE_BOARD_EFFECT_KEYS.at(-1), "platoon_leader", "appended at the end of the true-board keys");
assert.ok(!(FALSE_BOARD_EFFECT_KEYS as readonly string[]).includes("platoon_leader"), "never on a false board");
assert.equal(CIRCUIT_EFFECT_LABEL_JA.platoon_leader, "小隊長");
assert.equal(weaponCategory("platoon_leader"), null, "not a weapon / special ammo / shield");
assert.equal(PLATOON_LEADER_SIDE, 10);

function sizedTrue(id: string, side: number, key?: string): HubCircuitRecord {
  const puzzleId = buildSizedTruePuzzleIdV2(id, side, side);
  const sized = resolveSizedTruePuzzle(puzzleId)!;
  const board = { v: 1 as const, cols: side, rows: side, edgeState: encodeEdgeState(sized.solution), puzzleId, outcome: "fully_awakened" as const, perfect: true, locked: true };
  return { circuitId: id, circuitBoard: board, outcome: "fully_awakened", restoreState: "fully_awakened", locked: true, origin: "crafted", equippedTo: null, ...(key ? { effectKey: key } : {}) } as HubCircuitRecord;
}
{
  // Only side 10 draws it, from the same equal pick as the other true keys.
  const keysAt = (side: number) => new Set(Array.from({ length: 160 }, (_, i) => effectKeyForCircuit(sizedTrue(`draw-${side}-${i}`, side))));
  const k10 = keysAt(10);
  assert.ok(k10.has("platoon_leader"), "a side-10 true board can draw 小隊長");
  for (const side of [2, 9, 11, 19]) assert.ok(!keysAt(side).has("platoon_leader"), `side ${side} never draws 小隊長`);
  // Other sides draw exactly as before (the pool without the new key, in the same order).
  const before = TRUE_BOARD_EFFECT_KEYS.filter((k) => k !== "platoon_leader");
  for (const side of [3, 9, 12]) for (const k of keysAt(side)) assert.ok((before as readonly string[]).includes(k!));
  // A saved key that fits is never redrawn.
  const saved = sizedTrue("saved-10", 10, "march");
  assert.equal(assignMissingEffectKeys([saved])[0]!.effectKey, "march");
  const pl = sizedTrue("saved-pl", 10, "platoon_leader");
  assert.equal(assignMissingEffectKeys([pl])[0]!.effectKey, "platoon_leader");
  assert.equal(classifyCircuit(pl).effectKey, "platoon_leader");
}
{
  // Designation (K1・G1): side 10, Fully Awakened, key, effect > 0.
  const pl = sizedTrue("pl-ok", 10, "platoon_leader");
  assert.equal(isPlatoonLeaderCircuit(pl), true);
  assert.equal(isPlatoonLeaderCircuit({ ...pl, restoreState: "bypass", outcome: "bypass" }), false, "Bypass never designates");
  assert.equal(isPlatoonLeaderCircuit({ ...pl, restoreState: "offline", outcome: "offline" }), false, "Offline never designates");
  assert.equal(isPlatoonLeaderCircuit({ ...pl, restoreState: null, outcome: null } as unknown as HubCircuitRecord), false, "not restored");
  assert.equal(isPlatoonLeaderCircuit(sizedTrue("pl-9", 9, "platoon_leader")), false, "only side 10");
  assert.equal(isPlatoonLeaderCircuit(buildDebugCircuit("lab-pl", null, "platoon_leader", true)), true, "the debug lab builds a 10×10 one");
}

// --- save: command cells next to the v0 cells (P2) -------------------------------------------
{
  const v0 = { ledger: "survival" as const, action: "hold" as const, subject: "none" as const, distance: "near" as const, circle: "inside" as const, hp: "high" as const, cargo: "none" as const, tries: 3 };
  const cmd: MechCommandCell = { ledger: "command", stance: "raid", subject: "normal", kills: 2 };
  const hub = normalizeHubSnapshot({ ...createNewGameHub(), mechLearning: { byMech: { cap: [v0, cmd, { ledger: "command", stance: "nope", subject: "none" }] }, settledSortieIds: [] } });
  assert.equal(hub.mechLearning!.byMech.cap!.length, 2, "a broken command cell is dropped, the rest kept");
  assert.deepEqual(copyMechCommandForInstance(hub.mechLearning, "cap"), [cmd]);
  assert.equal(copyMechLearningForInstance(hub.mechLearning, "cap").length, 1, "v0 work never sees command cells");
  // Settle replaces only the part that was worked.
  const s1 = settleMechLearningOnHub(hub, { cap: [{ ...v0, tries: 4 }] }, "s-1");
  assert.deepEqual(copyMechCommandForInstance(s1.mechLearning, "cap"), [cmd], "command part kept when not worked");
  const s2 = settleMechLearningOnHub(s1, {}, "s-2", 0, { cap: [{ ...cmd, kills: 5 }] });
  assert.equal(copyMechCommandForInstance(s2.mechLearning, "cap")[0]!.kills, 5);
  assert.equal(copyMechLearningForInstance(s2.mechLearning, "cap")[0]!.tries, 4, "v0 part kept when not worked");
  assert.equal(copyMechCommandForInstance(createNewGameHub().mechLearning, "cap").length, 0, "old save → empty");
}

// --- choosing a mission (S2・S4) --------------------------------------------------------------
{
  const all = ["escort", "patrol", "recover", "raid"] as const;
  assert.equal(chooseCommandStance([], all, 0), "escort", "untried first, fixed order");
  assert.equal(chooseCommandStance([], all, 1), "patrol", "rotated by the decision count");
  const tried = (stance: (typeof all)[number], extra: Partial<MechCommandCell> = {}): MechCommandCell => ({ ledger: "command", stance, subject: "none", tries: 1, ...extra });
  const cells = [tried("escort", { survived: 1 }), tried("patrol", { died: 1 }), tried("raid", { survived: 1 })];
  assert.equal(chooseCommandStance(cells, all, 0), "recover", "the only untried one");
  const full = [...cells, tried("recover", { leftBehind: 1 })];
  assert.equal(chooseCommandStance(full, all, 0), "escort", "tie (escort = raid = +100) → fixed order");
  const withKills = [...full, { ledger: "command" as const, stance: "raid" as const, subject: "normal" as const, kills: 1 }];
  assert.equal(commandExpectation(withKills, "raid"), 102, "+100 survival + kills/tries × 2");
  assert.equal(chooseCommandStance(withKills, all, 0), "raid");
  const home = [...full, { ledger: "command" as const, stance: "recover" as const, subject: "circuit" as const, broughtHome: 1 }];
  assert.equal(commandExpectation(home, "recover"), -80 + 40, "left behind −80 + circuit brought home +40");
  assert.equal(commandExpectation([], "escort"), 0);
  assert.equal(chooseCommandStance(full, ["escort", "patrol", "raid"], 0), "escort", "recover closed → not chosen");
}

// --- in a sortie -------------------------------------------------------------------------------
const idle: PlayerInput = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };
function hubWith(captainCircuits: HubCircuitRecord[]): HubSnapshot {
  const base = createNewGameHub();
  return {
    ...base,
    fleet: [createOwnedMech("mech_gen1", { instanceId: "cap" }), createOwnedMech("mech_gen1", { instanceId: "wa" }), createOwnedMech("mech_gen1", { instanceId: "wb" })],
    circuits: captainCircuits.map((c) => ({ ...c, equippedTo: "cap" })),
  } as HubSnapshot;
}
function sortie(captainCircuits: HubCircuitRecord[], release = true): World {
  const w = createWorld(bootstrapFromSearch(""));
  startSortie(w);
  getCoverObjects(w).splice(0);
  w.containers.splice(0);
  for (const e of w.enemies) e.pos = { x: 9000, y: 9000 };
  w.deployedInstanceIds = ["cap", "wa", "wb"];
  w.leader.instanceId = "cap";
  w.wingmen[0]!.instanceId = "wa";
  w.wingmen[1]!.instanceId = "wb";
  w.leader.pos = { x: 300, y: 300 };
  for (const x of w.wingmen) x.pos = { x: 320, y: 300 };
  attachCircuitPlay(w, hubWith(captainCircuits), release);
  w.mechLearningReady = true;
  w.mechLearningWork = {};
  w.mechCommandWork = { cap: [] };
  return w;
}
const PL = sizedTrue("cap-pl", 10, "platoon_leader");
const cmd = (w: World) => w.mechCommandWork!.cap ?? [];
const triesOf = (w: World, stance: string) => cmd(w).find((c) => c.stance === stance && c.subject === "none")?.tries ?? 0;
{
  const w = sortie([PL]);
  assert.equal(captainIsPlatoonLeader(w), true);
  assert.equal(isPlatoonLeaderUnit(w, w.wingmen[0]!), false);
  // C2: the four missions are the captain's controls, even in release.
  for (const id of ["wing_escort", "wing_patrol", "wing_recover", "wing_raid"] as const) assert.equal(isCommandUnlockedFor(w, id), true, id);
  for (const id of ["extract", "abort"] as const) assert.equal(isCommandUnlockedFor(w, id), true, `${id} stays`);
  // C2: no manual move for a living captain-小隊長 (no 1×1 → it stays).
  const x0 = w.leader.pos.x;
  for (let i = 0; i < 40; i++) tickWorld(w, 0.05, { ...idle, move: { x: 1, y: 0 } });
  assert.ok(Math.abs(w.leader.pos.x - x0) < 1, "WASD does not move the captain-小隊長");
  // E1: it issued its own first mission at the start: untried → escort, to both wingmen.
  assert.equal(triesOf(w, "escort"), 2, "counted once per wingman that received it");
  assert.equal(w.wingmen[0]!.commandOrder, "escort");
  // A player mission is recorded the same way and resets the self-issue timer.
  const r = executeExploreCommand(w, { id: "wing_raid" });
  assert.equal(r.status, "done");
  assert.equal(triesOf(w, "raid"), 2);
  assert.equal(w.wingmen[1]!.stance, "raid");
  const at = w.commandDecisionAt!;
  tickPlatoonCommand(w);
  assert.equal(w.commandDecisionAt, at, "no self-issued mission right after the player's");
  w.elapsed += COMMAND_DECISION_SEC;
  tickPlatoonCommand(w);
  assert.equal(triesOf(w, "patrol"), 2, "after the interval: the next untried mission (recover is closed: no container)");
  // Individual order: one recipient.
  executeExploreCommand(w, { id: "wing_raid", wingId: w.wingmen[0]!.id });
  assert.equal(triesOf(w, "raid"), 3);
  // L2: a kill by a raid recipient counts on raid/normal.
  const shooter = w.wingmen[0]!;
  const foe = w.enemies[0]!;
  foe.pos = { x: shooter.pos.x + 40, y: shooter.pos.y };
  foe.hp = 1;
  const b: Bullet = { alive: true, pos: { x: shooter.pos.x + 20, y: shooter.pos.y }, vel: { x: 400, y: 0 }, ttl: 1, damage: 50, fromEnemy: false, ownerId: shooter.id };
  w.bullets = [b];
  updateBullets(w, 0.1);
  assert.equal(foe.alive, false);
  assert.equal(cmd(w).find((c) => c.stance === "raid" && c.subject === "normal")?.kills, 1);
  // L2: settlement on the last mission each recipient received.
  w.extracted = true;
  w.wingmen[1]!.alive = false;
  finalizeCommandSortie(w);
  assert.equal(cmd(w).find((c) => c.stance === "raid" && c.subject === "none")?.survived, 1, "wing-a: last mission raid, came home");
  assert.equal(cmd(w).find((c) => c.stance === "patrol" && c.subject === "none")?.died, 1, "wing-b: last mission patrol, wrecked");
  finalizeCommandSortie(w);
  assert.equal(cmd(w).find((c) => c.stance === "raid" && c.subject === "none")?.survived, 1, "settled once");
  // Saved into the captain's byMech slot.
  const hub = applyMechLearningHubSide(w, normalizeHubSnapshot(hubWith([PL])));
  assert.ok(copyMechCommandForInstance(hub.mechLearning, "cap").some((c) => c.stance === "raid" && c.kills === 1));
}
{
  // Recover: bring-home counts on the subject.
  const w = sortie([PL]);
  w.containers.push({ id: "rc", pos: { x: 330, y: 300 }, taken: false, discovered: true, glowT: 0 });
  executeExploreCommand(w, { id: "wing_recover", wingId: w.wingmen[0]!.id });
  assert.equal(w.wingmen[0]!.commandOrder, "recover");
  w.wingmen[0]!.salvagedCount = 1;
  tickWorld(w, 0.05, { ...idle });
  w.extracted = true;
  finalizeCommandSortie(w);
  assert.equal(cmd(w).find((c) => c.stance === "recover" && c.subject === "container")?.broughtHome, 1);
}
{
  // C4: a wrecked captain-小隊長 still commands.
  const w = sortie([PL]);
  w.leader.alive = false;
  w.leader.hp = 0;
  w.commandDecisionAt = w.elapsed - COMMAND_DECISION_SEC;
  tickPlatoonCommand(w);
  assert.ok(cmd(w).some((c) => (c.tries ?? 0) > 0), "the command continues after the wreck");
}
{
  // Not a 小隊長: Bypass circuit, no instanceId, or an old checkpoint without the field.
  const bypass = sortie([{ ...PL, circuitId: "bp", restoreState: "bypass", outcome: "bypass" }]);
  assert.equal(captainIsPlatoonLeader(bypass), false);
  assert.equal(isCommandUnlockedFor(bypass, "wing_patrol"), false, "release: patrol stays locked without a 小隊長");
  const x0 = bypass.leader.pos.x;
  for (let i = 0; i < 20; i++) tickWorld(bypass, 0.05, { ...idle, move: { x: 1, y: 0 } });
  assert.ok(bypass.leader.pos.x > x0 + 5, "a normal captain still walks");
  assert.equal((bypass.mechCommandWork!.cap ?? []).length, 0, "nothing recorded");
  const noId = sortie([PL]);
  noId.leader.instanceId = null;
  assert.equal(captainIsPlatoonLeader(noId), false);
  const old = sortie([PL]);
  delete old.circuitPlay!.platoonLeader;
  assert.equal(captainIsPlatoonLeader(old), false, "old checkpoint → not a 小隊長");
}
{
  // A wingman with the circuit is designated, but issues nothing (split undecided).
  const w = sortie([]);
  w.circuitPlay!.platoonLeader = { "wing-a": true };
  assert.equal(isPlatoonLeaderUnit(w, w.wingmen[0]!), true);
  assert.equal(captainIsPlatoonLeader(w), false);
  w.commandDecisionAt = undefined;
  tickPlatoonCommand(w);
  assert.equal(Object.values(w.mechCommandWork ?? {}).flat().length, 0);
}
{
  // 1×1 完全 + 小隊長: the captain's body is autonomous; the manual input still does nothing.
  const w = sortie([PL]);
  w.circuitPlay!.captainTrueOne = true;
  for (let i = 0; i < 20; i++) tickWorld(w, 0.05, { ...idle, move: { x: 1, y: 0 } });
  assert.ok((w.leader.learningDecisionCount ?? 0) >= 1, "the autonomous captain decides even while keys are held");
}

console.log("explore platoon command selftest: ok");
