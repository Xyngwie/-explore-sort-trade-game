import {
  createOwnedMech,
  createEmptyCircuitBoard,
  edgeCount,
  encodeEdgeState,
  type EdgeMark,
  type HubCircuitRecord,
  type HubSnapshot,
} from "@estg/shared";
import type { World } from "./types";

/** Stable acquired ids make retry / checkpoint replay idempotent. */
export function acquireEnemyWrecks(
  world: World,
  hub: HubSnapshot,
): HubSnapshot {
  let next = hub;
  for (const e of world.recoveredEnemyUnits ?? []) {
    const instanceId = `recovered-${e.id}`;
    if (next.fleet.some((m) => m.instanceId === instanceId)) continue;
    const mech = {
      ...createOwnedMech("mech_gen1", { durability: 0 }),
      instanceId,
      durability: 0,
      status: "destroyed" as const,
      currentAmmo: 0,
    };
    const circuits: HubCircuitRecord[] = (e.enemyIdentity?.circuits ?? []).map(
      (c) => {
        const marks: EdgeMark[] = Array(edgeCount(c.side, c.side)).fill(0);
        // A used false-board loop; further Restore edits replace the sampled effect.
        for (let x = 0; x < c.side; x++) {
          marks[x] = 1;
          marks[c.side * c.side + x] = 1;
        }
        for (let y = 0; y < c.side; y++) {
          marks[c.side * (c.side + 1) + y * (c.side + 1)] = 1;
          marks[c.side * (c.side + 1) + y * (c.side + 1) + c.side] = 1;
        }
        return {
          circuitId: c.circuitId,
          circuitBoard: {
            ...createEmptyCircuitBoard(c.side, c.side),
            edgeState: encodeEdgeState(marks),
            puzzleId: c.circuitId,
            outcome: "bypass",
          },
          restoreState: "bypass",
          outcome: "bypass",
          origin: "enemy_drop",
          equippedTo: instanceId,
          effectKey: c.effectKey,
          enemyEffect: c.effect,
        };
      },
    );
    next = {
      ...next,
      fleet: [...next.fleet, mech],
      circuits: [
        ...next.circuits,
        ...circuits.filter(
          (c) => !next.circuits.some((x) => x.circuitId === c.circuitId),
        ),
      ],
    };
  }
  return next;
}

export function enemyWreckReturns(
  world: World,
): import("@estg/shared").EnemyWreckReturn[] {
  const hub = acquireEnemyWrecks(world, {
    fleet: [],
    circuits: [],
  } as unknown as HubSnapshot);
  return hub.fleet.map((m) => ({
    instanceId: m.instanceId,
    circuits: hub.circuits.filter((c) => c.equippedTo === m.instanceId),
  }));
}
