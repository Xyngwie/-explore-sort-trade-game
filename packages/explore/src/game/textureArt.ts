/** Presentation-only assets, shared by the canvas and original exploration pages. */
import manifest from "./textures/manifest.json";
import { drawDisc, drawMechShape, shapePoints, FACING_LINE_RATIO, type MechShape } from "./mapShapes";

const urls = {
  ground: new URL("./textures/ground.webp", import.meta.url).href,
  rover: new URL("./textures/rover.webp", import.meta.url).href,
  wreck: new URL("./textures/wreck.webp", import.meta.url).href,
  shield: new URL("./textures/shield.webp", import.meta.url).href,
  barricade: new URL("./textures/barricade.webp", import.meta.url).href,
  supplies: new URL("./textures/supplies.webp", import.meta.url).href,
  containers: new URL("./textures/containers.webp", import.meta.url).href,
  rubble: new URL("./textures/rubble.webp", import.meta.url).href,
};
export type TextureKey = keyof typeof urls;
type Entry = { image: HTMLImageElement; ready: boolean };

/** One request per file, including errors. No image state ever enters a World or save. */
export function createTextureCache(makeImage: () => HTMLImageElement) {
  const entries = new Map<TextureKey, Entry>();
  return (key: TextureKey): HTMLImageElement | null => {
    let entry = entries.get(key);
    if (!entry) {
      const image = makeImage();
      entry = { image, ready: false };
      entries.set(key, entry);
      const current = entry;
      image.onload = () => { current.ready = image.naturalWidth > 0 && image.naturalHeight > 0; };
      image.onerror = () => { current.ready = false; };
      image.src = urls[key];
    }
    return entry.ready ? entry.image : null;
  };
}
const cached = createTextureCache(() => new Image());
export function textureImage(key: TextureKey): HTMLImageElement | null {
  return typeof Image === "undefined" ? null : cached(key);
}

/** Stable atlas choices, independent of frame rate, camera and simulation RNG. */
export function artVariant(id: string, count: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (Math.imul(hash, 31) + id.charCodeAt(i)) | 0;
  return (hash >>> 0) % count;
}

/** Centered sprite, with transparent atlas gutters excluded. Width/height are maximum bounds. */
export function drawTexture(ctx: CanvasRenderingContext2D, key: TextureKey, x: number, y: number,
  width: number, height = width, angle = 0, variant = 0): boolean {
  const image = textureImage(key);
  if (!image || typeof ctx.drawImage !== "function") return false;
  const regions = manifest[key].regions;
  const [left, top, sw, sh] = regions[variant % regions.length]!;
  const fit = Math.min(width / sw!, height / sh!);
  const dw = sw! * fit, dh = sh! * fit;
  // Canvas owns clipping: cull only objects whose entire rotated bounds are off screen.
  const bound = Math.hypot(dw, dh) / 2;
  if (x + bound < 0 || y + bound < 0 || x - bound > ctx.canvas.width || y - bound > ctx.canvas.height) return true;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.drawImage(image, left!, top!, sw!, sh!, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return true;
}

/** World-anchored mirrored tiling: neighboring edges meet, including at negative coordinates. */
export function drawGround(ctx: CanvasRenderingContext2D, camera: { x: number; y: number; w: number; h: number },
  width: number, height: number): boolean {
  const image = textureImage("ground");
  if (!image || typeof ctx.drawImage !== "function") return false;
  const tile = 512, sx = width / camera.w, sy = height / camera.h;
  const c0 = Math.floor(camera.x / tile), r0 = Math.floor(camera.y / tile);
  const c1 = Math.ceil((camera.x + camera.w) / tile), r1 = Math.ceil((camera.y + camera.h) / tile);
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
    const x = (c * tile - camera.x) * sx, y = (r * tile - camera.y) * sy;
    const w = tile * sx, h = tile * sy;
    const flipX = Math.abs(c % 2) === 1, flipY = Math.abs(r % 2) === 1;
    ctx.save();
    ctx.translate(x + (flipX ? w : 0), y + (flipY ? h : 0));
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(image, 0, 0, w + 0.5, h + 0.5);
    ctx.restore();
  }
  return true;
}

/** The original non-rotating faction/role outline and facing line remain over the rotating art. */
export function drawArtMech(ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  color: string, shape: MechShape, heading: number | null): void {
  if (!drawTexture(ctx, "rover", x, y, r * 2, r * 2, heading == null ? 0 : heading + Math.PI / 2)) {
    drawMechShape(ctx, x, y, r, color, shape, heading); return;
  }
  ctx.save();
  ctx.strokeStyle = "#17212b"; ctx.lineWidth = 4;
  ctx.beginPath();
  shapePoints(shape, r).forEach((p, i) => i ? ctx.lineTo(x + p.x, y + p.y) : ctx.moveTo(x + p.x, y + p.y));
  ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  if (heading != null) {
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(heading) * r * FACING_LINE_RATIO, y + Math.sin(heading) * r * FACING_LINE_RATIO);
    ctx.strokeStyle = "#17212b"; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
}

export function drawArtWreck(ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  color: string, outline?: { color: string; width: number }): void {
  if (!drawTexture(ctx, "wreck", x, y, r * 2)) { drawDisc(ctx, x, y, r, color, outline); return; }
  if (outline) {
    ctx.save(); ctx.strokeStyle = outline.color; ctx.lineWidth = outline.width;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}

/** Labels stay legible on the pale shell as well as on fog and dark fallback ground. */
export function worldText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save(); ctx.strokeStyle = "#102030"; ctx.lineJoin = "round"; ctx.lineWidth = 3;
  ctx.strokeText(text, x, y); ctx.fillText(text, x, y); ctx.restore();
}
