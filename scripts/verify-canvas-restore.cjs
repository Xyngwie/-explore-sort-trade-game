/**
 * Canvas RESTORE on the single page (docs/CANVAS_UNIFIED_V0.md §10, U-3): DOCK →
 * RESTORE (同じページ, /canvas/restore/, handoff keys consumed), nearest-edge
 * taps at each DPR, drag = pan (never a toggle), Commit Bypass, 格納庫へ → DOCK
 * ingests the board with the signature engraving, RESTORE tab = demo board,
 * reload keeps the RESTORE page, back returns to DOCK, only the canvas visible.
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

      const rinfo = () => p.evaluate(() => window.__wlCanvas.restore());
      const edgeClient = (i) => p.evaluate((i) => {
        const pt = window.__wlCanvas.restoreEdge(i);
        if (!pt) return null;
        const c = document.getElementById("wl-canvas").getBoundingClientRect(), s = window.__wlCanvas.size(), k = c.width / s.width;
        return { x: c.left + pt.x * k, y: c.top + pt.y * k };
      }, i);
      const startGame = async () => {
        await ready();
        if (await p.evaluate(() => !document.getElementById("wl-canvas-name").hidden)) await p.locator("#wl-canvas-name").fill("検証");
        await tap("start:go");
        await settle();
      };
      await p.goto(local + "canvas/");
      await startGame();
      await reveal("dock:debug:seed");
      await tap("dock:debug:seed");
      await settle();
      const marker = await p.evaluate(() => (window.__marker = Math.random()));
      await reveal("dock:sortie:restore");
      await tap("dock:sortie:restore");
      await settle();
      assert.equal(await scene(), "restore", `${cfg.name}: RESTORE opened`);
      assert.equal(await p.evaluate(() => window.__marker), marker, "same page (no load)");
      assert.ok(new URL(p.url()).pathname.endsWith("/canvas/restore/"), "RESTORE path on the canvas app");
      assert.equal(new URL(p.url()).search, "", "trade→restore keys consumed (existing app.ts)");
      let ri = await rinfo();
      assert.equal(ri.source, "handoff-board");
      assert.equal(ri.editor, "検証", "engraving = the confirmed name (CANVAS-Q1)");
      assert.deepEqual(await visibleHtmlControls(), ["canvas#wl-canvas"], `${cfg.name}: only the canvas`);
      const tabs = (await p.evaluate(() => window.__wlCanvas.regions())).filter((r) => r.id.startsWith("tab:"));
      assert.equal(tabs.find((t) => t.id === "tab:RESTORE").disabled, true, "RESTORE is the current tab");
      // ---- nearest-edge taps at this DPR ----------------------------------------------
      await reveal("restore:board");
      const idx = 1; // horizontal edge (1, 0)
      let pt = await edgeClient(idx);
      for (let i = 0; i < 20 && (!pt || pt.y < 40 || pt.y > cfg.viewport.height - 70); i++) {
        await p.mouse.move(cfg.viewport.width / 2, cfg.viewport.height / 2);
        await p.mouse.wheel(0, pt && pt.y < 40 ? -120 : 120);
        await p.waitForTimeout(40);
        pt = await edgeClient(idx);
      }
      await tapAt(pt.x, pt.y);
      ri = await rinfo();
      assert.equal(ri.marks[idx], "1", `${cfg.name}: tap → 線 on edge ${idx}`);
      assert.equal(ri.marks.replace(/0/g, "").length, 1, "exactly one edge changed");
      await tapAt(pt.x, pt.y);
      assert.equal((await rinfo()).marks[idx], "2", "線 → ×");
      await tapAt(pt.x, pt.y);
      await tapAt(pt.x, pt.y);
      assert.equal((await rinfo()).marks[idx], "1");
      // A drag on the board is a pan (or nothing), never a toggle.
      const before = (await rinfo()).marks;
      await drag({ x: pt.x, y: pt.y }, { x: pt.x + 60, y: pt.y + 40 });
      assert.equal((await rinfo()).marks, before, "drag never toggles");
      // ---- Commit Bypass → 格納庫へ → DOCK ingests the board ----------------------------
      await reveal("restore:commit-bypass");
      await tap("restore:commit-bypass");
      assert.equal((await rinfo()).outcome, "bypass");
      await reveal("restore:to-hangar");
      await settle();
      await tap("restore:to-hangar");
      await settle();
      assert.equal(await scene(), "dock", "back on DOCK");
      assert.ok(new URL(p.url()).pathname.endsWith("/canvas/") && !new URL(p.url()).searchParams.has("circuitBoard"), "return query stripped");
      const circuit = (await hub()).circuits.find((c) => c.circuitId === "board_demo");
      assert.equal(circuit.restoreState, "bypass", "board_demo saved as Bypass");
      assert.equal(circuit.lastEditorName ?? circuit.circuitBoard.lastEditorName, "検証", "engraved with the user name");
      const kinds = (await entries()).map((e) => e.kind);
      // A HUB board is not saved per edge (保存 off by default, existing rule): the only write is the HUB ingest.
      assert.ok(kinds.includes("handoff.ingest") && !kinds.some((k) => k.startsWith("restore.")), kinds.join(","));
      assert.equal(new Set((await entries()).map((e) => e.op)).size, (await entries()).length, "no duplicated operations");
      // ---- RESTORE tab = demo board; reload keeps RESTORE; back = DOCK -------------------
      await tap("tab:RESTORE");
      await settle();
      assert.equal(await scene(), "restore");
      assert.equal((await rinfo()).source, "demo", "tab opens the demo board (回路未選択, §5-2)");
      await p.reload();
      await startGame();
      assert.equal(await scene(), "restore", "reload keeps the RESTORE page");
      await p.goBack();
      await settle();
      assert.equal(await scene(), "dock", "back returns to DOCK");
      assert.deepEqual(errors, [], `${cfg.name}: no page errors / native dialogs`);
      results.push({ config: cfg.name, result: "PASS" });
      await ctx.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  console.log(JSON.stringify(results, null, 1));
  console.log("verify-canvas-restore: PASS");
})().catch((e) => { console.error(e); process.exit(1); });
