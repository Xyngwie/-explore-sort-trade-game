import {playLogNavigate} from '@estg/shared';
import { addContainersToQuery, isExploreHandoffQuery, readHubUnopenedContainers, spendHubContainers } from "./hub-container-core";

function installContainerButtons(): void {
  if (!isExploreHandoffQuery()) return;
  const actions = document.querySelector<HTMLElement>(".stage-overlay[aria-label='精製ブリーフィング'] .stage-actions");
  if (!actions || actions.querySelector("#btn-add-hub-container")) return;

  const remaining = readHubUnopenedContainers();
  if (remaining <= 0) return;

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.id = "btn-add-hub-container";
  addButton.className = "secondary";
  addButton.textContent = `＋1 未開封コンテナ（残り ${remaining}）`;
  addButton.title = "HUBの未開封コンテナを1個だけ今回の精製へ追加します";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.id = "btn-add-all-hub-containers";
  allButton.className = "secondary";
  allButton.textContent = `＋ALL（${remaining}個）`;
  allButton.title = "HUBに残っている未開封コンテナをすべて今回の精製へ追加します";

  const handleAdd = (count: number) => {
    addButton.disabled = true;
    allButton.disabled = true;
    const url=addContainersToQuery(count);
    if (!spendHubContainers(count,url)) {
      addButton.disabled = false;
      allButton.disabled = false;
      return;
    }
    playLogNavigate(url);
  };

  addButton.addEventListener("click", () => handleAdd(1));
  allButton.addEventListener("click", () => handleAdd(remaining));

  actions.appendChild(addButton);
  actions.appendChild(allButton);
}

const observer = new MutationObserver(installContainerButtons);
observer.observe(document.body, { childList: true, subtree: true });
installContainerButtons();
