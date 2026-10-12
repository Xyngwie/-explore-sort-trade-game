/** feat/explore-status-badges: red state line over wingmen (order, join, wingmen only). */
import assert from "node:assert/strict";
import { attachCircuitPlay } from "./game/circuitPlay";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { IDENTITY_ABILITY_SCALE } from "./game/releaseAbility";
import { renderWorld } from "./game/render";
import { attachCircuitPlay as _a, sortieAmmoCap } from "./game/circuitPlay";
import { STATUS_BADGE_ORDER, STATUS_BADGE_PX, wingmanStatusBadges, wingmanStatusLine, wreckCircuitLine } from "./game/statusBadges";
void _a;

function world() {
  const w = createWorld(bootstrapFromSearch(""));
  startSortie(w);
  attachCircuitPlay(w, null, true);
  for (const id of ["leader", "wing-a", "wing-b"]) w.circuitPlay!.ability[id] = { ...IDENTITY_ABILITY_SCALE };
  for (const u of [w.leader, ...w.wingmen]) {
    u.instanceId = u.instanceId ?? `m-${u.id}`;
    w.currentAmmo[u.instanceId] = 1000; // usable = min with the cap below

    w.mechBattery[u.instanceId] = { capacity: 300, activity: 300 };
  }
  return w;
}

assert.deepEqual([...STATUS_BADGE_ORDER], ["弾切れ", "残弾減少", "装甲低下", "活動量低下", "積載上限"]);
{
  const w = world();
  const a = w.wingmen[0]!;
  assert.equal(wingmanStatusLine(w, a), "", "healthy: nothing");
  // each state alone
  w.currentAmmo[a.instanceId!] = 0;
  assert.deepEqual(wingmanStatusBadges(w, a), ["弾切れ"]);
  const cap = sortieAmmoCap(w, a);
  w.currentAmmo[a.instanceId!] = cap;
  assert.deepEqual(wingmanStatusBadges(w, a), [], "full magazine: nothing");
  w.currentAmmo[a.instanceId!] = cap / 2;
  assert.deepEqual(wingmanStatusBadges(w, a), [], "exactly 50% ammo is not below 50%");
  w.currentAmmo[a.instanceId!] = Math.ceil(cap / 2) - 1;
  assert.deepEqual(wingmanStatusBadges(w, a), ["残弾減少"]);
  w.currentAmmo[a.instanceId!] = 0;
  assert.deepEqual(wingmanStatusBadges(w, a), ["弾切れ"], "弾切れ wins at 0 (only one of the two)");
  w.currentAmmo[a.instanceId!] = cap;
  a.hp = a.maxHp * 0.5;
  assert.deepEqual(wingmanStatusBadges(w, a), [], "exactly 50% armor is not below 50%");
  a.hp = a.maxHp * 0.5 - 0.01;
  assert.deepEqual(wingmanStatusBadges(w, a), ["装甲低下"]);
  a.hp = a.maxHp;
  w.mechBattery[a.instanceId!] = { capacity: 300, activity: 149 };
  assert.deepEqual(wingmanStatusBadges(w, a), ["活動量低下"]);
  w.mechBattery[a.instanceId!] = { capacity: 300, activity: 150 };
  assert.deepEqual(wingmanStatusBadges(w, a), []);
  a.salvagedCount = 2;
  assert.deepEqual(wingmanStatusBadges(w, a), ["積載上限"], "load 2/2 is full");
  // all four, fixed order, joined with 「・」
  w.currentAmmo[a.instanceId!] = 0;
  a.hp = 1;
  w.mechBattery[a.instanceId!] = { capacity: 300, activity: 10 };
  assert.equal(wingmanStatusLine(w, a), "弾切れ・装甲低下・活動量低下・積載上限");
  // two of them keep the order
  w.mechBattery[a.instanceId!] = { capacity: 300, activity: 300 };
  a.hp = a.maxHp;
  assert.equal(wingmanStatusLine(w, a), "弾切れ・積載上限");
  w.currentAmmo[a.instanceId!] = 1;
  a.hp = 1;
  assert.equal(wingmanStatusLine(w, a), "残弾減少・装甲低下・積載上限");
  w.currentAmmo[a.instanceId!] = 0;
  a.hp = a.maxHp;
  // continuous: it stays while the state lasts (no timer)
  for (let i = 0; i < 100; i++) assert.equal(wingmanStatusLine(w, a), "弾切れ・積載上限");
  // captain never shows it
  w.currentAmmo[w.leader.instanceId!] = 0;
  w.leader.hp = 1;
  assert.deepEqual(wingmanStatusBadges(w, w.leader), [], "captain: never");
  // a wrecked wingman shows no states, but its circuits (type + 効果値, equip order)
  a.alive = false;
  assert.deepEqual(wingmanStatusBadges(w, a), []);
  assert.equal(wreckCircuitLine(w, a), "", "no circuits: nothing");
  const circ = (id: string, key: string | null, effect: number, trueBoard = false) => ({ circuitId: id, effect, r: 0.1, effectKey: key, trueBoard, oneByOne: null, side: 3, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false }) as never;
  w.circuitPlay!.loadout[a.id] = [circ("c1", "raid_attack", 12), circ("c2", null, 4), circ("c3", "march", 7, true)];
  assert.equal(wreckCircuitLine(w, a), "遊撃 12・行進 7");
  w.leader.alive = false;
  w.circuitPlay!.loadout.leader = [circ("c4", "recover", 3)];
  assert.equal(wreckCircuitLine(w, w.leader), "", "captain's wreck: nothing");
  console.log("statusBadges states ok");
}

