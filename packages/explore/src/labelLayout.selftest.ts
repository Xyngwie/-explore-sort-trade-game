import assert from "node:assert/strict";
import { boxesOverlap, layoutLabels } from "./game/labelLayout";
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
console.log("label layout: ring labels separate, ring unchanged PASS");
