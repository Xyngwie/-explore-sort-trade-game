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
    const ctx = await b.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      acceptDownloads: true,
    });
    await ctx.route(base + "**", async (route) => {
      const u = new URL(route.request().url());
      await route.fulfill({
        response: await ctx.request.get(
          local + u.pathname.slice(prefix.length) + u.search,
        ),
      });
    });
    const p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
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
    await p.locator("#input-sort-unopened").fill("10");
    await nav("#btn-sort-unopened");
    await p.locator("#btn-start").click();
    await ready();
    let swaps = 0;
    while (swaps < 20 && (await p.locator("#btn-finish").count())) {
      await p.waitForFunction(
        () => !document.querySelector(".board.clearing,.board.settling"),
      );
      if (!(await p.locator("#btn-finish").count())) break;
      const pair = await p.evaluate(() => {
        const grid = document.querySelector(".board"),
          board = Array.from(
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
            if (
              board[i] == null ||
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
      if (!pair) break;
      await p.locator(`[data-idx="${pair[0]}"]`).click();
      await p.locator(`[data-idx="${pair[1]}"]`).click();
      swaps++;
    }
    if (await p.locator("#btn-finish").count()) {
      await p.locator("#btn-finish").click();
      await ready();
    }
    await nav("#btn-hangar");
    const harvest = (await hub()).newGameIntro.initialHarvest;
    assert(harvest > 0);
    assert.equal((await hub()).credits, 0);
    assert.equal((await hub()).newGameIntro.zeroHarvestAwarded, false);
    for (const id of ["ammo", "armor", "power", "junk"])
      while (((await hub()).inventory[id] ?? 0) > 0)
        await nav(
          `[data-four-resource-action="sell"][data-four-resource-id="${id}"]`,
        );
    const harvestCredits = (await hub()).credits;
    assert(harvestCredits >= 18);
    let crafts = 0;
    while ((await hub()).credits < 2400) {
      assert(
        crafts < 400,
        "normal existing +7c cycle should reach mech/material costs",
      );
      const before = (await hub()).credits;
      await nav(
        '[data-four-resource-action="buy"][data-four-resource-id="junk"]',
      );
      await nav(
        '[data-four-resource-action="buy"][data-four-resource-id="junk"]',
      );
      await p.locator("#junk-circuit-craft-size").selectOption("1");
      await nav("[data-junk-circuit-craft]");
      const c = (await hub()).circuits[0];
      assert.equal(c.restoreState, "unrestored");
      await p
        .locator(`[data-act="sell-circuit"][data-id="${c.circuitId}"]`)
        .click();
      await ready();
      assert.equal((await hub()).credits, before + 7);
      crafts++;
      if (crafts % 25 === 0)
        console.error(
          "normal economy +7c cycles",
          crafts,
          (await hub()).credits,
        );
    }
    for (let i = 0; i < 300; i++)
      await nav(
        '[data-four-resource-action="buy"][data-four-resource-id="armor"]',
      );
    await p.locator("#btn-create-mech").click();
    await ready();
    assert.equal((await hub()).fleet.length, 1);
    assert.equal((await hub()).circuits.length, 0);
    for (let i = 0; i < 2; i++)
      await nav(
        '[data-four-resource-action="buy"][data-four-resource-id="junk"]',
      );
    for (let i = 0; i < 3; i++)
      await nav(
        '[data-four-resource-action="buy"][data-four-resource-id="ammo"]',
      );
    await p.locator("#junk-circuit-craft-size").selectOption("1");
    await nav("[data-junk-circuit-craft]");
    const circuit = (await hub()).circuits[0],
      leader = (await hub()).fleet[0].instanceId;
    await nav(`[data-circuit-open="${circuit.circuitId}"]`);
    for (let i = 0; i < 4; i++) {
      await p.locator(`[data-edge="${i}"]`).click();
      await ready();
    }
    await p.locator("#btn-bypass-hero").click();
    await ready();
    await nav("#link-return-trade");
    await p.locator("#circuit-equip-select").selectOption(circuit.circuitId);
    await p.locator("#circuit-equip-mech").selectOption(leader);
    await nav('[data-equip-action="equip"]');
    assert.equal((await hub()).fleet[0].currentAmmo, 3);
    assert.equal((await hub()).fleet[0].battery.activity, 300);
    await nav("#link-deploy");
    await p.locator("#btn-start").click();
    await ready();
    assert((await hub()).newGameIntro.firstSortie);
    assert.equal((await hub()).newGameIntro.zeroHarvestAwarded, false);
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
    assert.equal(errors.length, 0);
    results.push({
      status: "PASS",
      viewport: "390x844",
      normalHarvestOnly: true,
      debugFixture: false,
      freeGrants: false,
      zeroHarvestAward: false,
      initialHarvest: harvest,
      harvestCredits,
      actualSwaps: swaps,
      existingProfitCycles: crafts,
      records: exported.entries.length,
      finalCredits: (await hub()).credits,
      scope:
        "Actual normal opening/sales, existing 2 junk purchase + 1x1 craft +25c sale (+7c cycle), armor300+500c mech creation, Restore/equip/paid ammo, actual first sortie and full exported replay",
      errors,
    });
    console.log(JSON.stringify({ status: "PASS", results }, null, 2));
    await ctx.close();
  } finally {
    await b.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
