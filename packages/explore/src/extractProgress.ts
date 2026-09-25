/**
 * Progress model for the active Explore extraction sequence.
 * Pure calculation so the HUD can visualize the existing countdown without
 * changing extraction rules.
 */
export function extractionProgressPct(
  liftOffEta: number | null,
  cargoDelaySec: number,
  liftOffDelaySec: number,
): number {
  if (liftOffEta == null) return 0;
  const total = Math.max(0.001, cargoDelaySec + liftOffDelaySec);
  const elapsed = total - Math.max(0, liftOffEta);
  return Math.max(0, Math.min(100, (elapsed / total) * 100));
}
