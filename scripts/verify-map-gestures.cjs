/** PR5 gestures: Explore map zoom by double-tap / pinch (mobile) / wheel (desktop); view-only (checkpoint camera stays 720×420); no page zoom outside the map. */
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
      for (let i = 0; i < 2; i++) { await p.locator("#btn-buy-mech").click(); await p.waitForTimeout(800); }
      await p.locator("#btn-select-all").click(); await p.waitForTimeout(800);
      await p.locator("#link-deploy").click();
      await p.locator("#btn-start").waitFor({ timeout: 15000 }); await p.locator("#btn-start").click();
      const map = p.locator("canvas#map");
      await p.waitForFunction(() => document.querySelector("canvas#map")?.dataset.mapZoom === "1.00", null, { timeout: 15000 }).catch(async () => { await map.click({ position: { x: 5, y: 5 } }); });
      await map.scrollIntoViewIfNeeded();
      const zoom = () => map.getAttribute("data-map-zoom").then(Number);
      const box = await map.boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const dbl = async () => { if (mobile) { await p.touchscreen.tap(cx, cy); await p.waitForTimeout(80); await p.touchscreen.tap(cx, cy); } else { await p.mouse.click(cx, cy); await p.waitForTimeout(80); await p.mouse.click(cx, cy); } await p.waitForTimeout(200); };
      assert.equal(await zoom(), 1, "starts at 1×");
      await dbl(); assert.equal(await zoom(), 2, "double-tap → 2×");
      await dbl(); assert.equal(await zoom(), 1, "double-tap again → 1×");
      await p.waitForTimeout(400);
      if (mobile) {
        // Pinch out with two touch points via CDP.
        const cdp = await ctx.newCDPSession(p);
        const pts = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(30) });
        for (const d of [45, 60, 75, 90]) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d) }); await p.waitForTimeout(30); }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await p.waitForTimeout(200);
        const z = await zoom(); assert.ok(z >= 2.4 && z <= 2.5, "pinch out ×3 → clamped 2.5: " + z);
      } else {
        await p.mouse.move(cx, cy);
        for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, -100); await p.waitForTimeout(60); }
        const z = await zoom(); assert.ok(z > 1.5 && z <= 2.5, "wheel up zooms in: " + z);
      }
      assert.equal(await p.evaluate(() => window.visualViewport ? window.visualViewport.scale : 1), 1, "page itself not zoomed");
      // Outside the map: double-tap does not zoom the map or the page.
      const zIn = await zoom();
      const hud = p.locator(".hud").first(); const hb = await hud.boundingBox();
      if (mobile) { await p.touchscreen.tap(hb.x + 5, hb.y + 5); await p.touchscreen.tap(hb.x + 5, hb.y + 5); }
      else await p.mouse.dblclick(hb.x + 5, hb.y + 5);
      await p.waitForTimeout(300);
      // (a tap outside may pause/resume the sortie; zoom must not change)
      assert.equal(await zoom(), zIn, "no map zoom from outside taps");
      assert.equal(await p.evaluate(() => window.visualViewport ? window.visualViewport.scale : 1), 1);
      // Checkpoint: hide → checkpoint written with the base camera, not the zoomed view.
      await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); });
      await p.waitForTimeout(1200);
      const cam = await p.evaluate((c) => { const raw = JSON.parse(window.__native().getItem(c)); const find = (o) => { if (!o || typeof o !== "object") return null; if (o.camera && typeof o.camera.w === "number") return o.camera; for (const v of Object.values(o)) { const r = find(v); if (r) return r; } return null; }; return find(raw); }, CK);
      assert.ok(cam && cam.w === 720 && cam.h === 420, "checkpoint camera is the base 720×420: " + JSON.stringify(cam));
      await p.screenshot({ path: `/tmp/gest-${mobile ? "m" : "d"}.png` });
      results.push({ viewport: mobile ? "390x844" : "1280x900", status: "PASS", zoomAfter: zIn });
      await ctx.close();
    }
  } finally { await b.close(); server.close(); }
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
