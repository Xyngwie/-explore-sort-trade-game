import assert from "node:assert/strict";
import { createWorld, bootstrapFromSearch } from "./game/world";
import { pushLog } from "./game/orders";
import { subscribeLogFeed } from "./game/logFeed";
import { repairDetails, repairSummary, unreadLabel } from "./ui/logPanel";
import type { LogLine } from "./game/types";
const w = createWorld(bootstrapFromSearch(""));
const arrivals: LogLine[] = [];
const stop = subscribeLogFeed(w, line => arrivals.push(line));
for (let n = 0; n < 1005; n++) pushLog(w, `line-${n}`, "battle");
assert.equal(arrivals.length, 1005, "UI feed observes every arrival even when checkpoint history trims");
assert.equal(arrivals[0]!.text, "line-0"); assert.equal(arrivals.at(-1)!.text, "line-1004");
assert.equal(w.logs.length, w.balance.maxBattleReports + w.balance.maxTacticalLog, "don't change game history cap");
stop(); pushLog(w, "after-stop"); assert.equal(arrivals.length, 1005);
const other = createWorld(bootstrapFromSearch("")); pushLog(other, "other-world"); assert.equal(arrivals.length, 1005);
const repair = { at: "2026-10-18T01:02:03.000Z", severity: "error" as const,
  counts: { counter: 1, duplicate: 1, source: 0 }, repairs: [{ kind: "duplicate" as const,
    target: "shields.a.shieldId", before: "7", after: "8" }] };
assert.match(repairSummary(repair), /カウンター修復 1件・個体ID修復 1件/);
assert(!repairSummary(repair).includes("出自ID補完"));
const details = repairDetails(repair);
assert(details.includes(repair.at)); assert(details.includes("shields.a.shieldId"));
assert(details.includes('変更前："7"')); assert(details.includes('変更後："8"'));
assert.equal(unreadLabel(999), "新着ログ 999件"); assert.equal(unreadLabel(1005), "新着ログ 999+件");
console.log("log feed: all arrivals despite capped saves, unsubscribe/world isolation, repair details and unread limit PASS");
