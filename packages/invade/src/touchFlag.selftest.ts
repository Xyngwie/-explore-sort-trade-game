/**
 * Invade touch flag plant helpers — run via package selftest chain.
 */
import assert from "node:assert/strict";
import {
  FLAG_LONG_PRESS_MS,
  buildFlagOpsGuideHtml,
  shouldArmFlagLongPress,
} from "./touchFlag";

assert.ok(FLAG_LONG_PRESS_MS >= 400 && FLAG_LONG_PRESS_MS <= 700, "long-press window");

assert.equal(shouldArmFlagLongPress({ button: 0 }), false);
assert.equal(shouldArmFlagLongPress({ button: 0, pointerType: "touch" }), true);
assert.equal(shouldArmFlagLongPress({ button: 2 }), false, "secondary not armed");

const off = buildFlagOpsGuideHtml(false);
assert.ok(off.includes("flag-ops-guide"), "guide root");
assert.ok(off.includes("長押し"), "mentions long-press");
assert.ok(off.includes("タップで旗"), "default flag tap");
assert.ok(off.includes("右クリック"), "mentions right-click");
assert.ok(off.includes("長押しして離すと開く"), "default release open");

const on = buildFlagOpsGuideHtml(true);
assert.ok(on.includes("タップで開く"), "reversed open tap");
assert.ok(on.includes("長押しして離すと旗"), "reversed release flag");

console.log("invade touch flag plant ok");
