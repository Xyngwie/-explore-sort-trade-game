/** PR3 mech gauge: HUB fleet card shows the gauge; tap shows numbers for 1.5s then hides; no save change. */
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
  const results = [];
  try {
    for (const mobile of [false, true]) {
      const ctx = await b.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
      await ctx.addInitScript(() => { const n = localStorage; window.__native = () => n; });
      const p = await ctx.newPage();
      await p.goto(local);
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
      results.push({ viewport: mobile ? "390x844" : "1280x900", status: "PASS", text });
      await ctx.close();
    }
    console.log(JSON.stringify({ mechGauge: results }, null, 2));
  } finally {
    await b.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
