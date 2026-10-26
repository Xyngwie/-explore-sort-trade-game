import fs from 'node:fs';
import {buildShieldFixture} from '../packages/explore/src/debug/shieldFixture';
import {createHubSave,serializeHubSave} from '../packages/shared/src/index';
const f=buildShieldFixture('NO_SHIELD_NO_CIRCUIT');
f.world.wingmen[0]!.pos={x:650,y:600};f.world.wingmen[0]!.heading=Math.PI;
f.world.circuitPlay!.baseMaxHp.leader=240; // release maxDurability=0.5, so the effective max HP is 120

f.world.leader.hp=67;f.world.leader.maxHp=120;f.world.currentAmmo['debug-leader']=7;f.world.mechBattery['debug-leader']!.activity=0;
fs.writeFileSync('/tmp/armor-drop-fixture.json',JSON.stringify({hub:serializeHubSave(createHubSave(f.hub)),checkpoint:{v:1,kind:'sortie',body:f.world}}));
