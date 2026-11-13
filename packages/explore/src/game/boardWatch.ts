/**
 * Stage 4. Securing a cell writes the existing board immediately.
 * A mine cell becomes 済 when both enemies placed on it are dead (decisions 27, 28).
 * A non-mine cell opens when a living friendly steps into it (decision 29).
 * Fog of a cell secured this sortie stays until the next sortie (decision 30).
 * A living enemy inside a secure cell is visible on the sortie map, and the
 * big map keeps only that cell (decisions 26, 31, 32).
 */
import {
  cellGlyph,
  getCell,
  loadHubSaveFromLocalStorage,
  saveHubSaveToLocalStorage,
  setFrontProgressInHub,
  type FrontCellCoord,
  type InvadeFrontProgress,
} from "@estg/shared";
import { isWideMap } from "./fieldBounds";
import { playableCellAt, boardFromLayout, mineKeySet, MINE_ENEMY_COUNT } from "./wideField";
import type { Unit, World } from "./types";

function sameCell(a: FrontCellCoord, sx: number, sy: number): boolean {
  return a.sx === sx && a.sy === sy;
}

function cellKey(sx: number, sy: number): string {
  return `${sx},${sy}`;
}

function openedHas(progress: InvadeFrontProgress, sx: number, sy: number): boolean {
  return progress.opened.some((c) => sameCell(c, sx, sy));
}

export function minesOf(world: World): Set<string> {
  if (world.mineKeys instanceof Set && world.mineKeys.size > 0) return world.mineKeys;
  if (!world.wideLayout) return new Set();
  const keys = mineKeySet(boardFromLayout(world.wideLayout));
  world.mineKeys = keys;
  return keys;
}

/** A cell the board already shows as open: numbers, HQ, 済, ✕, or one secured this sortie. */
export function cellIsSecure(world: World, sx: number, sy: number): boolean {
  const progress = world.boardProgress;
  if (progress && openedHas(progress, sx, sy)) return true;
  return world.wideLayout?.opened.some((c) => sameCell(c, sx, sy)) ?? false;
}

export function cellSecuredThisSortie(world: World, sx: number, sy: number): boolean {
  return world.securedThisSortie?.some((c) => sameCell(c, sx, sy)) ?? false;
}

/** The secure cell a living enemy is standing in, or null. Watch range is that cell only. */
export function watchedCell(world: World, enemy: Unit): FrontCellCoord | null {
  if (!enemy.alive || !isWideMap(world.balance)) return null;
  const cell = playableCellAt(enemy.pos.x, enemy.pos.y);
  if (!cell || !cellIsSecure(world, cell.sx, cell.sy)) return null;
  return cell;
}

/** Cell-level "an enemy is here" marks. No world position. */
export function enemyPresenceMarks(world: World): FrontCellCoord[] {
  const seen = new Set<string>();
  const out: FrontCellCoord[] = [];
  for (const enemy of world.enemies) {
    const cell = watchedCell(world, enemy);
    if (!cell) continue;
    const key = cellKey(cell.sx, cell.sy);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sx: cell.sx, sy: cell.sy });
  }
  out.sort((a, b) => (a.sx !== b.sx ? a.sx - b.sx : a.sy - b.sy));
  return out;
}

function sameMarks(a: readonly FrontCellCoord[] | undefined, b: readonly FrontCellCoord[]): boolean {
  const left = a ?? [];
  if (left.length !== b.length) return false;
  return left.every((c, i) => c.sx === b[i]!.sx && c.sy === b[i]!.sy);
}

function openSecuredCell(world: World, sx: number, sy: number, mine: boolean): void {
  const progress = world.boardProgress;
  const layout = world.wideLayout;
  if (!progress || !layout) return;
  if (!openedHas(progress, sx, sy)) progress.opened.push({ sx, sy });
  progress.flagged = progress.flagged.filter((c) => !sameCell(c, sx, sy));
  if (mine) progress.hitMine = false;
  if (!layout.opened.some((c) => sameCell(c, sx, sy))) layout.opened.push({ sx, sy });
  layout.flagged = layout.flagged.filter((c) => !sameCell(c, sx, sy));
  const secured = (world.securedThisSortie ??= []);
  if (!secured.some((c) => sameCell(c, sx, sy))) secured.push({ sx, sy });
}