// render: drawn once per live wingman, captain excluded, font at 11px on screen
function fakeCtx(clientWidth: number) {
  const texts: { kind: string; text: string; font: string }[] = [];
  let font = "";
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(t, k) {
      if (k === "canvas") return { clientWidth, width: 720, height: 420 };
      if (k === "font") return font;
      if (k === "fillText" || k === "strokeText") return (text: string) => texts.push({ kind: String(k), text, font });
      if (k === "measureText") return () => ({ width: 10 });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
      if (k in t) return t[k as string];
      return () => {};
    },
    set(t, k, v) { if (k === "font") font = v; else t[k as string] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}
{
  const w = world();
  const a = w.wingmen[0]!;
  w.currentAmmo[a.instanceId!] = 0;
  a.hp = 1;
  w.currentAmmo[w.leader.instanceId!] = 0;
  w.leader.hp = 1;
  const b = w.wingmen[1]!;
  b.alive = false; b.hp = 0;
  w.circuitPlay!.loadout[b.id] = [{ circuitId: "cw", effect: 9, r: 0.1, effectKey: "smg", trueBoard: false, oneByOne: null, side: 3, conductive: true, cargoSlots: 0, perfectPt: 0, false20: false, true20: false }];
  for (const [cw, cam] of [[774, 1], [356, 1], [774, 0.5]] as const) {
    w.camera = { ...w.camera, w: w.camera.w * cam, h: w.camera.h * cam };
    const { ctx, texts } = fakeCtx(cw);
    renderWorld(ctx, w, 720, 420);
    const red = texts.filter((t) => t.text === "弾切れ・装甲低下");
    assert.equal(red.filter((t) => t.kind === "fillText").length, 1, "one line for the one wingman");
    assert.equal(red.filter((t) => t.kind === "strokeText").length, 1, "with an outline");
    assert.equal(texts.filter((t) => t.text === "SMG 9" && t.kind === "fillText").length, 1, "wreck line drawn");
    const px = Number(red[0]!.font.match(/([\d.]+)px/)![1]);
    assert.ok(Math.abs((px * cw) / 720 - STATUS_BADGE_PX) < 0.05, `≈11px on screen at ${cw}px wide (got ${px})`);
  }
  console.log("statusBadges render ok");
}

// old checkpoint reads and shows from the restored state (no new save key)
{
  const w = world();
  w.wingmen[0]!.salvagedCount = 2;
  const back = worldFromCheckpointBody(JSON.parse(JSON.stringify(snapshotSortieWorld(w))));
  if (back) assert.equal(wingmanStatusLine(back, back.wingmen[0]!).includes("積載上限"), true);
  console.log("statusBadges checkpoint ok");
}
console.log("statusBadges.selftest ok");
