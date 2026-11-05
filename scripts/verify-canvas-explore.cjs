/**
 * Canvas 探索 on the single page (docs/CANVAS_UNIFIED_V0.md §14, U-5a):
 * CANVAS-Y6 (DOCK 探索へ opens the canvas 探索 in place with the deploy query),
 * briefing → 出撃, U-5b panels (wing cards + gauge tap, log, key table on PC
 * only), the map
 * at 720:420 (CANVAS-X3) with HUD above and controls below / beside (X4), a map
 * tap = move target at the tapped world point, zoom (wheel on PC, double tap on
 * touch), keys on PC (X5), back swallowed during the sortie, hide → checkpoint +
 * pause → tap resumes, reload resumes the sortie paused, 帰還要請 → result,
 * 仕分へ → SORT in place, only the canvas visible.
 * Needs built dists (npm run build:trade, VITE_BASE=/-explore-sort-trade-game/).
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
    // VERIFY_CONFIGS=name1,name2 runs only those configurations.
    for (const cfg of CONFIGS.filter((c) => !process.env.VERIFY_CONFIGS || process.env.VERIFY_CONFIGS.split(",").includes(c.name))) {
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

      const ex = () => p.evaluate(() => window.__wlCanvas.explore());
      const toClient = (pt) => p.evaluate((pt) => {
        const c = document.getElementById("wl-canvas").getBoundingClientRect(), s = window.__wlCanvas.size(), k = c.width / s.width;
        return { x: c.left + pt.x * k, y: c.top + pt.y * k };
      }, pt);
      const startGame = async () => {
        await ready();
        if (!(await region("start:go"))) return;
        if (await p.evaluate(() => !document.getElementById("wl-canvas-name").hidden)) await p.locator("#wl-canvas-name").fill("検証");
        await tap("start:go");
        await settle();
      };
      /** Wheel at the screen centre until the 44px button is fully visible (briefing / result pages). */
      const revealE = async (id) => {
        for (let i = 0; i < 60; i++) {
          const r = await region(id);
          if (r && r.visible && r.h >= 43 && r.top >= 0 && r.bottom <= cfg.viewport.height) return r;
          await p.mouse.move(cfg.viewport.width / 2, cfg.viewport.height / 2);
          await p.mouse.wheel(0, r && r.cy < cfg.viewport.height / 2 ? -200 : 200);
          await p.waitForTimeout(40);
        }
        throw new Error(`${cfg.name}: cannot reveal ${id}`);
      };
      /** Controls under / beside the map scroll on their own: wheel inside the controls. */
      const revealC = async (id) => {
        for (let i = 0; i < 60; i++) {
          const r = await region(id);
          if (r && r.visible && r.h >= 43 && r.top >= 0 && r.bottom <= cfg.viewport.height) return r;
          const m = await toClient({ x: (await ex()).map.x, y: (await ex()).map.y + (await ex()).map.h });
          const st = await p.evaluate(() => window.__wlCanvas.scroll("explore:controls"));
          void st;
          const side = r && r.left > m.x + 10 && r.top < m.y;
          await p.mouse.move(side ? r.cx : cfg.viewport.width / 2, side ? r.cy : Math.min(cfg.viewport.height - 10, m.y + 30));
          await p.mouse.wheel(0, r && r.cy < cfg.viewport.height / 2 ? -150 : 150);
          await p.waitForTimeout(40);
        }
        throw new Error(`${cfg.name}: cannot reveal ${id}`);
      };

      await p.goto(local + "canvas/");
      await startGame();
      await reveal("dock:debug:seed");
      await tap("dock:debug:seed");
      await settle();
      // ---- CANVAS-Y6: 探索へ opens the canvas 探索 in place (deploy query kept) -----------------
      const marker = await p.evaluate(() => (window.__marker = Math.random()));
      await reveal("dock:sortie:explore");
      await tap("dock:sortie:explore");
      await settle();
      assert.ok(new URL(p.url()).pathname.endsWith("/canvas/explore/"), `${cfg.name}: 探索 path`);
      assert.ok(new URL(p.url()).search.length > 1, `${cfg.name}: deploy query kept`);
      assert.equal(await p.evaluate(() => window.__marker), marker, "same page (no load)");
      assert.equal(await scene(), "explore", `${cfg.name}: 探索 scene`);
      let e = await ex();
      assert.equal(e.phase, "briefing");
      assert.equal(e.note, "", `${cfg.name}: the seeded squad can sortie`);
      assert.deepEqual(await visibleHtmlControls(), ["canvas#wl-canvas"], `${cfg.name}: only the canvas`);
      assert.ok(await region("tab:DOCK"), "briefing shows the tabs");
      const start = await revealE("explore:start");
      await tapAt(start.cx, start.cy);
      await settle();
      e = await ex();
      assert.equal(e.phase, "sortie", `${cfg.name}: 出撃`);
      assert.equal(await region("tab:DOCK"), null, "no tabs during the sortie (PR6)");
      assert.ok(Math.abs(e.map.w / e.map.h - 720 / 420) < 0.01, `${cfg.name}: map 720:420`);
      assert.ok(e.map.y + e.map.h <= cfg.viewport.height + 0.5, `${cfg.name}: map fits the screen height`);
      if (cfg.viewport.width > cfg.viewport.height) assert.ok(e.map.h < cfg.viewport.height - 40, "landscape: height wins");
      // ---- U-5b panels -----------------------------------------------------------------------------
      assert.ok(e.wingmen.length >= 1, `${cfg.name}: seeded wingmen ` + JSON.stringify(e));
      for (const id of e.wingmen) {
        const g = await revealC(`explore:gauge:${id}`);
        await tapAt(g.cx, g.cy);
      }
      await p.waitForTimeout(200);
      assert.ok((await ex()).log > 0, `${cfg.name}: log has rows`);
      if (cfg.touch) assert.equal(await region("explore:keys"), null, `${cfg.name}: no key table on touch`);
      else assert.ok(await revealC("explore:keys"), `${cfg.name}: key table toggle on PC`);
      e = await ex();
      // ---- map tap = move target at the tapped world point ----------------------------------------
      await p.waitForTimeout(120);
      const tc = { x: e.map.x + e.map.w * 0.72, y: e.map.y + e.map.h * 0.62 };
      const tcl = await toClient(tc);
      const lead0 = (await ex()).leader;
      await tapAt(tcl.x, tcl.y);
      e = await ex();
      assert.ok(e.clickMove, `${cfg.name}: tap set a move target`);
      const back = await p.evaluate((cm) => window.__wlCanvas.exploreToCanvas(cm.x, cm.y), e.clickMove);
      // The camera follows the captain, who starts moving right away: a few px of drift by the readback.
      assert.ok(Math.abs(back.x - tc.x) < 10 && Math.abs(back.y - tc.y) < 10, `${cfg.name}: target is under the finger ` + JSON.stringify([back, tc]));
      await p.waitForTimeout(700);
      const lead1 = (await ex()).leader;
      const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(d(lead1, e.clickMove ?? lead1) < d(lead0, e.clickMove), `${cfg.name}: captain moves to the target`);
      // ---- zoom: wheel on PC, double tap on touch -----------------------------------------------
      const mc = await toClient({ x: e.map.x + e.map.w / 2, y: e.map.y + e.map.h / 2 });
      if (cfg.touch) {
        await p.touchscreen.tap(mc.x, mc.y); await p.waitForTimeout(90); await p.touchscreen.tap(mc.x, mc.y);
        await p.waitForTimeout(60);
        assert.equal((await ex()).zoom, 2, `${cfg.name}: double tap = 2×`);
      } else {
        await p.mouse.move(mc.x, mc.y);
        await p.mouse.wheel(0, -100);
        await p.waitForTimeout(60);
        assert.ok((await ex()).zoom > 1, `${cfg.name}: wheel zooms the map`);
        // ---- keys (CANVAS-X5): W moves up and clears the tap target ----------------------------------
        const y0 = (await ex()).leader.y;
        await p.keyboard.down("w"); await p.waitForTimeout(400); await p.keyboard.up("w");
        e = await ex();
        assert.ok(e.leader.y < y0, `${cfg.name}: W moves the captain up`);
        assert.equal(e.clickMove, null, "keys clear the tap target");
      }
      // ---- back during the sortie is swallowed -----------------------------------------------------
      const url0 = p.url();
      await p.goBack();
      await p.waitForTimeout(150);
      assert.equal(p.url(), url0, `${cfg.name}: back stays on the sortie`);
      assert.equal((await ex()).phase, "sortie");
      assert.equal(await p.evaluate(() => window.__marker), marker, "same page");
      // ---- hide → checkpoint + pause; a tap only resumes -------------------------------------------
      await p.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        delete document.visibilityState;
      });
      e = await ex();
      assert.equal(e.paused, true, `${cfg.name}: hidden pauses`);
      const cp = await p.evaluate(() => JSON.parse(window.__native().getItem("estg.sortieCheckpoint") || "null"));
      assert.equal(cp && cp.kind, "sortie", `${cfg.name}: sortie checkpoint on hide`);
      const t0 = e.timeLeft;
      await p.waitForTimeout(300);
      assert.equal((await ex()).timeLeft, t0, "paused: time stands");
      const cm0 = (await ex()).clickMove;
      await tapAt(mc.x, mc.y);
      e = await ex();
      assert.equal(e.paused, false, `${cfg.name}: tap resumes`);
      assert.deepEqual(e.clickMove, cm0, "the resume tap is not a map tap");
      // ---- reload resumes the sortie (paused) from the checkpoint ------------------------------------
      await p.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        delete document.visibilityState;
      });
      await settle();
      await p.reload();
      await startGame();
      e = await ex();
      assert.equal(e.phase, "sortie", `${cfg.name}: reload resumes the sortie`);
      assert.equal(e.paused, true, "resumed paused");
      await tapAt(mc.x, mc.y);
      assert.equal((await ex()).paused, false);
      // ---- 帰還要請 → result (stand still inside the circle) ------------------------------------------
      const ext = await revealC("explore:extract");
      await tapAt(ext.cx, ext.cy);
      assert.equal((await ex()).boarding, true, `${cfg.name}: boarding requested`);
      await p.waitForFunction(() => window.__wlCanvas.explore()?.phase === "result", null, { timeout: 60000 });
      await settle();
      assert.ok(await region("explore:to-sort"), "result buttons");
      assert.deepEqual(await visibleHtmlControls(), ["canvas#wl-canvas"], `${cfg.name}: only the canvas (result)`);
      const ops = (await entries()).map((x) => x.kind);
      assert.ok(ops.includes("sortie.start"), `${cfg.name}: play log has the sortie start ` + JSON.stringify(ops));
      // ---- 仕分へ → SORT in place ---------------------------------------------------------------------
      const ts = await revealE("explore:to-sort");
      await tapAt(ts.cx, ts.cy);
      await settle();
      assert.equal(await scene(), "sort", `${cfg.name}: 仕分へ opens SORT`);
      assert.ok(new URL(p.url()).pathname.endsWith("/canvas/"), "SORT on the canvas root");
      assert.ok(new URL(p.url()).searchParams.has("salvagedContainers"), "Sort handoff query");
      assert.deepEqual(errors, [], `${cfg.name}: no page errors`);
      results.push(cfg.name);
      console.log(`${cfg.name}: ok`);
      await ctx.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  console.log("verify-canvas-explore PASS", results.join(", "));
})().catch((e) => { console.error(e); process.exit(1); });
