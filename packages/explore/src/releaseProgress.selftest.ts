import { readFileSync } from "node:fs";
/**
 * PR-B (#269, 神宮 10/12 Go): unlock as you progress.
 * - public preview default = release (unlockMode.ts)
 * - release-only nine-ability scale by the equipped 1×1 (releaseAbility.ts)
 * - N1 wingman 「移動」→「地点選択」 (data + map pick), N2 / N3 after the leader is wrecked
 * - save compatibility: HubSave, the 5-3 checkpoint, circuits and wrecks.
 */
import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  createHubSave,
  deserializeHubSave,
  makeFalseOneByOne,
  makeRestoredTrueOneByOne,
  normalizeHubSnapshot,
  serializeHubSave,
  type HubCircuitRecord,
  type OwnedMech,
} from "@estg/shared";
import {
  abilityOf,
  attachCircuitPlay,
  attackMul,
  beginCircuitButton,
  beginWingmanMovePick,
  circuitButtons,
  consumeCircuitClick,
  handleMapTap,
  openWingPalette,
  paletteWingmen,
  pressWingPalette,
  closeWingPalette,
  effectiveBatteryCapacity,
  issueWingmanMove,
  rangeMul,
  stepCircuitPlay,
  usableAmmo,
  visionMul,
  wingmanPaletteActions,
} from "./game/circuitPlay";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { attachLostMechContext } from "./game/lostMechs";
import { buildSortieOutcome } from "./game/outcome";
import { tickWorld } from "./game/sim";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import {
  IDENTITY_ABILITY_SCALE,
  RELEASE_ABILITY_KEYS,
  RELEASE_ABILITY_SCALE,
  releaseAbilityScale,
} from "./game/releaseAbility";
import { COMMAND_UNLOCK_MODE_STORAGE_KEY, resolveCommandUnlockMode } from "./game/unlockMode";

const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };

function mech(id: string, over: Partial<OwnedMech> = {}): OwnedMech {
  return { instanceId: id, catalogId: "mech_gen1", durability: 100, durabilityMax: 100, status: "ok", currentAmmo: 28, battery: { capacity: 300, activity: 300 }, ...over } as OwnedMech;
}

/** Same wiring as main.ts makeWorld: world mode and circuit mode in step. */
function sortie(circuits: HubCircuitRecord[], release = true, fleet: OwnedMech[] = [mech("cap"), mech("wa"), mech("wb")]) {
  const world = createWorld(bootstrapFromSearch(""));
  startSortie(world);
  world.commandUnlock.mode = release ? "release" : "all_unlocked";
  world.deployedInstanceIds = fleet.map((m) => m.instanceId);
  const units = [world.leader, ...world.wingmen];
  fleet.forEach((m, i) => {
    const u = units[i];
    if (!u) return;
    u.instanceId = m.instanceId;
    world.currentAmmo[m.instanceId] = m.currentAmmo ?? 28;
    world.mechBattery[m.instanceId] = { capacity: 300, activity: 300 };
  });
  for (const e of world.enemies) e.alive = false; // quiet field unless a check adds one
  const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet, circuits } as never);
  attachCircuitPlay(world, hub, release);
  return world;
}

const falseCap = () => ({ ...makeFalseOneByOne("f-cap"), equippedTo: "cap" });
const trueCap = () => ({ ...makeRestoredTrueOneByOne("t-cap"), equippedTo: "cap" });

// --- public preview default = release; DEBUG all-unlocked stays ---
{
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null };
  assert.equal(resolveCommandUnlockMode({ releaseLocks: false, store }), "release", "PR-B: unset → release");
  mem.set(COMMAND_UNLOCK_MODE_STORAGE_KEY, "all_unlocked");
  assert.equal(resolveCommandUnlockMode({ releaseLocks: false, store }), "all_unlocked", "PR-B: DEBUG all-unlocked kept");
  mem.set(COMMAND_UNLOCK_MODE_STORAGE_KEY, "release");
  assert.equal(resolveCommandUnlockMode({ releaseLocks: false, store }), "release");
  assert.equal(createWorld(bootstrapFromSearch("")).commandUnlock.mode, "release", "PR-B: a new world starts in release");
}

