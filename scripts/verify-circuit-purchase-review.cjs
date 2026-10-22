/** Isolated public HUB interaction: confirm handling, wallet delta and Offline equipment. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.TRADE_BASE_URL||'https://xyngwie.github.io/-explore-sort-trade-game/';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const results=[];
 const readHub=async p=>p.evaluate(()=>{for(const key of Object.keys(localStorage)){try{const save=JSON.parse(localStorage.getItem(key));if(save?.hub?.circuits)return save.hub;}catch{}}return null;});
 try{
  for(const accept of [false,true]){
   const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await ctx.newPage(),dialogs=[],errors=[];
   p.on('pageerror',e=>errors.push(e.message));p.on('dialog',async d=>{dialogs.push({type:d.type(),message:d.message()});await(accept?d.accept():d.dismiss());});
   await p.goto(base);await p.getByRole('button',{name:'シード読込',exact:true}).click();
   const before=await readHub(p);await p.locator('[data-circuit-purchase]').click();await p.locator('[data-circuit-purchase]').waitFor();
   if(accept)await p.waitForFunction(()=>{for(const k of Object.keys(localStorage)){try{if(JSON.parse(localStorage.getItem(k))?.hub?.credits===4990000)return true;}catch{}}return false;});
   const after=await readHub(p);assert.equal(before.credits,5000000);assert.equal(after.credits,before.credits-(accept?10000:0));assert.equal(after.circuits.length,before.circuits.length+(accept?1:0));assert(dialogs.some(d=>d.type==='confirm'));assert.deepEqual(errors,[]);
   if(accept){await p.reload();await p.locator('[data-circuit-purchase]').waitFor();assert.equal((await readHub(p)).credits,4990000);}
   results.push({scenario:accept?'confirm accepted':'confirm cancelled',status:'PASS',dialogs,beforeCredits:before.credits,afterCredits:after.credits,beforeCircuitCount:before.circuits.length,afterCircuitCount:after.circuits.length});await ctx.close();
  }
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await ctx.newPage(),dialogs=[];
  p.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});await p.goto(base);await p.getByRole('button',{name:'シード読込',exact:true}).click();
  await p.locator('summary').filter({hasText:'検証用回路'}).click();await p.locator('#btn-verify-true').click();await p.locator('#circuit-equip-select').selectOption('verify_true');await p.locator('[data-equip-action=equip]').click();assert(dialogs.some(t=>t.includes('回路上限')));
  const hub=await readHub(p),starter=hub.circuits.find(c=>c.circuitId.startsWith('false-1x1-'));assert(starter);await p.locator('#circuit-equip-select').selectOption(starter.circuitId);await p.locator('[data-equip-action=unequip]').click();await p.locator('#circuit-equip-select').waitFor();
  await p.locator('#circuit-equip-select').selectOption('verify_true');await p.locator('[data-equip-action=equip]').click();await p.locator('#circuit-equip-select').waitFor();
  const after=await readHub(p),verify=after.circuits.find(c=>c.circuitId==='verify_true');assert.equal(verify.restoreState,'offline');assert(verify.equippedTo);assert(!verify.effectKey);
  results.push({scenario:'Offline equipment after releasing squad capacity',status:'PASS',dialogs,verify:{id:verify.circuitId,state:verify.restoreState,effectKey:verify.effectKey??null,equippedTo:verify.equippedTo}});await ctx.close();
  console.log(JSON.stringify({url:base,viewport:[390,844],method:'Playwright, isolated contexts, no existing user saves',results},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
