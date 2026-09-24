import "./style.css";
import {
  encodeEdgeState,
  isPerfectCircuitDebugContext,
  sanitizeEditorName,
  type CircuitOutcome,
  type EdgeMark,
} from "@estg/shared";
import {
  boardFromMarks,
  classifyPlayResult,
  cycleEdgeMark,
  formatCircuitEffectJa,
  freshMarks,
  hazardLabel,
  hazardNoiseEdgeIndices,
  isCellDigitActivated,
  outcomeLabel,
  previewOutcomeEffects,
  rarityLabel,
  saveMarksToStorage,
  hEdgeIndex,
  vEdgeIndex,
} from "./puzzle";
import {
  bootstrapFromSearch,
  buildNextLocalBoardHref,
  buildReturnToTradeUrl,
  stripInboundSearchFromLocation,
  type RestoreSession,
} from "./session";
import {
  LOOP_CELEBRATE_MS,
  buildLoopCelebrateNoteHtml,
  effectSettleClass,
  shouldArmLoopCelebrate,
  slitherLoopCelebrateClass,
  type LoopCelebrateState,
} from "./loopCelebrate";

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
let editorName = session.editorName ?? session.engravedName ?? "";
/** After Abandon, keep Offline until edges change. */
let abandoned = false;
/** Edge index that just received noise/hazard interfere feedback (UI flash). */
let noiseFlashEdge: number | null = null;
let noiseFlashTimer: ReturnType<typeof setTimeout> | null = null;
/** Short JA toast after breaking/interfering with a noise edge. */
let noiseToast: string | null = null;
/** Loop-close celebrate settle window (ms timestamp). */
let celebrateUntil = 0;
let celebrateTimer: ReturnType<typeof setTimeout> | null = null;
let prevLoopClosed = false;

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

function markClass(
  m: EdgeMark,
  opts?: { activeLoop?: boolean; noiseAdj?: boolean; noiseFlash?: boolean },
): string {
  let c = "edge";
  if (m === 1) c += " line";
  else if (m === 2) c += " xmark";
  else c += " empty";
  if (opts?.activeLoop && m === 1) c += " active-loop";
  if (opts?.noiseAdj) c += " noise-adj";
  if (opts?.noiseFlash) c += " noise-flash";
  return c;
}

function markGlyph(m: EdgeMark): string {
  if (m === 1) return "";
  if (m === 2) return "×";
  return "";
}

function persistIfNeeded(): void {
  if (persist && !locked) saveMarksToStorage(puzzle.puzzleId, marks);
}

