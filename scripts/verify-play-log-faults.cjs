/** Actual Chromium IndexedDB transactions, no in-memory IDB mock. */
const assert = require("node:assert/strict");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const url = "http://127.0.0.1:5188/scripts/play-log-harness.html";
(async () => {
  const b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const results = [];
  const ready = (p) =>
    p.waitForFunction(
      () => window.playHarness && !document.querySelector("#play-log-blocker"),
    );
  const snapshot = (p) =>
    p.evaluate(async () => {
      const h = window.playHarness,
        db = await h.openPlayLogDB();
      try {
        return await h.exportPlayGame(db, await h.activePlayGameId(db));
      } finally {
        db.close();
      }
    });
  try {
    // Stage/quota refusal preserves the random candidate and does not charge anything.
    {
      const ctx = await b.newContext(),
        p = await ctx.newPage();
      await p.goto(url);
      await ready(p);
      const before = await snapshot(p);
      await p.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === "pending")
            throw new DOMException("test quota", "QuotaExceededError");
          return put.apply(this, args);
        };
      });
      await p.locator("#buy").click();
      await p.locator("#play-log-retry").waitFor();
      const unchanged = await snapshot(p);
      assert.deepEqual(unchanged.game, before.game);
      const candidate = await p.evaluate(() => {
        const k = Object.keys(localStorage).find((k) =>
          k.startsWith("wreckline.playLog.pending.v1:"),
        );
        return JSON.parse(localStorage.getItem(k)).draft;
      });
      await p.reload();
      await p.locator("#play-log-retry").waitFor();
      await Promise.all([
        p.waitForNavigation({ waitUntil: "domcontentloaded" }),
        p.locator("#play-log-retry").click(),
      ]);
      await ready(p);
      const after = await snapshot(p);
      assert.equal(after.entries.at(-1).operationId, candidate.operationId);
      assert.deepEqual(after.game.state, candidate.state);
      assert.equal(after.game.seq, before.game.seq + 1);
      // Lost commit acknowledgement: the same journal must not apply twice.
      await p.evaluate(
        (d) =>
          sessionStorage.setItem(
            "wreckline.playLog.pending.v1",
            JSON.stringify({ draft: d, destination: null }),
          ),
        candidate,
      );
      await p.reload();
      await p.locator("#play-log-retry").waitFor();
      await Promise.all([
        p.waitForNavigation({ waitUntil: "domcontentloaded" }),
        p.locator("#play-log-retry").click(),
      ]);
      await ready(p);
      assert.deepEqual((await snapshot(p)).game, after.game);
      results.push({
        scenario:
          "Quota refusal before staging, unchanged confirmed state, persistent candidate survives reload, identical operation/result on retry",
        status: "PASS",
      });
      await ctx.close();
    }
    // Two independent app instances start from the same version: precisely one succeeds.
    {
      const ctx = await b.newContext(),
        a = await ctx.newPage();
      await a.goto(url);
      await ready(a);
      const c = await ctx.newPage();
      await c.goto(url);
      await ready(c);
      const before = await snapshot(a);
      await Promise.all([a.locator("#buy").click(), c.locator("#buy").click()]);
      await a.waitForTimeout(150);
      const flags = await Promise.all(
        [a, c].map((p) => p.locator("#play-log-retry").count()),
      );
      assert.equal(
        flags.reduce((x, y) => x + y, 0),
        1,
      );
      const after = await snapshot(a);
      assert.equal(after.game.seq, before.game.seq + 1);
      assert.equal(
        after.game.state.files["local:wreckline.hubSave.v3"].hub.fleet.length,
        before.game.state.files["local:wreckline.hubSave.v3"].hub.fleet.length +
          1,
      );
      const loser = flags[0] ? a : c;
      await loser.locator("#play-log-retry").click();
      await loser.locator("#play-log-conflict-reload").waitFor();
      await Promise.all([
        loser.waitForNavigation({ waitUntil: "domcontentloaded" }),
        loser.locator("#play-log-conflict-reload").click(),
      ]);
      await ready(loser);
      assert.deepEqual((await snapshot(loser)).game, after.game);
      assert(
        await loser.evaluate(() =>
          Object.keys(localStorage).some(
            (k) =>
              k.startsWith("wreckline.playLog.pending.v1:") &&
              JSON.parse(localStorage.getItem(k)).archived,
          ),
        ),
      );
      results.push({
        scenario:
          "Two tabs CAS at same head, one charge/reward/sequence, rejected candidate retained, explicit reload to committed state",
        status: "PASS",
      });
      await ctx.close();
    }
    // Recover the already prepared operation even if this tab also has a later rejected candidate.
    {
      const ctx = await b.newContext(),
        a = await ctx.newPage();
      await a.goto(url);
      await ready(a);
      const c = await ctx.newPage();
      await c.goto(url);
      await ready(c);
      await a.evaluate(() => {
        const add = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (...args) {
          if (this.name === "entries") {
            this.transaction.abort();
            throw new DOMException(
              "test prepared owner interrupted",
              "AbortError",
            );
          }
          return add.apply(this, args);
        };
      });
      await a.locator("#buy").click();
      await a.locator("#play-log-retry").waitFor();
      const candidate = await a.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem("wreckline.playLog.pending.v1"))
            .draft,
      );
      await c.locator("#buy").click();
      await c.locator("#play-log-retry").waitFor();
      await c.reload();
      await c.locator("#play-log-retry").waitFor();
      await Promise.all([
        c.waitForNavigation({ waitUntil: "domcontentloaded" }),
        c.locator("#play-log-retry").click(),
      ]);
      await ready(c);
      const data = await snapshot(c);
      assert.equal(data.game.seq, 1);
      assert.equal(data.entries.at(-1).operationId, candidate.operationId);
      assert.deepEqual(data.game.state, candidate.state);
      results.push({
        scenario:
          "Prepared IDB owner survives interrupted commit and competing tab journal; reload recovers that exact operation first",
        status: "PASS",
      });
      await ctx.close();
    }
    // Session handoff reservations stay local to their logical tab, not every tab in the game.
    {
      const ctx = await b.newContext(),
        a = await ctx.newPage();
      await a.goto(url);
      await ready(a);
      await a.evaluate(() =>
        sessionStorage.setItem("wreckline.pendingSortUnopenedBack.v1", "1"),
      );
      await ready(a);
      const c = await ctx.newPage();
      await c.goto(url);
      await ready(c);
      assert.equal(
        await c.evaluate(() =>
          sessionStorage.getItem("wreckline.pendingSortUnopenedBack.v1"),
        ),
        null,
      );
      await a.reload();
      await ready(a);
      assert.equal(
        await a.evaluate(() =>
          sessionStorage.getItem("wreckline.pendingSortUnopenedBack.v1"),
        ),
        "1",
      );
      results.push({
        scenario:
          "Per-tab canonical protocol namespace preserves source reservation on reload without copying it into another tab",
        status: "PASS",
      });
      await ctx.close();
    }
    // IDB is authoritative: a failed compatibility cache write must recover after reload.
    {
      const ctx = await b.newContext(),
        p = await ctx.newPage();
      await p.addInitScript(() => {
        window.rawStorageForTest = window.localStorage;
      });
      await p.goto(url);
      await ready(p);
      const before = await snapshot(p);
      await p.evaluate(() => {
        const put = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
          if (k === "wreckline.hubSave.v3")
            throw new DOMException("test cache denied", "QuotaExceededError");
          return put.call(this, k, v);
        };
      });
      await p.locator("#buy").click();
      await ready(p);
      const after = await snapshot(p);
      assert.equal(after.game.seq, before.game.seq + 1);
      assert.equal(
        await p.evaluate(
          () =>
            JSON.parse(window.rawStorageForTest.getItem("wreckline.hubSave.v3"))
              .hub.credits,
        ),
        before.game.state.files["local:wreckline.hubSave.v3"].hub.credits,
      );
      await p.reload();
      await ready(p);
      assert.deepEqual((await snapshot(p)).game, after.game);
      assert.equal(
        await p.evaluate(
          () =>
            JSON.parse(window.rawStorageForTest.getItem("wreckline.hubSave.v3"))
              .hub.credits,
        ),
        after.game.state.files["local:wreckline.hubSave.v3"].hub.credits,
      );
      results.push({
        scenario:
          "IDB commit succeeds, localStorage mirror fails, reload recovers authoritative state without reapplying",
        status: "PASS",
      });
      await ctx.close();
    }
    // IndexedDB unavailable: no initialization or unlogged write; legacy data untouched.
    {
      const ctx = await b.newContext(),
        p = await ctx.newPage();
      await p.addInitScript(() => {
        localStorage.setItem("unrelated", "keep");
        Object.defineProperty(window, "indexedDB", {
          value: {
            open() {
              throw new DOMException("test denied", "SecurityError");
            },
          },
        });
      });
      await p.goto(url);
      await p.locator("#play-log-retry").waitFor();
      assert(
        (await p.locator("#play-log-blocker").innerText()).includes(
          "記録を保存できません",
        ),
      );
      assert.equal(
        await p.evaluate(() => localStorage.getItem("unrelated")),
        "keep",
      );
      assert.equal(
        await p.evaluate(() => localStorage.getItem("wreckline.hubSave.v3")),
        null,
      );
      results.push({
        scenario: "IndexedDB denied, no silent fallback or premature save",
        status: "PASS",
      });
      await ctx.close();
    }
    // Existing saves do not get a synthetic genesis or mid-game logging.
    {
      const fresh = await b.newContext(),
        source = await fresh.newPage();
      await source.goto(url);
      await ready(source);
      const old = (await snapshot(source)).game.initial.files[
        "local:wreckline.hubSave.v3"
      ];
      await fresh.close();
      const ctx = await b.newContext(),
        p = await ctx.newPage();
      await p.addInitScript(
        (old) =>
          localStorage.setItem("wreckline.hubSave.v3", JSON.stringify(old)),
        old,
      );
      await p.goto(url);
      await ready(p);
      await p.locator("#play-log-panel > summary").click();
      assert(
        (await p.locator("#play-log-status").innerText()).includes(
          "途中からの記録は行いません",
        ),
      );
      assert.equal(
        await p.evaluate(() =>
          localStorage.getItem("wreckline.playLog.active.v1"),
        ),
        null,
      );
      assert.deepEqual(
        await p.evaluate(() =>
          JSON.parse(localStorage.getItem("wreckline.hubSave.v3")),
        ),
        old,
      );
      results.push({
        scenario:
          "Existing save remains unchanged and unlogged; no synthesized history",
        status: "PASS",
      });
      await ctx.close();
    }
    // An incoming legacy handoff is not the beginning of a newly recorded game.
    {
      const ctx = await b.newContext(),
        p = await ctx.newPage();
      await p.goto(url + "?yieldBag=ammo%3A3");
      await ready(p);
      await p.locator("#play-log-panel > summary").click();
      assert(
        (await p.locator("#play-log-status").innerText()).includes(
          "途中からの記録は行いません",
        ),
      );
      assert.equal(
        await p.evaluate(() =>
          localStorage.getItem("wreckline.playLog.active.v1"),
        ),
        null,
      );
      results.push({
        scenario:
          "Existing inbound handoff without a game origin is not synthesized into a new genesis",
        status: "PASS",
      });
      await ctx.close();
    }
    // Corrupted metadata must fail verification instead of silently rebuilding history.
    {
      const ctx = await b.newContext(),
        p = await ctx.newPage();
      await p.goto(url);
      await ready(p);
      await p.evaluate(async () => {
        const h = window.playHarness,
          db = await h.openPlayLogDB(),
          id = await h.activePlayGameId(db);
        await new Promise((resolve, reject) => {
          const t = db.transaction("entries", "readwrite"),
            store = t.objectStore("entries"),
            r = store.get([id, 0]);
          r.onsuccess = () => {
            const e = r.result;
            e.kind = "corrupt";
            store.put(e);
          };
          t.oncomplete = resolve;
          t.onabort = () => reject(t.error);
        });
        db.close();
      });
      await p.reload();
      await p.locator("#play-log-retry").waitFor();
      assert(
        (await p.locator("#play-log-blocker").innerText()).includes(
          "record_checksum",
        ),
      );
      assert.equal(await p.locator("#buy").count(), 0);
      results.push({
        scenario:
          "Corrupt record metadata blocks boot; no silent correction or unlogged continuation",
        status: "PASS",
      });
      await ctx.close();
    }
    // Growth measurements against the real IDB engine, retaining every record.
    {
      const ctx = await b.newContext(),
        p = await ctx.newPage();
      await p.goto(url);
      await ready(p);
      const metrics = await p.evaluate(async () => {
        const h = window.playHarness,
          db = await h.openPlayLogDB();
        let game = await h.readPlayGame(db, await h.activePlayGameId(db));
        const started = performance.now();
        for (let n = 1; n <= 1000; n++) {
          const state = structuredClone(game.state);
          state.files["benchmark.fixture"] = { n };
          const draft = h.makePlayDraft(game, state, null, {
            kind: "benchmark.fixture",
            module: "test",
            context: null,
            build: "test",
          });
          await h.stagePlayDraft(db, draft);
          game = await h.commitPlayDraft(db, draft);
        }
        const writeMs = performance.now() - started,
          t = performance.now(),
          data = await h.exportPlayGame(db, game.gameId),
          exportMs = performance.now() - t;
        db.close();
        return {
          records: data.entries.length,
          writeMs: Math.round(writeMs),
          exportReplayMs: Math.round(exportMs),
          jsonBytes: JSON.stringify(data).length,
        };
      });
      assert.equal(metrics.records, 1001);
      const reloadAt = Date.now();
      await p.reload();
      await ready(p);
      metrics.reloadAndVerifyMs = Date.now() - reloadAt;
      assert.equal((await snapshot(p)).entries.length, 1001);
      results.push({
        scenario: "Real IDB append/export/replay growth without pruning",
        status: "PASS",
        ...metrics,
      });
      await ctx.close();
    }
    console.log(
      JSON.stringify(
        {
          method:
            "Chromium real IndexedDB; explicit fault injection; separate disposable contexts",
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
