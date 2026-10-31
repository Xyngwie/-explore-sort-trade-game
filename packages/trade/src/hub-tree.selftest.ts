import assert from "node:assert/strict";
import { INITIAL_HUB, createOwnedMech, normalizeHubSnapshot, saveHubSaveToLocalStorage, loadHubSaveFromLocalStorage, HUB_SAVE_STORAGE_KEY, SORTIE_CHECKPOINT_KEY } from "@estg/shared";
import { hubTreeModel, hubTreeHtml } from "./hub-tree";
function storage() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } }; }
const a = createOwnedMech("mech_gen1", { instanceId: "a" }), b = createOwnedMech("mech_gen1", { instanceId: "b" }), c = createOwnedMech("mech_gen1", { instanceId: "c" });
const hub = normalizeHubSnapshot({ ...INITIAL_HUB, fleet: [a, b, c] });
const n = hubTreeModel(hub, ["a", "b"]);
assert.deepEqual(n.map((x) => x.label), ["第1小隊", "予備格納庫", "回路保管庫", "物資市場"]);
assert.equal(n[0]!.count, "2機"); assert.equal(n[1]!.count, "1機"); assert.match(n[2]!.count, /^\d+枚$/);
assert.equal(n[3]!.target, "four-resource-trade", "物資市場 → Trade market card (Q12)");
assert.equal(hubTreeModel(hub, [])[0]!.count, "0機");
const html = hubTreeHtml(n); assert.ok(html.includes("母艦") && html.includes('data-hub-node="market"'));
// Save + checkpoint compat: the tree only reads; old and new saves stay byte-identical.
const st = storage(); saveHubSaveToLocalStorage(hub, st); st.setItem(SORTIE_CHECKPOINT_KEY, '{"v":1,"kind":"sortie"}');
const before = [st.getItem(HUB_SAVE_STORAGE_KEY), st.getItem(SORTIE_CHECKPOINT_KEY)];
hubTreeModel(loadHubSaveFromLocalStorage(st)!.hub, ["a"]);
assert.deepEqual([st.getItem(HUB_SAVE_STORAGE_KEY), st.getItem(SORTIE_CHECKPOINT_KEY)], before);
const legacy = normalizeHubSnapshot({ credits: 5 } as never); assert.equal(hubTreeModel(legacy, []).length, 4, "old save without fleet/circuits");
console.log("HUB tree model, Q12 target, save/checkpoint unchanged PASS");
