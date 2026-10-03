/**
 * Explore-local record of wingmen left behind at boarding lift-off, and the
 * result-screen lines about them.
 *
 * The loss itself is decided by the existing lift-off rule (outside the
 * boarding circle). What happens next (lostMechs.ts / outcome.ts):
 * - sortie via Invade: the mech stays on that front cell (HubSave.lostMechs
 *   with `frontSeed` + `cell`) and reappears on the next sortie there;
 * - sortie not via Invade: the mech is lost with its circuits
 *   (`abandonedMechInstanceIds`).
 */
import type { SortieLocation, StrandedMech } from "./lostMechs";
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

type LeftBehindWorld = {
  leftBehind?: LeftBehindEntry[];
  sortieLocation?: SortieLocation | null;
  strandedMechs?: StrandedMech[];
  recoveredLostMechIds?: string[];
};

/** What becomes of this sortie's left-behind mechs (one line), or null when nobody was left behind. */
export function leftBehindFateLine(world: LeftBehindWorld): string | null {
  if ((world.leftBehind ?? []).length === 0) return null;
  const loc = world.sortieLocation ?? null;
  return loc
    ? `置き去りの機体は前線マス (${loc.cell.sx}, ${loc.cell.sy}) に残る（次にこのマスへ出撃すると降下地点の近くに現れ、離昇時に搭乗円の内側にいれば回収）`
    : "Invade を通らない出撃のため、置き去りの機体は回路ごと失われる";
}

/** Reappeared mechs of this sortie: recovered or left again. */
export function strandedResultLines(world: LeftBehindWorld): string[] {
  const recovered = new Set(world.recoveredLostMechIds ?? []);
  return (world.strandedMechs ?? []).map((m) =>
    recovered.has(m.instanceId)
      ? `置き去りだった機体 ${m.instanceId} を回収（部隊に復帰）`
      : `置き去りだった機体 ${m.instanceId} は回収できず（同じ場所に残る）`,
  );
}

/** One line per left-behind wingman. */
export function leftBehindResultLines(world: LeftBehindWorld): string[] {
  return (world.leftBehind ?? []).map(leftBehindResultLine);
}

function escapeText(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Result-screen fragment: one `<li>` per left-behind wingman, one for what
 * becomes of them, one per reappeared mech; empty string when none.
 */
export function leftBehindResultHtml(world: LeftBehindWorld): string {
  const fate = leftBehindFateLine(world);
  const lines = [...leftBehindResultLines(world), ...(fate ? [fate] : []), ...strandedResultLines(world)];
  if (lines.length === 0) return "";
  return `<ul class="left-behind" id="result-left-behind">${lines.map((l) => `<li>${escapeText(l)}</li>`).join("")}</ul>`;
}
