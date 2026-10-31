import assert from "node:assert/strict";
import { gestureDownForTap, clampZoom, viewCamera, withViewCamera, pinchZoom, doubleTapZoom, newMapGestureState, gestureDown, gestureMove, gestureUp, MAP_ZOOM_MAX } from "./game/mapZoom";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
const base = { x: 100, y: 50, w: 720, h: 420 };
assert.equal(viewCamera(base, 1, 2000, 2000), base);
const v = viewCamera(base, 2, 2000, 2000); assert.deepEqual(v, { x: 280, y: 155, w: 360, h: 210 }, "same centre, half size");
assert.deepEqual(viewCamera({ x: 0, y: 0, w: 720, h: 420 }, 2, 2000, 2000), { x: 180, y: 105, w: 360, h: 210 });
assert.equal(viewCamera({ x: 1280, y: 0, w: 720, h: 420 }, 2, 2000, 2000).x + 360 <= 2000, true, "clamped in world");
assert.equal(clampZoom(9), MAP_ZOOM_MAX); assert.equal(clampZoom(0.2), 1); assert.equal(clampZoom(NaN), 1);
assert.equal(pinchZoom(1, 100, 200), 2); assert.equal(pinchZoom(2, 100, 10), 1);
assert.equal(doubleTapZoom(1), 2); assert.equal(doubleTapZoom(1.4), 1);
const s = newMapGestureState();
assert.equal(gestureDown(s, 1, 10, 10, 0), "tap"); gestureUp(s, 1);
assert.equal(gestureDown(s, 1, 12, 12, 200), "doubletap"); assert.equal(s.zoom, 2); gestureUp(s, 1);
assert.equal(gestureDown(s, 1, 12, 12, 1000), "tap"); assert.equal(gestureDown(s, 2, 112, 12, 1010), "pinch");
gestureMove(s, 2, 62, 12); assert.equal(s.zoom, 1, "pinch in → 1×"); gestureUp(s, 2); gestureUp(s, 1); assert.equal(s.pinch, null);
// Checkpoint compat: the view camera is swapped back, so a snapshot taken after drawing equals one taken before.
const world = { phase: "sortie", leader: { pos: { x: 1, y: 1 } }, balance: { worldW: 2000, worldH: 2000 }, camera: { ...base } } as never as Parameters<typeof withViewCamera>[0];
const before = JSON.stringify(snapshotSortieWorld(world));
const seen = withViewCamera(world, 2, () => ({ ...world.camera }));
assert.equal(seen.w, 360); assert.equal(JSON.stringify(snapshotSortieWorld(world)), before, "snapshot unchanged by zoom");
assert.throws(() => withViewCamera(world, 2, () => { throw Error("x"); })); assert.deepEqual(world.camera, base, "restored after throw");
const old = worldFromCheckpointBody(JSON.parse(before)); assert.ok(old && old.camera.w === 720, "old checkpoint loads at base camera");
// Q3 (Bugbot #341): a double-tap's 2nd tap maps with the zoom shown before it, not the toggled one.
{
  const g = newMapGestureState(); const cam = { x: 100, y: 50, w: 720, h: 420 };
  const at = (z: number, nx: number, ny: number) => { const v = viewCamera(cam, z, 2000, 2000); return { x: v.x + nx * v.w, y: v.y + ny * v.h }; };
  const t1 = gestureDownForTap(g, 1, 50, 50, 0); gestureUp(g, 1);
  const t2 = gestureDownForTap(g, 1, 52, 50, 150); gestureUp(g, 1);
  assert.equal(t1.tapZoom, 1); assert.equal(t2.kind, "doubletap"); assert.equal(g.zoom, 2, "zoom toggled for the next frame");
  assert.equal(t2.tapZoom, 1, "2nd tap uses the old zoom");
  assert.deepEqual(at(t2.tapZoom, 0.1, 0.1), at(1, 0.1, 0.1)); assert.notDeepEqual(at(g.zoom, 0.1, 0.1), at(1, 0.1, 0.1));
  const t3 = gestureDownForTap(g, 1, 52, 50, 1000); gestureUp(g, 1); const t4 = gestureDownForTap(g, 1, 52, 50, 1100);
  assert.equal(t4.kind, "doubletap"); assert.equal(t4.tapZoom, 2, "zoom-out double-tap maps with 2×"); assert.equal(t3.tapZoom, 2); assert.equal(g.zoom, 1);
}
console.log("map zoom (pinch / double-tap / clamp), view-only camera, checkpoint unchanged PASS");
