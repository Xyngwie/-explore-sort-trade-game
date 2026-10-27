import { bootPlayLog } from "../packages/shared/src/play-log-browser";
void bootPlayLog(() => import("./play-log-harness-app"));