// --- the one constant ---
{
  assert.deepEqual(RELEASE_ABILITY_SCALE, { four: 1, noFour: 0.5, falseOneWingman: 2 });
  assert.equal(RELEASE_ABILITY_KEYS.length, 9, "exactly nine abilities");
  const cap0 = releaseAbilityScale({ release: true, isCaptain: true, oneByOneEffect: 0, hasFalseOne: true });
  for (const k of RELEASE_ABILITY_KEYS) {
    assert.equal(cap0[k], k === "fireInterval" ? 2 : 0.5, `captain false 1×1: ${k} (Q3a never for the captain)`);
  }
  const capNone = releaseAbilityScale({ release: true, isCaptain: true, oneByOneEffect: null, hasFalseOne: false });
  assert.deepEqual(capNone, cap0, "no 1×1 = effect 0");
  const cap4 = releaseAbilityScale({ release: true, isCaptain: true, oneByOneEffect: 4, hasFalseOne: true });
  assert.deepEqual(cap4, IDENTITY_ABILITY_SCALE, "the 「4」 → ×1 (even next to the false 1×1)");
  const wingFalse = releaseAbilityScale({ release: true, isCaptain: false, oneByOneEffect: 0, hasFalseOne: true });
  assert.equal(wingFalse.attack, 1, "Q3a: ×0.5 × 2 = ×1");
  assert.equal(wingFalse.range, 1);
  assert.equal(wingFalse.vision, 1);
  assert.equal(wingFalse.moveSpeed, 0.5, "Q3a only covers attack / range / vision");
  assert.equal(wingFalse.fireInterval, 2);
  const off = releaseAbilityScale({ release: false, isCaptain: true, oneByOneEffect: null, hasFalseOne: false });
  assert.deepEqual(off, IDENTITY_ABILITY_SCALE, "all_unlocked: ×1");
}

// --- applied in the sortie: new save (captain false 1×1, bare wingmen) ---
{
  const w = sortie([falseCap()]);
  assert.equal(attackMul(w, "leader"), 0.5);
  assert.equal(rangeMul(w, "leader"), 0.5);
  assert.equal(visionMul(w, "leader"), 0.5);
  assert.equal(attackMul(w, "wing-a"), 0.5, "bare wingman ×0.5");
  stepCircuitPlay(w, 0.05);
  assert.equal(w.leader.maxHp, 50, "max durability ×0.5");
  assert.equal(effectiveBatteryCapacity(w, w.leader), 150, "max power ×0.5");
  assert.equal(w.mechBattery.cap!.capacity, 300, "the home battery row is not rewritten (no compounding)");
  assert.equal(w.currentAmmo.cap, 28, "carried ammo is not destroyed");
  assert.equal(usableAmmo(w, w.leader), 14, "max ammo ×0.5 (the rest is held back)");
  // fire interval ×2 and bullet speed ×0.5 on the default gun
  const foe = w.enemies[0]!;
  foe.alive = true; foe.hp = 999; foe.pos = { x: w.leader.pos.x + 60, y: w.leader.pos.y };
  w.leader.cooldown = 0; w.leader.heading = 0; // facing PR1
  const before = w.bullets.length;
  tickWorld(w, 0.01, idle);
  const shot = w.bullets.slice(before).find((b) => b.ownerId === "leader");
  assert.ok(shot, "the leader returns fire");
  assert.ok(Math.abs(Math.hypot(shot!.vel.x, shot!.vel.y) - w.balance.bulletSpeed * 0.5) < 1e-6, "bullet speed ×0.5");
  assert.ok(Math.abs(w.leader.cooldown - w.balance.fireCooldown * 2) < 0.02, "fire interval ×2 (slower)");
  // move speed ×0.5
  const m = sortie([falseCap()]);
  const x0 = m.leader.pos.x;
  tickWorld(m, 0.1, { ...idle, move: { x: 1, y: 0 } });
  const moved = m.leader.pos.x - x0;
  const f = sortie([trueCap()]);
  const x1 = f.leader.pos.x;
  tickWorld(f, 0.1, { ...idle, move: { x: 1, y: 0 } });
  assert.ok(Math.abs(moved * 2 - (f.leader.pos.x - x1)) < 1e-6, "move speed ×0.5 vs ×1 with the 「4」");
  // ammo spent down to the floor stops the gun; the held-back rounds return with the mech
  m.currentAmmo.cap = 15;
  stepCircuitPlay(m, 0.01);
  assert.equal(usableAmmo(m, m.leader), 1);
  m.currentAmmo.cap = 14;
  assert.equal(usableAmmo(m, m.leader), 0);
  const out = buildSortieOutcome(m)!;
  assert.equal(out.mechCurrentAmmo.find((x) => x.instanceId === "cap")!.currentAmmo, 14, "held-back ammo goes home (no compounding)");
  assert.equal(out.mechBattery.find((x) => x.instanceId === "cap")!.battery.capacity, 300, "battery cap goes home unscaled");
}

