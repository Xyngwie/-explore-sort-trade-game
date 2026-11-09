/**
 * Canvas DOCK, all sections (docs/CANVAS_UNIFIED_V0.md §4): seed, repair after a
 * market buy, scrap dialog, resource sell dialog, tree / SORT tab scroll, tabs and
 * 探索へ leave through the play log, reload consistency, no HTML controls.
 * Needs built dists (all five modules, VITE_BASE=/-explore-sort-trade-game/<module>/).
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
      /** The leave navigation ends on an error page (dev port); wait for it, then reopen the canvas. */
      const backToCanvas = async () => {
        // The error page (no storage access) can log a SecurityError while it replaces the canvas page; only those are dropped.
        const drop = () => { for (let i = errors.length - 1; i >= 0; i--) if (/Access is denied for this document/.test(errors[i])) errors.splice(i, 1); };
        for (let i = 0; i < 5; i++) {
          await p.waitForTimeout(300);
          try { await p.goto(local + "canvas/"); break; } catch (e) { if (i === 4) throw e; }
        }
        await ready();
        drop();
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

      /** Palette tree (docs/CANVAS_PALETTE_RESTRUCTURE.md): back to HUB, then tap through the palettes. */
      const nav = async (...path) => {
        for (let i = 0; i < 8 && (await region("dock:nav:back")); i++) { if (await region("dock:nav:home")) await tap("dock:nav:home"); else await tap("dock:nav:back"); }
        for (const id of path) { await reveal(`dock:nav:${id}`); await tap(`dock:nav:${id}`); }
        assert.equal(await p.evaluate(() => window.__wlCanvas.palette()), path.at(-1) ?? "H", `palette ${path.join(">")}`);
      };
      await p.goto(local + "canvas/");
      await ready();
      await p.locator("#wl-canvas-name").fill("検証");
      await tap("start:go");
      await settle();
      assert.equal(await scene(), "dock");
      // Seed (the existing debug seed, logged as debug.playtest-seed).
      // Test tools live in the HTML debug area under the canvas (localhost = debug mode, 神宮決定 2026-11-06).
      await reveal("dock:debug:open");
      await tap("dock:debug:open");
      assert.equal(await p.evaluate(() => document.getElementById("wl-debug")?.hidden), false, "debug area opened");
      assert.ok(await p.evaluate(() => !!document.querySelector("#wl-debug #play-log-panel") && !!document.querySelector("#wl-debug #btn-reset") && !!document.querySelector("#wl-debug #shield-debug-console")), "play log panel, デモ初期化 and Alpha Lab are in the debug area");
      // #353 B3: while open, the page scrolls both ways over the canvas (it no longer eats pan / wheel),
      // and 「▲ ゲームへ」 stays reachable after the canvas came back into view.
      {
        const sy = () => p.evaluate(() => window.scrollY);
        const y0 = await sy();
        assert.ok(y0 > 0, `${cfg.name}: opening scrolled to the area`);
        const canvasPoint = () => p.evaluate(() => { const r = document.getElementById("wl-canvas").getBoundingClientRect(); return { x: r.left + r.width / 2, top: Math.max(4, r.top + 4), bottom: Math.min(innerHeight - 4, r.bottom - 4) }; });
        // Up over the canvas: first bring part of the canvas into view (wheel over the area), then pan / wheel on the canvas itself.
        await p.mouse.move(cfg.viewport.width / 2, cfg.viewport.height / 2);
        await p.mouse.wheel(0, -Math.ceil(cfg.viewport.height * 0.6));
        await p.waitForTimeout(150);
        let cp = await canvasPoint();
        assert.ok(cp.bottom - cp.top > 40, `${cfg.name}: part of the canvas is in view`);
        const yMid = await sy();
        if (cdp) {
          const a = { x: cp.x, y: cp.top + 10 }, z = { x: cp.x, y: Math.min(cfg.viewport.height - 10, cp.top + 10 + 260) };
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] });
          for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x, y: a.y + ((z.y - a.y) * i) / 8 }] });
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } else {
          await p.mouse.move(cp.x, (cp.top + cp.bottom) / 2);
          await p.mouse.wheel(0, -260);
        }
        await p.waitForTimeout(300);
        assert.ok((await sy()) < yMid, `${cfg.name}: the page scrolls up over the canvas (${yMid} → ${await sy()})`);
        // Back down to the area over the canvas.
        cp = await canvasPoint();
        for (let i = 0; i < 12 && !(await p.evaluate(() => { const r = document.getElementById("wl-debug-close").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })); i++) {
          if (cdp) {
            const a = { x: cp.x, y: Math.min(cfg.viewport.height - 20, cp.bottom - 10) }, z = { x: cp.x, y: Math.max(20, a.y - 260) };
            await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] });
            for (let k = 1; k <= 8; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x, y: a.y + ((z.y - a.y) * k) / 8 }] });
            await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          } else {
            await p.mouse.move(cp.x, Math.max(cp.top + 2, Math.min(cp.bottom - 2, cfg.viewport.height / 2)));
            await p.mouse.wheel(0, 300);
          }
          await p.waitForTimeout(250);
          cp = await canvasPoint();
          if (cp.bottom - cp.top < 20) cp = { x: cfg.viewport.width / 2, top: 20, bottom: cfg.viewport.height - 20 };
        }
        assert.ok(await p.evaluate(() => { const r = document.getElementById("wl-debug-close").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), `${cfg.name}: 「▲ ゲームへ」 reachable again by scrolling`);
      }
      await p.click("#wl-debug-seed");
      await settle();
      await p.click("#wl-debug-close");
      await settle();
      assert.equal(await p.evaluate(() => document.getElementById("wl-debug").hidden && window.scrollY === 0), true, "debug area closed, back to the game");
      await settle();
      const seeded = await hub();
      assert.ok(seeded.fleet.length >= 3, `${cfg.name}: seeded fleet`);
      assert.ok((await entries()).some((e) => e.kind === "debug.playtest-seed"), "seed logged");
      assert.deepEqual(await visibleHtmlControls(), ["canvas#wl-canvas"], `${cfg.name}: only the canvas`);
      // Repair needs parts: buy armor in the market, then repair.
      const worn = seeded.fleet.find((m) => m.status === "needs_repair");
      await nav("T", "B", "BR");
      await reveal("dock:armor:step:10");
      for (let i = 0; i < 9; i++) await tap("dock:armor:step:10");
      await tap("dock:armor:buy");
      await settle();
      await nav("M", "MM", "MR");
      await reveal(`dock:mech:${worn.instanceId}:repair`);
      await tap(`dock:mech:${worn.instanceId}:repair`);
      await settle();
      assert.equal((await hub()).fleet.find((m) => m.instanceId === worn.instanceId).status, "operational", `${cfg.name}: repaired`);
      // Scrap asks in a canvas dialog; やめる keeps the mech.
      const victim = (await hub()).fleet.at(-1).instanceId;
      await p.waitForTimeout(650); // #266 money guard
      await nav("M", "MM", "MD", "MS");
      await reveal(`dock:mech:${victim}:scrap`);
      await tap(`dock:mech:${victim}:scrap`);
      assert.equal((await region("dock:confirm:scrap:ok"))?.visible, true, "scrap dialog");
      await tap("dock:confirm:scrap:cancel");
      assert.ok((await hub()).fleet.some((m) => m.instanceId === victim), "やめる keeps the mech");
      // Resource sell asks, then +5c.
      const before = await hub();
      await nav("T", "V", "VS");
      await reveal("dock:sell:armor");
      await tap("dock:sell:armor");
      await tap("dock:confirm:sell:ok");
      await settle();
      const after = await hub();
      assert.equal(after.credits, before.credits + 5);
      assert.equal(after.inventory.armor, before.inventory.armor - 1);
      // SORT tab opens 仕分 (S) inside the canvas.
      await p.mouse.move(cfg.viewport.width / 2, cfg.viewport.height / 2);
      for (let i = 0; i < 40; i++) await p.mouse.wheel(0, -2000);
      await p.waitForTimeout(80);
      await tap("tab:SORT");
      await p.waitForTimeout(80);
      assert.equal(await p.evaluate(() => window.__wlCanvas.palette()), "S", "SORT tab opens 仕分");
      assert.equal(await scene(), "dock");
      // Reload keeps everything; no new entries.
      const saved = await hub(), n = (await entries()).length;
      await p.reload();
      await ready();
      await tap("start:go");
      assert.deepEqual(await hub(), saved);
      assert.equal((await entries()).length, n);
      // RESTORE is on this page since U-3: its tab switches scenes in place.
      await tap("tab:RESTORE");
      await settle();
      assert.equal(await scene(), "restore", "RESTORE tab opens in place");
      await p.goBack();
      await settle();
      assert.equal(await scene(), "dock");
      // INVADE is on this page since U-4 too.
      await tap("tab:INVADE");
      await settle();
      assert.equal(await scene(), "invade", "INVADE tab opens in place");
      await p.goBack();
      await settle();
      assert.equal(await scene(), "dock");
      // 探索 is on this page since U-5b (CANVAS-Y6): the SORTIE tab opens it in place.
      await tap("tab:SORTIE");
      await settle();
      assert.equal(await scene(), "explore", "SORTIE tab opens 探索 in place");
      assert.ok(new URL(p.url()).pathname.endsWith("/canvas/explore/"));
      await p.goBack();
      await settle();
      assert.equal(await scene(), "dock");
      // 探索へ: marks the squad deployed and opens 探索 with the squad (same page).
      await nav("I");
      const ex = await region("dock:sortie:explore");
      if (ex && !ex.disabled) {
        await reveal("dock:sortie:explore");
        await tap("dock:sortie:explore");
        await settle();
        assert.equal(await scene(), "explore", "探索へ opens 探索 in place");
        assert.ok((await p.evaluate(() => window.__wlCanvas.explore())).deployed.length > 0, "the squad came along");
        await p.goBack();
        await settle();
        assert.equal(await scene(), "dock");
      }
      const kinds = (await entries()).map((e) => e.kind);
      assert.ok(kinds.includes("trade.repair") && kinds.includes("resource.sell") && kinds.includes("resource.buy"), kinds.join(","));
      assert.equal(new Set((await entries()).map((e) => e.op)).size, (await entries()).length, "no duplicated operations");
      assert.deepEqual(errors, [], `${cfg.name}: no page errors / native dialogs`);
      results.push({ config: cfg.name, entries: kinds.length, result: "PASS" });
      await ctx.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  console.log(JSON.stringify(results, null, 1));
  console.log("verify-canvas-dock-full: PASS");
})().catch((e) => { console.error(e); process.exit(1); });
