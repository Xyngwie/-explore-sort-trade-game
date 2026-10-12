/**
 * 項目4-2 僚機の回収と隊長の残骸（feat/explore-carry-wingman-rescue）+ compat.
 */
import assert from "node:assert/strict";
import type { ClassifiedCircuit } from "@estg/shared";
import {
  attachCircuitPlay,
  backfillCircuitPlayState,
  captainActive,
  captainRescuer,
  circuitButtons,
  circuitSpeed,
  handleMapTap,
  openWingPalette,
  pressWingPalette,
  wingmanPaletteActions,
  type CircuitPlayState,
} from "./game/circuitPlay";
import { requestExtract, tickWorld } from "./game/sim";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { IDENTITY_ABILITY_SCALE } from "./game/releaseAbility";
import { unitLoad } from "./game/carry";

const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };

function key(effectKey: string, trueBoard = false): ClassifiedCircuit {
  return { circuitId: `c-${effectKey}`, effect: 4, r: 0.05, effectKey, trueBoard, oneByOne: null, side: 2, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false } as ClassifiedCircuit;
}

function releaseWorld() {
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  attachCircuitPlay(world, null, true);
  const p = world.circuitPlay!;
  for (const id of ["leader", "wing-a", "wing-b"]) p.ability[id] = { ...IDENTITY_ABILITY_SCALE };
  p.wingTrueOne = {};
  p.captainTrueOne = false;
  for (const e of world.enemies) { e.alive = false; e.hp = 0; }
  for (const c of world.containers) { c.discovered = false; c.pos = { x: 20, y: 20 }; }
  world.coverObjects = [];
  world.leader.pos = { x: 400, y: 400 };
  world.leader.instanceId = world.leader.instanceId ?? "cap-1";
  world.wingmen[0]!.pos = { x: 420, y: 430 };
  world.wingmen[1]!.pos = { x: 380, y: 430 };
  world.timeLeft = 900;
  p.loadout["wing-a"] = [key("recover")];
  return world;
}
type W = ReturnType<typeof releaseWorld>;
const run = (world: W, sec: number) => { for (let t = 0; t < sec - 1e-9; t += 0.05) { if (world.phase !== "sortie") break; tickWorld(world, 0.05, idle); } };
const wa = (w: W) => w.wingmen[0]!;

// C1a/b: palette 「回収」 without the captain's 「4」; 移動 only with the 「4」.
{
  const world = releaseWorld();
  assert.deepEqual(wingmanPaletteActions(world, ["wing-a"]).map((a) => a.id), ["recover"]);
  assert.deepEqual(wingmanPaletteActions(world, ["wing-b"]), [], "no circuit, no 4 → no palette");
  world.circuitPlay!.captainTrueOne = true;
  assert.deepEqual(wingmanPaletteActions(world, ["wing-a"]).map((a) => a.id), ["move", "recover"]);
  assert.deepEqual(wingmanPaletteActions(world, ["wing-b"]).map((a) => a.id), ["move"]);
  console.log("explore 4-2 C1a/b palette 回収 without the 4 ok");
}

// C1c/d: far container — walks there, 8 s, then waits; a called circle pulls it in.
{
  const world = releaseWorld();
  const crate = world.containers[0]!;
  crate.discovered = true; crate.taken = false; crate.pos = { x: 1000, y: 430 };
  assert.ok(openWingPalette(world, ["wing-a"]));
  assert.ok(pressWingPalette(world, "recover"));
  assert.equal(world.circuitPlay!.pending?.kind, "wing_recover");
  assert.equal(handleMapTap(world, { x: 1003, y: 432 }, 24), "consumed");
  assert.equal(world.circuitPlay!.wingRecover!["wing-a"]?.id, crate.id);
  run(world, 6); // 580 px at 120 → arrived
  assert.ok(Math.hypot(wa(world).pos.x - 1000, wa(world).pos.y - 430) < 28, "no teleport: it walked there");
  assert.equal(crate.taken, false, "not instant");
  run(world, 9);
  assert.equal(crate.taken, true, "8 s pickup done");
  assert.equal(wa(world).salvagedCount, 1);
  const hold = { ...wa(world).pos };
  run(world, 4);
  assert.ok(Math.hypot(wa(world).pos.x - hold.x, wa(world).pos.y - hold.y) < 6, "waits where it picked up");
  assert.ok(requestExtract(world));
  const d0 = Math.hypot(wa(world).pos.x - world.boarding!.center.x, wa(world).pos.y - world.boarding!.center.y);
  run(world, 2);
  const d1 = Math.hypot(wa(world).pos.x - world.boarding!.center.x, wa(world).pos.y - world.boarding!.center.y);
  assert.ok(d1 < d0 - 100, "heads to the called circle");
  console.log("explore 4-2 C1c/d far recovery, 8 s, wait, then circle ok");
}

// 4-1 cap/speed for wingmen: full → no container; load slows the circuit-driven move.
{
  const world = releaseWorld();
  wa(world).salvagedCount = 2;
  const crate = world.containers[0]!;
  crate.discovered = true; crate.taken = false; crate.pos = { x: 600, y: 430 };
  openWingPalette(world, ["wing-a"]); pressWingPalette(world, "recover");
  handleMapTap(world, crate.pos, 24);
  run(world, 0.2);
  assert.equal(world.circuitPlay!.wingRecover!["wing-a"], undefined, "full: order dropped");
  assert.ok(world.logs.some((l) => l.text.includes("積載が満杯")));
  world.circuitPlay!.wingHold!["wing-a"] = { x: 900, y: 430, manual: false };
  const full = circuitSpeed(world, wa(world))!;
  wa(world).salvagedCount = 0;
  const empty = circuitSpeed(world, wa(world))!;
  assert.equal(Math.round((full / empty) * 100), 50, "load 2 → 60/120");
  console.log("explore 4-2 wingman cap / speed follow 4-1 ok");
}