// --- captain with the 「4」 and a wingman with the 「4」: ×1 ---
{
  const w = sortie([trueCap(), falseCap(), { ...makeRestoredTrueOneByOne("t-wa"), equippedTo: "wa" }]);
  assert.deepEqual(abilityOf(w, "leader"), IDENTITY_ABILITY_SCALE);
  assert.deepEqual(abilityOf(w, "wing-a"), IDENTITY_ABILITY_SCALE);
  assert.equal(attackMul(w, "wing-b"), 0.5);
  stepCircuitPlay(w, 0.05);
  assert.equal(w.leader.maxHp, 100);
  assert.equal(usableAmmo(w, w.leader), 28);
}

// --- Q3a: wingman false 1×1 → attack / range / vision ×1, the rest ×0.5 ---
{
  const w = sortie([falseCap(), { ...makeFalseOneByOne("f-wa"), equippedTo: "wa" }]);
  assert.equal(attackMul(w, "wing-a"), 1);
  assert.equal(rangeMul(w, "wing-a"), 1);
  assert.equal(visionMul(w, "wing-a"), 1);
  assert.equal(abilityOf(w, "wing-a").moveSpeed, 0.5);
  assert.equal(attackMul(w, "leader"), 0.5, "Q3a not for the captain");
}

// --- Q4: circuits on a destroyed mech do not count ---
{
  const fleet = [mech("cap"), mech("wa", { status: "destroyed", durability: 0 }), mech("wb")];
  const w = sortie([trueCap(), { ...makeRestoredTrueOneByOne("t-wa"), equippedTo: "wa" }], true, fleet);
  assert.equal(attackMul(w, "wing-a"), 0.5, "Q4: the dead mech's 「4」 gives nothing");
}

// --- all_unlocked (DEBUG): no scale at all ---
{
  const w = sortie([falseCap()], false);
  assert.deepEqual(abilityOf(w, "leader"), IDENTITY_ABILITY_SCALE);
  stepCircuitPlay(w, 0.05);
  assert.equal(w.leader.maxHp, 100);
  assert.equal(usableAmmo(w, w.leader), 28);
}

