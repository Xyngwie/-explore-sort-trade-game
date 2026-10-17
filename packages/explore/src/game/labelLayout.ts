// Map name labels: shift a label up a line when it would overlap one already placed (the ring itself is unchanged).
export type LabelBox = { x: number; y: number; w: number; h: number };

export function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y - a.h < b.y && b.y - b.h < a.y;
}

/**
 * `y` is the text baseline; the box spans [y - h, y]. Fixed boxes (e.g. the leader label) never move.
 * Returns the adjusted baseline for each label, in input order.
 */
export function layoutLabels(labels: LabelBox[], fixed: LabelBox[] = [], step = 13, maxShifts = 6): number[] {
  const placed: LabelBox[] = [...fixed];
  const out = labels.map((l) => l.y);
  const order = labels.map((_, i) => i).sort((i, j) => labels[j]!.y - labels[i]!.y || labels[i]!.x - labels[j]!.x);
  for (const i of order) {
    const b = { ...labels[i]! };
    for (let n = 0; n < maxShifts && placed.some((p) => boxesOverlap(b, p)); n++) b.y -= step;
    out[i] = b.y;
    placed.push(b);
  }
  return out;
}
