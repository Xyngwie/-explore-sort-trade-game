/**
 * Wrecks on the field (項目5-1b, decided 2026-10-07 by 神宮; W1〜W10).
 *
 * A mech shot down during the sortie (leader or wingman, `Unit.alive=false`)
 * leaves a wreck where it was destroyed, with its circuits inside. No field
 * action takes only the circuits out.
 * - W2 B: a wreck inside the boarding circle when the ship lifts off (captain
 *   aboard) is recovered: it returns destroyed with its circuits (W7 A).
 * - Not recovered, sortie via Invade: a `lostMechs` row `kind: "wreck"` with
 *   the cell and the position in Explore (`pos`). It reappears at the same
 *   coordinates on the next sortie to that cell (lostMechs.ts) until the
 *   Invade board is regenerated (W3 C, invade lost-mechs.ts).
 * - Not recovered, sortie not via Invade: lost with its circuits (W4 A).
 * - Recovering the leader's own wreck in the same sortie starts with 項目5-2
 *   (today a downed leader still ends the sortie at once).
 */
import type { ExplorePos, LostMechReturnState } from "@estg/shared";
import { getCoverObjects } from "./coverObjects";
import { dist, type Vec2 } from "./math";
import type { BoardingState, Unit, World } from "./types";

/** Display name of a unit's wreck (W6: 「残骸 僚機A」). */
export function wreckLabel(name: string): string {
  return `残骸 ${name}`;
}

/** Leader name on wreck lines (the leader unit is called 「隊長」). */
function wreckUnitName(u: Unit): string {
  return u.kind === "leader" ? "隊長機" : u.name;
}

/** Deployed units shot down this sortie (leader first). */
export function sortieWreckUnits(world: World): Unit[] {
  const deployed = new Set(world.deployedInstanceIds);
  return [world.leader, ...world.wingmen].filter((u) => {
    const id = u.instanceId?.trim() ?? "";
    return !u.alive && id.length > 0 && deployed.has(id);
  });
}

/** W2 B: this sortie's wrecks inside the boarding circle at lift-off (captain aboard) are recovered. */
export function recoverSortieWrecksAtLiftOff(world: World, boarding: BoardingState, captainIn: boolean): string[] {
  if (!captainIn) return [];
  const ids = sortieWreckUnits(world)
    .filter((u) => dist(u.pos, boarding.center) <= boarding.radius)
    .map((u) => u.id);
  world.recoveredWreckUnitIds = [...new Set([...(world.recoveredWreckUnitIds ?? []), ...ids])];
  return ids;
}

/** This sortie's wrecks that stay on the field. */
export function sortieWrecksLeft(world: World): Unit[] {
  const recovered = new Set(world.recoveredWreckUnitIds ?? []);
  return sortieWreckUnits(world).filter((u) => !recovered.has(u.id));
}

export function roundPos(p: Vec2): ExplorePos {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}

/**
 * lostMechs rows for this sortie's wrecks left on the field (sortie via
 * Invade only). A mech without a battery row in the deploy URL is skipped
 * (it comes back as a destroyed hull, like a recovered wreck).
 */
export function sortieWreckRows(world: World): LostMechReturnState[] {
  const loc = world.sortieLocation ?? null;
  if (!loc) return [];
  const out: LostMechReturnState[] = [];
  for (const u of sortieWrecksLeft(world)) {
    const instanceId = u.instanceId!.trim();
    const battery = world.mechBattery[instanceId];
    if (!battery) continue;
    out.push({
      instanceId,
      currentAmmo: world.currentAmmo[instanceId],
      battery: { ...battery },
      circuitIds: [...(world.circuitIdsByUnit[u.id] ?? [])],
      kind: "wreck",
      pos: roundPos(u.pos),
      frontSeed: loc.frontSeed,
      cell: { sx: loc.cell.sx, sy: loc.cell.sy },
    });
  }
  return out;
}

/** Not via Invade (W4 A): this sortie's wrecks left on the field are lost with their circuits. */
export function abandonedWreckInstanceIds(world: World): string[] {
  if (world.sortieLocation) return [];
  return sortieWrecksLeft(world).map((u) => u.instanceId!.trim());
}

/** Gap kept between a reappeared wreck and a cover object. */
const WRECK_COVER_GAP = 14;

/**
 * A saved wreck position inside this sortie's world: clamped to the field and
 * pushed just outside any cover object it would overlap (cover is laid out
 * anew every sortie). The saved `pos` itself is kept for the next sortie.
 */
export function placeWreckInWorld(world: World, pos: Vec2): Vec2 {
  const minX = 20;
  const minY = 20;
  const maxX = world.balance.worldW - 20;
  const maxY = world.balance.worldH - 20;
  const clampP = (p: Vec2): Vec2 => ({
    x: Math.min(maxX, Math.max(minX, p.x)),
    y: Math.min(maxY, Math.max(minY, p.y)),
  });
  let p = clampP(pos);
  const covers = getCoverObjects(world);
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;
    for (const c of covers) {
      const need = c.radius + WRECK_COVER_GAP;
      const d = dist(p, c.pos);
      if (d >= need) continue;
      const ang = d > 0.001 ? Math.atan2(p.y - c.pos.y, p.x - c.pos.x) : 0;
      p = clampP({ x: c.pos.x + Math.cos(ang) * (need + 0.5), y: c.pos.y + Math.sin(ang) * (need + 0.5) });
      moved = true;
    }
    if (!moved) break;
  }
  return p;
}

/**
 * Result-screen lines about this sortie's wrecks (W6):
 * 「僚機A は大破（残骸と回路は撃破した場所に残る）」 for a wreck left on the
 * field, 「僚機A の残骸を回収（大破のまま格納庫へ）」 for one recovered at
 * lift-off, and one line when the sortie was not via Invade (W4 A).
 */
export function wreckResultLines(world: World): string[] {
  const recovered = new Set(world.recoveredWreckUnitIds ?? []);
  const units = sortieWreckUnits(world);
  const lines = units.map((u) =>
    recovered.has(u.id)
      ? `${wreckUnitName(u)} の残骸を回収（大破のまま格納庫へ）`
      : `${wreckUnitName(u)} は大破（残骸と回路は撃破した場所に残る）`,
  );
  const left = units.some((u) => !recovered.has(u.id));
  if (left && !world.sortieLocation) lines.push("Invade を通らない出撃のため、残骸は回路ごと失われる");
  return lines;
}

function escapeText(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function wreckResultHtml(world: World): string {
  const lines = wreckResultLines(world);
  if (lines.length === 0) return "";
  return `<ul class="wrecks" id="result-wrecks">${lines.map((l) => `<li>${escapeText(l)}</li>`).join("")}</ul>`;
}
