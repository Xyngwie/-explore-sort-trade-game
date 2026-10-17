import assert from "node:assert/strict";
import { createHubSave, serializeHubSave, INITIAL_HUB } from "@estg/shared";
import { readFileSync } from "node:fs";
import { BALANCE } from "./game/balance";
import { COLORS, MECH_R, OWN_WRECK_OUTLINE, SHAPE_SIZE, drawDisc, shapePoints } from "./game/mapShapes";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { tickWorld } from "./game/sim";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";

// 10/17 神宮: colours, sizes, fixed shapes.
assert.equal(COLORS.leader, "#4f8fe8"); assert.equal(COLORS.wingman, "#7eb6ff"); assert.equal(COLORS.wreck, "#8a9099");
assert.equal(MECH_R, BALANCE.unitRadius, "map mech radius follows the sim unit radius");
assert.deepEqual(SHAPE_SIZE, { leader: 1.1, wingman: 1.0, enemy: 1.0, wreck: 0.75, supply: 0.35 });
assert.ok(SHAPE_SIZE.supply < SHAPE_SIZE.wreck, "supply circles smaller than wreck circles");
assert.equal(shapePoints("hexagon", 10).length, 6);
const up = shapePoints("triangle", 10), down = shapePoints("invertedTriangle", 10);
assert.ok(Math.abs(up[0]!.y + 10) < 1e-9, "enemy triangle apex up");
assert.ok(Math.abs(down[0]!.y - 10) < 1e-9, "wingman triangle apex down");
// Visual only: nothing new in the checkpoint or the HUB save; old checkpoints still load.
const w = createWorld(bootstrapFromSearch("")); startSortie(w); tickWorld(w, 0.05, { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false });
const body = JSON.stringify(snapshotSortieWorld(w));
assert.ok(!/hexagon|invertedTriangle|#4f8fe8/.test(body), "shapes are not saved");
assert.ok(worldFromCheckpointBody(JSON.parse(body)), "checkpoint still loads");
assert.ok(!/hexagon|#4f8fe8/.test(serializeHubSave(createHubSave(INITIAL_HUB))), "HUB save unchanged");
console.log("map shapes: colours, sizes, fixed shapes, compat PASS");

// 10/17 神宮: split supply drops use SORT's current red / yellow; circuit drop is whitish.
assert.equal(COLORS.ammoDrop, "#f85149");
assert.equal(COLORS.powerDrop, "#d4a72c");
assert.equal(COLORS.circuitDrop, "#e6e9ee");

// Wreck outline sits on the circle's own edge (one arc, stroked), width 2 — no separate outer ring.
{
  const arcs: number[] = []; let strokes = 0; let lw = 0;
  const ctx = { save() {}, restore() {}, beginPath() {}, fill() {}, arc(_x: number, _y: number, r: number) { arcs.push(r); },
    stroke() { strokes++; lw = (ctx as any).lineWidth; } } as any;
  const r = MECH_R * SHAPE_SIZE.wreck;
  drawDisc(ctx, 0, 0, r, COLORS.wreck, OWN_WRECK_OUTLINE);
  assert.deepEqual(arcs, [r]); assert.equal(strokes, 1); assert.equal(lw, 2);
  assert.equal(OWN_WRECK_OUTLINE.color, COLORS.wingman);
  // Left-behind ex-wingman wrecks and own wrecks share it; the old radius-13 ring is gone.
  const src = readFileSync(new URL("./game/render.ts", import.meta.url), "utf8");
  assert.ok(!/arc\([^)]*\b13 \* sx/.test(src), "no separate radius-13 ring");
  assert.ok((src.match(/COLORS\.wreck, OWN_WRECK_OUTLINE\)/g) ?? []).length >= 2, "stray and own wrecks use the edge outline");
}

// 10/17: containers warm grey (not wreck grey, not the whitish circuit square, not yellow); provisional looks kept.
assert.equal(COLORS.container, "#a39a8c");
assert.notEqual(COLORS.container, COLORS.wreck);
assert.notEqual(COLORS.container, COLORS.circuitDrop);
{
  const src = readFileSync(new URL("./game/render.ts", import.meta.url), "utf8");
  assert.ok(!src.includes('"#f0b429";'), "normal containers are no longer yellow");
  assert.ok(src.includes("fillRect(px - 8, py - 8, 16, 16)"), "containers stay 16px squares");
  assert.ok(src.includes('"#ff8a3d" : COLORS.container'), "DROP glow containers unchanged");
  assert.ok(src.includes("fillRect(tx(d.pos.x) - 4, ty(d.pos.y) - 4, 8, 8)"), "circuit square 8px");
  assert.ok(src.includes('"#9ecbff"'), "leader name colour kept");
  assert.equal((src.match(/leaderLabelLift\(sx\)/g) ?? []).length, 2, "leader label and its layout box use the same lift");
}
