/**
 * docs/AUDIO_V0.md: the game logic raises effect ids here; the page plays them each frame.
 * No audio and no imports here, so any game file can raise a sound without an import cycle.
 */
import type { Unit, World } from "./types";

/** One pending copy per effect: a burst (many cells cleared, many shots) never pushes other sounds out. */
export function raiseSfx(world: World, id: string): void {
  const q = (world.sfx ??= []);
  if (q.includes(id)) return;
  q.push(id);
  if (q.length > 32) q.splice(0, q.length - 32);
}

/** Effects raised since the last frame (and clears them). */
export function drainSortieSfx(world: World): string[] {
  const out = world.sfx ?? [];
  if (out.length) world.sfx = [];
  return out;
}

/** The shot sound of a unit: the captain louder, wingmen quieter, enemies darker. */
export function fireSfxOf(unit: Pick<Unit, "kind">): string {
  return unit.kind === "enemy" ? "fire-enemy" : unit.kind === "leader" ? "fire-player" : "fire-wing";
}
