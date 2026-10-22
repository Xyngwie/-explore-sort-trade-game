import assert from "node:assert/strict";
import { INITIAL_HUB, createOwnedMech, classifyCircuit, CIRCUIT_EFFECT_KEYS, TRUE_BOARD_EFFECT_KEYS, buildDebugCircuit, createLabCircuit, changeLabCircuit, editLabCredits, labNumber, labOwnerLabel, persistLabPair, HUB_SAVE_STORAGE_KEY, SORTIE_CHECKPOINT_KEY } from "./index";
const hub={...structuredClone(INITIAL_HUB),fleet:[createOwnedMech("mech_gen1",{instanceId:"a"}),createOwnedMech("mech_gen1",{instanceId:"b"})],sortieSelection:["a","b"],invadeRank:{current:5,highestCleared:4}};
assert.equal(labOwnerLabel({...hub,sortieSelection:["b"]},"b"),"隊長機");assert.equal(labOwnerLabel({...hub,sortieSelection:["b"]},"a"),"格納庫機1");
for(const key of CIRCUIT_EFFECT_KEYS){
 const truth=(TRUE_BOARD_EFFECT_KEYS as readonly string[]).includes(key),c=buildDebugCircuit(`lab-circuit-${key}`,null,key,truth);
 assert.equal(classifyCircuit(c).effectKey,key);assert(classifyCircuit(c).effect>0);assert.equal(classifyCircuit(c).trueBoard,truth);
 const off=buildDebugCircuit(`off-${key}`,null,key,truth,false);assert.equal(classifyCircuit(off).effect,0);assert.equal(off.locked,false);
 assert.throws(()=>buildDebugCircuit("bad",null,key,!truth));
}
for(const n of [NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1,"", "NaN","Infinity"])assert.throws(()=>labNumber(n,true));
assert.equal(labNumber("12.75"),12.75);assert.throws(()=>labNumber("12.75",true));
assert.equal(editLabCredits(hub,"1234","set").credits,1234);assert.equal(editLabCredits(hub,"6","add").credits,5000006);assert.equal(editLabCredits(hub,"","zero").credits,0);assert.equal(editLabCredits({...hub,credits:1},"","initial").credits,5000000);assert.throws(()=>editLabCredits({...hub,credits:Number.MAX_SAFE_INTEGER},1,"add"));
let h=createLabCircuit(hub,"shield",false,true,"a","lab-circuit-shield");h=createLabCircuit(h,"p_shield",true,true,"a","lab-circuit-p");assert.equal(h.circuits.length,2);
assert.throws(()=>createLabCircuit(h,"shield",false,true,"a","lab-circuit-second"));assert.throws(()=>createLabCircuit(h,"p_shield",false,true,null));
h=changeLabCircuit(h,"lab-circuit-p","equip","b");assert.equal(h.circuits.find(c=>c.circuitId==="lab-circuit-p")!.equippedTo,"b");
h=changeLabCircuit(h,"lab-circuit-p","unequip",null);assert.equal(h.circuits.find(c=>c.circuitId==="lab-circuit-p")!.equippedTo,null);h=changeLabCircuit(h,"lab-circuit-p","delete",null);assert.equal(h.circuits.length,1);
assert.throws(()=>changeLabCircuit({...hub,circuits:[{...buildDebugCircuit("ordinary",null,"shield",false)}]},"ordinary","delete",null));
const left={...hub,circuits:[buildDebugCircuit("lab-circuit-left","b","shield",false)],lostMechs:[{instanceId:"b"} as never]};
for(const operation of ["equip","unequip","delete"] as const)assert.throws(()=>changeLabCircuit(left,"lab-circuit-left",operation,"a"));
const data=new Map([[HUB_SAVE_STORAGE_KEY,"before-hub"],[SORTIE_CHECKPOINT_KEY,"before-world"]]);let fail=true;
const store={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{if(k===SORTIE_CHECKPOINT_KEY&&fail){fail=false;throw new Error("quota");}data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}} as Storage;
assert.throws(()=>persistLabPair(hub,{phase:"sortie"},store));assert.equal(data.get(HUB_SAVE_STORAGE_KEY),"before-hub");assert.equal(data.get(SORTIE_CHECKPOINT_KEY),"before-world");
console.log("Alpha lab: all effect pools, online/offline, numeric bounds, equipment, credits and save rollback PASS");
