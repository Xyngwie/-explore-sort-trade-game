/** PR2: shell HUD shows the same Cr・弾・装・電 values the DOCK bar used to (holdingPills). */
import assert from "node:assert/strict";
import { hudItems, INITIAL_HUB } from "@estg/shared";
import { holdingPills } from "./hangar";
for (const hub of [
  { ...INITIAL_HUB },
  { ...INITIAL_HUB, credits: 98765, inventory: { ammo: 12, armor: 0, power: 3.7, junk: 5 } },
  { ...INITIAL_HUB, credits: -1, inventory: {} as any },
]) {
  const pills = Object.fromEntries(holdingPills(hub).map((p) => [p.key, p.value]));
  const hud = Object.fromEntries(hudItems(hub).map((i) => [i.key, i.value]));
  for (const k of ["credits", "ammo", "armor", "power"]) assert.equal(hud[k], pills[k], k);
  assert.equal(hud.unopened, Math.max(0, Math.floor(hub.unopenedContainers ?? 0)));
}
console.log("trade hud-match.selftest ok");
