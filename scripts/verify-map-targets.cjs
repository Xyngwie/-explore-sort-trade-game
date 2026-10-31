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
  console.error('seed ready');const forged=base+'?debug_fixture=shield&yieldBag=ammo%3A99&handoffId=normal-token';await p.evaluate(href=>{localStorage.setItem('wreckline.pendingSortHandoff.v1',JSON.stringify({href,createdAt:Date.now()}));sessionStorage.setItem('normal-session-sentinel','untouched');},forged);const normal=await p.evaluate(()=>window.normalSnapshot());assert(Object.keys(normal).length);
  await p.locator('#shield-debug-console > summary').click();await p.getByRole('link',{name:'盾検証モードへ入る（専用セーブ）'}).click();await p.locator('#debug-start').waitFor({state:'attached'});console.error('debug ready');await p.goto(forged);await p.locator('#debug-start').waitFor({state:'attached'});assert.deepEqual(await p.evaluate(()=>window.normalSnapshot()),normal,'first HTML return-token guard must be isolated');
  const open=async()=>{if(!await p.locator('#shield-debug-console').evaluate(e=>e.open))await p.locator('#shield-debug-console > summary').click();};
  const inspect=async()=>{await open();await p.locator('#debug-inspect').click();return JSON.parse(await p.locator('#debug-inspection').innerText());};
  const checkpoint=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
  const start=async preset=>{await open();await p.locator('#debug-preset').selectOption(preset);const old=p.url();await p.locator('#debug-start').click();await p.waitForURL(u=>u.toString()!==old&&u.searchParams.get('debug_preset')===preset);await p.locator('#sortie-paused').waitFor();};
  const resume=async()=>{await p.mouse.click(5,5);await p.locator('#sortie-paused').waitFor({state:'detached'});};
  const tap=async kind=>{await p.locator('#map').scrollIntoViewIfNeeded();await p.waitForFunction(k=>window[k],kind);const pt=await p.evaluate(k=>{const c=document.querySelector('#map'),r=c.getBoundingClientRect(),v=Array.isArray(window[k])?window[k].at(-1):window[k];return{x:r.left+v.x*r.width/c.width,y:r.top+v.y*r.height/c.height};},kind);await p.mouse.click(pt.x,pt.y);};
  const close=async()=>{if(await p.locator('#shield-debug-console').evaluate(e=>e.open))await p.locator('#shield-debug-console > summary').click();};
  const worldTap=async(x,y)=>{await close();await p.locator('#map').scrollIntoViewIfNeeded();
    const pt=await p.evaluate(({x,y})=>{const c=document.querySelector('#map'),r=c.getBoundingClientRect();const w=JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body;
      // Runtime camera follows the leader deterministically. Use observed leader position from inspect, not stale checkpoint camera.
      const lead=window.testLeaderPos;const cx=Math.max(0,Math.min(w.balance.worldW-w.camera.w,lead.x-w.camera.w*w.balance.cameraLeadXFrac));const cy=Math.max(0,Math.min(w.balance.worldH-w.camera.h,lead.y-w.camera.h*w.balance.cameraLeadYFrac));
      return{x:r.left+(x-cx)*r.width/w.camera.w,y:r.top+(y-cy)*r.height/w.camera.h};},{x,y});await p.mouse.click(pt.x,pt.y);};
  const setup=async preset=>{await start(preset);await resume();const state=await inspect();await p.evaluate(pos=>window.testLeaderPos=pos,state.units[0].pos);await close();};
  await setup('BARRICADE_PERSISTENCE_READY');await worldTap(622,600);
  const choices=p.locator('[data-map-choice]');assert(await choices.filter({hasText:/^設置盾/}).count());assert(await choices.filter({hasText:/^地面盾/}).count());assert(await choices.filter({hasText:/^残骸盾/}).count());
  await p.screenshot({path:'/tmp/map-targets-choices-mobile.png',fullPage:true});await choices.filter({hasText:/^地面盾/}).click();await p.locator('[data-shield-pick="debug-ground"]').waitFor();
  await worldTap(622,600);await choices.filter({hasText:/^設置盾/}).first().click();await p.locator('[data-barricade-dismantle="debug-wall"]').waitFor();
  await worldTap(622,600);await choices.filter({hasText:/^残骸盾/}).click();assert((await inspect()).stripping.jobs['debug-wreck']);
  results.push({scenario:'dense wall, ground and wreck individually selectable via real map taps',status:'PASS'});
  await setup('BARRICADE_PERSISTENCE_READY');await worldTap(655,600);await choices.filter({hasText:/^僚機/}).click();await p.locator('[data-wing-act="load"]').waitFor();
  results.push({scenario:'dense wingman selection opens its actual eligible individual actions (no captain 1x1 in preset)',status:'PASS'});
  await setup('STRIPPING_READY');await p.locator('#btn-strip').click();await worldTap(590,620);assert.equal(await p.locator('#map-target-choices').count(),0);assert((await inspect()).stripping.jobs['debug-wreck']);
  await setup('P_SHIELD_LEADER_READY');await open();await p.locator('#lab-pause').click();
  const shieldSection=p.locator('#alpha-lab summary').filter({hasText:/^盾$/});if(!await shieldSection.locator('..').evaluate(e=>e.open))await shieldSection.click();
  await p.locator('#lab-shield-existing').selectOption('debug-ground');await p.locator('#lab-shield-delete').click();assert((await p.locator('#lab-status').innerText()).startsWith('成功'));
  await p.locator('#lab-pause').click();await close();await p.locator('#btn-barricade').click();await p.waitForFunction(()=>document.body.textContent.includes('屹立：盾を設置しました'));
  await worldTap(622,600);assert.equal(await p.locator('#map-target-choices').count(),0);await p.locator('[data-barricade-dismantle="debug-equipped"]').waitFor();
  results.push({scenario:'isolated placed wall opens dismantle panel in one tap',status:'PASS'});
  await setup('NO_SHIELD_NO_CIRCUIT');await worldTap(610,620);assert.equal(await p.locator('#map-target-choices').count(),0);await p.locator('[data-shield-pick="debug-ground"]').waitFor();
  await worldTap(500,500);assert.equal(await p.locator('#map-target-choices').count(),0);await p.waitForTimeout(250);const moved=await inspect();assert(moved.units[0].pos.x<600 && moved.units[0].pos.y<600);
  results.push({scenario:'explicit stripping, single ground shield and ordinary movement retain existing flow',status:'PASS'});
  await setup('BARRICADE_PERSISTENCE_READY');await worldTap(622,600);await choices.filter({hasText:'この地点へ移動'}).click();assert.equal(await p.locator('#map-target-choices').count(),0);
  await worldTap(622,600);await choices.filter({hasText:'取消',exact:true}).click();assert.equal(await p.locator('#map-target-choices').count(),0);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(await p.evaluate(()=>window.normalSnapshot()),normal);assert.deepEqual(errors,[]);
  await p.screenshot({path:'/tmp/map-targets-mobile.png',fullPage:true});
  results.push({scenario:'explicit movement/cancel, 390px overflow and normal save isolation',status:'PASS'});
  console.log(JSON.stringify({viewport:[390,844],method:'local production builds, real controls; read-only observations only',results,physicalDevice:'NOT_RUN',publicFixedVersion:'NOT_RUN'},null,2));await ctx.close();
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
