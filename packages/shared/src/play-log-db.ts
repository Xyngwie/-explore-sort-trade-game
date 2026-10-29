import {
  applyPlayPatches,
  canonical,
  sealPlayEntry,
  checkPlayEntry,
  playHash,
  replayPlayLog,
  PLAY_LOG_RULES,
  type PlayGame,
  type PlayState,
  type PlayEntry,
  type PlayDraft,
} from "./play-log";
export const PLAY_LOG_DB = "wreckline.playLog.v1";
export function openPlayLogDB(
  factory: IDBFactory = indexedDB,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(PLAY_LOG_DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("games", { keyPath: "gameId" });
      db.createObjectStore("meta");
      const e = db.createObjectStore("entries", { keyPath: ["gameId", "seq"] });
      e.createIndex("operation", ["gameId", "operationId"], { unique: true });
      db.createObjectStore("pending", { keyPath: "gameId" });
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("database_blocked"));
  });
}
const safeAbort = (t: IDBTransaction) => {
  try {
    t.abort();
  } catch {
    /* transaction already aborted/finished */
  }
};
const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export const transactionDone = (t: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error ?? new Error("transaction_aborted"));
    t.onerror = () => {};
  });
export async function readPlayGame(
  db: IDBDatabase,
  id: string,
): Promise<PlayGame | null> {
  return (
    (await request(db.transaction("games").objectStore("games").get(id))) ??
    null
  );
}
export async function readPlayPending(
  db: IDBDatabase,
  id: string,
): Promise<PlayDraft | null> {
  return (
    (await request(db.transaction("pending").objectStore("pending").get(id))) ??
    null
  );
}
export async function createPlayGame(
  db: IDBDatabase,
  state: PlayState,
  build: string,
): Promise<PlayGame> {
  const gameId = crypto.randomUUID(),
    at = new Date().toISOString(),
    hash = playHash(state),
    g: PlayGame = {
      format: 1,
      gameId,
      initial: structuredClone(state),
      state: structuredClone(state),
      seq: 0,
      hash,
      resume: null,
      createdAt: at,
    };
  const genesis: PlayEntry = sealPlayEntry({
    format: 1,
    rules: PLAY_LOG_RULES,
    build,
    gameId,
    seq: 0,
    operationId: crypto.randomUUID(),
    at,
    kind: "game.start",
    module: "new-game",
    context: null,
    beforeHash: hash,
    afterHash: hash,
    patch: [],
  });
  const t = db.transaction(["games", "entries", "meta"], "readwrite"),
    done = transactionDone(t);
  try {
    t.objectStore("meta").put(gameId, "active");
    t.objectStore("games").add(g);
    t.objectStore("entries").add(genesis);
  } catch (e) {
    safeAbort(t);
    await done.catch(() => {});
    throw e;
  }
  await done;
  return g;
}
export async function stagePlayDraft(
  db: IDBDatabase,
  d: PlayDraft,
): Promise<void> {
  const t = db.transaction(["games", "pending", "meta"], "readwrite"),
    done = transactionDone(t);
  const s = t.objectStore("pending");
  let error: unknown;
  const active = t.objectStore("meta").get("active");
  const current = t.objectStore("games").get(d.gameId);
  current.onsuccess = () => {
    if (active.result !== d.gameId) {
      error = new Error("game_changed");
      safeAbort(t);
      return;
    }
    const g = current.result as PlayGame | undefined;
    if (!g || g.seq !== d.expectedSeq || g.hash !== d.beforeHash) {
      error = new Error("write_conflict");
      safeAbort(t);
      return;
    }
    const r = s.get(d.gameId);
    r.onsuccess = () => {
      try {
        if (r.result && r.result.operationId !== d.operationId)
          throw new Error("pending_operation_conflict");
        if (r.result && canonical(r.result) !== canonical(d))
          throw new Error("operation_id_mismatch");
        s.put(d);
      } catch (e) {
        error = e;
        safeAbort(t);
      }
    };
  };
  try {
    await done;
  } catch (e) {
    throw error ?? e;
  }
}
export async function commitPlayDraft(
  db: IDBDatabase,
  d: PlayDraft,
): Promise<PlayGame> {
  const t = db.transaction(
      ["games", "entries", "pending", "meta"],
      "readwrite",
    ),
    done = transactionDone(t);
  let result: PlayGame | undefined, error: unknown;
  const active = t.objectStore("meta").get("active");
  const pending = t.objectStore("pending").get(d.gameId);
  const r = t.objectStore("games").get(d.gameId);
  r.onsuccess = () => {
    if (active.result !== d.gameId) {
      error = new Error("game_changed");
      safeAbort(t);
      return;
    }
    const g = r.result as PlayGame | undefined;
    if (!g) {
      error = new Error("missing_game");
      safeAbort(t);
      return;
    }
    const previous = t
      .objectStore("entries")
      .index("operation")
      .get([d.gameId, d.operationId]);
    previous.onsuccess = () => {
      if (previous.result) {
        if (canonical(previous.result) !== canonical(d.entry)) {
          error = new Error("operation_id_mismatch");
          safeAbort(t);
        } else {
          // An acknowledged or lost-ack retry is read-only. The original commit
          // removed its own pending atomically; another tab may now own this slot.
          result = g;
        }
        return;
      }
      try {
        if (
          g.seq !== d.expectedSeq ||
          g.hash !== d.beforeHash ||
          !Number.isSafeInteger(d.entry.seq) ||
          d.entry.seq !== g.seq + 1 ||
          d.entry.operationId !== d.operationId ||
          d.entry.gameId !== g.gameId
        )
          throw new Error("write_conflict");
        if (!pending.result || canonical(pending.result) !== canonical(d))
          throw new Error("unprepared_operation");
        // Check patches, including the exact prior state, inside the atomic transaction.
        const after = validateDraft(g, d);
        result = {
          ...g,
          state: after,
          seq: d.entry.seq,
          hash: d.entry.afterHash,
          resume: d.resume,
        };
        t.objectStore("entries").add(d.entry);
        t.objectStore("games").put(result);
        t.objectStore("pending").delete(d.gameId);
      } catch (e) {
        error = e;
        safeAbort(t);
      }
    };
  };
  try {
    await done;
  } catch (e) {
    throw error ?? e;
  }
  return result!;
}
function validateDraft(g: PlayGame, d: PlayDraft): PlayState {
  checkPlayEntry(d.entry);
  if (g.hash !== playHash(g.state)) throw new Error("prior_snapshot_hash");
  const state = applyPlayPatches(g.state, d.entry.patch);
  if (
    d.entry.beforeHash !== g.hash ||
    d.entry.rules !== PLAY_LOG_RULES ||
    d.entry.format !== 1 ||
    playHash(state) !== d.entry.afterHash ||
    canonical(state) !== canonical(d.state)
  )
    throw new Error("invalid_candidate");
  return state;
}
export async function exportPlayGame(
  db: IDBDatabase,
  id: string,
): Promise<{
  type: "WRECKLINE_PLAY_LOG";
  format: 1;
  exportedAt: string;
  game: PlayGame;
  entries: PlayEntry[];
  range: {
    from: 0;
    to: number;
  };
  verified: true;
}> {
  const t = db.transaction(["games", "entries"], "readonly"),
    done = transactionDone(t);
  const gr = request<PlayGame>(t.objectStore("games").get(id)),
    er = request<PlayEntry[]>(
      t
        .objectStore("entries")
        .getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])),
    );
  const [game, entries] = await Promise.all([gr, er]);
  await done;
  if (
    !game ||
    game.format !== 1 ||
    game.gameId !== id ||
    !Number.isSafeInteger(game.seq) ||
    game.seq < 0 ||
    entries.length !== game.seq + 1
  )
    throw new Error("missing_history_or_version");
  replayPlayLog(id, game.initial, entries, game.state);
  if (playHash(game.state) !== game.hash) throw new Error("snapshot_hash");
  return {
    type: "WRECKLINE_PLAY_LOG",
    format: 1,
    exportedAt: new Date().toISOString(),
    game,
    entries,
    range: { from: 0, to: game.seq },
    verified: true,
  };
}
export async function activePlayGameId(
  db: IDBDatabase,
): Promise<string | null> {
  return (
    (await request(db.transaction("meta").objectStore("meta").get("active"))) ??
    null
  );
}
/** Archived games are retained and can still be exported after starting another game. */
export async function listPlayGames(db: IDBDatabase): Promise<
  Array<{
    gameId: string;
    createdAt: string;
    seq: number;
  }>
> {
  const t = db.transaction("games"),
    done = transactionDone(t),
    out: Array<{
      gameId: string;
      createdAt: string;
      seq: number;
    }> = [];
  const r = t.objectStore("games").openCursor();
  r.onsuccess = () => {
    const c = r.result;
    if (!c) return;
    const g = c.value as PlayGame;
    out.push({ gameId: g.gameId, createdAt: g.createdAt, seq: g.seq });
    c.continue();
  };
  await done;
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
