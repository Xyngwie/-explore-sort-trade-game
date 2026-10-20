const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.EXPLORE_BASE_URL||'http://127.0.0.1:5173';
const sharedUrl='/@fs'+require('node:path').resolve(__dirname,'../packages/shared/src/index.ts');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
 const seed=await browser.newPage();await seed.goto(base);
 const fixtures=await seed.evaluate(async url=>{
  const shared=await import(url),{createWorld,bootstrapFromSearch,startSortie}=await import('/src/game/world.ts');
  const {attachCircuitPlay}=await import('/src/game/circuitPlay.ts'),{getCoverObjects}=await import('/src/game/coverObjects.ts');
  const {backfillEnemyState}=await import('/src/game/enemyBehavior.ts');
  function make(combat){
   const w=createWorld(bootstrapFromSearch(''));startSortie(w);attachCircuitPlay(w,null,false);getCoverObjects(w).splice(0);
   w.containers=[];w.wingmen=[];w.enemies=combat?w.enemies.slice(0,1):[];w.leader.pos={x:600,y:600};w.leader.heading=0;
   w.leader.instanceId='leader';w.currentAmmo.leader=0;w.mechBattery.leader={capacity:300,activity:300};
   let ids=shared.emptyFieldObjectIdentities();const ground={};
   const rows=combat?[['fragile',1,50],['spare',35,50]]:[['a',30,50],['b',30,40],['c',30,40],['d',40,60]];
   for(const [key,hp,maxHp] of rows){ids=shared.shieldIdentityFromWreck(shared.registerWreckIdentity(ids,'w:'+key),'w:'+key,key,{hp,maxHp});ground[key]={x:620,y:600};}
   w.shieldState={identities:ids,equipped:{},ground};
   if(combat){backfillEnemyState(w);const e=w.enemies[0];e.pos={x:740,y:600};e.heading=Math.PI;e.cooldown=8;e.enemyIdentity={modelId:'mech_gen1',durability:100,circuits:[]};e.enemyState.ammo=1;e.enemyState.activity=0;}
   return w;
  }
  return {selection:make(false),combat:make(true)};
 },sharedUrl);await seed.close();
 async function open(world){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(w=>{
   if(!sessionStorage.getItem('seeded')){localStorage.setItem('estg.sortieCheckpoint',JSON.stringify({v:1,kind:'sortie',body:w}));sessionStorage.setItem('seeded','1');}
   const native=CanvasRenderingContext2D.prototype.fillText;window.shieldPoint=null;
   CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){if(/^盾 ×/.test(text))window.shieldPoint={x,y};if(/^盾 ×[2-9]/.test(text))window.shieldMultiPoint={x,y};return native.call(this,text,x,y,...rest);};
  },world);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#sortie-paused').waitFor();await page.mouse.click(5,5);
  return {context,page,errors};
 }
 async function tapGround(p,multiple=false){await p.waitForFunction(()=>window.shieldPoint);await p.locator('#map').scrollIntoViewIfNeeded();const pt=await p.evaluate(multiple=>{const c=document.querySelector('#map'),r=c.getBoundingClientRect(),point=multiple?shieldMultiPoint:shieldPoint;return{x:r.left+point.x*r.width/c.width,y:r.top+point.y*r.height/c.height};},multiple);await p.mouse.click(pt.x,pt.y);}
 {
  const {context,page:p,errors}=await open(fixtures.selection);await tapGround(p);
  assert.deepEqual(await p.locator('[data-shield-pick]').evaluateAll(nodes=>nodes.map(n=>n.dataset.shieldPick)),['d','b','c','a']);
  assert.equal(await p.getByRole('button',{name:'盾回収',exact:true}).count(),0,'no dedicated pickup button');
  await p.evaluate(()=>{window.savedShieldButton=document.querySelector('[data-shield-pick="d"]');});await p.waitForTimeout(200);
  assert(await p.evaluate(()=>savedShieldButton===document.querySelector('[data-shield-pick="d"]')),'unchanged panel preserves its DOM');
  await p.locator('[data-shield-pick="d"]').click();await p.waitForTimeout(700);assert.equal(await p.locator('[data-shield-drop="d"]').count(),0,'not equipped before 2s');
  await p.reload();await p.locator('#sortie-paused').waitFor();const mid=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
  assert(mid.shieldState.pickups[mid.leader.id]);await p.mouse.click(5,5);await p.locator('[data-shield-drop="d"]').waitFor();
  await tapGround(p);await p.locator('[data-shield-pick="b"]').click();await p.locator('[data-shield-drop="b"]').waitFor();
  assert((await p.locator('#hud-speed').innerText()).includes('積載 2/2'));
  await tapGround(p);await p.locator('[data-shield-pick="c"]').click();await p.waitForFunction(()=>document.body.textContent.includes('インベントリ満杯：盾を回収できませんでした'));
  assert.equal(await p.locator('[data-shield-drop]').count(),2,'full pickup never throws away existing shields');
  if(process.env.SHIELD_PICKUP_SCREENSHOT)await p.screenshot({path:process.env.SHIELD_PICKUP_SCREENSHOT,fullPage:true});
  await p.locator('[data-shield-drop="d"]').click();await tapGround(p);assert((await p.locator('#shield-panel').innerText()).includes('40/60'),'manual disposal preserves HP');
  await tapGround(p,true);await p.locator('[data-shield-pick="a"]').click();await p.keyboard.down('a');await p.waitForTimeout(800);await p.keyboard.up('a');await p.waitForTimeout(1600);
  await p.reload();await p.locator('#sortie-paused').waitFor();const walked=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
  assert.equal(walked.shieldState.pickups[walked.leader.id],undefined);assert(walked.shieldState.ground.a,'walking out of reach leaves the target on the ground');
  assert.deepEqual(errors,[]);await context.close();
 }
 {
  const {context,page:p,errors}=await open(fixtures.combat);const hp=fixtures.combat.leader.hp;
  await tapGround(p);await p.locator('[data-shield-pick="fragile"]').click();await p.locator('[data-shield-drop="fragile"]').waitFor();
  await tapGround(p);await p.locator('[data-shield-pick="spare"]').click();await p.locator('[data-shield-drop="spare"]').waitFor();
  await p.waitForFunction(()=>document.querySelector('#hud-speed')?.textContent.includes('盾交換中'),null,{timeout:13000});
  assert.equal(Number(await p.locator('#hud-hp').innerText()),hp,'real incoming shot absorbed by fragile shield');
  assert(await p.locator('[data-shield-drop="spare"]').isDisabled(),'exchange target cannot be discarded');
  assert.equal(await p.locator('[data-shield-drop="fragile"]').count(),0,'broken shield disappears');
  await p.waitForFunction(()=>document.querySelector('#hud-speed')?.textContent.includes('盾 35/50'),null,{timeout:5000});
  assert.equal(Number(await p.locator('#hud-hp').innerText()),hp);assert.equal(await p.locator('[data-shield-drop="spare"]').isDisabled(),false);
  await p.reload();await p.locator('#sortie-paused').waitFor();const actual=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
  assert.equal(actual.shieldState.equipped[actual.leader.id].key,'spare');assert.equal(actual.shieldState.identities.shields.spare.hp,35);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Shield pickup browser 390x844 PASS: direct ground tap/list order/stable DOM, 2s pickup and resume, reserve/load/full/no auto-disposal, manual drop, real enemy hit/break/2s locked exchange/reload');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
