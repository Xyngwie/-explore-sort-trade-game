import assert from "node:assert/strict";
import {
  DOT_DEAD_ZONE,
  EDGE_REACH,
  boardExtentPx,
  fitZoom,
  nearestEdgeAt,
  pitchAtZoom,
  shouldUseLargeBoardLayout,
  zoomFactor,
  type BoardGeometry,
} from "./boardHit";
import { hEdgeIndex, vEdgeIndex } from "./puzzle";

const geo = (cols: number, rows: number, pitchX = 40, pitchY = pitchX, originX = 100, originY = 50): BoardGeometry => ({
  cols, rows, pitchX, pitchY, originX, originY,
});
/** Lattice (u, v) → client point for geometry g. */
const at = (g: BoardGeometry, u: number, v: number): [number, number] => [g.originX + u * g.pitchX, g.originY + v * g.pitchY];
const hit = (g: BoardGeometry, u: number, v: number) => nearestEdgeAt(...at(g, u, v), g);

// --- nearest edge: interior, square 6×6 ---
{
  const g = geo(6, 6);
  // Exactly on the midpoint of h(2,3) and v(4,1)
  assert.deepEqual(hit(g, 2.5, 3), { kind: "h", x: 2, y: 3, index: hEdgeIndex(6, 6, 2, 3) });
  assert.deepEqual(hit(g, 4, 1.5), { kind: "v", x: 4, y: 1, index: vEdgeIndex(6, 6, 4, 1) });
  // Up to ±0.39 pitch perpendicular still picks the same edge (≈ ± half a cell)
  for (const d of [-0.39, -0.25, -0.1, 0.1, 0.25, 0.39]) {
    assert.equal(hit(g, 2.5, 3 + d)?.index, hEdgeIndex(6, 6, 2, 3), `h perp ${d}`);
    assert.equal(hit(g, 4 + d, 1.5)?.index, vEdgeIndex(6, 6, 4, 1), `v perp ${d}`);
  }
  // Along the edge until the dot dead zone
  for (const a of [0.21, 0.3, 0.5, 0.7, 0.79]) {
    assert.equal(hit(g, 2 + a, 3)?.index, hEdgeIndex(6, 6, 2, 3), `h along ${a}`);
    assert.equal(hit(g, 4, 1 + a)?.index, vEdgeIndex(6, 6, 4, 1), `v along ${a}`);
  }
  // Dot dead zone (all directions) around interior and corner vertices
  for (const [du, dv] of [[0, 0], [0.19, 0], [0, -0.19], [0.13, 0.13], [-0.1, 0.15]] as const) {
    assert.equal(hit(g, 3 + du, 3 + dv), null, `dot ${du},${dv}`);
    assert.equal(hit(g, 0 + Math.abs(du), 0 + Math.abs(dv)), null, `corner dot ${du},${dv}`);
  }
  assert.equal(DOT_DEAD_ZONE, 0.2);
  assert.equal(EDGE_REACH, 0.4);
  // Cell centre and beyond reach → none
  assert.equal(hit(g, 2.5, 2.5), null);
  assert.equal(hit(g, 2.5, 2.55), null); // 0.45 from both lines
  // Near the cell diagonal (|dh-dv| < 0.05) → ambiguous → none; just off it → decided
  assert.equal(hit(g, 2.3, 2.32), null);
  assert.equal(hit(g, 2.3, 2.38)?.kind, "v"); // dv=0.3 < dh=0.38 → vertical line x=2
  assert.equal(hit(g, 2.3, 2.38)?.index, vEdgeIndex(6, 6, 2, 2));
  assert.equal(hit(g, 2.38, 2.3)?.index, hEdgeIndex(6, 6, 2, 2));
}

// --- borders and the margin outside the board ---
{
  const g = geo(6, 6);
  assert.equal(hit(g, 0.5, 0)?.index, hEdgeIndex(6, 6, 0, 0)); // top border
  assert.equal(hit(g, 0.5, -0.35)?.index, hEdgeIndex(6, 6, 0, 0)); // just above the board
  assert.equal(hit(g, 5.5, 6.35)?.index, hEdgeIndex(6, 6, 5, 6)); // just below bottom border
  assert.equal(hit(g, -0.35, 2.5)?.index, vEdgeIndex(6, 6, 0, 2)); // left of left border
  assert.equal(hit(g, 6.35, 5.5)?.index, vEdgeIndex(6, 6, 6, 5)); // right of right border
  assert.equal(hit(g, 0.5, -0.45), null); // beyond reach
  assert.equal(hit(g, -0.3, -0.3), null); // outside corner (diagonal / beyond)
  assert.equal(hit(g, -0.6, 2.5), null);
  assert.equal(hit(g, 3, -1), null); // phantom vertex row
  assert.equal(hit(g, -1, 2.5), null); // phantom vertical line
  assert.equal(hit(g, 7, 2.5), null);
  assert.equal(hit(g, 2.5, 7), null);
  assert.equal(hit(g, 6.5, 3), null); // would be h(6,3) → invalid column
  assert.equal(hit(g, 3, 6.5), null); // would be v(3,6) → invalid row
}

