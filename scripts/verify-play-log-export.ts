import fs from "node:fs";
import {
  replayPlayLog,
  canonical,
  playHash,
} from "../packages/shared/src/play-log";
const data = JSON.parse(fs.readFileSync(process.argv[2]!, "utf8"));
if (
  data.type !== "WRECKLINE_PLAY_LOG" ||
  data.format !== 1 ||
  data.entries.length !== data.range.to + 1
)
  throw new Error("export_range");
const restored = replayPlayLog(
  data.game.gameId,
  data.game.initial,
  data.entries,
  data.game.state,
);
if (
  playHash(restored) !== data.game.hash ||
  canonical(restored) !== canonical(data.game.state)
)
  throw new Error("snapshot_mismatch");
console.log(
  JSON.stringify({
    status: "PASS",
    records: data.entries.length,
    gameId: data.game.gameId,
    hash: data.game.hash,
  }),
);
