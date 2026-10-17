import type { World } from "./types";
/** Separate from HUB save: private learning observations, not economy or player-facing stats. */
export const FRIENDLY_FIRE_HISTORY_KEY="estg.explore.friendly-fire-history.v1";
export const FRIENDLY_FIRE_HISTORY_LIMIT=1000;
export const FRIENDLY_FIRE_HISTORY_MAX_CHARS=256_000;
const resultAttempts=new WeakMap<World,{id:string;done:boolean;retryAt:number}>();
export type FriendlyFireStats={count:number;byShooter:Record<string,number>};
export type BattleObservation=FriendlyFireStats & {sortieId:string};
export function recordFriendlyFire(world:World,shooterId:string):void {
  const stats=world.friendlyFire??={count:0,byShooter:{}};
  stats.count++;stats.byShooter[shooterId]=(stats.byShooter[shooterId]??0)+1;
}
/** Atomic overwrite by sortie id; replayed results never increment an already settled battle. */
export function settleFriendlyFire(world:World,sortieId:string,storage:Pick<Storage,"getItem"|"setItem">):boolean {
  try{
    const raw=storage.getItem(FRIENDLY_FIRE_HISTORY_KEY);
    const old=raw?JSON.parse(raw):{version:1,battles:[]};
    if(old.version!==1||!Array.isArray(old.battles))return false;
    if(old.battles.some((b:BattleObservation)=>b.sortieId===sortieId))return true;
    const stats=world.friendlyFire??{count:0,byShooter:{}};
    const next={version:1,battles:[...old.battles,{sortieId,count:stats.count,byShooter:{...stats.byShooter}}].slice(-FRIENDLY_FIRE_HISTORY_LIMIT)};
    let encoded=JSON.stringify(next);
    while(encoded.length>FRIENDLY_FIRE_HISTORY_MAX_CHARS && next.battles.length>1){next.battles.shift();encoded=JSON.stringify(next);}
    if(encoded.length>FRIENDLY_FIRE_HISTORY_MAX_CHARS)return false;
    storage.setItem(FRIENDLY_FIRE_HISTORY_KEY,encoded);return true;
  }catch{return false;} // retry on the next result render; never block settlement / alter rewards
}

/** Read once per result; failed storage attempts retry at most once per five seconds. */
export function settleFriendlyFireOnce(world:World,id:string,storage:Pick<Storage,"getItem"|"setItem">,now=Date.now()):boolean {
  const last=resultAttempts.get(world);
  if(last?.id===id && (last.done || now<last.retryAt))return last.done;
  const done=settleFriendlyFire(world,id,storage);
  resultAttempts.set(world,{id,done,retryAt:now+5000});return done;
}
