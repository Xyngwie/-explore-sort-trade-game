import {
  bootPlayLog,
  DEBUG_FIXTURE_ACTIVE,
  loadHubSaveFromLocalStorage,
  readSortieCheckpoint,
  playLogNavigate,
  resolveModuleBaseUrl,
} from "@estg/shared";
void bootPlayLog(async () => {
  // A query is not ownership. Preserve an existing checkpoint and explicit
  // fixtures, but never start URL-supplied demo units as a fresh normal game.
  if (
    !DEBUG_FIXTURE_ACTIVE &&
    !loadHubSaveFromLocalStorage()?.hub &&
    readSortieCheckpoint().status === "absent"
  ) {
    playLogNavigate(resolveModuleBaseUrl("trade"), true);
    return;
  }
  await import("./main");
});
