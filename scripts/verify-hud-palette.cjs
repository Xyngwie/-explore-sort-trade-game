/** HUD palette (PR2b): opens from 弾/装/電/Cr, trades in place (no reload), sell confirms, hold ×N, closes; off mid SORT handoff. */
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
      await ctx.addInitScript(() => { const n = localStorage, ss = sessionStorage; window.__native = () => n; window.__nativeSession = () => Object.fromEntries(Object.keys(ss).map((k) => [k, 1])); });
      const p = await ctx.newPage();
      const dialogs = [];
      p.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
      await p.goto(local);
      await p.locator("#wl-shell-hud [data-hud-key=ammo]").waitFor();
      const hubKey = "wreckline.hubSave.v3";
      const flushed = () => p.waitForFunction(() => !Object.keys(window.__nativeSession()).some((k) => k.startsWith("wreckline.playLog.pending")), null, { timeout: 15000 });
      await p.waitForFunction((k) => !!localStorage.getItem(k), hubKey);
      await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.hub.credits = 100; s.hub.inventory = { ...s.hub.inventory, ammo: 5, power: 0 }; localStorage.setItem(k, JSON.stringify(s)); }, hubKey);
      await flushed();
      await p.reload();
      await p.locator("#wl-shell-hud [data-hud-key=ammo]").waitFor();
      const credits = () => p.locator("#wl-shell-hud [data-hud-key=credits]").getAttribute("data-value").then(Number);
      const ammo = () => p.locator("#wl-shell-hud [data-hud-key=ammo]").getAttribute("data-value").then(Number);
      const settle = () => p.waitForFunction(() => !document.getElementById("play-log-blocker") || getComputedStyle(document.getElementById("play-log-blocker")).display === "none" || document.getElementById("play-log-blocker").hidden, null, { timeout: 10000 }).catch(() => {});
      const c0 = await credits(), a0 = await ammo();
      await p.evaluate(() => { window.__marker = 1; });
      await p.locator("#wl-shell-hud [data-hud-key=ammo]").click();
      await p.locator("#wl-palette").waitFor();
      assert.equal(await p.locator("#wl-palette [data-palette-row=ammo].wl-pal-row").getAttribute("class").then((c) => c.includes("focus")), true);
      for (const r of ["ammo", "armor", "power", "junk", "unopened"]) assert.equal(await p.locator(`#wl-palette .wl-pal-row[data-palette-row=${r}]`).count(), 1, r);
      assert.match(await p.locator("#wl-palette .wl-pal-row[data-palette-row=ammo] .wl-pal-price").textContent(), /買 6c \/ 売 5c/);
      // power sell disabled (stock 0) → 在庫なし
      assert.equal(await p.locator("#wl-palette button[data-palette-row=power][data-palette-act=sell]").isDisabled(), true);
      // tap buy = 1, no reload
      await p.locator("#wl-palette button[data-palette-row=ammo][data-palette-act=buy]").click();
      await settle();
      await p.waitForFunction((c) => Number(document.querySelector("#wl-shell-hud [data-hud-key=credits]").dataset.value) === c - 6, c0);
      assert.equal(await ammo(), a0 + 1);
      assert.equal(await p.evaluate(() => window.__marker), 1, "no page reload");
      assert.equal(await p.locator("#wl-palette").count(), 1, "stays open");
      assert.match(await p.locator("#wl-palette [data-palette-delta=ammo]").textContent(), /Cr \u22126.*弾 \+1/);
      // sell tap → confirm → +5
      await p.locator("#wl-palette button[data-palette-row=ammo][data-palette-act=sell]").click();
      await settle();
      await p.waitForFunction((c) => Number(document.querySelector("#wl-shell-hud [data-hud-key=credits]").dataset.value) === c - 1, c0);
      assert.equal(dialogs.length, 1); assert.match(dialogs[0], /売却しますか？\n.* ×1\n\+5c/);
      // hold buy: grows ×N, release runs once at N
      const btn = p.locator("#wl-palette button[data-palette-row=armor][data-palette-act=buy]");
      const box = await btn.boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.down();
      await p.waitForSelector("#wl-palette .wl-pal-bubble", { timeout: 3000 });
      await p.waitForTimeout(450);
      const q = Number(await p.locator("#wl-palette .wl-pal-bubble").getAttribute("data-qty"));
      const txt = await p.locator("#wl-palette .wl-pal-bubble").textContent();
      assert.ok(q >= 2 && q <= 16, "hold grew ×" + q);
      await p.mouse.up();
      await settle();
      const armorAfter = Number(await p.locator("#wl-shell-hud [data-hud-key=armor]").getAttribute("data-value"));
      const c2 = await credits();
      assert.ok(c2 <= c0 - 1 - 6 * 2, "hold trade applied: " + c2 + " " + txt);
      // hold and slide off → cancel
      const sb = p.locator("#wl-palette button[data-palette-row=junk][data-palette-act=buy]");
      const b2 = await sb.boundingBox();
      await p.mouse.move(b2.x + 5, b2.y + 5); await p.mouse.down(); await p.waitForTimeout(700);
      await p.mouse.move(b2.x - 200, b2.y - 200); await p.mouse.up();
      await p.waitForTimeout(300);
      assert.equal(await credits(), c2, "slide off cancels");
      // DOCK in-memory state picked up the trade: a DOCK re-render shows the HUD value, save matches.
      await flushed();
      const saved = await p.evaluate((k) => JSON.parse(window.__native().getItem(k)).hub.credits, hubKey);
      assert.equal(saved, c2);
      // close: ✕, backdrop
      await p.locator("#wl-palette [data-palette-close]").click();
      assert.equal(await p.locator("#wl-palette").count(), 0);
      await p.locator("#wl-shell-hud [data-hud-key=credits]").click();
      await p.locator("#wl-palette").waitFor();
      assert.equal(await p.locator("#wl-palette").getAttribute("data-focus"), "credits");
      await p.mouse.click(5, 40);
      assert.equal(await p.locator("#wl-palette").count(), 0, "outside tap closes");
      // DOCK card sell now confirms too
      const card = p.locator("#four-resource-trade [data-four-resource-action=sell][data-four-resource-id=ammo]");
      if (await card.count()) {
        const n = dialogs.length;
        p.removeAllListeners("dialog"); p.once("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
        const cb = await credits();
        await card.click(); await p.waitForTimeout(300);
        assert.equal(dialogs.length, n + 1); assert.equal(await credits(), cb, "dismissed confirm = no sell");
      }
      // SORT handoff: palette HUD taps disabled.
      await p.goto(local + "sort/?salvagedContainers=1");
      await p.locator("#wl-shell-hud [data-hud-key=ammo]").waitFor();
      for (const k of ["credits", "ammo", "armor", "power"]) assert.equal(await p.locator(`#wl-shell-hud [data-hud-key=${k}]`).isDisabled(), true, k);
      results.push({ viewport: mobile ? "390x844" : "1280x900", status: "PASS", holdQty: q });
      await ctx.close();
    }
    console.log(JSON.stringify({ hudPalette: results }, null, 2));
  } finally {
    await b.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
