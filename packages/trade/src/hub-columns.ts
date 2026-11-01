/**
 * PC 2-column HUB（神宮決定 2026-11-01・FULLSCREEN_SHELL_V0 §15）.
 * Wide PC only: left = 母艦・小隊ツリー（ツリー・ハンガー・回路など）, right = 作戦室（出撃カード）・未開封・物資市場.
 * Pure DOM re-parenting of the rendered #app children; narrow screens keep the original single column.
 */
export const HUB_2COL_MIN_PX = 1200; // 1. 2 列にする画面幅 = 1200px 以上（神宮決定 2026-11-01）
export const HUB_2COL_MAX_PX = 1440; // 4. 全体の最大幅 = 1440px（神宮決定 2026-11-01）
export const HUB_2COL_RATIO = "3fr 2fr"; // 2. 列幅の比率 = 3:2（神宮決定 2026-11-01）
export const HUB_2COL_QUERY = `(min-width: ${HUB_2COL_MIN_PX}px)`;

export type HubColumnProbe = { id: string; classes: string[]; heading: string };

/** 3. 左右の振り分け = 右：作戦室・未開封・物資市場、他は左（神宮決定 2026-11-01） */
export function hubColumnFor(p: HubColumnProbe): "left" | "right" {
  if (p.id === "unopened-panel" || p.id === "four-resource-trade") return "right";
  if (p.classes.includes("sortie-card")) return "right"; // 作戦室
  if (p.heading === "型付き在庫") return "right"; // legacy market card before four-resource-trade-ui upgrades it
  return "left";
}

export const HUB_2COL_CSS = `@media ${HUB_2COL_QUERY}{
html.wl-hub-2col body{max-width:${HUB_2COL_MAX_PX}px!important}
html.wl-hub-2col #app{max-width:none}
#app>.hub-cols{display:grid;grid-template-columns:${HUB_2COL_RATIO};gap:16px;align-items:start}
#app>.hub-cols>div{min-width:0}
}`;

function probe(el: Element): HubColumnProbe {
  return { id: el.id, classes: Array.from(el.classList), heading: el.querySelector("h2")?.textContent?.trim() ?? "" };
}

export function arrangeHubColumns(root: HTMLElement, wide = matchMedia(HUB_2COL_QUERY).matches): void {
  const doc = root.ownerDocument;
  if (!doc.getElementById("wl-hub-2col-style")) {
    const st = doc.createElement("style"); st.id = "wl-hub-2col-style"; st.textContent = HUB_2COL_CSS; doc.head.appendChild(st);
  }
  const wrap = root.querySelector(":scope>.hub-cols");
  if (wrap) { // unwrap first (re-arranging keeps original order)
    const kids = Array.from(wrap.querySelectorAll<HTMLElement>(":scope>div>[data-hub-order]")).sort((a, b) => +a.dataset.hubOrder! - +b.dataset.hubOrder!);
    for (const k of kids) root.insertBefore(k, wrap);
    wrap.remove();
  }
  doc.documentElement.classList.toggle("wl-hub-2col", wide);
  if (!wide) return;
  const kids = Array.from(root.children) as HTMLElement[];
  const cols = doc.createElement("div"); cols.className = "hub-cols";
  const left = doc.createElement("div"); left.id = "hub-col-left";
  const right = doc.createElement("div"); right.id = "hub-col-right";
  cols.append(left, right);
  // Header (pill, h1, intro, notice) stays above both columns: everything before the tree.
  const treeAt = kids.findIndex((k) => k.id === "hub-tree" || k.id === "new-game-guide");
  kids.forEach((k, i) => {
    k.dataset.hubOrder = String(i);
    if (treeAt >= 0 && i < treeAt) return;
    // §16 7. PC 2列（1200px 以上）でのバナーの位置 = 2カラムの上に全幅（神宮決定 2026-11-01）
    if (k.id === "sortie-guard-guide") return;
    // Empty anchor spans (#hub-anchor-*) follow the card after them, so tree navigation's nextElementSibling still finds it.
    let t = k; while (t.tagName === "SPAN" && t.id.startsWith("hub-anchor-") && t.nextElementSibling) t = t.nextElementSibling as HTMLElement;
    (hubColumnFor(probe(t)) === "right" ? right : left).appendChild(k);
  });
  root.appendChild(cols);
  const banner = root.querySelector(":scope>#sortie-guard-guide"); if (banner) root.insertBefore(banner, cols);
}

let watching = false;
export function watchHubColumns(root: HTMLElement): void {
  if (watching || typeof matchMedia === "undefined") return;
  watching = true;
  matchMedia(HUB_2COL_QUERY).addEventListener("change", (e) => arrangeHubColumns(root, e.matches));
}
