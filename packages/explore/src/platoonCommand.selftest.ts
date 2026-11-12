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
import { attachCircuitPlay, placeCarried } from "./game/circuitPlay";
import { isCommandUnlockedFor } from "./game/commandUnlock";
import { executeExploreCommand } from "./game/commands";
import { BALANCE } from "./game/balance";
import { COLORS } from "./game/mapShapes";
import { renderWorld } from "./game/render";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import {
  COMMAND_DECISION_SEC,
  COMMAND_RING_SEC,
  activeCommandRings,
  captainIsPlatoonLeader,
  chooseCommandStance,
  commandExpectation,
  finalizeCommandSortie,
  isPlatoonLeaderUnit,
  tickPlatoonCommand,
} from "./game/platoonCommand";
import { applyMechLearningHubSide, ensureMechLearningWorld } from "./game/outcome";
import { getCoverObjects } from "./game/coverObjects";
import type { Bullet, Unit, World } from "./game/types";
import type { MechCommandStance } from "@estg/shared";

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
  // A wingman 小隊長 with nobody outside the captain's 7500 still issues nothing.
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

// --- 2026-11-12 range, split, undelivered ------------------------------------
assert.equal(BALANCE.commandRangeCaptain, 7500);
assert.equal(BALANCE.commandRangePlatoonLeader, 1500);
assert.equal(COMMAND_RING_SEC, 2);

function shrink(w: World, captain = 100, platoon = 80): void {
  w.balance = { ...w.balance, commandRangeCaptain: captain, commandRangePlatoonLeader: platoon };
}
function cellTries(w: World, id: string, stance: string): number {
  return (w.mechCommandWork?.[id] ?? []).find((c) => c.stance === stance && c.subject === "none")?.tries ?? 0;
}
function pendingFor(w: World, wingId: string) {
  return (w.commandPending ?? []).filter((p) => p.wingId === wingId);
}
/** Leave every stance but `open` already tried, so the next choice is `open`. */
function openStance(open: MechCommandStance): MechCommandCell[] {
  return (["escort", "patrol", "raid"] as const)
    .filter((s) => s !== open)
    .map((s) => ({ ledger: "command" as const, stance: s, subject: "none" as const, tries: 1, died: 1 }));
}
function addWing(w: World, id: string, instanceId: string, pos: { x: number; y: number }): Unit {
  const src = w.wingmen[0]!;
  const u: Unit = {
    ...src,
    id,
    instanceId,
    name: id,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    waypoint: null,
    moveTarget: null,
    playerMoveTarget: null,
    commandOrder: undefined,
    commandIssuerId: undefined,
    commandIssuedAt: undefined,
    commandDecisionCount: undefined,
    commandHeldSubjects: undefined,
    alive: true,
    hp: src.maxHp,
    stance: "escort",
    individualOrder: false,
    holdOrder: false,
  };
  w.wingmen.push(u);
  return u;
}
function put(w: World, near: boolean): { near: Unit; far: Unit } {
  const a = w.wingmen[0]!;
  const b = w.wingmen[1]!;
  a.pos = { x: w.leader.pos.x + (near ? 40 : 400), y: w.leader.pos.y };
  b.pos = { x: w.leader.pos.x + 400, y: w.leader.pos.y };
  a.stance = "escort";
  b.stance = "escort";
  delete a.commandOrder;
  delete b.commandOrder;
  delete a.commandIssuerId;
  delete b.commandIssuerId;
  return { near: a, far: b };
}

