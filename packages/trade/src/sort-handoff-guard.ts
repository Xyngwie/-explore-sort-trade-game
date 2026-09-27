const PENDING_KEY = "wreckline.pendingSortHandoff.v1";
const MAX_AGE_MS = 30 * 60 * 1000;

function hasResourceGrant(search: string): boolean {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return (
    p.has("yieldBag") ||
    p.has("importMaterials") ||
    p.has("depositUnopenedContainers")
  );
}

/**
 * Verify that a Sort→HUB resource handoff was actually issued by the Sort UI.
 * The token is single-use, so browser-back / refresh / URL replay cannot grant
 * the same YieldBag or unopened containers twice.
 */
export function validateAndConsumeSortHandoff(search: string): boolean {
  if (!hasResourceGrant(search)) return true;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const handoffId = params.get("handoffId")?.trim();
  if (!handoffId) return false;

  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return false;
    const pending = JSON.parse(raw) as { href?: unknown; createdAt?: unknown };
    if (typeof pending.href !== "string" || typeof pending.createdAt !== "number") {
      localStorage.removeItem(PENDING_KEY);
      return false;
    }
    if (Date.now() - pending.createdAt > MAX_AGE_MS) {
      localStorage.removeItem(PENDING_KEY);
      return false;
    }

    const expected = new URL(pending.href, window.location.href);
    const actual = new URL(window.location.href);
    if (expected.href !== actual.href || expected.searchParams.get("handoffId") !== handoffId) {
      return false;
    }

    localStorage.removeItem(PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}
