import { strict as assert } from "node:assert";
import {
  buildExploreCircuitLoadout,
  buildExploreCircuitLoadouts,
  type HubCircuitRecord,
} from "./index";

const circuit = (id: string, equippedTo: string | null): HubCircuitRecord => ({
  circuitId: id,
  circuitBoard: {
    puzzleId: id,
    cols: 2,
    rows: 2,
    h: [],
    v: [],
    clue: [],
  },
  restoreState: "fully_awakened",
  origin: "crafted",
  equippedTo,
  outcome: "fully_awakened",
});

const circuits = [
  circuit("a", "mech-1"),
  circuit("b", "mech-1"),
  circuit("c", "mech-2"),
  circuit("stash", null),
];

const mech1 = buildExploreCircuitLoadout(circuits, "mech-1");
assert.deepEqual(mech1.map((x) => x.circuitId), ["a", "b"]);
assert.equal(buildExploreCircuitLoadout(circuits, "unknown").length, 0);
assert.equal(buildExploreCircuitLoadout(circuits, "").length, 0);

const all = buildExploreCircuitLoadouts(circuits);
assert.deepEqual(Object.keys(all).sort(), ["mech-1", "mech-2"]);
assert.deepEqual(all["mech-2"].map((x) => x.circuitId), ["c"]);
assert.equal(all["mech-1"][0].equippedTo, "mech-1");
assert.equal(all["mech-1"][0].origin, "crafted");

console.log("explore-circuit-handoff selftest: ok");
