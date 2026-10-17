// 2026-10-17 神宮: map colours and shapes. Shapes are fixed (never rotated); a short line shows facing.
import { BALANCE } from "./balance";

/** Mech radius on the map = the sim's unit radius. */
export const MECH_R = BALANCE.unitRadius;
export const SHAPE_SIZE = { leader: 1.1, wingman: 1.0, enemy: 1.0, wreck: 0.75, supply: 0.35 } as const;
export const COLORS = {
  leader: "#4f8fe8", // darker under-command blue
  wingman: "#7eb6ff", // under-command blue
  enemy: "#ff6b6b", // hostile red
  wreck: "#8a9099", // grey
  ownWreckOutline: "#7eb6ff",
  ammoDrop: "#f85149", // ammo = red (神宮 10/17 C; same value as SORT's warn red today)
  powerDrop: "#d4a72c", // power = yellow (神宮 10/17 C). SORT still uses this yellow for armor; SORT will move to ammo red / power yellow / armor+defence blue in its own PR.
  circuitDrop: "#e6e9ee", // whitish
  container: "#a39a8c", // warm grey (10/17): apart from the cool wreck grey and the whitish circuit square
  containerEdge: "#d2cabd",
} as const;
export const OWN_WRECK_OUTLINE_W = 2;
/** Blue outline on the wreck circle's own edge: own wrecks from this sortie and left-behind ex-wingman wrecks alike. */
export const OWN_WRECK_OUTLINE = { color: COLORS.ownWreckOutline, width: OWN_WRECK_OUTLINE_W } as const;
/** Facing line length as a multiple of the shape radius (width 2). */
export const FACING_LINE_RATIO = 1.6;
/** 10/17: the leader name sits just above the tip of an upward facing line (never lower than the old 22px). */
export function leaderLabelLift(scale: number): number {
  return Math.max(22, MECH_R * SHAPE_SIZE.leader * FACING_LINE_RATIO * scale + 4);
}
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
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(heading) * r * FACING_LINE_RATIO, y + Math.sin(heading) * r * FACING_LINE_RATIO); ctx.stroke();
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
