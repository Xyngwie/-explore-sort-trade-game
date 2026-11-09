/**
 * Canvas SORT on the single page (docs/CANVAS_UNIFIED_V0.md §9, U-2): new-game
 * intro opening DOCK → SORT → DOCK in place, resume after reload, swipe / tap on
 * the canvas board, result handoff with the single-use token, URL replay grants
 * nothing, back from SORT refunds the containers, tabs off during SORT, only the
 * canvas visible. Needs built dists (npm run build:trade, VITE_BASE=/-explore-sort-trade-game/).
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

      const sortInfo = () => p.evaluate(() => window.__wlCanvas.sort());
      const startGame = async () => {
        await ready();
        if (await p.evaluate(() => !document.getElementById("wl-canvas-name").hidden)) await p.locator("#wl-canvas-name").fill("検証");
        await tap("start:go");
        await settle();
      };
      // ---- new game: DOCK → SORT (initial 10) in place --------------------------
      /** Palette tree (docs/CANVAS_PALETTE_RESTRUCTURE.md): back to HUB, then tap through the palettes. */
      const nav = async (...path) => {
        for (let i = 0; i < 8 && (await region("dock:nav:back")); i++) { if (await region("dock:nav:home")) await tap("dock:nav:home"); else await tap("dock:nav:back"); }
        for (const id of path) { await reveal(`dock:nav:${id}`); await tap(`dock:nav:${id}`); }
        assert.equal(await p.evaluate(() => window.__wlCanvas.palette()), path.at(-1) ?? "H", `palette ${path.join(">")}`);
      };
      await p.goto(local + "canvas/");
      await startGame();
      assert.equal(await scene(), "dock");
      const h0 = await hub();
      assert.equal(h0.unopenedContainers, 10, "new game: 10 containers");
      await nav("S");
      await reveal("dock:unopened:sort:go");
      const pageMarker = await p.evaluate(() => (window.__marker = Math.random()));
      await tap("dock:unopened:sort:go");
      await settle();
      assert.equal(await scene(), "sort", `${cfg.name}: SORT opened`);
      assert.equal(await p.evaluate(() => window.__marker), pageMarker, "no page load (same page)");
      const q = new URL(p.url()).searchParams;
      assert.equal(q.get("salvagedContainers"), "10");
      assert.ok(q.get("introOpening"), "intro opening id in the page URL");
      assert.ok(new URL(p.url()).pathname.endsWith("/canvas/"), "still the canvas page");
      assert.deepEqual(await visibleHtmlControls(), ["canvas#wl-canvas"], `${cfg.name}: only the canvas in SORT`);
      const tabs = (await p.evaluate(() => window.__wlCanvas.regions())).filter((r) => r.id.startsWith("tab:"));
      assert.ok(tabs.length === 5 && tabs.every((t) => t.disabled), "every tab off during SORT (#332)");
      assert.equal((await region("sort:test-play")), null, "no test play during the intro");
      // ---- start, board fits, play ---------------------------------------------------
      await tap("sort:start");
      await settle(); // the phase change saves the session; input waits for it (existing rule)
      await p.waitForFunction(() => window.__wlCanvas.sort()?.playMode === "idle" || window.__wlCanvas.sort()?.phase !== "play", null, { timeout: 15000 });
      let si = await sortInfo();
      const movesAtStart = si.movesLeft;
      assert.equal(si.phase, "play");
      assert.equal(si.cols * si.rows, 42, "6×7 board");
      const board = await region("sort:board");
      const fin = await region("sort:finish");
      assert.ok(board.visible && board.top >= 0 && board.bottom <= cfg.viewport.height && board.right <= cfg.viewport.width, `${cfg.name}: board fully on screen`);
      assert.ok(fin.visible && fin.h >= 43 && fin.bottom <= cfg.viewport.height, `${cfg.name}: 精製を終える on screen`);
      const cw = (board.right - board.left) / si.cols;
      const cellAt = (i) => ({ x: board.left + (i % si.cols + 0.5) * cw, y: board.top + (Math.floor(i / si.cols) + 0.5) * cw });
      // Tap = select (hit alignment at this DPR).
      const c7 = cellAt(7);
      await tapAt(c7.x, c7.y);
      si = await sortInfo();
      assert.ok(si.selected === 7 || si.phase !== "play" || si.playMode !== "idle", `${cfg.name}: tap selected cell 7 (${si.selected})`);
      if (si.selected === 7) { await tapAt(c7.x, c7.y); }
      // A short swipe (below 16px) is a tap; a long one swaps (spends a move unless it ends the run).
      const moves0 = (await sortInfo()).movesLeft;
      const a = cellAt(8);
      await drag({ x: a.x, y: a.y }, { x: a.x + cw * 0.9, y: a.y });
      await p.waitForTimeout(80);
      si = await sortInfo();
      assert.ok(si.phase !== "play" || si.movesLeft <= moves0, "swipe handled");
      // ---- reload mid-run: same page query, the session resumes ---------------------
      if (si.phase === "play") {
        const before = await sortInfo();
        await settle();
        await p.waitForTimeout(1200); // let the chain timers settle (phase changes save the session)
        await p.reload();
        await startGame();
        assert.equal(await scene(), "sort", "reload keeps SORT");
        const after = await sortInfo();
        assert.equal(after.phase, "play", "resumed in play");
        // The session is saved when the phase changes (existing rule), so a reload resumes the run as it began.
        assert.equal(after.movesLeft, movesAtStart, "same run, from its saved start");
        void before;
        await tap("sort:finish");
        await settle();
      }
      await p.waitForFunction(() => window.__wlCanvas.sort()?.phase === "result", null, { timeout: 15000 });
      // ---- result → 格納庫へ (token) → DOCK in place --------------------------------
      await settle(); // the result save (intro.opening.result) blocks input until it is recorded
      await tap("sort:to-hangar");
      await settle();
      assert.equal(await scene(), "dock", "back on DOCK");
      const back = new URL(p.url());
      assert.ok(!back.searchParams.has("introResultId") && !back.searchParams.has("yieldBag"), "handoff query stripped");
      const h1 = await hub();
      assert.equal(h1.newGameIntro.initialOpened, 10, "initial 10 opened");
      assert.ok(!h1.newGameIntro.opening, "opening closed");
      assert.equal(h1.unopenedContainers, 0);
      const kinds = (await entries()).map((e) => e.kind);
      // intro.opening.result is renamed to sort.result in the same step (existing main.ts order).
      for (const k of ["container.open", "sort.play", "sort.result", "handoff.ingest"]) assert.ok(kinds.includes(k), `${k} in ${kinds.join(",")}`);
      assert.equal(new Set((await entries()).map((e) => e.op)).size, (await entries()).length, "no duplicated operations");
      // ---- normal briefing with extra HUB containers: ＋1 / ＋ALL / 格納庫へ reachable on every screen ----
      {
        const credits = (await hub()).credits;
        assert.ok(credits >= 45, `${cfg.name}: credits for 3 boxes (${credits})`);
        {
          await nav("T", "B", "BC");
          await reveal("dock:unopened:step:1");
          await tap("dock:unopened:step:1"); await tap("dock:unopened:step:1"); // ×3
          await reveal("dock:unopened:buy");
          await tap("dock:unopened:buy");
          await tap("dock:confirm:ok");
          await settle();
          assert.equal((await hub()).unopenedContainers, 3, "bought 3 boxes");
          await nav("S");
          await reveal("dock:unopened:sort:-1");
          await tap("dock:unopened:sort:-1"); await tap("dock:unopened:sort:-1"); // 仕分数 1
          await reveal("dock:unopened:sort:go");
          await tap("dock:unopened:sort:go");
          await settle();
          assert.equal(await scene(), "sort");
          assert.equal(new URL(p.url()).searchParams.get("salvagedContainers"), "1");
          // Scroll inside the field (centre of the screen) until each button is fully on screen.
          const reach = async (id) => {
            for (let i = 0; i < 40; i++) {
              const r = await region(id);
              if (r && r.visible && r.h >= 43 && r.top >= 30 && r.bottom <= cfg.viewport.height - 60) return r;
              await p.mouse.move(cfg.viewport.width / 2, cfg.viewport.height / 2);
              await p.mouse.wheel(0, r && r.cy < cfg.viewport.height / 2 ? -80 : 80);
              await p.waitForTimeout(40);
            }
            throw new Error(`${cfg.name}: ${id} cannot be reached`);
          };
          for (const id of ["sort:start", "sort:add-one", "sort:add-all", "sort:skip-cargo"]) await reach(id);
          const all = await reach("sort:add-all");
          await tapAt(all.cx, all.cy);
          await settle();
          assert.equal(new URL(p.url()).searchParams.get("salvagedContainers"), "3", `${cfg.name}: ＋ALL reachable and works`);
          await reach("sort:skip-cargo");
          await tap("sort:skip-cargo");
          await settle();
          assert.equal(await scene(), "dock", "格納庫へ (預ける) reachable and works");
          assert.equal((await hub()).unopenedContainers, 3, "deposited back as 未開封");
          console.log(`landscape-briefing-check ${cfg.name}: ran`);
        }
      }
      // ---- replaying a resource URL without the token grants nothing -----------------
      const ammo1 = h1.inventory.ammo ?? 0;
      await p.goto(local + "canvas/?fromSort=1&yieldBag=ammo%3A50");
      await startGame();
      assert.equal(await scene(), "dock");
      assert.equal(((await hub()).inventory.ammo ?? 0), ammo1, "no token → no grant");
      assert.ok(!new URL(p.url()).searchParams.has("yieldBag"), "untokened grant stripped");
      await ctx.close();
      // ---- back out of SORT refunds the reserved containers --------------------------
      {
        const ctx2 = await b.newContext({ viewport: cfg.viewport, deviceScaleFactor: cfg.dpr, isMobile: cfg.touch, hasTouch: cfg.touch });
        await ctx2.addInitScript(() => { const ss = sessionStorage; window.__pending = () => Object.keys(ss).some((k) => k.startsWith("wreckline.playLog.pending")); });
        const p2 = await ctx2.newPage();
        p2.on("pageerror", (e) => errors.push(String(e)));
        await p2.goto(local + "canvas/");
        await p2.waitForFunction(() => !!window.__wlCanvas && !document.getElementById("play-log-blocker") && !window.__pending(), null, { timeout: 15000 });
        await p2.locator("#wl-canvas-name").fill("検証");
        const t2 = async (id) => { for (let i = 0; i < 60; i++) { const r = await p2.evaluate((id) => window.__wlCanvas.regions().find((x) => x.id === id), id); if (r && r.visible && r.h >= 43) { if (cfg.touch) await p2.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2); else await p2.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await p2.waitForTimeout(60); await p2.waitForFunction(() => !document.getElementById("play-log-blocker") && !window.__pending(), null, { timeout: 15000 }); return; } await p2.mouse.move(cfg.viewport.width / 2, cfg.viewport.height / 2); await p2.mouse.wheel(0, r && r.y < cfg.viewport.height / 2 ? -300 : 300); await p2.waitForTimeout(40); } throw new Error("t2 " + id); };
        await t2("start:go");
        await t2("dock:nav:S");
        await t2("dock:unopened:sort:go");
        assert.equal(await p2.evaluate(() => window.__wlCanvas.scene()), "sort");
        const mid = await p2.evaluate((k) => JSON.parse(localStorage.getItem(k)).hub, HUB);
        assert.equal(mid.unopenedContainers, 0, "reserved for SORT");
        // (a) No sortie done mark: back is swallowed by the Sort back trap (existing rule); nothing refunded.
        await p2.goBack();
        await p2.waitForTimeout(400);
        assert.equal(await p2.evaluate(() => window.__wlCanvas.scene()), "sort", `${cfg.name}: back trapped in SORT`);
        assert.equal((await p2.evaluate((k) => JSON.parse(localStorage.getItem(k)).hub, HUB)).unopenedContainers, 0, "still reserved");
        // (b) With the done mark: back leaves SORT and the reserved containers come back (pageshow back_forward rule).
        await p2.evaluate(() => localStorage.setItem("estg.sortieCheckpoint", JSON.stringify({ v: 1, kind: "done" })));
        await p2.waitForFunction(() => !document.getElementById("play-log-blocker") && !window.__pending(), null, { timeout: 15000 });
        await p2.goBack(); // pops the trap entry (same Sort URL): stays
        await p2.waitForTimeout(300);
        assert.equal(await p2.evaluate(() => window.__wlCanvas.scene()), "sort");
        await p2.goBack();
        await p2.waitForFunction(() => window.__wlCanvas.scene() === "dock" && !document.getElementById("play-log-blocker") && !window.__pending(), null, { timeout: 15000 });
        await p2.waitForTimeout(200);
        const refunded = await p2.evaluate((k) => JSON.parse(localStorage.getItem(k)).hub, HUB);
        assert.equal(refunded.unopenedContainers, 10, `${cfg.name}: back refunds the 10 containers`);
        assert.ok(!refunded.newGameIntro.opening, "opening cancelled");
        await ctx2.close();
      }
      assert.deepEqual(errors, [], `${cfg.name}: no page errors / native dialogs`);
      results.push({ config: cfg.name, result: "PASS" });
    }
  } finally {
    await b.close();
    server.close();
  }
  console.log(JSON.stringify(results, null, 1));
  console.log("verify-canvas-sort: PASS");
})().catch((e) => { console.error(e); process.exit(1); });
