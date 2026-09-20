import "./style.css";
import {
  encodeEdgeState,
  isPerfectCircuitDebugContext,
  isPerfectCircuitClearance,
  sanitizeEditorName,
  type CircuitOutcome,
  type EdgeMark,
} from "@estg/shared";
import {
  boardFromMarks,
  cycleEdgeMark,
  deriveStubOutcome,
  digitSatisfaction,
  isCellDigitActivated,
  freshMarks,
  hEdgeIndex,
  isLoopClosed,
  lineEdgeCount,
  outcomeLabel,
  saveMarksToStorage,
  vEdgeIndex,
} from "./puzzle";
import {
  bootstrapFromSearch,
  buildReturnToTradeUrl,
  stripInboundSearchFromLocation,
  type RestoreSession,
} from "./session";

const root = document.querySelector<HTMLDivElement>("#app")!;
const showInjectionDetails = isPerfectCircuitDebugContext({
  search: window.location.search,
  hostname: window.location.hostname,
  isDev: Boolean(import.meta.env.DEV),
});

const session: RestoreSession = bootstrapFromSearch(window.location.search, {
  hostname: window.location.hostname,
  isDev: Boolean(import.meta.env.DEV),
  envRate:
    (import.meta.env.VITE_PERFECT_CIRCUIT_RATE as string | undefined) ??
    (import.meta.env.PERFECT_CIRCUIT_RATE as string | undefined) ??
    null,
  showInjectionDetails,
});
/** Keep circuitId stable for restore→trade even if URL is stripped. */
const circuitId = session.circuitId;
const puzzle = session.puzzle;
const locked = session.locked;

let marks: EdgeMark[] = [...session.marks];
/** Manual override; null = derive from play (or inbound outcome once). */
let outcomeOverride: CircuitOutcome | null = session.inboundOutcome ?? null;
let persist = session.source === "demo" || session.source === "handoff-id";
let editorName = session.editorName ?? session.engravedName;

// Consume trade→restore keys so a refresh uses local session / storage.
if (session.source === "handoff-board" || session.source === "handoff-id") {
  try {
    const cleaned = stripInboundSearchFromLocation(window.location.href);
    const u = new URL(cleaned, window.location.origin);
    window.history.replaceState(
      null,
      "",
      u.pathname + u.search + u.hash,
    );
  } catch {
    /* ignore */
  }
}

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
  if (persist && !locked) saveMarksToStorage(puzzle.puzzleId, marks);
}

function currentOutcome(
  loop: boolean,
  digitRate: number,
  lines: number,
): CircuitOutcome {
  return outcomeOverride ?? deriveStubOutcome(loop, digitRate, lines);
}

function returnUrl(
  status: CircuitOutcome,
  perfect: boolean,
  lockNext: boolean,
): string {
  return buildReturnToTradeUrl({
    circuitId,
    cols: puzzle.cols,
    rows: puzzle.rows,
    marks,
    puzzleId: puzzle.puzzleId,
    outcome: status,
    lastEditorName: editorName,
    perfect: perfect || undefined,
    locked: lockNext || undefined,
  });
}

function toggleEdge(index: number): void {
  if (locked) return;
  const cur = marks[index] ?? 0;
  marks[index] = cycleEdgeMark(cur);
  outcomeOverride = null;
  persistIfNeeded();
  render();
}

function boardHtml(): string {
  const { cols, rows, clues } = puzzle;
  const parts: string[] = [];
  for (let y = 0; y <= rows; y++) {
    parts.push(`<div class="hrow">`);
    for (let x = 0; x < cols; x++) {
      parts.push(`<span class="dot" aria-hidden="true"></span>`);
      const i = hEdgeIndex(cols, rows, x, y);
      const m = marks[i]!;
      const disabled = locked ? " disabled" : "";
      parts.push(
        `<button type="button" class="${markClass(m)} h" data-edge="${i}" title="h(${x},${y})"${disabled}>${markGlyph(m)}</button>`,
      );
    }
    parts.push(`<span class="dot" aria-hidden="true"></span>`);
    parts.push(`</div>`);

    if (y === rows) break;

    parts.push(`<div class="vrow">`);
    for (let x = 0; x <= cols; x++) {
      const i = vEdgeIndex(cols, rows, x, y);
      const m = marks[i]!;
      const disabled = locked ? " disabled" : "";
      parts.push(
        `<button type="button" class="${markClass(m)} v" data-edge="${i}" title="v(${x},${y})"${disabled}>${markGlyph(m)}</button>`,
      );
      if (x < cols) {
        const clue = clues[y]![x];
        const label = clue == null ? "" : String(clue);
        const activated =
          clue == null
            ? null
            : isCellDigitActivated(clues, marks, cols, rows, x, y);
        let clueClass = "clue";
        if (clue == null) clueClass += " blank";
        else if (activated) clueClass += " activated";
        else clueClass += " unsatisfied";
        parts.push(
          `<div class="${clueClass}">${escapeHtml(label)}</div>`,
        );
      }
    }
    parts.push(`</div>`);
  }
  return `<div class="slither${locked ? " locked" : ""}" style="--cols:${cols}">${parts.join("")}</div>`;
}

