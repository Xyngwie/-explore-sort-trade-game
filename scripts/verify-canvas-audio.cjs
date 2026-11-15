/**
 * Canvas audio (docs/AUDIO_V0.md, 神宮決定 2026-11-15 B1–B3 = ★A): nothing before the first tap,
 * the title theme after it, DOCK → hangar with a crossfade, the 「♪」 toggle mutes and is
 * remembered across a reload, and the 「♪」 does not cover any other control.
 * Needs a built trade dist (npm run build:trade with VITE_BASE=/-explore-sort-trade-game/).
 */
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  http = require("node:http"),
  path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const root = path.resolve(__dirname, ".."),
  prefix = "/-explore-sort-trade-game/";

const CONFIGS = [
  { name: "pc-1280x900@1", viewport: { width: 1280, height: 900 }, dpr: 1, touch: false },
  { name: "phone-390x844@3", viewport: { width: 390, height: 844 }, dpr: 3, touch: true },
  { name: "phone-844x390@3", viewport: { width: 844, height: 390 }, dpr: 3, touch: true },
  { name: "phone-320x568@2", viewport: { width: 320, height: 568 }, dpr: 2, touch: true },
].filter((c) => !process.env.VERIFY_CONFIGS || process.env.VERIFY_CONFIGS.split(",").includes(c.name));

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".mp3": "audio/mpeg", ".json": "application/json" };

(async () => {
  const server = http.createServer((req, res) => {
    let s = new URL(req.url, "http://local").pathname;
    if (!s.startsWith(prefix)) return res.writeHead(404).end();
    s = s.slice(prefix.length);
    const dir = path.join(root, "packages", "trade", "dist");
    let f = path.resolve(dir, s || "index.html");
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!f.startsWith(dir + "/") || !fs.existsSync(f) || !fs.statSync(f).isFile()) return res.writeHead(404).end();
    res.setHeader("Content-Type", TYPES[path.extname(f)] || "text/html");
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const local = `http://127.0.0.1:${server.address().port}${prefix}`;
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--autoplay-policy=user-gesture-required"] });
  const done = [];
  try {
    for (const cfg of CONFIGS) {
      const ctx = await b.newContext({ viewport: cfg.viewport, deviceScaleFactor: cfg.dpr, isMobile: cfg.touch, hasTouch: cfg.touch });
      const p = await ctx.newPage();
      const errors = [];
      p.on("pageerror", (e) => errors.push(String(e)));
      const audio = () => p.evaluate(() => window.__wlCanvas.audio());
      const regions = () => p.evaluate(() => window.__wlCanvas.regions());
      const region = (id) => p.evaluate((id) => {
        const r = window.__wlCanvas.regions().find((x) => x.id === id);
        if (!r) return null;
        const c = document.getElementById("wl-canvas").getBoundingClientRect();
        const k = c.width / window.__wlCanvas.size().width;
        return { ...r, cx: c.left + (r.x + r.w / 2) * k, cy: c.top + (r.y + r.h / 2) * k };
      }, id);
      const tapAt = async (x, y) => { if (cfg.touch) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); await p.waitForTimeout(60); };
      const tap = async (id) => { const r = await region(id); assert.ok(r && r.visible, `${cfg.name}: ${id} visible`); await tapAt(r.cx, r.cy); };
      const waitFor = async (label, fn) => {
        try { await p.waitForFunction(fn, null, { timeout: 20000 }); }
        catch (e) { throw new Error(`${cfg.name}: waiting for ${label}; audio=${JSON.stringify(await audio())} scene=${await p.evaluate(() => window.__wlCanvas.scene())}`); }
      };
      const settle = () => p.waitForFunction(() => !document.getElementById("play-log-blocker"), null, { timeout: 15000 });
      const ready = async () => { await p.waitForFunction(() => !!window.__wlCanvas, null, { timeout: 15000 }); await settle(); await p.waitForTimeout(80); };
      /** The 「♪」 must not overlap any other visible control (it is drawn first, so a control there would hide it). */
      const toggleClear = async (where) => {
        const all = (await regions()).filter((r) => r.visible);
        const t = all.find((r) => r.id === "audio:toggle");
        assert.ok(t, `${cfg.name}: 「♪」 on ${where}`);
        const hit = all.filter((r) => r.id !== "audio:toggle" && r.layer === t.layer && r.x < t.x + t.w && t.x < r.x + r.w && r.y < t.y + t.h && t.y < r.y + r.h);
        assert.deepEqual(hit.map((r) => r.id), [], `${cfg.name}: 「♪」 overlaps on ${where}`);
      };

      await p.goto(local + "canvas/");
      await ready();
      let a = await audio();
      assert.deepEqual([a.unlocked, a.wanted, a.playing], [false, "title", null], `${cfg.name}: nothing before the first tap`);
      await toggleClear("start");
      // first tap (an empty corner) → audio starts with the title theme
      await tapAt(4, cfg.viewport.height - 4);
      await waitFor("title", () => window.__wlCanvas.audio().playing === "title");
      // start the game → DOCK → hangar (crossfade)
      await p.locator("#wl-canvas-name").fill("音の検証");
      await tap("start:go");
      await settle();
      await waitFor("dock", () => window.__wlCanvas.scene() === "dock");
      await waitFor("hangar", () => window.__wlCanvas.audio().playing === "hangar");
      await toggleClear("DOCK HUB");
      // 「♪」 mutes, and the choice survives a reload
      await tap("audio:toggle");
      a = await audio();
      assert.equal(a.muted, true, `${cfg.name}: 「♪」 mutes`);
      assert.equal(await p.evaluate(() => localStorage.getItem("wreckline.audio.muted")), "1");
      await p.reload();
      await ready();
      a = await audio();
      assert.equal(a.muted, true, `${cfg.name}: muted after a reload`);
      await tap("audio:toggle");
      assert.equal((await audio()).muted, false, `${cfg.name}: 「♪」 again unmutes`);
      // a reload opens the start screen again → the title theme
      await waitFor("title after the reload", () => window.__wlCanvas.audio().playing === "title");
      if (await p.locator("#wl-canvas-name").isVisible()) await p.locator("#wl-canvas-name").fill("音の検証");
      await tap("start:go");
      await settle();
      await waitFor("dock again", () => window.__wlCanvas.scene() === "dock");
      await waitFor("hangar after unmute", () => window.__wlCanvas.audio().playing === "hangar");
      // SORT tab → the 仕分 palette stays in DOCK (hangar); the RESTORE / INVADE scenes have their own tracks
      const inv = await region("tab:INVADE");
      if (inv && inv.visible && !inv.disabled) {
        await tapAt(inv.cx, inv.cy);
        await waitFor("invade", () => window.__wlCanvas.scene() === "invade");
        await waitFor("recon", () => window.__wlCanvas.audio().playing === "recon");
        await toggleClear("INVADE");
      }
      assert.deepEqual(errors, [], `${cfg.name}: page errors`);
      await p.screenshot({ path: path.join(process.env.VERIFY_SHOTS || "/tmp", `audio-${cfg.name}.png`) });
      done.push(cfg.name);
      await ctx.close();
    }
    console.log("verify-canvas-audio PASS " + done.join(", "));
  } finally {
    await b.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
