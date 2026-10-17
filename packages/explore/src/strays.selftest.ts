import assert from "node:assert/strict";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { tickWorld } from "./game/sim";
import { getCoverObjects } from "./game/coverObjects";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { scatterStrayPos, strayShown, strayStoppedLabel, strayWreckLabel, STRAY_EDGE_MARGIN } from "./game/strayScatter";

const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };
const w = createWorld(bootstrapFromSearch("")); startSortie(w);
// 1/3: anywhere inside the 90 margin, clear of obstacles and containers.
const taken: { x: number; y: number }[] = [];
for (let i = 0; i < 40; i++) {
  const p = scatterStrayPos(w, taken);
  assert.ok(p.x >= STRAY_EDGE_MARGIN && p.x <= w.balance.worldW - STRAY_EDGE_MARGIN && p.y >= STRAY_EDGE_MARGIN && p.y <= w.balance.worldH - STRAY_EDGE_MARGIN, "edge margin");
  for (const c of getCoverObjects(w)) assert.ok(Math.hypot(p.x - c.pos.x, p.y - c.pos.y) >= c.radius, "not on an obstacle");
  for (const c of w.containers) assert.ok(Math.hypot(p.x - c.pos.x, p.y - c.pos.y) >= 40 - 1e-9, "clear of containers");
}
// 4: hidden until an ally sees it, then shown.
for (const e of w.enemies) e.alive = false;
const far = { x: w.leader.pos.x + 500, y: w.leader.pos.y };
w.strandedDrops = [{ dropId: "d1", circuitId: "c1", pos: far, drop: {} as never, found: false }];
tickWorld(w, 0.05, idle);
assert.equal(strayShown(w.strandedDrops[0]!), false, "hidden in fog");
w.leader.pos = { x: far.x - 50, y: far.y };
tickWorld(w, 0.05, idle);
assert.equal(strayShown(w.strandedDrops[0]!), true, "found once seen");
// 5: position and found state survive the checkpoint.
w.strandedDrops.push({ dropId: "d2", circuitId: "c2", pos: { x: 300, y: 300 }, drop: {} as never, found: false });
const r = worldFromCheckpointBody(JSON.parse(JSON.stringify(snapshotSortieWorld(w))))!;
assert.deepEqual(r.strandedDrops!.map((d) => [d.pos, d.found]), [[w.strandedDrops[0]!.pos, true], [{ x: 300, y: 300 }, false]]);
// 6: an old checkpoint (no `found`) resumes at its saved spot and stays shown.
const old = JSON.parse(JSON.stringify(snapshotSortieWorld(w))) as { strandedDrops: Record<string, unknown>[] };
old.strandedDrops = [{ dropId: "d3", circuitId: "c3", pos: { x: 180, y: 430 }, drop: {} }];
const ro = worldFromCheckpointBody(old)!;
assert.deepEqual(ro.strandedDrops![0]!.pos, { x: 180, y: 430 }); assert.equal(strayShown(ro.strandedDrops![0]!), true);
// Label.
// 10/17 神宮 4: last 4 characters of the id; shorter ids in full. Same for the stopped-mech label.
assert.equal(strayWreckLabel("m2"), "置き去り：m2");
assert.equal(strayWreckLabel("abcd"), "置き去り：abcd");
assert.equal(strayWreckLabel("owned_mech_7f3a"), "置き去り：7f3a");
assert.equal(strayStoppedLabel("owned_mech_7f3a"), "置き去り機 7f3a（停止）");
assert.equal(strayStoppedLabel("m2"), "置き去り機 m2（停止）");
// 10/17 神宮 5 = B: one tactics line on discovery, once.
{
  const v = createWorld(bootstrapFromSearch("")); startSortie(v);
  for (const e of v.enemies) e.alive = false;
  v.strandedMechs = [{ instanceId: "owned_mech_7f3a", name: "x", pos: { x: v.leader.pos.x + 40, y: v.leader.pos.y - 40 }, row: {} as never, wreck: true, found: false }];
  tickWorld(v, 0.05, idle); tickWorld(v, 0.05, idle);
  assert.equal(v.logs.filter((l) => l.text === "発見：置き去り 7f3a").length, 1, "one discovery line");
}
console.log("strays: scatter, hidden until found, checkpoint compat, label PASS");