function render(): void {
  const digits = digitSatisfaction(puzzle.clues, marks, puzzle.cols, puzzle.rows);
  const loop = isLoopClosed(marks, puzzle.cols, puzzle.rows);
  const lines = lineEdgeCount(marks);
  const status = currentOutcome(loop, digits.rate, lines);
  const perfect = isPerfectCircuitClearance({
    outcome: status,
    digitRate: digits.rate,
    loopClosed: loop,
  });
  const lockNext = locked || perfect;
  const enc = encodeEdgeState(marks);
  const board = boardFromMarks(
    puzzle.cols,
    puzzle.rows,
    marks,
    puzzle.puzzleId,
    status,
  );
  const hubUrl = returnUrl(status, perfect, lockNext);
  const displayName =
    session.engravedName ?? sanitizeEditorName(editorName) ?? "—";

  root.innerHTML = `
    <p class="pill">MODULE 5 · RESTORE · THIN STUB</p>
    <h1>精密回路修復</h1>
    <p class="muted">Slitherlink 風の辺トグル。タイマーなし。完了時は Hub（trade）へ circuitBoard + circuitOutcome を返す。</p>

    ${
      locked
        ? `<div class="card lock-banner">
      <p class="lock-title">完璧な回路・編集不可</p>
      <p class="muted">刻印 <strong class="engraved">${escapeHtml(displayName)}</strong></p>
    </div>`
        : ""
    }

    <div class="card">
      <p class="muted">${escapeHtml(session.note)}</p>
      <p class="muted">puzzleSeed <span class="mono">${escapeHtml(puzzle.puzzleId)}</span> · ${puzzle.cols}×${puzzle.rows} · 辺クリック: 空 → 線 → × → 空${
        circuitId
          ? ` · circuitId <span class="mono">${escapeHtml(circuitId)}</span>`
          : ""
      }</p>
      ${
        showInjectionDetails &&
        (session.injectedTrue || puzzle.injectedTrue)
          ? `<p class="ok" title="seeded true board (Perfect Circuit injection)">真盤気配 · Perfect inject${
              session.perfectInjectRate != null
                ? ` (${(session.perfectInjectRate * 100).toFixed(1)}%)`
                : ""
            }</p>`
          : showInjectionDetails && session.perfectInjectRate != null
            ? `<p class="muted">Perfect inject rate ${(session.perfectInjectRate * 100).toFixed(1)}%（未注入）</p>`
            : ""
      }
      ${
        !locked
          ? `<p class="muted">署名（刻印）: <span class="engraved">${escapeHtml(sanitizeEditorName(editorName) ?? "（未設定）")}</span></p>`
          : ""
      }
      ${boardHtml()}
    </div>

    <div class="card">
      <table>
        <tr><td>loop-closed?</td><td class="${loop ? "ok" : ""}">${loop ? "yes" : "no"}</td></tr>
        <tr><td>digit satisfaction</td><td>${digits.satisfied}/${digits.clueCount} (${(digits.rate * 100).toFixed(0)}%)</td></tr>
        <tr><td>status</td><td><strong class="status-${status}">${escapeHtml(outcomeLabel(status))}</strong></td></tr>
        <tr><td>perfect / locked</td><td>${perfect ? "perfect" : "—"} / ${lockNext ? "locked" : "editable"}</td></tr>
        <tr><td>line edges</td><td>${lines}</td></tr>
        <tr><td>edgeState</td><td class="mono">${escapeHtml(enc || "(empty)")}</td></tr>
        <tr><td>board.outcome</td><td>${escapeHtml(board.outcome ?? "—")}</td></tr>
      </table>
      <div class="actions">
        <button type="button" class="btn" data-outcome="fully_awakened" ${locked ? "disabled" : ""}>Set Fully Awakened</button>
        <button type="button" class="btn" data-outcome="bypass" ${locked ? "disabled" : ""}>Set Bypass</button>
        <button type="button" class="btn ghost" data-outcome="offline" ${locked ? "disabled" : ""}>Set Offline</button>
        <button type="button" class="btn ghost" id="btn-clear" ${locked ? "disabled" : ""}>Clear edges</button>
      </div>
      <label class="persist">
        <input type="checkbox" id="chk-persist" ${persist ? "checked" : ""} ${locked ? "disabled" : ""} />
        localStorage に edgeState を保存（この puzzleId）
      </label>
      <p class="ok" style="margin-top:0.75rem">成果語彙: Fully Awakened / Bypass / Offline（仮判定 + 手動上書き可）。Perfect は単一ループ＋数字100%でロック。</p>
      <p class="muted" style="margin-top:0.5rem">制限タイマーなし。</p>
    </div>

    <div class="card">
      <p class="muted">restore → trade（HANDOFF_M45 · <span class="mono">buildRestoreToTradeUrl</span>）</p>
      <table>
        <tr><td>circuitOutcome</td><td class="mono">${escapeHtml(status)}</td></tr>
        <tr><td>lastEditorName</td><td class="engraved">${escapeHtml(sanitizeEditorName(editorName) ?? "—")}</td></tr>
        <tr><td>return URL</td><td class="mono">${escapeHtml(hubUrl)}</td></tr>
      </table>
      <div class="actions">
        <a class="btn" id="link-return-trade" href="${escapeHtml(hubUrl)}">Hub（trade）へ戻る · ${escapeHtml(outcomeLabel(status))}</a>
      </div>
    </div>
  `;

  if (!locked) {
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
}

render();
