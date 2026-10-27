/** Local production bundles, persisted board fixtures, native mouse and Chromium touch streams. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const repo=path.resolve(__dirname,'..'),prefix='/-explore-sort-trade-game/invade/';
execFileSync(path.join(repo,'node_modules/.bin/tsx'),[path.join(__dirname,'invade-input-fixtures.ts')]);
const fixtures=JSON.parse(fs.readFileSync('/tmp/invade-input-fixtures.json'));
(async()=>{
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const file=path.resolve(repo,'packages/invade/dist',u.pathname.slice(prefix.length)||'index.html');if(!file.startsWith(path.join(repo,'packages/invade/dist')+'/')||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}${prefix}`;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const results=[];
 try{
  for(const mobile of [false,true]){
   const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:true});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});
   await p.addInitScript(()=>{window.inputTrace=[];for(const t of ['pointerdown','pointermove','pointerup','pointercancel','contextmenu','click'])document.addEventListener(t,e=>{const h=document.elementFromPoint(e.clientX,e.clientY);window.inputTrace.push({t,button:e.button,buttons:e.buttons,pointerType:e.pointerType,target:e.target.id||e.target.tagName,hit:h?.outerHTML.slice(0,180),cancel:e.defaultPrevented});},true);});await p.goto(base);const cell=c=>p.locator(`[data-sx="${c.sx}"][data-sy="${c.sy}"]`);
   const state=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('wreckline.hubSave.v3')).hub.frontProgress);
   const snapshot=async()=>{const s=await state();return JSON.stringify({opened:s.opened,flagged:s.flagged,hitMine:s.hitMine});};
   const load=async kind=>{await p.evaluate(s=>{localStorage.setItem('wreckline.hubSave.v3',s);sessionStorage.clear();},fixtures[kind]);await p.reload();await p.locator('#board-viewport').scrollIntoViewIfNeeded().catch(async e=>{console.error(p.url(),(await p.locator('body').innerText()).slice(0,1500));throw e;});};
   const point=async c=>{const r=await cell(c).boundingBox();assert(r);return{x:r.x+r.width/2,y:r.y+r.height/2};};
   const mouseChord=async order=>{const pt=await point(fixtures.center);await p.mouse.move(pt.x,pt.y);await p.mouse.down({button:order[0]});await p.mouse.down({button:order[1]});await p.mouse.up({button:order[1]});await p.mouse.up({button:order[0]});};
   // Mouse remains available even at mobile width. Both actual second-button pointermove orders.
   await load('plain');await cell(fixtures.safe).click({button:'right'});if(!await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged'))){console.error(JSON.stringify(await p.evaluate(()=>window.inputTrace),null,2));await p.screenshot({path:'/tmp/invade-first-click.png',fullPage:true});}assert(await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged')));await cell(fixtures.safe).click({button:'right'});assert(!await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged')));
   const pt=await point(fixtures.safe);await p.mouse.move(pt.x,pt.y);await p.mouse.down();await p.waitForTimeout(550);assert(!await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged')||e.classList.contains('open')));await p.mouse.up();assert(await cell(fixtures.safe).evaluate(e=>e.classList.contains('open')));
   const compatibility=await snapshot();
   await cell(fixtures.safe).evaluate(e=>{e.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:0}));e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));});assert.equal(await snapshot(),compatibility,'compatibility click/contextmenu cannot commit another operation');
   await load('plain');await cell(fixtures.safe).focus();await cell(fixtures.safe).press('Enter');assert(await cell(fixtures.safe).evaluate(e=>e.classList.contains('open')));
   for(const kind of ['few','many','correct','wrong'])for(const order of [['left','right'],['right','left']]){
    await load(kind);const before=await snapshot();await mouseChord(order);const after=await snapshot();
    if(kind==='few'||kind==='many')assert.equal(after,before,kind+' must not flag or open');
    if(kind==='correct'){assert.notEqual(after,before);assert.equal((await state()).hitMine,false);assert.deepEqual((await state()).flagged,JSON.parse(fixtures[kind]).hub.frontProgress.flagged);}
    if(kind==='wrong'){assert((await state()).hitMine);await p.locator('[data-forced-handoff]').first().waitFor();const locked=await snapshot();await cell(fixtures.safe).click({button:'right'});assert.equal(await snapshot(),locked,'forced lock rejects more input');}
   }
   await load('plain');const beforeView=await snapshot();let q=await point(fixtures.safe);await p.mouse.move(q.x,q.y);await p.mouse.wheel(0,-400);await p.waitForTimeout(80);assert(Number(await p.locator('#board-viewport').getAttribute('data-scale'))>1);
   await p.mouse.down({button:'middle'});await p.mouse.move(q.x+25,q.y+20,{steps:3});await p.mouse.up({button:'middle'});assert.equal(await snapshot(),beforeView);await cell(fixtures.safe).click({button:'right'});assert(await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged')));
   results.push({viewport:mobile?'390x844':'1280x900',scenario:'mouse left/right/long hold, both chord orders and flag counts/wrong flag forced combat, wheel/middle pan transformed hit',status:'PASS'});
   // Native Chromium touch input, including multi-contact pinch/cancel.
   const cdp=await ctx.newCDPSession(p);const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((v,i)=>({x:v.x,y:v.y,id:v.id??i,radiusX:1,radiusY:1,force:1}))});
   for(const reversed of [false,true]){
    await load('plain');if(reversed){await p.locator('#btn-touch-mode').click();await p.locator('#board-viewport').scrollIntoViewIfNeeded();}
    q=await point(fixtures.safe);
    const flag=async()=>{await touch('touchStart',[q]);if(reversed){await p.waitForTimeout(350);assert.equal(await cell(fixtures.safe).getAttribute('data-hold-preview'),'mark');if(mobile)await p.screenshot({path:'/tmp/invade-preview-mark.png'});assert(!await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged')));}await touch('touchEnd',[]);await p.waitForTimeout(320);};
    await flag();assert(await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged')));
    if(reversed){q=await point(fixtures.safe);await touch('touchStart',[q]);await p.waitForTimeout(350);assert.equal(await cell(fixtures.safe).getAttribute('data-hold-preview'),'unmark');await touch('touchCancel',[]);assert.equal(await cell(fixtures.safe).locator('.scope-reticle').evaluate(e=>getComputedStyle(e).opacity),'1');assert(await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged')));}
    // Same assignment clears the flag. Long hold must not act at its threshold.
    q=await point(fixtures.safe);await touch('touchStart',[q]);if(reversed){await p.waitForTimeout(350);assert.equal(await cell(fixtures.safe).getAttribute('data-hold-preview'),'unmark');assert.equal(await cell(fixtures.safe).locator('.scope-reticle').evaluate(e=>getComputedStyle(e).opacity),'0.5');}await touch('touchEnd',[]);await p.waitForTimeout(320);assert(!await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged')));
    q=await point(fixtures.safe);const before=await snapshot();await touch('touchStart',[q]);if(!reversed){await p.waitForTimeout(350);assert.equal(await cell(fixtures.safe).getAttribute('data-hold-preview'),'open');if(mobile)await p.screenshot({path:'/tmp/invade-preview-open.png'});assert.equal(await cell(fixtures.safe).innerText(),'');assert.equal(await snapshot(),before);}await touch('touchEnd',[]);await p.waitForTimeout(320);assert(await cell(fixtures.safe).evaluate(e=>e.classList.contains('open')));
   }
   for(const reversed of [false,true])for(const kind of ['few','many','correct','wrong']){
    await load(kind);if(reversed){await p.locator('#btn-touch-mode').click();await p.locator('#board-viewport').scrollIntoViewIfNeeded();}q=await point(fixtures.center);const before=await snapshot();await touch('touchStart',[q]);await touch('touchEnd',[]);await p.waitForTimeout(320);if(kind==='few'||kind==='many')assert.equal(await snapshot(),before);if(kind==='correct'){assert.notEqual(await snapshot(),before);assert(!(await state()).hitMine);assert.deepEqual((await state()).flagged,JSON.parse(fixtures[kind]).hub.frontProgress.flagged);}if(kind==='wrong')assert((await state()).hitMine);
   }
   await load('plain');q=await point(fixtures.safe);const stable=await snapshot();await touch('touchStart',[q]);await p.waitForTimeout(550);assert.equal(await snapshot(),stable);await touch('touchMove',[{x:q.x+30,y:q.y+20}]);await touch('touchMove',[{x:q.x+45,y:q.y+30}]);await touch('touchEnd',[]);await p.waitForTimeout(320);assert.equal(await snapshot(),stable);assert.notEqual(await p.locator('#board-viewport').getAttribute('data-pan-x'),'0');
   q=await point(fixtures.safe);await touch('touchStart',[q]);await touch('touchCancel',[]);await p.waitForTimeout(550);assert.equal(await snapshot(),stable);
   // Pinch begins after a contact was held: it must cancel its pending hold release too.
   await load('plain');q=await point(fixtures.safe);const clean=await snapshot();await touch('touchStart',[{...q,id:1}]);await p.waitForTimeout(500);await touch('touchStart',[{...q,id:1},{x:q.x+25,y:q.y,id:2}]);await touch('touchMove',[{x:q.x-15,y:q.y,id:1},{x:q.x+50,y:q.y,id:2}]);await touch('touchEnd',[]);await p.waitForTimeout(320);assert.equal(await snapshot(),clean);assert(Number(await p.locator('#board-viewport').getAttribute('data-scale'))>1);
   await load('plain');q=await point(fixtures.safe);const noTap=await snapshot();for(let n=0;n<2;n++){await touch('touchStart',[q]);await touch('touchEnd',[]);await p.waitForTimeout(60);}await p.waitForTimeout(320);assert.equal(await snapshot(),noTap);assert.equal(Number(await p.locator('#board-viewport').getAttribute('data-scale')),2);
   // Hit the original cell at its new drawn position after zoom.
   q=await point(fixtures.safe);await touch('touchStart',[q]);await touch('touchEnd',[]);assert(await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged')));

   // Ctrl-left and its compatibility events never open or double-toggle.
   await load('plain');await cell(fixtures.safe).click({modifiers:['Control']});assert(await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged')));assert(!await cell(fixtures.safe).evaluate(e=>e.classList.contains('open')));
   const ctrlState=await snapshot();await cell(fixtures.safe).evaluate(e=>{for(const name of ['contextmenu','click'])e.dispatchEvent(new MouseEvent(name,{ctrlKey:true,bubbles:true,cancelable:true}));});assert.equal(await snapshot(),ctrlState);
   await cell(fixtures.safe).click({modifiers:['Control']});assert(!await cell(fixtures.safe).evaluate(e=>e.classList.contains('flagged')));
   // Captured cell rectangle at a large zoom: >8px jitter still holds, outside pans immediately.
   for(const scaleDelta of [-300,0,500])for(const held of [false,true]){
    await load('plain');q=await point(fixtures.safe);await p.mouse.move(q.x,q.y);await p.mouse.wheel(0,-scaleDelta);await p.waitForTimeout(40);
    q=await point(fixtures.safe);const before=await snapshot(),rect=await cell(fixtures.safe).boundingBox();
    await touch('touchStart',[q]);if(held)await p.waitForTimeout(350);
    const panBefore=await p.locator('#board-viewport').getAttribute('data-pan-x');
    await touch('touchMove',[{x:rect.x+rect.width+2,y:q.y}]);assert.equal(await p.locator('#board-viewport').getAttribute('data-pan-x'),panBefore,'boundary crossing rebases without jump');
    assert.equal(await p.locator('[data-hold-preview]').count(),0);await touch('touchMove',[{x:rect.x+rect.width+16,y:q.y+5}]);
    await touch('touchMove',[q]);await touch('touchEnd',[]);await p.waitForTimeout(310);assert.equal(await snapshot(),before,'pan out and back must never act');
   }
   await load('plain');q=await point(fixtures.safe);await p.mouse.move(q.x,q.y);await p.mouse.wheel(0,-700);await p.waitForTimeout(50);q=await point(fixtures.safe);const jitterBefore=await snapshot();
   await touch('touchStart',[q]);await touch('touchMove',[{x:q.x+9,y:q.y}]);await p.waitForTimeout(350);assert.equal(await cell(fixtures.safe).getAttribute('data-hold-preview'),'open');assert.equal(await snapshot(),jitterBefore);await touch('touchEnd',[]);assert(await cell(fixtures.safe).evaluate(e=>e.classList.contains('open')));
   // No hidden information is leaked: a closed enemy produces the same empty flip preview.
   await load('plain');q=await point(fixtures.mine);await touch('touchStart',[q]);await p.waitForTimeout(350);assert.equal(await cell(fixtures.mine).getAttribute('data-hold-preview'),'open');assert.equal(await cell(fixtures.mine).innerText(),'');assert.equal(await cell(fixtures.mine).locator('.enemy-icon').count(),0);await touch('touchCancel',[]);assert.equal(await p.locator('[data-hold-preview]').count(),0);
   for(const cancel of ['blur','pointercancel','home','pinch']){
    await load('plain');await p.locator('#btn-touch-mode').click();await p.locator('#board-viewport').scrollIntoViewIfNeeded();q=await point(fixtures.safe);const before=await snapshot();
    await touch('touchStart',[q]);await p.waitForTimeout(350);assert.equal(await cell(fixtures.safe).getAttribute('data-hold-preview'),'mark');
    if(cancel==='blur')await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
    else if(cancel==='pointercancel')await touch('touchCancel',[]);
    else if(cancel==='home')await p.locator('#btn-home').evaluate(e=>e.click());
    else await touch('touchStart',[{...q,id:0},{x:q.x+30,y:q.y,id:1}]);
    assert.equal(await p.locator('[data-hold-preview]').count(),0);if(cancel!=='pointercancel')await touch('touchEnd',[]);await p.waitForTimeout(310);assert.equal(await snapshot(),before);
   }
   // Number contacts must also cancel chord on an immediate pan.
   await load('correct');q=await point(fixtures.center);const numberBefore=await snapshot();await touch('touchStart',[q]);await touch('touchMove',[{x:q.x+30,y:q.y}]);await touch('touchMove',[{x:q.x+50,y:q.y}]);await touch('touchMove',[q]);await touch('touchEnd',[]);await p.waitForTimeout(310);assert.equal(await snapshot(),numberBefore);
   // Home resets only view, centers HQ, and keeps progress and selection intact.
   const homeBefore=await state();await p.mouse.move(q.x,q.y);await p.mouse.down({button:'middle'});await p.mouse.move(q.x+3000,q.y+3000);await p.mouse.up({button:'middle'});
   const visible=await p.locator('.front-ms').boundingBox(),vp=await p.locator('#board-viewport').boundingBox();assert(visible.x<vp.x+vp.width&&visible.y<vp.y+vp.height&&visible.x+visible.width>vp.x&&visible.y+visible.height>vp.y);
   await p.locator('#btn-home').click();await p.locator('#board-viewport').scrollIntoViewIfNeeded();assert.equal(Number(await p.locator('#board-viewport').getAttribute('data-scale')),1);assert.deepEqual(await state(),homeBefore);
   const hq=await cell({sx:0,sy:0}).boundingBox(),view=await p.locator('#board-viewport').boundingBox();assert(Math.abs(hq.x+hq.width/2-view.x-view.width/2)<2);assert(Math.abs(hq.y+hq.height/2-view.y-view.height/2)<2);
   await load('wrong');await mouseChord(['left','right']);const forcedBefore=await snapshot();await p.locator('#btn-home').click();assert.equal(await snapshot(),forcedBefore);assert(await p.locator('.cell.open.mine .enemy-icon').count()>0);assert.equal(await p.locator('.cell.closed .enemy-icon').count(),0);
   assert((await p.locator('.flag-ops-guide').innerText()).includes('300ms'));assert(!(await p.locator('body').innerText()).includes('旗を立て'));
   results.push({viewport:mobile?'390x844':'1280x900',scenario:'300ms open/mark/unmark previews; no hidden enemy; immediate boundary pan, jitter/zoom, blur/cancel/home/pinch cleanup; Ctrl-left; HQ center and immutable progress; recon symbols',status:'PASS'});
   await p.reload();assert.equal(await p.locator('#btn-touch-mode').getAttribute('aria-pressed'),'false');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await p.screenshot({path:`/tmp/invade-input-${mobile?'mobile':'desktop'}.png`,fullPage:true});
   results.push({viewport:mobile?'390x844':'1280x900',scenario:'native touch default/reversed set/unset/open, invariant number chord, release-only hold, hold-pan, cancel, pinch, double tap suppression, transformed hit, reload default',status:'PASS'});await ctx.close();
  }
  console.log(JSON.stringify({method:'local production bundle, seeded persisted front board, actual mouse and CDP touch input',results,physicalSmartphone:'NOT_RUN',publicVersion:'NOT_RUN'},null,2));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
