import fs from 'node:fs';
import { generateBoard,rngFromSeed,AOI_HALF,getCell,captureFrontProgress } from '../packages/invade/src/board';
import { INITIAL_HUB,normalizeHubSnapshot,createHubSave,serializeHubSave } from '../packages/shared/src/index';
const seed=42,b=generateBoard(AOI_HALF,rngFromSeed(seed));b.seed=seed;
const cells=b.cells.flat();
const around=(c:any)=>cells.filter(n=>Math.abs(n.sx-c.sx)<=1&&Math.abs(n.sy-c.sy)<=1&&n!==c&&!n.blocked);
const center=[...cells].sort((a,b)=>Math.max(Math.abs(a.sx),Math.abs(a.sy))-Math.max(Math.abs(b.sx),Math.abs(b.sy))).find(c=>!c.mine&&!c.blocked&&c.adjacent>=1&&c.adjacent<=3&&!c.isHq&&around(c).filter(n=>!n.mine&&!n.open).length>c.adjacent)!;
const neighbors=around(center);
const safe=[...cells].sort((a,b)=>Math.max(Math.abs(a.sx),Math.abs(a.sy))-Math.max(Math.abs(b.sx),Math.abs(b.sy))).find(c=>!c.open&&!c.mine&&!c.blocked&&c!==center&&c.adjacent>0)!;
const fixtures:any={center:{sx:center.sx,sy:center.sy},safe:{sx:safe.sx,sy:safe.sy},neighbors:neighbors.map(c=>({sx:c.sx,sy:c.sy,mine:c.mine})),number:center.adjacent};
for(const kind of ['plain','correct','few','many','wrong']){
 const world=structuredClone(b);for(const c of world.cells.flat()){c.flagged=false;}getCell(world,center.sx,center.sy)!.open=true;
 const mines=neighbors.filter(c=>c.mine),safeN=neighbors.filter(c=>!c.mine&&!c.open);
 let flags=kind==='plain'?[]:kind==='correct'?mines:kind==='few'?mines.slice(1):kind==='many'?[...mines,safeN[0]!]:safeN.slice(0,mines.length);
 for(const c of flags)getCell(world,c.sx,c.sy)!.flagged=true;
 const hub=normalizeHubSnapshot({...INITIAL_HUB,ammoBatteryRepaired:true,frontProgress:captureFrontProgress(world,{sx:center.sx,sy:center.sy})});
 fixtures[kind]=serializeHubSave(createHubSave(hub));
}
fs.writeFileSync('/tmp/invade-input-fixtures.json',JSON.stringify(fixtures));
