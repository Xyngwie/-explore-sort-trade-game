import "./style.css";
import {
  edgeCount,
  encodeEdgeState,
  type CircuitOutcome,
  type EdgeMark,
} from "@estg/shared";
import {
  boardFromMarks,
  cycleEdgeMark,
  deriveStubOutcome,
  digitSatisfaction,
  freshMarks,
  generatePuzzle,
  hEdgeIndex,
  isLoopClosed,
  lineEdgeCount,
  loadMarksFromStorage,
  outcomeLabel,
  saveMarksToStorage,
  vEdgeIndex,
} from "./puzzle";

const DEFAULT_SEED = "restore-stub-6";

/** Future handoff (not wired): buildRestoreToTradeUrl / parseTradeToRestoreSearch
 * — docs/HANDOFF_M45_V0.md. No navigate-on-complete until that ticket.
 */
const COLS = 6;
const ROWS = 6;

const root = document.querySelector<HTMLDivElement>("#app")!;

const puzzle = generatePuzzle(DEFAULT_SEED, COLS, ROWS);
const nEdges = edgeCount(puzzle.cols, puzzle.rows);

let marks: EdgeMark[] =
  loadMarksFromStorage(puzzle.puzzleId, nEdges) ?? freshMarks(puzzle.cols, puzzle.rows);
/** Manual override; null = derive from play. */
let outcomeOverride: CircuitOutcome | null = null;
let persist = true;

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function markClass(m: EdgeMark): string {
  if (m === 1) return "edge line";
  if (m === 2) return "edge xmark";
  return "edge empty";
}

function markGlyph(m: EdgeMark): string {
  if (m === 1) return "";
  if (m === 2) return "×";
  return "";
}

function persistIfNeeded(): void {
  if (persist) saveMarksToStorage(puzzle.puzzleId, marks);
}

function toggleEdge(index: number): void {
  const cur = marks[index] ?? 0;
  marks[index] = cycleEdgeMark(cur);
  outcomeOverride = null;
  persistIfNeeded();
  render();
}

function boardHtml(): string {
  const { cols, rows, clues } = puzzle;
  const parts: string[] = [];
  // Interleave: horizontal edge rows and (cell + vertical edge) rows.
  for (let y = 0; y <= rows; y++) {
    // horizontal edges (+ corner dots as spacers)
    parts.push(`<div class="hrow">`);
    for (let x = 0; x < cols; x++) {
      parts.push(`<span class="dot" aria-hidden="true"></span>`);
      const i = hEdgeIndex(cols, rows, x, y);
      const m = marks[i]!;
      parts.push(
        `<button type="button" class="${markClass(m)} h" data-edge="${i}" title="h(${x},${y})">${markGlyph(m)}</button>`,
      );
    }
    parts.push(`<span class="dot" aria-hidden="true"></span>`);
    parts.push(`</div>`);

    if (y === rows) break;

    // vertical edges + clue cells
    parts.push(`<div class="vrow">`);
    for (let x = 0; x <= cols; x++) {
      const i = vEdgeIndex(cols, rows, x, y);
      const m = marks[i]!;
      parts.push(
        `<button type="button" class="${markClass(m)} v" data-edge="${i}" title="v(${x},${y})">${markGlyph(m)}</button>`,
      );
      if (x < cols) {
        const clue = clues[y]![x];
        const label = clue == null ? "" : String(clue);
        parts.push(
          `<div class="clue${clue == null ? " blank" : ""}">${escapeHtml(label)}</div>`,
        );
      }
    }
    parts.push(`</div>`);
  }
  return `<div class="slither" style="--cols:${cols}">${parts.join("")}</div>`;
}

function render(): void {
  const digits = digitSatisfaction(puzzle.clues, marks, puzzle.cols, puzzle.rows);
  const loop = isLoopClosed(marks, puzzle.cols, puzzle.rows);
  const lines = lineEdgeCount(marks);
  const derived = deriveStubOutcome(loop, digits.rate, lines);
  const status = outcomeOverride ?? derived;
  const enc = encodeEdgeState(marks);
  const board = boardFromMarks(
    puzzle.cols,
    puzzle.rows,
    marks,
    puzzle.puzzleId,
    status,
  );

  root.innerHTML = `
    <p class="pill">MODULE 5 · RESTORE · THIN STUB</p>
    <h1>精密回路修復</h1>
    <p class="muted">Slitherlink 風の辺トグル。タイマーなし。trade 等への URL ハンドオフなし。</p>

    <div class="card">
      <p class="muted">puzzleSeed <span class="mono">${escapeHtml(puzzle.puzzleId)}</span> · ${puzzle.cols}×${puzzle.rows} · 辺クリック: 空 → 線 → × → 空</p>
      ${boardHtml()}
    </div>

    <div class="card">
      <table>
        <tr><td>loop-closed?</td><td class="${loop ? "ok" : ""}">${loop ? "yes" : "no"}</td></tr>
        <tr><td>digit satisfaction</td><td>${digits.satisfied}/${digits.clueCount} (${(digits.rate * 100).toFixed(0)}%)</td></tr>
        <tr><td>status</td><td><strong class="status-${status}">${escapeHtml(outcomeLabel(status))}</strong></td></tr>
        <tr><td>line edges</td><td>${lines}</td></tr>
        <tr><td>edgeState</td><td class="mono">${escapeHtml(enc || "(empty)")}</td></tr>
        <tr><td>board.outcome</td><td>${escapeHtml(board.outcome ?? "—")}</td></tr>
      </table>
      <div class="actions">
        <button type="button" class="btn" data-outcome="fully_awakened">Set Fully Awakened</button>
        <button type="button" class="btn" data-outcome="bypass">Set Bypass</button>
        <button type="button" class="btn ghost" data-outcome="offline">Set Offline</button>
        <button type="button" class="btn ghost" id="btn-clear">Clear edges</button>
      </div>
      <label class="persist">
        <input type="checkbox" id="chk-persist" ${persist ? "checked" : ""} />
        localStorage に edgeState を保存（この puzzleId）
      </label>
      <p class="ok" style="margin-top:0.75rem">成果語彙: Fully Awakened / Bypass / Offline（仮判定 + 手動上書き可）。</p>
      <p class="warn">制限タイマーなし。他モジュールへ遷移するリンクなし。</p>
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>("button.edge").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.edge);
      if (!Number.isFinite(i)) return;
      toggleEdge(i);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("button[data-outcome]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const o = btn.dataset.outcome as CircuitOutcome;
      outcomeOverride = o;
      persistIfNeeded();
      render();
    });
  });

  root.querySelector("#btn-clear")?.addEventListener("click", () => {
    marks = freshMarks(puzzle.cols, puzzle.rows);
    outcomeOverride = null;
    persistIfNeeded();
    render();
  });

  root.querySelector("#chk-persist")?.addEventListener("change", (ev) => {
    persist = (ev.target as HTMLInputElement).checked;
    if (persist) persistIfNeeded();
  });
}

render();
