import assert from "node:assert/strict";
import { INITIAL_HUB, normalizeHubSnapshot, saveHubSaveToLocalStorage, loadHubSaveFromLocalStorage } from "./index";
import { sortieGuardGuide, sortieGuardBannerHtml, SORTIE_GUARD_RETURN_KEY } from "./sortie-guard-guide";
const hub = { ...INITIAL_HUB, newGameIntro: { initialOpened: 10, craftedCircuitIds: [] } } as never as typeof INITIAL_HUB;
const g = sortieGuardGuide(hub, ["leader-x"]);
assert.ok(g && g.code === "first_circuit_unrepaired" && g.action === "修復へ移動" && g.target === "hub-anchor-circuits", JSON.stringify(g));
assert.equal(sortieGuardGuide(hub, [])?.code, "first_leader");
assert.equal(sortieGuardGuide(normalizeHubSnapshot({ ...INITIAL_HUB, newGameIntro: undefined } as never), ["x"]), null, "no guard after onboarding with nothing equipped over limit");
// 1-A: same text whether or not the circuit is repaired; only the button differs.
{ const cid = "c-rep"; const h2 = { ...hub, newGameIntro: { initialOpened: 10, craftedCircuitIds: [cid] }, circuits: [{ circuitId: cid, origin: "crafted", restoreState: "bypass" }] } as never as typeof INITIAL_HUB;
  const u = sortieGuardGuide(h2, ["leader-x"]);
  assert.equal(u?.code, "first_circuit_unequipped", JSON.stringify(u)); { assert.equal(u.text, g!.text); assert.equal(u.action, "回路を装備する"); assert.equal(u.target, "hub-anchor-circuits"); } }
for (const t of [g!.target, sortieGuardGuide(hub, [])!.target]) assert.ok(["hub-anchor-circuits", "hub-anchor-reserve"].includes(t));
assert.match(sortieGuardBannerHtml(g!), /id="sortie-guard-go"/);
assert.equal(SORTIE_GUARD_RETURN_KEY, "estg.sortieGuardReturn");
// Save compat: the guide is read-only.
const before = JSON.stringify(hub); sortieGuardGuide(hub, ["leader-x"]); assert.equal(JSON.stringify(hub), before);
void saveHubSaveToLocalStorage; void loadHubSaveFromLocalStorage;
console.log("shared sortie-guard-guide.selftest ok");