function persistBoard(world: World): void {
  const progress = world.boardProgress;
  if (!progress) return;
  const loaded = loadHubSaveFromLocalStorage();
  if (!loaded?.hub) return;
  saveHubSaveToLocalStorage(setFrontProgressInHub(loaded.hub, progress));
}

/**
 * Apply entries and cleared mines, then refresh the big-map marks.
 * Writes the hub when one is loaded, so a wipe in the same tick keeps 済.
 */
export function syncWideBoard(world: World): void {
  if (!isWideMap(world.balance) || !world.wideLayout || !world.boardProgress || world.phase === "briefing") return;
  let changed = false;
  const mines = minesOf(world);
  for (const unit of [world.leader, ...world.wingmen]) {
    if (!unit.alive) continue;
    const cell = playableCellAt(unit.pos.x, unit.pos.y);
    if (!cell || mines.has(cellKey(cell.sx, cell.sy))) continue;
    if (cellIsSecure(world, cell.sx, cell.sy)) continue;
    openSecuredCell(world, cell.sx, cell.sy, false);
    changed = true;
  }
  const placed = new Map<string, Unit[]>();
  for (const enemy of world.enemies) {
    if (!enemy.placedCell) continue;
    const key = cellKey(enemy.placedCell.sx, enemy.placedCell.sy);
    const group = placed.get(key);
    if (group) group.push(enemy);
    else placed.set(key, [enemy]);
  }
  for (const [key, group] of placed) {
    if (group.length !== MINE_ENEMY_COUNT || group.some((enemy) => enemy.alive)) continue;
    const [sx, sy] = key.split(",").map((n) => Number(n));
    if (sx == null || sy == null) continue;
    if (cellIsSecure(world, sx, sy) && world.boardProgress.hitMine !== true) continue;
    openSecuredCell(world, sx, sy, true);
    changed = true;
  }
  const marks = enemyPresenceMarks(world);
  if (!sameMarks(world.boardProgress.enemyHere, marks)) {
    if (marks.length > 0) world.boardProgress.enemyHere = marks;
    else delete world.boardProgress.enemyHere;
    changed = true;
  }
  if (changed) persistBoard(world);
}

/** Glyph of one cell on the live board. 済 is an open mine with hitMine false. */
export function liveCellGlyph(world: World, sx: number, sy: number): string {
  const progress = world.boardProgress;
  if (!progress || !world.wideLayout) return "";
  const cell = getCell(boardFromLayout(world.wideLayout), sx, sy);
  if (!cell) return "";
  return cellGlyph(cell, { hitMine: progress.hitMine === true });
}

/**
 * Stage 5, decisions 7 and 38 (神宮 2026-11-13): the board changes of this sortie on the result
 * screen, one line per kind, no line for a kind that did not change.
 */
export function boardResultLines(world: World): string[] {
  if (!isWideMap(world.balance) || !world.boardProgress) return [];
  const mines = minesOf(world);
  const secured = world.securedThisSortie ?? [];
  const cleared = secured.filter((c) => mines.has(cellKey(c.sx, c.sy))).length;
  const opened = secured.length - cleared;
  const enemies = world.boardProgress.enemyHere?.length ?? 0;
  const lines: string[] = [];
  if (cleared > 0) lines.push(`盤：地雷マス ${cleared} 個を「済」にした`);
  if (opened > 0) lines.push(`盤：マス ${opened} 個を開いた`);
  if (enemies > 0) lines.push(`盤：「敵がいる」マス ${enemies} 個`);
  return lines;
}

function escapeText(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Result-screen fragment of {@link boardResultLines} for the existing page; empty string when none. */
export function boardResultHtml(world: World): string {
  const lines = boardResultLines(world);
  if (lines.length === 0) return "";
  return `<ul class="board-changes" id="result-board">${lines.map((l) => `<li>${escapeText(l)}</li>`).join("")}</ul>`;
}
