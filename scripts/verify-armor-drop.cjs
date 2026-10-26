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
  await ctx.addInitScript(()=>{const draw=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...a){if(String(t).startsWith('装甲パーツ '))window.drawnArmor=t;return draw.call(this,t,...a);};});
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  require('node:child_process').execFileSync(path.join(repo,'node_modules/.bin/tsx'),[path.join(__dirname,'armor-drop-fixture.ts')]);
  const fixture=JSON.parse(fs.readFileSync('/tmp/armor-drop-fixture.json'));
  await p.goto(base+'explore/?debug_fixture=shield');await p.evaluate(f=>{localStorage.setItem('wreckline.hubSave.v3',f.hub);localStorage.setItem('estg.sortieCheckpoint',JSON.stringify(f.checkpoint));localStorage.setItem('DEBUG_FIXTURE.meta',JSON.stringify({type:'DEBUG_FIXTURE',preset:'ARMOR_DROP',run:'armor-hp-67'}));},fixture);
  await p.reload();await p.locator('#sortie-paused').waitFor();await p.mouse.click(5,5);await p.waitForTimeout(250);await p.locator('#shield-debug-console > summary').click();
  await p.reload();await p.locator('#sortie-paused').waitFor();let body=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);
  assert.equal(body.leader.alive,false);assert.equal(body.currentAmmo['debug-leader'],0);assert.equal(body.mechBattery['debug-leader'].activity,0);let armor=body.enemySupplies.filter(d=>d.kind==='armor');assert.equal(armor.length,1);assert.equal(armor[0].armor,67);assert.deepEqual(armor[0].pos,body.leader.pos);
  await p.mouse.click(5,5);await p.waitForTimeout(250);await p.reload();await p.locator('#sortie-paused').waitFor();body=await p.evaluate(()=>JSON.parse(localStorage.getItem('estg.sortieCheckpoint')).body);assert.equal(body.enemySupplies.filter(d=>d.kind==='armor').length,1);assert.equal(body.enemySupplies.find(d=>d.kind==='armor').armor,67);
  await p.mouse.click(5,5);await p.waitForFunction(()=>window.drawnArmor==='装甲パーツ 67');
  assert.equal(await p.evaluate(()=>window.drawnArmor),'装甲パーツ 67');assert.deepEqual(errors,[]);await p.screenshot({path:'/tmp/armor-drop-mobile.png',fullPage:true});results.push({scenario:'390x844 real simulation HP67/120 power depletion, 67 ground armor, zero resources, persisted reload once',status:'PASS'});
  console.log(JSON.stringify({viewport:[390,844],results,physicalDevice:'NOT_RUN',publicVersion:'NOT_RUN'},null,2));await ctx.close();
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
