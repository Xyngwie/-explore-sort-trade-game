// 2026-10-17 神宮: resource history signs (+ / − U+2212 / ±0) and colours (gain green, spend red, neutral grey).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHubSave, deserializeHubSave, serializeHubSave, INITIAL_HUB } from "@estg/shared";
import { buildResourceHistoryHtml, chipClass, formatChip, formatSignedAmount, parseResourceHistoryLine } from "./resourceHistory";

// Sign formatting.
assert.equal(formatSignedAmount(5), "+5");
assert.equal(formatSignedAmount(-15), "\u221215");
assert.equal(formatSignedAmount(0), "±0");
assert.ok(!formatSignedAmount(-3).includes("-"), "no ASCII hyphen for decreases");
assert.equal(formatChip({ label: "credits", amount: -15, unit: "c" }), "credits \u221215c");
assert.equal(formatChip({ label: "未開封", amount: 3 }), "未開封 +3");
assert.equal(formatChip({ label: "ammo", amount: 0 }), "ammo ±0");
// Label-only chips: no sign, colour only.
assert.equal(formatChip({ label: "wear", amount: null }), "wear");
assert.equal(chipClass("neutral", { label: "wear", amount: null }), "neutral");
assert.equal(chipClass("spend", { label: "repair", amount: null }), "spend");
// Zero is grey whatever the row; others follow the row.
assert.equal(chipClass("gain", { label: "ammo", amount: 0 }), "zero");
assert.equal(chipClass("gain", { label: "ammo", amount: 2 }), "gain");
assert.equal(chipClass("spend", { label: "credits", amount: -1 }), "spend");

// Real log lines end to end.
const html = buildResourceHistoryHtml([
  "搬入 yieldBag ammo:2, armor:0, power:1",
  "未開封購入 ×1 → −15c（仮 15c）",
  "帰還ウェア x",
]);
assert.ok(html.includes('<span class="res-chip gain">ammo +2</span>'));
assert.ok(html.includes('<span class="res-chip zero">armor ±0</span>'));
assert.ok(html.includes('<span class="res-chip spend">credits \u221215c</span>'));
assert.ok(html.includes('<span class="res-chip neutral">wear</span>'), "label-only chip: colour only");
assert.ok(html.includes("polarity-neutral"));
assert.equal(parseResourceHistoryLine("未開封購入 ×1 → −15c（仮 15c）")!.chips[0]!.amount, -15, "parsed amounts unchanged");

// Colours.
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const block = (sel: string) => css.match(new RegExp(`${sel.replace(/[.]/g, "\\.")}[^{]*\\{([^}]*)\\}`))?.[1] ?? "";
assert.match(block(".res-chip.gain"), /color: #56d364/, "gain green");
assert.match(block(".res-chip.spend"), /color: #ff8b8b/, "spend red");
assert.match(block(".res-row.polarity-gain"), /rgba\(63, 185, 80/);
assert.match(block(".res-row.polarity-spend"), /rgba\(248, 81, 73/);
for (const sel of [".res-chip.neutral", ".res-row.polarity-neutral"]) {
  assert.doesNotMatch(block(sel), /88, 166, 255|26, 75, 140|#79b8ff|#1a2a44/, `${sel} no longer blue`);
  assert.match(block(sel), /139, 148, 158/, `${sel} grey`);
}
assert.ok(/\.res-chip\.neutral,\s*\.res-chip\.zero \{[^}]*color: #c9d1d9/.test(css), "±0 chip grey like neutral");

// Save compat: display only; HubSave and its log lines are unchanged.
{
  const save = createHubSave(INITIAL_HUB);
  const raw = serializeHubSave(save);
  assert.equal(serializeHubSave(deserializeHubSave(raw)!), raw, "HubSave round-trips unchanged");
  const before = ["未開封購入 ×1 → −15c（仮 15c）", "搬入 materials +5"];
  const copy = [...before];
  buildResourceHistoryHtml(copy);
  assert.deepEqual(copy, before, "log lines are not rewritten");
}
console.log("trade res signs ok");
