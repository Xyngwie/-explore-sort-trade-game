import {createNewGameHub} from "./hub-save";
import {
  createHubSave,
  serializeHubSave,
} from "./hub-save";
import {
  HANDOFF_QUERY_KEYS,
  HUB_SAVE_STORAGE_KEY,
  HUB_SAVE_LEGACY_STORAGE_KEY,
  resolveModuleBaseUrl,
} from "./constants";
import {
  canonical,
  makePlayDraft,
  type PlayState,
  type PlayGame,
  type PlayDraft,
  type LogJSON,
} from "./play-log";
import {
  openPlayLogDB,
  activePlayGameId,
  readPlayGame,
  readPlayPending,
  createPlayGame,
  stagePlayDraft,
  commitPlayDraft,
  exportPlayGame,
  listPlayGames,
} from "./play-log-db";
import { installPlayLogHooks } from "./play-log-hooks";
declare const __GAME_VERSION__: string;
const build =
  typeof __GAME_VERSION__ === "undefined" ? "development" : __GAME_VERSION__;
const TAB_KEY = "wreckline.playLog.tab.v1";
const MARKER = "wreckline.playLog.active.v1",
  JOURNAL = "wreckline.playLog.pending.v1",
  CHECKPOINT = "estg.sortieCheckpoint";
const clone = <T>(v: T): T => structuredClone(v);
const parse = (v: string): LogJSON => {
  try {
    const x = JSON.parse(v) as LogJSON;
    return typeof x === "string" ? v : x;
  } catch {
    return v;
  }
};
const encode = (v: LogJSON): string =>
  typeof v === "string" ? v : JSON.stringify(v);
const tracked = (key: string) =>
  !key.startsWith("wreckline.playLog.") &&
  !key.startsWith("wreckline.DEBUG_FIXTURE.") &&
  !["wreckline.craftSignature.v0", "wreckline.lastSortYieldTotal.v0"].includes(
    key,
  ) &&
  (key.startsWith("wreckline.") ||
    key.startsWith("estg.restore.edges.v1:") ||
    key === "estg.explore.friendly-fire-history.v1");
const protocol = (key: string) =>
  key.startsWith("wreckline.pending") || key.endsWith("forcedHandoffIntent");
