import { validateAndConsumeSortHandoff } from "./sort-handoff-guard";

const RESOURCE_KEYS = [
  "yieldBag",
  "importMaterials",
  "depositUnopenedContainers",
];

const search = window.location.search;
const hasResourceGrant = RESOURCE_KEYS.some((key) =>
  new URLSearchParams(search).has(key),
);

if (hasResourceGrant && !validateAndConsumeSortHandoff(search)) {
  const url = new URL(window.location.href);
  for (const key of RESOURCE_KEYS) url.searchParams.delete(key);
  url.searchParams.delete("handoffId");
  window.history.replaceState({}, "", url.toString());
}
