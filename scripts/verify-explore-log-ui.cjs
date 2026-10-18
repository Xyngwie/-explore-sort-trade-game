/** Run against Vite: PLAYWRIGHT_MODULE=/path/to/playwright-core node scripts/verify-explore-log-ui.cjs */
const assert = require('node:assert/strict');
const sharedUrl = '/@fs' + require('node:path').resolve(__dirname, '../packages/shared/src/index.ts');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.EXPLORE_BASE_URL || 'http://127.0.0.1:5173';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.evaluate(async () => {
    const { LogPanel } = await import('/src/ui/logPanel.ts');
    document.body.replaceChildren();
    const notices = [];
    const panel = new LogPanel(text => notices.push(text));
    const slot = document.createElement('div'); document.body.append(slot); panel.mount(slot);
    const repair = { at: '2026-10-18T01:02:03.000Z', severity: 'error', counts: { counter: 1, duplicate: 1, source: 0 },
      repairs: [{ kind: 'duplicate', target: 'shields.a.shieldId', before: '7', after: '8' }] };
    const rows = Array.from({ length: 80 }, (_, n) => ({ key: `r${n}`, kind: n < 2 ? 'repair' : 'battle',
      text: `ログ ${n}：文字選択を保ったまま長い文章も閲覧できることを確認する`, ...(n < 2 ? { repair } : {}) }));
    panel.update(rows);
    const button = document.createElement('button'); button.id = 'fake-order'; button.textContent = '操作';
    let actions = 0; button.addEventListener('click', () => actions++); button.addEventListener('pointerdown', () => actions++);
    document.body.append(button);
    window.harness = { panel, rows, notices, get actions() { return actions; }, append(n) {
      for (let i = 0; i < n; i++) this.rows.push({ key: `r${this.rows.length}`, kind: 'battle', text: `追加 ${this.rows.length}` });
      panel.update(this.rows);
    }, select(key = 'r0') {
      const node = panel.list.querySelector(`[data-log-key="${key}"]`).firstChild;
      const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, Math.min(7, node.textContent.length));
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      return window.getSelection().toString();
    }, top() { panel.list.scrollTop = 0; }, snapshot() {
      const rect = panel.list.getBoundingClientRect();
      const row = [...panel.list.children].find(li => li.getBoundingClientRect().bottom > rect.top);
      return { key: row?.dataset.logKey, offset: row?.getBoundingClientRect().top - rect.top, scroll: panel.list.scrollTop,
        selected: window.getSelection().toString(), unread: panel.unread, label: panel.unreadButton.textContent, hidden: panel.unreadButton.hidden };
    } };
  });
  const get = () => page.evaluate(() => harness.snapshot());
  const clear = () => page.evaluate(() => window.getSelection().removeAllRanges());
  await page.waitForTimeout(150);
  assert((await get()).scroll > 0); assert((await get()).hidden);
  await page.evaluate(() => harness.top()); await page.waitForTimeout(40);
  const selected = await page.evaluate(() => harness.select()); await page.waitForTimeout(20);
  await page.evaluate(() => harness.append(2));
  assert.equal((await get()).selected, selected); assert.equal((await get()).scroll, 0); assert.equal((await get()).unread, 2);
  await page.locator('#fake-order').click(); assert.equal(await page.evaluate(() => harness.actions), 0); assert.equal((await get()).selected, '');
  await page.locator('#fake-order').click(); assert.equal(await page.evaluate(() => harness.actions), 2);
  await page.evaluate(() => harness.append(1)); assert.equal((await get()).unread, 3); assert.equal((await get()).scroll, 0);
  const count = await page.locator('#log-list li').count();
  await page.locator('[data-log-key="r0"]').click(); await page.waitForTimeout(30);
  assert((await page.evaluate(() => navigator.clipboard.readText())).includes('shields.a.shieldId'));
  assert.equal(await page.evaluate(() => harness.notices.at(-1)), '修復詳細をコピーしました');
  assert.equal(await page.locator('#log-list li').count(), count, 'copy must not add combat logs');
  await page.evaluate(() => { window.nativeClipboard = navigator.clipboard; window.copyAttempts = 0;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { copyAttempts++; throw Error('denied'); } } }); });
  await page.locator('[data-log-key="r1"]').click(); await page.waitForTimeout(30);
  assert.equal(await page.evaluate(() => harness.notices.at(-1)), 'コピーに失敗しました'); assert.equal(await page.evaluate(() => copyAttempts), 1);
  // Native selection created during a long-press gesture must survive its release click.
  const repairBox = await page.locator('[data-log-key="r0"]').boundingBox();
  await page.mouse.move(repairBox.x + 10, repairBox.y + 8); await page.mouse.down();
  await page.evaluate(() => harness.select()); await page.waitForTimeout(40); await page.mouse.up();
  assert((await get()).selected); assert.equal(await page.evaluate(() => copyAttempts), 1);
  // A native context-menu/selection gesture on already-selected text is not a tap.
  await page.mouse.down();
  await page.evaluate(() => { document.querySelector('[data-log-key="r0"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })); harness.select(); });
  await page.mouse.up(); assert((await get()).selected);
  await page.locator('[data-log-key="r1"]').click(); assert.equal((await get()).selected, ''); assert.equal(await page.evaluate(() => copyAttempts), 1);
  await page.locator('[data-log-key="r1"]').click(); await page.waitForTimeout(20); assert.equal(await page.evaluate(() => copyAttempts), 2);
  await page.evaluate(() => harness.select()); await page.waitForTimeout(20);
  await page.locator('[data-log-key="r3"]').click(); assert.equal((await get()).selected, ''); assert.equal(await page.evaluate(() => copyAttempts), 2);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: nativeClipboard }));
  await page.evaluate(() => harness.select()); await page.waitForTimeout(20);
  await page.locator('#log-list').hover(); await page.mouse.wheel(0, 200); await page.waitForTimeout(60);
  assert.equal((await get()).selected, selected, 'scrolling selected row offscreen retains native selection');
  // First outside drag is consumed as a whole.
  const buttonBox = await page.locator('#fake-order').boundingBox(), beforeActions = await page.evaluate(() => harness.actions);
  await page.mouse.move(buttonBox.x + 5, buttonBox.y + 5); await page.mouse.down(); await page.mouse.move(buttonBox.x + 40, buttonBox.y + 25, { steps: 4 }); await page.mouse.up();
  assert.equal(await page.evaluate(() => harness.actions), beforeActions); assert.equal((await get()).selected, '');
  await page.evaluate(() => harness.select()); await page.waitForTimeout(20);
  const unread = (await get()).unread;
  await page.locator('.log-unread').click(); assert.equal((await get()).unread, unread); assert.equal((await get()).selected, '');
  await page.locator('.log-unread').click(); assert.equal((await get()).unread, 0); assert((await get()).hidden);
  await page.evaluate(() => harness.top()); await page.waitForTimeout(40); await page.evaluate(() => harness.append(1005));
  assert.equal((await get()).unread, 1005); assert.equal((await get()).label, '新着ログ 999+件');
  await page.locator('.log-unread').click(); assert.equal((await get()).unread, 0);
  // Seeing part of the actual latest row resumes following, with no extra indicator.
  await page.evaluate(() => harness.top()); await page.waitForTimeout(20); await page.evaluate(() => harness.append(1));
  await page.evaluate(() => { const l = harness.panel.list; l.scrollTop = l.scrollHeight - l.clientHeight - 8; }); await page.waitForTimeout(40);
  assert.equal((await get()).unread, 0); await page.evaluate(() => harness.append(1)); assert((await get()).hidden);
  // Resize sequence retains the original row/offset, including concurrent new logs.
  await page.evaluate(() => { harness.panel.list.scrollTop = 500; }); await page.waitForTimeout(30);
  const anchor = await get();
  await page.evaluate(() => { harness.panel.element.style.width = '300px'; }); await page.waitForTimeout(25);
  await page.evaluate(() => { harness.append(1); harness.panel.element.style.width = '260px'; }); await page.waitForTimeout(25);
  await page.evaluate(() => { harness.panel.element.style.width = '310px'; }); await page.waitForTimeout(150);
  const resized = await get(); assert.equal(resized.key, anchor.key); assert(Math.abs(resized.offset - anchor.offset) < 2); assert.equal(resized.unread, anchor.unread + 1);
  // Manual scroll cancels a pending anchor restoration.
  await page.evaluate(() => { harness.panel.element.style.width = '280px'; }); await page.waitForTimeout(25);
  await page.evaluate(() => { harness.panel.list.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 })); harness.panel.list.scrollTop = 900; }); await page.waitForTimeout(20); const manual = await get();
  await page.waitForTimeout(130); assert.equal((await get()).key, manual.key);
  await page.evaluate(() => { harness.panel.element.style.width = '300px'; }); await page.waitForTimeout(150);
  assert.equal((await get()).key, manual.key, 'next resize anchors the new manually chosen row');
  const beforeShrink = await get(); await page.evaluate(() => { harness.panel.list.style.maxHeight = '80px'; }); await page.waitForTimeout(150);
  assert.equal((await get()).key, beforeShrink.key); assert.equal((await get()).unread, beforeShrink.unread);
  // Selection changes and clearing also cancel pending resize work.
  await page.evaluate(() => { harness.panel.element.style.width = '320px'; }); await page.waitForTimeout(25);
  await page.evaluate(() => harness.select('r20')); await page.waitForTimeout(20); assert.equal(await page.evaluate(() => harness.panel.resizeTimer), null);
  await page.evaluate(() => { harness.panel.element.style.width = '340px'; }); await page.waitForTimeout(25);
  await clear(); await page.waitForTimeout(20); assert.equal(await page.evaluate(() => harness.panel.resizeTimer), null);
  await page.evaluate(() => { harness.panel.element.style.width = '330px'; }); await page.waitForTimeout(25);
  await page.locator('.log-unread').click(); assert.equal(await page.evaluate(() => harness.panel.resizeTimer), null); assert((await get()).hidden);
  await page.evaluate(() => { harness.panel.element.style.width = '290px'; harness.append(1); }); await page.waitForTimeout(150);
  assert((await get()).hidden); assert.equal(await page.evaluate(() => harness.panel.follow), true);
  assert.deepEqual(errors, []);
  console.log('Log UI browser PASS: clipboard success/failure, native selection/gesture suppression, stable DOM, scroll/unread >999, row visibility, resize anchors/cancellation/follow');

  // Production integration: persisted repair history, HUD paints and real map input.
  const seed = await context.newPage(); await seed.goto(base);
  const fixture = await seed.evaluate(async sharedUrl => {
    const shared = await import(sharedUrl);
    const { createWorld, bootstrapFromSearch, startSortie } = await import('/src/game/world.ts');
    const { attachCircuitPlay } = await import('/src/game/circuitPlay.ts');
    const { backfillEnemyState } = await import('/src/game/enemyBehavior.ts');
    const { getCoverObjects } = await import('/src/game/coverObjects.ts');
    const world = createWorld(bootstrapFromSearch('')); startSortie(world); attachCircuitPlay(world, null, false);
    world.commandUnlock.mode = 'all_unlocked'; getCoverObjects(world).splice(0); backfillEnemyState(world);
    for (const enemy of world.enemies) { enemy.alive = false; enemy.hp = 0; enemy.enemyState.deathHandled = true; }
    for (const wing of world.wingmen) wing.alive = false;
    world.leader.pos = { x: 600, y: 600 }; world.containers = [];
    world.logs = Array.from({ length: 30 }, (_, i) => ({ t: 30 - i, text: `保存済み戦報 ${30 - i}`, kind: 'battle' }));
    const repair = { at: '2026-10-18T01:02:03.000Z', severity: 'error', counts: { counter: 1, duplicate: 1, source: 0 },
      repairs: [{ kind: 'duplicate', target: 'shields.persisted.shieldId', before: '7', after: '8' }] };
    const hub = { ...shared.INITIAL_HUB, fieldObjectIdentities: { ...shared.emptyFieldObjectIdentities(), repairLogs: [repair] } };
    return { hubKey: shared.HUB_SAVE_STORAGE_KEY, hub: shared.serializeHubSave(shared.createHubSave(hub)),
      checkpoint: JSON.stringify({ v: 1, kind: 'sortie', body: world }) };
  }, sharedUrl);
  const liveContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    permissions: ['clipboard-read', 'clipboard-write'] });
  await liveContext.addInitScript(f => { if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem(f.hubKey, f.hub); localStorage.setItem('estg.sortieCheckpoint', f.checkpoint); sessionStorage.setItem('seeded', '1');
  } }, fixture);
  const live = await liveContext.newPage(); live.on('pageerror', e => errors.push(e.message)); await live.goto(base);
  await live.locator('#sortie-paused').waitFor(); await live.mouse.click(5, 5); await live.waitForTimeout(100);
  await live.evaluate(() => { document.getElementById('log-list').scrollTop = 0; }); await live.waitForTimeout(30);
  const text = await live.evaluate(() => {
    const node = document.querySelector('#log-list .repair').firstChild; window.selectedNode = node;
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 8);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range); return window.getSelection().toString();
  });
  await live.waitForTimeout(400); await live.keyboard.press('c'); await live.waitForTimeout(200);
  assert.equal(await live.evaluate(() => window.getSelection().toString()), text, 'production HUD/new combat logs preserve the selection');
  assert(await live.evaluate(() => selectedNode.isConnected));
  assert(await live.locator('.log-unread').isVisible());
  await live.locator('#log-list .repair').click(); assert.equal(await live.evaluate(() => window.getSelection().toString()), '');
  await live.locator('#log-list .repair').click(); await live.waitForTimeout(40);
  assert.equal(await live.locator('#log-copy-toast').textContent(), '修復詳細をコピーしました');
  assert((await live.evaluate(() => navigator.clipboard.readText())).includes('shields.persisted.shieldId'));
  await live.evaluate(() => { const node = document.querySelector('#log-list .repair').firstChild;
    const r = document.createRange(); r.selectNodeContents(node); window.getSelection().removeAllRanges(); window.getSelection().addRange(r); });
  await live.locator('#map').scrollIntoViewIfNeeded();
  const box = await live.locator('#map').boundingBox();
  await live.mouse.click(box.x + box.width * .8, box.y + box.height * .7);
  assert.equal(await live.evaluate(() => window.getSelection().toString()), '', 'real map tap clears the selection'); await live.waitForTimeout(160);
  await live.reload(); await live.locator('#sortie-paused').waitFor();
  let actual = await live.evaluate(() => JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
  assert.deepEqual(actual.leader.pos, { x: 600, y: 600 }, 'first real map tap only clears selection');
  assert.equal(actual.leader.playerMoveTarget, null);
  await live.mouse.click(5, 5); await live.waitForTimeout(40);
  await live.locator('#map').scrollIntoViewIfNeeded();
  const nextBox = await live.locator('#map').boundingBox();
  await live.mouse.click(nextBox.x + nextBox.width * .8, nextBox.y + nextBox.height * .7); await live.waitForTimeout(160);
  await live.reload(); await live.locator('#sortie-paused').waitFor();
  actual = await live.evaluate(() => JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
  assert.notDeepEqual(actual.leader.pos, { x: 600, y: 600 }, 'next map gesture works normally');
  assert(actual.leader.playerMoveTarget);
  assert.equal(await live.locator('#log-list .repair').count(), 1, 'persisted repair is displayed once after reload');
  await live.mouse.click(5, 5); await live.locator('#log-panel').scrollIntoViewIfNeeded();
  await live.evaluate(() => { document.getElementById('log-list').scrollTop = 0; });
  if (process.env.LOG_UI_SCREENSHOT) await live.screenshot({ path: process.env.LOG_UI_SCREENSHOT, fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Production Explore browser PASS: saved repair/copy/toast, stable selection through HUD/log arrivals, first map gesture blocked, next gesture/old checkpoint work');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
