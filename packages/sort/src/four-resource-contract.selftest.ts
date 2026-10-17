import {
  buildSupplyBag,
  clearMatches,
  createRefineFromLocationSearch,
  startRefine,
  toCraftingResult,
  type RefineLive,
} from "./refine";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const canonicalKinds = new Set(["ammo", "armor", "power", "junk"]);
const matchableKinds = new Set(["ammo", "armor", "power"]);

// Supply generation must use only the three matchable resource kinds.
const bag = buildSupplyBag(64, 0, 17);
assert(bag.length === 64, "supply bag length");
assert(bag.every((kind) => matchableKinds.has(kind)), "supply bag uses only canonical matchable kinds");

// Junk is a valid board resource but must survive a clear operation.
const board: RefineLive["board"] = ["ammo", "armor", "power", "junk", null, null];
const cleared = clearMatches(board, [0, 1, 2]);
assert(cleared.cleared.ammo === 1, "ammo clear count");
assert(cleared.cleared.armor === 1, "armor clear count");
assert(cleared.cleared.power === 1, "power clear count");
assert(cleared.board[3] === "junk", "junk survives clear");

// A normal game state may contain only the four canonical kinds (or empty cells).
let state = createRefineFromLocationSearch("?salvagedContainers=2&totalStockPieces=50&isExtracted=1");
state = startRefine(state, 17);
assert(
  state.board.every((kind) => kind == null || canonicalKinds.has(kind)),
  "board uses only canonical four-resource vocabulary",
);
assert(
  state.cleared.ammo === 0 && state.cleared.armor === 0 && state.cleared.power === 0,
  "cleared state uses canonical three-resource counters",
);

// Sort's result boundary must expose only the four-resource model and never legacy names.
const result = toCraftingResult({
  ...state,
  phase: "result",
  cleared: { ammo: 2, armor: 3, power: 4 },
});
assert(result.yieldBag?.ammo === 2, "craft result ammo");
assert(result.yieldBag?.armor === 3, "craft result armor");
assert(result.yieldBag?.power === 4, "craft result power");
assert(!("food" in (result.yieldBag ?? {})), "legacy food does not cross Sort result boundary");
assert(!("material" in (result.yieldBag ?? {})), "legacy material does not cross Sort result boundary");
assert(!("energy" in (result.yieldBag ?? {})), "legacy energy does not cross Sort result boundary");

// 2026-10-17 神宮: resource colours — ammo red (same as the explore map), power yellow, armor (defence) blue.
import { readFileSync } from "node:fs";
import { createHubSave, serializeHubSave, INITIAL_HUB } from "@estg/shared";
{
  const css = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
  const four = css("four-resource.css");
  const style = css("style.css");
  const rule = (src: string, sel: string) => {
    const m = src.match(new RegExp(`\\.swatch\\.${sel}, \\.cell\\.${sel} \\{([^}]*)\\}`));
    assert(m, `rule for ${sel}`);
    const get = (p: string) => m![1]!.match(new RegExp(`(?:^|[;{\\s])${p}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();
    return { bg: get("background"), border: get("border-color"), text: get("color") };
  };
  const RED = { bg: "#6b2f2f", border: "#f85149", text: "#ffd4d0" };
  const YELLOW = { bg: "#5a4a1e", border: "#d4a72c", text: "#ffe8a3" };
  const BLUE = { bg: "#1f4d6b", border: "#58a6ff", text: "#c8e1ff" };
  const eq = (a: object, b: object, m: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)}`);
  eq(rule(four, "ammo"), RED, "ammo red set");
  eq(rule(four, "power"), YELLOW, "power gets the old yellow set");
  eq(rule(four, "armor"), BLUE, "armor gets the old blue set");
  eq(rule(four, "junk"), { bg: "#3a3a3a", border: "#6e7681", text: "#c9d1d9" }, "junk unchanged");
  // Legacy names follow: food = ammo, material = armor, energy = power.
  eq(rule(style, "food"), RED, "legacy food = ammo red");
  eq(rule(style, "material"), BLUE, "legacy material = armor blue");
  eq(rule(style, "energy"), YELLOW, "legacy energy = power yellow");
  assert(!/#56d364|#3d6b2f|#d4f5c8/.test(four), "old ammo green gone from resource colours");
  // Board warnings: white blinking outline; hints: white dotted. No red / blue on the board warnings.
  const block = (sel: string) => style.match(new RegExp(`${sel.replace(/[.]/g, "\\.")} \\{([^}]*)\\}`))?.[1] ?? "";
  assert(/outline:\s*2px solid #ffffff/.test(block(".cell.pending")), "pending outline white");
  assert(/animation:\s*pulse-clear /.test(block(".cell.pending")), "pending still blinks");
  assert(/@keyframes pulse-clear \{[^}]*outline-color:\s*#ffffff[^}]*\}[^}]*outline-color:\s*rgba\(255, 255, 255/.test(style), "outline blinks white");
  assert(/outline:\s*2px dotted rgba\(255, 255, 255/.test(block(".cell.hint")), "hint white dotted");
  assert(!/rgba\(88, 166, 255/.test(block(".cell.hint")), "hint no longer blue");
  assert(/rgba\(255, 255, 255/.test(block(".board.clearing")), "board clearing white");
  // Gauges unchanged; tension (outside the board) stays red.
  assert(style.includes(".hud-gauge.low .hud-gauge-fill {\n  background: linear-gradient(90deg, #d4a72c 0%, #f0883e 100%);"), "low gauge unchanged");
  assert(style.includes(".hud-gauge.tension .hud-gauge-fill {\n  background: linear-gradient(90deg, #f0883e 0%, #f85149 100%);"), "tension gauge red");
  assert(/\.warn \{ color: #f85149/.test(style), "warn text stays red");
  // Same red / yellow as the explore map drops.
  const map = readFileSync(new URL("../../explore/src/game/mapShapes.ts", import.meta.url), "utf8");
  assert(map.includes(`ammoDrop: "${RED.border}"`) && map.includes(`powerDrop: "${YELLOW.border}"`), "map and SORT share red / yellow");
}
// Save compat: colours are CSS only; HubSave and the result boundary are unchanged.
{
  const save = createHubSave(INITIAL_HUB);
  assert(serializeHubSave(save) === serializeHubSave(JSON.parse(serializeHubSave(save))), "HubSave round-trips unchanged");
  assert(!/colou?r|#[0-9a-f]{6}/i.test(serializeHubSave(save)), "no colour data in HubSave");
  const r = toCraftingResult({ ...state, phase: "result", cleared: { ammo: 1, armor: 2, power: 3 } });
  assert(JSON.stringify(Object.keys(r.yieldBag ?? {}).sort()) === JSON.stringify(["ammo", "armor", "power"]), "yield keys unchanged");
}
console.log("four-resource colours ok");
