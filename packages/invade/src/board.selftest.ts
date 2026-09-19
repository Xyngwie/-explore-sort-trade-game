import assert from "node:assert/strict";
import {
  SECTOR_WALL_DISTANCE,
  buildInvadeToExploreUrl,
  buildInvadeToTradeUrl,
  parseInvadeToExploreSearch,
  sectorDensityAt,
} from "@estg/shared";
import {
  AOI_HALF,
  BOARD_SPAN,
  MAX_MINE_P,
  MIN_MINE_P,
  countFlagged,
  countOpenSafe,
  densityAfterBoard,
  expectedMineCount,
  floodOpen,
  generateBoard,
  getCell,
  intelFromBoard,
  mergeBoardIntel,
  mineProbabilityAtDistance,
  minesRemaining,
  openCell,
  rngFromSeed,
  toggleFlag,
} from "./board";

// --- geometry ---
assert.equal(BOARD_SPAN, AOI_HALF * 2 + 1);
assert.equal(BOARD_SPAN, 25);
assert.equal(AOI_HALF, 12);

// --- P(mine) rises with Chebyshev d ---
assert.equal(mineProbabilityAtDistance(0), 0);
assert.equal(mineProbabilityAtDistance(-1), 0);
assert.ok(mineProbabilityAtDistance(1) >= MIN_MINE_P - 1e-9);
assert.ok(mineProbabilityAtDistance(SECTOR_WALL_DISTANCE) === 0);
assert.ok(mineProbabilityAtDistance(10) <= MAX_MINE_P + 1e-9);
assert.ok(mineProbabilityAtDistance(10) > mineProbabilityAtDistance(1));
assert.ok(mineProbabilityAtDistance(5) > mineProbabilityAtDistance(2));

const expected = expectedMineCount();
assert.ok(expected > 20 && expected < 200, `expected mines ~middle, got ${expected}`);

// --- HQ forced open + never mined; wall blocked ---
const board0 = generateBoard(AOI_HALF, rngFromSeed(42));
assert.equal(board0.span, BOARD_SPAN);
assert.equal(board0.aoiHalf, AOI_HALF);
const hq = getCell(board0, 0, 0)!;
assert.equal(hq.isHq, true);
assert.equal(hq.mine, false);
assert.equal(hq.blocked, false);
assert.equal(hq.open, true, "HQ must start open");

const wall = getCell(board0, SECTOR_WALL_DISTANCE, 0)!;
assert.equal(wall.blocked, true);
assert.equal(wall.mine, false);
assert.equal(wall.open, false);

// Corner of AOI is on wall ring (d=12)
const corner = getCell(board0, AOI_HALF, AOI_HALF)!;
assert.equal(corner.blocked, true);

// Flood from HQ opens contiguous zero region (at least HQ)
assert.ok(countOpenSafe(board0) >= 1);

// --- denser rings produce more mines farther out (empirical on seeded board) ---
{
  const b = generateBoard(AOI_HALF, rngFromSeed(99));
  let nearMines = 0;
  let nearCells = 0;
  let farMines = 0;
  let farCells = 0;
  for (const row of b.cells) {
    for (const c of row) {
      if (c.blocked || c.isHq) continue;
      const d = Math.max(Math.abs(c.sx), Math.abs(c.sy));
      if (d <= 3) {
        nearCells++;
        if (c.mine) nearMines++;
      } else if (d >= 8 && d < SECTOR_WALL_DISTANCE) {
        farCells++;
        if (c.mine) farMines++;
      }
    }
  }
  const nearRate = nearMines / Math.max(1, nearCells);
  const farRate = farMines / Math.max(1, farCells);
  assert.ok(
    farRate > nearRate,
    `far ring should be denser: near=${nearRate.toFixed(3)} far=${farRate.toFixed(3)}`,
  );
}

// Deterministic seed: same seed → same mine layout
{
  const a = generateBoard(AOI_HALF, rngFromSeed(7));
  const b = generateBoard(AOI_HALF, rngFromSeed(7));
  assert.equal(a.mineCount, b.mineCount);
  for (let iy = 0; iy < a.span; iy++) {
    for (let ix = 0; ix < a.span; ix++) {
      assert.equal(a.cells[iy]![ix]!.mine, b.cells[iy]![ix]!.mine);
    }
  }
}

// --- flood / open ---
{
  const board = generateBoard(AOI_HALF, rngFromSeed(3));
  let openedSomewhere = false;
  outer: for (const row of board.cells) {
    for (const c of row) {
      if (!c.blocked && !c.open && !c.mine && !c.flagged) {
        const before = countOpenSafe(board);
        const r = openCell(board, c.sx, c.sy);
        assert.equal(r.ok, true);
        if (r.ok) {
          assert.ok(r.opened >= 1);
          assert.ok(countOpenSafe(board) >= before + 1);
        }
        openedSomewhere = true;
        break outer;
      }
    }
  }
  assert.ok(openedSomewhere);
}

