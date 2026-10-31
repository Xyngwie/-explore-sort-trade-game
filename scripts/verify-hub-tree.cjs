/** PR4 HUB tree: 母艦 → 第1小隊/予備格納庫/回路保管庫/物資市場; each node scrolls to its section (物資市場 = Trade market, Q12); taps never write save/checkpoint; shown during the #332 intro. */
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
      // Fresh game (#332 intro running): tree is there and the intro guide stays.
      await p.locator("#hub-tree").waitFor();
      assert.equal(await p.locator("#new-game-guide").count(), 1, "#332 guide kept");
      await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.hub.credits = 1e6; localStorage.setItem(k, JSON.stringify(s)); }, K);
      await p.waitForTimeout(1500); await p.reload(); await p.locator("#hub-tree").waitFor();
      for (let i = 0; i < 3; i++) { await p.locator("#btn-buy-mech").click(); await p.waitForTimeout(700); }
      await p.locator(".fleet-row input[data-act=select]:not([disabled])").first().check(); await p.waitForTimeout(1500);
      const labels = await p.locator("#hub-tree [data-hub-node]").evaluateAll((e) => e.map((x) => x.textContent.trim()));
      assert.equal(await p.locator("#hub-tree .hub-tree-root").textContent(), "母艦（キャリア）");
      assert.deepEqual(labels.map((l) => l.replace(/\d+(機|枚)$/, "")), ["第1小隊", "予備格納庫", "回路保管庫", "物資市場"]);
      const sel = await p.locator(".fleet-row input[data-act=select]:checked").count(), rows = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).hub.fleet.length, K);
      assert.equal(labels[0], `第1小隊${sel}機`, JSON.stringify({labels, sel, rows})); assert.equal(labels[1], `予備格納庫${rows - sel}機`, JSON.stringify({labels, sel, rows}));
      await p.waitForTimeout(1500);
      const snap = () => p.evaluate(([k, c]) => [window.__native().getItem(k), window.__native().getItem(c)], [K, CK]);
      const s0 = await snap();
      const want = { squad: "#hub-anchor-squad + *", reserve: "#hub-anchor-reserve + .card", circuits: "#hub-anchor-circuits + .card", market: "#four-resource-trade" };
      for (const [key, sel2] of Object.entries(want)) {
        await p.locator(`#hub-tree [data-hub-node=${key}]`).click();
        assert.equal(await p.locator(sel2).first().evaluate((e) => e.classList.contains("hub-tree-flash")), true, key + " flashes");
        await p.waitForTimeout(900);
        assert.equal(await p.evaluate(() => document.body.dataset.hubTreeLast), key);
        const top = await p.locator(sel2).first().evaluate((e) => e.getBoundingClientRect().top);
        assert.ok(top >= -2 && top < 260, `${key} scrolled into view (top ${top})`);
      }
      assert.match(await p.locator("#four-resource-trade").textContent(), /売却|購入/, "物資市場 = current Trade market card");
      assert.equal(p.url().startsWith(base), true, "stays on the Trade page");
      // Two quick taps → exactly one flashing section; normal motion clears it on animationend.
      await p.locator("#hub-tree [data-hub-node=squad]").click(); await p.locator("#hub-tree [data-hub-node=circuits]").click();
      assert.equal(await p.locator(".hub-tree-flash").count(), 1, "one flash after two taps");
      await p.waitForTimeout(1200);
      assert.equal(await p.locator(".hub-tree-flash").count(), 0, "flash cleared after animation");
      // Reduced motion: no animationend, so the outline stays — but never piles up.
      await p.emulateMedia({ reducedMotion: "reduce" });
      for (const k of ["squad", "reserve", "circuits", "market"]) { await p.locator(`#hub-tree [data-hub-node=${k}]`).click(); await p.waitForTimeout(150); }
      assert.equal(await p.locator(".hub-tree-flash").count(), 1, "reduced motion: exactly one outlined section");
      assert.equal(await p.locator("#four-resource-trade").evaluate((e) => e.classList.contains("hub-tree-flash")), true);
      await p.emulateMedia({ reducedMotion: "no-preference" });
      assert.deepEqual(await snap(), s0, "tree taps write no save / checkpoint");
      await p.locator("#hub-tree [data-hub-node=market]").click(); await p.waitForTimeout(600);
      await p.screenshot({ path: `/tmp/hubtree-${mobile ? "m" : "d"}.png` });
      await p.evaluate(() => document.getElementById("wl-shell-panel")?.scrollTo(0, 0));
      await p.screenshot({ path: `/tmp/hubtree-top-${mobile ? "m" : "d"}.png` });
      results.push({ viewport: mobile ? "390x844" : "1280x900", status: "PASS", labels });
      await ctx.close();
    }
  } finally { await b.close(); server.close(); }
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
