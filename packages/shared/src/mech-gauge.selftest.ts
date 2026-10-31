/** PR3 mech gauge: ring angle, levels, clamps, text, SVG, display-only (save/checkpoint untouched). */
import assert from "node:assert/strict";
import {
  mechGaugeModel, gaugeLevel, gaugeNumber, ringArcPath, mechGaugeSvg, mechGaugeHtml, MECH_GAUGE_TAP_MS,
  createNewGameHub, normalizeHubSnapshot, saveHubSaveToLocalStorage, loadHubSaveFromLocalStorage, SORTIE_CHECKPOINT_KEY,
} from "./index";
const m = mechGaugeModel({ armor: [85, 100], power: [210, 300], ammo: [18, 28] });
assert.equal(m.text, "装甲 85/100 · 電力 210/300 · 弾薬 18/28");
assert.equal(MECH_GAUGE_TAP_MS, 1500);
assert.equal(m.ringDeg, 306);
assert.equal(+m.power!.frac.toFixed(3), 0.7);
// Clamps / zero / missing / bad input.
assert.deepEqual(gaugeLevel([150, 100]), { cur: 100, max: 100, frac: 1, zero: false });
assert.deepEqual(gaugeLevel([-5, 100]), { cur: 0, max: 100, frac: 0, zero: true });
assert.deepEqual(gaugeLevel([5, 0]), { cur: 0, max: 0, frac: 0, zero: true });
assert.deepEqual(gaugeLevel([NaN, 10]), { cur: 0, max: 10, frac: 0, zero: true });
assert.equal(gaugeLevel(null), null);
assert.equal(gaugeNumber(0.2, 10), 1); // never 0 while something is left
assert.equal(gaugeNumber(9.99, 10), 10);
assert.equal(gaugeNumber(3, 3), 3);
assert.equal(mechGaugeModel({ armor: [0.4, 100], power: null, ammo: null }).text, "装甲 1/100 · 電力 — · 弾薬 —");
// Destroyed: ring empty.
const d = mechGaugeModel({ armor: [50, 100], power: [1, 1], ammo: [1, 1], destroyed: true });
assert.equal(d.ringDeg, 0);
// Arc: clockwise sweep ending at 12 o'clock.
assert.equal(ringArcPath(10, 10, 10, 0), "");
assert.equal(ringArcPath(10, 10, 10, 90), "M 0 10 A 10 10 0 0 1 10 0");
assert.equal(ringArcPath(10, 10, 10, 270), "M 20 10 A 10 10 0 1 1 10 0");
assert.match(ringArcPath(10, 10, 10, 360), /^M 10 0 A 10 10 0 1 1/);
// SVG: power level & ammo bar heights follow the fractions.
const svg = mechGaugeSvg(mechGaugeModel({ armor: [1, 1], power: [0, 300], ammo: [28, 28] }), 32);
assert.match(svg, /class="mg-core"[^>]*height="0"/);
assert.match(svg, /stroke-dasharray/); // zero power = dashed
assert.match(mechGaugeHtml(m, 32), /data-mech-gauge="装甲 85\/100 · 電力 210\/300 · 弾薬 18\/28"/);
// Display only: building models never touches the save/checkpoint.
const mem = new Map<string, string>();
const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; }, clear: () => mem.clear() } as unknown as Storage;
const hub = normalizeHubSnapshot(createNewGameHub());
saveHubSaveToLocalStorage(hub, st); mem.set(SORTIE_CHECKPOINT_KEY, "{\"v\":1}");
const before = JSON.stringify([...mem]);
for (const f of loadHubSaveFromLocalStorage(st)!.hub.fleet) mechGaugeModel({ armor: [f.durability, f.durabilityMax], power: [f.battery.activity, f.battery.capacity], ammo: [f.currentAmmo ?? 28, 28] });
assert.equal(JSON.stringify([...mem]), before);
console.log("mech-gauge selftest ok");
