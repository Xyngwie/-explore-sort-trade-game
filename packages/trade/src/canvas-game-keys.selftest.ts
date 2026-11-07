/** Canvas window keys while the debug area is open (#353: inert canvas still took keys). */
import assert from "node:assert/strict";
import { routeGameKey, type GameKeyInput, type GameKeyTargets } from "./canvas/game-keys";

const down = (key: string, extra?: Partial<GameKeyInput>): GameKeyInput => ({
  type: "keydown", key, repeat: false, shiftKey: false, targetIsNameField: false, ...extra,
});

function spy() {
  const calls: string[] = [];
  const explore = {
    keyDown(key: string, repeat: boolean, shift: boolean) {
      calls.push(`explore:${key}:${repeat}:${shift}`);
      return key === " " || key === "w" || key === "f" || key === "ArrowUp";
    },
    keyUp(key: string) { calls.push(`up:${key}`); },
  };
  const sort = {
    key(key: string, shift: boolean) {
      calls.push(`sort:${key}:${shift}`);
      return key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
    },
  };
  return { calls, explore, sort };
}

const base = (over: Partial<GameKeyTargets> & Pick<GameKeyTargets, "scene" | "debugOpen">): GameKeyTargets => ({
  playLogBlocked: false,
  sort: null,
  explore: null,
  ...over,
});

// --- open: canvas page keys do not reach 探索 or SORT, and do not preventDefault ---
{
  const { calls, explore, sort } = spy();
  const openExplore = base({ debugOpen: true, scene: "explore", explore, sort });
  for (const key of [" ", "w", "f", "ArrowUp", "Escape"]) {
    assert.equal(routeGameKey(down(key), openExplore), false, `${key} is not taken while the area is open`);
  }
  assert.equal(routeGameKey(down(" ", { type: "keyup" }), openExplore), false);
  assert.equal(routeGameKey(down("ArrowLeft"), base({ debugOpen: true, scene: "sort", explore, sort })), false);
  assert.equal(routeGameKey(down("ArrowLeft", { shiftKey: true }), base({ debugOpen: true, scene: "sort", sort })), false);
  assert.deepEqual(calls, [], "open: explore keyDown/keyUp and SORT key are not called");
}

// --- closed: the same keys behave as before ---
{
  const { calls, explore, sort } = spy();
  assert.equal(routeGameKey(down(" "), base({ debugOpen: false, scene: "explore", explore })), true, "Space is taken");
  assert.equal(routeGameKey(down("w"), base({ debugOpen: false, scene: "explore", explore })), true);
  assert.equal(routeGameKey(down("f", { repeat: true }), base({ debugOpen: false, scene: "explore", explore })), true);
  assert.equal(routeGameKey(down("x"), base({ debugOpen: false, scene: "explore", explore })), false, "a key the scene does not claim is not prevented");
  assert.equal(routeGameKey(down(" ", { targetIsNameField: true }), base({ debugOpen: false, scene: "explore", explore })), false, "name field keeps the key");
  assert.equal(routeGameKey(down(" ", { type: "keyup" }), base({ debugOpen: false, scene: "explore", explore })), false);
  assert.equal(routeGameKey(down("ArrowLeft"), base({ debugOpen: false, scene: "sort", sort })), true, "SORT arrow is taken");
  assert.equal(routeGameKey(down("ArrowUp", { shiftKey: true }), base({ debugOpen: false, scene: "sort", sort })), true);
  assert.equal(routeGameKey(down("ArrowLeft"), base({ debugOpen: false, scene: "sort", sort, playLogBlocked: true })), false, "blocked SORT takes nothing");
  assert.equal(routeGameKey(down(" "), base({ debugOpen: false, scene: "dock", explore, sort })), false, "other scenes do not take explore/SORT keys");
  assert.deepEqual(calls, [
    "explore: :false:false",
    "explore:w:false:false",
    "explore:f:true:false",
    "explore:x:false:false",
    "up: ",
    "sort:ArrowLeft:false",
    "sort:ArrowUp:true",
  ]);
}

console.log("canvas-game-keys selftest: OK");
