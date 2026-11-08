/**
 * Canvas INVADE on the single page (docs/CANVAS_UNIFIED_V0.md §11, U-4): DOCK 戦線へ
 * → /canvas/invade/ in place (trade→invade keys consumed), the existing gesture
 * rules on the canvas board (touch: tap = mark after the double-tap wait, 300ms
 * hold = open, sweep = pan; mouse: left = open, right = mark, wheel = zoom), save
 * and reload, 格納庫へ → DOCK in place, forced-combat lock (back swallowed,
 * marking refused, 探索へ leaves), only the canvas visible.
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

      const inv = () => p.evaluate(() => window.__wlCanvas.invade());
      const cellClient = (sx, sy) => p.evaluate(([sx, sy]) => {
        const r = window.__wlCanvas.invadeCell(sx, sy);
        if (!r) return null;
        const c = document.getElementById("wl-canvas").getBoundingClientRect(), s = window.__wlCanvas.size(), k = c.width / s.width;
        return { x: c.left + ((r.left + r.right) / 2) * k, y: c.top + ((r.top + r.bottom) / 2) * k, top: c.top + r.top * k, bottom: c.top + r.bottom * k };
      }, [sx, sy]);
      const cellState = (sx, sy) => p.evaluate(([sx, sy]) => { const x = window.__wlCanvas.invadeFindAt?.(sx, sy); return x; }, [sx, sy]);
      void cellState;
      const startGame = async () => {
        await ready();
        if (await p.evaluate(() => !document.getElementById("wl-canvas-name").hidden)) await p.locator("#wl-canvas-name").fill("検証");
        await tap("start:go");
        await settle();
      };
      /** Scroll the page (outside the board) until the cell is on screen. */
      const showCell = async (sx, sy) => {
        for (let i = 0; i < 40; i++) {
          const c = await cellClient(sx, sy);
          if (c && c.top > 40 && c.bottom < cfg.viewport.height - 70) return c;
          // The column's left gutter: inside the page scroll area, outside the board.
          await p.mouse.move((cfg.viewport.width - Math.min(cfg.viewport.width, 960)) / 2 + 6, cfg.viewport.height / 2);
          await p.mouse.wheel(0, !c || c.top <= 40 ? -150 : 150);
          await p.waitForTimeout(40);
        }
        throw new Error(`${cfg.name}: cell (${sx},${sy}) not on screen`);
      };
      /** reveal() on this page: wheel in the column gutter (a wheel over the board zooms it). */
      const revealI = async (id) => {
        const gx = (cfg.viewport.width - Math.min(cfg.viewport.width, 960)) / 2 + 6;
        for (let i = 0; i < 60; i++) {
          const r = await region(id);
          if (r && r.visible && r.h >= 43) return r;
          await p.mouse.move(gx, cfg.viewport.height / 2);
          await p.mouse.wheel(0, r && r.cy < cfg.viewport.height / 2 ? -200 : 200);
          await p.waitForTimeout(40);
        }
        throw new Error(`${cfg.name}: cannot reveal ${id}`);
      };
      const touchHold = async (pt, ms) => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pt.x, y: pt.y }] });
        await p.waitForTimeout(ms);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await p.waitForTimeout(80);
      };
      /** Palette tree (docs/CANVAS_PALETTE_RESTRUCTURE.md): back to HUB, then tap through the palettes. */
      const nav = async (...path) => {
        for (let i = 0; i < 8 && (await region("dock:nav:back")); i++) { if (await region("dock:nav:home")) await tap("dock:nav:home"); else await tap("dock:nav:back"); }
        for (const id of path) { await reveal(`dock:nav:${id}`); await tap(`dock:nav:${id}`); }
        assert.equal(await p.evaluate(() => window.__wlCanvas.palette()), path.at(-1) ?? "H", `palette ${path.join(">")}`);
      };
      await p.goto(local + "canvas/");
      await startGame();
      // Test tools live in the HTML debug area under the canvas (localhost = debug mode, 神宮決定 2026-11-06).
      await reveal("dock:debug:open");
      await tap("dock:debug:open");
      await p.click("#wl-debug-seed");
      await settle();
      await p.click("#wl-debug-close");
      await settle();
      assert.equal(await p.evaluate(() => document.getElementById("wl-debug").hidden && window.scrollY === 0), true, "debug area closed, back to the game");
      await settle();
      const marker = await p.evaluate(() => (window.__marker = Math.random()));
      await nav("I");
      await reveal("dock:sortie:invade");
      await tap("dock:sortie:invade");
      await settle();
      assert.equal(await scene(), "invade", `${cfg.name}: INVADE opened`);
      assert.equal(await p.evaluate(() => window.__marker), marker, "same page (no load)");
      assert.ok(new URL(p.url()).pathname.endsWith("/canvas/invade/"), "INVADE path on the canvas app");
      assert.equal(new URL(p.url()).search, "", "trade→invade keys consumed");
      assert.equal((await inv()).inbound.fromHub, true);
      assert.deepEqual(await visibleHtmlControls(), ["canvas#wl-canvas"], `${cfg.name}: only the canvas`);
      // ---- a closed safe cell near HQ -------------------------------------------------
      const safe = await p.evaluate(() => window.__wlCanvas.invadeFind("closed-safe") ?? window.__wlCanvas.invadeFind("closed-any"));
      let c = await showCell(safe.sx, safe.sy);
      const open0 = (await inv()).open;
      if (cfg.touch) {
        await p.touchscreen.tap(c.x, c.y);
        await p.waitForTimeout(400); // the double-tap wait (280ms) passes → tap = mark
        await settle();
        assert.equal((await inv()).flagged, 1, `${cfg.name}: tap marks`);
        c = await showCell(safe.sx, safe.sy);
        await p.touchscreen.tap(c.x, c.y);
        await p.waitForTimeout(400);
        await settle();
        assert.equal((await inv()).flagged, 0, "tap again unmarks");
        c = await showCell(safe.sx, safe.sy);
        await touchHold(c, 420); // ≥300ms hold, release = open
        await settle();
        assert.ok((await inv()).open > open0, `${cfg.name}: hold+release opens`);
        // A sweep out of the start cell pans and never acts.
        const before = await inv();
        c = await showCell(0, 0);
        await drag({ x: c.x, y: c.y }, { x: c.x + 70, y: c.y + 30 });
        await p.waitForTimeout(400);
        const after = await inv();
        assert.ok(after.x !== before.x || after.y !== before.y, "sweep pans");
        assert.equal(after.flagged, before.flagged, "sweep never marks");
        assert.equal(after.open, before.open, "sweep never opens");
      } else {
        await p.mouse.click(c.x, c.y, { button: "right" });
        await settle();
        assert.equal((await inv()).flagged, 1, `${cfg.name}: right click marks`);
        await p.mouse.click(c.x, c.y, { button: "right" });
        await settle();
        assert.equal((await inv()).flagged, 0, "right again unmarks");
        await p.mouse.click(c.x, c.y);
        await settle();
        assert.ok((await inv()).open > open0, `${cfg.name}: left click opens`);
        const s0 = (await inv()).scale;
        await p.mouse.move(c.x, c.y);
        await p.mouse.wheel(0, -300);
        await p.waitForTimeout(80);
        assert.ok((await inv()).scale > s0, "wheel on the board zooms");
        // CANVAS-G4: 拠点へ is under 盤の操作.
        await revealI("invade:panel:ops");
        await tap("invade:panel:ops");
        await revealI("invade:home");
        await tap("invade:home");
        assert.equal((await inv()).scale, 1, "拠点へ resets the zoom");
        await revealI("invade:panel-back");
        await tap("invade:panel-back");
        assert.equal((await inv()).panel, "main", "‹ 戦線地図 returns to the board");
      }
      // ---- one finger on a button, a second on the board, the first lifts: nothing fires (docs §13) ----
      if (cfg.touch) {
        const tm = await revealI("invade:panel:ops"); // a button on the board screen (CANVAS-G4)
        const vp = await p.evaluate(() => window.__wlCanvas.invadeViewport());
        const boardPt = { x: vp.x + vp.w / 2, y: Math.max(vp.y + 10, Math.min(vp.y + vp.h - 10, tm.y - 80)), id: 2 };
        assert.ok(boardPt.y > 40 && boardPt.y >= vp.y && boardPt.y <= vp.y + vp.h, `${cfg.name}: a board point on screen`);
        const before = await inv();
        const A = { x: tm.cx, y: tm.cy, id: 1 };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [A] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [A, boardPt] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [boardPt] }); // finger 1 lifts
        await p.waitForTimeout(400);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await p.waitForTimeout(400);
        await settle();
        const after = await inv();
        assert.equal(after.reversed, before.reversed, `${cfg.name}: the button did not fire`);
        assert.equal(after.panel, "main", `${cfg.name}: the button did not fire (still the board)`);
        assert.equal(after.flagged, before.flagged, "the board did not mark");
        assert.equal(after.open, before.open, "the board did not open");
        await tapAt(tm.cx, tm.cy);
        assert.equal((await inv()).panel, "ops", "a single tap afterwards works (盤の操作 opens)");
        await revealI("invade:panel-back");
        await tap("invade:panel-back");
      }
      // ---- reload restores the front progress --------------------------------------------
      await settle();
      const saved = await inv();
      await p.reload();
      await startGame();
      assert.equal(await scene(), "invade", "reload keeps the INVADE page");
      assert.equal((await inv()).open, saved.open, "front progress restored");
      // ---- 格納庫へ from the sortie bar → DOCK in place -----------------------------------
      await revealI("invade:to-hangar");
      await tap("invade:to-hangar");
      await settle();
      assert.equal(await scene(), "dock", "格納庫へ returns to DOCK in place");
      assert.ok(!new URL(p.url()).searchParams.has("sectorX"), "invade→trade keys consumed");
      // ---- forced combat lock -----------------------------------------------------------------
      await tap("tab:INVADE");
      await settle();
      assert.equal(await scene(), "invade", "INVADE tab opens in place");
      const mine = await p.evaluate(() => window.__wlCanvas.invadeFind("mine"));
      c = await showCell(mine.sx, mine.sy);
      if (cfg.touch) await touchHold(c, 420); else await p.mouse.click(c.x, c.y);
      await settle();
      let st = await inv();
      assert.equal(st.locked, true, `${cfg.name}: stepping on an enemy locks`);
      const fl = st.flagged;
      const other = await p.evaluate(() => window.__wlCanvas.invadeFind("closed-safe") ?? window.__wlCanvas.invadeFind("closed-any"));
      c = await showCell(other.sx, other.sy);
      if (cfg.touch) { await p.touchscreen.tap(c.x, c.y); await p.waitForTimeout(400); } else await p.mouse.click(c.x, c.y, { button: "right" });
      await settle();
      assert.equal((await inv()).flagged, fl, "locked: marking refused");
      await p.goBack();
      await p.waitForTimeout(300);
      assert.equal(await scene(), "invade", "locked: back is swallowed");
      assert.equal((await inv()).locked, true);
      // CANVAS-Y6 (U-5b): the forced sortie opens the canvas 探索 in place.
      await revealI("invade:to-explore-forced");
      await tap("invade:to-explore-forced");
      await settle();
      assert.equal(await scene(), "explore", `${cfg.name}: 探索へ opens the canvas 探索`);
      assert.ok(new URL(p.url()).pathname.endsWith("/canvas/explore/"), "探索 path");
      assert.equal((await p.evaluate(() => window.__wlCanvas.explore())).engage, "forced", "forced sortie");
      await p.waitForTimeout(400);
      errors.splice(0, errors.length, ...errors.filter((e) => !/Access is denied for this document/.test(e)));
      assert.deepEqual(errors, [], `${cfg.name}: no page errors / native dialogs`);
      results.push({ config: cfg.name, result: "PASS" });
      await ctx.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  console.log(JSON.stringify(results, null, 1));
  console.log("verify-canvas-invade: PASS");
})().catch((e) => { console.error(e); process.exit(1); });