// --- N1: wingman palette 「移動」 (fix/explore-move-tap-panel: no 「地点選択」 step), then stop and return fire ---
{
  const none = sortie([falseCap()]);
  assert.deepEqual(wingmanPaletteActions(none, ["wing-a"]).map(a => a.id), ["load"], "turret can be loaded but not ordered to move");
  assert.equal(beginWingmanMovePick(none, ["wing-a"]), false);
  assert.deepEqual(issueWingmanMove(none, ["wing-a"], { x: 1, y: 1 }), []);

  const w = sortie([trueCap(), { ...makeRestoredTrueOneByOne("t-wb"), equippedTo: "wb" }]);
  assert.deepEqual(wingmanPaletteActions(w, ["wing-a"]).map(a => a.id), ["move", "load"]);
  assert.deepEqual(wingmanPaletteActions(w, ["wing-b"]).map(a => a.id), ["load"], "autonomous wing can also be loaded");
  assert.deepEqual(wingmanPaletteActions(w, ["wing-a", "wing-b"]).map((a) => a.id), ["move"], "select-all still offers 移動");
  assert.equal(beginWingmanMovePick(w, ["wing-a", "wing-b"]), true);
  const wa = w.wingmen[0]!;
  const target = { x: wa.pos.x + 30, y: wa.pos.y };
  assert.equal(consumeCircuitClick(w, target), true, "the map tap is consumed by the pick");
  assert.deepEqual(Object.keys(w.circuitPlay!.wingMove), ["wing-a"], "only the non-autonomous wingman takes the move");
  for (let i = 0; i < 40; i++) tickWorld(w, 0.05, idle);
  assert.ok(Math.hypot(wa.pos.x - target.x, wa.pos.y - target.y) < 8, "the wingman reaches the point");
  assert.equal(w.circuitPlay!.wingMove["wing-a"], undefined, "and stops there");
  const stay = { ...wa.pos };
  const foe = w.enemies[0]!;
  foe.alive = true; foe.hp = 999; foe.pos = { x: wa.pos.x + 50, y: wa.pos.y };
  wa.cooldown = 0;
  const before = w.bullets.length;
  tickWorld(w, 0.01, idle);
  assert.ok(w.bullets.slice(before).some((b) => b.ownerId === "wing-a"), "it returns fire");
  assert.ok(Math.hypot(wa.pos.x - stay.x, wa.pos.y - stay.y) < 1, "without chasing");
}

// --- N2 / N3: leader wrecked → no air support (hidden), move orders still work ---
{
  const w = sortie([trueCap()]);
  assert.ok(circuitButtons(w).some((b) => b.id === "air_support"));
  w.leader.alive = false;
  w.leader.hp = 0;
  assert.ok(!circuitButtons(w).some((b) => b.id === "air_support"), "N2: air support hidden");
  beginCircuitButton(w, "air_support");
  assert.equal(w.circuitPlay!.pending, null, "N2: cannot be armed");
  assert.equal(wingmanPaletteActions(w, ["wing-a"]).length, 1, "N3: move order still offered");
  const wa = w.wingmen[0]!;
  const to = { x: wa.pos.x - 25, y: wa.pos.y };
  assert.deepEqual(issueWingmanMove(w, ["wing-a"], to), ["wing-a"]);
  for (let i = 0; i < 40; i++) tickWorld(w, 0.05, idle);
  assert.ok(Math.hypot(wa.pos.x - to.x, wa.pos.y - to.y) < 8, "N3: the wingman moves after the leader is wrecked");
}

