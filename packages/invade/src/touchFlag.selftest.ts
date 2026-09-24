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

assert.equal(shouldArmFlagLongPress({ button: 0 }), true);
assert.equal(shouldArmFlagLongPress({ button: 0, pointerType: "touch" }), true);
assert.equal(shouldArmFlagLongPress({ button: 2 }), false, "secondary not armed");

const off = buildFlagOpsGuideHtml(false);
assert.ok(off.includes("flag-ops-guide"), "guide root");
assert.ok(off.includes("長押し"), "mentions long-press");
assert.ok(off.includes("旗モード"), "mentions flag mode");
assert.ok(off.includes("右クリック"), "mentions right-click");
assert.ok(off.includes("旗モード OFF"), "off state note");

const on = buildFlagOpsGuideHtml(true);
assert.ok(on.includes("旗モード ON"), "on state note");
assert.ok(on.includes("タップで旗トグル"), "on behavior");

console.log("invade touch flag plant ok");
