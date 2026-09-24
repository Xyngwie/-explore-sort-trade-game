/**
 * Front-map presentation helpers (danger bands, resolved mines, progress feel).
 * Pure / derived only — does not mutate HubSave.frontProgress or forced-lock rules.
 */

import {
  SECTOR_FRONT_DISTANCE,
  SECTOR_WALL_DISTANCE,
  sectorDistanceFromHq,
} from "@estg/shared";
import {
  countFlagged,
  countOpenSafe,
  countPlayableSafe,
  minesRemaining,
  type MsBoard,
  type MsCell,
} from "./board";

/** Chebyshev ring → bomb-density feel band (for closed-cell tint + legend). */
export type DangerBand = "hq" | "near" | "mid" | "front" | "wall";

export type ExploredFeel = "thin" | "opening" | "pushing" | "cleared";

export type FrontProgressFeel = {
  openSafe: number;
  playableSafe: number;
  /** 0..1 safe cells opened (HQ flood counts). */
  openSafeRatio: number;
  /** Opened zeros (explored blanks, excluding HQ glyph cells still count if adj=0). */
  blanksOpen: number;
  flagged: number;
  minesRemaining: number;
  mineCount: number;
  openedMines: number;
  exploredFeel: ExploredFeel;
};

/** Map Chebyshev d → danger band (matches INVADE_V0 ring wish: near / mid / front / wall). */
export function dangerBandAtDistance(d: number): DangerBand {
  if (!Number.isFinite(d)) return "wall";
  const dist = Math.max(0, Math.floor(d));
  if (dist >= SECTOR_WALL_DISTANCE) return "wall";
  if (dist <= 0) return "hq";
  if (dist <= 3) return "near"; // ~薄い
  if (dist <= 6) return "mid"; // 中域
  // d 7…11 → 前線帯（密度感が乗る）
  return "front";
}

export function dangerBandAtCell(sx: number, sy: number): DangerBand {
  return dangerBandAtDistance(sectorDistanceFromHq(sx, sy));
}

export function dangerBandLabelJa(band: DangerBand): string {
  switch (band) {
    case "hq":
      return "拠点";
    case "near":
      return "近傍・薄い";
    case "mid":
      return "中域";
    case "front":
      return "前線・濃い";
    case "wall":
      return "壁";
  }
}

/** Short Japanese density hint for legend (P(mine) feel, not exact %). */
/** Inclusive Chebyshev range label for legend (e.g. "d=1–3"). */
export function dangerBandRangeJa(band: DangerBand): string {
  switch (band) {
    case "hq":
      return "d=0";
    case "near":
      return "d=1–3";
    case "mid":
      return "d=4–6";
    case "front":
      return `d=7–${SECTOR_WALL_DISTANCE - 1}（目安前線 d≥${SECTOR_FRONT_DISTANCE}）`;
    case "wall":
      return `d≥${SECTOR_WALL_DISTANCE}`;
  }
}

export function dangerBandHintJa(band: DangerBand): string {
  switch (band) {
    case "hq":
      return "敵なし";
    case "near":
      return "敵まばら";
    case "mid":
      return "敵やや増";
    case "front":
      return "敵濃密";
    case "wall":
      return "進入不可";
  }
}

/** CSS class suffix for closed-cell danger tint (empty for hq/wall). */
export function dangerBandCssClass(band: DangerBand): string {
  if (band === "near" || band === "mid" || band === "front") {
    return `danger-${band}`;
  }
  return "";
}

/** Opened mine after forced lock cleared (#75) — visual only; still sortie-able. */
export function isResolvedMineCell(
  cell: Pick<MsCell, "open" | "mine" | "blocked">,
  board: Pick<MsBoard, "hitMine">,
): boolean {
  return cell.open === true && cell.mine === true && !cell.blocked && board.hitMine !== true;
}

/** Opened mine while forced lock pending. */
export function isPendingMineCell(
  cell: Pick<MsCell, "open" | "mine" | "blocked">,
  board: Pick<MsBoard, "hitMine">,
): boolean {
  return cell.open === true && cell.mine === true && !cell.blocked && board.hitMine === true;
}

export function exploredFeelFromRatio(
  ratio: number,
  status: MsBoard["status"],
): ExploredFeel {
  if (status === "won") return "cleared";
  if (ratio >= 0.55) return "pushing";
  if (ratio >= 0.2) return "opening";
  return "thin";
}

export function exploredFeelLabelJa(feel: ExploredFeel): string {
  switch (feel) {
    case "thin":
      return "拠点周辺のみ";
    case "opening":
      return "空白が広がり始め";
    case "pushing":
      return "前線へ押し出し中";
    case "cleared":
      return "掃討完了";
  }
}

/** Derived progress feel for HUD — does not persist; HubSave stays opened/flagged/seed/hitMine. */
export function frontProgressFeel(board: MsBoard): FrontProgressFeel {
  const playableSafe = countPlayableSafe(board);
  const openSafe = countOpenSafe(board);
  const openSafeRatio =
    playableSafe > 0 ? openSafe / playableSafe : 0;
  let blanksOpen = 0;
  let openedMines = 0;
  for (const row of board.cells) {
    for (const c of row) {
      if (c.blocked) continue;
      if (c.open && c.mine) openedMines++;
      if (c.open && !c.mine && c.adjacent === 0) blanksOpen++;
    }
  }
  return {
    openSafe,
    playableSafe,
    openSafeRatio,
    blanksOpen,
    flagged: countFlagged(board),
    minesRemaining: minesRemaining(board),
    mineCount: board.mineCount,
    openedMines,
    exploredFeel: exploredFeelFromRatio(openSafeRatio, board.status),
  };
}

/**
 * Extra CSS classes for a cell (danger tint / resolved vs pending mine).
 * Does not replace existing open/flagged/hq classes.
 */
export function cellFeelClasses(
  cell: MsCell,
  board: Pick<MsBoard, "hitMine">,
): string[] {
  const out: string[] = [];
  if (isPendingMineCell(cell, board)) {
    out.push("mine-pending");
  } else if (isResolvedMineCell(cell, board)) {
    out.push("mine-resolved");
  }
  if (!cell.open && !cell.blocked && !cell.flagged) {
    const band = dangerBandAtCell(cell.sx, cell.sy);
    const cls = dangerBandCssClass(band);
    if (cls) out.push(cls);
  }
  if (cell.open && !cell.mine && !cell.blocked && cell.adjacent === 0 && !cell.isHq) {
    out.push("explored");
  }
  return out;
}

/** Title / tooltip addition for resolved vs pending mines. */
export function mineCellStatusJa(
  cell: Pick<MsCell, "open" | "mine">,
  board: Pick<MsBoard, "hitMine">,
): string | null {
  if (!cell.open || !cell.mine) return null;
  if (board.hitMine === true) return "強制戦闘未解決（ロック中）";
  return "交戦解決済・再出撃可";
}
