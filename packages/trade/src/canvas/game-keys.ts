/**
 * Window keys for the canvas app: SORT arrows, and 探索 movement / fire
 * (CANVAS-X5). While the debug area is open the page owns the keyboard, so
 * these handlers do not run and do not preventDefault (Space scrolls).
 */
export type GameKeyInput = {
  type: "keydown" | "keyup";
  key: string;
  repeat: boolean;
  shiftKey: boolean;
  /** True when the event target is the start-screen name field. */
  targetIsNameField: boolean;
};

export type GameKeyScene = "start" | "dock" | "sort" | "restore" | "invade" | "explore";

export type GameKeyTargets = {
  /** Debug area under the canvas is open. */
  debugOpen: boolean;
  scene: GameKeyScene;
  playLogBlocked: boolean;
  sort: { key: (key: string, shift: boolean) => boolean } | null;
  explore: {
    keyDown: (key: string, repeat: boolean, shift: boolean) => boolean;
    keyUp: (key: string) => void;
  } | null;
};

/** True when the listener should preventDefault. */
export function routeGameKey(e: GameKeyInput, t: GameKeyTargets): boolean {
  if (t.debugOpen) return false;
  if (e.type === "keyup") {
    if (t.scene === "explore" && t.explore) t.explore.keyUp(e.key);
    return false;
  }
  let prevent = false;
  if (t.scene === "sort" && t.sort && !t.playLogBlocked && t.sort.key(e.key, e.shiftKey)) prevent = true;
  // 探索 keys are not taken while typing in the name field.
  if (t.scene === "explore" && t.explore && !e.targetIsNameField && t.explore.keyDown(e.key, e.repeat, e.shiftKey)) prevent = true;
  return prevent;
}
