/**
 * Stage 2: HQ center is world (0, 0), +sx is right, +sy is down.
 * Half-open cells. Off-board world points are null.
 */
import assert from "node:assert/strict";
import {
  AOI_HALF,
  CELL_WORLD_H,
  CELL_WORLD_W,
  cellBoundsInWorld,
  cellCenterToWorld,
  worldToCell,
} from "./index";

assert.equal(CELL_WORLD_W, 1400);
assert.equal(CELL_WORLD_H, 1000);
assert.equal(AOI_HALF, 12);

assert.deepEqual(cellCenterToWorld(0, 0), { x: 0, y: 0 });
assert.deepEqual(cellBoundsInWorld(0, 0), {
  x0: -700,
  y0: -500,
  x1: 700,
  y1: 500,
});

assert.deepEqual(cellCenterToWorld(-12, -12), { x: -16800, y: -12000 });
assert.deepEqual(cellBoundsInWorld(-12, -12), {
  x0: -17500,
  y0: -12500,
  x1: -16100,
  y1: -11500,
});
assert.deepEqual(cellCenterToWorld(12, 12), { x: 16800, y: 12000 });
assert.deepEqual(cellBoundsInWorld(12, 12), {
  x0: 16100,
  y0: 11500,
  x1: 17500,
  y1: 12500,
});

// +sx is +x (right). +sy is +y (down).
assert.deepEqual(cellCenterToWorld(1, 0), { x: 1400, y: 0 });
assert.deepEqual(cellCenterToWorld(0, 1), { x: 0, y: 1000 });
assert.deepEqual(cellCenterToWorld(-1, -1), { x: -1400, y: -1000 });
assert.ok(cellCenterToWorld(2, 0).x > cellCenterToWorld(1, 0).x);
assert.ok(cellCenterToWorld(0, 2).y > cellCenterToWorld(0, 1).y);

// Left/top edge stays in the cell. Right/bottom edge is the next cell.
assert.deepEqual(worldToCell(-700, -500), { sx: 0, sy: 0 });
assert.deepEqual(worldToCell(699, 499), { sx: 0, sy: 0 });
assert.deepEqual(worldToCell(699.5, 499.5), { sx: 0, sy: 0 });
assert.deepEqual(worldToCell(700 - 1e-6, 500 - 1e-6), { sx: 0, sy: 0 });
assert.deepEqual(worldToCell(700, 500), { sx: 1, sy: 1 });
assert.deepEqual(worldToCell(700, -500), { sx: 1, sy: 0 });
assert.deepEqual(worldToCell(-700, 500), { sx: 0, sy: 1 });
assert.deepEqual(worldToCell(-701, -501), { sx: -1, sy: -1 });
assert.deepEqual(worldToCell(-700, 0), { sx: 0, sy: 0 });
assert.deepEqual(worldToCell(-16100, -11500), { sx: -11, sy: -11 });

// Inclusive outer corner vs exclusive far edges.
assert.deepEqual(worldToCell(-17500, -12500), { sx: -12, sy: -12 });
assert.equal(worldToCell(17500, 12500), null);
assert.equal(worldToCell(17500, 0), null);
assert.equal(worldToCell(0, 12500), null);
assert.equal(worldToCell(-17501, 0), null);
assert.equal(worldToCell(0, -12501), null);
assert.deepEqual(worldToCell(17499, 12499), { sx: 12, sy: 12 });
assert.deepEqual(worldToCell(16100, 11500), { sx: 12, sy: 12 });
assert.deepEqual(worldToCell(16099, 11499), { sx: 11, sy: 11 });

// Off the board by a whole cell, including the center of that cell.
assert.deepEqual(cellCenterToWorld(13, 0), { x: 18200, y: 0 });
assert.equal(worldToCell(18200, 0), null);
assert.equal(worldToCell(0, 13000), null);
assert.equal(worldToCell(-18200, -13000), null);
assert.equal(worldToCell(Number.NaN, 0), null);
assert.equal(worldToCell(0, Number.NaN), null);
assert.equal(worldToCell(Number.POSITIVE_INFINITY, 0), null);
assert.equal(worldToCell(0, Number.NEGATIVE_INFINITY), null);
assert.equal(worldToCell(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY), null);

// The forward formula does not clamp. The inverse does.
const off = cellBoundsInWorld(13, -13);
assert.equal(off.x0, 17500);
assert.equal(off.y0, -13500);
assert.equal(worldToCell(off.x0, 0), null);

for (let sy = -AOI_HALF; sy <= AOI_HALF; sy++) {
  for (let sx = -AOI_HALF; sx <= AOI_HALF; sx++) {
    const center = cellCenterToWorld(sx, sy);
    assert.deepEqual(center, { x: sx * CELL_WORLD_W, y: sy * CELL_WORLD_H });
    assert.deepEqual(worldToCell(center.x, center.y), { sx, sy }, `center ${sx},${sy}`);

    const bounds = cellBoundsInWorld(sx, sy);
    assert.equal(bounds.x1 - bounds.x0, CELL_WORLD_W);
    assert.equal(bounds.y1 - bounds.y0, CELL_WORLD_H);
    assert.equal(bounds.x0, sx * CELL_WORLD_W - CELL_WORLD_W / 2);
    assert.equal(bounds.y0, sy * CELL_WORLD_H - CELL_WORLD_H / 2);
    assert.deepEqual(worldToCell(bounds.x0, bounds.y0), { sx, sy }, `origin edge ${sx},${sy}`);
    assert.deepEqual(worldToCell(bounds.x1 - 1, bounds.y1 - 1), { sx, sy }, `inside far edge ${sx},${sy}`);

    const right = worldToCell(bounds.x1, center.y);
    if (sx === AOI_HALF) assert.equal(right, null, `right edge of ${sx}`);
    else assert.deepEqual(right, { sx: sx + 1, sy }, `right edge of ${sx},${sy}`);

    const below = worldToCell(center.x, bounds.y1);
    if (sy === AOI_HALF) assert.equal(below, null, `bottom edge of ${sy}`);
    else assert.deepEqual(below, { sx, sy: sy + 1 }, `bottom edge of ${sx},${sy}`);

    const left = worldToCell(bounds.x0 - 1, center.y);
    if (sx === -AOI_HALF) assert.equal(left, null, `outside left of ${sx}`);
    else assert.deepEqual(left, { sx: sx - 1, sy }, `left of ${sx},${sy}`);

    const above = worldToCell(center.x, bounds.y0 - 1);
    if (sy === -AOI_HALF) assert.equal(above, null, `outside top of ${sy}`);
    else assert.deepEqual(above, { sx, sy: sy - 1 }, `above ${sx},${sy}`);
  }
}

assert.equal(-AOI_HALF * CELL_WORLD_W - CELL_WORLD_W / 2, -17500);
assert.equal(AOI_HALF * CELL_WORLD_W + CELL_WORLD_W / 2, 17500);
assert.equal(-AOI_HALF * CELL_WORLD_H - CELL_WORLD_H / 2, -12500);
assert.equal(AOI_HALF * CELL_WORLD_H + CELL_WORLD_H / 2, 12500);
assert.equal((AOI_HALF * 2 + 1) * CELL_WORLD_W, 35000);
assert.equal((AOI_HALF * 2 + 1) * CELL_WORLD_H, 25000);

console.log("cell-world PASS");
