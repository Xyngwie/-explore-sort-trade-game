/** Public alpha lab: production bundles, real controls, isolated browser data. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const project='/-explore-sort-trade-game/',repo=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://preview').pathname);if(!p.startsWith(project)){res.writeHead(404).end();return;}p=p.slice(project.length);let module='trade';for(const m of ['explore','sort','invade','restore'])if(p.startsWith(m+'/')){module=m;p=p.slice(m.length+1);break;}const root=path.join(repo,'packages',module,'dist'),file=path.resolve(root,p||'index.html');if(!file.startsWith(root+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const localBase=`http://127.0.0.1:${server.address().port}${project}`,base=`https://xyngwie.github.io${project}`;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const results=[];
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
  // Serve local production bundles at the production URL shape; no public network writes.
  await ctx.route(base+'**',async route=>{const u=new URL(route.request().url());const response=await ctx.request.get(localBase+u.pathname.slice(project.length)+u.search);await route.fulfill({response});});
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  let accept=false;const dialogs=[];p.removeAllListeners('dialog');p.on('dialog',d=>{dialogs.push(d.message());return accept?d.accept():d.dismiss();});
  await p.goto(base);await p.locator('#btn-seed').click();
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('wreckline.hubSave.v3'));s.hub.credits=1000;s.hub.inventory={ammo:3,power:5,armor:7};s.hub.ammoBatteryRepaired=true;s.hub.starterCircuitGranted=true;const m=s.hub.fleet[0];m.status='destroyed';m.durability=0;m.currentAmmo=4;m.battery={capacity:300,activity:12.5};s.hub.circuits[0].equippedTo=m.instanceId;s.hub.circuits[0].lastEditorName='保持する署名';s.hub.circuits[0].circuitBoard.lastEditorName='保持する署名';localStorage.setItem('wreckline.hubSave.v3',JSON.stringify(s));});await p.reload();
  const hub=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('wreckline.hubSave.v3')).hub);
  const before=await hub(),id=before.fleet[0].instanceId,button=()=>p.locator(`[data-act=sell-wreck][data-id="${id}"]`);
  await button().click();assert.deepEqual(await hub(),before);assert(dialogs.at(-1).includes('400c'));assert(dialogs.at(-1).includes('倉庫'));assert(dialogs.at(-1).includes('追加返却はありません'));
  accept=true;await button().click();let h=await hub();assert.equal(h.credits,1400);assert.equal(h.fleet.length,before.fleet.length-1);assert(!h.fleet.some(m=>m.instanceId===id));assert.deepEqual(h.inventory,before.inventory);
  for(const c of before.circuits){const after=h.circuits.find(r=>r.circuitId===c.circuitId);assert.deepEqual(after,c.equippedTo===id?{...c,equippedTo:null}:c);}
  for(const m of h.fleet)assert.equal(await p.locator(`[data-act=sell-wreck][data-id="${m.instanceId}"]`).count(),0,'live mech has no sale control');
  await p.reload();assert.equal((await hub()).credits,1400);assert.equal(await button().count(),0);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await p.screenshot({path:'/tmp/wreck-sale-mobile.png',fullPage:true});results.push({scenario:'390x844 real Japanese confirmation cancel/accept, +400 once, exact circuits retained, no supply grant, reload, live mech exclusion and no overflow',status:'PASS'});
  console.log(JSON.stringify({viewport:[390,844],results,physicalDevice:'NOT_RUN',publicVersion:'NOT_RUN'},null,2));await ctx.close();
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
