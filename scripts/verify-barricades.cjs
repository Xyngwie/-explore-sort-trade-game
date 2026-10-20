/** #315: real leader/wingman construction, reload, dismantle, pickup and field return at 390px. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const sharedUrl='/@fs'+require('node:path').resolve(__dirname,'../packages/shared/src/index.ts');
const base=process.env.EXPLORE_BASE_URL||'http://127.0.0.1:5173';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const seed=await browser.newPage();await seed.goto(base);
 const fixture=await seed.evaluate(async url=>{
  const s=await import(url),{createWorld,bootstrapFromSearch,startSortie}=await import('/src/game/world.ts');
  const {attachCircuitPlay}=await import('/src/game/circuitPlay.ts'),{attachLostMechContext}=await import('/src/game/lostMechs.ts'),{attachFieldPersistence}=await import('/src/game/fieldPersistence.ts');
  const hub=s.normalizeHubSnapshot({...s.INITIAL_HUB,fleet:['leader','wing'].map(instanceId=>s.createOwnedMech('mech_gen1',{instanceId})),sortieSelection:['leader','wing'],invadeRank:{current:5,highestCleared:4},frontProgress:{seed:812,aoiHalf:12,opened:[],flagged:[],focus:null},circuits:['leader','wing'].map(id=>({circuitId:'p-'+id,circuitBoard:s.buildVerifyPerfectLockedBoard('test'),restoreState:'fully_awakened',origin:'crafted',equippedTo:id,effectKey:'p_shield'}))});
  const p=s.buildTradeToExplorePayloadFromFleet(hub.fleet,0,['leader','wing']),q=new URL(s.buildTradeToExploreUrl(p,'https://example.test/')).searchParams;q.set('sectorX','1');q.set('sectorY','2');q.set('density','.2');
  const w=createWorld(bootstrapFromSearch('?'+q));attachLostMechContext(w,hub);attachCircuitPlay(w,hub,true);attachFieldPersistence(w,hub);startSortie(w);
  w.containers=[];w.coverObjects=[];w.enemies=[];w.salvaged=1;w.leader.salvagedCount=1;w.leader.pos={x:600,y:600};w.leader.heading=0;w.leader.moveHeading=null;w.leader.aimWant=null;w.leader.moveTarget=null;w.leader.playerMoveTarget=null;
  const wing=w.wingmen[0];w.wingmen=[wing];wing.pos={x:700,y:600};wing.heading=Math.PI/2;wing.moveHeading=null;wing.aimWant=null;wing.stance='escort';wing.holdOrder=true;
  let ids=s.emptyFieldObjectIdentities();for(const id of ['leader','wing']){ids=s.registerWreckIdentity(ids,'source-'+id);ids=s.shieldIdentityFromWreck(ids,'source-'+id,id,{hp:47.25,maxHp:62.75});}
  w.shieldState={identities:ids,ground:{},equipped:{leader:{kind:'shield',key:'leader'},[wing.id]:{kind:'shield',key:'wing'}}};
  return{world:w,save:s.createHubSave(hub),key:s.HUB_SAVE_STORAGE_KEY,search:'?'+q,wing:wing.id,identity:ids.shields};
 },sharedUrl);await seed.close();
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await ctx.addInitScript(d=>{
  if(!sessionStorage.getItem('fixture')){localStorage.setItem(d.key,JSON.stringify(d.save));localStorage.setItem('estg.sortieCheckpoint',JSON.stringify({v:1,kind:'sortie',body:d.world}));sessionStorage.setItem('fixture','1');}
  const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,x,y,...rest){if(t.startsWith('設置盾')){window.wallPoints??=[];window.wallPoints.push({x,y:y+12});window.wallPoints=window.wallPoints.slice(-2);}if(t==='盾 ×1')window.groundPoint={x,y};return original.call(this,t,x,y,...rest);};
 },fixture);
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/'+fixture.search);await p.locator('#sortie-paused').waitFor();await p.mouse.click(5,5);
 await p.locator('#btn-barricade').click();await p.waitForTimeout(800);await p.reload();await p.locator('#sortie-paused').waitFor();
 let saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);assert(saved.barricades.jobs.leader.seconds>0&&saved.barricades.jobs.leader.seconds<2);assert(saved.shieldState.equipped.leader);
 const progress=saved.barricades.jobs.leader.seconds;await p.waitForTimeout(600);assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body)).barricades.jobs.leader.seconds,progress,'offline/paused no progress');
 await p.mouse.click(5,5);await p.waitForFunction(()=>document.body.textContent.includes('屹立：盾を設置しました'));
 await p.locator(`[data-wing-select="${fixture.wing}"]`).click();await p.locator('[data-wing-act="barricade"]').click();await p.waitForTimeout(2300);
 await p.reload();await p.locator('#sortie-paused').waitFor();saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
 assert.equal(Object.keys(saved.barricades.walls).length,2);assert.equal(saved.barricades.walls.leader.heading,0);assert.deepEqual(saved.shieldState.identities.shields,fixture.identity);assert.equal(saved.shieldState.equipped[fixture.wing],undefined);
 await p.mouse.click(5,5);await p.waitForFunction(()=>window.wallPoints?.length);
 await p.locator('#map').scrollIntoViewIfNeeded();let point=await p.evaluate(()=>{const c=document.querySelector('#map'),r=c.getBoundingClientRect(),v=window.wallPoints.reduce((a,b)=>a.x<b.x?a:b);return{x:r.left+v.x*r.width/c.width,y:r.top+v.y*r.height/c.height};});await p.mouse.click(point.x,point.y);
 await p.locator('[data-barricade-dismantle="leader"]').click();await p.waitForTimeout(750);await p.reload();await p.locator('#sortie-paused').waitFor();saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);assert(saved.barricades.jobs.leader.kind==='dismantle');assert(saved.barricades.jobs.leader.seconds>0&&saved.barricades.jobs.leader.seconds<2);
 await p.mouse.click(5,5);await p.waitForFunction(()=>document.body.textContent.includes('撤去：盾を地面に戻しました'));await p.waitForFunction(()=>window.groundPoint);
 await p.locator('#map').scrollIntoViewIfNeeded();point=await p.evaluate(()=>{const c=document.querySelector('#map'),r=c.getBoundingClientRect(),v=window.groundPoint;return{x:r.left+v.x*r.width/c.width,y:r.top+v.y*r.height/c.height};});await p.mouse.click(point.x,point.y);
 await p.locator('[data-shield-pick="leader"]').click();await p.locator('[data-shield-drop="leader"]').waitFor();assert((await p.locator('#hud-speed').innerText()).includes('盾 47.3/62.8'));
 await p.screenshot({path:'/tmp/pr315-barricades-mobile.png',fullPage:true});
 await p.locator('#btn-extract').click();await p.locator('#btn-again').waitFor({timeout:26000});
 const hub=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).hub,fixture.key);assert(hub.fieldCells[0].barricades.wing);assert(hub.fieldCells[0].ground.leader);assert.deepEqual(hub.fieldObjectIdentities.shields.wing,fixture.identity.wing);
 await p.locator('#btn-again').click();await p.locator('#btn-start').click();await p.reload();await p.locator('#sortie-paused').waitFor();saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);assert(saved.barricades.walls.wing);assert.equal(saved.shieldState.identities.shields.wing.hp,47.25);
 assert.deepEqual(errors,[]);await ctx.close();
 console.log('Barricades browser 390x844 PASS: leader/individual wingman own commands, 2s construction, checkpoint/offline pause, rectangle rendering, dismantle checkpoint/remaining time, separate 2s pickup, precise identity, real 15s return/save/redeploy wall restoration');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
