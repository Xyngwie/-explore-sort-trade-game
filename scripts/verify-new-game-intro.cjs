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
    for (const mobile of process.env.INTRO_NONZERO_ONLY ? [] : [false, true]) {
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
      await p.goto(base);
      await ready();
      const initial = await hub();
      assert.equal(initial.credits, 0);
      assert.equal(initial.unopenedContainers, 10);
      assert.deepEqual(initial.fleet, []);
      assert.deepEqual(initial.circuits, []);
      for (const key of ["ammo", "armor", "power", "junk"])
        assert.equal(initial.inventory[key] ?? 0, 0);
      assert.equal(initial.newGameIntro.initialOpened, 0);
      await p.locator("#new-game-guide").waitFor();
      await p.screenshot({
        path: `/tmp/intro-initial-${mobile ? "mobile" : "desktop"}.png`,
      });
      await p.reload();
      await ready();
      assert.deepEqual(await hub(), initial);
      // Every entry uses the real Explore briefing and core start gate.
      for (const query of [
        "",
        "?deployableMechs=1&startingAmmo=100",
        "?sectorX=0&sectorY=0&density=1&engage=forced&enemyCells=0,0",
      ]) {
        await p.goto(base + "explore/" + query);
        await ready();
        await p.locator("#btn-start").waitFor();
        assert(await p.locator("#btn-start").isDisabled());
        assert((await p.locator("body").innerText()).includes("初出撃には"));
        assert.equal((await hub()).newGameIntro.firstSortie, undefined);
        assert.equal((await hub()).circuits.length, 0);
      }
      await p.goto(base);
      await ready();
      const navigateClick = async (locator) => {
        await Promise.all([
          p.waitForNavigation({ waitUntil: "domcontentloaded" }),
          locator.click(),
        ]);
        await ready();
      };
      const openBatch = async (
        n,
        skip = false,
        fail = false,
        launchFail = false,
      ) => {
        await p.locator("#input-sort-unopened").fill(String(n));
        let fixedJobId = null;
        if (launchFail) {
          await p.evaluate(() => {
            const add = IDBObjectStore.prototype.add;
            window.undoIntroFault = () => (IDBObjectStore.prototype.add = add);
            IDBObjectStore.prototype.add = function (...args) {
              if (this.name === "entries") {
                this.transaction.abort();
                throw new DOMException("fixture launch abort", "AbortError");
              }
              return add.apply(this, args);
            };
          });
          await p.locator("#btn-sort-unopened").click();
          await p.locator("#play-log-retry").waitFor();
          const candidate = await p.evaluate(
            () =>
              JSON.parse(sessionStorage.getItem("wreckline.playLog.pending.v1"))
                .draft,
          );
          fixedJobId =
            candidate.state.files["local:wreckline.hubSave.v3"].hub.newGameIntro
              .opening.id;
          assert.equal(
            candidate.state.files["local:wreckline.hubSave.v3"].hub
              .unopenedContainers,
            9,
          );
          const committed = await p.evaluate(
            () =>
              new Promise((resolve, reject) => {
                const r = indexedDB.open("wreckline.playLog.v1");
                r.onsuccess = () => {
                  const db = r.result,
                    q = db
                      .transaction("games")
                      .objectStore("games")
                      .get(localStorage.getItem("wreckline.playLog.active.v1"));
                  q.onsuccess = () => {
                    resolve(
                      q.result.state.files["local:wreckline.hubSave.v3"].hub,
                    );
                    db.close();
                  };
                  q.onerror = () => reject(q.error);
                };
                r.onerror = () => reject(r.error);
              }),
          );
          assert.equal(committed.unopenedContainers, 10);
          assert.equal(committed.newGameIntro.opening, undefined);
          await p.evaluate(() => window.undoIntroFault());
          await navigateClick(p.locator("#play-log-retry"));
        } else await navigateClick(p.locator("#btn-sort-unopened"));
        const jobId = new URL(p.url()).searchParams.get("introOpening");
        if (fixedJobId) assert.equal(jobId, fixedJobId);

        assert(jobId);
        if (skip) {
          await navigateClick(p.locator("#btn-skip-cargo-hub"));
          return;
        }
        await p.locator("#btn-start").click();
        await ready();
        const fixed = await p.evaluate(
          () =>
            JSON.parse(localStorage.getItem("wreckline.sortSession.v1")).state,
        );
        await p.reload();
        await ready();
        assert.deepEqual(
          await p.evaluate(
            () =>
              JSON.parse(localStorage.getItem("wreckline.sortSession.v1"))
                .state,
          ),
          fixed,
          "reload does not reroll the bag",
        );
        if (fail)
          await p.evaluate(() => {
            const add = IDBObjectStore.prototype.add;
            window.undoIntroFault = () => (IDBObjectStore.prototype.add = add);
            IDBObjectStore.prototype.add = function (...args) {
              if (this.name === "entries") {
                this.transaction.abort();
                throw new DOMException("fixture abort", "AbortError");
              }
              return add.apply(this, args);
            };
          });
        await p.locator("#btn-finish").click();
        if (fail) {
          await p.locator("#play-log-retry").waitFor();
          const confirmed = await p.evaluate(
            () =>
              new Promise((resolve, reject) => {
                const r = indexedDB.open("wreckline.playLog.v1");
                r.onsuccess = () => {
                  const db = r.result,
                    q = db
                      .transaction("games")
                      .objectStore("games")
                      .get(localStorage.getItem("wreckline.playLog.active.v1"));
                  q.onsuccess = () => {
                    resolve(
                      q.result.state.files["local:wreckline.hubSave.v3"].hub,
                    );
                    db.close();
                  };
                  q.onerror = () => reject(q.error);
                };
                r.onerror = () => reject(r.error);
              }),
          );
          assert.equal(confirmed.credits, 0);
          assert.equal(confirmed.newGameIntro.initialOpened, 4);
          await p.evaluate(() => window.undoIntroFault());
          await navigateClick(p.locator("#play-log-retry"));
        } else await ready();
        await p.locator("#btn-hangar").waitFor();
        const resultUrl = await p.locator("#btn-hangar").getAttribute("href");
        await navigateClick(p.locator("#btn-hangar"));
        const after = await hub();
        // Replaying the issued return URL cannot receive a result twice.
        await p.goto(resultUrl);
        await ready();
        assert.deepEqual(await hub(), after);
      };
      await openBatch(1, true, false, true);
      assert.equal((await hub()).unopenedContainers, 10);
      assert.equal((await hub()).newGameIntro.initialOpened, 0);
      await openBatch(4);
      assert.equal((await hub()).credits, 0);
      assert.equal((await hub()).newGameIntro.initialOpened, 4);
      await openBatch(6, false, true);
      assert.equal((await hub()).credits, 5000000);
      assert.equal((await hub()).newGameIntro.initialOpened, 10);
      assert.equal((await hub()).unopenedContainers, 0);
      assert((await hub()).newGameIntro.zeroHarvestAwarded);
      await p.reload();
      await ready();
      assert.equal((await hub()).credits, 5000000);
      const buyResource = async (id, n) => {
        for (let i = 0; i < n; i++) {
          await navigateClick(
            p.locator(
              `[data-four-resource-action="buy"][data-four-resource-id="${id}"]`,
            ),
          );
          if (i % 100 === 99)
            console.error("verified resource purchases", mobile, id, i + 1);
        }
      };
      await buyResource("armor", 300);
      await p.locator("#btn-create-mech").click();
      await ready();
      assert.equal((await hub()).fleet.length, 1);
      assert.equal((await hub()).circuits.length, 0);
      assert.equal(
        (await hub()).fleet[0].battery.activity,
        300,
        "existing newly-created battery contract",
      );
      await p.reload();
      await ready();
      assert.equal((await hub()).circuits.length, 0);
      await buyResource("junk", 2);
      await buyResource("ammo", 3);
      await buyResource("power", 10);
      const beforeCraft = (await hub()).credits;
      await p.locator("#junk-circuit-craft-size").selectOption("1");
      await navigateClick(p.locator("[data-junk-circuit-craft]"));
      const circuit = (await hub()).circuits[0];
      assert(circuit);
      assert.equal(circuit.restoreState, "unrestored");
      assert.equal((await hub()).credits, beforeCraft - 6);
      assert.equal((await hub()).inventory.junk ?? 0, 0);
      const leader = (await hub()).fleet[0].instanceId;
      assert(
        (await hub()).newGameIntro.craftedCircuitIds.includes(
          circuit.circuitId,
        ),
      );
      // A crafted but unrestored circuit cannot satisfy the first-sortie condition.
      assert.equal(await p.locator("#link-deploy").count(), 0);
      await p.locator(`[data-circuit-open="${circuit.circuitId}"]`).click();
      await p.waitForURL(base + "restore/**");
      await ready();
      for (let i = 0; i < 4; i++) {
        await p.locator(`[data-edge="${i}"]`).click();
        await ready();
      }
      await p.locator("#btn-bypass-hero").click();
      await ready();
      await navigateClick(p.locator("#link-return-trade"));
      await p.locator("#circuit-equip-select").selectOption(circuit.circuitId);
      await p.locator("#circuit-equip-mech").selectOption(leader);
      await navigateClick(p.locator('[data-equip-action="equip"]'));
      assert(
        await p
          .locator(`[data-act="charge"][data-id="${leader}"]`)
          .isDisabled(),
      );
      assert.equal((await hub()).fleet[0].battery.activity, 300);
      assert.equal((await hub()).inventory.power, 10);
      assert.equal((await hub()).fleet[0].currentAmmo, 3);
      await navigateClick(p.locator("#link-deploy"));
      assert(!(await p.locator("#btn-start").isDisabled()));
      assert.equal((await hub()).newGameIntro.firstSortie, undefined);
      await p.evaluate(() => {
        const add = IDBObjectStore.prototype.add;
        window.undoIntroFault = () => (IDBObjectStore.prototype.add = add);
        IDBObjectStore.prototype.add = function (...args) {
          if (this.name === "entries") {
            this.transaction.abort();
            throw new DOMException("fixture start abort", "AbortError");
          }
          return add.apply(this, args);
        };
      });
      await p.locator("#btn-start").click();
      await p.locator("#play-log-retry").waitFor();
      const candidate = await p.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem("wreckline.playLog.pending.v1"))
            .draft,
      );
      const startNonce =
        candidate.state.files["local:wreckline.hubSave.v3"].hub.newGameIntro
          .firstSortie.nonce;
      assert(startNonce);
      const confirmedStart = await p.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const r = indexedDB.open("wreckline.playLog.v1");
            r.onsuccess = () => {
              const db = r.result,
                q = db
                  .transaction("games")
                  .objectStore("games")
                  .get(localStorage.getItem("wreckline.playLog.active.v1"));
              q.onsuccess = () => {
                resolve(q.result.state.files["local:wreckline.hubSave.v3"].hub);
                db.close();
              };
              q.onerror = () => reject(q.error);
            };
            r.onerror = () => reject(r.error);
          }),
      );
      assert.equal(
        confirmedStart.newGameIntro.firstSortie,
        undefined,
        "failed first start remains unconfirmed",
      );

      await p.evaluate(() => window.undoIntroFault());
      await navigateClick(p.locator("#play-log-retry"));
      assert.equal((await hub()).newGameIntro.firstSortie.nonce, startNonce);
      assert.equal((await hub()).newGameIntro.firstSortie.leaderId, leader);
      await p.locator("#play-log-panel").evaluate((el) => (el.open = true));
      const download = p.waitForEvent("download");
      await p.locator("#play-log-export").click();
      const file = await (await download).path();
      execFileSync(
        path.join(root, "node_modules/.bin/tsx"),
        [path.join(root, "scripts/verify-play-log-export.ts"), file],
        { cwd: root },
      );
      const exported = JSON.parse(fs.readFileSync(file));
      assert.equal(
        exported.entries.filter((e) => e.kind === "sortie.start").length,
        1,
      );
      assert.equal(
        exported.game.initial.files["local:wreckline.hubSave.v3"].hub.credits,
        0,
      );
      assert.equal(
        exported.game.initial.files["local:wreckline.hubSave.v3"].hub
          .unopenedContainers,
        10,
      );
      assert.equal(
        exported.game.state.files["local:wreckline.hubSave.v3"].hub.newGameIntro
          .firstSortie.nonce,
        startNonce,
      );
      console.error("verified initial sortie and full replay", mobile);
      await p.screenshot({
        path: `/tmp/intro-first-sortie-${mobile ? "mobile" : "desktop"}.png`,
      });
      const oldGameId = await p.evaluate(() =>
        localStorage.getItem("wreckline.playLog.active.v1"),
      );
      await p.locator("#play-log-panel").evaluate((el) => (el.open = true));
      await p.locator("#play-log-new").click();
      await p.waitForURL(base);
      await ready();
      assert.deepEqual((await hub()).fleet, []);
      assert.equal((await hub()).credits, 0);
      assert.equal((await hub()).unopenedContainers, 10);
      assert.notEqual(
        await p.evaluate(() =>
          localStorage.getItem("wreckline.playLog.active.v1"),
        ),
        oldGameId,
      );
      assert.equal(errors.length, 0);
      results.push({
        viewport: mobile ? "390x844" : "1280x900",
        status: "PASS",
        scope:
          "Fresh assets, direct/forced gates, skip cancellation, split 4+6 zero harvest, reward abort/retry, 300 armor purchases and mech creation, 1x1 craft/Restore/equip/paid supplies, actual first sortie abort/retry, exported full replay, explicit new game",
        errors,
      });
      await ctx.close();
    }
    // Nonzero natural harvest and a purchased container cannot contaminate the initial batch.
    {
      const ctx = await b.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      await ctx.route(base + "**", async (route) => {
        const u = new URL(route.request().url());
        await route.fulfill({
          response: await ctx.request.get(
            local + u.pathname.slice(prefix.length) + u.search,
          ),
        });
      });
      const p = await ctx.newPage();
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
      const nav = async (selector) => {
        await Promise.all([
          p.waitForNavigation({ waitUntil: "domcontentloaded" }),
          p.locator(selector).click(),
        ]);
        await ready();
      };
      await p.goto(base);
      await ready();
      await p.locator("#input-sort-unopened").fill("3");
      await nav("#btn-sort-unopened");
      // Add one more initial container, then cancel all four: no opened count or stock loss.
      await nav("#btn-add-hub-container");
      assert.equal((await hub()).newGameIntro.opening.initialCount, 4);
      await nav("#btn-skip-cargo-hub");
      assert.equal((await hub()).unopenedContainers, 10);
      assert.equal((await hub()).newGameIntro.initialOpened, 0);
      await p.locator("#input-sort-unopened").fill("3");
      await nav("#btn-sort-unopened");
      await p.locator("#btn-start").click();
      await ready();
      await p.waitForFunction(
        () => !document.querySelector(".board.clearing,.board.settling"),
      );
      const pair = await p.evaluate(() => {
        const grid = document.querySelector(".board");
        const board = Array.from(
            grid.querySelectorAll("button[data-idx]"),
            (el) =>
              ["ammo", "armor", "power", "junk"].find((k) =>
                el.classList.contains(k),
              ) ?? null,
          ),
          c = Number(grid.style.getPropertyValue("--cols")),
          rows = board.length / c;
        const match = (b) => {
          for (let y = 0; y < rows; y++)
            for (let x = 0; x < c; x++) {
              const k = b[y * c + x];
              if (!k || k === "junk") continue;
              if (x + 2 < c && b[y * c + x + 1] === k && b[y * c + x + 2] === k)
                return true;
              if (
                y + 2 < rows &&
                b[(y + 1) * c + x] === k &&
                b[(y + 2) * c + x] === k
              )
                return true;
            }
          return false;
        };
        for (let i = 0; i < board.length; i++)
          for (const j of [i + 1, i + c]) {
            if (board[i] == null) continue;
            if (
              j >= board.length ||
              (j === i + 1 && Math.floor(i / c) !== Math.floor(j / c))
            )
              continue;
            const copy = [...board];
            [copy[i], copy[j]] = [copy[j], copy[i]];
            if (match(copy)) return [i, j];
          }
        return null;
      });
      assert(
        pair,
        "natural board must offer a real matching swap for this verification",
      );
      const beforePointer = await p
        .locator("button.cell[data-idx]")
        .evaluateAll((els) => els.map((el) => el.className));
      const firstBox = await p.locator(`[data-idx="${pair[0]}"]`).boundingBox();
      await p.mouse.move(
        firstBox.x + firstBox.width / 2,
        firstBox.y + firstBox.height / 2,
      );
      await p.mouse.down();
      await p.mouse.move(
        firstBox.x + firstBox.width / 2 + 30,
        firstBox.y + firstBox.height / 2 + 30,
        { steps: 4 },
      );
      await p.mouse.up();
      assert.equal(
        await p.locator(".cell.selected").count(),
        0,
        "rejected diagonal does not turn into a tap",
      );
      assert.deepEqual(
        await p
          .locator("button.cell[data-idx]")
          .evaluateAll((els) => els.map((el) => el.className)),
        beforePointer,
      );
      await p.locator(`[data-idx="${pair[0]}"]`).tap();
      assert.equal(
        await p.locator(".cell.selected").count(),
        1,
        "native touch selects once",
      );
      await p.locator(`[data-idx="${pair[0]}"]`).press("Enter");
      assert.equal(
        await p.locator(".cell.selected").count(),
        0,
        "keyboard click remains usable after pointer capture",
      );
      const aBox = await p.locator(`[data-idx="${pair[0]}"]`).boundingBox(),
        bBox = await p.locator(`[data-idx="${pair[1]}"]`).boundingBox();
      await p.mouse.move(aBox.x + aBox.width / 2, aBox.y + aBox.height / 2);
      await p.mouse.down();
      await p.mouse.move(bBox.x + bBox.width / 2, bBox.y + bBox.height / 2, {
        steps: 5,
      });
      await p.mouse.up();

      await p.locator("#btn-finish").click();
      await ready();
      assert((await hub()).newGameIntro.initialHarvest > 0);
      await nav("#btn-hangar");
      const harvested = (await hub()).inventory;
      let sold = 0;
      for (const id of ["ammo", "armor", "power", "junk"]) {
        for (let i = 0; i < (harvested[id] ?? 0) && sold < 3; i++) {
          await nav(
            `[data-four-resource-action="sell"][data-four-resource-id="${id}"]`,
          );
          sold++;
        }
      }
      assert.equal(sold, 3);
      assert.equal((await hub()).credits, 15);
      await p.locator("#input-buy-unopened").fill("1");
      await p.locator("#btn-buy-unopened").click();
      await ready();
      assert.equal((await hub()).unopenedContainers, 8);
      await p.locator("#input-sort-unopened").fill("8");
      await p.locator("#btn-sort-unopened").click();
      await ready();
      assert.equal((await hub()).unopenedContainers, 8);
      assert.equal((await hub()).newGameIntro.opening, undefined);
      assert(
        (await p.locator("body").innerText()).includes(
          "初期支給分は購入分と別に開封",
        ),
      );
      await p.locator("#input-sort-unopened").fill("7");
      await nav("#btn-sort-unopened");
      assert.equal((await hub()).unopenedContainers, 1);
      assert.equal(
        await p.locator("#btn-add-hub-container").count(),
        0,
        "purchased stock is excluded from the initial batch",
      );
      await p.locator("#btn-start").click();
      await ready();
      await p.locator("#btn-finish").click();
      await ready();
      await nav("#btn-hangar");
      assert.equal((await hub()).credits, 0);
      assert.equal((await hub()).newGameIntro.initialOpened, 10);
      assert.equal((await hub()).newGameIntro.zeroHarvestAwarded, false);
      assert.equal((await hub()).unopenedContainers, 1);
      const initialHarvest = (await hub()).newGameIntro.initialHarvest;
      await p.locator("#input-sort-unopened").fill("1");
      await nav("#btn-sort-unopened");
      const canceledNormalId = new URL(p.url()).searchParams.get(
        "introOpening",
      );
      assert.equal((await hub()).newGameIntro.opening.initialCount, 0);
      await nav("#btn-skip-cargo-hub");
      assert.equal((await hub()).unopenedContainers, 1);
      await p.locator("#input-sort-unopened").fill("1");
      await nav("#btn-sort-unopened");
      assert.notEqual(
        new URL(p.url()).searchParams.get("introOpening"),
        canceledNormalId,
      );
      await p.locator("#btn-start").click();
      await ready();
      await p.locator("#btn-finish").click();
      await ready();
      const completedUrl = await p.locator("#btn-hangar").getAttribute("href");
      await nav("#btn-hangar");
      const afterNormal = await hub();
      assert.equal(afterNormal.unopenedContainers, 0);
      assert.equal(afterNormal.newGameIntro.initialHarvest, initialHarvest);
      assert.equal(afterNormal.newGameIntro.zeroHarvestAwarded, false);
      assert.equal(afterNormal.credits, 0);
      assert.equal(afterNormal.newGameIntro.results.length, 0);
      await p.goto(completedUrl);
      await ready();
      assert.deepEqual(await hub(), afterNormal);
      results.push({
        viewport: "390x844",
        status: "PASS",
        scope:
          "Natural nonzero harvest using native touch/keyboard/mouse swipe, rejected diagonal unchanged, sell/buy reinvestment, initial-only addition and cancellation, mixed batch rejection, purchased stock excluded, normal paid batch IDs/cancel/receive-once, no false zero-harvest award",
      });
      await ctx.close();
    }
    for (const routePath of [
      "explore/?deployableMechs=3&startingAmmo=999",
      "invade/?fromHub=1&deployableMechs=3",
    ]) {
      const ctx = await b.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      await ctx.route(base + "**", async (route) => {
        const u = new URL(route.request().url());
        await route.fulfill({
          response: await ctx.request.get(
            local + u.pathname.slice(prefix.length) + u.search,
          ),
        });
      });
      const p = await ctx.newPage();
      await p.goto(base + routePath);
      await p.waitForURL(base);
      await p.waitForFunction(
        () =>
          document.querySelector("#new-game-guide") &&
          !document.querySelector("#play-log-blocker"),
      );
      const state = await p.evaluate(
        () => JSON.parse(localStorage.getItem("wreckline.hubSave.v3")).hub,
      );
      assert.equal(state.credits, 0);
      assert.equal(state.unopenedContainers, 10);
      assert.deepEqual(state.fleet, []);
      assert.deepEqual(state.circuits, []);
      results.push({
        status: "PASS",
        scope:
          "Cold orphaned combat URL redirects to normal zero-asset introduction, no demo wallet or units",
        route: routePath,
      });
      await ctx.close();
    }
    console.log(JSON.stringify({ status: "PASS", results }, null, 2));
  } finally {
    await b.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
