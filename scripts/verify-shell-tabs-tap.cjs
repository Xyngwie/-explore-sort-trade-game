/** Shell tab tap regression (PC test run-20261101-pc-fullscreen-shell-001): every enabled bottom tab is hit across its whole area (edges too) on DOCK/RESTORE/INVADE/explore briefing; an edge tap navigates; save and checkpoint kept. */
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
      const hit = () => p.evaluate(() => { const nav = document.getElementById("wl-shell-tabs"); if (!nav || nav.hidden) return ["no tabs"]; const bad = []; for (const b of nav.querySelectorAll("button")) { const r = b.getBoundingClientRect(); for (const fx of [0.05, 0.25, 0.5, 0.75, 0.95]) for (const fy of [0.15, 0.5, 0.85]) { const e = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy); if (e !== b) bad.push(`${b.textContent}@${fx},${fy}→${e ? e.id || e.className || e.tagName : "null"}`); } } return bad; });
      const core = () => p.evaluate((k) => { const h = JSON.parse(localStorage.getItem(k)).hub; return JSON.stringify({ c: h.credits, i: h.inventory, f: (h.fleet || []).map((m) => m.id) }); }, K); const save0 = await core();
      for (const sub of ["", "restore/", "invade/"]) {
        await p.goto(base + sub); await p.locator("#wl-shell-tabs").waitFor(); await p.waitForTimeout(2000);
        assert.deepEqual(await hit(), [], "tabs fully tappable on " + (sub || "trade"));
      }
      // Real edge tap on INVADE (where the CTA bar used to cover the tabs) → DOCK.
      const dock = p.locator("#wl-shell-tabs button", { hasText: "DOCK" }); const db = await dock.boundingBox();
      if (mobile) await p.touchscreen.tap(db.x + 4, db.y + db.height - 6); else await p.mouse.click(db.x + 4, db.y + db.height - 6);
      await p.waitForURL((u) => !/\/(invade|restore|explore|sort)\//.test(u.pathname), { timeout: 10000 });
      // CTA bar sits above the tab row, not under it.
      await p.goto(base + "invade/"); await p.waitForTimeout(2000);
      const gap = await p.evaluate(() => { const bar = document.querySelector(".cell-sortie-bar"), nav = document.getElementById("wl-shell-tabs"); return bar && getComputedStyle(bar).position === "fixed" ? nav.getBoundingClientRect().top - bar.getBoundingClientRect().bottom : null; });
      assert.ok(gap === null || gap >= 0, "invade CTA bar above tabs: " + gap);
      await p.goto(base); await p.waitForTimeout(1500);
      assert.equal(await core(), save0, "tab navigation keeps the save (credits/inventory/fleet)");
      for (let i = 0; i < 2; i++) { await p.locator("#btn-buy-mech").click(); await p.waitForTimeout(800); }
      await p.locator("#btn-select-all").click(); await p.waitForTimeout(800);
      await p.locator("#link-deploy").click();
      await p.locator("#btn-start").waitFor({ timeout: 15000 });
      assert.deepEqual(await hit(), [], "tabs fully tappable on explore briefing");
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
      await p.screenshot({ path: `/tmp/tabtap-${mobile ? "m" : "d"}.png` });
      results.push({ viewport: mobile ? "390x844" : "1280x900", status: "PASS" });
      await ctx.close();
    }
  } finally { await b.close(); server.close(); }
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });

