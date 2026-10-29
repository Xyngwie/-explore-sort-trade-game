import assert from "node:assert/strict";
import {
  canonical,
  sealPlayEntry,
  playHash,
  makePlayDraft,
  replayPlayLog,
  applyPlayPatches,
  PLAY_LOG_RULES,
  type PlayState,
  type PlayEntry,
  type PlayGame,
} from "./play-log";
// Reject values whose JSON export cannot preserve their canonical representation.
for (const invalid of [new Array(2), [1, , 3], new Date(), new Map(), new Set()])
  assert.throws(() => canonical(invalid), /invalid_json/);
for (const valid of [[], [null, 1, { hp: 12.5 }], Object.create(null)])
  assert.equal(canonical(JSON.parse(JSON.stringify(valid))), canonical(valid));
const initial: PlayState = {
  files: {
    "local:hub": {
      credits: 500,
      inventory: { armor: 10 },
      fleet: [
        {
          instanceId: "a",
          learning: { cell: { value: 2 } },
          circuitIds: ["c"],
        },
      ],
      circuits: [{ circuitId: "c", state: "Offline" }],
      fieldCells: [],
    },
  },
  sorties: {},
};
const hash = playHash(initial),
  genesis: PlayEntry = sealPlayEntry({
    format: 1,
    rules: PLAY_LOG_RULES,
    build: "test",
    gameId: "game",
    seq: 0,
    operationId: "initial",
    at: "now",
    kind: "game.start",
    module: "trade",
    context: null,
    beforeHash: hash,
    afterHash: hash,
    patch: [],
  });
let game: PlayGame = {
  format: 1,
  gameId: "game",
  initial,
  state: initial,
  seq: 0,
  hash,
  resume: null,
  createdAt: "now",
};
const entries = [genesis];
for (const [kind, change] of [
  [
    "trade.buy",
    (s: PlayState) => {
      s.files["local:hub"] = {
        credits: 400,
        inventory: { armor: 10, power: 4 },
        fleet: [
          {
            instanceId: "a",
            learning: { cell: { value: 2 } },
            circuitIds: ["c"],
          },
        ],
        circuits: [{ circuitId: "c", state: "Offline" }],
        fieldCells: [],
      };
    },
  ],
  [
    "restore.complete",
    (s: PlayState) => {
      (s.files["local:hub"] as Record<string, unknown>).circuits = [
        { circuitId: "c", state: "Online", randomClues: [0, 1, 3] },
      ];
    },
  ],
  [
    "sortie.settlement",
    (s: PlayState) => {
      (s.files["local:hub"] as Record<string, unknown>).fleet = [
        {
          instanceId: "a",
          learning: { cell: { value: 7 } },
          circuitIds: ["c"],
        },
      ];
      (s.files["local:hub"] as Record<string, unknown>).fieldCells = [
        { id: "cell", shield: { id: "shield", hp: 87.5 } },
      ];
      s.sorties.nonce = {
        start: { mechs: ["a"] },
        settlement: { sortieId: "return" },
      };
    },
  ],
] as const) {
  const state = structuredClone(game.state);
  change(state);
  const d = makePlayDraft(
    game,
    state,
    null,
    {
      kind,
      module: "test",
      context: { randomResult: "already-recorded" },
      build: "test",
    },
    kind,
  );
  entries.push(d.entry);
  game = { ...game, state, seq: d.entry.seq, hash: d.entry.afterHash };
}
assert.equal(
  canonical(replayPlayLog("game", initial, entries, game.state)),
  canonical(game.state),
);
for (const corrupt of [
  entries.slice(1),
  [entries[0]!, entries[2]!, entries[1]!, entries[3]!],
  [...entries, entries[3]!],
  entries.slice(0, -1),
])
  assert.throws(() => replayPlayLog("game", initial, corrupt, game.state));
const altered = structuredClone(entries);
altered[2]!.patch[0]!.before = { exists: true, value: "wrong" };
assert.throws(() => replayPlayLog("game", initial, altered, game.state));
const duplicate = structuredClone(entries);
duplicate[2]!.operationId = duplicate[1]!.operationId;
assert.throws(() => replayPlayLog("game", initial, duplicate));
const metadata = structuredClone(entries);
metadata[1]!.kind = "changed";
assert.throws(() => replayPlayLog("game", initial, metadata));
const wrong = structuredClone(entries);
wrong[1]!.gameId = "another";
assert.throws(() => replayPlayLog("game", initial, wrong));
assert.throws(() =>
  applyPlayPatches(initial, [
    {
      path: ["__proto__"],
      before: { exists: false },
      after: { exists: true, value: {} },
    },
  ]),
);
const before = performance.now();
let cursor = structuredClone(initial);
const many = [genesis];
let h = hash;
for (let seq = 1; seq <= 10000; seq++) {
  const after = structuredClone(cursor);
  (after.files["local:hub"] as Record<string, unknown>).credits = seq;
  const d = makePlayDraft(
    { ...game, state: cursor, seq: seq - 1, hash: h },
    after,
    null,
    { kind: "benchmark", module: "test", context: null, build: "test" },
    String(seq),
  );
  many.push(d.entry);
  cursor = after;
  h = d.entry.afterHash;
}
const generatedMs = performance.now() - before,
  t = performance.now();
assert.equal(
  canonical(replayPlayLog("game", initial, many, cursor)),
  canonical(cursor),
);
console.log(
  JSON.stringify({
    test: "play-log pure replay",
    status: "PASS",
    records: many.length,
    generatedMs: Math.round(generatedMs),
    replayMs: Math.round(performance.now() - t),
    bytes: JSON.stringify(many).length,
  }),
);