// --- compat: an old HubSave (no PR-A/PR-B keys) with circuits and a wreck ---
{
  const raw = {
    ...INITIAL_HUB,
    credits: 900,
    fleet: [mech("cap"), mech("wa"), mech("wb")],
    circuits: [falseCap(), { ...makeFalseOneByOne("wreck-c"), equippedTo: "w-dead" }],
    lostMechs: [{
      instanceId: "w-dead", currentAmmo: 3, battery: { capacity: 300, activity: 200 },
      lostAt: "2026-10-11T00:00:00.000Z", lostSortieId: "s-w", circuitIds: ["wreck-c"],
      frontSeed: 4242, cell: { sx: 1, sy: 0 }, catalogId: "mech_gen1", durability: 0,
      durabilityMax: 100, status: "destroyed", kind: "wreck", pos: { x: 100, y: 200 },
    }],
  };
  const hub = normalizeHubSnapshot(raw as never);
  assert.equal(hub.lostMechs!.length, 1, "wreck row survives");
  assert.equal(hub.lostMechs![0]!.kind, "wreck");
  assert.equal(hub.circuits.length, 2, "circuits survive (wreck circuit stays on the wreck)");
  const again = deserializeHubSave(serializeHubSave(createHubSave(hub)));
  assert.ok(again, "old save round-trips");
  assert.deepEqual(again!.hub.lostMechs, hub.lostMechs);
  const world = attachLostMechContext(createWorld(bootstrapFromSearch("")), hub);
  startSortie(world);
  attachCircuitPlay(world, hub, true);
  for (let i = 0; i < 20; i++) tickWorld(world, 0.05, idle);
  assert.ok(buildSortieOutcome(world) !== undefined, "old save sorties and returns without a throw");
}

// --- compat: a 5-3 checkpoint from before PR-B (no ability / wingMove / ammoFloor) ---
{
  const w = sortie([trueCap()]);
  stepCircuitPlay(w, 0.05);
  issueWingmanMove(w, ["wing-a"], { x: 300, y: 300 });
  const body = JSON.parse(JSON.stringify(snapshotSortieWorld(w))) as { circuitPlay: Record<string, unknown> };
  const fresh = worldFromCheckpointBody(JSON.parse(JSON.stringify(body)))!;
  assert.deepEqual(fresh.circuitPlay!.wingMove, { "wing-a": { x: 300, y: 300 } }, "a move order survives the checkpoint");
  delete body.circuitPlay.ability;
  delete body.circuitPlay.wingMove;
  delete body.circuitPlay.ammoFloor;
  const old = worldFromCheckpointBody(body)!;
  assert.ok(old, "pre-PR-B checkpoint restores");
  assert.deepEqual(abilityOf(old, "leader"), IDENTITY_ABILITY_SCALE, "scale rebuilt from the saved loadout (captain 「4」)");
  assert.equal(abilityOf(old, "wing-a").attack, 0.5);
  assert.deepEqual(old.circuitPlay!.wingMove, {});
  for (let i = 0; i < 10; i++) tickWorld(old, 0.05, idle);
  const noPlay = snapshotSortieWorld(createWorld(bootstrapFromSearch(""))) as Record<string, unknown>;
  delete noPlay.circuitPlay;
  const legacy = worldFromCheckpointBody(noPlay)!;
  legacy.phase = "sortie";
  for (let i = 0; i < 5; i++) tickWorld(legacy, 0.05, idle);
}

