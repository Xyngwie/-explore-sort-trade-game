import { createOwnedMech } from "./mech-fleet";
import {
  normalizeHubSnapshot,
  type HubCircuitRecord,
  type HubSnapshot,
} from "./hub-save";
export type EnemyWreckReturn = {
  instanceId: string;
  circuits: HubCircuitRecord[];
};
export function parseEnemyWrecks(raw: string | null): EnemyWreckReturn[] {
  if (!raw || raw.length > 100000) return [];
  try {
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 80).flatMap((row) => {
      if (
        !row ||
        typeof row !== "object" ||
        typeof row.instanceId !== "string" ||
        !/^recovered-enemy-|^recovered-stray-/.test(row.instanceId) ||
        row.instanceId.length > 180 ||
        !Array.isArray(row.circuits)
      )
        return [];
      const instanceId = row.instanceId;
      const mech = createOwnedMech("mech_gen1", {
        instanceId,
        durability: 0,
        currentAmmo: 0,
      });
      const normalized = normalizeHubSnapshot({
        fleet: [mech],
        circuits: row.circuits
          .slice(0, 3)
          .filter((c: unknown) => c && typeof c === "object")
          .map((c: object) => ({
            ...c,
            origin: "enemy_drop",
            equippedTo: instanceId,
          })),
      });
      return [{ instanceId, circuits: normalized.circuits }];
    });
  } catch {
    return [];
  }
}
export function applyEnemyWrecks(
  hub: HubSnapshot,
  rows: readonly EnemyWreckReturn[],
): HubSnapshot {
  let next = hub;
  for (const row of rows) {
    if (next.fleet.some((m) => m.instanceId === row.instanceId)) continue;
    next = {
      ...next,
      fleet: [
        ...next.fleet,
        createOwnedMech("mech_gen1", {
          instanceId: row.instanceId,
          durability: 0,
          currentAmmo: 0,
        }),
      ],
      circuits: [
        ...next.circuits,
        ...row.circuits
          .filter(
            (c) => !next.circuits.some((x) => x.circuitId === c.circuitId),
          )
          .map((c) => ({ ...c, equippedTo: row.instanceId })),
      ],
    };
  }
  return next;
}