// --- non-square boards: 5×3 and 3×7, non-uniform pitch, every edge's midpoint maps back ---
for (const [cols, rows, px, py] of [[5, 3, 37.6, 37.6], [3, 7, 21.5, 24], [1, 1, 30, 30], [20, 20, 17.4, 17.4]] as const) {
  const g = geo(cols, rows, px, py, 12.5, -300);
  const seen = new Set<number>();
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x < cols; x++) {
      const h = hit(g, x + 0.5, y);
      assert.deepEqual(h, { kind: "h", x, y, index: hEdgeIndex(cols, rows, x, y) }, `${cols}x${rows} h(${x},${y})`);
      assert.equal(hit(g, x + 0.5, y + 0.3)?.index, h!.index);
      assert.equal(hit(g, x + 0.5, y - 0.3)?.index, h!.index);
      seen.add(h!.index);
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x <= cols; x++) {
      const v = hit(g, x, y + 0.5);
      assert.deepEqual(v, { kind: "v", x, y, index: vEdgeIndex(cols, rows, x, y) }, `${cols}x${rows} v(${x},${y})`);
      seen.add(v!.index);
    }
  }
  assert.equal(seen.size, cols * (rows + 1) + (cols + 1) * rows, `${cols}x${rows} all edges reachable`);
  // Out of range columns/rows of a non-square board
  assert.equal(hit(g, cols + 0.5, 0), null);
  assert.equal(hit(g, 0, rows + 0.5), null);
}

// --- degenerate inputs ---
assert.equal(nearestEdgeAt(NaN, 1, geo(3, 3)), null);
assert.equal(nearestEdgeAt(1, 1, geo(3, 3, 0)), null);
assert.equal(nearestEdgeAt(1, 1, { ...geo(3, 3), cols: 0 }), null);

// --- layout / zoom helpers ---
{
  // 1× pitch = 2rem + 0.35rem = 37.6px (the "comfortable" 36–44 px band)
  assert.equal(pitchAtZoom(1), 37.6);
  assert.ok(Math.abs(pitchAtZoom(1.5) - 56.4) < 1e-9);
  assert.ok(Math.abs(boardExtentPx(20, 1) - 757.6) < 1e-9);
  assert.ok(Math.abs(boardExtentPx(6, 1) - 231.2) < 1e-9);
  // Large layout: N ≥ 11 regardless of width; small boards only when wider than available
  assert.equal(shouldUseLargeBoardLayout(6, 6, 320), false);
  assert.equal(shouldUseLargeBoardLayout(10, 10, 500), false);
  assert.equal(shouldUseLargeBoardLayout(10, 10, 320), true); // 358.5px > 320
  assert.equal(shouldUseLargeBoardLayout(11, 11, 2000), true);
  assert.equal(shouldUseLargeBoardLayout(4, 12, 2000), true);
  // Fit: whole board fits in the box, capped to [0.3, 1.5]
  for (const [n, w, h] of [[20, 340, 600], [15, 322, 530], [6, 340, 600], [20, 1200, 400], [9, 300, 300]] as const) {
    const z = fitZoom(n, n, w, h);
    assert.ok(z >= 0.3 && z <= 1.5, `fit range ${n}`);
    if (z > 0.3) {
      assert.ok(boardExtentPx(n, z) <= w + 1e-6 && boardExtentPx(n, z) <= h + 1e-6, `fit fits ${n} ${w}x${h}`);
      assert.ok(z === 1.5 || boardExtentPx(n, z) > Math.min(w, h) - 1, `fit is tight ${n}`);
    }
  }
  assert.equal(fitZoom(3, 3, 5000, 5000), 1.5);
  assert.equal(fitZoom(20, 20, 50, 50), 0.3);
  // 20×20 on a 390px phone: dot clamps at 3px, still fits exactly
  const z20 = fitZoom(20, 20, 342);
  assert.ok(Math.abs(boardExtentPx(20, z20) - 342) < 1e-6);
  assert.equal(zoomFactor("1", 0.4), 1);
  assert.equal(zoomFactor("1.5", 0.4), 1.5);
  assert.equal(zoomFactor("fit", 0.4), 0.4);
}

console.log("restore boardHit.selftest ok (nearest edge, dead zones, borders, non-square, zoom/layout)");
