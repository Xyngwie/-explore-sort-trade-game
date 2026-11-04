/**
 * Bottom tabs on canvas (docs/CANVAS_UNIFIED_V0.md §4). Same enable rules as
 * the existing shell (`computeShellModel`: Q11 onboarding = DOCK only, no save
 * = DOCK only). SORT = this DOCK's 未開封 section (§5-1). The other tabs open the
 * existing module pages until those modules are ported (CANVAS-U2).
 */
import { computeShellModel, resolveModuleBaseUrl, type HubSnapshot, type ShellTabState } from "@estg/shared";

export type DockTab = ShellTabState;
export function dockTabs(hub: HubSnapshot | null): DockTab[] {
  return computeShellModel({ current: "trade", hub, handoffInProgress: false }).tabs;
}
/** Where a non-DOCK, non-SORT tab goes for now (the existing page of that module). */
export function tabUrl(tab: DockTab): string {
  return resolveModuleBaseUrl(tab.module);
}
