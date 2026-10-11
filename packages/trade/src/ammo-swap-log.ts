/**
 * fix/circuit-ammo-activity-refill M4/M8: a circuit swap returns the mech's
 * ammo to the 「弾薬」 stock and loads it again up to the new cap. The move is
 * logged only (console), never shown as a ribbon or banner.
 */
import { ammoStock, mechAmmoCap, type HubSnapshot } from "@estg/shared";

export function ammoSwapLogLineJa(before: HubSnapshot, after: HubSnapshot): string {
  const parts: string[] = [];
  for (const m of after.fleet) {
    const was = before.fleet.find((x) => x.instanceId === m.instanceId)?.currentAmmo;
    const now = m.currentAmmo;
    if (was === now) continue;
    const cap = mechAmmoCap(after, m.instanceId);
    parts.push(`${m.instanceId} ${was ?? "—"}→${now ?? "—"}/${cap}${now != null && now < cap ? "（不足）" : ""}`);
  }
  if (parts.length === 0) return "";
  return `回路付け替え・弾薬積み直し：${parts.join("・")}（倉庫 ${ammoStock(before)}→${ammoStock(after)}）`;
}
