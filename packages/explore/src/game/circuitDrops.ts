/**
 * Explore-side field drop appearance and recovery (CIRCUIT_DATA_MODEL_V0 §5.1・§5.3・§5.6, U18/U19).
 *
 * - Drops on this front cell (HubSave.fieldDrops with current frontSeed and cell)
 *   reappear near the drop zone (strandedDrops).
 * - Lift-off: dropped circuits inside the boarding circle are recovered
 *   (world.recoveredDropIds → returned to stash with equippedTo: null).
 * - Circuits already owned in hub.circuits stay on the field (recoverFieldDrops)
 *   and are not displayed as recovered on the result screen.
 */
import {
  fieldDropsAt,
  type FieldCircuitDrop,
  type HubSnapshot,
} from "@estg/shared";
import { dist, type Vec2 } from "./math";
import type { BoardingState, World } from "./types";
import type { SortieLocation } from "./lostMechs";

export const STRANDED_DROP_RING_RADIUS = 55;

export type StrandedCircuitDrop = {
  dropId: string;
  circuitId: string;
  pos: Vec2;
  drop: FieldCircuitDrop;
};

/**
 * Drops on this front cell (same frontSeed and cell), waiting near the drop zone spawn.
 * Only drops present at deploy time are returned here.
 */
export function strandedDropsFor(
  hub: Pick<HubSnapshot, "fieldDrops"> | null,
  location: SortieLocation | null,
  spawn: Vec2,
): StrandedCircuitDrop[] {
  if (!hub || !location) return [];
  const drops = fieldDropsAt(hub, location.frontSeed, location.cell);
  return drops.map((drop, i) => {
    // Sits slightly closer and at a different angle than stranded mechs to avoid overlapping
    const angle = Math.PI * 0.25 + i * 0.55;
    const r = STRANDED_DROP_RING_RADIUS + 15 * Math.floor(i / 6);
    return {
      dropId: drop.dropId,
      circuitId: drop.circuit.circuitId,
      pos: { x: spawn.x + Math.cos(angle) * r, y: spawn.y - Math.sin(angle) * r },
      drop,
    };
  });
}

/**
 * Lift-off: drops inside the boarding circle are recovered (only when the ship lifts off with captain aboard).
 */
export function recoverStrandedDropsAtLiftOff(
  world: World,
  boarding: BoardingState,
  captainIn: boolean,
): string[] {
  if (!captainIn) return [];
  const ids = (world.strandedDrops ?? [])
    .filter((d) => dist(d.pos, boarding.center) <= boarding.radius)
    .map((d) => d.dropId);
  world.recoveredDropIds = [...new Set([...(world.recoveredDropIds ?? []), ...ids])];
  return ids;
}

function escapeResultText(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Result-screen lines for circuits recovered from this front cell's field drops.
 * Only circuits actually returned to the stash (not already owned) are shown.
 * Equipped to is null (in stash, not auto-equipped).
 */
export function recoveredCircuitResultLines(world: {
  strandedDrops?: StrandedCircuitDrop[];
  recoveredDropIds?: string[];
  initialOwnedCircuitIds?: string[];
}): string[] {
  const recoveredSet = new Set(world.recoveredDropIds ?? []);
  if (recoveredSet.size === 0) return [];

  const owned = new Set(world.initialOwnedCircuitIds ?? []);
  const lines: string[] = [];

  for (const item of world.strandedDrops ?? []) {
    if (!recoveredSet.has(item.dropId)) continue;
    const cid = item.drop.circuit.circuitId;
    if (owned.has(cid)) {
      // Already owned: stays on the field per recoverFieldDrops, not returned to stash.
      continue;
    }
    owned.add(cid);
    lines.push(`落とし物の回路 ${cid} を回収（倉庫へ戻る）`);
  }

  return lines;
}

export function recoveredCircuitResultHtml(world: {
  strandedDrops?: StrandedCircuitDrop[];
  recoveredDropIds?: string[];
  initialOwnedCircuitIds?: string[];
}): string {
  const lines = recoveredCircuitResultLines(world);
  if (lines.length === 0) return "";
  return `<ul class="recovered-circuits" id="result-recovered-circuits">${lines
    .map((l) => `<li>${escapeResultText(l)}</li>`)
    .join("")}</ul>`;
}
