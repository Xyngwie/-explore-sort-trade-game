import { ENGAGE_BRIEFING_LABEL } from "./balance";
import type { InvadeSectorContext } from "./types";

/**
 * Thin visible note for invade→explore payload (briefing + sortie HUD).
 * Spawn bias lives in threatFromInvadeSector — this is display-only.
 */
export function invadeIntelBannerText(
  sector: InvadeSectorContext | null | undefined,
): string | null {
  if (sector == null) return null;
  const parts: string[] = [
    `漁場 (${sector.sectorX},${sector.sectorY})`,
    `dens ${sector.density.toFixed(3)}`,
  ];
  if (sector.engage === "forced" || sector.engage === "raid") {
    parts.push(ENGAGE_BRIEFING_LABEL[sector.engage]);
  }
  if (sector.enemyCells != null && sector.enemyCells.length > 0) {
    parts.push(`敵セル ${sector.enemyCells.length}`);
  }
  if (sector.intelFlags.length > 0) {
    parts.push(sector.intelFlags.slice(0, 4).join(","));
  }
  return parts.join(" · ");
}