// N2/C2/C3: the captain's wreck — manual control, air support, 帰還要請, normal return.
{
  const world = releaseWorld();
  const p = world.circuitPlay!;
  p.captainTrueOne = true;
  p.loadout.leader = [key("protect", true)];
  world.leader.alive = false; world.leader.hp = 0;
  assert.equal(captainActive(world), false);
  assert.ok(!circuitButtons(world).some((b) => b.id === "air_support"), "N2: no air support while the wreck lies there");
  assert.ok(!circuitButtons(world).some((b) => b.id === "protect"), "W5: an uncarried wreck's circuits do not act");
  assert.equal(requestExtract(world), false);
  wa(world).pos = { x: 800, y: 400 };
  assert.ok(openWingPalette(world, ["wing-a"]), "palette with the captain wrecked");
  assert.ok(pressWingPalette(world, "recover"));
  assert.equal(handleMapTap(world, world.leader.pos, 24), "consumed");
  assert.equal(p.wingRecover!["wing-a"]?.id, "leader", "隊長機の残骸 is selectable");
  run(world, 4 + 9);
  assert.deepEqual(p.carry["wing-a"], ["leader"]);
  assert.equal(captainRescuer(world)?.id, "wing-a");
  assert.equal(unitLoad(world, wa(world)), 2);
  assert.ok(circuitButtons(world).some((b) => b.id === "air_support"), "C2: air support is back");
  assert.ok(circuitButtons(world).some((b) => b.id === "protect"), "C3: the carried wreck's circuits act");
  // manual: a map tap moves the rescuer (not a captain move)
  const before = { ...wa(world).pos };
  assert.equal(handleMapTap(world, { x: before.x + 200, y: before.y }, 24), "consumed");
  run(world, 2);
  assert.ok(wa(world).pos.x > before.x + 80, "map tap moves the rescuer");
  assert.ok(Math.hypot(world.leader.pos.x - wa(world).pos.x, world.leader.pos.y - wa(world).pos.y) < 8, "wreck rides on it (placed each tick)");
  assert.ok(requestExtract(world), "C2: 帰還要請 works again");
  world.wingmen[1]!.pos = { ...world.boarding!.center };
  run(world, 16);
  assert.equal(world.phase, "result");
  assert.equal(world.extracted, true);
  assert.equal(world.failReason, null);
  assert.ok(!(world.rescueFeeCredits! > 0), "normal return: no fee");
  assert.ok(world.logs.some((l) => l.text.startsWith("帰還成功（隊長の残骸を回収）")));
  console.log("explore 4-2 N2/C2/C3 captain wreck rescue → manual, air support, normal return ok");
}

// fix/rescue-palette-desktop: a missed target tap keeps 回収 armed; the rescue then
// completes with taps 僚機(1) → 回収(2) → 対象(3) — a miss adds only one tap.
{
  const world = releaseWorld();
  const p = world.circuitPlay!;
  p.captainTrueOne = true;
  world.leader.alive = false; world.leader.hp = 0;
  wa(world).pos = { x: 700, y: 400 };
  let taps = 0;
  assert.equal(handleMapTap(world, wa(world).pos, 24), "selected"); taps++;
  assert.ok(pressWingPalette(world, "recover")); taps++;
  assert.equal(handleMapTap(world, { x: 1500, y: 900 }, 24), "consumed"); taps++;
  assert.equal(p.pending?.kind, "wing_recover", "miss keeps the pick armed");
  assert.ok(p.wingSelect, "palette stays open");
  assert.equal(handleMapTap(world, world.leader.pos, 24), "consumed"); taps++;
  assert.equal(p.wingRecover!["wing-a"]?.id, "leader");
  assert.equal(taps, 4, "with one miss: 4 taps (was 6)");
  run(world, 4 + 9);
  assert.equal(captainRescuer(world)?.id, "wing-a");
  assert.ok(circuitButtons(world).some((b) => b.id === "air_support"));
  assert.ok(requestExtract(world));
  world.wingmen[1]!.pos = { ...world.boarding!.center };
  wa(world).pos = { ...world.boarding!.center };
  run(world, 16);
  assert.equal(world.extracted, true);
  assert.ok(!(world.rescueFeeCredits! > 0));
  console.log("explore rescue palette miss-keeps-armed + rescue flow ok");
}

// compat: old 5-3 checkpoint without wingRecover / wingHold loads, then round-trips.
{
  const old = { rules: true, release: true, carry: {}, wreckChannel: {}, loadout: {} } as unknown as Partial<CircuitPlayState>;
  backfillCircuitPlayState(old);
  assert.deepEqual(old.wingRecover, {});
  assert.deepEqual(old.wingHold, {});
  const world = releaseWorld();
  world.circuitPlay!.wingHold!["wing-a"] = { x: 1, y: 2, manual: true };
  const body = JSON.parse(JSON.stringify(snapshotSortieWorld(world)));
  delete body.circuitPlay.wingRecover; delete body.circuitPlay.wingHold;
  const back = worldFromCheckpointBody(body);
  assert.ok(back, "old checkpoint body loads");
  assert.deepEqual(back!.circuitPlay!.wingRecover, {});
  assert.deepEqual(back!.circuitPlay!.wingHold, {});
  console.log("explore 4-2 old checkpoint backfill ok");
}

console.log("explore rescue.selftest ok");
