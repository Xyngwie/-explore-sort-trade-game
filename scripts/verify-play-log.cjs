const assert = require("node:assert/strict"),
  fs = require("node:fs");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const results = [];
  try {
    for (const mobile of [false, true]) {
      const ctx = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
        acceptDownloads: true,
      });
      const page = await ctx.newPage(),
        errors = [];
      page.on("pageerror", (e) => {
        errors.push(e.message);
        console.error(e.message);
      });
      page.on("dialog", (d) => d.accept());
      await page.goto("http://127.0.0.1:5188/scripts/play-log-harness.html");
      const ready = () =>
        page.waitForFunction(
          () =>
            window.playHarness && !document.querySelector("#play-log-blocker"),
        );
      await ready();
      const exported = () =>
        page.evaluate(async () => {
          const h = window.playHarness,
            db = await h.openPlayLogDB();
          try {
            return await h.exportPlayGame(db, await h.activePlayGameId(db));
          } finally {
            db.close();
          }
        });
      let data = await exported();
      assert.equal(data.entries[0].kind, "game.start");
      for (const id of [
        "seed",
        "prepare",
        "buy",
        "containers",
        "open",
        "craft",
        "repair",
        "charge",
        "restore",
        "restoreComplete",
        "progress",
        "equip",
        "unequip",
        "sell",
        "sortie",
        "checkpoint",
        "settle",
      ]) {
        const before = (await exported()).game.seq;
        await page.locator("#" + id).click();
        await ready();
        const after = await exported();
        assert(
          after.game.seq > before,
          `${id} must actually change/save, not a no-op`,
        );
        results.push({
          viewport: mobile ? "390x844" : "1280x900",
          operation: id,
          seqBefore: before,
          seqAfter: after.game.seq,
        });
        if (id === "checkpoint") {
          await page.reload();
          await ready();
          assert(
            (await page.evaluate(() => window.playHarness.world().elapsed)) >=
              0.25,
            "actual saved World resumes",
          );
          assert.equal(
            Object.keys((await exported()).game.state.sorties).length,
            1,
          );
        }
      }
      data = await exported();
      assert(Object.keys(data.game.state.sorties).length === 1);
      assert(Object.values(data.game.state.sorties)[0].settlement);
      assert(
        data.game.state.files["local:estg.restore.edges.v1:play-log-test"],
      );
      if (
        !data.game.state.files["local:wreckline.hubSave.v3"].hub.lostMechs
          .length
      )
        console.error(
          await page.evaluate(() => {
            const w = window.playHarness.world();
            return {
              phase: w.phase,
              loc: w.sortieLocation,
              ids: w.deployedInstanceIds,
              wing: w.wingmen.map((u) => ({
                id: u.instanceId,
                pos: u.pos,
                alive: u.alive,
                hold: u.holdOrder,
              })),
              boarding: w.boarding,
              extracted: w.extracted,
              battery: w.mechBattery,
              left: w.leftBehindUnitIds,
            };
          }),
        );
      assert(
        data.game.state.files["local:wreckline.hubSave.v3"].hub.lostMechs
          .length > 0,
        "left-behind mech persists in full-state replay",
      );
      assert(
        data.game.state.files["local:wreckline.hubSave.v3"].hub.fieldCells.some(
          (c) => c.ground["fixture-ground-shield"],
        ),
        "field shield persists with canonical identity",
      );
      assert(
        Object.values(
          data.game.state.files["local:wreckline.hubSave.v3"].hub.mechLearning
            .byMech,
        ).some((c) => c.some((v) => v.tries === 3)),
      );
      const settledState = JSON.stringify(
        data.game.state.files["local:wreckline.hubSave.v3"].hub.mechLearning,
      );
      await page.locator("#settle").click();
      await ready();
      assert.equal(
        JSON.stringify(
          (await exported()).game.state.files["local:wreckline.hubSave.v3"].hub
            .mechLearning,
        ),
        settledState,
        "same sortie cannot double learning",
      );
      const before = data.game;
      // Abort the actual entries transaction: neither root nor entry may be confirmed.
      await page.evaluate(() => {
        const original = IDBObjectStore.prototype.add;
        window.restoreAdd = () => (IDBObjectStore.prototype.add = original);
        IDBObjectStore.prototype.add = function (...args) {
          if (this.name === "entries") {
            this.transaction.abort();
            throw new DOMException("test abort", "AbortError");
          }
          return original.apply(this, args);
        };
      });
      await page.locator("#buy").click();
      await page.locator("#play-log-retry").waitFor();
      assert(
        (await page.locator("#play-log-blocker").innerText()).includes(
          "記録を保存できません",
        ),
      );
      let failed = await exported();
      assert.deepEqual(failed.game, before);
      assert.equal(failed.entries.length, data.entries.length);
      await page.reload();
      await page.locator("#play-log-retry").waitFor();
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        page.locator("#play-log-retry").click(),
      ]);
      await ready();
      data = await exported();
      assert.equal(data.game.seq, before.seq + 1);
      assert.equal(
        data.game.state.files["local:wreckline.hubSave.v3"].hub.fleet.length,
        before.state.files["local:wreckline.hubSave.v3"].hub.fleet.length + 1,
      );
      // Export uses a coherent snapshot; no history is deleted.
      await page.locator("#play-log-panel > summary").click();
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#play-log-export").click();
      const download = await downloadPromise;
      const file = await download.path(),
        json = JSON.parse(fs.readFileSync(file));
      assert(json.verified);
      assert.equal(json.entries.length, json.range.to + 1);
      assert.equal((await exported()).entries.length, data.entries.length);
      await page.screenshot({
        path: `/tmp/play-log-${mobile ? "mobile" : "desktop"}.png`,
        fullPage: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.deepEqual(errors, []);
      results.push({
        viewport: mobile ? "390x844" : "1280x900",
        scenario:
          "initial/full-state replay, transaction abort unchanged, reload/retry one result, coherent retained JSON export",
        status: "PASS",
      });
      await ctx.close();
    }
    console.log(
      JSON.stringify(
        { results, physicalDevice: "NOT_RUN", publicVersion: "NOT_RUN" },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
