/** Isolated saved-world fixtures; all return/redeploy/strip/pickup actions use the real UI. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.EXPLORE_BASE_URL||'http://127.0.0.1:5173';
const sharedUrl='/@fs'+require('node:path').resolve(__dirname,'../packages/shared/src/index.ts');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const seed=await browser.newPage();await seed.goto(base);
 const fixture=await seed.evaluate(async url=>{
  const s=await import(url),{createWorld,bootstrapFromSearch,startSortie}=await import('/src/game/world.ts');
  const {attachCircuitPlay}=await import('/src/game/circuitPlay.ts'),{attachLostMechContext}=await import('/src/game/lostMechs.ts');
  const {attachFieldPersistence}=await import('/src/game/fieldPersistence.ts'),{startStrippingAt,tickStripping}=await import('/src/game/strippingRuntime.ts');
  const {cancelUnitStripping}=await import('/src/game/wreckStripping.ts'),{backfillEnemyState}=await import('/src/game/enemyBehavior.ts');
  const hub=s.normalizeHubSnapshot({...s.INITIAL_HUB,fleet:[s.createOwnedMech('mech_gen1',{instanceId:'leader'})],sortieSelection:['leader'],frontProgress:{seed:812,aoiHalf:12,opened:[{sx:3,sy:3}],flagged:[{sx:4,sy:4}],focus:{sx:7,sy:7}}});
  const p=s.buildTradeToExplorePayloadFromFleet(hub.fleet,0,['leader']);const q=new URL(s.buildTradeToExploreUrl(p,'https://example.test/')).searchParams;
  q.set('sectorX','1');q.set('sectorY','2');q.set('density','0.2');const search='?'+q;
  const w=createWorld(bootstrapFromSearch(search));attachLostMechContext(w,hub);attachCircuitPlay(w,hub,false);attachFieldPersistence(w,hub);startSortie(w);
  w.coverObjects=[];w.containers=[];w.wingmen=[];w.salvaged=1;w.leader.salvagedCount=1;w.leader.pos={x:700,y:500};w.currentAmmo.leader=28;
  w.enemies=w.enemies.slice(0,1);backfillEnemyState(w);const e=w.enemies[0];e.pos={x:720,y:500};e.hp=0;e.alive=false;e.enemyState.deathHandled=true;e.enemyState.ammo=0;e.enemyState.activity=0;
  startStrippingAt(w,e.pos,hub,20);tickStripping(w,2.5);cancelUnitStripping(w.stripping,w.leader.id);
  let ids=s.registerWreckIdentity(w.shieldState.identities,'old-shield-source');ids=s.shieldIdentityFromWreck(ids,'old-shield-source','persisted-shield',{hp:17.25,maxHp:50});
  w.shieldState.identities=ids;w.shieldState.ground['persisted-shield']={x:720,y:500};
  return {world:w,save:s.createHubSave(hub),saveKey:s.HUB_SAVE_STORAGE_KEY,search,target:e.id,circuits:e.enemyIdentity.circuits,ground:ids.shields['persisted-shield']};
 },sharedUrl);await seed.close();
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(d=>{
  if(!sessionStorage.getItem('fixture')){localStorage.setItem(d.saveKey,JSON.stringify(d.save));localStorage.setItem('estg.sortieCheckpoint',JSON.stringify({v:1,kind:'sortie',body:d.world}));sessionStorage.setItem('fixture','1');}
  const native=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){if(text==='残骸')window.wreckPoint={x,y:y+12};if(text.startsWith('盾 ×'))window.shieldPoint={x,y};return native.call(this,text,x,y,...rest);};
 },fixture);
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/'+fixture.search);await p.locator('#sortie-paused').waitFor();await p.mouse.click(5,5);
 await p.keyboard.down('a');await p.waitForTimeout(2600);await p.keyboard.up('a');await p.locator('#btn-extract').click();
 await p.locator('#btn-again').waitFor({timeout:26000});
 const settled=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).hub,fixture.saveKey);
 assert.equal(settled.fieldCells.length,1);const cell=settled.fieldCells[0];assert.equal(cell.wrecks[0].seconds,2.5);assert.equal(cell.wrecks[0].targetId,fixture.target);
 assert.equal(settled.fieldObjectIdentities.shields['persisted-shield'].hp,17.25);assert.deepEqual(cell.ground['persisted-shield'],{x:720,y:500});
 assert(!settled.fleet.some(m=>m.instanceId==='recovered-'+fixture.target),'outside boarding circle is not recovered');
 await p.reload();await p.locator('#btn-again').waitFor();assert.deepEqual(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).hub.fieldCells,fixture.saveKey),settled.fieldCells,'result reload does not duplicate or erase');
 await p.locator('#btn-again').click();await p.locator('#btn-start').click();
 // Reload produces the normal paused checkpoint, exposing only saved output for assertions.
 await p.reload();await p.locator('#sortie-paused').waitFor();const next=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
 assert.equal(next.sortieLocation.frontSeed,812);assert.deepEqual(next.sortieLocation.cell,{sx:1,sy:2});
 assert.equal(next.shieldState.identities.shields['persisted-shield'].hp,17.25);assert.deepEqual(next.shieldState.identities.shields['persisted-shield'],fixture.ground);
 assert.equal(next.stripping.jobs[fixture.target].seconds,2.5);assert.equal(next.stripping.jobs[fixture.target].reservation,null);
 const corpse=next.enemies.find(e=>e.id===fixture.target);assert(corpse && !corpse.alive);assert.deepEqual(corpse.enemyIdentity.circuits,fixture.circuits);assert(corpse.enemyState.deathHandled);
 assert(next.enemies.some(e=>e.alive && e.id!==fixture.target),'live enemies still generated afresh');
 await p.mouse.click(5,5);await p.locator('#btn-strip').click();await p.waitForFunction(()=>window.wreckPoint);
 async function tapPoint(name){await p.locator('#map').scrollIntoViewIfNeeded();const pt=await p.evaluate(n=>{const c=document.querySelector('#map'),r=c.getBoundingClientRect(),v=window[n];return{x:r.left+v.x*r.width/c.width,y:r.top+v.y*r.height/c.height};},name);await p.mouse.click(pt.x,pt.y);}
 await tapPoint('wreckPoint');await p.waitForFunction(()=>document.querySelector('#btn-strip').textContent.includes('剥離中'));
 await p.waitForFunction(()=>document.body.textContent.includes('盾を1枚生成'),null,{timeout:8500});
 await p.waitForFunction(()=>window.shieldPoint);await tapPoint('shieldPoint');await p.locator('[data-shield-pick="persisted-shield"]').click();await p.locator('[data-shield-drop="persisted-shield"]').waitFor();
 assert((await p.locator('#hud-speed').innerText()).includes('盾 17.3/50'),'preserved HP used by actual pickup');
 await p.screenshot({path:process.env.FIELD_PERSISTENCE_SCREENSHOT||'/tmp/field-persistence-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);await context.close();
 // Actual direct-Explore page boot: same board HQ without changing scouting or last focus.
 const direct=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await direct.addInitScript(d=>{if(!sessionStorage.getItem('direct')){localStorage.setItem(d.saveKey,JSON.stringify(d.save));sessionStorage.setItem('direct','1');}},fixture);
 const dp=await direct.newPage();await dp.goto(base+'/?deployedInstanceIds=leader');await dp.locator('#btn-start').click();await dp.reload();await dp.locator('#sortie-paused').waitFor();
 const directState=await dp.evaluate(key=>({world:JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body,hub:JSON.parse(localStorage.getItem(key)).hub}),fixture.saveKey);
 assert.deepEqual(directState.world.sortieLocation,{frontSeed:812,cell:{sx:0,sy:0}});assert.deepEqual(directState.hub.frontProgress,fixture.save.hub.frontProgress);await direct.close();
 // Real Invade regeneration clears field objects but preserves global counters.
 const invade=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await invade.addInitScript(d=>{localStorage.setItem(d.key,JSON.stringify(d.save));},{key:fixture.saveKey,save:{...fixture.save,hub:settled}});
 const ip=await invade.newPage();await ip.goto(process.env.INVADE_BASE_URL||'http://127.0.0.1:5176');await ip.locator('#btn-regen').waitFor();
 ip.once('dialog',dialog=>dialog.accept());await ip.locator('#btn-regen').click();
 const regenerated=await ip.evaluate(key=>JSON.parse(localStorage.getItem(key)).hub,fixture.saveKey);
 assert.notEqual(regenerated.frontProgress.seed,812);assert.deepEqual(regenerated.fieldCells,[]);
 assert.equal(regenerated.fieldObjectIdentities.nextWreckId,settled.fieldObjectIdentities.nextWreckId);assert.equal(regenerated.fieldObjectIdentities.nextShieldOrder,settled.fieldObjectIdentities.nextShieldOrder);
 assert.equal(regenerated.fieldObjectIdentities.shields['persisted-shield'],undefined);await invade.close();
 const newEntry=await browser.newContext();await newEntry.addInitScript(d=>{if(!sessionStorage.getItem('new')){const saved=structuredClone(d.save);saved.hub.frontProgress=null;localStorage.setItem(d.saveKey,JSON.stringify(saved));sessionStorage.setItem('new','1');}},fixture);
 const np=await newEntry.newPage();await np.goto(base+'/?deployedInstanceIds=leader');await np.locator('#btn-start').waitFor();
 const created=await np.evaluate(key=>JSON.parse(localStorage.getItem(key)).hub.frontProgress,fixture.saveKey);assert.equal(typeof created.seed,'number');assert.deepEqual(created.opened,[]);assert.deepEqual(created.flagged,[]);
 await np.locator('#btn-start').click();await np.reload();await np.locator('#sortie-paused').waitFor();const createdWorld=await np.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
 assert.deepEqual(createdWorld.sortieLocation,{frontSeed:created.seed,cell:{sx:0,sy:0}});await newEntry.close();
 const blocked=await browser.newContext();await blocked.addInitScript(d=>{
  const saved=structuredClone(d.save);saved.hub.frontProgress=null;localStorage.setItem(d.saveKey,JSON.stringify(saved));
  const native=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===d.saveKey)throw Error('fixture write refused');return native.call(this,k,v);};
 },fixture);
 const bp=await blocked.newPage();await bp.goto(base+'/?deployedInstanceIds=leader');await bp.locator('#btn-start').waitFor();assert(await bp.locator('#btn-start').isDisabled());assert((await bp.locator('body').innerText()).includes('戦場情報を保存できませんでした'));await blocked.close();
 console.log('Field persistence browser 390x844 PASS: actual 15s return/save/result reload/redeploy, exact HP/IDs/circuits, remaining stripping time and 2s pickup, fresh live enemies, direct shared-board HQ/no scouting, new board creation, real Invade regeneration/high-water, refused seed save blocks deploy');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
