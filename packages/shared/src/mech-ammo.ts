/**
 * Per-mech carried ammo vs. the shared 「弾薬」 stock (`inventory.ammo`,
 * 1 unit = 1 round). 神宮 10/12 07:32 decisions (fix: circuit ammo / activity):
 *
 * - Hangar cap = MECH_AMMO_BASE_CAPACITY (28) × the mech's gun circuit
 *   (MMR ÷5, LMG ×2, …). The release ×0.5 is a sortie-only scale (P3).
 * - Equip / swap / unequip (also selling an equipped circuit, the starter
 *   false 1×1 and equip-integrity moves; destroyed mechs too): return that
 *   mech's ammo to the stock, then load from the stock up to the new cap,
 *   every time (M5). Short → load what there is (M2).
 * - Return and before a sortie: top up to the cap from the stock (M3).
 * - Ammo is never discarded: anything above a mech's cap goes to the stock.
 * - Legacy `currentAmmo` undefined = full at its cap (the interim rule of
 *   HUB_SAVE_CONTRACT §12.7, materialised when the save is normalised).
 * - M6: once per save (`ammoBatteryRepaired`), battery caps over 300 go back
 *   to 300 and ammo below the cap is topped up as a grant (not from stock).
 * - `ammoLoad` (old typed ammo) is not touched.
 */
import { GUN_EFFECT_ORDER, classifyCircuit } from "./circuit-actions";
import type { HubCircuitRecord } from "./hub-save";
import { MECH_AMMO_BASE_CAPACITY, MECH_BATTERY_DEFAULT_CAPACITY, type OwnedMech } from "./mech-fleet";
import type { YieldBag } from "./sort-yield";

/** Largest per-mech cap any circuit can give (LMG ×2). Transport clamps use this. */
export const MECH_AMMO_MAX_CAPACITY = MECH_AMMO_BASE_CAPACITY * 2;

export type AmmoShortRow = { instanceId: string; have: number; cap: number };

type AmmoHub = {
  fleet: OwnedMech[];
  circuits: HubCircuitRecord[];
  inventory: YieldBag;
};

/** Gun multiplier of the mech's equipped circuits (same pick as Explore `modsFor`). */
export function mechAmmoCapMul(circuits: readonly HubCircuitRecord[], instanceId: string): number {
  const mine = circuits.filter((c) => c.equippedTo === instanceId).map(classifyCircuit);
  for (const key of GUN_EFFECT_ORDER) {
    if (!mine.some((c) => !c.trueBoard && c.effectKey === key && c.effect > 0)) continue;
    if (key === "mmr") return 1 / 5;
    if (key === "lmg") return 2;
    return 1;
  }
  return 1;
}

/** Hangar ammo cap of one mech (no release ×0.5). */
export function mechAmmoCap(hub: Pick<AmmoHub, "circuits">, instanceId: string): number {
  return Math.max(1, Math.round(MECH_AMMO_BASE_CAPACITY * mechAmmoCapMul(hub.circuits, instanceId)));
}

export function ammoStock(hub: Pick<AmmoHub, "inventory">): number {
  return Math.max(0, Math.floor(Number(hub.inventory?.ammo ?? 0) || 0));
}

function withStock<H extends AmmoHub>(hub: H, stock: number): H {
  const inventory: YieldBag = { ...(hub.inventory ?? {}) };
  if (stock > 0) inventory.ammo = stock;
  else delete inventory.ammo;
  return { ...hub, inventory };
}

function setAmmo<H extends AmmoHub>(hub: H, instanceId: string, ammo: number): H {
  return { ...hub, fleet: hub.fleet.map((m) => (m.instanceId === instanceId ? { ...m, currentAmmo: ammo } : m)) };
}

function carried(m: OwnedMech, cap: number): number {
  return m.currentAmmo == null ? cap : Math.max(0, Math.floor(m.currentAmmo));
}

/** M5: return the mech's ammo to the stock and load up to its (new) cap. */
export function reloadMechAmmo<H extends AmmoHub>(hub: H, instanceId: string): { hub: H; row: AmmoShortRow | null; moved: number } {
  const m = hub.fleet.find((x) => x.instanceId === instanceId);
  if (!m) return { hub, row: null, moved: 0 };
  const cap = mechAmmoCap(hub, instanceId);
  const before = carried(m, cap);
  let stock = ammoStock(hub) + before;
  const load = Math.min(cap, stock);
  stock -= load;
  const next = setAmmo(withStock(hub, stock), instanceId, load);
  return { hub: next, row: { instanceId, have: load, cap }, moved: load - before };
}

