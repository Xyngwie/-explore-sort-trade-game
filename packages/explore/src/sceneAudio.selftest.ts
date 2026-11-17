/** docs/AUDIO_V0.md — explore's BGM choice (B1) and the effects the sortie raises. */
import assert from "node:assert/strict";
import { createWorld, bootstrapFromSearch, startSortie } from "./game/world";
import { requestExtract, tickWorld, updateBullets } from "./game/sim";
import { updateSquadIntel } from "./game/vision";
import { getCoverObjects } from "./game/coverObjects";
import { snapshotSortieWorld } from "./game/checkpoint";
import { CONTACT_HOLD_SEC, drainSortieSfx, exploreBgm, type ContactMemo } from "./game/sceneAudio";
import { fireSfxOf, raiseSfx } from "./game/sfxQueue";
import type { Bullet, World } from "./game/types";

const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };
function sortie(): World {
  const w = createWorld(bootstrapFromSearch(""));
  startSortie(w);
  getCoverObjects(w).splice(0);
  for (const e of w.enemies) { e.pos = { x: 9000, y: 9000 }; e.alive = false; }
  drainSortieSfx(w);
  return w;
}

// --- B1: which BGM ---------------------------------------------------------------------------
{
  const w = createWorld(bootstrapFromSearch(""));
  const memo: ContactMemo = { lastSeenAt: null };
  assert.equal(exploreBgm(w, memo), "briefing");
  const s = sortie();
  assert.equal(exploreBgm(s, memo), "scavenging", "no enemy in sight → exploring");
  const foe = s.enemies[0]!;
  foe.alive = true;
  foe.hp = foe.maxHp;
  s.leader.heading = 0;
  foe.pos = { x: s.leader.pos.x + 60, y: s.leader.pos.y };
  updateSquadIntel(s);
  assert.equal(exploreBgm(s, memo), "contact", "an enemy in sight → Contact");
  foe.pos = { x: 9000, y: 9000 };
  updateSquadIntel(s);
  s.elapsed += CONTACT_HOLD_SEC - 1;
  assert.equal(exploreBgm(s, memo), "contact", "held a few seconds after the enemy leaves sight");
  s.elapsed += 2;
  assert.equal(exploreBgm(s, memo), "scavenging", "then back to exploring");
  requestExtract(s);
  assert.equal(exploreBgm(s, memo), "extraction", "boarding circle → Extraction Window");
  s.phase = "result";
  s.extracted = true;
  assert.equal(exploreBgm(s, memo), "home");
  s.extracted = false;
  assert.equal(exploreBgm(s, memo), "lost");
}

// --- effects raised by the game logic ----------------------------------------------------------
{
  const w = sortie();
  assert.equal(fireSfxOf(w.leader), "fire-player");
  assert.equal(fireSfxOf(w.wingmen[0]!), "fire-wing");
  assert.equal(fireSfxOf({ kind: "enemy" }), "fire-enemy");
  // a kill: hit + down
  const shooter = w.wingmen[0]!;
  const foe = w.enemies[0]!;
  foe.alive = true; foe.hp = 1;
  foe.pos = { x: shooter.pos.x + 40, y: shooter.pos.y };
  const b: Bullet = { alive: true, pos: { x: shooter.pos.x + 20, y: shooter.pos.y }, vel: { x: 400, y: 0 }, ttl: 1, damage: 50, fromEnemy: false, ownerId: shooter.id };
  w.bullets = [b];
  updateBullets(w, 0.1);
  const fx = drainSortieSfx(w);
  assert.ok(fx.includes("hit-enemy") && fx.includes("enemy-down"), JSON.stringify(fx));
  assert.deepEqual(drainSortieSfx(w), [], "drained once");
  // 帰還要請
  requestExtract(w);
  assert.ok(drainSortieSfx(w).includes("extract-request"));
}
{
  // the 30-second warning sounds once, when the clock crosses 30
  const w = sortie();
  w.timeLeft = 30.02;
  tickWorld(w, 0.05, idle);
  assert.ok(drainSortieSfx(w).includes("time-warning"));
  tickWorld(w, 0.05, idle);
  assert.ok(!drainSortieSfx(w).includes("time-warning"), "only once");
}
{
  // the queue stays small and is not part of a checkpoint
  const w = sortie();
  for (let i = 0; i < 100; i++) raiseSfx(w, "fire-wing");
  assert.deepEqual(w.sfx, ["fire-wing"], "one pending copy per effect");
  for (let i = 0; i < 40; i++) raiseSfx(w, `x-${i}`);
  assert.equal(w.sfx!.length, 32, "and never more than 32");
  const snap = snapshotSortieWorld(w) as World;
  assert.equal(snap.sfx, undefined, "pending effects are not saved");
}

console.log("explore scene audio selftest: ok");
