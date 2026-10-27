/** Recorded results, never command replay. This is local integrity checking, not authentication. */
export type LogJSON =
  | null
  | boolean
  | number
  | string
  | LogJSON[]
  | {
      [key: string]: LogJSON;
    };
export type PlayState = {
  files: Record<string, LogJSON>;
  sorties: Record<string, LogJSON>;
};
export type LogValue =
  | {
      exists: false;
    }
  | {
      exists: true;
      value: LogJSON;
    };
export type LogPatch = {
  path: string[];
  before: LogValue;
  after: LogValue;
};
export type PlayEntry = {
  format: 1;
  rules: string;
  build: string;
  gameId: string;
  seq: number;
  operationId: string;
  at: string;
  kind: string;
  module: string;
  context: LogJSON;
  beforeHash: string;
  afterHash: string;
  patch: LogPatch[];
  recordHash: string;
};
export type PlayGame = {
  format: 1;
  gameId: string;
  initial: PlayState;
  state: PlayState;
  seq: number;
  hash: string;
  resume: LogJSON;
  createdAt: string;
};
export type PlayDraft = {
  gameId: string;
  operationId: string;
  expectedSeq: number;
  beforeHash: string;
  state: PlayState;
  resume: LogJSON;
  entry: PlayEntry;
};
export function sealPlayEntry(entry: Omit<PlayEntry, "recordHash">): PlayEntry {
  return { ...entry, recordHash: playHash(entry) };
}
export function checkPlayEntry(entry: PlayEntry): void {
  const { recordHash, ...data } = entry;
  if (!recordHash || recordHash !== playHash(data))
    throw new Error("record_checksum");
}
export const PLAY_LOG_RULES = "hub-v3-play-log-v1";
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("non_finite");
    const s = JSON.stringify(value);
    if (s === undefined) throw new Error("invalid_json");
    return s;
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonical((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}
export function playHash(value: unknown): string {
  const s = canonical(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${s.length}:${(h >>> 0).toString(16)}`;
}
const object = (x: unknown): x is Record<string, LogJSON> =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const has = (x: object, k: string) =>
  Object.prototype.hasOwnProperty.call(x, k);
export function diffPlayState(before: PlayState, after: PlayState): LogPatch[] {
  const patches: LogPatch[] = [];
  function walk(a: LogValue, b: LogValue, path: string[]): void {
    if (canonical(a) === canonical(b)) return;
    if (a.exists && b.exists && object(a.value) && object(b.value)) {
      const av = a.value,
        bv = b.value;
      for (const k of new Set([...Object.keys(av), ...Object.keys(bv)]))
        walk(
          has(av, k) ? { exists: true, value: av[k]! } : { exists: false },
          has(bv, k) ? { exists: true, value: bv[k]! } : { exists: false },
          [...path, k],
        );
    } else patches.push({ path, before: a, after: b });
  }
  walk({ exists: true, value: before }, { exists: true, value: after }, []);
  return patches;
}
export function applyPlayPatches(
  state: PlayState,
  patches: LogPatch[],
): PlayState {
  const next = structuredClone(state),
    paths: string[][] = [];
  for (const p of patches) {
    if (
      !Array.isArray(p.path) ||
      !p.path.length ||
      p.path.some(
        (k) =>
          typeof k !== "string" ||
          ["__proto__", "constructor", "prototype"].includes(k),
      )
    )
      throw new Error("invalid_path");
    if (
      paths.some(
        (a) =>
          a.every((k, i) => p.path[i] === k) ||
          p.path.every((k, i) => a[i] === k),
      )
    )
      throw new Error("overlapping_patch");
    paths.push(p.path);
    let parent: Record<string, LogJSON> = next;
    for (const k of p.path.slice(0, -1)) {
      const v = parent[k];
      if (!object(v)) throw new Error("missing_parent");
      parent = v;
    }
    const k = p.path.at(-1)!,
      actual: LogValue = has(parent, k)
        ? { exists: true, value: parent[k]! }
        : { exists: false };
    if (canonical(actual) !== canonical(p.before))
      throw new Error("patch_precondition");
    if (p.after.exists) parent[k] = structuredClone(p.after.value);
    else delete parent[k];
  }
  return next;
}
export function replayPlayLog(
  gameId: string,
  initial: PlayState,
  entries: PlayEntry[],
  expected?: PlayState,
): PlayState {
  let state = structuredClone(initial);
  const ids = new Set<string>();
  for (let seq = 0; seq < entries.length; seq++) {
    const e = entries[seq]!;
    checkPlayEntry(e);
    if (
      typeof e.build !== "string" ||
      !e.build ||
      typeof e.kind !== "string" ||
      !e.kind ||
      typeof e.module !== "string" ||
      e.format !== 1 ||
      e.rules !== PLAY_LOG_RULES ||
      e.gameId !== gameId ||
      e.seq !== seq ||
      ids.has(e.operationId) ||
      !e.operationId
    )
      throw new Error("order_identity_or_version");
    ids.add(e.operationId);
    if (seq === 0 && (e.kind !== "game.start" || e.patch.length !== 0))
      throw new Error("missing_genesis");
    if (e.beforeHash !== playHash(state)) throw new Error("before_hash");
    state = applyPlayPatches(state, e.patch);
    if (e.afterHash !== playHash(state)) throw new Error("after_hash");
  }
  if (!entries.length) throw new Error("missing_genesis");
  if (expected && canonical(state) !== canonical(expected))
    throw new Error("snapshot_mismatch");
  return state;
}
export function makePlayDraft(
  game: PlayGame,
  state: PlayState,
  resume: LogJSON,
  meta: {
    kind: string;
    module: string;
    context: LogJSON;
    build: string;
  },
  operationId = crypto.randomUUID(),
): PlayDraft {
  const entry: PlayEntry = sealPlayEntry({
    format: 1,
    rules: PLAY_LOG_RULES,
    build: meta.build,
    gameId: game.gameId,
    seq: game.seq + 1,
    operationId,
    at: new Date().toISOString(),
    kind: meta.kind,
    module: meta.module,
    context: structuredClone(meta.context),
    beforeHash: game.hash,
    afterHash: playHash(state),
    patch: structuredClone(diffPlayState(game.state, state)),
  });
  return {
    gameId: game.gameId,
    operationId,
    expectedSeq: game.seq,
    beforeHash: game.hash,
    state: structuredClone(state),
    resume: structuredClone(resume),
    entry,
  };
}
