/** Fullscreen shell: tab bar computed styles are identical on DOCK and SORT (shell overrides per-screen buttons). */
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
  const PROPS = ["background-color", "border-top-width", "border-left-width", "border-radius", "box-shadow", "padding-top", "margin-top", "font-size", "font-weight", "letter-spacing", "height", "color"];
  const results = [];
  try {
    for (const mobile of [false, true]) {
      const ctx = await b.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
      const p = await ctx.newPage();
      const styles = async (url) => {
        await p.goto(url);
        await p.locator("#wl-shell-tabs button").first().waitFor();
        return p.evaluate((props) => {
          const pick = (el) => Object.fromEntries(props.map((k) => [k, getComputedStyle(el).getPropertyValue(k)]));
          const bs = [...document.querySelectorAll("#wl-shell-tabs button")];
          return { tab: pick(bs.find((x) => x.disabled && !x.hasAttribute("aria-current")) || bs[0]), bar: getComputedStyle(document.getElementById("wl-shell-tabs")).height, page: document.scrollingElement.scrollHeight <= innerHeight + 1 };
        }, PROPS);
      };
      const dock = await styles(local), sort = await styles(local + "sort/");
      for (const s of [dock, sort]) {
        assert.equal(s.tab["border-top-width"], "0px");
        assert.equal(s.tab["border-left-width"], "0px");
        assert.equal(s.tab["border-radius"], "0px");
        assert.equal(s.tab["background-color"], "rgba(0, 0, 0, 0)");
        assert.equal(s.tab["box-shadow"], "none");
        assert.equal(s.tab["font-size"], "12px");
        assert.equal(s.tab["color"], "rgb(72, 79, 88)");
        assert.equal(s.bar, "56px"); // border-box on every screen
        assert.equal(s.page, true, "no page-level vertical scroll");
      }
      assert.deepEqual(sort.tab, dock.tab, "tab style identical on DOCK and SORT");
      results.push({ viewport: mobile ? "390x844" : "1280x900", status: "PASS" });
      await ctx.close();
    }
    console.log(JSON.stringify({ shellTabs: results }, null, 2));
  } finally {
    await b.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
