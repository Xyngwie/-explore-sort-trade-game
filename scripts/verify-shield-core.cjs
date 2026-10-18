/** Vite + external Playwright Core/Chromium; no production test hooks. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.EXPLORE_BASE_URL || 'http://127.0.0.1:5173';
const sharedUrl = '/@fs' + require('node:path').resolve(__dirname, '../packages/shared/src/index.ts');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const seedContext = await browser.newContext(), seedPage = await seedContext.newPage(); await seedPage.goto(base);
  const original = await seedPage.evaluate(async url => {
    const shared = await import(url);
    const { createWorld, bootstrapFromSearch, startSortie } = await import('/src/game/world.ts');
    const { attachCircuitPlay } = await import('/src/game/circuitPlay.ts');
    const { backfillEnemyState } = await import('/src/game/enemyBehavior.ts');
    const { getCoverObjects } = await import('/src/game/coverObjects.ts');
    const w = createWorld(bootstrapFromSearch('')); startSortie(w); attachCircuitPlay(w, null, false);
    getCoverObjects(w).splice(0); backfillEnemyState(w);
    for (const enemy of w.enemies) { enemy.alive = false; enemy.hp = 0; enemy.enemyState.deathHandled = true; }
    for (const wing of w.wingmen) { wing.alive = false; wing.hp = 0; }
    w.leader.pos = { x: 600, y: 600 }; w.leader.heading = 0; w.leader.moveHeading = null; w.containers = [];
    const identities = shared.shieldIdentityFromWreck(shared.registerWreckIdentity(shared.emptyFieldObjectIdentities(), 'wreck'), 'wreck', 's', { hp: 35, maxHp: 50 });
    w.shieldState = { identities, equipped: { [w.leader.id]: { kind: 'shield', key: 's' } }, ground: {} };
    w.bullets = [{ alive: true, pos: { x: 700, y: 600 }, vel: { x: -1000, y: 0 }, ttl: 1, damage: 10, ownerId: w.enemies[0].id, fromEnemy: true }];
    return w;
  }, sharedUrl);
  await seedContext.close();
  for (const kind of ['front', 'rear', 'breaking', 'cover', 'emp', 'legacy']) {
    const w = JSON.parse(JSON.stringify(original)), armor = w.leader.hp;
    if (kind === 'rear') w.leader.heading = Math.PI;
    if (kind === 'breaking') { w.shieldState.identities.shields.s.hp = 1; w.bullets[0].damage = 500; }
    if (kind === 'cover') { w.leader.inCover = true; w.coverObjects = [{ id: 'cover', pos: { x: 600, y: 644 }, radius: 30 }]; }
    if (kind === 'emp') { w.bullets[0].emp = true; w.bullets[0].empSlow = .4; }
    if (kind === 'legacy') delete w.shieldState;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(world => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('estg.sortieCheckpoint', JSON.stringify({ v: 1, kind: 'sortie', body: world })); sessionStorage.setItem('seeded', '1');
      }
      const nativeArc = CanvasRenderingContext2D.prototype.arc;
      window.shieldArcSeen = false;
      CanvasRenderingContext2D.prototype.arc = function (...args) {
        if (Math.abs((args[4] - args[3]) - 2 * Math.PI / 3) < 1e-6 && Math.abs(args[2] - 18) < 1e-6) window.shieldArcSeen = true;
        return nativeArc.apply(this, args);
      };
    }, w);
    const p = await context.newPage(), errors = []; p.on('pageerror', e => errors.push(e.message)); await p.goto(base);
    await p.locator('#sortie-paused').waitFor(); await p.mouse.click(5, 5); await p.waitForTimeout(260);
    if (kind === 'front') assert(await p.evaluate(() => shieldArcSeen), 'forward shield marker drawn');
    await p.reload(); await p.locator('#sortie-paused').waitFor();
    const actual = await p.evaluate(() => JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
    assert.equal(actual.leader.hp, ['rear', 'legacy'].includes(kind) ? armor - 10 : armor);
    assert.equal(actual.bullets.length, 0);
    const shield = actual.shieldState?.identities.shields.s;
    if (kind === 'legacy' || kind === 'breaking') {
      assert.equal(shield, undefined); assert(!(await p.locator('body').innerText()).includes('盾 '));
      assert((await p.locator('body').innerText()).includes('積載 0/2・速度 120'));
    } else {
      const expected = kind === 'rear' ? 35 : kind === 'cover' ? 28 : 25;
      assert.equal(shield.hp, expected); assert.equal(shield.shieldId, '1'); assert.equal(shield.sourceWreckId, '1');
      assert((await p.locator('body').innerText()).includes(`盾 ${expected}/50`));
      assert((await p.locator('body').innerText()).includes('積載 1/2・速度 75'));
    }
    if (kind === 'breaking') assert.equal(actual.shieldState.identities.nextWreckId, '2');
    if (kind === 'emp') assert.equal(actual.circuitPlay.emp[actual.leader.id].slow, .4);
    await p.mouse.click(5, 5); await p.waitForTimeout(100);
    if (kind === 'front' && process.env.SHIELD_CORE_SCREENSHOT) await p.screenshot({ path: process.env.SHIELD_CORE_SCREENSHOT, fullPage: true });
    assert.deepEqual(errors, []); await context.close();
  }
  await browser.close();
  console.log('Shield core browser 390x844 PASS: real front/rear/breaking/cover/EMP hits, marker/HUD/load, reload IDs/HP and legacy checkpoint');
})().catch(e => { console.error(e); process.exit(1); });