{
  // In range arrives now. Out of range keeps the last order, and tries waits for delivery.
  // Facing away does not matter: range is distance only.
  const w = sortie([PL]);
  shrink(w);
  w.leader.heading = Math.PI;
  const { near, far } = put(w, true);
  far.stance = "patrol";
  tickPlatoonCommand(w);
  assert.equal(near.commandOrder, "escort");
  assert.equal(near.stance, "escort");
  assert.equal(near.commandIssuerId, "cap");
  assert.equal(far.commandOrder, undefined, "outside: last mission unchanged");
  assert.equal(far.stance, "patrol", "outside: keeps moving on the last order");
  assert.equal(cellTries(w, "cap", "escort"), 1, "tries counts the one who received it");
  assert.equal(pendingFor(w, far.id)[0]?.stance, "escort");
  const at = w.commandDecisionAt!;
  tickPlatoonCommand(w);
  assert.equal(cellTries(w, "cap", "escort"), 1, "still outside: tries does not grow");
  assert.equal(w.commandDecisionAt, at);
  far.pos = { x: w.leader.pos.x + 40, y: w.leader.pos.y };
  tickPlatoonCommand(w);
  assert.equal(far.commandOrder, "escort");
  assert.equal(far.stance, "escort");
  assert.equal(far.commandIssuerId, "cap");
  assert.equal(cellTries(w, "cap", "escort"), 2, "tries grows when it arrives");
  assert.equal(pendingFor(w, far.id).length, 0);
  // Exactly on the radius is inside. One world-unit past it is outside.
  const edge = sortie([PL]);
  shrink(edge, 100, 80);
  edge.wingmen[0]!.pos = { x: edge.leader.pos.x + 100, y: edge.leader.pos.y };
  edge.wingmen[1]!.pos = { x: edge.leader.pos.x + 101, y: edge.leader.pos.y };
  tickPlatoonCommand(edge);
  assert.equal(edge.wingmen[0]!.commandOrder, "escort", "distance == radius is inside");
  assert.equal(edge.wingmen[1]!.commandOrder, undefined, "distance == radius + 1 is outside");
}
{
  // The player's order uses the same range and the same undelivered hold, and restarts the 20 s.
  const w = sortie([PL]);
  shrink(w);
  const { near, far } = put(w, true);
  w.commandDecisionAt = w.elapsed - COMMAND_DECISION_SEC;
  const before = w.elapsed;
  executeExploreCommand(w, { id: "wing_raid" });
  assert.equal(near.commandOrder, "raid");
  assert.equal(near.stance, "raid");
  assert.equal(far.stance, "escort", "outside keeps the previous stance");
  assert.equal(cellTries(w, "cap", "raid"), 1);
  assert.equal(pendingFor(w, far.id)[0]?.stance, "raid");
  assert.equal(w.commandDecisionAt, before, "the player's order restarts the 20 s");
  tickPlatoonCommand(w);
  assert.equal(cellTries(w, "cap", "raid"), 1, "E1 does not fire again in the restarted window");
  assert.equal(w.commandDecisionAt, before);
  far.pos = { x: w.leader.pos.x + 10, y: w.leader.pos.y };
  tickPlatoonCommand(w);
  assert.equal(far.commandOrder, "raid");
  assert.equal(cellTries(w, "cap", "raid"), 2);
}
{
  // ★9 ★A: a newer undelivered order from the same issuer replaces the older one.
  const w = sortie([PL]);
  shrink(w);
  const far = w.wingmen[1]!;
  far.pos = { x: w.leader.pos.x + 400, y: w.leader.pos.y };
  w.wingmen[0]!.pos = { x: w.leader.pos.x + 400, y: w.leader.pos.y + 10 };
  tickPlatoonCommand(w);
  assert.equal(pendingFor(w, far.id)[0]?.stance, "escort");
  assert.equal(cellTries(w, "cap", "escort"), 0);
  executeExploreCommand(w, { id: "wing_raid" });
  assert.equal(pendingFor(w, far.id).length, 1);
  assert.equal(pendingFor(w, far.id)[0]?.stance, "raid");
  far.pos = { x: w.leader.pos.x + 10, y: w.leader.pos.y };
  w.wingmen[0]!.pos = { x: w.leader.pos.x + 10, y: w.leader.pos.y };
  tickPlatoonCommand(w);
  assert.equal(far.commandOrder, "raid", "the newer undelivered order is the one that arrives");
  assert.equal(cellTries(w, "cap", "escort"), 0);
  assert.equal(cellTries(w, "cap", "raid"), 2);
}
{
  // A captain without the circuit still reaches at 7500 (here, the shrunk copy). Cells do not grow.
  const w = sortie([], false);
  w.circuitPlay!.release = false;
  w.commandUnlock = { mode: "all_unlocked", equippedByUnit: {} };
  shrink(w);
  const { near, far } = put(w, true);
  for (const id of ["wing_escort", "wing_patrol", "wing_raid"] as const) {
    delete near.commandOrder;
    delete far.commandOrder;
    far.pos = { x: w.leader.pos.x + 400, y: w.leader.pos.y };
    far.stance = "escort";
    w.commandPending = [];
    executeExploreCommand(w, { id });
    assert.equal(near.stance, id === "wing_escort" ? "escort" : id === "wing_patrol" ? "patrol" : "raid", id);
    assert.equal(far.stance, "escort", `${id} does not reach outside`);
    assert.equal(pendingFor(w, far.id).length, 1, id);
  }
  w.containers.push({ id: "box", pos: { x: 330, y: 300 }, taken: false, discovered: true, glowT: 0 });
  far.pos = { x: w.leader.pos.x + 400, y: w.leader.pos.y };
  executeExploreCommand(w, { id: "wing_recover" });
  assert.equal(near.stance, "recover");
  assert.equal(far.stance, "escort");
  assert.equal(Object.values(w.mechCommandWork ?? {}).flat().length, 0, "no 小隊長 circuit: no command cells");
  far.pos = { x: w.leader.pos.x + 10, y: w.leader.pos.y };
  tickPlatoonCommand(w);
  assert.equal(far.stance, "recover", "the held recover arrives with no cell");
  assert.equal(Object.values(w.mechCommandWork ?? {}).flat().length, 0);
}
{
  // Wingman 小隊長: only living wingmen outside the captain and inside its own circle.
  // It chooses from its own cells, never orders itself, and repeats on its own 20 s.
  const w = sortie([PL]);
  shrink(w, 100, 80);
  w.leader.pos = { x: 300, y: 300 };
  const pl = w.wingmen[0]!;
  const target = w.wingmen[1]!;
  pl.pos = { x: 300, y: 500 };
  target.pos = { x: 300, y: 540 };
  w.circuitPlay!.platoonLeader = { ...(w.circuitPlay!.platoonLeader ?? {}), [pl.id]: true };
  w.mechCommandWork = { cap: [], wa: openStance("raid") };
  const inside = addWing(w, "wing-c", "wc", { x: 340, y: 300 });
  tickPlatoonCommand(w);
  assert.equal(target.commandOrder, "raid", "outside the captain and inside the 小隊長");
  assert.equal(target.commandIssuerId, "wa");
  assert.equal(target.stance, "raid");
  assert.equal(cellTries(w, "wa", "raid"), 1, "counted on the issuer, once");
  assert.equal(pl.commandOrder, undefined, "a 小隊長 does not order itself");
  assert.equal(pl.stance, "escort");
  assert.equal(inside.commandIssuerId, "cap", "inside the captain's circle stays with the captain");
  assert.notEqual(inside.commandIssuerId, "wa");
  assert.equal(cellTries(w, "cap", "escort"), 1, "the captain reached only the one inside");
  assert.equal(pl.commandIssuedAt, w.elapsed);
  const issuedAt = pl.commandIssuedAt;
  tickPlatoonCommand(w);
  assert.equal(cellTries(w, "wa", "raid"), 1, "not again before 20 s");
  w.elapsed += COMMAND_DECISION_SEC - 1;
  tickPlatoonCommand(w);
  assert.equal(cellTries(w, "wa", "raid"), 1);
  assert.equal(pl.commandIssuedAt, issuedAt);
  w.elapsed += 1;
  tickPlatoonCommand(w);
  assert.equal(target.commandOrder, "raid", "20 s later it issues again from its own cells");
  assert.equal(cellTries(w, "wa", "raid"), 2);
  assert.equal(pl.commandOrder, undefined, "the later issue is still not aimed at itself");
  assert.equal(pl.commandIssuedAt, w.elapsed, "its own issue restarts its own 20 s");
}
{
  // ★8 ★A: the captain issuing does not restart a wingman 小隊長's 20 s.
  const w = sortie([PL]);
  shrink(w, 100, 80);
  const pl = w.wingmen[0]!;
  const target = w.wingmen[1]!;
  pl.pos = { x: 300, y: 500 };
  target.pos = { x: 300, y: 540 };
  w.leader.pos = { x: 300, y: 300 };
  w.circuitPlay!.platoonLeader = { ...(w.circuitPlay!.platoonLeader ?? {}), [pl.id]: true };
  w.mechCommandWork = { cap: [], wa: openStance("raid") };
  tickPlatoonCommand(w);
  assert.equal(pl.commandIssuedAt, w.elapsed);
  w.elapsed += 10;
  executeExploreCommand(w, { id: "wing_patrol" });
  assert.equal(pl.commandIssuedAt, w.elapsed - 10, "the captain's order does not restart the 小隊長");
  w.elapsed += 10;
  tickPlatoonCommand(w);
  assert.equal(pl.commandIssuedAt, w.elapsed, "20 s from its own issue, it issues again");
}
{
  // B3: with no captain order due, the nearer 小隊長 wins. Equal distance → earlier in wingmen.
  const w = sortie([]);
  shrink(w, 30, 100);
  w.leader.pos = { x: 100, y: 100 };
  const a = w.wingmen[0]!;
  const b = w.wingmen[1]!;
  const target = addWing(w, "wing-c", "wc", { x: 500, y: 500 });
  a.pos = { x: 500, y: 440 };
  b.pos = { x: 500, y: 580 };
  w.circuitPlay!.platoonLeader = { [a.id]: true, [b.id]: true };
  w.mechCommandWork = { wa: openStance("raid"), wb: openStance("patrol") };
  tickPlatoonCommand(w);
  assert.equal(target.commandOrder, "raid");
  assert.equal(target.commandIssuerId, "wa", "the nearer 小隊長 wins");
  assert.equal(cellTries(w, "wa", "raid"), 1);
  assert.equal(cellTries(w, "wb", "patrol"), 0, "the loser did not reach, so tries stays");
  // The later one is nearer.
  const w2 = sortie([]);
  shrink(w2, 30, 100);
  w2.leader.pos = { x: 100, y: 100 };
  const a2 = w2.wingmen[0]!;
  const b2 = w2.wingmen[1]!;
  const t2 = addWing(w2, "wing-c", "wc", { x: 500, y: 500 });
  a2.pos = { x: 500, y: 420 };
  b2.pos = { x: 500, y: 560 };
  w2.circuitPlay!.platoonLeader = { [a2.id]: true, [b2.id]: true };
  w2.mechCommandWork = { wa: openStance("raid"), wb: openStance("patrol") };
  tickPlatoonCommand(w2);
  assert.equal(t2.commandIssuerId, "wb", "nearer wins even when it is later in the array");
  // Equal distance: the earlier wingman.
  const w3 = sortie([]);
  shrink(w3, 30, 150);
  w3.leader.pos = { x: 100, y: 100 };
  const a3 = w3.wingmen[0]!;
  const b3 = w3.wingmen[1]!;
  const t3 = addWing(w3, "wing-c", "wc", { x: 500, y: 500 });
  a3.pos = { x: 500, y: 400 };
  b3.pos = { x: 500, y: 600 };
  w3.circuitPlay!.platoonLeader = { [a3.id]: true, [b3.id]: true };
  w3.mechCommandWork = { wa: openStance("raid"), wb: openStance("patrol") };
  tickPlatoonCommand(w3);
  assert.equal(t3.commandIssuerId, "wa", "equal distance: earlier in wingmen");
  assert.equal(t3.commandOrder, "raid");
}
{
  // B3: once the captain's held order arrives, it replaces the 小隊長's order.
  const w = sortie([PL]);
  shrink(w, 100, 80);
  w.leader.pos = { x: 300, y: 300 };
  const pl = w.wingmen[0]!;
  const target = w.wingmen[1]!;
  pl.pos = { x: 300, y: 500 };
  target.pos = { x: 300, y: 540 };
  w.circuitPlay!.platoonLeader = { ...(w.circuitPlay!.platoonLeader ?? {}), [pl.id]: true };
  w.mechCommandWork = { cap: [], wa: openStance("raid") };
  tickPlatoonCommand(w);
  assert.equal(target.commandIssuerId, "wa");
  assert.equal(target.commandOrder, "raid");
  assert.equal(cellTries(w, "cap", "escort"), 0, "the captain's order has not arrived");
  target.pos = { x: 300, y: 360 };
  tickPlatoonCommand(w);
  assert.equal(target.commandOrder, "escort");
  assert.equal(target.commandIssuerId, "cap", "the captain wins when the order arrives");
  assert.equal(cellTries(w, "cap", "escort"), 1);
}
{
  // tries, a kill, and settlement belong to the 小隊長 who issued the mission.
  const w = sortie([PL]);
  shrink(w, 100, 80);
  w.leader.pos = { x: 300, y: 300 };
  const pl = w.wingmen[0]!;
  const shooter = w.wingmen[1]!;
  pl.pos = { x: 300, y: 500 };
  shooter.pos = { x: 300, y: 540 };
  w.circuitPlay!.platoonLeader = { ...(w.circuitPlay!.platoonLeader ?? {}), [pl.id]: true };
  w.mechCommandWork = { cap: [], wa: openStance("raid") };
  w.commandDecisionAt = w.elapsed;
  tickPlatoonCommand(w);
  assert.equal(shooter.commandOrder, "raid");
  assert.equal(cellTries(w, "wa", "raid"), 1);
  assert.equal(cellTries(w, "cap", "raid"), 0);
  const foe = w.enemies[0]!;
  foe.pos = { x: shooter.pos.x + 40, y: shooter.pos.y };
  foe.hp = 1;
  foe.alive = true;
  w.bullets = [{ alive: true, pos: { x: shooter.pos.x + 20, y: shooter.pos.y }, vel: { x: 400, y: 0 }, ttl: 1, damage: 50, fromEnemy: false, ownerId: shooter.id }];
  updateBullets(w, 0.1);
  assert.equal(foe.alive, false);
  assert.equal((w.mechCommandWork!.wa ?? []).find((c) => c.stance === "raid" && c.subject === "normal")?.kills, 1);
  assert.equal((w.mechCommandWork!.cap ?? []).find((c) => c.subject === "normal")?.kills ?? 0, 0);
  w.extracted = true;
  finalizeCommandSortie(w);
  assert.equal((w.mechCommandWork!.wa ?? []).find((c) => c.stance === "raid" && c.subject === "none")?.survived, 1);
  assert.equal((w.mechCommandWork!.cap ?? []).some((c) => (c.survived ?? 0) > 0), false);
}
{
  // ★7 ★A: a wrecked wingman 小隊長 issues nothing and draws no ring.
  const w = sortie([]);
  shrink(w, 30, 80);
  w.leader.pos = { x: 100, y: 100 };
  const pl = w.wingmen[0]!;
  const target = w.wingmen[1]!;
  pl.pos = { x: 500, y: 500 };
  target.pos = { x: 500, y: 540 };
  pl.alive = false;
  pl.hp = 0;
  w.circuitPlay!.platoonLeader = { [pl.id]: true };
  w.mechCommandWork = { wa: [] };
  tickPlatoonCommand(w);
  assert.equal(target.commandOrder, undefined);
  assert.equal(cellTries(w, "wa", "escort"), 0);
  assert.equal(activeCommandRings(w).some((r) => r.issuerUnitId === pl.id), false);
}
{
  // T5 暫定: a carried wrecked captain is ranged from leader.pos after placeCarried.
  const missed = sortie([PL]);
  shrink(missed, 100, 40);
  missed.leader.alive = false;
  missed.leader.hp = 0;
  missed.leader.pos = { x: 200, y: 300 };
  const carrier = missed.wingmen[0]!;
  const target = missed.wingmen[1]!;
  carrier.pos = { x: 800, y: 300 };
  target.pos = { x: 860, y: 300 };
  missed.circuitPlay!.carry[carrier.id] = [missed.leader.id];
  tickPlatoonCommand(missed);
  assert.equal(target.commandOrder, undefined, "before placeCarried the wreck is still at the old point");
  assert.equal(cellTries(missed, "cap", "escort"), 0);
  const carried = sortie([PL]);
  shrink(carried, 100, 40);
  carried.leader.alive = false;
  carried.leader.hp = 0;
  carried.leader.pos = { x: 200, y: 300 };
  const carrier2 = carried.wingmen[0]!;
  const target2 = carried.wingmen[1]!;
  carrier2.pos = { x: 800, y: 300 };
  target2.pos = { x: 860, y: 300 };
  carried.circuitPlay!.carry[carrier2.id] = [carried.leader.id];
  placeCarried(carried);
  assert.equal(carried.leader.pos.x, 800);
  tickPlatoonCommand(carried);
  assert.equal(target2.commandOrder, "escort");
  assert.equal(target2.commandIssuerId, "cap");
  assert.ok(cellTries(carried, "cap", "escort") >= 1);
  const ring = activeCommandRings(carried).find((r) => r.issuerUnitId === carried.leader.id);
  assert.ok(ring);
  assert.equal(ring!.x, carried.leader.pos.x);
  assert.equal(ring!.y, carried.leader.pos.y);
  assert.equal(ring!.radius, 100);
}
{
  // The ring exists only after a transmission, for 2 s, and a repeat restarts that issuer's clock.
  const w = sortie([PL]);
  shrink(w, 100, 40);
  assert.equal(activeCommandRings(w).length, 0, "nothing issued yet");
  executeExploreCommand(w, { id: "wing_escort" });
  const rings = activeCommandRings(w);
  assert.equal(rings.length, 1);
  assert.equal(rings[0]!.issuerUnitId, w.leader.id);
  assert.equal(rings[0]!.x, w.leader.pos.x);
  assert.equal(rings[0]!.radius, 100);
  assert.equal(rings[0]!.until, w.elapsed + COMMAND_RING_SEC);
  const firstUntil = rings[0]!.until;
  w.elapsed += 0.5;
  executeExploreCommand(w, { id: "wing_patrol" });
  assert.equal(activeCommandRings(w).length, 1, "the same issuer replaces its ring");
  assert.equal(activeCommandRings(w)[0]!.until, w.elapsed + COMMAND_RING_SEC);
  assert.ok(activeCommandRings(w)[0]!.until > firstUntil);
  w.elapsed += COMMAND_RING_SEC;
  assert.equal(activeCommandRings(w).length, 0);
  // renderWorld strokes that ring at a constant 2px in COLORS.wingman, and not before.
  const blank = recordingCtx();
  renderWorld(blank.ctx, w, 720, 420);
  assert.equal(blank.fullCircles(COLORS.wingman, 2).length, 0);
  w.elapsed = rings[0]!.until - 1;
  executeExploreCommand(w, { id: "wing_escort" });
  const drawn = recordingCtx();
  renderWorld(drawn.ctx, w, 720, 420);
  const circles = drawn.fullCircles(COLORS.wingman, 2);
  assert.equal(circles.length, 1);
  assert.equal(circles[0]!.r, 100 * (720 / w.camera.w));
  assert.equal(drawn.ringFilled(), false, "the range ring is a stroke, not a fill");
}
{
  // A sortie checkpoint keeps the undelivered order and the last issuer.
  const w = sortie([PL]);
  shrink(w, 100, 40);
  const near = w.wingmen[0]!;
  const far = w.wingmen[1]!;
  near.pos = { x: w.leader.pos.x + 20, y: w.leader.pos.y };
  far.pos = { x: w.leader.pos.x + 400, y: w.leader.pos.y };
  tickPlatoonCommand(w);
  assert.equal(near.commandIssuerId, "cap");
  assert.equal(pendingFor(w, far.id).length, 1);
  const restored = worldFromCheckpointBody(JSON.parse(JSON.stringify(snapshotSortieWorld(w))))!;
  assert.equal(restored.wingmen[0]!.commandIssuerId, "cap");
  assert.equal(restored.wingmen[1]!.commandOrder, undefined);
  assert.equal(restored.commandPending?.length, 1);
  assert.equal(restored.commandPending![0]!.stance, "escort");
  assert.equal(restored.commandPending![0]!.wingId, far.id);
  restored.wingmen[1]!.pos = { x: restored.leader.pos.x + 10, y: restored.leader.pos.y };
  const tries = cellTries(restored, "cap", "escort");
  tickPlatoonCommand(restored);
  assert.equal(restored.wingmen[1]!.commandOrder, "escort");
  assert.equal(restored.wingmen[1]!.commandIssuerId, "cap");
  assert.equal(cellTries(restored, "cap", "escort"), tries + 1);
}
{
  // A wingman 小隊長's command cells load from that instanceId. No new top-level save key.
  const w = sortie([]);
  w.mechLearningReady = false;
  w.circuitPlay!.platoonLeader = { "wing-a": true };
  w.mechCommandWork = { wa: [{ ledger: "command", stance: "raid", subject: "none", tries: 4 }] };
  ensureMechLearningWorld(w);
  assert.equal(w.mechCommandWork!.wa![0]!.tries, 4, "the wingman 小隊長's cells are kept when the hub has none");
  assert.equal(w.mechCommandWork!.cap, undefined, "a captain who is not a 小隊長 is not given a command slot here");
  const hub = applyMechLearningHubSide(w, normalizeHubSnapshot(createNewGameHub()));
  assert.equal("commandPending" in hub, false);
  assert.equal("commandRings" in hub, false);
}
{
  // The shallow copy did not rewrite the shared radii.
  assert.equal(BALANCE.commandRangeCaptain, 7500);
  assert.equal(BALANCE.commandRangePlatoonLeader, 1500);
}

