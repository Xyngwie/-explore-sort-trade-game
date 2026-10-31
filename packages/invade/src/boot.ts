import {
  bootPlayLog,
  mountFullscreenShell,
  DEBUG_FIXTURE_ACTIVE,
  loadHubSaveFromLocalStorage,
  playLogNavigate,
  resolveModuleBaseUrl,
} from "@estg/shared";
void bootPlayLog(async () => {
  // Do not let an orphaned inbound URL bootstrap the old demo wallet/fleet.
  if (!DEBUG_FIXTURE_ACTIVE && !loadHubSaveFromLocalStorage()?.hub) {
    playLogNavigate(resolveModuleBaseUrl("trade"), true);
    return;
  }
  mountFullscreenShell("invade");
  await import("./main");
});
