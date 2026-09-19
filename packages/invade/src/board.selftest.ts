import assert from "node:assert/strict";
import {
  buildInvadeToExploreUrl,
  buildInvadeToTradeUrl,
  parseInvadeToExploreSearch,
  sectorDensityAt,
} from "@estg/shared";
import {
  BOARD_SIZE,
  MAX_MINES,
  MIN_MINES,
  countFlagged,
  densityAfterBoard,
  floodOpen,
  generateBoard,
  hqCoords,
  intelFromBoard,
  mergeBoardIntel,
  mineCountFromDensity,
  minesRemaining,
  openCell,
  toggleFlag,
} from "./board";

// --- density → mine count ---
assert.equal(mineCountFromDensity(0), MIN_MINES);
assert.equal(mineCountFromDensity(1), MAX_MINES);
assert.equal(mineCountFromDensity(0.5), Math.round(MIN_MINES + 0.5 * (MAX_MINES - MIN_MINES)));
assert.equal(mineCountFromDensity(-1), MIN_MINES);
assert.equal(mineCountFromDensity(2), MAX_MINES);
assert.equal(mineCountFromDensity(Number.NaN), MIN_MINES);

// --- HQ forced open + never mined ---
const dens0 = sectorDensityAt(0, 0);
const hqBoard = generateBoard(0, 0, dens0.density);
assert.equal(hqBoard.size, BOARD_SIZE);
assert.equal(hqBoard.mineCount, mineCountFromDensity(dens0.density));
for (const { x, y } of hqCoords(BOARD_SIZE)) {
  const c = hqBoard.cells[y]![x]!;
  assert.equal(c.isHq, true);
  assert.equal(c.mine, false);
  assert.equal(c.open, true, `HQ (${x},${y}) must start open`);
  assert.equal(c.flagged, false);
}

// Flood from HQ opens contiguous zero region (at least the HQ cells)
let openSafe = 0;
for (const row of hqBoard.cells) {
  for (const c of row) if (c.open && !c.mine) openSafe++;
}
assert.ok(openSafe >= hqCoords(BOARD_SIZE).length);

// --- higher density → more mines ---
const front = sectorDensityAt(10, 0);
const frontBoard = generateBoard(10, 0, front.density);
assert.equal(frontBoard.mineCount, MAX_MINES);
assert.ok(frontBoard.mineCount > hqBoard.mineCount);

// Deterministic seed: same sector+density → same mine layout
const a = generateBoard(3, -2, 0.4);
const b = generateBoard(3, -2, 0.4);
assert.equal(a.mineCount, b.mineCount);
for (let y = 0; y < BOARD_SIZE; y++) {
  for (let x = 0; x < BOARD_SIZE; x++) {
    assert.equal(a.cells[y]![x]!.mine, b.cells[y]![x]!.mine);
  }
}

// --- flood open ---
{
  // Tiny synthetic: inject a board with a known zero pocket
  const board = generateBoard(1, 0, 0);
  // Find a closed non-mine cell; open it
  let openedSomewhere = false;
  outer: for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const c = board.cells[y]![x]!;
      if (!c.open && !c.mine && !c.flagged) {
        const before = countOpen(board);
        const r = openCell(board, x, y);
        assert.equal(r.ok, true);
        if (r.ok) {
          assert.ok(r.opened >= 1);
          assert.ok(countOpen(board) >= before + 1);
        }
        openedSomewhere = true;
        break outer;
      }
    }
  }
  assert.ok(openedSomewhere);
}

function countOpen(board: ReturnType<typeof generateBoard>): number {
  let n = 0;
  for (const row of board.cells) for (const c of row) if (c.open) n++;
  return n;
}

// floodOpen does not open mines
{
  const board = generateBoard(2, 2, 0.8);
  let minePos: { x: number; y: number } | null = null;
  outer: for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      if (board.cells[y]![x]!.mine && !board.cells[y]![x]!.open) {
        minePos = { x, y };
        break outer;
      }
    }
  }
  assert.ok(minePos);
  const n = floodOpen(board, minePos!.x, minePos!.y);
  assert.equal(n, 0);
  assert.equal(board.cells[minePos!.y]![minePos!.x]!.open, false);
}

// --- flag toggle ---
{
  const board = generateBoard(4, 1, 0.3);
  let target: { x: number; y: number } | null = null;
  outer: for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const c = board.cells[y]![x]!;
      if (!c.open && !c.flagged) {
        target = { x, y };
        break outer;
      }
    }
  }
  assert.ok(target);
  const f1 = toggleFlag(board, target!.x, target!.y);
  assert.equal(f1.ok, true);
  if (f1.ok) assert.equal(f1.flagged, true);
  assert.equal(countFlagged(board), 1);
  assert.ok(intelFromBoard(board).includes("sectorFlagged"));
  const f2 = toggleFlag(board, target!.x, target!.y);
  assert.equal(f2.ok, true);
  if (f2.ok) assert.equal(f2.flagged, false);
  assert.equal(countFlagged(board), 0);
  // Cannot flag an open HQ cell
  const hq = hqCoords(BOARD_SIZE)[0]!;
  const bad = toggleFlag(board, hq.x, hq.y);
  assert.equal(bad.ok, false);
}

// --- mine step = soft hazard (not hard-lock / still playable) ---
{
  const board = generateBoard(5, 5, 1);
  let minePos: { x: number; y: number } | null = null;
  outer: for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const c = board.cells[y]![x]!;
      if (c.mine && !c.open && !c.flagged) {
        minePos = { x, y };
        break outer;
      }
    }
  }
  assert.ok(minePos);
  const r = openCell(board, minePos!.x, minePos!.y);
  assert.equal(r.ok, true);
  assert.equal(board.hitMine, true);
  assert.equal(board.status, "hazard");
  assert.ok(intelFromBoard(board).includes("scoutHazard"));
  // Still can flag other cells after hazard
  let other: { x: number; y: number } | null = null;
  outer2: for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const c = board.cells[y]![x]!;
      if (!c.open && !c.flagged) {
        other = { x, y };
        break outer2;
      }
    }
  }
  assert.ok(other);
  assert.equal(toggleFlag(board, other!.x, other!.y).ok, true);
}

// --- win via opening all safe cells ---
{
  // Controlled RNG: no mines → trivial win after HQ open
  const empty = generateBoard(0, 0, 0, BOARD_SIZE, () => 0.99);
  // With density 0 we still place MIN_MINES; force zero mines via size+rng edge:
  // Manually open all non-mine cells on a low-mine board
  const board = generateBoard(0, 1, 0);
  for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const c = board.cells[y]![x]!;
      if (!c.mine && !c.open) openCell(board, x, y);
    }
  }
  assert.equal(board.status, "won");
  assert.equal(minesRemaining(board), 0);
  assert.ok(intelFromBoard(board).includes("sectorCleared"));
  assert.ok(!intelFromBoard(board).includes("minesRemaining"));
  void empty;
}

// --- handoff: existing keys only; board intel + density nudge ---
{
  const info = sectorDensityAt(3, -2);
  const board = generateBoard(3, -2, info.density);
  // Flag one closed cell so sectorFlagged appears
  outer: for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      if (!board.cells[y]![x]!.open) {
        toggleFlag(board, x, y);
        break outer;
      }
    }
  }
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
