// 2026-10-17 神宮: left-behind mechs, wrecks and circuit drops are scattered on the field.
import type { Vec2 } from "./math";
import type { World } from "./types";
import { getCoverObjects } from "./coverObjects";
import { pushLog } from "./orders";

/** Keep this far from the map edges. */
export const STRAY_EDGE_MARGIN = 90;
const COVER_GAP = 14;
const CONTAINER_GAP = 40;
const STRAY_GAP = 30;

/** A random field position away from edges, obstacles, containers and other strays (enemies are ignored). */
export function scatterStrayPos(world: World, taken: Vec2[], rng: () => number = Math.random): Vec2 {
  const W = world.balance.worldW, H = world.balance.worldH, m = STRAY_EDGE_MARGIN;
  const covers = getCoverObjects(world);
  let p: Vec2 = { x: W / 2, y: H / 2 };
  for (let i = 0; i < 80; i++) {
    p = { x: m + rng() * (W - 2 * m), y: m + rng() * (H - 2 * m) };
    if (covers.some((c) => Math.hypot(p.x - c.pos.x, p.y - c.pos.y) < c.radius + COVER_GAP)) continue;
    if (world.containers.some((c) => Math.hypot(p.x - c.pos.x, p.y - c.pos.y) < CONTAINER_GAP)) continue;
    if (taken.some((t) => Math.hypot(p.x - t.x, p.y - t.y) < STRAY_GAP)) continue;
    break;
  }
  taken.push(p);
  return p;
}

/** Strays become visible once any living ally sees them (same circle as container discovery). */
export function revealStrays(world: World, see: (pos: Vec2) => boolean): void {
  for (const m of world.strandedMechs ?? []) {
    if (m.found === false && see(m.pos)) {
      m.found = true;
      pushLog(world, `発見：置き去り ${strayShortId(m.instanceId)}`); // 10/17 神宮 5 = B
    }
  }
  for (const d of world.strandedDrops ?? []) {
    if (d.found === false && see(d.pos)) {
      d.found = true;
      pushLog(world, "発見：回路"); // 10/17 神宮: once, like the mech notice
    }
  }
}

/** Old checkpoints have no `found`: they stay shown, as before. */
export function strayShown(s: { found?: boolean }): boolean {
  return s.found !== false;
}

/** Map labels show the last 4 characters of the mech id (shorter ids in full). 10/17 神宮 4. */
export function strayShortId(id: string): string {
  const chars = [...id];
  return chars.length > 4 ? chars.slice(-4).join("") : id;
}

/** 「置き去り：<last 4>」 over our own wreck. */
export function strayWreckLabel(id: string): string {
  return `置き去り：${strayShortId(id)}`;
}

/** 「置き去り機 <last 4>（停止）」 over a stopped left-behind mech. */
export function strayStoppedLabel(id: string): string {
  return `置き去り機 ${strayShortId(id)}（停止）`;
}
