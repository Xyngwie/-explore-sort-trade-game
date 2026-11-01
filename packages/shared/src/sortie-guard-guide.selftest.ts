import assert from "node:assert/strict";
import { INITIAL_HUB, normalizeHubSnapshot, saveHubSaveToLocalStorage, loadHubSaveFromLocalStorage } from "./index";
import { sortieGuardGuide, sortieGuardBannerHtml, SORTIE_GUARD_RETURN_KEY } from "./sortie-guard-guide";
const hub = { ...INITIAL_HUB, newGameIntro: { initialOpened: 10, craftedCircuitIds: [] } } as never as typeof INITIAL_HUB;
const g = sortieGuardGuide(hub, ["leader-x"]);
assert.ok(g && g.code === "first_circuit_unrepaired" && g.action === "修復へ移動" && g.target === "hub-anchor-circuits", JSON.stringify(g));
assert.equal(sortieGuardGuide(hub, [])?.code, "first_leader");
assert.equal(sortieGuardGuide(normalizeHubSnapshot({ ...INITIAL_HUB, newGameIntro: undefined } as never), ["x"]), null, "no guard after onboarding with nothing equipped over limit");
assert.match(sortieGuardBannerHtml(g!), /id="sortie-guard-go"/);
assert.equal(SORTIE_GUARD_RETURN_KEY, "estg.sortieGuardReturn");
// Save compat: the guide is read-only.
const before = JSON.stringify(hub); sortieGuardGuide(hub, ["leader-x"]); assert.equal(JSON.stringify(hub), before);
void saveHubSaveToLocalStorage; void loadHubSaveFromLocalStorage;
console.log("shared sortie-guard-guide.selftest ok");
