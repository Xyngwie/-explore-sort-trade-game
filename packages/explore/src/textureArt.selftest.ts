import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createTextureCache, artVariant, drawArtMech, drawGround, drawTexture } from "./game/textureArt";
import manifest from "./game/textures/manifest.json";
import { renderWorld } from "./game/render";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";

class FakeImage {
  naturalWidth = 512;
  naturalHeight = 512;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private value = "";
  get src() { return this.value; }
  set src(s: string) { this.value = s; }
}
// Pending/failed assets return null, never create a retry storm or expose an undecoded image.
const made: FakeImage[] = [];
const cache = createTextureCache(() => { const i = new FakeImage(); made.push(i); return i as unknown as HTMLImageElement; });
assert.equal(cache("ground"), null);
assert.equal(cache("ground"), null);
assert.equal(made.length, 1);
made[0]!.onload!();
assert.equal(cache("ground"), made[0]);
assert.equal(cache("rover"), null);
made[1]!.onerror!();
for (let i = 0; i < 100; i++) assert.equal(cache("rover"), null);
assert.equal(made.length, 2, "failed image requested only once");
assert.equal(cache("wreck"), null);
made[2]!.naturalWidth = 0;
made[2]!.onload!();
assert.equal(cache("wreck"), null, "invalid decode stays on fallback");

const images: unknown[][] = [], angles: number[] = [], scales: number[][] = [], strokes: string[] = [];
const ctx = new Proxy({ canvas: { width: 720, height: 420, clientWidth: 720 }, globalAlpha: 1 }, {
  get(t, p) {
    if (p === "drawImage") return (...a: unknown[]) => images.push(a);
    if (p === "rotate") return (a: number) => angles.push(a);
    if (p === "scale") return (...a: number[]) => scales.push(a);
    if (p === "stroke") return () => strokes.push((t as any).strokeStyle);
    if (p === "measureText") return (s: string) => ({ width: s.length * 6 });
    return p in t ? (t as any)[p] : () => {};
  }, set(t, p, v) { (t as any)[p] = v; return true; },
}) as unknown as CanvasRenderingContext2D;
assert.equal(drawTexture(ctx, "ground", 20, 20, 16), false, "Node/no Image uses original art");
drawArtMech(ctx, 20, 20, 12, "#4f8fe8", "hexagon", 0);
assert.equal(images.length, 0);

class ReadyImage extends FakeImage {
  private source = "";
  override get src() { return this.source; }
  override set src(s: string) { this.source = s; if (s) this.onload?.(); }
}
Object.defineProperty(globalThis, "Image", { value: ReadyImage, configurable: true });
drawArtMech(ctx, 50, 50, 12, "#4f8fe8", "hexagon", 0);
assert.equal(images.length, 1);
assert.equal(angles.at(-1), Math.PI / 2, "up-facing source rotates to world heading right");
assert.ok(strokes.includes("#4f8fe8"), "faction outline remains over art");
const camera = { x: -700, y: -300, w: 1000, h: 600 };
assert.ok(drawGround(ctx, camera, 720, 420));
assert.ok(scales.some(([x, y]) => x === -1 && y === -1), "negative coordinates mirror both tile edges");
const i0 = images.length;
drawTexture(ctx, "supplies", 20, 20, 10, 10, 0, 3);
assert.deepEqual(images[i0]!.slice(1, 5), manifest.supplies.regions[3], "circuit uses its cell, no other pickup bleeds in");
const i1 = images.length;
drawTexture(ctx, "rover", -1000, -1000, 10);
assert.equal(images.length, i1, "offscreen sprites culled");
assert.equal(artVariant("container-fixed", 4), artVariant("container-fixed", 4));

// The actual renderer still hides an enemy outside vision and leaves the save body untouched.
const w = createWorld(bootstrapFromSearch("")); startSortie(w);
const enemy = { ...w.enemies[0]!, pos: { x: 100000, y: 100000 }, placedCell: undefined, alive: true };
w.enemies = [enemy];
w.wingmen = [];
w.camera = { x: w.leader.pos.x - 100, y: w.leader.pos.y - 100, w: 400, h: 240 };
w.leader.heading = 0;
renderWorld(ctx, w, 720, 420); // Initialize the renderer's existing cover/intel caches.
const before = JSON.stringify(w);
images.length = 0;
renderWorld(ctx, w, 720, 420);
assert.equal(JSON.stringify(w), before, "rendering does not write texture state into World");
const roverCount = () => images.filter(([im]) => (im as FakeImage).src.includes("rover.webp")).length;
assert.equal(roverCount(), 1, "only leader art, unseen enemy is hidden");
enemy.pos = { x: w.leader.pos.x + 25, y: w.leader.pos.y };
images.length = 0;
renderWorld(ctx, w, 720, 420);
assert.equal(roverCount(), 2, "visible enemy gets its art");
delete (globalThis as any).Image;

let bytes = 0;
for (const [key, entry] of Object.entries(manifest)) {
  const path = new URL(`./game/textures/${key}.webp`, import.meta.url);
  const data = readFileSync(path);
  assert.equal(data.toString("ascii", 0, 4), "RIFF");
  assert.equal(data.toString("ascii", 8, 12), "WEBP");
  assert.equal(statSync(path).size, entry.bytes);
  bytes += data.length;
  for (const [x, y, width, height] of entry.regions) {
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
    assert.ok(x + width <= entry.size[0]! && y + height <= entry.size[1]!, "atlas region in bounds");
  }
}
assert.ok(bytes < 300 * 1024, "mobile asset budget below 300 KiB");
console.log("texture art: pending/error/fallback, heading/role, negative tiles, atlas, culling, fog, save isolation and asset budget PASS");
