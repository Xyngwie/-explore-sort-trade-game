/** PR6 screen fit: page never scrolls (only #wl-shell-panel); hash/tree nav scroll the panel; play-log panel ≤ shell column; compact Alpha Lab strip; explore tabs shown on briefing, hidden after sortie start; save/checkpoint kept. */
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
      await ctx.route(base + "**", async (route) => { const u = new URL(route.request().url()); const response = await route.fetch({ url: local + u.pathname.slice(prefix.length) + u.search }); await route.fulfill({ response }); });
      const p = await ctx.newPage();
      p.on("dialog", (d) => d.accept());
      await p.goto(base);
      const K = "wreckline.hubSave.v3", CK = "estg.sortieCheckpoint";
      await p.waitForFunction((k) => !!localStorage.getItem(k), K);
      await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.hub.credits = 1e6; s.hub.newGameIntro = { ...s.hub.newGameIntro, initialOpened: 10, firstSortie: { nonce: "n", leaderId: "l", circuitId: "c" } }; s.hub.inventory = { ...s.hub.inventory, ammo: 500 }; localStorage.setItem(k, JSON.stringify(s)); }, K);
      await p.waitForTimeout(1500); await p.reload(); await p.waitForTimeout(800);
      const fit = () => p.evaluate(() => { const pn = document.getElementById("wl-shell-panel"), pl = document.getElementById("play-log-panel"), al = document.getElementById("shield-debug-console"); return { winY: window.scrollY, docTop: document.scrollingElement.scrollTop, docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth, panelTop: pn.scrollTop, panelOverX: pn.scrollWidth - pn.clientWidth, body: document.body.clientWidth, play: pl ? pl.getBoundingClientRect().width : 0, lab: al && !al.open ? al.getBoundingClientRect().height : 0 }; });
      let f = await fit();
      assert.equal(f.winY, 0); assert.equal(f.docTop, 0); assert.ok(f.docOver <= 0 && f.panelOverX <= 0, "no horizontal overflow " + JSON.stringify(f));
      assert.ok(f.play <= f.body, "play-log panel within shell column " + JSON.stringify(f));
      assert.ok(f.lab <= 40, "Alpha Lab strip compact " + JSON.stringify(f));
      await p.locator("#hub-tree [data-hub-node]").last().click(); await p.waitForTimeout(900);
      f = await fit(); assert.equal(f.winY, 0, "tree nav keeps window still"); assert.ok(f.panelTop > 0, "tree nav scrolls the panel " + JSON.stringify(f));
      await p.evaluate(() => { document.getElementById("wl-shell-panel").scrollTop = 0; });
      await p.goto(base + "#unopened-panel"); await p.locator("#unopened-panel").waitFor(); await p.waitForTimeout(900);
      f = await fit(); assert.equal(f.winY, 0); assert.ok(f.panelTop > 0, "hash load scrolls the panel " + JSON.stringify(f));
      const save0 = await p.evaluate((k) => localStorage.getItem(k), K);
      assert.ok(JSON.parse(save0).hub, "save intact");
      for (let i = 0; i < 2; i++) { await p.locator("#btn-buy-mech").click(); await p.waitForTimeout(800); }
      await p.locator("#btn-select-all").click(); await p.waitForTimeout(800);
      await p.locator("#link-deploy").click();
      await p.locator("#btn-start").waitFor({ timeout: 15000 });
      const tabs = () => p.evaluate(() => { const n = document.getElementById("wl-shell-tabs"); return !!n && !n.hidden && n.getBoundingClientRect().height > 0; });
      assert.equal(await tabs(), true, "tabs shown on briefing");
      assert.equal(await p.evaluate(() => window.scrollY), 0);
      await p.locator("#btn-start").click(); await p.waitForTimeout(800);
      assert.equal(await tabs(), false, "tabs hidden after sortie start");
      await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); });
      await p.waitForTimeout(1200);
      assert.ok(await p.evaluate((c) => !!window.__native().getItem(c), CK), "checkpoint written");
      await p.reload(); await p.waitForTimeout(1500);
      assert.equal(await tabs(), false, "resumed sortie keeps tabs hidden");
      await p.screenshot({ path: `/tmp/fit-${mobile ? "m" : "d"}.png` });
      results.push({ viewport: mobile ? "390x844" : "1280x900", status: "PASS" });
      await ctx.close();
    }
  } finally { await b.close(); server.close(); }
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });

