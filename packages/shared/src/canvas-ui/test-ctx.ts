/** Minimal 2D context stub for Node selftests (records drawn text). */
import type { Ctx2D } from "./core";

export type StubCtx = Ctx2D & { texts: string[]; ops: number };
export function createStubCtx(): StubCtx {
  const self = {
    texts: [] as string[],
    ops: 0,
    fillStyle: "#000" as Ctx2D["fillStyle"],
    strokeStyle: "#000" as Ctx2D["strokeStyle"],
    lineWidth: 1,
    font: "14px sans-serif",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    globalAlpha: 1,
    measureText(text: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(self.font)?.[1] ?? 14);
      let w = 0;
      for (const ch of Array.from(text)) w += ch.charCodeAt(0) > 0x2e7f ? size : size * 0.6;
      return { width: w } as TextMetrics;
    },
    fillText(text: string) { self.texts.push(text); self.ops++; },
  } as unknown as StubCtx;
  for (const m of ["save", "restore", "beginPath", "rect", "clip", "fillRect", "strokeRect", "moveTo", "lineTo", "arcTo", "closePath", "fill", "stroke", "setTransform", "clearRect", "arc", "setLineDash"]) {
    (self as unknown as Record<string, () => void>)[m] = () => { self.ops++; };
  }
  return self;
}
