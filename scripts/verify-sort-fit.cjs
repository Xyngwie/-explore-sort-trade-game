/** SORT board fit (神宮決定 2026-11-02, docs/SORT_V0.md §8): 6×7 board and 精製を終える fully visible without scrolling on phone 390×844 and PC 1280×900 / 1600×900; hub save untouched, no checkpoint. */
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
    for (const vp of [{ w: 390, h: 844, m: true }, { w: 1280, h: 900, m: false }, { w: 1600, h: 900, m: false }]) {
      const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m });
      await ctx.addInitScript(() => { const n = localStorage; window.__native = () => n; });
      await ctx.route(base + "**", async (route) => { const u = new URL(route.request().url()); const response = await route.fetch({ url: local + u.pathname.slice(prefix.length) + u.search }); await route.fulfill({ response }); });
      const p = await ctx.newPage();
      p.on("dialog", (d) => d.accept());
      await p.goto(base);
      const K = "wreckline.hubSave.v3", CK = "estg.sortieCheckpoint";
      await p.waitForFunction((k) => !!localStorage.getItem(k), K);
      const save0 = await p.evaluate((k) => localStorage.getItem(k), K);
      await p.goto(base + "sort/?salvagedContainers=3&isExtracted=1");
      await p.locator("#btn-start").click(); await p.waitForTimeout(1500);
      const m = await p.evaluate(() => { const bd = document.querySelector(".board"), pn = document.getElementById("wl-shell-panel"), tabs = document.getElementById("wl-shell-tabs"); const r = bd.getBoundingClientRect(), pr = (pn || document.documentElement).getBoundingClientRect(); const bottomLimit = tabs && !tabs.hidden && tabs.getBoundingClientRect().height ? Math.min(pr.bottom, tabs.getBoundingClientRect().top) : Math.min(pr.bottom, innerHeight); const cells = bd.querySelectorAll(".cell"); const cs = getComputedStyle(bd).gridTemplateColumns.split(" ").length; return { top: r.top, bottom: r.bottom, limit: bottomLimit, panelTop: pr.top, scroll: pn ? pn.scrollTop : scrollY, cells: cells.length, cols: cs, cellPx: cells[0].getBoundingClientRect().width, boardW: r.width, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, panelOver: pn ? pn.scrollHeight - pn.clientHeight : 0, finishBottom: document.getElementById("btn-finish").getBoundingClientRect().bottom, header: !!document.querySelector(".chrome") && getComputedStyle(document.querySelector(".chrome")).display !== "none" }; });
      assert.equal(m.cols, 6, "6 columns"); assert.equal(m.cells, 42, "6×7 = 42 cells");
      assert.ok(m.top >= m.panelTop - 1 && m.bottom <= m.limit + 1 && m.scroll === 0, "board fully visible without scroll " + JSON.stringify(m));
      assert.ok(m.over <= 0, "no horizontal overflow");
      assert.ok(m.panelOver <= 1 && m.finishBottom <= m.limit + 1, "board + 精製を終える on one screen, panel does not scroll " + JSON.stringify(m));
      assert.equal(m.header, false, "page header hidden during play (6. 神宮決定 2026-11-02)");
      if (vp.m) assert.ok(m.cellPx >= 44, "phone cells ≥44px tap target " + m.cellPx);
      results.push({ viewport: vp.w + "x" + vp.h, ...m, status: "PASS" });
      await p.screenshot({ path: `/tmp/sortfit-${vp.w}.png` });
      assert.equal(await p.evaluate((k) => localStorage.getItem(k), K), save0, "SORT play does not touch the hub save before finishing");
      assert.equal(await p.evaluate((c) => window.__native().getItem(c), CK), null, "no sortie checkpoint");
      await ctx.close();
    }
  } finally { await b.close(); server.close(); }
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
