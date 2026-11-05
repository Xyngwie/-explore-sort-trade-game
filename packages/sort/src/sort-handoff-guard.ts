import { armSortHandoffHref } from "./handoff-core";

function armPendingHandoff(anchor: HTMLAnchorElement): void {
  const raw = anchor.href;
  if (!raw) return;
  const armed = armSortHandoffHref(raw, window.location.href);
  if (armed !== raw) anchor.href = armed;
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

export {};
