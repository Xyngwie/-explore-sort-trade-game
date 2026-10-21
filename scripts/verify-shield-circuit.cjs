/** #314: real HUB equipment controls and no-circuit Explore pickup at phone width. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const sharedUrl='/@fs'+require('node:path').resolve(__dirname,'../packages/shared/src/index.ts');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const seed=await browser.newPage();await seed.goto('http://127.0.0.1:5173');
 const data=await seed.evaluate(async url=>{
  const s=await import(url),{createWorld,bootstrapFromSearch,startSortie}=await import('/src/game/world.ts'),{attachCircuitPlay}=await import('/src/game/circuitPlay.ts');
  const hub=s.normalizeHubSnapshot({...s.INITIAL_HUB,fleet:[s.createOwnedMech('mech_gen1',{instanceId:'leader'})],invadeRank:{current:5,highestCleared:4},circuits:['first','second'].map((circuitId,i)=>({circuitId,circuitBoard:s.buildVerifyPerfectLockedBoard('test'),restoreState:'bypass',origin:'crafted',equippedTo:i===0?'leader':null,effectKey:'shield',enemyEffect:12.75}))});
  const w=createWorld(bootstrapFromSearch(''));startSortie(w);attachCircuitPlay(w,null,false);w.circuitPlay.loadout[w.leader.id]=[];
  w.enemies=[];w.containers=[];w.coverObjects=[];w.wingmen=[];w.leader.pos={x:600,y:600};w.leader.heading=0;w.leader.salvagedCount=0;
  let ids=s.registerWreckIdentity(s.emptyFieldObjectIdentities(),'source');ids=s.shieldIdentityFromWreck(ids,'source','ground',{hp:17.25,maxHp:62.75});
  w.shieldState={identities:ids,ground:{ground:{x:620,y:600}},equipped:{}};
  return{hub,save:s.createHubSave(hub),world:w,saveKey:s.HUB_SAVE_STORAGE_KEY,item:ids.shields.ground};
 },sharedUrl);await seed.close();
 const errors=[];
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await ctx.addInitScript(d=>{
  if(!sessionStorage.getItem('fixture')){const h=structuredClone(d.save);h.hub.circuits=[];localStorage.setItem(d.saveKey,JSON.stringify(h));localStorage.setItem('estg.sortieCheckpoint',JSON.stringify({v:1,kind:'sortie',body:d.world}));sessionStorage.setItem('fixture','1');}
  const native=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,x,y,...rest){if(t==='盾 ×1')window.shieldPoint={x,y};return native.call(this,t,x,y,...rest);};
 },data);
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5173');await p.locator('#sortie-paused').waitFor();await p.mouse.click(5,5);
 assert.equal(await p.locator('#btn-strip').count(),0,'no circuit: no stripping command');
 assert(await p.locator('#btn-barricade').isHidden(),'no P circuit: barricade command must be visually hidden, not only hidden=true');
 await p.waitForFunction(()=>window.shieldPoint);await p.locator('#map').scrollIntoViewIfNeeded();
 const pt=await p.evaluate(()=>{const c=document.querySelector('#map'),r=c.getBoundingClientRect(),v=window.shieldPoint;return{x:r.left+v.x*r.width/c.width,y:r.top+v.y*r.height/c.height};});
 await p.mouse.click(pt.x,pt.y);await p.locator('[data-shield-pick="ground"]').click();await p.locator('[data-shield-drop="ground"]').waitFor();
 assert((await p.locator('#hud-speed').innerText()).includes('盾 17.3/62.8'));
 assert(await p.locator('#btn-barricade').isHidden(),'equipped shield alone must not reveal barricade command');
 await p.reload();await p.locator('#sortie-paused').waitFor();
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);assert.deepEqual(saved.shieldState.identities.shields.ground,data.item);assert.equal(saved.shieldState.equipped[saved.leader.id].key,'ground');
 await p.screenshot({path:'/tmp/pr314-no-circuit-pickup-mobile.png',fullPage:true});await ctx.close();
 const trade=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await trade.addInitScript(d=>{if(!sessionStorage.getItem('fixture')){localStorage.setItem(d.saveKey,JSON.stringify(d.save));sessionStorage.setItem('fixture','1');}},data);
 const hp=await trade.newPage();hp.on('pageerror',e=>errors.push(e.message));await hp.goto('http://127.0.0.1:5175');await hp.locator('#circuit-equip-select').waitFor();
 assert((await hp.locator('#circuit-equip-panel').innerText()).includes('生成盾の最大耐久は50＋剥離元機体の盾回路効力'));
 assert((await hp.locator('#circuit-equip-select').innerText()).includes('盾'));
 await hp.locator('#circuit-equip-select').selectOption('second');await hp.locator('#circuit-equip-mech').selectOption('leader');
 let refusal='';hp.once('dialog',async dialog=>{refusal=dialog.message();await dialog.accept();});await hp.locator('[data-equip-action="equip"]').click();assert(refusal.includes('盾回路'));
 const after=await hp.evaluate(key=>JSON.parse(localStorage.getItem(key)).hub,data.saveKey);assert.equal(after.circuits.find(c=>c.circuitId==='second').equippedTo,null);
 await hp.screenshot({path:'/tmp/pr314-hub-mobile.png',fullPage:true});await trade.close();assert.deepEqual(errors,[]);
 console.log('Shield circuit browser 390x844 PASS: no-circuit command hidden, real ground tap/list/2s pickup and checkpoint preserving exact HP/identity; HUB name/source explanation and duplicate equip refusal');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
