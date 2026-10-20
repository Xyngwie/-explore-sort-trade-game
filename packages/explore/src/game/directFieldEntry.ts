/** Direct hangar entry shares the saved Invade seed, departing HQ without
 * scouting or changing opened/flagged cells. Never mutate checkpoint resumes. */
import {
  frontBoard, invadeRankOf, parseInvadeToExploreSearch,
  loadHubSaveFromLocalStorage, saveHubSaveToLocalStorage,
  type HubSnapshot,
} from '@estg/shared';
type Store=Pick<Storage,'getItem'|'setItem'>;
export function directFieldEntry(search:string,hub:HubSnapshot,rng:()=>number=Math.random):{hub:HubSnapshot;search:string;created:boolean} {
  if (parseInvadeToExploreSearch(search)) return {hub,search,created:false};
  const created=!hub.frontProgress;
  const next=created ? {...hub,frontProgress:{seed:frontBoard.randomBoardSeed(rng),aoiHalf:frontBoard.AOI_HALF,opened:[],flagged:[],focus:null,hitMine:false}} : hub;
  const board=frontBoard.generateBoard(frontBoard.AOI_HALF,next.frontProgress!.seed);
  const params=new URLSearchParams(search);
  params.set('sectorX','0');params.set('sectorY','0');params.set('density','0');
  params.set('neighborCount',String(frontBoard.getCell(board,0,0)?.adjacent ?? 0));
  params.set('invadeRank',String(invadeRankOf(next).current));
  return {hub:next,search:`?${params}`,created};
}
/** An unavailable/refused save must not invent an ephemeral battlefield seed. */
export function directFieldEntryFromStorage(search:string,storage?:Store|null):string|null {
  const loaded=loadHubSaveFromLocalStorage(storage ?? undefined);
  if (!loaded?.hub) return null;
  const entry=directFieldEntry(search,loaded.hub);
  if (entry.created && !saveHubSaveToLocalStorage(entry.hub,storage ?? undefined)) throw new Error("field_save_refused");
  return entry.search;
}
