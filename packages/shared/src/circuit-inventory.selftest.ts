import {
  addFieldDrops,
  buildMechCircuitsForDeploy,
  circuitActiveEffect,
  circuitEffectValue,
  circuitsEquippedTo,
  craftMaxSize,
  equipCircuit,
  fieldDropsAt,
  recoverFieldDrops,
  recordPerfectSize,
  stashCircuits,
  unequipCircuit,
} from "./circuit-inventory";
import { INITIAL_HUB, type HubCircuitRecord, type HubSnapshot } from "./hub-save";
import type { FieldCircuitDrop } from "./hub-save";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[circuit-inventory.selftest] ${message}`);
}

const mech = {
  instanceId: "mech-test-1",
  catalogId: "mech_gen1" as const,
  status: "operational" as const,
  durability: 100,
  durabilityMax: 100,
};

function board(side: number, puzzleId: string) {
  return {
    v: 1 as const,
    cols: side,
    rows: side,
    edgeState: "",
    puzzleId,
  };
}

function circuit(
  id: string,
  restoreState: HubCircuitRecord["restoreState"] = "unrestored",
  equippedTo: string | null = null,
): HubCircuitRecord {
  return {
    circuitId: id,
    circuitBoard: board(2, id),
    restoreState,
    origin: "crafted",
    equippedTo,
    outcome: restoreState === "unrestored" ? "offline" : restoreState,
  };
}

function baseHub(circuits: HubCircuitRecord[]): HubSnapshot {
  return {
    ...INITIAL_HUB,
    fleet: [mech],
    circuits,
  };
}

// Equip/unequip: one base slot, stash and equipped views stay consistent.
{
  const hub = baseHub([circuit("c1")]);
  const equipped = equipCircuit(hub, "c1", mech.instanceId);
  assert(equipped.ok, "c1 should equip to an existing mech");
  assert(circuitsEquippedTo(equipped.hub, mech.instanceId).length === 1, "equipped view should contain c1");
  assert(stashCircuits(equipped.hub).length === 0, "equipped c1 should leave the stash");

  const restored = unequipCircuit(equipped.hub, "c1");
  assert(circuitsEquippedTo(restored, mech.instanceId).length === 0, "unequip should clear the mech slot");
  assert(stashCircuits(restored).some((c) => c.circuitId === "c1"), "unequip should return c1 to the stash");
}

// Slot limit: the second circuit must not silently displace the first.
{
  const hub = baseHub([circuit("c1"), circuit("c2")]);
  const first = equipCircuit(hub, "c1", mech.instanceId);
  assert(first.ok, "first circuit should equip");
  const second = equipCircuit(first.hub, "c2", mech.instanceId);
  assert(!second.ok && second.reason === "slot_full", "second circuit should respect the base slot limit");
}

// Restore state controls whether an effect is active.
{
  const offline = circuit("off", "offline");
  const bypass = circuit("by", "bypass");
  assert(circuitEffectValue(offline) >= 0, "effect value should be a non-negative integer");
  assert(circuitActiveEffect(offline) === 0, "offline circuits must have zero active effect");
  assert(circuitActiveEffect(bypass) === circuitEffectValue(bypass), "bypass circuits should expose their effect");
}

// Perfect size is monotonic and never decreases.
{
  const perfect = {
    ...circuit("perfect", "fully_awakened"),
    locked: true,
    circuitBoard: { ...board(4, "perfect"), perfect: true, locked: true },
  };
  const hub = baseHub([perfect]);
  const raised = recordPerfectSize(hub, perfect);
  assert(raised.perfectMaxSize === 4, "a perfect 4x4 circuit should raise perfectMaxSize to 4");
  const capped = recordPerfectSize({ ...raised, perfectMaxSize: 6 }, perfect);
  assert(capped.perfectMaxSize === 6, "recordPerfectSize must never lower perfectMaxSize");
  assert(craftMaxSize(raised) === 5, "craft cap should be perfectMaxSize + 1");
}

// Field drops are addressable by front cell and recover unchanged into the stash.
{
  const droppedCircuit = circuit("drop-c1", "bypass", mech.instanceId);
  const drop: FieldCircuitDrop = {
    dropId: "drop-1",
    frontSeed: 42,
    cell: { sx: 3, sy: -2 },
    circuit: { ...droppedCircuit, equippedTo: null },
    cause: "left_behind",
    fromMechInstanceId: mech.instanceId,
    droppedAt: "2026-09-28T00:00:00.000Z",
  };
  const hub = addFieldDrops(baseHub([]), [drop]);
  assert(fieldDropsAt(hub, 42, { sx: 3, sy: -2 }).length === 1, "drop lookup should match front seed and cell");
  const recovered = recoverFieldDrops(hub, ["drop-1"]);
  assert(recovered.recovered.length === 1 && recovered.recovered[0] === "drop-c1", "drop should recover by dropId");
  const restored = recovered.hub.circuits.find((c) => c.circuitId === "drop-c1");
  assert(restored?.equippedTo === null, "recovered circuit must return to the stash");
  assert(restored?.restoreState === "bypass", "recovery must preserve restore state");
  assert(recovered.hub.fieldDrops.length === 0, "recovered drop should leave the field");
}

// Deploy payload contains only circuits equipped to the requested mech.
{
  const equipped = circuit("deploy-c1", "fully_awakened", mech.instanceId);
  const stashed = circuit("stash-c2", "fully_awakened");
  const payload = buildMechCircuitsForDeploy(baseHub([equipped, stashed]), [mech.instanceId]);
  assert(payload[mech.instanceId]?.length === 1, "deploy payload should include only equipped circuits");
  assert(payload[mech.instanceId]?.[0]?.circuitId === "deploy-c1", "deploy payload should identify the equipped circuit");
}

console.log("[circuit-inventory.selftest] ok");
