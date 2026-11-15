/**
 * Which BGM the explore scene wants (docs/AUDIO_V0.md; 神宮決定 2026-11-15 B1 = ★A).
 *
 * briefing → 「Briefing - Mass Driver」; sortie → 「Scavenging the Shell」, switching to 「Contact」
 * while any living enemy is visible to the squad and for {@link CONTACT_HOLD_SEC} s after the last
 * one leaves sight; once the boarding circle is out → 「Extraction Window」; result → 「Home with
 * Cargo」 after a lift-off, else 「Lost to the Cold」.
 */
import type { BgmId } from "@estg/shared";
import { enemyVisibleToSquad } from "./vision";
import type { World } from "./types";

export const CONTACT_HOLD_SEC = 4;

/** Per-scene memory (not saved): the sortie time an enemy was last in sight. */
export type ContactMemo = { lastSeenAt: number | null };

export function exploreBgm(world: World, memo: ContactMemo): BgmId {
  if (world.phase === "briefing") return "briefing";
  if (world.phase === "result") return world.extracted ? "home" : "lost";
  if (world.boarding) return "extraction";
  if (world.enemies.some((e) => e.alive && enemyVisibleToSquad(world, e))) memo.lastSeenAt = world.elapsed;
  if (memo.lastSeenAt != null && world.elapsed - memo.lastSeenAt < CONTACT_HOLD_SEC) return "contact";
  return "scavenging";
}

export { drainSortieSfx, raiseSfx } from "./sfxQueue";
