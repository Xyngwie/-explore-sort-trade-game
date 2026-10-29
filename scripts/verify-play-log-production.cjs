/** Five built module bundles on one origin, real game controls and downloadable log. */
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  http = require("node:http"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const root = path.resolve(__dirname, ".."),
  prefix = "/-explore-sort-trade-game/";
(async () => {
  const server = http.createServer((req, res) => {
    let url = new URL(req.url, "http://local"),
      s = url.pathname;
    if (!s.startsWith(prefix)) return res.writeHead(404).end();
    s = s.slice(prefix.length);
    let m = "trade";
    for (const name of ["explore", "sort", "restore", "invade"])
      if (s.startsWith(name + "/")) {
        m = name;
        s = s.slice(name.length + 1);
        break;
      }
    const dir = path.join(root, "packages", m, "dist"),
      f = path.resolve(dir, s || "index.html");
    if (
      !f.startsWith(dir + "/") ||
      !fs.existsSync(f) ||
      !fs.statSync(f).isFile()
    )
      return res.writeHead(404).end();
    res.setHeader(
      "Content-Type",
      f.endsWith(".js")
        ? "text/javascript"
        : f.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const local = `http://127.0.0.1:${server.address().port}${prefix}`,
    base = `https://xyngwie.github.io${prefix}`,
    b = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    }),
    results = [];
  try {
    for (const mobile of [false, true]) {
      const ctx = await b.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
        acceptDownloads: true,
      });
      await ctx.route(base + "**", async (route) => {
        const u = new URL(route.request().url()),
          response = await ctx.request.get(
            local + u.pathname.slice(prefix.length) + u.search,
          );
        await route.fulfill({ response });
      });
      const p = await ctx.newPage(),
        errors = [];
      p.on("pageerror", (e) => {
        errors.push(e.message);
        console.error("PAGE", e.stack);
      });
      p.on("dialog", (d) => d.accept());
      const ready = () =>
        p.waitForFunction(
          () =>
            document
              .querySelector("#play-log-status")
              ?.textContent?.includes("記録中") &&
            !document.querySelector("#play-log-blocker"),
        );
      const hub = () =>
        p.evaluate(
          () => JSON.parse(localStorage.getItem("wreckline.hubSave.v3")).hub,
        );
      const coldAt = Date.now();
      await p.goto(base);
      await ready();
      const coldBootMs = Date.now() - coldAt;
      await p.locator("#btn-seed").click();
      await ready();
      for (let i = 0; i < 2; i++) {
        const before = (await hub()).credits;
        await Promise.all([
          p.waitForNavigation({ waitUntil: "domcontentloaded" }),
          p
            .locator(
              '[data-four-resource-action="buy"][data-four-resource-id="junk"]',
            )
            .click(),
        ]);
        await p.waitForFunction(
          (c) =>
            JSON.parse(localStorage.getItem("wreckline.hubSave.v3")).hub
              .credits === c,
          before - 6,
        );
        await ready();
      }
      await p.locator("#junk-circuit-craft-size").selectOption("1");
      await Promise.all([
        p.waitForNavigation({ waitUntil: "domcontentloaded" }),
        p.locator("[data-junk-circuit-craft]").click(),
      ]);
      await ready();
      await p.locator("[data-junk-circuit-craft]").waitFor();
      const id = (await hub()).circuits.find(
        (c) => c.circuitBoard.cols === 1 && c.origin === "crafted",
      ).circuitId;
      await p.locator(`[data-circuit-open="${id}"]`).click();
      await p.waitForURL(base + "restore/**");
      await ready();
      for (let i = 0; i < 4; i++) {
        await p.locator(`[data-edge="${i}"]`).click();
        await ready();
      }
      await p.locator("#btn-bypass-hero").click();
      await p.locator("#link-return-trade").click();
      await p.waitForURL(base + "**");
      await p.locator("[data-junk-circuit-craft]").waitFor();
      await ready();
      assert.equal(
        (await hub()).circuits.find((c) => c.circuitId === id).restoreState,
        "bypass",
      );
      // UI failure/retry without reload: random circuit purchase has one generated result.
      const before = (await hub()).credits;
      await p.evaluate(() => {
        const add = IDBObjectStore.prototype.add;
        window.undoPlayLogFault = () => (IDBObjectStore.prototype.add = add);
        IDBObjectStore.prototype.add = function (...a) {
          if (this.name === "entries") {
            this.transaction.abort();
            throw new DOMException("test transaction abort", "AbortError");
          }
          return add.apply(this, a);
        };
      });
      await p.locator("[data-circuit-purchase]").click();
      await p.locator("#play-log-retry").waitFor();
      await p.screenshot({
        path: `/tmp/play-log-failure-${mobile ? "mobile" : "desktop"}.png`,
      });
      assert(
        await p.locator("#play-log-blocker").evaluate((el) =>
          Array.from(el.querySelectorAll("p,button")).every((child) => {
            const r = child.getBoundingClientRect();
            return (
              r.left >= 0 &&
              r.right <= (visualViewport?.width ?? innerWidth) &&
              child.scrollWidth <= child.clientWidth
            );
          }),
        ),
        "failure controls and copy must fit viewport",
      );
      const committedCredits = await p.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const r = indexedDB.open("wreckline.playLog.v1");
            r.onerror = () => reject(r.error);
            r.onsuccess = () => {
              const db = r.result,
                q = db
                  .transaction("games")
                  .objectStore("games")
                  .get(localStorage.getItem("wreckline.playLog.active.v1"));
              q.onsuccess = () => {
                resolve(
                  q.result.state.files["local:wreckline.hubSave.v3"].hub
                    .credits,
                );
                db.close();
              };
              q.onerror = () => reject(q.error);
            };
          }),
      );
      assert.equal(committedCredits, before);

      const failureDownload = p.waitForEvent("download");
      await p.locator("#play-log-failure-export").click();
      const failureFile = await (await failureDownload).path();
      const failureJSON = JSON.parse(fs.readFileSync(failureFile));
      assert.equal(
        failureJSON.game.state.files["local:wreckline.hubSave.v3"].hub.credits,
        before,
      );
      const fixedPurchase = await p.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem("wreckline.playLog.pending.v1"))
            .draft.state.files["local:wreckline.hubSave.v3"].hub.circuits,
      );
      await p.evaluate(() => window.undoPlayLogFault());
      await Promise.all([
        p.waitForNavigation({ waitUntil: "domcontentloaded" }),
        p.locator("#play-log-retry").click(),
      ]);
      await ready();
      assert.equal((await hub()).credits, before - 10000);
      const actualCircuits = (await hub()).circuits;
      for (const c of fixedPurchase) {
        const actual = actualCircuits.find((x) => x.circuitId === c.circuitId);
        assert(actual);
        assert.deepEqual(
          actual.circuitBoard,
          c.circuitBoard,
          "retry must not redraw circuit",
        );
      }
      await p.locator("#input-buy-unopened").fill("1");
      await p.locator("#btn-buy-unopened").click();
      await ready();
      await p.locator("#input-sort-unopened").fill("1");
      await p.locator("#btn-sort-unopened").click();
      await p.waitForURL(base + "sort/**");
      await ready();
      await p.locator("#btn-start").click();
      await ready();
      await p.locator("#btn-finish").click();
      await ready();
      await p.locator("#btn-hangar").click();
      await p.locator("[data-junk-circuit-craft]").waitFor();
      await ready();
      // Invade progress is included without changing placement rules.
      await p.goto(base + "invade/");
      await ready();
      await p.locator("#board-viewport").scrollIntoViewIfNeeded();
      await p
        .locator(".cell.closed:not(.blocked)")
        .first()
        .click({ button: "right" });
      await ready();
      const battle = await ctx.newPage();
      battle.on("pageerror", (e) => errors.push(e.message));
      await battle.goto(base);
      await battle.locator("#link-deploy").click();
      await battle.waitForURL(base + "explore/**");
      await battle.waitForFunction(
        () =>
          document.querySelector("#play-log-status") &&
          !document.querySelector("#play-log-blocker"),
      );
      await battle.locator("#btn-start").click();
      await battle.waitForFunction(
        () => !document.querySelector("#play-log-blocker"),
      );
      await battle.waitForTimeout(300);
      await battle.reload();
      await battle.waitForFunction(
        () =>
          document.querySelector("#play-log-retry") ||
          document.querySelector("#sortie-paused"),
      );
      if (await battle.locator("#play-log-retry").count()) {
        await Promise.all([
          battle.waitForNavigation({ waitUntil: "domcontentloaded" }),
          battle.locator("#play-log-retry").click(),
        ]);
      }
      await battle.locator("#sortie-paused").waitFor();
      const resumed = await battle.evaluate(() =>
        JSON.parse(localStorage.getItem("estg.sortieCheckpoint")),
      );
      assert(resumed.body.elapsed > 0);
      assert(resumed.body.sortieNonce);
      await battle.close();
      await p.bringToFront();
      await p.locator("#play-log-panel > summary").click();
      const dl = p.waitForEvent("download");
      await p.locator("#play-log-export").click();
      const download = await dl,
        file = await download.path();
      const verified = JSON.parse(
        execFileSync(
          path.join(root, "node_modules/.bin/tsx"),
          [path.join(__dirname, "verify-play-log-export.ts"), file],
          { encoding: "utf8" },
        ),
      );
      assert.equal(verified.status, "PASS");
      const oldGame = verified.gameId;
      await p.locator("#play-log-new").click();
      await p.waitForURL(base);
      await ready();
      await p.locator("#play-log-panel > summary").click();
      await p.waitForFunction(
        (id) =>
          Array.from(document.querySelector("#play-log-game").options).some(
            (o) => o.value === id,
          ),
        oldGame,
      );
      await p.locator("#play-log-game").selectOption(oldGame);
      const archivedDownload = p.waitForEvent("download");
      await p.locator("#play-log-export").click();
      const archived = await archivedDownload,
        oldFile = await archived.path();
      const oldVerified = JSON.parse(
        execFileSync(
          path.join(root, "node_modules/.bin/tsx"),
          [path.join(__dirname, "verify-play-log-export.ts"), oldFile],
          { encoding: "utf8" },
        ),
      );
      assert.equal(oldVerified.gameId, oldGame);
      assert(
        oldVerified.records >= verified.records,
        "new game must not prune prior history",
      );
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.deepEqual(errors, []);
      results.push({
        viewport: mobile ? "390x844" : "1280x900",
        scenario:
          "production HUB resource buy/craft -> real Restore wiring/Bypass -> HUB ingestion -> failed random circuit purchase/retry exactly once -> actual Sort opening/start/finish/return -> Invade mark -> Explore real start/checkpoint/reload -> retained coherent export replay -> new game and archived history export",
        status: "PASS",
        records: verified.records,
        coldBootMs,
      });
      await ctx.close();
    }
    console.log(
      JSON.stringify(
        {
          method:
            "local production bundles at public URL shape, isolated browser profiles, no public writes",
          results,
          physicalDevice: "NOT_RUN",
          publicVersion: "NOT_RUN",
        },
        null,
        2,
      ),
    );
  } finally {
    await b.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
