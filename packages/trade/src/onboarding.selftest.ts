import assert from "node:assert/strict";
import {
  createNewGameHub,
  createOwnedMech,
  normalizeHubSnapshot,
  serializeHubSave,
  createHubSave,
  deserializeHubSave,
  ensureCaptainFalseOneByOne,
  firstSortieError,
  encodeEdgeState,
  equipCircuit,
  reserveIntroOpening,
  completeIntroOpening,
  cancelIntroOpening,
} from "@estg/shared";
import { craftJunkCircuit } from "./junk-craft";
import { createInitialHangar, createNewMech } from "./hangar";
const initial = createNewGameHub();
assert.equal(initial.credits, 0);
assert.equal(initial.unopenedContainers, 10);
assert.deepEqual(initial.fleet, []);
assert.deepEqual(initial.circuits, []);
for (const k of ["ammo", "armor", "power", "junk"] as const)
  assert.equal(initial.inventory[k] ?? 0, 0);
assert.equal(
  createInitialHangar({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }).hub.unopenedContainers,
  10,
);
assert.deepEqual(
  deserializeHubSave(serializeHubSave(createHubSave(initial)))!.hub,
  initial,
);
const old = normalizeHubSnapshot({
  credits: 123,
  fleet: [],
  circuits: [],
  unopenedContainers: 3,
});
assert.equal(old.newGameIntro, undefined);
assert.equal(firstSortieError(old, null), "");
const funded = normalizeHubSnapshot({
  ...initial,
  credits: 506,
  inventory: { armor: 300, junk: 2, power: 10, ammo: 10 },
});
const state = createNewMech({
  ...createInitialHangar({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }),
  hub: funded,
});
assert.equal(state.hub.fleet.length, 1);
assert.equal(state.hub.credits, 6);
assert.equal(state.hub.circuits.length, 0);
assert.equal(ensureCaptainFalseOneByOne(state.hub), state.hub);
const leader = state.hub.fleet[0]!.instanceId;
assert(firstSortieError(state.hub, leader));
let crafted = craftJunkCircuit(state.hub, 1, {
  circuitId: "intro-craft",
  trueBoardRate: 1,
  rng: () => 0,
});
assert(crafted.ok);
assert.equal(crafted.hub.credits, 0);
assert.equal(crafted.hub.inventory.junk ?? 0, 0);
assert.deepEqual(crafted.hub.newGameIntro!.craftedCircuitIds, ["intro-craft"]);
assert.equal(crafted.record!.restoreState, "unrestored");
assert(
  firstSortieError(
    {
      ...crafted.hub,
      circuits: [
        {
          ...crafted.record!,
          equippedTo: leader,
          circuitBoard: {
            ...crafted.record!.circuitBoard,
            edgeState: encodeEdgeState([1, 1, 1, 1]),
          },
        },
      ],
    },
    leader,
  ),
  "closed but unrestored is not an active circuit",
);
const repaired = normalizeHubSnapshot({
  ...crafted.hub,
  circuits: [
    {
      ...crafted.record!,
      restoreState: "bypass",
      outcome: "bypass",
      circuitBoard: {
        ...crafted.record!.circuitBoard,
        edgeState: encodeEdgeState([1, 1, 1, 1]),
        outcome: "bypass",
      },
    },
  ],
});
assert(firstSortieError(repaired, leader));
const equipped = equipCircuit(repaired, "intro-craft", leader);
assert(equipped.ok);
assert.equal(firstSortieError(equipped.hub, leader), "");
assert(firstSortieError(equipped.hub, "other"));
const other = createOwnedMech("mech_gen1", { instanceId: "other" });
const switched = normalizeHubSnapshot({
  ...equipped.hub,
  fleet: [...equipped.hub.fleet, other],
  circuits: equipped.hub.circuits.map((c) => ({ ...c, equippedTo: "other" })),
});
assert(firstSortieError(switched, leader));
const started = {
  ...equipped.hub,
  newGameIntro: {
    ...equipped.hub.newGameIntro!,
    firstSortie: { nonce: "n", leaderId: leader, circuitId: "intro-craft" },
  },
};
assert.equal(
  firstSortieError({ ...started, circuits: [] }, leader),
  "",
  "second sortie does not need this circuit",
);
let progress = reserveIntroOpening(initial, "first", 4);
assert.equal(progress.newGameIntro!.initialOpened, 0);
const cancel = cancelIntroOpening(progress, "first");
assert.equal(cancel.newGameIntro!.initialOpened, 0);
assert.equal(cancel.credits, 0);
progress = completeIntroOpening(progress, "first", {});
assert.equal(progress.newGameIntro!.initialOpened, 4);
assert.equal(progress.credits, 0);
assert.equal(completeIntroOpening(progress, "first", {}), progress);
progress = deserializeHubSave(serializeHubSave(createHubSave(progress)))!.hub;
progress = completeIntroOpening(
  reserveIntroOpening(progress, "second", 6),
  "second",
  {},
);
assert.equal(progress.credits, 5_000_000);
assert(progress.newGameIntro!.zeroHarvestAwarded);
assert.equal(completeIntroOpening(progress, "second", {}), progress);
let nonzero = completeIntroOpening(
  reserveIntroOpening(initial, "harvest", 5),
  "harvest",
  { junk: 1 },
);
nonzero = { ...nonzero, credits: 0, inventory: {} };
nonzero = completeIntroOpening(
  reserveIntroOpening(nonzero, "remaining", 5),
  "remaining",
  {},
);
assert.equal(nonzero.credits, 0);
assert.equal(nonzero.newGameIntro!.initialHarvest, 1);
assert.equal(completeIntroOpening(initial, "forged", {}), initial);
assert.equal(completeIntroOpening(old, "forged", {}), old);
console.log(
  "New-game intro: exact initial assets, no starter, craft cost/gate, active leader equipment, split zero harvest once, cancellation, old saves PASS",
);
// The core start function checks the actual leader, including direct/forced URL entry.
{
  const { startSortie, createWorld, bootstrapFromSearch } = await import(
    "../../explore/src/game/world"
  );
  const { saveHubSaveToLocalStorage, loadHubSaveFromLocalStorage } =
    await import("@estg/shared");
  const map = new Map<string, string>();
  let fail = false;
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (fail) throw new Error("refused");
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = store;
  const world = createWorld(bootstrapFromSearch(""));
  saveHubSaveToLocalStorage(initial, store);
  assert.equal(startSortie(world), false);
  assert.equal(world.phase, "briefing");
  saveHubSaveToLocalStorage(equipped.hub, store);
  world.leader.instanceId = "other";
  assert.equal(startSortie(world), false);
  world.leader.instanceId = leader;
  fail = true;
  assert.equal(startSortie(world), false);
  assert.equal(world.phase, "briefing");
  assert.equal(
    loadHubSaveFromLocalStorage(store)!.hub.newGameIntro!.firstSortie,
    undefined,
  );
  fail = false;
  assert.equal(startSortie(world), true);
  assert.equal(world.phase, "sortie");
  assert.equal(
    loadHubSaveFromLocalStorage(store)!.hub.newGameIntro!.firstSortie!.nonce,
    world.sortieNonce,
  );
  assert.equal(
    loadHubSaveFromLocalStorage(store)!.hub.newGameIntro!.firstSortie!
      .circuitId,
    "intro-craft",
  );
  console.log(
    "Core first sortie: direct/default URL, wrong leader, storage refusal, successful nonce matching PASS",
  );
}
// Actual launch/handoff reducers: source isolation, immutable result receipt, cancel once.
{
  const { launchSortFromUnopened, ingestLocationSearch } = await import(
    "./hangar"
  );
  const base = {
    ...createInitialHangar({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }),
    hub: { ...createNewGameHub(), unopenedContainers: 12 },
  };
  const mixed = launchSortFromUnopened(base, 11);
  assert.equal(mixed.url, null);
  assert.equal(mixed.state.hub.unopenedContainers, 12);
  const launched = launchSortFromUnopened(base, 4);
  assert(launched.url);
  assert.equal(launched.state.hub.unopenedContainers, 8);
  const id = new URL(launched.url!).searchParams.get("introOpening")!;
  assert(id);
  assert.equal(launchSortFromUnopened(launched.state, 2).url, launched.url);
  assert.equal(
    launchSortFromUnopened(launched.state, 2).state.hub.unopenedContainers,
    8,
  );
  let done = {
    ...launched.state,
    hub: completeIntroOpening(launched.state.hub, id, { ammo: 5 }),
  };
  const search = `?fromSort=1&introResultId=${id}&yieldBag=power:999`;
  done = ingestLocationSearch(done, search).state;
  assert.equal(done.hub.inventory.ammo, 5);
  assert.equal(done.hub.inventory.power ?? 0, 0);
  done = ingestLocationSearch(done, search).state;
  assert.equal(done.hub.inventory.ammo, 5);
  const next = launchSortFromUnopened(done, 6);
  assert(next.url);
  const cancelId = new URL(next.url!).searchParams.get("introOpening")!;
  const canceled = ingestLocationSearch(
    next.state,
    `?fromSort=1&introCancelId=${cancelId}&depositUnopenedContainers=999`,
  ).state;
  assert.equal(canceled.hub.unopenedContainers, 8);
  assert.equal(canceled.hub.newGameIntro!.initialOpened, 4);
  const again = ingestLocationSearch(
    canceled,
    `?fromSort=1&introCancelId=${cancelId}&depositUnopenedContainers=999`,
  ).state;
  assert.equal(again.hub.unopenedContainers, 8);
  console.log(
    "Intro launch/handoff: separate purchased stock, one reservation, fixed stored harvest, receive once, cancel once PASS",
  );
}
// A direct HUB revisit receives saved results even without the old return URL.
{
  const { saveHubSaveToLocalStorage } = await import("@estg/shared");
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
  const pending = completeIntroOpening(
    reserveIntroOpening(createNewGameHub(), "receipt", 2),
    "receipt",
    { armor: 7, power: 1 },
  );
  saveHubSaveToLocalStorage(pending, storage);
  const first = createInitialHangar(storage);
  assert.equal(first.hub.inventory.armor, 7);
  assert.equal(first.hub.newGameIntro!.results.length, 0);
  const again = createInitialHangar(storage);
  assert.equal(again.hub.inventory.armor, 7);
  assert.equal(again.hub.newGameIntro!.initialOpened, 2);
  console.log(
    "Direct HUB revisit receives stored harvest once without URL or stock inference PASS",
  );
}
// A legacy M45-only save is not a new game and does not receive the ten containers.
{
  const { HUB_M45_STASH_STORAGE_KEY } = await import("./hangar");
  const storage = {
    getItem: (k: string) =>
      k === HUB_M45_STASH_STORAGE_KEY
        ? JSON.stringify({ updatedAt: "2026-10-01T00:00:00Z" })
        : null,
    setItem: () => {},
    removeItem: () => {},
  };
  const legacy = createInitialHangar(storage);
  assert.equal(legacy.hub.newGameIntro, undefined);
  assert.equal(legacy.hub.unopenedContainers, 0);
  console.log(
    "Legacy M45-only save is not enrolled in the new introduction PASS",
  );
}
// Purchased batches in the same new game also need unique routes and one fixed receipt.
{
  const { launchSortFromUnopened, ingestLocationSearch } = await import(
    "./hangar"
  );
  let state = {
    ...createInitialHangar({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }),
    hub: {
      ...createNewGameHub(),
      unopenedContainers: 2,
      newGameIntro: {
        ...createNewGameHub().newGameIntro!,
        initialOpened: 10,
        initialHarvest: 1,
      },
    },
  };
  const a = launchSortFromUnopened(state, 1);
  assert(a.url);
  const aId = new URL(a.url!).searchParams.get("introOpening")!;
  assert.equal(a.state.hub.newGameIntro!.opening!.initialCount, 0);
  assert.equal(a.state.hub.newGameIntro!.opening!.containerCount, 1);
  state = ingestLocationSearch(
    { ...a.state, hub: completeIntroOpening(a.state.hub, aId, { ammo: 4 }) },
    `?fromSort=1&introResultId=${aId}`,
  ).state;
  assert.equal(state.hub.inventory.ammo, 4);
  assert.equal(state.hub.newGameIntro!.initialHarvest, 1);
  assert.equal(state.hub.credits, 0);
  assert.equal(state.hub.newGameIntro!.results.length, 0);
  const b = launchSortFromUnopened(state, 1);
  assert(b.url);
  assert.notEqual(a.url, b.url);
  const bId = new URL(b.url!).searchParams.get("introOpening")!;
  const stale = ingestLocationSearch(
    b.state,
    `?fromSort=1&introResultId=${aId}&yieldBag=ammo:999`,
  ).state;
  assert.equal(stale.hub.inventory.ammo, 4);
  assert.equal(stale.hub.newGameIntro!.opening!.id, bId);
  const canceled = ingestLocationSearch(
    stale,
    `?fromSort=1&introCancelId=${bId}`,
  ).state;
  assert.equal(canceled.hub.unopenedContainers, 1);
  assert.equal(canceled.hub.inventory.ammo, 4);
  assert.equal(canceled.hub.newGameIntro!.initialOpened, 10);
  console.log(
    "Purchased batches: unique paid routes, fixed receipt once, no initial counter/award, stale A cannot affect B, cancel count PASS",
  );
}
// Zero harvest is independent of the current wallet (e.g. other progress rewards).
{
  const base = { ...createNewGameHub(), credits: 37 };
  const awarded = completeIntroOpening(
    reserveIntroOpening(base, "zero-but-funded", 10),
    "zero-but-funded",
    {},
  );
  assert.equal(awarded.credits, 5_000_037);
  assert.equal(completeIntroOpening(awarded, "zero-but-funded", {}), awarded);
  console.log(
    "Zero-harvest reward adds to the wallet and is not a current-zero balance trigger PASS",
  );
}
// Unreadable / future-version data is not evidence of a fresh new game.
{
  const { HUB_SAVE_STORAGE_KEY } = await import("@estg/shared");
  for (const text of [
    "{bad json",
    JSON.stringify({ v: 999, hub: { credits: 123 } }),
  ]) {
    const data = new Map<string, string>([[HUB_SAVE_STORAGE_KEY, text]]);
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
      removeItem: (k: string) => {
        data.delete(k);
      },
    };
    const old = createInitialHangar(storage);
    assert.equal(old.hub.newGameIntro, undefined);
    assert.equal(old.hub.unopenedContainers, 0);
    assert(
      [...data.values()].includes(text),
      "existing text remains present or backed up",
    );
  }
  console.log(
    "Unreadable/future saves retain existing backup/read-only handling, no new introduction PASS",
  );
}
// #331's orphaned legacy handoff policy remains legacy, not an invented new origin.
{
  const g = globalThis as unknown as { location?: { search: string } };
  const previous = g.location;
  g.location = { search: "?fromSort=1" };
  try {
    const old = createInitialHangar({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    assert.equal(old.hub.newGameIntro, undefined);
    assert.equal(old.hub.unopenedContainers, 0);
  } finally {
    if (previous) g.location = previous;
    else delete g.location;
  }
  console.log(
    "Orphaned legacy handoff retains #331 origin policy, no ten-container introduction synthesized PASS",
  );
}
// Browser start is independently guarded even if an orphaned URL avoids the UI.
{
  const { createWorld, bootstrapFromSearch, startSortie } = await import(
    "../../explore/src/game/world"
  );
  const w = createWorld(
    bootstrapFromSearch("?deployableMechs=3&startingAmmo=999"),
  );
  const g = globalThis as unknown as {
    window?: unknown;
    localStorage?: unknown;
  };
  const oldWindow = g.window,
    oldStore = g.localStorage;
  try {
    g.window = {};
    g.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    assert.equal(startSortie(w), false);
    assert.equal(w.phase, "briefing");
    assert.equal(w.sortieNonce, undefined);
  } finally {
    if (oldWindow === undefined) delete g.window;
    else g.window = oldWindow;
    g.localStorage = oldStore;
  }
  console.log(
    "Browser core rejects URL-supplied units with no owned save even without a UI guard PASS",
  );
}
