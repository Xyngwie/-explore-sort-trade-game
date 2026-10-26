import { getCell, openCell, type MsBoard } from './board';
/** Only visible number and flag counts decide eligibility; never inspect mines before opening. */
export function chordCells(board:MsBoard,sx:number,sy:number): {opened:number;hit:{sx:number;sy:number}|null} {
  const center=getCell(board,sx,sy);
  if(board.hitMine || !center?.open || center.blocked || center.mine || center.adjacent<=0)return {opened:0,hit:null};
  const around=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){const c=getCell(board,sx+dx,sy+dy);if(c&&!c.blocked)around.push(c);}
  if(around.filter(c=>c.flagged).length!==center.adjacent)return {opened:0,hit:null};
  let opened=0;
  for(const c of around){if(c.open||c.flagged)continue;const r=openCell(board,c.sx,c.sy);if(r.ok)opened+=r.opened;if(board.hitMine)return {opened,hit:{sx:c.sx,sy:c.sy}};}
  return {opened,hit:null};
}
