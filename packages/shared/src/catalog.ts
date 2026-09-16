/** Catalog IDs shared with BASE HUB (trade). Keep in sync with hub catalogs. */

export const MECH_IDS = ["mech_gen1", "mech_gen2"] as const;
export type MechId = (typeof MECH_IDS)[number];

export const AMMO_IDS = ["ammo_standard", "ammo_ap", "ammo_hp"] as const;
export type AmmoId = (typeof AMMO_IDS)[number];

export type AmmoLoad = Record<AmmoId, number>;

export const INITIAL_AMMO_LOAD: AmmoLoad = {
  ammo_standard: 20,
  ammo_ap: 0,
  ammo_hp: 0,
};

export function isMechId(value: string): value is MechId {
  return (MECH_IDS as readonly string[]).includes(value);
}

export function isAmmoId(value: string): value is AmmoId {
  return (AMMO_IDS as readonly string[]).includes(value);
}

export function emptyAmmoLoad(): AmmoLoad {
  return { ammo_standard: 0, ammo_ap: 0, ammo_hp: 0 };
}

export function ammoTotal(load: AmmoLoad): number {
  return AMMO_IDS.reduce((sum, id) => sum + (load[id] ?? 0), 0);
}