/** Install before importing an app: synchronous reducers stage candidates; only IDB commits are authoritative. */
export async function bootPlayLog(
  start: () => Promise<unknown>,
): Promise<void> {
  if (new URLSearchParams(location.search).get("debug_fixture") === "shield") {
    await start();
    return;
  }
  let native: Storage, session: Storage;
  try {
    native = window.localStorage;
    session = window.sessionStorage;
  } catch {
    const app = document.querySelector("#app") ?? document.body;
    const p = document.createElement("p");
    p.role = "alert";
    p.textContent =
      "記録を保存できません。ブラウザーの保存領域へアクセスできません。";
    const retry = document.createElement("button");
    retry.textContent = "再読込して再試行";
    retry.style.minHeight = "44px";
    retry.style.margin = "4px";
    retry.onclick = () => location.reload();
    app.append(p, retry);
    return;
  }
  let db: IDBDatabase | null = null,
    game: PlayGame | null = null,
    working: PlayState | null = null,
    resume: LogJSON = null,
    draft: PlayDraft | null = null;
  let leavingCommitted = false;
  let tabId = "";
  let loading = true,
    dirty = false,
    flushing = false,
    queued = false,
    failed = false,
    overlay: HTMLDivElement | null = null,
    provider: (() => LogJSON) | null = null;
  let destination: {
      url: string;
      replace: boolean;
    } | null = null,
    operation = "module.boot",
    context: LogJSON = null;
  const scratch = new Map<string, string>();
  let hints: Array<{
    kind: string;
    context: LogJSON;
  }> = [];
  const panel = document.createElement("details");
  panel.id = "play-log-panel";
  panel.style.cssText =
    "position:relative;z-index:9000;margin:8px;padding:8px;border:1px solid #586069;background:#161b22;color:#eee;font:14px sans-serif;max-width:100%;box-sizing:border-box";
  panel.innerHTML =
    '<summary>プレイ記録</summary><p id="play-log-status"></p><label>書出し対象 <select id="play-log-game" style="max-width:100%"></select></label> <button id="play-log-export">JSONを書き出す</button> <button id="play-log-new">新規ゲーム（ログ記録）</button><p id="play-log-notice" role="status"></p>';
  panel.querySelectorAll<HTMLElement>("button,select").forEach((el) => {
    el.style.minHeight = "44px";
    el.style.maxWidth = "100%";
  });
  panel.querySelectorAll<HTMLElement>("p").forEach((el) => {
    el.style.whiteSpace = "normal";
    el.style.overflowWrap = "anywhere";
  });
  const fitRecordingUI = () => {
    const viewport = window.visualViewport,
      width = viewport?.width ?? innerWidth,
      height = viewport?.height ?? innerHeight;
    panel.style.width = `${Math.max(0, width - 16)}px`;
    if (overlay) {
      overlay.style.left = `${viewport?.offsetLeft ?? 0}px`;
      overlay.style.top = `${viewport?.offsetTop ?? 0}px`;
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
      overlay.style.overflow = "auto";
    }
  };
  fitRecordingUI();
  window.addEventListener("resize", fitRecordingUI);
  window.visualViewport?.addEventListener("resize", fitRecordingUI);
  window.visualViewport?.addEventListener("scroll", fitRecordingUI);
  const go = (url: string, replace = false) => {
    leavingCommitted = true;
    if (replace) location.replace(url);
    else location.assign(url);
  };
  const reload = () => {
    leavingCommitted = true;
    location.reload();
  };
  const mount = () => {
    if (!panel.isConnected) document.body.prepend(panel);
  };
  const status = () => {
    mount();
    panel.querySelector("#play-log-status")!.textContent = game
      ? `記録中 · ${game.gameId} · 初期状態＋確定${game.seq}件`
      : "既存セーブ：途中からの記録は行いません。新規ゲームから記録できます。";
    (panel.querySelector("#play-log-export") as HTMLButtonElement).disabled =
      !game;
  };
  async function downloadHistory(id: string): Promise<number> {
    if (!db) throw new Error("indexeddb_unavailable");
    const data = await exportPlayGame(db, id);
    const anchor = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
    anchor.href = url;
    anchor.download = `wreckline-play-${data.game.gameId}-${data.range.to}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return data.range.to;
  }
  const block = (message: string, error = false) => {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "play-log-blocker";
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;background:#0b1019;display:flex;align-items:center;justify-content:center;padding:20px;color:#eee;font:16px sans-serif;box-sizing:border-box";
      document.body.append(overlay);
    }
    overlay.replaceChildren();
    const box = document.createElement("div");
    box.style.cssText =
      "width:100%;max-width:480px;min-width:0;max-height:100%;overflow-y:auto;overflow-wrap:anywhere;white-space:normal;word-break:break-word";
    const p = document.createElement("p");
    p.role = "alert";
    p.style.cssText = "white-space:normal;max-width:100%;line-height:1.5";
    p.textContent = message;
    box.append(p);
    if (error) {
      const retry = document.createElement("button");
      retry.id = "play-log-retry";
      retry.textContent = "同じ結果を再試行";
      retry.style.minHeight = "44px";
      retry.style.margin = "4px";
      retry.onclick = () => {
        void retrySave();
      };
      box.append(retry);
      if (game) {
        const output = document.createElement("button");
        output.id = "play-log-failure-export";
        output.textContent = "確定済み履歴を書き出す";
        output.style.minHeight = "44px";
        output.style.margin = "4px";
        output.onclick = () => {
          void downloadHistory(game!.gameId)
            .then((n) => {
              p.textContent =
                message +
                ` 確定${n}件までを書き出しました。履歴は保持しています。`;
            })
            .catch((e) => {
              p.textContent = message + ` 書き出せません：${String(e)}`;
            });
        };
        box.append(output);
      }

      if (
        (message.includes("write_conflict") ||
          message.includes("game_changed")) &&
        draft
      ) {
        const restoreButton = document.createElement("button");
        restoreButton.id = "play-log-conflict-reload";
        restoreButton.textContent = "未確定候補を保持して最新の確定状態へ";
        restoreButton.style.minHeight = "44px";
        restoreButton.style.margin = "4px";
        restoreButton.onclick = () => {
          try {
            native.setItem(
              `${JOURNAL}:${draft!.gameId}:${draft!.operationId}`,
              JSON.stringify({
                draft,
                destination,
                archived: true,
                reason: message,
              }),
            );
            session.removeItem(JOURNAL);
            reload();
          } catch {
            block(
              "記録を保存できません。競合候補の保持にも失敗したため、この画面で再試行してください。",
              true,
            );
          }
        };
        box.append(restoreButton);
      }
      const note = document.createElement("p");
      note.style.cssText =
        "white-space:normal;max-width:100%;line-height:1.5;overflow-wrap:anywhere";
      note.textContent = "取引は未確定です。再抽選・追加の支払いは行いません。";
      box.append(note);
    }
    overlay.append(box);
    fitRecordingUI();
    const app = document.querySelector<HTMLElement>("#app");
    if (app) app.inert = true;
    if (error) overlay.querySelector<HTMLButtonElement>("button")?.focus();
  };
  const unblock = () => {
    overlay?.remove();
    overlay = null;
    const app = document.querySelector<HTMLElement>("#app");
    if (app) app.inert = false;
  };
  const notice = (s: string) => {
    panel.querySelector("#play-log-notice")!.textContent = s;
  };
  function cache(): void {
    if (!game) return;
    try {
      for (let i = native.length - 1; i >= 0; i--) {
        const k = native.key(i)!;
        if (tracked(k) && !Object.hasOwn(game.state.files, "local:" + k))
          native.removeItem(k);
      }
      for (let i = session.length - 1; i >= 0; i--) {
        const k = session.key(i)!;
        if (
          protocol(k) &&
          !Object.hasOwn(game.state.files, `session:${tabId}:` + k)
        )
          session.removeItem(k);
      }
      for (const [key, value] of Object.entries(game.state.files)) {
        if (key.startsWith("local:"))
          native.setItem(key.slice(6), encode(value));
        else if (key.startsWith(`session:${tabId}:`))
          session.setItem(key.slice(`session:${tabId}:`.length), encode(value));
      }
      if (game.resume !== null)
        native.setItem(CHECKPOINT, JSON.stringify(game.resume));
      else native.removeItem(CHECKPOINT);
      native.setItem(MARKER, game.gameId);
    } catch {
      notice(
        "記録はIndexedDBへ保存済みです。互換キャッシュの更新に失敗しました。次回は記録から復旧します。",
      );
    }
  }
  function rawJournal(d: PlayDraft): void {
    const text = JSON.stringify({ draft: d, destination });
    let stored = false;
    try {
      native.setItem(`${JOURNAL}:${d.gameId}:${d.operationId}`, text);
      stored = true;
    } catch {
      /* session is a second recovery path */
    }
    try {
      session.setItem(JOURNAL, text);
      stored = true;
    } catch {
      /* persistent journal may still be available */
    }
    if (!stored)
      throw new Error("結果候補を保持できません。再読込せず再試行してください");
  }
  function clearJournal(d: PlayDraft): void {
    try {
      native.removeItem(`${JOURNAL}:${d.gameId}:${d.operationId}`);
      session.removeItem(JOURNAL);
    } catch {
      /* a completed candidate is idempotent on reload */
    }
  }
  function schedule(): void {
    if (loading || queued || flushing) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      void flush();
    }, 0);
  }
  function changed(): void {
    if (!game) return;
    if (flushing || failed) throw new Error("play_log_pending");
    dirty = true;
    block("記録を保存しています…");
    schedule();
  }
  function facade(base: Storage, scope: "local" | "session"): Storage {
    const namespace = scope === "local" ? "local:" : `session:${tabId}:`;
    const managed = (k: string) =>
      scope === "local" ? tracked(k) : protocol(k);
    const keys = () => {
      const set = new Set(
        Array.from({ length: base.length }, (_, i) => base.key(i)!),
      );
      if (working) {
        for (const k of [...set])
          if (managed(k) && !Object.hasOwn(working.files, namespace + k))
            set.delete(k);
        for (const k of Object.keys(working.files))
          if (k.startsWith(namespace)) set.add(k.slice(namespace.length));
      }
      if (scope === "local" && resume !== null) set.add(CHECKPOINT);
      return [...set];
    };
    const api = {
      get length() {
        return keys().length;
      },
      key: (i: number) => keys()[i] ?? null,
      getItem(k: string) {
        if (scope === "local" && k === CHECKPOINT + ".tmp" && game)
          return scratch.get(k) ?? null;
        if (scope === "local" && k === CHECKPOINT && game)
          return resume === null ? null : JSON.stringify(resume);
        if (managed(k) && working) {
          const v = working.files[namespace + k];
          return v === undefined ? null : encode(v);
        }
        return base.getItem(k);
      },
      setItem(k: string, v: string) {
        if (
          leavingCommitted &&
          (managed(k) || k === CHECKPOINT || k === CHECKPOINT + ".tmp")
        )
          return;
        if (scope === "local" && k === CHECKPOINT && game) {
          const next = parse(String(v));
          if (canonical(next) === canonical(resume)) return;
          if (flushing || failed) throw new Error("play_log_pending");
          resume = next;
          changed();
          return;
        }
        if (scope === "local" && k === CHECKPOINT + ".tmp" && game) {
          scratch.set(k, String(v));
          return;
        }
        if (managed(k) && working) {
          changed();
          working.files[namespace + k] = parse(String(v));
          return;
        }
        base.setItem(k, String(v));
      },
      removeItem(k: string) {
        if (
          leavingCommitted &&
          (managed(k) || k === CHECKPOINT || k === CHECKPOINT + ".tmp")
        )
          return;
        if (scope === "local" && k === CHECKPOINT && game) {
          changed();
          resume = null;
          return;
        }
        if (scope === "local" && k === CHECKPOINT + ".tmp" && game) {
          scratch.delete(k);
          return;
        }
        if (managed(k) && working) {
          changed();
          delete working.files[namespace + k];
          return;
        }
        base.removeItem(k);
      },
      clear() {
        if (game) throw new Error("logged_storage_clear_requires_new_game");
        base.clear();
      },
    };
    return new Proxy(api as Storage, {
      get(t, k, r) {
        return typeof k !== "string" || k in t
          ? Reflect.get(t, k, r)
          : (t.getItem(k) ?? undefined);
      },
      set(t, k, v) {
        if (typeof k !== "string" || k in t) return false;
        t.setItem(k, String(v));
        return true;
      },
      ownKeys: () => keys(),
      getOwnPropertyDescriptor: (_t, k) =>
        typeof k === "string" && keys().includes(k)
          ? {
              configurable: true,
              enumerable: true,
              writable: true,
              value: api.getItem(k),
            }
          : undefined,
    });
  }
  function navigate(url: string, replace = false): void {
    if (
      game &&
      provider &&
      !dirty &&
      !flushing &&
      !failed &&
      !(
        resume &&
        typeof resume === "object" &&
        !Array.isArray(resume) &&
        resume.kind === "done"
      )
    ) {
      const latest = provider();
      if (latest && canonical(latest) !== canonical(resume)) {
        changed();
        resume = latest;
        operation = "sortie.checkpoint";
      }
    }
    if (dirty || flushing || failed) {
      destination = { url, replace };
      if (draft) rawJournal(draft);
      schedule();
    } else go(url, replace);
  }
  function makeCandidate(): PlayDraft {
    if (!game || !working) throw new Error("no_game");
    if (
      provider &&
      !(
        resume &&
        typeof resume === "object" &&
        !Array.isArray(resume) &&
        resume.kind === "done"
      )
    )
      resume = provider();
    return makePlayDraft(game, working, resume, {
      kind: operation,
      module: location.pathname,
      context: {
        input: context,
        tabId,
        navigation: destination,
        operations: hints,
        route: (() => {
          const query: Record<string, string> = {};
          new URLSearchParams(location.search).forEach(
            (v, k) => (query[k] = v),
          );
          return query;
        })(),
      },
      build,
    });
  }
  async function flush(): Promise<void> {
    if (!game || flushing || failed || !dirty || loading) return;
    flushing = true;
    try {
      draft ??= makeCandidate();
      rawJournal(draft); // preserve random results before the async boundary
      if (!db) throw new Error("indexeddb_unavailable");
      await stagePlayDraft(db, draft);
      game = await commitPlayDraft(db, draft);
      working = clone(game.state);
      resume = clone(game.resume);
      dirty = false;
      clearJournal(draft);
      draft = null;
      failed = false;
      hints = [];
      cache();
      status();
      unblock();
      const next = destination;
      destination = null;
      if (next) go(next.url, next.replace);
    } catch (e) {
      failed = true;
      block(
        `記録を保存できません。${e instanceof Error ? e.message : "保存失敗"}。`,
        true,
      );
    } finally {
      flushing = false;
    }
  }
  async function retrySave(): Promise<void> {
    if (loading || (!draft && !dirty)) {
      reload();
      return;
    }
    if (!draft) {
      failed = false;
      await flush();
      return;
    }
    block("同じ結果を保存しています…");
    flushing = true;
    try {
      db?.close();
      db = await openPlayLogDB();
      const current = await readPlayGame(db, draft.gameId);
      if (!current) throw new Error("missing_game");
      if (current.seq === draft.expectedSeq) await stagePlayDraft(db, draft);
      game = await commitPlayDraft(db, draft);
      const obsoleteNavigation = game.seq > draft.entry.seq;
      const details = draft.entry.context;
      const actor =
        details && typeof details === "object" && !Array.isArray(details)
          ? details.tabId
          : null;
      if (typeof actor === "string" && actor) {
        tabId = actor;
        session.setItem(TAB_KEY, tabId);
      }
      working = clone(game.state);
      resume = clone(game.resume);
      dirty = false;
      failed = false;
      clearJournal(draft);
      draft = null;
      cache();
      status();
      unblock();
      // Reload candidates after crash/failure; never execute the purchase/generator again.
      const next = destination;
      destination = null;
      go(
        obsoleteNavigation
          ? resolveModuleBaseUrl("trade")
          : (next?.url ?? location.href),
      );
    } catch (e) {
      failed = true;
      block(
        `記録を保存できません。${e instanceof Error ? e.message : "保存失敗"}。`,
        true,
      );
    } finally {
      flushing = false;
    }
  }
  async function newGame(): Promise<void> {
    if (dirty || flushing || failed) {
      notice("未確定の記録を先に再試行してください。");
      return;
    }
    if (
      !confirm(
        "新規ゲームを開始しますか？ 現在のセーブを新しい初期状態へ置き換えます。記録済みの過去のゲーム履歴は削除しません。",
      )
    )
      return;
    flushing = true;
    block("新規ゲームの記録を作成しています…");
    try {
      db?.close();
      db = await openPlayLogDB();
      const initial: PlayState = {
        files: {
          ["local:" + HUB_SAVE_STORAGE_KEY]: parse(
            serializeHubSave(createHubSave(createNewGameHub())),
          ),
        },
        sorties: {},
      };
      game = await createPlayGame(db, initial, build);
      working = clone(game.state);
      resume = null;
      // Freeze the outgoing app (including legacy mode) before exposing the new game.
      leavingCommitted = true;
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get: () => facade(native, "local"),
      });
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        get: () => facade(session, "session"),
      });
      installPlayLogHooks({
        operation: () => {},
        blocked: () => true,
        navigate: () => {},
        provider: () => {},
        sortie: () => {},
        settlement: () => {},
      });
      cache();
      go(resolveModuleBaseUrl("trade"));
    } catch (e) {
      flushing = false;
      failed = true;
      block(
        `記録を保存できません。${String(e)}。再読込して再試行してください。`,
        true,
      );
    }
  }
  block("プレイ記録を確認しています…");
  mount();
  try {
    tabId = session.getItem(TAB_KEY) ?? crypto.randomUUID();
    session.setItem(TAB_KEY, tabId);
    const id = native.getItem(MARKER),
      params = new URLSearchParams(location.search);
    const inbound = Object.values(HANDOFF_QUERY_KEYS).some((keys) =>
      keys.some((key) => params.has(key)),
    );
    const legacy =
      native.getItem(HUB_SAVE_STORAGE_KEY) ||
      native.getItem(HUB_SAVE_LEGACY_STORAGE_KEY) ||
      native.getItem(CHECKPOINT) ||
      Array.from({ length: native.length }, (_, i) => native.key(i)!).some(
        tracked,
      ) ||
      Array.from({ length: session.length }, (_, i) => session.key(i)!).some(
        protocol,
      ) ||
      inbound;
    db = await openPlayLogDB();
    const activeRecord = await activePlayGameId(db);
    if (id && !activeRecord) throw new Error("game_record_missing");
    const active = activeRecord ?? id;
    if (active || !legacy) {
      game = active ? await readPlayGame(db, active) : null;
      if (active && !game) throw new Error("game_record_missing");
      if (!game) {
        const initial: PlayState = {
          files: {
            ["local:" + HUB_SAVE_STORAGE_KEY]: parse(
              serializeHubSave(
                createHubSave(createNewGameHub()),
              ),
            ),
          },
          sorties: {},
        };
        game = await createPlayGame(db, initial, build);
      }
      // Verify the complete history on boot; do not silently repair missing entries.
      await exportPlayGame(db, game.gameId);
      const prepared = await readPlayPending(db, game.gameId);
      let raw = session.getItem(JOURNAL);
      if (prepared) {
        const own = raw ? (JSON.parse(raw) as { draft: PlayDraft }) : null;
        if (own?.draft.operationId !== prepared.operationId)
          raw =
            native.getItem(
              `${JOURNAL}:${game.gameId}:${prepared.operationId}`,
            ) ?? JSON.stringify({ draft: prepared, destination: null });
      }
      if (!raw) {
        for (let i = 0; i < native.length; i++) {
          const k = native.key(i)!;
          if (k.startsWith(`${JOURNAL}:${game.gameId}:`)) {
            const text = native.getItem(k);
            const candidate = text
              ? (JSON.parse(text) as {
                  draft: PlayDraft;
                  archived?: boolean;
                })
              : null;
            if (
              candidate &&
              !candidate.archived &&
              candidate.draft.expectedSeq >= game.seq
            ) {
              raw = text;
              break;
            }
          }
        }
      }
      const saved = raw
        ? (JSON.parse(raw) as {
            draft: PlayDraft;
            destination: typeof destination;
          })
        : null;
      draft =
        prepared ?? (saved?.draft.gameId === game.gameId ? saved.draft : null);
      if (draft) {
        const details = draft.entry.context;
        const navigation =
          details && typeof details === "object" && !Array.isArray(details)
            ? details.navigation
            : null;
        const recorded =
          navigation &&
          typeof navigation === "object" &&
          !Array.isArray(navigation) &&
          typeof navigation.url === "string"
            ? { url: navigation.url, replace: navigation.replace === true }
            : null;
        destination = recorded ?? saved?.destination ?? null;
        working = clone(game.state);
        resume = clone(game.resume);
        loading = false;
        failed = true;
        status();
        block(
          "記録を保存できませんでした。未確定の結果が残っています。再試行してください。",
          true,
        );
        return;
      }
      working = clone(game.state);
      resume = clone(game.resume);
      cache();
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get: () => facade(native, "local"),
      });
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        get: () => facade(session, "session"),
      });
      installPlayLogHooks({
        operation: (kind, details) => {
          operation = kind;
          context = details;
          hints.push({ kind, context: details });
        },
        blocked: () =>
          loading || dirty || flushing || failed || leavingCommitted,
        navigate,
        provider: (fn) => {
          provider = fn;
        },
        sortie: (world) => {
          const w = world as Record<string, LogJSON>,
            nonce = w.sortieNonce;
          if (typeof nonce !== "string" || !nonce)
            throw new Error("missing_sortie_nonce");
          if (working!.sorties[nonce]) return;
          changed();
          operation = "sortie.start";
          working!.sorties[nonce] = { start: world, settlement: null };
          resume = { v: 1, kind: "sortie", body: world };
        },
        settlement: (nonce, payload) => {
          const existing = working!.sorties[nonce] as
            | Record<string, LogJSON>
            | undefined;
          if (!existing) throw new Error("sortie_start_missing");
          if (existing.settlement !== null) {
            if (canonical(existing.settlement) !== canonical(payload))
              throw new Error("sortie_settlement_conflict");
            return;
          }
          changed();
          operation = "sortie.settlement";
          existing.settlement = payload;
        },
      });
    }
    status();
    panel.addEventListener("toggle", () => {
      if (panel.open && db) {
        void listPlayGames(db)
          .then((games) => {
            const select =
                panel.querySelector<HTMLSelectElement>("#play-log-game")!,
              chosen = select.value || game?.gameId;
            select.replaceChildren();
            for (const g of games) {
              const option = document.createElement("option");
              option.value = g.gameId;
              option.textContent = `${g.createdAt} · 初期＋${g.seq}件 · ${g.gameId}`;
              select.append(option);
            }
            if (chosen && games.some((g) => g.gameId === chosen))
              select.value = chosen;
          })
          .catch((e) => notice(`履歴一覧を読めません：${String(e)}`));
      }
    });
    panel.querySelector("#play-log-new")!.addEventListener("click", () => {
      void newGame();
    });
    panel.querySelector("#play-log-export")!.addEventListener("click", () => {
      void (async () => {
        try {
          if (!db || !game) return;
          const selected =
            (panel.querySelector("#play-log-game") as HTMLSelectElement)
              .value || game.gameId;
          const count = await downloadHistory(selected);
          notice(
            `初期状態から確定${count}件までを書き出しました。履歴は保持しています。`,
          );
        } catch (e) {
          notice(`書き出せません：${String(e)}`);
        }
      })();
    });
    {
      for (const name of [
        "click",
        "pointerdown",
        "pointerup",
        "pointermove",
        "wheel",
        "input",
        "change",
        "keydown",
        "popstate",
      ] as const)
        window.addEventListener(
          name,
          (e) => {
            const el = e.target instanceof Element ? e.target : null;
            if (el?.closest("#play-log-panel,#play-log-blocker")) return;
            if (dirty || flushing || failed) {
              if (name === "pointerup") return;
              e.preventDefault();
              e.stopImmediatePropagation();
              return;
            }
            const target = el?.closest<HTMLElement>("button,a,input,select");
            hints = [];
            operation = `${location.pathname.split("/").filter(Boolean).at(-1) ?? "trade"}.${target?.dataset.act ?? target?.id ?? name}`;
            context = target
              ? {
                  id: target.id,
                  data: { ...target.dataset } as Record<string, string>,
                }
              : null;
            if (name === "click" && target?.matches("#btn-reset")) {
              e.preventDefault();
              e.stopImmediatePropagation();
              void newGame();
              return;
            }
            if (!game) return;
            if (
              name === "click" &&
              target instanceof HTMLAnchorElement &&
              target.href &&
              !target.download
            ) {
              e.preventDefault();
              const anchor = target;
              let cancelledByApp = false;
              const prevent = e.preventDefault.bind(e);
              e.preventDefault = () => {
                cancelledByApp = true;
                prevent();
              };
              setTimeout(() => {
                if (cancelledByApp) return;
                navigate(anchor.href);
              }, 0);
            }
          },
          { capture: true, passive: false },
        );
    }
    await start();
    loading = false;
    if (dirty) await flush();
    else unblock();
    mount();
    const checkpointBeforeExit = () => {
      if (!game || leavingCommitted || flushing || failed) return;
      try {
        if (
          provider &&
          !(
            resume &&
            typeof resume === "object" &&
            !Array.isArray(resume) &&
            resume.kind === "done"
          )
        ) {
          const latest = provider();
          if (latest && canonical(latest) !== canonical(resume)) {
            changed();
            resume = latest;
            operation = "sortie.checkpoint";
          }
        }
        if (dirty) {
          draft ??= makeCandidate();
          rawJournal(draft);
          void flush();
        }
      } catch (e) {
        failed = true;
        block(
          `記録を保存できません。${String(e)}。再読込せず再試行してください。`,
          true,
        );
      }
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) checkpointBeforeExit();
    });
    window.addEventListener("pagehide", checkpointBeforeExit);
  } catch (e) {
    failed = true;
    block(
      `記録を保存できません。${String(e)}。既存セーブは変更していません。`,
      true,
    );
  }
}
