/**
 * Sort→HUB resource-handoff token (#332), shared by the existing Sort page
 * (sort-handoff-guard.ts) and the canvas edition. No DOM side effects.
 */
export const PENDING_SORT_HANDOFF_KEY = "wreckline.pendingSortHandoff.v1";

export type PendingHandoff = {
  href: string;
  createdAt: number;
};

function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the compatibility generator.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** True when a Sort→HUB URL grants resources (and so needs a single-use token). */
export function sortHandoffNeedsToken(url: URL): boolean {
  return (
    url.searchParams.has("introResultId") || url.searchParams.has("introCancelId") || url.searchParams.has("yieldBag") ||
    url.searchParams.has("depositUnopenedContainers")
  );
}

/**
 * Add a fresh `handoffId` to a resource-granting Sort→HUB URL and store it as
 * the pending token. Returns the URL to open (unchanged when no token is needed
 * or the URL cannot be parsed).
 */
export function armSortHandoffHref(
  raw: string,
  base: string,
  storage: Pick<Storage, "setItem"> | null = typeof localStorage !== "undefined" ? localStorage : null,
): string {
  if (!raw) return raw;
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return raw;
  }
  if (!sortHandoffNeedsToken(url)) return raw;
  const handoffId = makeId();
  url.searchParams.set("handoffId", handoffId);
  const pending: PendingHandoff = {
    href: url.toString(),
    createdAt: Date.now(),
  };
  try {
    storage?.setItem(PENDING_SORT_HANDOFF_KEY, JSON.stringify(pending));
  } catch {
    // Trade will reject the resource handoff if the token cannot be stored.
  }
  return url.toString();
}