// --- P1: palette under the map (map tap ~24px / card / 全僚機), other taps move the captain ---
{
  const locked = sortie([falseCap()]);
  const wa0 = locked.wingmen[0]!;
  assert.equal(handleMapTap(locked, { ...wa0.pos }, 24), "selected", "no 4 needed for loading a wingman");
  assert.equal(openWingPalette(locked, ["wing-a"]), true, "loading available without 4");
  assert.deepEqual(paletteWingmen(locked), ["wing-a", "wing-b"]);

  const w = sortie([trueCap(), { ...makeRestoredTrueOneByOne("t-wb"), equippedTo: "wb" }]);
  const wa = w.wingmen[0]!;
  const wb = w.wingmen[1]!;
  assert.deepEqual(paletteWingmen(w), ["wing-a", "wing-b"], "autonomous wing-b exposes loading too");
  assert.equal(handleMapTap(w, { ...wb.pos }, 24), "selected", "autonomous wing exposes its loading palette");
  assert.equal(handleMapTap(w, { x: wa.pos.x + 20, y: wa.pos.y }, 24), "selected", "within ~24px selects");
  assert.deepEqual(w.circuitPlay!.wingSelect, { ids: ["wing-a"], step: "root" });
  assert.equal(handleMapTap(w, { x: wa.pos.x + 200, y: wa.pos.y }, 24), "move", "another tap moves the captain");
  assert.equal(w.circuitPlay!.wingSelect, null, "and closes the palette");
  // fix/explore-move-tap-panel: 3 taps — card (or wingman) → 移動 → map tap
  assert.equal(openWingPalette(w, ["wing-a"]), true);
  assert.equal(pressWingPalette(w, "point"), false, "no 「地点選択」 at the root");
  assert.equal(pressWingPalette(w, "move"), true);
  assert.equal(w.circuitPlay!.pending?.kind, "wing_move", "「移動」 arms the map pick at once");
  const dest = { x: wa.pos.x + 40, y: wa.pos.y + 10 };
  assert.equal(handleMapTap(w, dest, 24), "consumed", "the destination tap does not move the captain");
  assert.deepEqual(w.circuitPlay!.wingMove["wing-a"], dest);
  assert.equal(w.circuitPlay!.wingSelect, null, "palette closes after the order");
  // cancel stays as before: the card (re-open) or another order button drops the armed 移動
  openWingPalette(w, ["wing-a"]);
  pressWingPalette(w, "move");
  openWingPalette(w, ["wing-a"]);
  assert.equal(w.circuitPlay!.pending, null, "card tap cancels the armed 移動");
  pressWingPalette(w, "move");
  beginCircuitButton(w, "air_support");
  assert.notEqual(w.circuitPlay!.pending?.kind, "wing_move", "another order button cancels the armed 移動");
  closeWingPalette(w);
  w.circuitPlay!.pending = null;
  // an old checkpoint saved mid 「移動」→「地点選択」 (step "move") still works
  w.circuitPlay!.wingSelect = { ids: ["wing-a"], step: "move" };
  assert.equal(pressWingPalette(w, "point"), true, "old step: 「地点選択」 still arms");
  closeWingPalette(w);
  w.circuitPlay!.wingSelect = { ids: ["wing-a"], step: "move" };
  assert.equal(pressWingPalette(w, "move"), true, "old step: 「移動」 arms too");
  closeWingPalette(w);
  // armed designated action takes over (existing cancel: the next tap is consumed)
  openWingPalette(w, ["wing-a"]);
  beginCircuitButton(w, "air_support");
  assert.equal(w.circuitPlay!.wingSelect, null, "arming a designated action closes the palette");
  assert.equal(handleMapTap(w, { x: 5, y: 5 }, 24), "consumed");
  // 全僚機 with two non-autonomous wingmen
  const two = sortie([trueCap()]);
  assert.equal(openWingPalette(two, paletteWingmen(two)), true);
  pressWingPalette(two, "move");
  const pt = { x: two.leader.pos.x + 60, y: two.leader.pos.y + 60 };
  handleMapTap(two, pt, 24);
  assert.deepEqual(Object.keys(two.circuitPlay!.wingMove).sort(), ["wing-a", "wing-b"], "「全僚機」 orders every wingman");
  // a selected wingman that dies drops out of the palette
  openWingPalette(two, ["wing-a"]);
  two.wingmen[0]!.alive = false;
  stepCircuitPlay(two, 0.01);
  assert.equal(two.circuitPlay!.wingSelect, null);
}

// --- T42 (fix/explore-move-tap-panel): the 操作 panel over the map lets taps through; only its buttons take taps ---
{
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
  const block = (sel: string) => css.match(new RegExp(`(^|\\n)${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`))?.[2] ?? "";
  assert.match(block(".kb-overlay"), /pointer-events:\s*none/, "panel frame: pointer-events none");
  assert.match(css.match(/\.kb-hide,\s*\.kb-show\s*\{([^}]*)\}/)?.[1] ?? "", /pointer-events:\s*auto/, "panel buttons: auto");
}

console.log("releaseProgress.selftest ok");