// floodOpen does not open mines
{
  const board = generateBoard(AOI_HALF, rngFromSeed(11));
  let minePos: { sx: number; sy: number } | null = null;
  outer: for (const row of board.cells) {
    for (const c of row) {
      if (c.mine && !c.open) {
        minePos = { sx: c.sx, sy: c.sy };
        break outer;
      }
    }
  }
  assert.ok(minePos);
  const n = floodOpen(board, minePos!.sx, minePos!.sy);
  assert.equal(n, 0);
  assert.equal(getCell(board, minePos!.sx, minePos!.sy)!.open, false);
}

// blocked cells reject open/flag
{
  const board = generateBoard(AOI_HALF, rngFromSeed(1));
  assert.equal(openCell(board, SECTOR_WALL_DISTANCE, 0).ok, false);
  assert.equal(toggleFlag(board, SECTOR_WALL_DISTANCE, 0).ok, false);
}

// --- flag toggle ---
{
  const board = generateBoard(AOI_HALF, rngFromSeed(5));
  let target: { sx: number; sy: number } | null = null;
  outer: for (const row of board.cells) {
    for (const c of row) {
      if (!c.blocked && !c.open && !c.flagged) {
        target = { sx: c.sx, sy: c.sy };
        break outer;
      }
    }
  }
  assert.ok(target);
  const f1 = toggleFlag(board, target!.sx, target!.sy);
  assert.equal(f1.ok, true);
  if (f1.ok) assert.equal(f1.flagged, true);
  assert.equal(countFlagged(board), 1);
  assert.ok(intelFromBoard(board).includes("sectorFlagged"));
  const f2 = toggleFlag(board, target!.sx, target!.sy);
  assert.equal(f2.ok, true);
  if (f2.ok) assert.equal(f2.flagged, false);
  // Cannot flag open HQ
  const bad = toggleFlag(board, 0, 0);
  assert.equal(bad.ok, false);
}

// --- mine step = soft hazard ---
{
  const board = generateBoard(AOI_HALF, rngFromSeed(13));
  let minePos: { sx: number; sy: number } | null = null;
  outer: for (const row of board.cells) {
    for (const c of row) {
      if (c.mine && !c.open && !c.flagged) {
        minePos = { sx: c.sx, sy: c.sy };
        break outer;
      }
    }
  }
  assert.ok(minePos);
  const r = openCell(board, minePos!.sx, minePos!.sy);
  assert.equal(r.ok, true);
  assert.equal(board.hitMine, true);
  assert.equal(board.status, "hazard");
  assert.ok(intelFromBoard(board).includes("scoutHazard"));
  // Still can flag after hazard
  let other: { sx: number; sy: number } | null = null;
  outer2: for (const row of board.cells) {
    for (const c of row) {
      if (!c.blocked && !c.open && !c.flagged) {
        other = { sx: c.sx, sy: c.sy };
        break outer2;
      }
    }
  }
  assert.ok(other);
  assert.equal(toggleFlag(board, other!.sx, other!.sy).ok, true);
}

// --- win via opening all safe cells ---
{
  const board = generateBoard(AOI_HALF, rngFromSeed(2));
  for (const row of board.cells) {
    for (const c of row) {
      if (!c.blocked && !c.mine && !c.open) openCell(board, c.sx, c.sy);
    }
  }
  assert.equal(board.status, "won");
  assert.equal(minesRemaining(board), 0);
  assert.ok(intelFromBoard(board).includes("sectorCleared"));
  assert.ok(!intelFromBoard(board).includes("minesRemaining"));
}

// --- handoff: existing keys only; board intel + density nudge ---
{
  const board = generateBoard(AOI_HALF, rngFromSeed(8));
  // Flag one closed cell
  outer: for (const row of board.cells) {
    for (const c of row) {
      if (!c.blocked && !c.open) {
        toggleFlag(board, c.sx, c.sy);
        break outer;
      }
    }
  }
  const info = sectorDensityAt(3, -2);
  const densOut = densityAfterBoard(info.density, board);
  const flags = mergeBoardIntel(["routeHint"], board);
  assert.ok(flags.includes("routeHint"));
  assert.ok(flags.includes("minesRemaining") || flags.includes("sectorCleared"));
  const url = buildInvadeToExploreUrl(
    {
      sectorX: 3,
      sectorY: -2,
      density: densOut,
      intelFlags: flags,
    },
    "http://localhost:5173/",
  );
  const parsed = parseInvadeToExploreSearch(new URL(url).search);
  assert.ok(parsed);
  assert.equal(parsed.sectorX, 3);
  assert.ok((parsed.intelFlags ?? []).length > 0);
  assert.ok(!url.includes("yieldBag"));

  const tradeUrl = buildInvadeToTradeUrl(
    {
      sectorX: 3,
      sectorY: -2,
      density: densOut,
      intelFlags: flags,
    },
    "http://localhost:5175/",
  );
  assert.ok(tradeUrl.includes("intelFlags="));
}

console.log("invade board.selftest ok");
