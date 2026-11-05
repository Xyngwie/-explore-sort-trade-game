/**
 * Entry used by the canvas edition (trade/canvas). Side-effect free: no DOM
 * listeners, no CSS. docs/CANVAS_UNIFIED_V0.md §9.
 */
export { SortScene, SORT_SESSION_KEY, SORT_MAX_CELL_PX, layoutSort, PIECE_STYLE, type SortHost, type SortLayout } from "./canvas/sort-scene";
export { armSortHandoffHref, PENDING_SORT_HANDOFF_KEY, sortHandoffNeedsToken } from "./handoff-core";
export { addContainersToQuery, isExploreHandoffQuery, readHubUnopenedContainers, spendHubContainers } from "./hub-container-core";
export { armSortBackTrap, sortPopstateAction } from "./back-guard";
export { SORT_V0_RULES } from "./refine";
