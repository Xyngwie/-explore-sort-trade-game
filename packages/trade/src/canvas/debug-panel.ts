/**
 * The debug area under the canvas (神宮決定 2026-11-06, docs/CANVAS_UNIFIED_V0.md §15).
 *
 * Every test-only tool that is not part of the game's own flow lives here, as
 * HTML, never on the canvas: the DOCK test buttons and デモ初期化, the play-log
 * panel (書き出し・新規ゲーム), the Alpha Lab band, the 探索 circuit-lock
 * toggle and SORT's test play. Only on a local dev server or with `?debug=1`.
 * Hidden until DOCK's 「検証用の欄へ」 opens it; 「▲ ゲームへ」 closes it again.
 */
export type DebugAction = { id: string; label: string; group?: string; run: () => void };

export type DebugPanelDeps = {
  doc: Document;
  /** DOCK test actions (null while DOCK is not the scene). */
  dockActions: () => DebugAction[] | null;
  /** Actions of the current scene (SORT test play, 探索 circuit lock…). */
  sceneActions: () => DebugAction[];
  /** Mount the existing Alpha Lab band (once) and return it. */
  alphaLab: () => HTMLElement | null;
  /** Ask the canvas to redraw after an action. */
  redraw: () => void;
};

export type DebugPanel = { open: () => void; close: () => void; refresh: () => void; readonly isOpen: boolean };

const CSS = `
#wl-debug{box-sizing:border-box;max-width:960px;margin:0 auto;padding:12px 12px calc(24px + env(safe-area-inset-bottom));background:#0d1117;color:#c9d1d9;font:14px/1.45 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
#wl-debug[hidden]{display:none}
#wl-debug h2{font-size:15px;margin:12px 0 6px}
#wl-debug .wl-dbg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #30363d;padding-bottom:8px}
#wl-debug .wl-dbg-row{display:flex;flex-wrap:wrap;gap:6px}
#wl-debug button{min-height:44px;padding:0 14px;border-radius:8px;border:1px solid #30363d;background:#21262d;color:#c9d1d9;font:600 14px system-ui,sans-serif}
#wl-debug button.danger{background:#da3633;border-color:#da3633;color:#fff}
#wl-debug .muted{color:#8b949e;font-size:12px}
html.wl-debug-open,html.wl-debug-open body{overflow-y:auto!important;height:auto!important}
`;

export function mountDebugPanel(deps: DebugPanelDeps): DebugPanel {
  const { doc } = deps;
  const style = doc.createElement("style");
  style.textContent = CSS;
  doc.head.append(style);
  const section = doc.createElement("section");
  section.id = "wl-debug";
  section.hidden = true;
  section.setAttribute("aria-label", "検証用の欄");
  doc.body.append(section);
  let open = false;

  const button = (id: string, label: string, run: () => void, cls = ""): HTMLButtonElement => {
    const b = doc.createElement("button");
    b.type = "button";
    b.id = id;
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener("click", () => { run(); deps.redraw(); refresh(); });
    return b;
  };
  const group = (title: string, items: HTMLElement[], note?: string): HTMLElement => {
    const box = doc.createElement("div");
    const h = doc.createElement("h2");
    h.textContent = title;
    const row = doc.createElement("div");
    row.className = "wl-dbg-row";
    row.append(...items);
    box.append(h, row);
    if (note) { const p = doc.createElement("p"); p.className = "muted"; p.textContent = note; box.append(p); }
    return box;
  };

  function refresh(): void {
    if (!open) return;
    const head = doc.createElement("div");
    head.className = "wl-dbg-head";
    const title = doc.createElement("strong");
    title.textContent = "検証用の欄（開発版・?debug=1）";
    head.append(title, button("wl-debug-close", "▲ ゲームへ", () => close()));
    const parts: HTMLElement[] = [head];
    const dock = deps.dockActions();
    if (dock) {
      const byGroup = new Map<string, DebugAction[]>();
      for (const a of dock) { const g = a.group ?? "DOCK"; byGroup.set(g, [...(byGroup.get(g) ?? []), a]); }
      for (const [g, acts] of byGroup) parts.push(group(g, acts.map((a) => button(`wl-debug-${a.id}`, a.label, a.run)), g === "DOCK" ? "シード・デモ操作は検証用データの付与・置換です。通常の新規ゲームの支給とは別です。" : undefined));
    }
    // デモ初期化: the play log takes #btn-reset clicks to its 新規ゲーム (confirm → new record), as on the existing DOCK.
    const reset = doc.createElement("button");
    reset.type = "button"; reset.id = "btn-reset"; reset.className = "danger"; reset.textContent = "デモ初期化";
    parts.push(group("初期化", [reset], "プレイ記録の「新規ゲーム」と同じです（確認のあと、セーブを新しい初期状態へ置き換えます）。"));
    const scene = deps.sceneActions();
    if (scene.length) parts.push(group("この画面", scene.map((a) => button(`wl-debug-${a.id}`, a.label, a.run))));
    // Existing HTML panels, moved in (not rebuilt): the play-log panel and the Alpha Lab band.
    const log = doc.getElementById("play-log-panel");
    const lab = deps.alphaLab();
    section.replaceChildren(...parts);
    if (log) { const h = doc.createElement("h2"); h.textContent = "プレイ記録"; section.append(h, log); }
    if (lab) { const h = doc.createElement("h2"); h.textContent = "Alpha Lab"; section.append(h, lab); }
  }
  function openPanel(): void {
    open = true;
    section.hidden = false;
    doc.documentElement.classList.add("wl-debug-open");
    refresh();
    section.scrollIntoView({ block: "start" });
  }
  function close(): void {
    open = false;
    doc.defaultView?.scrollTo(0, 0);
    section.hidden = true;
    doc.documentElement.classList.remove("wl-debug-open");
    deps.redraw();
  }
  return { open: openPanel, close, refresh, get isOpen() { return open; } };
}
