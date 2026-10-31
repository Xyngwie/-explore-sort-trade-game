// This is the first HTML entry: isolate storage before validating any return token.
import "@estg/shared";
import { validateAndConsumeSortHandoff } from "./sort-handoff-guard";

const RESOURCE_KEYS = [
  "yieldBag",
  "introResultId",
  "introCancelId",
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
