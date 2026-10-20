/** Runs actual button/tap and wall-clock simulation in an isolated checkpoint. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const sharedUrl = '/@fs' + require('node:path').resolve(__dirname, '../packages/shared/src/index.ts');
const sourceEffect=Number(process.env.SHIELD_SOURCE_EFFECT||0),expectedHp=50+sourceEffect;
const base = process.env.EXPLORE_BASE_URL || 'http://127.0.0.1:5173';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const seed=await context.newPage();await seed.goto(base);
 const data=await seed.evaluate(async ({sharedUrl,sourceEffect})=>{
  const shared=await import(sharedUrl);
  const {createWorld,bootstrapFromSearch,startSortie}=await import('/src/game/world.ts');
  const {attachCircuitPlay}=await import('/src/game/circuitPlay.ts');
  const {backfillEnemyState}=await import('/src/game/enemyBehavior.ts');
  const {getCoverObjects}=await import('/src/game/coverObjects.ts');
  const {tickWorld}=await import('/src/game/sim.ts');
  const w=createWorld(bootstrapFromSearch(''));startSortie(w);attachCircuitPlay(w,null,false);w.circuitPlay.loadout[w.leader.id]=[{circuitId:'worker-shield',side:2,effectKey:'shield',effect:4,trueBoard:false}];getCoverObjects(w).splice(0);
  w.containers=[];w.salvaged=1;w.leader.salvagedCount=1; // retain the normal result checkpoint (zero-container success intentionally marks done)
  w.enemies=w.enemies.slice(0,2);backfillEnemyState(w);
  w.leader.pos={x:600,y:600};w.leader.heading=0;w.leader.instanceId='leader';w.deployedInstanceIds=['leader'];
  w.leader.cooldown=.6;w.currentAmmo.leader=28;w.deployedDurability.leader=100;w.mechBattery.leader={capacity:300,activity:300};
  for(const wing of w.wingmen){wing.alive=false;wing.hp=0;wing.pos={x:1400,y:1400};}
  const enemy=w.enemies[0];enemy.alive=true;enemy.hp=1;enemy.pos={x:620,y:600};enemy.enemyState.deathHandled=false;enemy.enemyState.ammo=0;enemy.enemyState.activity=0;
  enemy.enemyIdentity={modelId:'mech_gen1',durability:100,circuits:[{circuitId:'lost-enemy-c',side:2,effectKey:sourceEffect?'shield':'smg',effect:sourceEffect||4,trueBoard:false}]};
  const control=w.enemies[1];control.alive=false;control.hp=0;control.pos={x:660,y:600};control.enemyState.deathHandled=true;
  control.enemyIdentity={modelId:'mech_gen1',durability:100,circuits:[{circuitId:'control-enemy-c',side:2,effectKey:'smg',effect:4,trueBoard:false}]};
  tickWorld(w,.01,{move:{x:0,y:0},clickMove:null,fire:false,interact:false});
  const identities=shared.emptyFieldObjectIdentities();identities.nextWreckId='41';identities.nextShieldOrder='8';
  const hub={...shared.INITIAL_HUB,fleet:[shared.createOwnedMech('mech_gen1',{instanceId:'leader'})],fieldObjectIdentities:identities};
  return {world:w,save:shared.createHubSave(hub),saveKey:shared.HUB_SAVE_STORAGE_KEY,targetId:enemy.id,controlId:control.id};
 },{sharedUrl,sourceEffect});await seed.close();
 await context.addInitScript(data=>{
  if(!sessionStorage.getItem('fixture')){
   localStorage.setItem('estg.sortieCheckpoint',JSON.stringify({v:1,kind:'sortie',body:data.world}));
   localStorage.setItem(data.saveKey,JSON.stringify(data.save));sessionStorage.setItem('fixture','1');
  }
  const native=CanvasRenderingContext2D.prototype.fillText;
  window.drawnWreck=null;window.drawnShield=false;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
   if(text==='残骸' && x>=0 && x<this.canvas.width && y>=0 && y<this.canvas.height && (!window.drawnWreck || x<window.drawnWreck.x))window.drawnWreck={x,y:y+12};
   if(text==='盾 ×1'){window.drawnShield=true;window.groundShieldPoint={x,y};}
   return native.call(this,text,x,y,...rest);
  };
 },data);
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('#sortie-paused').waitFor();await p.mouse.click(5,5);
 await p.keyboard.down('f');await p.waitForTimeout(1500);await p.keyboard.up('f');
 await p.reload();await p.locator('#sortie-paused').waitFor();
 const killed=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
 assert.equal(killed.enemies[0].alive,false,'real shots killed the initially live enemy');
 assert(killed.currentAmmo.leader<28,'real firing consumed leader ammo');
 await p.mouse.click(5,5);await p.waitForFunction(()=>window.drawnWreck);
 await p.locator('#btn-strip').click();
 await p.locator('#map').scrollIntoViewIfNeeded();
 const point=await p.evaluate(()=>{const c=document.querySelector('#map'),r=c.getBoundingClientRect();return{x:r.left+drawnWreck.x*r.width/c.width,y:r.top+drawnWreck.y*r.height/c.height};});
 await p.mouse.click(point.x,point.y);
 await p.waitForFunction(()=>document.querySelector('#btn-strip')?.textContent.includes('剥離中'),null,{timeout:5000}).catch(async e=>{await p.screenshot({path:'/tmp/strip-debug-mobile.png',fullPage:true});console.error({point,errors,body:await p.locator('body').innerText()});throw e;});
 await p.waitForTimeout(2600);await p.reload();await p.locator('#sortie-paused').waitFor();
 const midway=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
 const job=Object.values(midway.stripping.jobs)[0];assert(job.seconds>1 && job.seconds<8);assert.equal(Object.keys(midway.shieldState.ground).length,0);
 await p.mouse.click(5,5);
 await p.waitForFunction(()=>document.body.textContent.includes('盾を1枚生成'),null,{timeout:16000});
 assert(await p.evaluate(()=>window.drawnShield),'ground shield label drawn');
 if(process.env.STRIPPING_SCREENSHOT)await p.screenshot({path:process.env.STRIPPING_SCREENSHOT,fullPage:true});
 await p.reload();await p.locator('#sortie-paused').waitFor();
 const done=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
 assert.equal(Object.keys(done.shieldState.ground).length,1);const shield=Object.values(done.shieldState.identities.shields)[0];
 assert.equal(shield.hp,expectedHp);assert.equal(shield.maxHp,expectedHp);assert.equal(shield.shieldId,'41');assert.equal(shield.generationOrder,'8');
 assert.equal(done.stripping.observations.length,1);assert.equal(done.stripping.observations[0].learningValue,null);
 assert.equal(done.enemies[0].enemyIdentity.circuits.length,0);assert.equal(Object.keys(done.shieldState.equipped).length,0);
 await p.mouse.click(5,5);
 await p.waitForFunction(()=>window.groundShieldPoint);await p.locator('#map').scrollIntoViewIfNeeded();
 const shieldPoint=await p.evaluate(()=>{const c=document.querySelector('#map'),r=c.getBoundingClientRect();return{x:r.left+groundShieldPoint.x*r.width/c.width,y:r.top+groundShieldPoint.y*r.height/c.height};});
 await p.mouse.click(shieldPoint.x,shieldPoint.y);await p.locator('[data-shield-pick]').click();
 await p.locator('[data-shield-drop]').waitFor();assert((await p.locator('#hud-speed').innerText()).includes(`盾 ${Number(expectedHp.toFixed(1))}/${Number(expectedHp.toFixed(1))}`),'stripped shield can be picked and equipped through normal UI');
 await p.locator('#btn-extract').click();
 await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.hub?.wreckStrippingHistory?.length===1,data.saveKey,{timeout:25000});
 const settled=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).hub,data.saveKey);
 assert(!settled.fleet.some(m=>m.instanceId===`recovered-${data.targetId}`),'stripped enemy not acquired at actual lift-off');
 assert(!settled.circuits.some(c=>c.circuitId==='lost-enemy-c'));
 assert(settled.fleet.some(m=>m.instanceId===`recovered-${data.controlId}`),'unstripped control enemy DOES return');
 assert(settled.circuits.some(c=>c.circuitId==='control-enemy-c'));
 await p.reload();await p.locator('h1').filter({hasText:'作戦結果'}).waitFor();
 const reloaded=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).hub,data.saveKey);
 assert.deepEqual(reloaded.fleet.map(m=>m.instanceId).sort(),settled.fleet.map(m=>m.instanceId).sort());
 assert.equal(reloaded.wreckStrippingHistory.length,1,'result reload does not duplicate settlement');
 if(process.env.STRIPPING_RESULT_SCREENSHOT)await p.screenshot({path:process.env.STRIPPING_RESULT_SCREENSHOT,fullPage:true});
 assert.deepEqual(errors,[]);await context.close();
 console.log('Wreck stripping browser 390x844 PASS: live enemy shot down, button/target, 8s generation, interrupted reload/resume, source HP/IDs, 2s pickup/equip UI, actual 15s return, stripped enemy excluded, unstripped control acquired, result reload');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
