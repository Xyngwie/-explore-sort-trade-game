/**
 * Entry used by the canvas edition (trade/canvas). Side-effect free: no DOM
 * listeners, no CSS. docs/CANVAS_UNIFIED_V0.md §10.
 */
export { RestoreScene, RESTORE_TAP_SLOP_PX, OUTCOME_COLOR, type RestoreHost } from "./canvas/restore-scene";
export { slowPerfectBoardSide, stripInboundSearchFromLocation } from "./session";
