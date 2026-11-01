/** Sortie-guard guidance（暫定 ★）: Explore briefing refuses 出撃 (no repaired circuit on leader) → 格納庫へ → HUB banner 「回路が未装備です…」+[修復へ移動] → scrolls #wl-shell-panel to 回路欄; closes; no banner without a guard return; #332 guide kept; save untouched. */
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
      await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.hub.credits = 1e6; s.hub.newGameIntro = { ...s.hub.newGameIntro, initialOpened: 10 }; delete s.hub.newGameIntro.firstSortie; localStorage.setItem(k, JSON.stringify(s)); }, K);
      await p.waitForTimeout(1500); await p.reload(); await p.waitForTimeout(800);
      assert.equal(await p.locator("#sortie-guard-guide").count(), 0, "no banner without a guard return");
      assert.equal(await p.locator("#new-game-guide").count(), 1, "#332 guide kept");
      await p.locator("#btn-buy-mech").click(); await p.waitForTimeout(800);
      await p.locator("#btn-select-all").click(); await p.waitForTimeout(800);
      const core = () => p.evaluate((k) => { const h = JSON.parse(localStorage.getItem(k)).hub; return JSON.stringify({ c: h.credits, i: h.inventory, f: (h.fleet || []).map((m) => m.instanceId), ci: h.circuits.length }); }, K);
      // No deploy link during onboarding without a circuit; open Explore directly (as a stale tab/bookmark would).
      await p.goto(base + "explore/");
      await p.locator("#link-guard-hub").waitFor({ timeout: 15000 });
      assert.equal(await p.locator("#btn-start").isDisabled(), true, "guard blocks 出撃");
      const save0 = await core();
      await p.locator("#link-guard-hub").click();
      await p.locator("#sortie-guard-guide").waitFor({ timeout: 15000 });
      const txt = await p.locator("#sortie-guard-guide").textContent();
      assert.match(txt, /回路が未装備です/); assert.match(txt, /修復へ移動/);
      await p.locator("#sortie-guard-go").click(); await p.waitForTimeout(600);
      const pos = await p.evaluate(() => { const pn = document.getElementById("wl-shell-panel"), a = document.getElementById("hub-anchor-circuits"); return { top: pn.scrollTop, d: Math.abs(a.getBoundingClientRect().top - pn.getBoundingClientRect().top), winY: window.scrollY }; });
      assert.ok(pos.top > 0 && pos.d < 40 && pos.winY === 0, "scrolled to 回路欄 inside panel " + JSON.stringify(pos));
      assert.equal(await p.locator("#sortie-guard-guide").count(), 0, "banner gone after acting");
      await p.reload(); await p.waitForTimeout(1200);
      assert.equal(await p.locator("#sortie-guard-guide").count(), 0, "not shown again after acting");
      // ✕ path
      await p.evaluate(() => sessionStorage.setItem("estg.sortieGuardReturn", "1")); await p.reload(); await p.locator("#sortie-guard-guide").waitFor();
      await p.locator("#sortie-guard-close").click(); await p.waitForTimeout(300);
      assert.equal(await p.locator("#sortie-guard-guide").count(), 0, "✕ closes");
      assert.equal(await p.evaluate(() => sessionStorage.getItem("estg.sortieGuardReturn")), null);
      assert.equal(await core(), save0, "guide does not touch the save");
      assert.equal(await p.evaluate((c) => window.__native().getItem(c), CK), null, "no checkpoint created by the guard");
      await p.screenshot({ path: `/tmp/guard-${mobile ? "m" : "d"}.png` });
      results.push({ viewport: mobile ? "390x844" : "1280x900", status: "PASS" });
      await ctx.close();
    }
  } finally { await b.close(); server.close(); }
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
