/**
 * Entry of the canvas edition (stage 1). The existing DOCK (`index.html` /
 * `boot.ts`) stays unchanged for comparison. Same play-log boot as the
 * existing modules: storage is wrapped before the app reads anything.
 */
import { bootPlayLog } from "@estg/shared";

void bootPlayLog(async () => {
  const { mountCanvasApp } = await import("./app");
  mountCanvasApp();
});
