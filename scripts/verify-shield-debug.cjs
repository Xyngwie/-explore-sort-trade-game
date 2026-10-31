/** Same-origin production-build interaction; no fixture injection into game state. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const project='/-explore-sort-trade-game/',prefix='wreckline.DEBUG_FIXTURE.shield.v1:',repo=path.resolve(__dirname,'..');
const presets=['NO_SHIELD_NO_CIRCUIT','NORMAL_SHIELD_AND_RESERVE','STRIPPING_READY','P_SHIELD_LEADER_READY','P_SHIELD_WINGMAN_READY','BARRICADE_PERSISTENCE_READY'];
(async()=>{
 const server=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://preview').pathname);if(!p.startsWith(project)){res.writeHead(404).end();return;}p=p.slice(project.length);let module='trade';for(const m of ['explore','sort','invade','restore'])if(p.startsWith(m+'/')){module=m;p=p.slice(m.length+1);break;}const root=path.join(repo,'packages',module,'dist'),file=path.resolve(root,p||'index.html');if(!file.startsWith(root+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}${project}`;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const results=[];
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
  await ctx.addInitScript(()=>{
   const native=window.localStorage,session=window.sessionStorage;const snap=s=>Object.fromEntries(Object.keys(s).filter(k=>!k.startsWith('wreckline.DEBUG_FIXTURE.shield.v1:')).sort().map(k=>[k,s.getItem(k)]));window.normalSnapshot=()=>({local:snap(native),session:snap(session)});
   const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,x,y,...rest){if(t.startsWith('設置盾')){window.wallPoints??=[];window.wallPoints.push({x,y:y+12});window.wallPoints=window.wallPoints.slice(-4);}if(t.startsWith('盾 ×'))window.groundPoint={x,y};if(t==='残骸')window.wreckPoint={x,y:y+12};return original.call(this,t,x,y,...rest);};
  });
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});p.on('dialog',d=>d.accept());
  console.error("normal entry",base);await p.goto(base);await p.locator('#btn-seed').click();await p.waitForFunction(()=>!document.querySelector('#play-log-blocker'));await p.locator('[data-circuit-purchase]').waitFor();
  console.error('seed ready');const forged=base+'?debug_fixture=shield&yieldBag=ammo%3A99&handoffId=normal-token';await p.evaluate(href=>{localStorage.setItem('wreckline.pendingSortHandoff.v1',JSON.stringify({href,createdAt:Date.now()}));sessionStorage.setItem('normal-session-sentinel','untouched');},forged);await p.waitForFunction(()=>!document.querySelector('#play-log-blocker'));const normal=await p.evaluate(()=>window.normalSnapshot());assert(Object.keys(normal).length);
  await p.locator('#shield-debug-console > summary').click();await p.getByRole('link',{name:'盾検証モードへ入る（専用セーブ）'}).click();await p.locator('#debug-start').waitFor({state:'attached'});console.error('debug ready');await p.goto(forged);await p.locator('#debug-start').waitFor({state:'attached'});assert.deepEqual(await p.evaluate(()=>window.normalSnapshot()),normal,'first HTML return-token guard must be isolated');
  const open=async()=>{if(!await p.locator('#shield-debug-console').evaluate(e=>e.open))await p.locator('#shield-debug-console > summary').click();};
  const inspect=async()=>{await open();await p.locator('#debug-inspect').click();return JSON.parse(await p.locator('#debug-inspection').innerText());};
  const checkpoint=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
  const start=async preset=>{await open();await p.locator('#debug-preset').selectOption(preset);const old=p.url();await p.locator('#debug-start').click();await p.waitForURL(u=>u.toString()!==old&&u.searchParams.get('debug_preset')===preset);await p.locator('#sortie-paused').waitFor();};
  const resume=async()=>{await p.mouse.click(5,5);await p.locator('#sortie-paused').waitFor({state:'detached'});};
  const tap=async kind=>{await p.locator('#map').scrollIntoViewIfNeeded();await p.waitForFunction(k=>window[k],kind);const pt=await p.evaluate(k=>{const c=document.querySelector('#map'),r=c.getBoundingClientRect(),v=Array.isArray(window[k])?window[k].at(-1):window[k];return{x:r.left+v.x*r.width/c.width,y:r.top+v.y*r.height/c.height};},kind);await p.mouse.click(pt.x,pt.y);};
  for(const preset of presets){
   console.error('verify preset',preset);await start(preset);const w=await checkpoint();assert.equal(w.phase,'sortie');assert.equal(w.deployedInstanceIds.length,2);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390px overflow');
   const savedShields=JSON.stringify(w.shieldState.identities.shields);await p.reload();await p.locator('#sortie-paused').waitFor();assert.equal(JSON.stringify((await checkpoint()).shieldState.identities.shields),savedShields);
   assert.deepEqual(await p.evaluate(()=>window.normalSnapshot()),normal);
   await resume();const s=await inspect();assert.equal(s.type,'DEBUG_FIXTURE');for(const shield of s.shields)assert.equal(shield.owners.length,1);
   if(preset==='NO_SHIELD_NO_CIRCUIT'){assert(await p.locator('#btn-barricade').isHidden());assert.equal(await p.locator('#btn-strip').count(),0);await tap('groundPoint');await p.locator('[data-shield-pick="debug-ground"]').click();await p.locator('[data-shield-drop="debug-ground"]').waitFor();}
   if(preset==='P_SHIELD_WINGMAN_READY'){assert(await p.locator('#btn-barricade').isHidden());await p.locator('[data-wing-select="wing-a"]').click();await p.locator('[data-wing-act="barricade"]').click();await p.waitForFunction(()=>document.body.textContent.includes('屹立：盾を設置しました'));}
   results.push({preset,status:'PASS',reloadPreservesIdentity:true,normalSaveUnchanged:true});
  }
  // Persistence preset starts two real jobs; reload retains remaining time.
  let w=await checkpoint();assert(w.barricades.jobs['wing-a'].seconds<2);assert.equal(w.stripping.jobs['debug-wreck'].seconds,3);
  await p.waitForFunction(()=>document.body.textContent.includes('屹立：盾を設置しました'));
  await p.waitForFunction(()=>document.body.textContent.includes('残骸盾：盾を1枚生成'),null,{timeout:12000});
  await p.reload();await p.locator('#sortie-paused').waitFor();w=await checkpoint();assert(w.barricades.walls['debug-wing-equipped']);assert(w.shieldState.identities.shields['strip-shield:strip-wreck:5']||w.stripping.jobs['debug-wreck'].completed);
  await resume();await open();const download=await Promise.all([p.waitForEvent('download'),p.locator('#debug-export').click()]);const exported=JSON.parse(fs.readFileSync(await download[0].path(),'utf8'));assert.equal(exported.type,'DEBUG_FIXTURE');assert.equal(exported.metadata.preset,'BARRICADE_PERSISTENCE_READY');assert(exported.local['wreckline.hubSave.v3']);assert(!JSON.stringify(exported.local).includes('seed_op_gen1'),'no normal-save export');
  // Real hostile fire: damage goes to the front shield, then the reserve exchanges.
  await start('NORMAL_SHIELD_AND_RESERVE');await resume();await open();
  await p.waitForFunction(()=>document.body.textContent.includes('盾交換中'),null,{timeout:25000});
  await p.waitForFunction(()=>{document.getElementById('debug-inspect').click();const s=JSON.parse(document.getElementById('debug-inspection').textContent);return s.shields.some(s=>s.key==='debug-reserve'&&s.owners.some(o=>o.kind==='equipped'&&o.unit==='leader'));},null,{timeout:5000});
  const exchanged=await inspect();assert(exchanged.shields.some(s=>s.key==='debug-reserve'&&s.owners.some(o=>o.kind==='equipped'&&o.unit==='leader')));assert(!exchanged.shields.some(s=>s.key==='debug-equipped'));results.push({scenario:'hostile fire, front shield depletion and two-second reserve exchange',status:'PASS'});
  // Leader placement, actual wall tap/dismantle and separate pickup.
  await start('P_SHIELD_LEADER_READY');await resume();await p.locator('#btn-barricade').click();await p.waitForFunction(()=>document.body.textContent.includes('屹立：盾を設置しました'));
  await p.keyboard.down('d');await p.waitForTimeout(500);await p.keyboard.up('d');const blocked=await inspect();assert(blocked.units[0].pos.x<610,'movement must stop at wall');
  await tap('wallPoints');if(await p.locator('#map-target-choices').count())await p.locator('[data-map-choice]').filter({hasText:/^設置盾/}).first().click();
  await p.locator('[data-barricade-dismantle="debug-equipped"]').click();await p.waitForFunction(()=>document.body.textContent.includes('撤去：盾を地面に戻しました'));
  await tap('wallPoints');if(await p.locator('#map-target-choices').count())await p.locator('[data-map-target-kind=ground][data-map-target-key=debug-equipped]').click();await p.locator('[data-shield-pick="debug-equipped"]').click();await p.locator('[data-shield-drop="debug-equipped"]').waitFor();
  // The recovered wall is the same shield, now equipped after a separate pickup.
  await p.reload();await p.locator('#sortie-paused').waitFor();w=await checkpoint();assert.equal(w.shieldState.identities.shields['debug-equipped'].hp,47.25);assert.equal(w.shieldState.equipped.leader.key,'debug-equipped');await resume();
  await p.locator('#btn-extract').click();await p.waitForFunction(()=>document.body.textContent.includes('作戦結果'),null,{timeout:25000});await open();const result=await inspect();assert.equal(result.type,'DEBUG_FIXTURE');
  const hub=await p.evaluate(()=>JSON.parse(localStorage.getItem('wreckline.hubSave.v3')).hub);assert(hub.fieldCells?.some(c=>c.ground['debug-equipped']));
  const back=p.locator('a').filter({hasText:'格納庫へ'}).first();assert(new URL(await back.getAttribute('href')).searchParams.get('debug_fixture')==='shield');await back.click();await p.locator('#debug-start').waitFor({state:'attached'});assert.deepEqual(await p.evaluate(()=>window.normalSnapshot()),normal);
  // Use the regular hangar departure rather than resetting the preset.
  await p.locator('#link-deploy').click();await p.locator('#btn-start').waitFor();await p.locator('#btn-start').click();await p.waitForTimeout(300);let restored=await inspect();assert(restored.shields.some(s=>s.key==='debug-equipped'&&s.hp===47.25&&s.owners[0]?.kind==='ground'));
  await open();await p.screenshot({path:'/tmp/shield-debug-mobile.png',fullPage:true});assert.deepEqual(await p.evaluate(()=>window.normalSnapshot()),normal);const oldRun=await p.evaluate(()=>JSON.parse(localStorage.getItem('DEBUG_FIXTURE.meta')).run);await p.locator('#debug-reset').click();await p.locator('#sortie-paused').waitFor();assert.notEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('DEBUG_FIXTURE.meta')).run),oldRun);assert.equal((await checkpoint()).shieldState.equipped.leader.key,'debug-equipped');assert.deepEqual(await p.evaluate(()=>window.normalSnapshot()),normal,'explicit reset must not clear normal data');for(const module of ['sort','restore','invade']){await p.goto(base+module+'/?debug_fixture=shield');await p.locator('#shield-debug-console').waitFor();assert(p.url().includes('debug_fixture=shield'));assert.deepEqual(await p.evaluate(()=>window.normalSnapshot()),normal,`${module}: normal data unchanged`);}
  await open();await p.locator('#debug-exit').click();await p.locator('[data-circuit-purchase]').waitFor();assert(!p.url().includes('debug_fixture'));assert.deepEqual(await p.evaluate(()=>window.normalSnapshot()),normal);
  assert.deepEqual(errors,[]);results.push({scenario:'real jobs, evidence export, movement blocking, dismantle/pickup, return/HUB/re-sortie, explicit reset, all-module and exit isolation',status:'PASS'});console.log(JSON.stringify({viewport:[390,844],method:'same-origin local production builds, real UI, DEBUG_FIXTURE',physicalDevice:'NOT_RUN',publicVersion:'NOT_RUN',results},null,2));await ctx.close();
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
