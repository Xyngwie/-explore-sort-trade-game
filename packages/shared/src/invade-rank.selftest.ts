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

// Squad budget and mutually exclusive categories, through real equip/save helpers.
{
  const { createOwnedMech, makeFalseOneByOne, equipCircuit, unequipCircuit,
    squadEquipmentError, WEAPON_EFFECT_KEYS, SPECIAL_AMMO_EFFECT_KEYS,
    circuitHEdgeIndex, circuitVEdgeIndex, edgeCount, encodeEdgeState } = await import("./index");
  const fleet = ["a", "b", "c", "d", "e"].map(instanceId => createOwnedMech("mech_gen1", { instanceId }));
  const marks = Array(edgeCount(4, 4)).fill(0);
  for (let x = 0; x < 4; x++) { marks[circuitHEdgeIndex(4,4,x,0)] = 1; marks[circuitHEdgeIndex(4,4,x,4)] = 1; }
  for (let y = 0; y < 4; y++) { marks[circuitVEdgeIndex(4,4,0,y)] = 1; marks[circuitVEdgeIndex(4,4,4,y)] = 1; }
  const rec = (id: string, key: string) => ({ ...makeFalseOneByOne(id),
    circuitBoard: { v: 1, cols: 4, rows: 4, edgeState: encodeEdgeState(marks), puzzleId: "p0", outcome: "bypass" },
    effectKey: key, enemyEffect: 8, origin: "enemy_drop", equippedTo: null,
  }) as typeof initial.circuits[number];
  const base = normalizeHubSnapshot({ ...initial, fleet, sortieSelection: ["a", "b"], circuits: [makeFalseOneByOne("one"), makeFalseOneByOne("two")] });
  const one = equipCircuit(base, "one", "a");
  assert.ok(one.ok);
  assert.equal(equipCircuit(one.hub, "two", "b").reason, "squad_full", "false1x1 counts one");
  const reserve = equipCircuit(one.hub, "two", "e");
  assert.ok(reserve.ok, "reserve equipment is outside selected squad budget");
  assert.equal(squadEquipmentError({ ...reserve.hub, sortieSelection: ["a", "e"] }, ["a", "e"]), "squad_full");
  assert.equal(squadEquipmentError(unequipCircuit(reserve.hub, "one"), ["a", "e"]), null);
  for (const category of [WEAPON_EFFECT_KEYS, SPECIAL_AMMO_EFFECT_KEYS]) {
    for (const key of category) for (const other of category) {
      const h = normalizeHubSnapshot({ ...base, invadeRank: {current: 0, highestCleared: 4}, circuits: [rec("first", key), rec("second", other)] });
      const first = equipCircuit(h, "first", "a");
      assert.ok(first.ok);
      assert.equal(equipCircuit(first.hub, "second", "a").reason, "category_full", `${key}+${other} refused`);
      assert.ok(equipCircuit(first.hub, "second", "b").ok, "different mechs permitted");
    }
  }
  for (const weapon of WEAPON_EFFECT_KEYS) for (const ammo of SPECIAL_AMMO_EFFECT_KEYS) {
    let h = normalizeHubSnapshot({ ...base, invadeRank: { current: 0, highestCleared: 1 }, circuits: [rec("gun", weapon), rec("ammo", ammo), makeFalseOneByOne("one")] });
    for (const id of ["gun", "ammo", "one"]) {
      const result = equipCircuit(h, id, "a");
      assert.ok(result.ok, `${weapon}+${ammo}+1x1 permits three on one mech`);
      h = result.hub;
    }
    assert.equal(squadEquipmentError(h, ["a"]), null);
    assert.equal(deserializeHubSave(serializeHubSave(createHubSave(h)))!.hub.circuits.filter(c => c.equippedTo === "a").length, 3);
  }
}
console.log("Squad budget and weapon/ammo categories PASS");

{
  const { ensureCaptainFalseOneByOne, unequipCircuit, createOwnedMech } = await import("./index");
  const granted = ensureCaptainFalseOneByOne(normalizeHubSnapshot({ ...initial, fleet: [createOwnedMech("mech_gen1", {instanceId: "new"})], circuits: [] }));
  assert.equal(granted.circuits.length, 1);
  const removed = unequipCircuit(granted, granted.circuits[0]!.circuitId);
  const reloaded = deserializeHubSave(serializeHubSave(createHubSave(removed)))!.hub;
  assert.equal(ensureCaptainFalseOneByOne(reloaded), reloaded, "manual removal survives reload and frees the initial slot");
  const sold = normalizeHubSnapshot({ ...reloaded, circuits: [] });
  assert.equal(ensureCaptainFalseOneByOne(sold), sold, "selling starter cannot farm another free starter");
}
