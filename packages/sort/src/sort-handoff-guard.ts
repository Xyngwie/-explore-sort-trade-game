const PENDING_KEY = "wreckline.pendingSortHandoff.v1";

type PendingHandoff = {
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

function armPendingHandoff(anchor: HTMLAnchorElement): void {
  const raw = anchor.href;
  if (!raw) return;
  let url: URL;
  try {
    url = new URL(raw, window.location.href);
  } catch {
    return;
  }
  if (
    !url.searchParams.has("yieldBag") &&
    !url.searchParams.has("importMaterials") &&
    !url.searchParams.has("depositUnopenedContainers")
  ) {
    return;
  }

  const handoffId = makeId();
  url.searchParams.set("handoffId", handoffId);
  anchor.href = url.toString();

  const pending: PendingHandoff = {
    href: url.toString(),
    createdAt: Date.now(),
  };
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Trade will reject the resource handoff if the token cannot be stored.
  }
}

document.addEventListener(
  "click",
  (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    armPendingHandoff(anchor);
  },
  true,
);