function recordingCtx(): { ctx: CanvasRenderingContext2D; fullCircles: (style: string, lw: number) => { r: number }[]; ringFilled: () => boolean } {
  let strokeStyle = "";
  let lineWidth = 1;
  const stack: { strokeStyle: string; lineWidth: number }[] = [];
  let pending: { r: number; a0: number; a1: number } | null = null;
  let ringWasFilled = false;
  const arcs: { r: number; a0: number; a1: number; style: string; lw: number }[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, prop) {
      if (prop === "canvas") return { clientWidth: 720, width: 720, height: 420 };
      if (prop === "strokeStyle") return strokeStyle;
      if (prop === "lineWidth") return lineWidth;
      if (prop === "save") return () => { stack.push({ strokeStyle, lineWidth }); };
      if (prop === "restore") {
        return () => {
          const prev = stack.pop();
          if (prev) { strokeStyle = prev.strokeStyle; lineWidth = prev.lineWidth; }
        };
      }
      if (prop === "beginPath") return () => { pending = null; };
      if (prop === "arc") {
        return (_x: number, _y: number, r: number, a0: number, a1: number) => {
          pending = { r, a0, a1 };
        };
      }
      if (prop === "stroke") {
        return () => {
          if (pending) arcs.push({ ...pending, style: strokeStyle, lw: lineWidth });
          pending = null;
        };
      }
      if (prop === "fill") {
        return () => {
          if (pending && pending.a0 === 0 && pending.a1 === Math.PI * 2 && strokeStyle === COLORS.wingman && lineWidth === 2) ringWasFilled = true;
        };
      }
      if (prop === "measureText") return () => ({ width: 10 });
      return () => {};
    },
    set(_t, prop, value) {
      if (prop === "strokeStyle") strokeStyle = String(value);
      if (prop === "lineWidth") lineWidth = Number(value);
      return true;
    },
  });
  return {
    ctx,
    ringFilled: () => ringWasFilled,
    fullCircles: (style, lw) => arcs.filter((a) => a.style === style && a.lw === lw && a.a0 === 0 && a.a1 === Math.PI * 2),
  };
}

console.log("explore platoon command selftest: ok");
