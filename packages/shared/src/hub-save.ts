/** Hub-only persistence (Module 3 / trade). Key: wreckline.hubSave.v1 */

export const HUB_SAVE_STORAGE_KEY = "wreckline.hubSave.v1";

export type MechId = "mech_gen1" | "mech_gen2" | string;
export type AmmoId = "ammo_standard" | "ammo_ap" | "ammo_hp" | string;

export type HubSnapshot = {
  credits: number;
  materials: number;
  fleet: MechId[];
  ammoLoad: Record<string, number>;
  importedMaterials: number;
  selectedMechId: MechId;
  selectedAmmoId: AmmoId;
};

export type HubSaveV1 = {
  v: 1;
  savedAt: string;
  hub: HubSnapshot;
};