function play() {
  const override = abandoned ? ("offline" as const) : outcomeOverride;
  return classifyPlayResult(
    puzzle.clues,
    marks,
    puzzle.cols,
    puzzle.rows,
    override,
  );
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

function clearNoiseFlash(): void {
  if (noiseFlashTimer != null) {
    clearTimeout(noiseFlashTimer);
    noiseFlashTimer = null;
  }
  noiseFlashEdge = null;
  noiseToast = null;
}

function toggleEdge(index: number, noiseAdj: boolean): void {
  if (locked) return;
  const cur = marks[index] ?? 0;
  const next = cycleEdgeMark(cur);
  marks[index] = next;
  outcomeOverride = null;
  abandoned = false;

  if (noiseAdj && session.hazard !== "none") {
    // Stronger break / interfere feel on hazard-adjacent edges.
    clearNoiseFlash();
    noiseFlashEdge = index;
    if (next === 1) {
      noiseToast = "ノイズ干渉 — 危険辺に導通";
    } else if (next === 2) {
      noiseToast = "破断マーク — ノイズ辺を遮断";
    } else {
      noiseToast = "ノイズ辺を解放";
    }
    noiseFlashTimer = setTimeout(() => {
      noiseFlashEdge = null;
      noiseToast = null;
      noiseFlashTimer = null;
      render();
    }, 520);
  } else {
    clearNoiseFlash();
  }

  persistIfNeeded();
  render();
}

function boardHtml(
  activeLoopEdges: ReadonlySet<number>,
  scoringCells: ReadonlySet<string>,
  noiseEdges: ReadonlySet<number>,
  celebrate: LoopCelebrateState,
): string {
  const { cols, rows, clues } = puzzle;
  const parts: string[] = [];
  for (let y = 0; y <= rows; y++) {
    parts.push(`<div class="hrow">`);
    for (let x = 0; x < cols; x++) {
      parts.push(`<span class="dot" aria-hidden="true"></span>`);
      const i = hEdgeIndex(cols, rows, x, y);
      const m = marks[i]!;
      const disabled = locked ? " disabled" : "";
      const noiseAdj = noiseEdges.has(i);
      parts.push(
        `<button type="button" class="${markClass(m, {
          activeLoop: activeLoopEdges.has(i),
          noiseAdj,
          noiseFlash: noiseFlashEdge === i,
        })} h" data-edge="${i}" data-noise="${noiseAdj ? "1" : "0"}" title="h(${x},${y})"${disabled}>${markGlyph(m)}</button>`,
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
      const noiseAdj = noiseEdges.has(i);
      parts.push(
        `<button type="button" class="${markClass(m, {
          activeLoop: activeLoopEdges.has(i),
          noiseAdj,
          noiseFlash: noiseFlashEdge === i,
        })} v" data-edge="${i}" data-noise="${noiseAdj ? "1" : "0"}" title="v(${x},${y})"${disabled}>${markGlyph(m)}</button>`,
      );
      if (x < cols) {
        const clue = clues[y]![x];
        const label = clue == null ? "" : String(clue);
        const activated =
          clue == null
            ? null
            : isCellDigitActivated(clues, marks, cols, rows, x, y);
        const onActive = scoringCells.has(`${x},${y}`);
        let clueClass = "clue";
        if (clue == null) clueClass += " blank";
        else if (activated) clueClass += " activated";
        else clueClass += " unsatisfied";
        if (onActive) clueClass += " on-active-loop";
        parts.push(
          `<div class="${clueClass}">${escapeHtml(label)}</div>`,
        );
      }
    }
    parts.push(`</div>`);
  }
  const toast =
    noiseToast != null
      ? `<div class="noise-toast" role="status">${escapeHtml(noiseToast)}</div>`
      : "";
  const celebrateCls = slitherLoopCelebrateClass(celebrate);
  return `<div class="slither-wrap">${toast}${buildLoopCelebrateNoteHtml(celebrate)}<div class="slither${locked ? " locked" : ""}${session.hazard !== "none" ? " hazard-board" : ""}${celebrateCls}" style="--cols:${cols}">${parts.join("")}</div></div>`;
}

function outcomeBanner(status: CircuitOutcome, blurb: string): string {
  return `<div class="outcome-banner outcome-${status}" role="status">
    <div class="outcome-name">${escapeHtml(outcomeLabel(status))}</div>
    <div class="outcome-blurb">${escapeHtml(blurb)}</div>
  </div>`;
}

function digitBar(
  satisfied: number,
  clueCount: number,
  rate: number,
  effectLabel: string,
  activeLoopEdgeCount: number,
  loopCount: number,
  celebrate: LoopCelebrateState,
): string {
  const pct = Math.round(rate * 100);
  const loopNote =
    activeLoopEdgeCount > 0
      ? `有効ループ ${activeLoopEdgeCount}辺` +
        (loopCount > 1 ? `（${loopCount}ループ中の最小）` : "")
      : "ループなし → 効果 0";
  const settleCls = effectSettleClass(celebrate);
  return `<div class="board-meters">
    <div class="digit-meter" aria-label="digit satisfaction ${satisfied}/${clueCount}">
      <div class="digit-meter-fill" style="width:${pct}%"></div>
      <span class="digit-meter-label">充足 ${satisfied}/${clueCount} · ${pct}%</span>
    </div>
    <div class="effect-readout${settleCls}" aria-label="${effectLabel}">
      <span class="effect-k">効果値</span>
      <strong class="effect-v">${escapeHtml(effectLabel)}</strong>
    </div>
    <p class="loop-hint muted">${escapeHtml(loopNote)} · 青白グロー＝採点中の最小閉ループ</p>
  </div>`;
}

function outcomeEffectPreviewHtml(
  bypassEffect: number,
  awakenedEffect: number,
  hasLoop: boolean,
  awakenedBetter: boolean,
): string {
  if (!hasLoop) {
    return `<div class="effect-preview" role="region" aria-label="成果プレビュー">
      <p class="effect-preview-title">成果プレビュー（効果値）</p>
      <p class="muted">閉ループが無いため効果は 0。線を閉じてから Bypass / Fully Awakened の差が出ます。</p>
    </div>`;
  }
  return `<div class="effect-preview" role="region" aria-label="成果プレビュー">
    <p class="effect-preview-title">成果プレビュー（効果値）</p>
    <div class="effect-preview-grid">
      <div class="effect-preview-card preview-bypass">
        <span class="preview-label">Bypass</span>
        <strong class="preview-num">${bypassEffect}</strong>
        <span class="preview-note">部分修復 · 0セル無効</span>
      </div>
      <div class="effect-preview-vs" aria-hidden="true">対</div>
      <div class="effect-preview-card preview-awakened${awakenedBetter ? " better" : ""}">
        <span class="preview-label">Fully Awakened</span>
        <strong class="preview-num">${awakenedEffect}</strong>
        <span class="preview-note">完全復元 · 0→4${awakenedBetter ? " あり" : ""}</span>
      </div>
    </div>
    <p class="muted preview-foot">${
      awakenedBetter
        ? `差 +${awakenedEffect - bypassEffect}（Perfect 時の 0→4 ボーナス）`
        : "現状、両者の効果値は同じ（0セル寄与なし）"
    }</p>
  </div>`;
}

function render(): void {
  const classified = play();
  const {
    outcome: status,
    perfectClearance: perfect,
    digits,
    loopClosed,
    lineCount,
    blurb,
    effect,
  } = classified;
  const effectLabel = formatCircuitEffectJa(effect);
  const preview = previewOutcomeEffects(
    puzzle.clues,
    marks,
    puzzle.cols,
    puzzle.rows,
  );
  const activeLoopEdges = new Set(effect.activeLoopEdgeIndices);
  const scoringCells = new Set(
    effect.scoringCells.map((c) => `${c.x},${c.y}`),
  );
  if (shouldArmLoopCelebrate(prevLoopClosed, loopClosed)) {
    celebrateUntil = Date.now() + LOOP_CELEBRATE_MS;
    if (celebrateTimer != null) clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => {
      celebrateTimer = null;
      celebrateUntil = 0;
      render();
    }, LOOP_CELEBRATE_MS);
  }
  prevLoopClosed = loopClosed;
  const celebrating = Date.now() < celebrateUntil;
  const celebrateState: LoopCelebrateState = {
    loopClosed,
    celebrating,
    perfect,
    fullyAwakened: status === "fully_awakened",
  };
  const noiseEdges = hazardNoiseEdgeIndices(
    puzzle.clues,
    puzzle.cols,
    puzzle.rows,
    session.hazard,
  );
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
  const nextSeed = `board-${Date.now().toString(36)}`;
  const nextHref = buildNextLocalBoardHref(nextSeed, window.location.href);
  const canAwaken = !locked && status === "fully_awakened";
  const canBypass = !locked && (status === "bypass" || digits.satisfied > 0 || loopClosed);
  const rarityClass =
    session.rarity === "perfect_rare" ? "rarity-perfect" : "rarity-flawed";

  root.innerHTML = `
    <p class="pill">MODULE 5 · RESTORE · PLAYABLE THICKEN</p>
    <h1>精密回路修復</h1>
    <p class="muted">大半は不完全基板。稀に可解コア。部分修復→Bypass、完全ループ→Fully Awakened（刻印ロック）、放棄→Offline。タイマー圧なし。</p>

    ${
      locked
        ? `<div class="card lock-banner">
      <p class="lock-title">完璧な回路・編集不可</p>
      <p class="muted">最終編集者（刻印） <strong class="engraved">${escapeHtml(displayName)}</strong></p>
    </div>`
        : ""
    }

    ${outcomeBanner(status, blurb)}

    ${
      !locked && session.rarity === "flawed_majority" && status !== "fully_awakened"
        ? `<div class="card bypass-hero" role="region" aria-label="Bypass confirm">
      <p class="bypass-hero-title">不完全基板 — Bypass で確定</p>
      <p class="bypass-hero-body">全解は期待しない盤です。部分充足のまま <strong>Bypass</strong> で拠点へ戻して効果を残せます。</p>
      <button type="button" class="btn bypass-confirm" id="btn-bypass-hero" ${canBypass ? "" : "disabled"}>
        Bypass を確定する
      </button>
    </div>`
        : !locked && status === "bypass"
          ? `<div class="card bypass-hero" role="region" aria-label="Bypass confirm">
      <p class="bypass-hero-title">Bypass 準備完了</p>
      <p class="bypass-hero-body">部分修復として確定できます。迷わず Bypass へ。</p>
      <button type="button" class="btn bypass-confirm" id="btn-bypass-hero">
        Bypass を確定する
      </button>
    </div>`
          : ""
    }


    <div class="card">
      <div class="meta-row">
        <span class="rarity-badge ${rarityClass}">${escapeHtml(rarityLabel(session.rarity))}</span>
        ${
          session.hazard !== "none"
            ? `<span class="hazard-badge">${escapeHtml(hazardLabel(session.hazard))}</span>`
            : ""
        }
      </div>
      <p class="muted">${escapeHtml(session.note)}</p>
      <p class="muted">puzzleSeed <span class="mono">${escapeHtml(puzzle.puzzleId)}</span> · ${puzzle.cols}×${puzzle.rows} · 辺: 空 → 線 → × → 空${
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
      ${boardHtml(activeLoopEdges, scoringCells, noiseEdges, celebrateState)}
      ${digitBar(
        digits.satisfied,
        digits.clueCount,
        digits.rate,
        effectLabel,
        effect.activeLoopEdgeCount,
        effect.loopCount,
        celebrateState,
      )}
      ${outcomeEffectPreviewHtml(
        preview.bypass.effect,
        preview.awakened.effect,
        preview.bypass.hasLoop,
        preview.awakenedBetter,
      )}
    </div>

    <div class="card">
      <table>
        <tr><td>loop-closed?</td><td class="${loopClosed ? "ok" : ""}">${loopClosed ? "yes" : "no"}</td></tr>
        <tr><td>digit satisfaction</td><td>${digits.satisfied}/${digits.clueCount} (${(digits.rate * 100).toFixed(0)}%)</td></tr>
        <tr><td>効果値</td><td class="ok"><strong>${escapeHtml(effectLabel)}</strong> <span class="muted">(ループ ${effect.loopCount})</span></td></tr>
        <tr><td>status</td><td><strong class="status-${status}">${escapeHtml(outcomeLabel(status))}</strong></td></tr>
        <tr><td>perfect / locked</td><td>${perfect ? "perfect" : "—"} / ${lockNext ? "locked" : "editable"}</td></tr>
        <tr><td>line edges</td><td>${lineCount}</td></tr>
        <tr><td>edgeState</td><td class="mono">${escapeHtml(enc || "(empty)")}</td></tr>
        <tr><td>board.outcome</td><td>${escapeHtml(board.outcome ?? "—")}</td></tr>
      </table>

      ${
        !locked
          ? `<label class="editor-field">最終編集者名（刻印スタブ）
        <input type="text" id="inp-editor" maxlength="32" value="${escapeHtml(editorName)}" placeholder="例: 整備班・葵" />
      </label>`
          : `<p class="muted">刻印 <span class="engraved">${escapeHtml(displayName)}</span></p>`
      }

      <div class="actions">
        <button type="button" class="btn" id="btn-commit-awaken" ${canAwaken ? "" : "disabled"} title="完全ループ＋数字充足で有効">Commit Fully Awakened</button>
        <button type="button" class="btn ${session.rarity === "flawed_majority" || status === "bypass" ? "bypass-confirm" : ""}" id="btn-commit-bypass" ${canBypass ? "" : "disabled"}>Commit Bypass</button>
        <button type="button" class="btn ghost" id="btn-abandon" ${locked ? "disabled" : ""}>Abandon → Offline</button>
        <button type="button" class="btn ghost" id="btn-clear" ${locked ? "disabled" : ""}>Clear edges</button>
        ${
          session.source === "demo"
            ? `<a class="btn ghost" id="link-next-board" href="${escapeHtml(nextHref)}">次の基板を引く</a>`
            : ""
        }
      </div>
      <label class="persist">
        <input type="checkbox" id="chk-persist" ${persist ? "checked" : ""} ${locked ? "disabled" : ""} />
        localStorage に edgeState を保存（この puzzleId）
      </label>
      <p class="muted" style="margin-top:0.75rem">判定は digit 充足＋単一ループ。Perfect は Fully Awakened かつ完全充足でロック。制限タイマーなし。</p>
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
        const noiseAdj = btn.dataset.noise === "1";
        toggleEdge(i, noiseAdj);
      });
    });

    root.querySelector("#inp-editor")?.addEventListener("input", (ev) => {
      editorName = (ev.target as HTMLInputElement).value;
    });
    root.querySelector("#inp-editor")?.addEventListener("change", () => {
      render();
    });

    root.querySelector("#btn-commit-awaken")?.addEventListener("click", () => {
      if (!canAwaken) return;
      outcomeOverride = "fully_awakened";
      abandoned = false;
      persistIfNeeded();
      render();
    });
    root.querySelector("#btn-commit-bypass")?.addEventListener("click", () => {
      outcomeOverride = "bypass";
      abandoned = false;
      persistIfNeeded();
      render();
    });
    root.querySelector("#btn-bypass-hero")?.addEventListener("click", () => {
      if (locked) return;
      outcomeOverride = "bypass";
      abandoned = false;
      persistIfNeeded();
      render();
    });
    root.querySelector("#btn-abandon")?.addEventListener("click", () => {
      abandoned = true;
      outcomeOverride = "offline";
      persistIfNeeded();
      render();
    });

    root.querySelector("#btn-clear")?.addEventListener("click", () => {
      marks = freshMarks(puzzle.cols, puzzle.rows);
      outcomeOverride = null;
      abandoned = false;
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
