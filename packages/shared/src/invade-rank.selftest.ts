import assert from "node:assert/strict";
import {
  INITIAL_HUB,
  normalizeHubSnapshot,
  createHubSave,
  serializeHubSave,
  deserializeHubSave,
} from "./hub-save";
import {
  invadeRankOf,
  unlockedInvadeRank,
  completeInvadeRank,
  selectInvadeRank,
  rankEnemyMultiplier,
  squadCircuitLimit,
  squadCircuitUsage,
} from "./invade-rank";
import {
  buildInvadeToExploreUrl,
  parseInvadeToExploreSearch,
  mergeInvadeSectorOntoExploreUrl,
} from "./handoff";
const initial = normalizeHubSnapshot(INITIAL_HUB);
assert.deepEqual(invadeRankOf(initial), { current: 0, highestCleared: -1 });
assert.equal(unlockedInvadeRank(initial), 0);
assert.equal(squadCircuitLimit(initial), 1);
const first = completeInvadeRank(initial);
assert.equal(unlockedInvadeRank(first), 1);
assert.equal(squadCircuitLimit(first), 2);
assert.equal(first.invadeRank!.highestCleared, 0);
assert.deepEqual(
  completeInvadeRank(first),
  first,
  "rank zero cannot be farmed for unlocks",
);
const second = completeInvadeRank(selectInvadeRank(first, 1)!);
assert.equal(unlockedInvadeRank(second), 2);
const lower = selectInvadeRank(second, 0)!;
assert.equal(unlockedInvadeRank(completeInvadeRank(lower)), 2);
assert.equal(lower.invadeRank!.highestCleared, 1);
assert.equal(squadCircuitLimit(lower), 3);
assert.equal(squadCircuitUsage({ circuits: [
  { equippedTo: "a" }, { equippedTo: "a" }, { equippedTo: "b" }, { equippedTo: null },
] as typeof initial.circuits }, ["a", "a"]), 2);
assert.equal(selectInvadeRank(second, 3), null);
assert.equal(selectInvadeRank(second, -1), null);
assert.equal(selectInvadeRank(second, 1.5), null);
assert.deepEqual(
  deserializeHubSave(serializeHubSave(createHubSave(second)))!.hub.invadeRank,
  second.invadeRank,
);
const old = normalizeHubSnapshot({
  ...initial,
  firstInvadeClear: { boardSeed: 123, at: "2026-10-12T00:00:00Z" },
});
assert.deepEqual(invadeRankOf(old), { current: 0, highestCleared: 0 });
assert.equal(rankEnemyMultiplier(0), 1);
assert.ok(Math.abs(rankEnemyMultiplier(84) - 2.306722744) < 0.01);
const sector = { sectorX: 1, sectorY: 2, density: 0.1, invadeRank: 84 };
const url = buildInvadeToExploreUrl(sector, "https://example.test/explore/");
assert.equal(parseInvadeToExploreSearch(new URL(url).search)!.invadeRank, 84);
assert.equal(
  parseInvadeToExploreSearch("?sectorX=1&sectorY=2&density=.1")!.invadeRank,
  undefined,
);
assert.equal(
  parseInvadeToExploreSearch("?sectorX=1&sectorY=2&density=.1&invadeRank=-1")!
    .invadeRank,
  undefined,
);
const merged = mergeInvadeSectorOntoExploreUrl(
  "https://example.test/?deployedInstanceIds=m1",
  sector,
);
assert.equal(new URL(merged).searchParams.get("deployedInstanceIds"), "m1");
assert.equal(new URL(merged).searchParams.get("invadeRank"), "84");
console.log(
  "Invade ranks: new highs, replay, lower ranks, legacy migration, handoff and multiplier PASS",
);

{
 const url=buildInvadeToExploreUrl({sectorX:0,sectorY:0,density:.1,neighborCount:8,invadeRank:1},'https://example.test/');
 assert.equal(parseInvadeToExploreSearch(new URL(url).search)!.neighborCount,8);
 assert.equal(parseInvadeToExploreSearch('?sectorX=0&sectorY=0&density=.1&neighborCount=9')!.neighborCount,undefined);
}
