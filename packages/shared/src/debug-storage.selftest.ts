import assert from "node:assert/strict";
import { scopedStorage, debugRequested, DEBUG_PREFIX } from "./debug-storage";
class MemoryStorage implements Storage {
  private values = new Map<string,string>();
  get length(){return this.values.size;}
  key(i:number){return [...this.values.keys()][i]??null;}
  getItem(k:string){return this.values.get(k)??null;}
  setItem(k:string,v:string){this.values.set(k,String(v));}
  removeItem(k:string){this.values.delete(k);}
  clear(){this.values.clear();}
}
const native=new MemoryStorage();native.setItem("wreckline.hubSave.v3","NORMAL");native.setItem("estg.sortieCheckpoint","NORMAL_CHECKPOINT");
const fixture=scopedStorage(native);
assert.equal(fixture.getItem("wreckline.hubSave.v3"),null,"never inherit normal save");
fixture.setItem("wreckline.hubSave.v3","DEBUG");fixture.setItem("estg.sortieCheckpoint","DEBUG_CHECKPOINT");
assert.equal(native.getItem("wreckline.hubSave.v3"),"NORMAL");
assert.deepEqual(Object.keys(fixture).sort(),["estg.sortieCheckpoint","wreckline.hubSave.v3"]);
assert.equal(fixture.length,2);assert.equal(fixture["wreckline.hubSave.v3"],"DEBUG");
fixture["property"]="debug property";assert.equal(native.getItem(DEBUG_PREFIX+"property"),"debug property");delete fixture["property"];
fixture.clear();assert.equal(fixture.length,0);assert.equal(native.getItem("wreckline.hubSave.v3"),"NORMAL");assert.equal(native.getItem("estg.sortieCheckpoint"),"NORMAL_CHECKPOINT");
assert(debugRequested("?debug_fixture=shield"));assert(!debugRequested("?debug_fixture=other"));assert(!debugRequested(""));
console.log("debug storage isolation PASS");