/** M3: top up to the cap from the stock (anything over the cap goes to the stock). */
export function refillMechAmmo<H extends AmmoHub>(hub: H, instanceId: string): { hub: H; row: AmmoShortRow | null } {
  const m = hub.fleet.find((x) => x.instanceId === instanceId);
  if (!m) return { hub, row: null };
  const cap = mechAmmoCap(hub, instanceId);
  let have = carried(m, cap);
  let stock = ammoStock(hub);
  if (have > cap) { stock += have - cap; have = cap; }
  const take = Math.min(cap - have, stock);
  have += take;
  stock -= take;
  return { hub: setAmmo(withStock(hub, stock), instanceId, have), row: { instanceId, have, cap } };
}

/** M3 for several mechs (default: every mech that is not destroyed), in fleet order. */
export function refillFleetAmmo<H extends AmmoHub>(hub: H, ids?: readonly string[]): { hub: H; short: AmmoShortRow[] } {
  let next = hub;
  const short: AmmoShortRow[] = [];
  const order = ids ? ids : hub.fleet.filter((m) => m.status !== "destroyed").map((m) => m.instanceId);
  for (const id of order) {
    const r = refillMechAmmo(next, id);
    next = r.hub;
    if (r.row && r.row.have < r.row.cap) short.push(r.row);
  }
  return { hub: next, short };
}

/** Read-only: who would still be short after a top-up (sortie-button line). */
export function previewAmmoShort(hub: AmmoHub, ids: readonly string[]): AmmoShortRow[] {
  return refillFleetAmmo(hub, ids).short;
}

/**
 * Normalise-time ammo rules: undefined → full at the cap (interim rule),
 * anything above the cap → stock, mechs whose equipped set changed in
 * equip-integrity → reload (M5), and the one-time M6 repair.
 */
export function applyHubAmmoRules<H extends AmmoHub & { lostMechs?: { battery: { capacity: number; activity: number } }[]; ammoBatteryRepaired?: boolean }>(
  hub: H,
  opts: { reloadIds?: readonly string[] } = {},
): H {
  let next = hub;
  const repair = next.ammoBatteryRepaired !== true;
  for (const m of next.fleet) {
    const cap = mechAmmoCap(next, m.instanceId);
    const cur = m.currentAmmo;
    if (cur == null || (repair && cur < cap)) next = setAmmo(next, m.instanceId, cap); // grant
    else if (cur > cap) {
      next = setAmmo(withStock(next, ammoStock(next) + (cur - cap)), m.instanceId, cap);
    }
  }
  for (const id of opts.reloadIds ?? []) next = reloadMechAmmo(next, id).hub;
  if (repair) {
    const fix = (b: { capacity: number; activity: number }) =>
      b.capacity > MECH_BATTERY_DEFAULT_CAPACITY
        ? { capacity: MECH_BATTERY_DEFAULT_CAPACITY, activity: Math.min(b.activity, MECH_BATTERY_DEFAULT_CAPACITY) }
        : b;
    next = {
      ...next,
      fleet: next.fleet.map((m) => ({ ...m, battery: fix(m.battery) })),
      ...(next.lostMechs ? { lostMechs: next.lostMechs.map((l) => ({ ...l, battery: fix(l.battery) })) } : {}),
      ammoBatteryRepaired: true,
    };
  }
  return next;
}

/** Squad label by deploy order (Explore names: 隊長 / 僚機A / 僚機B / 僚機4…). */
export function squadLabelJa(deployIds: readonly string[], instanceId: string): string {
  const i = deployIds.indexOf(instanceId);
  if (i === 0) return "隊長";
  if (i === 1) return "僚機A";
  if (i === 2) return "僚機B";
  if (i > 2) return `僚機${i}`;
  return instanceId;
}

/** M8 one-line shortage notice, e.g. 「弾薬が足りません：僚機A 12/28」 ("" when nobody is short). */
export function ammoShortLineJa(rows: readonly AmmoShortRow[], deployIds: readonly string[]): string {
  const short = rows.filter((r) => r.have < r.cap);
  if (short.length === 0) return "";
  return `弾薬が足りません：${short.map((r) => `${squadLabelJa(deployIds, r.instanceId)} ${r.have}/${r.cap}`).join("・")}`;
}
