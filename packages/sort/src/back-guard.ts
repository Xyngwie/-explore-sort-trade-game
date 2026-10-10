/**
 * Sort swallows browser back until the sortie done mark exists.
 * Back does not write 全機大破.
 */
import { SORT_BACK_TRAP, pushHistoryTrap, sortBackAction } from "@estg/shared";

export { SORT_BACK_TRAP, sortBackAction };

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function sortPopstateAction(
  storage?: Store | null,
): ReturnType<typeof sortBackAction> {
  return sortBackAction(storage);
}

export function armSortBackTrap(
  historyLike: Pick<History, "state" | "pushState">,
  href: string,
  storage?: Store | null,
): boolean {
  if (!sortPopstateAction(storage).block) return false;
  return pushHistoryTrap(historyLike, SORT_BACK_TRAP, href);
}
