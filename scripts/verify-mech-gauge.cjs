/** PR3 mech gauge: HUB fleet card and Explore wingman card show the gauge; levels match; tap shows numbers 1.5s, never selects; no save/checkpoint change. */
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
    b = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
  const base = "https://xyngwie.github.io" + prefix;
  const results = [];
  try {
    for (const mobile of [false, true]) {
      const ctx = await b.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
      await ctx.addInitScript(() => { const n = localStorage; window.__native = () => n; });
      // Explore redirects to the production base, so run everything on that origin, served locally.
      await ctx.route(base + "**", async (route) => { const u = new URL(route.request().url()); const response = await route.fetch({ url: local + u.pathname.slice(prefix.length) + u.search }); await route.fulfill({ response }); });
      const p = await ctx.newPage();
      p.on("dialog", (d) => d.accept());
      await p.goto(base);
      await p.waitForFunction(() => !!localStorage.getItem("wreckline.hubSave.v3"));
      await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("wreckline.hubSave.v3")); s.hub.credits = 1e6; localStorage.setItem("wreckline.hubSave.v3", JSON.stringify(s)); });
      await p.waitForTimeout(1500); await p.reload();
      await p.locator("#btn-buy-mech").click();
      await p.waitForTimeout(1500);
      const g = p.locator(".fleet-row .mech-gauge").first();
      await g.waitFor({ timeout: 15000 });
      await p.waitForTimeout(1500);
      const save0 = await p.evaluate(() => window.__native().getItem("wreckline.hubSave.v3"));
      const text = await g.getAttribute("data-mech-gauge");
      assert.match(text, /^装甲 \d+\/\d+ · 電力 \d+\/\d+ · 弾薬 \d+\/\d+$/);
      const box = await g.boundingBox();
      assert.ok(Math.abs(box.width - 48) <= 1, "44px + padding: " + box.width);
      await g.scrollIntoViewIfNeeded(); await g.click();
      assert.equal(await p.locator("#mech-gauge-tip").textContent(), text);
      await p.waitForTimeout(1700);
      assert.equal(await p.locator("#mech-gauge-tip").count(), 0, "hidden after 1.5s");
      assert.equal(await p.evaluate(() => window.__native().getItem("wreckline.hubSave.v3")), save0, "display only");
      await p.screenshot({ path: `/tmp/gauge-${mobile ? "m" : "d"}.png` });
      // --- Explore wingman card during a real sortie (DOCK → 出撃). ---
      const K = "wreckline.hubSave.v3", CK = "estg.sortieCheckpoint";
      await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.hub.newGameIntro = { ...s.hub.newGameIntro, initialOpened: 10, firstSortie: { nonce: "n", leaderId: "l", circuitId: "c" } }; s.hub.inventory = { ...s.hub.inventory, ammo: 500 }; localStorage.setItem(k, JSON.stringify(s)); }, K);
      await p.waitForTimeout(1500); await p.reload(); await p.waitForTimeout(800);
      for (let i = 0; i < 2; i++) { await p.locator("#btn-buy-mech").click(); await p.waitForTimeout(800); }
      await p.locator("#btn-select-all").click(); await p.waitForTimeout(800);
      // Detail 8: HUB leader (first selected deploy mech) has the white outline; the other cards don't.
      const lead = await p.evaluate(() => { const sel = [...document.querySelectorAll('.fleet-row input[data-act=select]:checked')].map((e) => e.dataset.id); return { sel, outlined: [...document.querySelectorAll(".fleet-row")].filter((r) => r.querySelector(".mech-gauge .mg-leader")).map((r) => r.dataset.id), rows: document.querySelectorAll(".fleet-row").length }; });
      assert.ok(lead.sel.length >= 2 && lead.rows >= 2, JSON.stringify(lead));
      assert.deepEqual(lead.outlined, [lead.sel[0]], "only the HUB leader card is outlined: " + JSON.stringify(lead));
      await p.locator("#link-deploy").click();
      await p.locator("#btn-start").waitFor({ timeout: 15000 });
      await p.locator("#btn-start").click();
      const wg = p.locator(".wing-card .mech-gauge");
      await wg.first().waitFor({ timeout: 15000 });
      const cards = await p.locator(".wing-card").count();
      assert.ok(cards >= 2 && (await wg.count()) === cards, "one gauge per wingman card");
      // Levels match the mech state (HP meter attrs + sortie ammo cap 28 / battery cap).
      for (let i = 0; i < cards; i++) {
        // Read meter attrs + gauge text atomically (the panel re-renders via innerHTML).
        const [hp, hpMax, t, rings] = await p.evaluate((i) => { const r = document.querySelectorAll(".wing-card .wing-gauge")[i]; return [+r.getAttribute("aria-valuenow"), +r.getAttribute("aria-valuemax"), r.querySelector(".mech-gauge").getAttribute("data-mech-gauge"), r.querySelectorAll(".mg-ring").length]; }, i);
        const m = t.match(/^装甲 (\d+)\/(\d+) · 電力 (\d+)\/(\d+) · 弾薬 (\d+)\/(\d+)$/);
        assert.ok(m, t);
        assert.equal(+m[2], hpMax, `${mobile} card${i} ${t} aria ${hp}/${hpMax}`); assert.ok(Math.abs(+m[1] - hp) <= 1, t + " vs hp " + hp);
        assert.ok(+m[6] > 0 && +m[5] <= +m[6] && +m[3] <= +m[4] && +m[4] > 0, t);
        // ring arc length follows armor (full at start → a ring path exists)
        assert.equal(rings, +m[1] > 0 ? 1 : 0);
      }
      assert.equal(await p.locator(".wing-card .mg-leader").count(), 0, "Explore wingman cards have no leader outline");
      const wText = await wg.first().getAttribute("data-mech-gauge");
      // Real tap while running: shows text, card not selected.
      const sel0 = await p.locator(".wing-card.selected").count();
      await wg.first().click();
      assert.match(await p.locator("#mech-gauge-tip").textContent(), /^装甲 \d+\/\d+ · 電力 \d+\/\d+ · 弾薬 \d+\/\d+$/);
      assert.equal(await p.locator(".wing-card.selected").count(), sel0, "tap does not select the card");
      await p.waitForTimeout(1700);
      assert.equal(await p.locator("#mech-gauge-tip").count(), 0, "explore tip hidden after 1.5s");
      // Paused (hidden → checkpoint written, sim stopped): a gauge tap changes no save / checkpoint.
      await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); });
      await p.waitForTimeout(1500);
      const snap = () => p.evaluate(([k, c]) => [window.__native().getItem(k), window.__native().getItem(c)], [K, CK]);
      const s0 = await snap();
      assert.ok(s0[1], "checkpoint exists");
      await p.evaluate(() => document.querySelector(".wing-card .mech-gauge").click());
      assert.equal(await p.locator("#mech-gauge-tip").count(), 1);
      await p.waitForTimeout(1700);
      assert.deepEqual(await snap(), s0, "save + checkpoint unchanged by gauge tap");
      await p.screenshot({ path: `/tmp/gauge-explore-${mobile ? "m" : "d"}.png` });
      results.push({ viewport: mobile ? "390x844" : "1280x900", status: "PASS", text, wingCards: cards, wingText: wText });
      await ctx.close();
    }
    console.log(JSON.stringify({ mechGauge: results }, null, 2));
  } finally {
    await b.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
