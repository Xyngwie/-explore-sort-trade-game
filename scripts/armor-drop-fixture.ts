import fs from 'node:fs';
import {buildShieldFixture} from '../packages/explore/src/debug/shieldFixture';
import {emptyFieldObjectIdentities,registerWreckIdentity,shieldIdentityFromWreck,createHubSave,serializeHubSave} from '../packages/shared/src/index';
const f=buildShieldFixture('NO_SHIELD_NO_CIRCUIT');
f.world.wingmen[0]!.pos={x:650,y:600};f.world.wingmen[0]!.heading=Math.PI;
f.world.circuitPlay!.baseMaxHp.leader=240; // release maxDurability=0.5, so the effective max HP is 120

f.world.leader.hp=67;f.world.leader.maxHp=120;f.world.currentAmmo['debug-leader']=7;f.world.mechBattery['debug-leader']!.activity=0;
if(process.argv.includes('--pickup')){
 f.world.mechBattery['debug-leader']!.activity=300;
 const identities=shieldIdentityFromWreck(registerWreckIdentity(emptyFieldObjectIdentities(),'armor-test-wreck'),'armor-test-wreck','armor-test-shield',{hp:20,maxHp:50});
 f.world.shieldState={identities,equipped:{[f.world.leader.id]:{kind:'shield',key:'armor-test-shield'}},ground:{}};
 f.world.enemySupplies=[{id:'armor-test-drop',pos:{...f.world.leader.pos},kind:'armor',ammo:0,power:0,armor:67}];
}
fs.writeFileSync('/tmp/armor-drop-fixture.json',JSON.stringify({hub:serializeHubSave(createHubSave(f.hub)),checkpoint:{v:1,kind:'sortie',body:f.world}}));
