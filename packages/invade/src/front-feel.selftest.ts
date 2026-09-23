import assert from "node:assert/strict";
import { SECTOR_FRONT_DISTANCE, SECTOR_WALL_DISTANCE } from "@estg/shared";
import {
  AOI_HALF,
  cellGlyph,
  captureFrontProgress,
  generateBoard,
  getCell,
  openCell,
  restoreBoardFromProgress,
  rngFromSeed,
} from "./board";
import {
  cellFeelClasses,
  dangerBandAtDistance,
  dangerBandHintJa,
  dangerBandLabelJa,
  dangerBandRangeJa,
  exploredFeelFromRatio,
  frontProgressFeel,
  isPendingMineCell,
  isResolvedMineCell,
  mineCellStatusJa,
} from "./front-feel";
import { isForcedCombatLock, releaseForcedCombatLock } from "./forced-combat";

// --- danger bands by Chebyshev d ---
assert.equal(dangerBandAtDistance(0), "hq");
assert.equal(dangerBandAtDistance(1), "near");
assert.equal(dangerBandAtDistance(3), "near");
assert.equal(dangerBandAtDistance(4), "mid");
assert.equal(dangerBandAtDistance(6), "mid");
assert.equal(dangerBandAtDistance(7), "front");
assert.equal(dangerBandAtDistance(SECTOR_FRONT_DISTANCE), "front");
assert.equal(dangerBandAtDistance(SECTOR_WALL_DISTANCE - 1), "front");
assert.equal(dangerBandAtDistance(SECTOR_WALL_DISTANCE), "wall");
assert.ok(dangerBandLabelJa("front").includes("前線"));
assert.ok(dangerBandHintJa("near").length > 0);
assert.ok(dangerBandRangeJa("front").includes(String(SECTOR_FRONT_DISTANCE)));

// --- resolved vs pending mine presentation (#75 compatible) ---
{
  const board = generateBoard(AOI_HALF, 21);
  let minePos: { sx: number; sy: number } | null = null;
  outer: for (const row of board.cells) {
    for (const c of row) {
      if (c.mine && !c.open && !c.blocked) {
        minePos = { sx: c.sx, sy: c.sy };
        break outer;
      }
    }
  }
  assert.ok(minePos);
  const r = openCell(board, minePos!.sx, minePos!.sy);
  assert.equal(r.ok, true);
  assert.equal(board.hitMine, true);
  assert.equal(isForcedCombatLock(board), true);

  const cell = getCell(board, minePos!.sx, minePos!.sy)!;
  assert.equal(isPendingMineCell(cell, board), true);
  assert.equal(isResolvedMineCell(cell, board), false);
  assert.equal(cellGlyph(cell, { hitMine: board.hitMine }), "✕");
  assert.ok(cellFeelClasses(cell, board).includes("mine-pending"));
  assert.ok(mineCellStatusJa(cell, board)?.includes("未解決"));

  // Simulate #75 clear: hitMine false, opened mine stays open
  releaseForcedCombatLock(board);
  assert.equal(board.hitMine, false);
  assert.equal(isForcedCombatLock(board), false);
  assert.equal(cell.open, true);
  assert.equal(cell.mine, true);
  assert.equal(isPendingMineCell(cell, board), false);
  assert.equal(isResolvedMineCell(cell, board), true);
  assert.equal(cellGlyph(cell, { hitMine: board.hitMine }), "済");
  assert.ok(cellFeelClasses(cell, board).includes("mine-resolved"));
  assert.ok(mineCellStatusJa(cell, board)?.includes("再出撃"));

  // Persistence shape unchanged: capture still stores opened + hitMine flag only
  const snap = captureFrontProgress(board, minePos);
  assert.ok(snap);
  assert.equal(snap!.hitMine, false);
  assert.ok(snap!.opened.some((o) => o.sx === minePos!.sx && o.sy === minePos!.sy));
  const restored = restoreBoardFromProgress(snap!);
  assert.ok(restored);
  assert.equal(restored!.board.hitMine, false);
  const rc = getCell(restored!.board, minePos!.sx, minePos!.sy)!;
  assert.equal(rc.open, true);
  assert.equal(rc.mine, true);
  assert.equal(isResolvedMineCell(rc, restored!.board), true);
}

// --- closed cell danger tint classes ---
{
  const board = generateBoard(AOI_HALF, rngFromSeed(3));
  const near = getCell(board, 2, 0)!;
  if (!near.open && !near.flagged) {
    assert.ok(cellFeelClasses(near, board).includes("danger-near"));
  }
  const frontish = getCell(board, 9, 0)!;
  if (!frontish.blocked && !frontish.open && !frontish.flagged) {
    assert.ok(cellFeelClasses(frontish, board).includes("danger-front"));
  }
}

// --- progress feel derived (not a HubSave field) ---
{
  const board = generateBoard(AOI_HALF, rngFromSeed(5));
  const feel0 = frontProgressFeel(board);
  assert.ok(feel0.openSafe >= 1);
  assert.ok(feel0.playableSafe > feel0.openSafe);
  assert.ok(feel0.blanksOpen >= 0);
  assert.equal(feel0.exploredFeel, exploredFeelFromRatio(feel0.openSafeRatio, board.status));
  assert.ok(["thin", "opening", "pushing", "cleared"].includes(feel0.exploredFeel));

  // Prefer opening a zero-adjacent safe cell to exercise blank progress feel
  let opened = false;
  for (const row of board.cells) {
    for (const c of row) {
      if (!c.blocked && !c.open && !c.mine && !c.flagged && c.adjacent === 0) {
        openCell(board, c.sx, c.sy);
        opened = true;
        break;
      }
    }
    if (opened) break;
  }
  if (!opened) {
    outer: for (const row of board.cells) {
      for (const c of row) {
        if (!c.blocked && !c.open && !c.mine && !c.flagged) {
          openCell(board, c.sx, c.sy);
          opened = true;
          break outer;
        }
      }
    }
  }
  const feel1 = frontProgressFeel(board);
  assert.ok(feel1.openSafe >= feel0.openSafe);
  if (opened) assert.ok(feel1.blanksOpen >= feel0.blanksOpen);

  // Numeric seed so captureFrontProgress can round-trip (HubSave shape unchanged)
  const seeded = generateBoard(AOI_HALF, 55);
  openCell(seeded, 1, 0); // may no-op if mine/open
  const snap = captureFrontProgress(seeded, { sx: 0, sy: 0 });
  assert.ok(snap);
  const keys = Object.keys(snap!).sort();
  for (const k of keys) {
    assert.ok(
      ["seed", "aoiHalf", "opened", "flagged", "focus", "hitMine", "updatedAt"].includes(k),
      `unexpected frontProgress key: ${k}`,
    );
  }
}

console.log("invade front-feel.selftest ok");
