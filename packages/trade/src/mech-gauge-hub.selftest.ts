import assert from "node:assert/strict";
import { INITIAL_HUB, createOwnedMech, normalizeHubSnapshot, mechGaugeSvg } from "@estg/shared";
import { hubMechGaugeModel } from "./mech-gauge-hub";
// Detail 8: only the leader (first selected deploy mech) gets the thin white outer outline on HUB.
const a = createOwnedMech("mech_gen1", { instanceId: "a" }), b = createOwnedMech("mech_gen1", { instanceId: "b" });
const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [a, b] });
const before = JSON.stringify(hub);
const la = hubMechGaugeModel(hub, hub.fleet[0]!, "a"), lb = hubMechGaugeModel(hub, hub.fleet[1]!, "a");
assert.equal(la.leader, true); assert.equal(lb.leader, false);
assert.equal(hubMechGaugeModel(hub, hub.fleet[0]!, null).leader, false, "no selection → no leader");
assert.equal(hubMechGaugeModel(hub, hub.fleet[0]!).leader, false);
assert.ok(mechGaugeSvg(la, 44).includes("mg-leader")); assert.ok(!mechGaugeSvg(lb, 44).includes("mg-leader"));
assert.equal(la.text, lb.text, "outline does not change the numbers");
assert.equal(JSON.stringify(hub), before, "display only: hub unchanged");
console.log("HUB gauge leader outline PASS");
