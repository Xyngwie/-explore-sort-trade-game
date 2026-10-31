/** PR4: HUB tree (母艦 → 第1小隊 / 予備格納庫 / 回路保管庫 / 物資市場). Display + in-page navigation only; never writes the save. */
import { hubVisibleCircuits, type HubSnapshot } from "@estg/shared";
export type HubTreeKey = "squad" | "reserve" | "circuits" | "market";
export type HubTreeNode = { key: HubTreeKey; label: string; count: string; target: string };
/** Provisional ★: scroll targets on the current DOCK (= Trade) page. 物資市場 = the Trade market card (Q12). */
export const HUB_TREE_TARGET: Record<HubTreeKey, string> = {
  squad: "hub-anchor-squad", reserve: "hub-anchor-reserve", circuits: "hub-anchor-circuits", market: "four-resource-trade",
};
export function hubTreeModel(hub: HubSnapshot, selectedIds: readonly string[]): HubTreeNode[] {
  const fleet = hub.fleet ?? [];
  const squad = fleet.filter((m) => selectedIds.includes(m.instanceId)).length;
  return [
    { key: "squad", label: "第1小隊", count: `${squad}機`, target: HUB_TREE_TARGET.squad },
    { key: "reserve", label: "予備格納庫", count: `${fleet.length - squad}機`, target: HUB_TREE_TARGET.reserve },
    { key: "circuits", label: "回路保管庫", count: `${hubVisibleCircuits(hub).length}枚`, target: HUB_TREE_TARGET.circuits },
    { key: "market", label: "物資市場", count: "", target: HUB_TREE_TARGET.market },
  ];
}
export function hubTreeHtml(nodes: HubTreeNode[]): string {
  return `<nav class="card hub-tree" id="hub-tree" aria-label="HUB">
  <div class="hub-tree-root">母艦（キャリア）</div>
  <ul>${nodes.map((n) => `<li><button type="button" class="hub-tree-node" data-hub-node="${n.key}" data-target="${n.target}"><span>${n.label}</span>${n.count ? `<span class="muted mono">${n.count}</span>` : ""}</button></li>`).join("")}</ul>
</nav>`;
}
/** Tap = scroll the panel to the section and flash it once (provisional ★). */
export function installHubTreeNav(doc: Document): void {
  doc.addEventListener("click", (e) => {
    const b = (e.target as Element | null)?.closest?.("[data-hub-node]") as HTMLElement | null;
    if (!b) return;
    const id = b.dataset.target!;
    const el = doc.getElementById(id) ?? (id === HUB_TREE_TARGET.market ? doc.getElementById("unopened-panel") : null);
    if (!el) return;
    const card = (el.classList.contains("card") ? el : el.nextElementSibling ?? el) as HTMLElement;
    card.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    card.classList.remove("hub-tree-flash"); void card.offsetWidth; card.classList.add("hub-tree-flash");
    doc.body.dataset.hubTreeLast = b.dataset.hubNode;
  });
}
