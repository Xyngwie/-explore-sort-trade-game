/** Real UI exits in isolated checkpoint fixtures. No production debug hooks. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.EXPLORE_BASE_URL||'http://127.0.0.1:5173';
const sharedUrl='/@fs'+require('node:path').resolve(__dirname,'../packages/shared/src/index.ts');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const seed=await browser.newPage();await seed.goto(base);
 const data=await seed.evaluate(async url=>{
  const s=await import(url),{createWorld,bootstrapFromSearch,startSortie}=await import('/src/game/world.ts');
  const {attachLostMechContext}=await import('/src/game/lostMechs.ts'),{attachFieldPersistence}=await import('/src/game/fieldPersistence.ts');
  const {attachCircuitPlay}=await import('/src/game/circuitPlay.ts');
  const hub=s.normalizeHubSnapshot({...s.INITIAL_HUB,credits:1000,fleet:['cap','wa','wb'].map(instanceId=>s.createOwnedMech('mech_gen1',{instanceId})),sortieSelection:['cap','wa','wb'],frontProgress:{seed:812,aoiHalf:12,opened:[],flagged:[],focus:null}});
  const payload=s.buildTradeToExplorePayloadFromFleet(hub.fleet,0,['cap','wa','wb']);const q=new URL(s.buildTradeToExploreUrl(payload,'https://example.test/')).searchParams;q.set('sectorX','1');q.set('sectorY','2');q.set('density','0.2');
  const search='?'+q;
  function make(kind){
   const w=createWorld(bootstrapFromSearch(search));attachLostMechContext(w,hub);attachCircuitPlay(w,hub,false);attachFieldPersistence(w,hub);startSortie(w);w.enemies=[];w.coverObjects=[];w.containers=[];w.salvaged=1;w.leader.salvagedCount=1;
   w.leader.pos={x:700,y:500};w.wingmen[0].pos={x:720,y:500};w.wingmen[1].pos={x:1200,y:1200};
   for(const u of w.wingmen){u.individualOrder=true;u.holdOrder=true;u.moveTarget=null;u.waypoint=null;}
   w.shieldState={identities:s.emptyFieldObjectIdentities(),ground:{},equipped:{},spares:{}};
   for(const u of [w.leader,...w.wingmen]){const key=u.instanceId;let ids=s.registerWreckIdentity(w.shieldState.identities,'source-'+key);ids=s.shieldIdentityFromWreck(ids,'source-'+key,key,{hp:37.25,maxHp:60});w.shieldState.identities=ids;w.shieldState.equipped[u.id]={kind:'shield',key};}
   if(kind==='exchange'){w.elapsed=14.75;w.boarding={center:{x:700,y:500},radius:110,requestedAt:0,cargoArrived:true};const id=w.wingmen[1].id;delete w.shieldState.equipped[id];w.shieldState.spares[id]=[{kind:'shield',key:'wb'}];w.shieldState.exchanges={[id]:{key:'wb',until:15.75}};}
   if(kind==='rescue'||kind==='dead-timeout'){w.leader.alive=false;w.leader.hp=0;}
   if(kind.includes('timeout'))w.timeLeft=.15;
   if(kind==='missed'){w.elapsed=14.75;w.boarding={center:{x:700,y:500},radius:110,requestedAt:0,cargoArrived:true};w.leader.pos={x:900,y:900};}
   return w;
  }
  return {save:s.createHubSave(hub),key:s.HUB_SAVE_STORAGE_KEY,search,worlds:Object.fromEntries(['normal','exchange','rescue','alive-timeout','dead-timeout','missed'].map(k=>[k,make(k)]))};
 },sharedUrl);await seed.close();
 for(const kind of ['normal','exchange','rescue','alive-timeout','dead-timeout','missed']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(d=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem(d.key,JSON.stringify(d.save));localStorage.setItem('estg.sortieCheckpoint',JSON.stringify({v:1,kind:'sortie',body:d.world}));sessionStorage.setItem('seeded','1');}},{...data,world:data.worlds[kind]});
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/'+data.search);await p.locator('#sortie-paused').waitFor();await p.mouse.click(5,5);
  if(kind==='normal')await p.locator('#btn-extract').click();
  if(kind==='rescue'){await p.locator('#btn-rescue').click();await p.locator('#btn-rescue-yes').click();}
  await p.locator('#btn-again').waitFor({timeout:25000});
  const h=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).hub,data.key);
  assert(h.lostMechShields?.wb,'outside wing keeps shield');assert(!h.fieldCells[0].ground.wb);assert(h.fieldObjectIdentities.shields.wb.hp===37.25);
  if(kind==='rescue'||kind==='dead-timeout'){assert(h.lostMechShields.wa);assert(!h.fieldCells[0].ground.wa);assert.equal(h.credits,kind==='rescue'?500:250,'existing half/three-quarter fee unchanged');}
  else{assert(!h.lostMechShields.wa);assert.deepEqual(h.fieldCells[0].ground.wa,{x:720,y:500});}
  assert.deepEqual(h.fieldCells[0].ground.cap,kind==='missed'?{x:900,y:900}:{x:700,y:500});
  if(kind==='missed')assert((await p.locator('body').innerText()).includes('extract_missed'));
  if(kind==='exchange'){
   const remaining=h.lostMechShields.wb.exchange.remaining;assert(remaining>.5&&remaining<1);assert.equal(h.lostMechShields.wb.exchange.key,'wb');
   await p.reload();await p.locator('#btn-again').waitFor();await p.locator('#btn-again').click();await p.locator('#btn-start').click();await p.reload();await p.locator('#sortie-paused').waitFor();
   const resumed=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
   assert(resumed.shieldState.exchanges['s:wb']);assert.equal(resumed.shieldState.equipped['s:wb'],undefined);assert.equal(resumed.shieldState.exchanges['s:wb'].key,'wb');
   assert(Math.abs(resumed.shieldState.exchanges['s:wb'].until-remaining)<.00001,'exact remaining seconds, not 2s or wall clock');
   await p.waitForTimeout(1100);const still=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);assert.equal(still.shieldState.equipped['s:wb'],undefined,'paused/offline time does not finish exchange');
   await p.mouse.click(5,5);await p.waitForTimeout(1100);await p.reload();await p.locator('#sortie-paused').waitFor();
   const done=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);assert.equal(done.shieldState.equipped['s:wb'].key,'wb');assert.equal(done.shieldState.identities.shields.wb.hp,37.25);
   // S6: use the actual Invade regeneration button with a matching saved fixture.
   const regen=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   await regen.addInitScript(d=>{localStorage.setItem(d.key,JSON.stringify(d.save));},{key:data.key,save:{...data.save,hub:h}});
   const rp=await regen.newPage();await rp.goto(process.env.INVADE_BASE_URL||'http://127.0.0.1:5176');await rp.locator('#btn-regen').waitFor();rp.once('dialog',d=>d.accept());await rp.locator('#btn-regen').click();
   const after=await rp.evaluate(key=>JSON.parse(localStorage.getItem(key)).hub,data.key);
   assert.deepEqual(after.fieldCells,[]);assert.equal(after.fieldObjectIdentities.shields.cap,undefined);assert.equal(after.fieldObjectIdentities.shields.wb.hp,37.25);assert.equal(after.lostMechShields.wb.exchange.remaining,remaining);
   assert.equal(after.lostMechs.find(m=>m.instanceId==='wb').frontSeed,after.frontProgress.seed);assert.equal(after.fieldObjectIdentities.nextWreckId,h.fieldObjectIdentities.nextWreckId);await regen.close();
   await p.screenshot({path:process.env.SHIELD_RETURN_SCREENSHOT||'/tmp/shield-return-mobile.png',fullPage:true});
  }
  assert.deepEqual(errors,[]);await context.close();console.log('Shield return browser PASS:',kind);
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
