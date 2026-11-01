/** PC 2-column HUB（神宮決定 2026-11-01）: ≥1200px → left tree/hangar, right 作戦室・未開封・市場, max 1440px; mobile unchanged; save kept. */
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
    for (const [mobile, w] of [[false, 1600], [false, 1280], [false, 1100], [true, 390]]) {
      const ctx = await b.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: w, height: 900 }, isMobile: mobile, hasTouch: mobile });
      await ctx.addInitScript(() => { const n = localStorage; window.__native = () => n; });
      await ctx.route(base + "**", async (route) => { const u = new URL(route.request().url()); const response = await route.fetch({ url: local + u.pathname.slice(prefix.length) + u.search }); await route.fulfill({ response }); });
      const p = await ctx.newPage();
      p.on("dialog", (d) => d.accept());
      await p.goto(base);
      const K = "wreckline.hubSave.v3", CK = "estg.sortieCheckpoint";
      await p.waitForFunction((k) => !!localStorage.getItem(k), K);
      await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.hub.credits = 1e6; s.hub.newGameIntro = { ...s.hub.newGameIntro, initialOpened: 10, firstSortie: { nonce: "n", leaderId: "l", circuitId: "c" } }; s.hub.inventory = { ...s.hub.inventory, ammo: 500 }; localStorage.setItem(k, JSON.stringify(s)); }, K);
      await p.waitForTimeout(1500); await p.reload(); await p.waitForTimeout(800);
      await p.waitForSelector("#four-resource-trade"); await p.waitForTimeout(500);
      const lay = await p.evaluate(() => { const L = document.getElementById("hub-col-left"), R = document.getElementById("hub-col-right"); const inR = (id) => !!R && R.contains(document.getElementById(id)); return { two: !!L && !!R, body: document.body.clientWidth, lRight: L ? L.getBoundingClientRect().right : 0, lW: L ? L.getBoundingClientRect().width : 0, rW: R ? R.getBoundingClientRect().width : 0, rLeft: R ? R.getBoundingClientRect().left : 0, tree: !!L && L.contains(document.getElementById("hub-tree")), unopened: inR("unopened-panel"), market: inR("four-resource-trade"), sortie: !!R && !!R.querySelector(".sortie-card"), docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
      const wide = !mobile && w >= 1200;
      assert.equal(lay.two, wide, "2-column only at ≥1200px " + JSON.stringify(lay));
      assert.ok(lay.docOver <= 0, "no horizontal overflow");
      if (wide) { assert.ok(lay.rLeft >= lay.lRight, "right column beside left"); assert.ok(Math.abs(lay.lW / lay.rW - 1.5) < 0.1 && lay.lW > 500, "3:2 columns, not squeezed " + JSON.stringify(lay)); assert.ok(lay.tree && lay.unopened && lay.market && lay.sortie, JSON.stringify(lay)); assert.ok(lay.body <= 1440 && lay.body > 960, "max width 1440: " + lay.body); }
      else assert.ok(lay.body <= 960, "single column keeps 960px");
      assert.ok(await p.evaluate(() => { const a = document.getElementById("hub-anchor-squad"); return !!a && !!a.nextElementSibling && a.nextElementSibling.classList.contains("sortie-card"); }), "tree 第1小隊 anchor stays next to 作戦室");
      // Buttons still work after re-parenting: buy a mech.
      const n0 = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).hub.fleet.length, K);
      await p.locator("#btn-buy-mech").click(); await p.waitForTimeout(800);
      assert.equal(await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).hub.fleet.length, K), n0 + 1, "buy works in columns");
      assert.equal(await p.evaluate(() => !!document.getElementById("hub-col-right")), wide, "columns re-applied after render");
      await p.screenshot({ path: `/tmp/2col-${mobile ? "m" : w}.png` });
      results.push({ viewport: mobile ? "390x844" : w + "x900", status: "PASS", two: lay.two });
      await ctx.close();
    }
  } finally { await b.close(); server.close(); }
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
