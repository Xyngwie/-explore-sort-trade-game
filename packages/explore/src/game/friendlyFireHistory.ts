import type { World } from "./types";
/** Separate from HUB save: private learning observations, not economy or player-facing stats. */
export const FRIENDLY_FIRE_HISTORY_KEY="estg.explore.friendly-fire-history.v1";
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
    const next={version:1,battles:[...old.battles,{sortieId,count:stats.count,byShooter:{...stats.byShooter}}]};
    storage.setItem(FRIENDLY_FIRE_HISTORY_KEY,JSON.stringify(next));return true;
  }catch{return false;} // retry on the next result render; never block settlement / alter rewards
}
