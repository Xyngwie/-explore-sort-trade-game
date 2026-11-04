/**
 * Canvas edition stage 1 (docs/CANVAS_SHELL_V0.md): one visible canvas, name
 * before start, DOCK purchases with play log, modal / scroll / cancel safety,
 * DPR + orientation hit alignment, reload consistency.
 * Needs built dists (npm run build:trade with VITE_BASE=/-explore-sort-trade-game/).
 */
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  http = require("node:http"),
  path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const root = path.resolve(__dirname, ".."),
  prefix = "/-explore-sort-trade-game/";
const HUB = "wreckline.hubSave.v3", SIG = "wreckline.craftSignature.v0";

const CONFIGS = [
  { name: "pc-1280x900@1", viewport: { width: 1280, height: 900 }, dpr: 1, touch: false },
  { name: "pc-1280x900@2", viewport: { width: 1280, height: 900 }, dpr: 2, touch: false },
  { name: "phone-390x844@3", viewport: { width: 390, height: 844 }, dpr: 3, touch: true },
  { name: "phone-844x390@3", viewport: { width: 844, height: 390 }, dpr: 3, touch: true },
  { name: "phone-320x568@2", viewport: { width: 320, height: 568 }, dpr: 2, touch: true },
];

(async () => {
  const server = http.createServer((req, res) => {
    let s = new URL(req.url, "http://local").pathname;
    if (!s.startsWith(prefix)) return res.writeHead(404).end();
    s = s.slice(prefix.length);
    let m = "trade";
    for (const name of ["explore", "sort", "restore", "invade"])
      if (s.startsWith(name + "/")) { m = name; s = s.slice(name.length + 1); break; }
    const dir = path.join(root, "packages", m, "dist");
    let f = path.resolve(dir, s || "index.html");
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!f.startsWith(dir + "/") || !fs.existsSync(f) || !fs.statSync(f).isFile()) return res.writeHead(404).end();
    res.setHeader("Content-Type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html");
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const local = `http://127.0.0.1:${server.address().port}${prefix}`;
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox"] });
  const results = [];
  try {
    for (const cfg of CONFIGS) {
      const ctx = await b.newContext({ viewport: cfg.viewport, deviceScaleFactor: cfg.dpr, isMobile: cfg.touch, hasTouch: cfg.touch });
      await ctx.addInitScript(() => {
        const n = localStorage, ss = sessionStorage;
        window.__native = () => n;
        window.__pending = () => Object.keys(ss).some((k) => k.startsWith("wreckline.playLog.pending"));
      });
      const p = await ctx.newPage();
      const errors = [];
      p.on("pageerror", (e) => errors.push(String(e)));
      p.on("dialog", (d) => { errors.push("native dialog: " + d.message()); d.dismiss(); });
      const cdp = cfg.touch ? await ctx.newCDPSession(p) : null;

      const settle = async () => {
        await p.waitForFunction(() => !document.getElementById("play-log-blocker") && !window.__pending(), null, { timeout: 15000 });
      };
      const ready = async () => { await p.waitForFunction(() => !!window.__wlCanvas, null, { timeout: 15000 }); await settle(); await p.waitForTimeout(50); };
      const scene = () => p.evaluate(() => window.__wlCanvas.scene());
      const region = (id) => p.evaluate((id) => {
        const r = window.__wlCanvas.regions().find((x) => x.id === id);
        if (!r) return null;
        const c = document.getElementById("wl-canvas").getBoundingClientRect();
        const s = window.__wlCanvas.size();
        const k = c.width / s.width;
        return { ...r, cx: c.left + (r.x + r.w / 2) * k, cy: c.top + (r.y + r.h / 2) * k, left: c.left + r.x * k, top: c.top + r.y * k, right: c.left + (r.x + r.w) * k, bottom: c.top + (r.y + r.h) * k };
      }, id);
      const tapAt = async (x, y) => {
        if (cfg.touch) await p.touchscreen.tap(x, y);
        else await p.mouse.click(x, y);
        await p.waitForTimeout(40);
      };
      const tap = async (id) => {
        const r = await region(id);
        assert.ok(r && r.visible, `${cfg.name}: ${id} visible`);
        await tapAt(r.cx, r.cy);
      };
      /** Press at a, move to b, release (touch via CDP, mouse otherwise). `cancel` ends with a touchcancel. */
      const drag = async (a, bpt, cancel = false) => {
        if (cdp) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
          for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x + ((bpt.x - a.x) * i) / 6, y: a.y + ((bpt.y - a.y) * i) / 6 }] });
          await cdp.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
        } else {
          await p.mouse.move(a.x, a.y); await p.mouse.down();
          for (let i = 1; i <= 6; i++) await p.mouse.move(a.x + ((bpt.x - a.x) * i) / 6, a.y + ((bpt.y - a.y) * i) / 6);
          await p.mouse.up();
        }
        await p.waitForTimeout(60);
      };
      /** Scroll the DOCK list (wheel) until the 44px button is fully visible. */
      const reveal = async (id) => {
        for (let i = 0; i < 60; i++) {
          const r = await region(id);
          if (r && r.visible && r.h >= 43) return r;
          const vh = cfg.viewport.height;
          await p.mouse.move(cfg.viewport.width / 2, vh / 2);
          const dist = r ? r.cy - vh / 2 : 400;
          await p.mouse.wheel(0, Math.sign(dist || 1) * Math.min(600, Math.abs(dist) * 0.8 + 40));
          await p.waitForTimeout(40);
        }
        throw new Error(`${cfg.name}: cannot reveal ${id} ` + JSON.stringify(await region(id)) + JSON.stringify(await p.evaluate(() => [window.__wlCanvas.scroll("dock"), window.__wlCanvas.pressing()])));
      };
      const hub = () => p.evaluate((k) => JSON.parse(window.__native().getItem(k)).hub, HUB);
      const entries = () => p.evaluate(() => new Promise((res, rej) => {
        const r = indexedDB.open("wreckline.playLog.v1", 1);
        r.onsuccess = () => {
          const db = r.result, t = db.transaction(["entries"], "readonly");
          const q = t.objectStore("entries").getAll();
          q.onsuccess = () => { db.close(); res(q.result.map((e) => ({ seq: e.seq, kind: e.kind, op: e.operationId, input: e.context && e.context.input }))); };
          q.onerror = () => rej(q.error);
        };
        r.onerror = () => rej(r.error);
      }));
      const visibleHtmlControls = () => p.evaluate(() => [...document.querySelectorAll("button,input,select,textarea,a[href],[role=dialog],details,canvas")].filter((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return !el.hidden && cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
      }).map((el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "")));

      // ---- fresh game (the play log creates it), give it credits through the logged storage ----
      await p.goto(local + "canvas/");
      await ready();
      assert.equal(await scene(), "start");
      assert.deepEqual(await visibleHtmlControls(), ["canvas#wl-canvas", "input#wl-canvas-name"], `${cfg.name}: before start only the canvas and the name field`);
      await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.hub.credits = 1000; s.hub.inventory = { ...s.hub.inventory, ammo: 3 }; localStorage.setItem(k, JSON.stringify(s)); }, HUB);
      await settle();
      await p.reload();
      await ready();
      const e0 = await entries();

      // ---- DPR backing store ----
      const dims = await p.evaluate(() => { const c = document.getElementById("wl-canvas"); const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, cw: r.width, ch: r.height, dpr: devicePixelRatio }; });
      assert.equal(dims.dpr, cfg.dpr);
      assert.equal(dims.w, Math.round(dims.cw * cfg.dpr), `${cfg.name}: backing width = css × dpr`);
      assert.equal(dims.h, Math.round(dims.ch * cfg.dpr));

      // ---- name: empty cannot start; typed name starts, field hidden and blurred ----
      await tap("start:go");
      assert.equal(await scene(), "start", "empty name does not start");
      await p.locator("#wl-canvas-name").fill("検証隊長");
      await tap("start:go");
      await settle();
      assert.equal(await scene(), "dock", `${cfg.name}: started`);
      assert.equal(await p.evaluate(() => document.getElementById("wl-canvas-name").hidden), true);
      assert.notEqual(await p.evaluate(() => document.activeElement && document.activeElement.id), "wl-canvas-name", "field blurred");
      assert.equal(await p.evaluate((k) => window.__native().getItem(k), SIG), "検証隊長", "name stored as the craft signature");
      assert.deepEqual(await visibleHtmlControls(), ["canvas#wl-canvas"], `${cfg.name}: in play only the canvas`);

      // ---- hit alignment at the edges (coordinate conversion at this DPR) ----
      const h0 = await hub();
      await reveal("dock:ammo:buy");
      await reveal("dock:ammo:step:1");
      const step = await region("dock:ammo:step:1");
      await tapAt(step.left + 2, step.top + 2); // just inside
      await tapAt(step.left - 3, step.cy); // just outside (gap): nothing
      await tap("dock:ammo:buy");
      await settle();
      let h1 = await hub();
      assert.equal(h1.credits, h0.credits - 12, `${cfg.name}: ×2 bought (edge tap counted once, outside ignored)`);
      assert.equal(h1.inventory.ammo, (h0.inventory.ammo || 0) + 2);
      let e1 = await entries();
      const newOps = (a, bb) => bb.slice(a.length).map((e) => e.kind);
      assert.deepEqual(newOps(e0, e1).filter((k) => k !== "game.start"), ["resource.buy"], `${cfg.name}: one log entry`);
      assert.deepEqual(e1.at(-1).input, { id: "ammo", quantity: 2 });

      // ---- container: confirm dialog, behind-dialog tap, cancel, confirm ----
      // Scroll the box row into view first (small screens).
      await reveal("dock:unopened:buy");
      const behind = await region("dock:unopened:step:1");
      await tap("dock:unopened:buy");
      assert.equal((await region("dock:confirm:ok"))?.visible, true, "dialog open");
      assert.equal((await hub()).unopenedContainers, h1.unopenedContainers, "no buy before confirm");
      if (behind.visible) {
        await tapAt(behind.cx, behind.cy); // under the dialog backdrop (or outside the box)
        assert.equal((await hub()).credits, h1.credits, "behind-dialog tap never buys");
        assert.equal(await region("dock:confirm:ok"), null, "backdrop = やめる");
        await tap("dock:unopened:buy");
      }
      await tap("dock:confirm:cancel");
      assert.equal((await hub()).credits, h1.credits, "やめる does not buy");
      await tap("dock:unopened:buy");
      await tap("dock:confirm:ok");
      await settle();
      const h2 = await hub();
      assert.equal(h2.unopenedContainers, h1.unopenedContainers + 1);
      assert.equal(h2.credits, h1.credits - 15);
      const e2 = await entries();
      assert.deepEqual(newOps(e1, e2), ["unopened.buy"]);

      // ---- scroll / cancel never buy ----
      const jb = await reveal("dock:junk:buy");
      {
        await drag({ x: jb.cx, y: jb.cy }, { x: jb.cx, y: jb.cy - 80 });
        if (cdp) await drag({ x: jb.cx, y: jb.cy }, { x: jb.cx + 1, y: jb.cy + 1 }, true); // touchcancel (touch only)
      }
      const ab = await reveal("dock:ammo:buy");
      await drag({ x: ab.cx, y: ab.cy }, { x: ab.cx, y: ab.cy + 60 });
      await settle();
      assert.equal((await hub()).credits, h2.credits, `${cfg.name}: drags / touchcancel never buy`);
      assert.equal((await entries()).length, e2.length);

      // ---- rapid double tap: every purchase logged exactly once ----
      const pb = await reveal("dock:power:buy");
      {
        await tapAt(pb.cx, pb.cy); await tapAt(pb.cx, pb.cy);
        await settle();
        const h3 = await hub(), e3 = await entries();
        const n = (h2.credits - h3.credits) / 6;
        assert.ok(n === 1 || n === 2, "1 or 2 taps landed");
        assert.equal(e3.length - e2.length, n, "one entry per purchase");
        assert.equal(new Set(e3.map((e) => e.op)).size, e3.length, "no duplicated operation ids");
      }

      // ---- redraw / resize never writes ----
      const beforeResize = { hub: JSON.stringify(await hub()), n: (await entries()).length };
      for (const vp of [{ width: cfg.viewport.height, height: cfg.viewport.width }, cfg.viewport]) {
        await p.setViewportSize(vp);
        await p.waitForTimeout(120);
      }
      await settle();
      assert.equal(JSON.stringify(await hub()), beforeResize.hub, "resize/redraw does not save");
      assert.equal((await entries()).length, beforeResize.n);
      // After resizing, hits still land on the drawn buttons.
      const st = await region("dock:armor:step:1");
      if (st.visible) { await tapAt(st.cx, st.cy); }

      // ---- reload: same balance/stock; locked name; no new entries from reloading ----
      const savedHub = await hub(), nBefore = (await entries()).length;
      await p.reload();
      await ready();
      assert.equal(await scene(), "start");
      assert.equal(await p.evaluate(() => document.getElementById("wl-canvas-name").hidden), true, "locked name: no field");
      await tap("start:go");
      assert.equal(await scene(), "dock");
      assert.deepEqual(await hub(), savedHub, "reload keeps the save");
      assert.equal((await entries()).length, nBefore, "reload adds no entry");
      assert.equal(await p.evaluate((k) => window.__native().getItem(k), SIG), "検証隊長", "name unchanged");

      assert.deepEqual(errors, [], `${cfg.name}: no page errors / native dialogs`);
      const kinds = (await entries()).map((e) => e.kind);
      results.push({ config: cfg.name, kinds: kinds.join(","), entries: nBefore, credits: savedHub.credits, result: "PASS" });
      await ctx.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  console.log(JSON.stringify(results, null, 1));
  console.log("verify-canvas-dock: PASS");
})().catch((e) => { console.error(e); process.exit(1); });
