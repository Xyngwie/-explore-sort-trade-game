// 2026-10-17 神宮: map colours and shapes. Shapes are fixed (never rotated); a short line shows facing.
export const MECH_R = 14;
export const SHAPE_SIZE = { leader: 1.1, wingman: 1.0, enemy: 1.0, wreck: 0.75, supply: 0.35 } as const;
export const COLORS = {
  leader: "#4f8fe8", // darker under-command blue
  wingman: "#7eb6ff", // under-command blue
  enemy: "#ff6b6b", // hostile red
  wreck: "#8a9099", // grey
  ownWreckOutline: "#7eb6ff",
  ammoDrop: "#f85149", // SORT red (style.css .warn)
  powerDrop: "#d4a72c", // SORT yellow (four-resource.css armor border)
  circuitDrop: "#e6e9ee", // whitish
} as const;
export const OWN_WRECK_OUTLINE_W = 2;
export type MechShape = "hexagon" | "triangle" | "invertedTriangle";

/** Fixed (unrotated) polygon vertices around (0,0), radius r. Screen y grows downward. */
export function shapePoints(shape: MechShape, r: number): { x: number; y: number }[] {
  const poly = (n: number, start: number) => Array.from({ length: n }, (_, i) => {
    const a = start + (Math.PI * 2 * i) / n;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  if (shape === "hexagon") return poly(6, 0);
  if (shape === "triangle") return poly(3, -Math.PI / 2); // apex up
  return poly(3, Math.PI / 2); // apex down
}

export function drawMechShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, shape: MechShape, heading: number | null): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  shapePoints(shape, r).forEach((p, i) => (i ? ctx.lineTo(x + p.x, y + p.y) : ctx.moveTo(x + p.x, y + p.y)));
  ctx.closePath();
  ctx.fill();
  if (heading != null) {
    // Facing: a short line from the centre past the edge (provisional: 1.6 r, width 2).
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(heading) * r * 1.6, y + Math.sin(heading) * r * 1.6); ctx.stroke();
  }
  ctx.restore();
}

export function drawDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, outline?: { color: string; width: number }): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (outline) { ctx.strokeStyle = outline.color; ctx.lineWidth = outline.width; ctx.stroke(); }
  ctx.restore();
}
