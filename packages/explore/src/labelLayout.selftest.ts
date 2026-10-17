import assert from "node:assert/strict";
import { boxesOverlap, layoutLabels } from "./game/labelLayout";
import { FACING_LINE_RATIO, MECH_R, SHAPE_SIZE, leaderLabelLift } from "./game/mapShapes";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";

// Sortie start ring (#294): the top two wingmen labels overlapped. Ring positions stay; labels separate.
for (const n of [2, 3, 4, 6]) {
  const w = createWorld(bootstrapFromSearch(`?deployableMechs=${n + 1}`)); startSortie(w);
  const before = w.wingmen.map((u) => ({ ...u.pos }));
  const boxes = w.wingmen.map((u) => ({ x: u.pos.x - 28, y: u.pos.y - u.radius - 8, w: 150, h: 12 }));
  const leader = { x: w.leader.pos.x - 18, y: w.leader.pos.y - 22, w: 24, h: 12 };
  const ys = layoutLabels(boxes, [leader]);
  const placed = boxes.map((b, i) => ({ ...b, y: ys[i]! }));
  for (let i = 0; i < placed.length; i++) {
    assert.ok(!boxesOverlap(placed[i]!, leader), `n=${n}: no overlap with the leader label`);
    for (let j = i + 1; j < placed.length; j++) assert.ok(!boxesOverlap(placed[i]!, placed[j]!), `n=${n}: labels ${i},${j} overlap`);
  }
  assert.deepEqual(w.wingmen.map((u) => u.pos), before, "ring unchanged");
}
// Non-overlapping labels are not moved.
assert.deepEqual(layoutLabels([{ x: 0, y: 100, w: 50, h: 12 }, { x: 200, y: 100, w: 50, h: 12 }]), [100, 100]);
// 10/17: the leader name moves up above its facing line; #296's one-line shift of wingman names still holds.
for (const scale of [0.6, 1, 1.5, 2.5]) {
  const tip = MECH_R * SHAPE_SIZE.leader * FACING_LINE_RATIO * scale; // facing line pointing straight up
  const lift = leaderLabelLift(scale);
  assert.ok(lift >= 22, "never lower than before");
  assert.ok(lift - 0 > tip, `scale ${scale}: label baseline above the line tip`);
  for (const n of [2, 3, 4, 6]) {
    const w = createWorld(bootstrapFromSearch(`?deployableMechs=${n + 1}`)); startSortie(w);
    const P = (v: { x: number; y: number }) => ({ x: v.x * scale, y: v.y * scale });
    const boxes = w.wingmen.map((u) => ({ x: P(u.pos).x - 28, y: P(u.pos).y - u.radius * scale - 8, w: 150, h: 12 }));
    const leader = { x: P(w.leader.pos).x - 18, y: P(w.leader.pos).y - lift, w: 24, h: 12 };
    const ys = layoutLabels(boxes, [leader]);
    const placed = boxes.map((b, i) => ({ ...b, y: ys[i]! }));
    for (let i = 0; i < placed.length; i++) {
      assert.ok(!boxesOverlap(placed[i]!, leader), `scale ${scale} n=${n}: no overlap with the leader label`);
      for (let j = i + 1; j < placed.length; j++) assert.ok(!boxesOverlap(placed[i]!, placed[j]!), `scale ${scale} n=${n}: ${i},${j} overlap`);
      assert.ok(Number.isInteger((boxes[i]!.y - ys[i]!) / 13), "shifts are whole lines (13px)");
    }
  }
}
// The one-line shift itself still happens for two overlapping wingman names.
assert.deepEqual(layoutLabels([{ x: 0, y: 100, w: 50, h: 12 }, { x: 10, y: 100, w: 50, h: 12 }]), [100, 87]);
console.log("label layout: ring labels separate, ring unchanged PASS");
