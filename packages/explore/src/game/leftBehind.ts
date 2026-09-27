/**
 * Explore-local record of wingmen left behind at boarding lift-off.
 *
 * Display only: this is NOT part of ExploreResult / ExploreSortieOutcome /
 * Hub wear output, and adds no rescue or wreck-recovery behaviour. The loss
 * itself is decided by the existing lift-off rule (outside the boarding circle).
 */
export type LeftBehindReason =
  /** `wing_mobility` locked (release mode, no circuit): the wingman could not move. */
  | "no_circuit"
  /** Could move, but was outside the boarding circle at lift-off. */
  | "outside_circle";

export type LeftBehindEntry = { id: string; name: string; reason: LeftBehindReason };

export function leftBehindResultLine(entry: LeftBehindEntry): string {
  return entry.reason === "no_circuit"
    ? `${entry.name}を置き去り（回路なし・搭乗円の外）`
    : `${entry.name}を置き去り（搭乗円の外）`;
}

export function leftBehindResultLines(world: { leftBehind?: LeftBehindEntry[] }): string[] {
  return (world.leftBehind ?? []).map(leftBehindResultLine);
}

function escapeText(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Result-screen fragment: one `<li>` per left-behind wingman; empty string when none. */
export function leftBehindResultHtml(world: { leftBehind?: LeftBehindEntry[] }): string {
  const lines = leftBehindResultLines(world);
  if (lines.length === 0) return "";
  return `<ul class="left-behind" id="result-left-behind">${lines.map((l) => `<li>${escapeText(l)}</li>`).join("")}</ul>`;
}
