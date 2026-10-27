// Verification-only page; calls real reducers/save adapters, not duplicated economy logic.
import {
  createInitialHangar,
  loadPlaytestSeed,
  persistHangar,
  ingestLocationSearch,
  launchSortFromUnopened,
  repairMech,
  chargeMech,
  buyNewMech,
  buyUnopenedContainers,
  sellCircuit,
} from "../packages/trade/src/hangar";
import { craftJunkCircuit } from "../packages/trade/src/junk-craft";
import {
  emptyFieldObjectIdentities,
  registerWreckIdentity,
  shieldIdentityFromWreck,
  readSortieCheckpoint,
  writeHideCheckpoint,
  loadHubSaveFromLocalStorage,
  saveHubSaveToLocalStorage,
  equipCircuit,
  unequipCircuit,
} from "../packages/shared/src/index";
import {
  generateBoard,
  captureFrontProgress,
  rngFromSeed,
  AOI_HALF,
  openCell,
} from "../packages/invade/src/board";
import { buildReturnToTradeUrl } from "../packages/restore/src/session";
import { saveMarksToStorage } from "../packages/restore/src/puzzle";
import {
  createWorld,
  bootstrapFromSearch,
  startSortie,
} from "../packages/explore/src/game/world";
import { attachCircuitPlay } from "../packages/explore/src/game/circuitPlay";
import {
  snapshotSortieWorld,
  worldFromCheckpointBody,
} from "../packages/explore/src/game/checkpoint";
import { attachLostMechContext } from "../packages/explore/src/game/lostMechs";
import { attachFieldPersistence } from "../packages/explore/src/game/fieldPersistence";
import { tickWorld, requestExtract } from "../packages/explore/src/game/sim";
import { saveSortieResultToHub } from "../packages/explore/src/game/hubDirectSave";
import {
  recordPlayLogSortie,
  setPlayLogCheckpointProvider,
} from "../packages/shared/src/play-log-hooks";
import {
  openPlayLogDB,
  exportPlayGame,
  activePlayGameId,
  readPlayGame,
  stagePlayDraft,
  commitPlayDraft,
} from "../packages/shared/src/play-log-db";
import { makePlayDraft, canonical } from "../packages/shared/src/play-log";
const root = document.querySelector("#app")!;
let state = createInitialHangar();
const render = () => {
  root.innerHTML =
    "<h1>Actual save paths</h1>" +
    [
      "seed",
      "prepare",
      "buy",
      "containers",
      "open",
      "craft",
      "equip",
      "unequip",
      "repair",
      "charge",
      "restore",
      "restoreComplete",
      "progress",
      "sortie",
      "checkpoint",
      "settle",
      "sell",
    ]
      .map(
        (id) =>
          `<button id="${id}" style="min-height:44px;margin:4px">${id}</button>`,
      )
      .join("") +
    `<p id="credits">${state.hub.credits}</p>`;
};
const checkpoint = readSortieCheckpoint();
let world: ReturnType<typeof createWorld> | null =
  checkpoint.status === "ok" && checkpoint.record.kind === "sortie"
    ? worldFromCheckpointBody(checkpoint.record.body)
    : null;
if (world)
  setPlayLogCheckpointProvider(() => ({
    v: 1,
    kind: world!.phase === "result" ? "result" : "sortie",
    body: snapshotSortieWorld(world!),
  }));
root.addEventListener("click", (e) => {
  const id = (e.target as HTMLElement).id;
  state = createInitialHangar();
  if (id === "seed") state = loadPlaytestSeed(state);
  if (id === "prepare")
    state = persistHangar({
      ...state,
      hub: {
        ...state.hub,
        inventory: {
          ...state.hub.inventory,
          junk: 10,
          armor: 1000,
          power: 1000,
        },
        fleet: state.hub.fleet.map((m, i) =>
          i === 0
            ? { ...m, durability: 50, battery: { ...m.battery, activity: 0 } }
            : m,
        ),
      },
    });
  if (id === "buy") state = buyNewMech(state);
  if (id === "containers") state = buyUnopenedContainers(state, 1);
  if (id === "open") state = launchSortFromUnopened(state, 1).state;
  if (id === "craft") {
    const r = craftJunkCircuit(state.hub, 1, {
      circuitId: crypto.randomUUID(),
      trueBoardRate: 0,
    });
    if (r.ok) state = persistHangar({ ...state, hub: r.hub });
  }
  if (id === "equip") {
    const c = state.hub.circuits.find(
      (c) => !c.equippedTo && c.restoreState !== "unrestored",
    );
    const m = state.hub.fleet[0];
    if (c && m) {
      const r = equipCircuit(state.hub, c.circuitId, m.instanceId);
      if (r.ok) state = persistHangar({ ...state, hub: r.hub });
    }
  }
  if (id === "unequip") {
    const c = state.hub.circuits.find((c) => c.equippedTo);
    if (c)
      state = persistHangar({
        ...state,
        hub: unequipCircuit(state.hub, c.circuitId),
      });
  }
  if (id === "repair") {
    const m = state.hub.fleet.find(
      (m) => m.durability > 0 && m.durability < m.durabilityMax,
    );
    if (m) state = repairMech(state, m.instanceId);
  }
  if (id === "charge") {
    const m = state.hub.fleet.find(
      (m) => m.battery.activity < m.battery.capacity,
    );
    if (m) state = chargeMech(state, m.instanceId);
  }
  if (id === "restore") saveMarksToStorage("play-log-test", [1, 1, 1, 1]);
  if (id === "restoreComplete") {
    const c = state.hub.circuits.find(
      (c) => c.circuitBoard.cols === 1 && c.restoreState === "unrestored",
    )!;
    const url = buildReturnToTradeUrl({
      circuitId: c.circuitId,
      cols: 1,
      rows: 1,
      marks: [1, 1, 1, 1],
      puzzleId: c.circuitBoard.puzzleId,
      outcome: "bypass",
      baseUrl: location.href,
    });
    state = ingestLocationSearch(state, new URL(url).search).state;
  }
  if (id === "progress") {
    const b = generateBoard(AOI_HALF, rngFromSeed(42));
    b.seed = 42;
    const safe = b.cells.flat().find((c) => !c.mine && !c.blocked && !c.open)!;
    openCell(b, safe.sx, safe.sy);
    saveHubSaveToLocalStorage({
      ...state.hub,
      frontProgress: captureFrontProgress(b, null),
    });
  }
  if (id === "sortie") {
    const ids = state.hub.fleet.slice(0, 2).map((m) => m.instanceId);
    world = createWorld(
      bootstrapFromSearch(
        `?deployableMechs=2&deployedInstanceIds=${ids.join(",")}`,
      ),
    );
    for (const id of ids) {
      const mech = state.hub.fleet.find((m) => m.instanceId === id)!;
      world.mechBattery[id] = structuredClone(mech.battery);
      world.currentAmmo[id] = mech.currentAmmo;
      world.deployedDurability[id] = mech.durability;
    }
    world.invadeSector = {
      sectorX: 0,
      sectorY: 0,
      density: 0.1,
      intelFlags: [],
    };
    attachLostMechContext(world, state.hub);
    attachCircuitPlay(world, state.hub, true);
    attachFieldPersistence(world, state.hub);
    startSortie(world);
    world.enemies = [];
    world.containers = [];
    world.coverObjects = [];
    const identities = shieldIdentityFromWreck(
      registerWreckIdentity(emptyFieldObjectIdentities(), "fixture-wreck"),
      "fixture-wreck",
      "fixture-ground-shield",
      { hp: 12.5, maxHp: 87.5 },
    );
    world.shieldState = {
      identities,
      equipped: {},
      ground: {
        "fixture-ground-shield": {
          x: world.leader.pos.x + 30,
          y: world.leader.pos.y,
        },
      },
    };
    recordPlayLogSortie(snapshotSortieWorld(world));
    setPlayLogCheckpointProvider(() => ({
      v: 1,
      kind: world!.phase === "result" ? "result" : "sortie",
      body: snapshotSortieWorld(world!),
    }));
  }
  if (id === "checkpoint" && world) {
    tickWorld(world, 0.25, {
      move: { x: 0, y: 0 },
      fire: false,
      interact: false,
      clickMove: null,
    });
    if (!writeHideCheckpoint("sortie", snapshotSortieWorld(world)))
      throw new Error("checkpoint_write_failed");
  }
  if (id === "settle" && world) {
    if (world.phase === "sortie" && world.wingmen[0]) {
      world.wingmen[0].pos = {
        x: world.balance.worldW - 30,
        y: world.balance.worldH - 30,
      };
      world.wingmen[0].holdOrder = true;
    }
    world.mechLearningWork = {
      [world.deployedInstanceIds[0]!]: [
        {
          ledger: "survival",
          action: "hold",
          subject: "none",
          distance: "near",
          circle: "inside",
          hp: "high",
          cargo: "none",
          tries: 3,
          survived: 1,
        },
      ],
    };
    requestExtract(world);
    for (let i = 0; i < 160 && world.phase === "sortie"; i++)
      tickWorld(world, 0.1, {
        move: { x: 0, y: 0 },
        fire: false,
        interact: false,
        clickMove: null,
      });
    saveSortieResultToHub(world);
  }
  if (id === "sell") {
    const c = state.hub.circuits.find((c) => !c.equippedTo);
    if (c) state = sellCircuit(state, c.circuitId);
  }
  state = createInitialHangar();
  render();
});
render();
Object.assign(window, {
  playHarness: {
    world: () => world,
    openPlayLogDB,
    exportPlayGame,
    activePlayGameId,
    readPlayGame,
    stagePlayDraft,
    commitPlayDraft,
    makePlayDraft,
    canonical,
    saveHubSaveToLocalStorage,
    loadHubSaveFromLocalStorage,
  },
});
