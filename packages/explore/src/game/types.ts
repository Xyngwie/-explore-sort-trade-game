import type { Vec2 } from "./math";
import type { Balance } from "./balance";
import type { DensityThreat } from "./balance";
import type { CoverObject } from "./coverObjects";
import type { CommandUnlockState } from "./commandUnlock";
import type { LeftBehindEntry } from "./leftBehind";
import type { SortieLocation, StrandedMech } from "./lostMechs";
import type { StrandedCircuitDrop } from "./circuitDrops";

export type Stance = "patrol" | "escort" | "recover" | "raid";
export const STANCE_LABEL: Record<Stance, string> = { patrol: "哨戒", escort: "帯同", recover: "回収", raid: "遊撃" };
export type WingmanQuirk = "cling" | "decoy" | "sniper";
export const QUIRK_LABEL: Record<WingmanQuirk, string> = { cling: "密着", decoy: "囮", sniper: "遠射" };
export function quirkForWingmanIndex(index: number): WingmanQuirk { const cycle: WingmanQuirk[] = ["cling", "decoy", "sniper"]; return cycle[((index % cycle.length) + cycle.length) % cycle.length]!; }
export type InvadeSectorContext = { sectorX: number; sectorY: number; density: number; intelFlags: string[]; engage?: "forced" | "raid"; enemyCells?: Array<{ sx: number; sy: number }>; neighborCount?: number; };
export type Phase = "briefing" | "sortie" | "result";
export type FailReason = "timeout" | "leader_down" | "extract_missed" | null;
export type UnitKind = "leader" | "wingman" | "enemy";
export type Unit = {
  id: string; kind: UnitKind; name: string; pos: Vec2; vel: Vec2; heading: number; hp: number; maxHp: number; radius: number; alive: boolean; stance: Stance; waypoint: Vec2 | null; moveTarget: Vec2 | null; cooldown: number; patrolAngle: number; salvageId: string | null; salvageT: number; salvagedCount: number; capacity: number; instanceId: string | null;
  inCover: boolean; coverEscapeT?: number; coverId?: string | null; quirk: WingmanQuirk | null; hitWarnT: number; engageWarnT: number;
  /** C20-b: holding in place after an order it could not follow ("stop"); cleared by the next order. */ holdOrder?: boolean; /** C20-b: seconds left of the 「？」 above the wingman. */ questionT?: number;
};
export type Container = { id: string; pos: Vec2; taken: boolean; discovered: boolean; glowT: number; };
export type Bullet = { alive: boolean; pos: Vec2; vel: Vec2; ttl: number; damage: number; fromEnemy: boolean; ownerId: string; };
export type LogLine = { t: number; text: string; kind: "tactical" | "battle" };
export type BoardingState = { center: Vec2; radius: number; requestedAt: number; cargoArrived: boolean; };
export type ExtractPoint = { pos: Vec2; radius: number };
export type Camera = { x: number; y: number; w: number; h: number };
export type CampState = { pos: Vec2; stashedCount: number; };
export type World = { balance: Balance; phase: Phase; timeLeft: number; operationTimedOut: boolean; elapsed: number; maxOperationTimeSec: number; leader: Unit; wingmen: Unit[]; enemies: Unit[]; containers: Container[]; extract: ExtractPoint; boarding: BoardingState | null; camp: CampState | null; bullets: Bullet[]; logs: LogLine[]; salvaged: number; carrierCapacity: number; /** Shared HUB ammo stock; never consumed by firing. */ ammoStock: number; /** Canonical carried ammo keyed by deployed OwnedMech.instanceId. Unset at sortie → full (MECH_AMMO_BASE_CAPACITY; interim rule). */ currentAmmo: Record<string, number | undefined>; /** Canonical persistent battery keyed by deployed OwnedMech.instanceId. */ mechBattery: Record<string, { capacity: number; activity: number }>; /** All equipped circuit ids keyed by Explore unit id. */ circuitIdsByUnit: Record<string, string[]>; extracted: boolean; failReason: FailReason; note: string; deployedInstanceIds: string[]; deployedDurability: Record<string, number>; circuitDurabilityBuffer: number; circuitCraftMultiplier: number; invadeSector: InvadeSectorContext | null; densityThreat: DensityThreat; camera: Camera; combatHitsTaken: number; /** Random per sortie (startSortie); part of the return sortieId so two sorties never share one. */ sortieNonce?: string; coverObjects?: CoverObject[];
  /** Explore-local command unlock mode + equipped circuits (not a save/handoff contract). */
  commandUnlock: CommandUnlockState;
  /** Explore-local: wingmen left behind at lift-off (result-screen display only; not handoff/Hub output). */
  leftBehind?: LeftBehindEntry[];
  /** Place of this sortie on the Invade front (null: not via Invade → left-behind mechs are lost outright). */
  sortieLocation?: SortieLocation | null;
  /** HubSave lostMechs left on this front cell, waiting near the drop zone (recovered if inside the boarding circle at lift-off). */
  strandedMechs?: StrandedMech[];
  /** instanceIds of reappeared mechs recovered at lift-off this sortie. */
  recoveredLostMechIds?: string[];
  /** 項目5-1b: unit ids of this sortie's wrecks recovered at lift-off (inside the boarding circle). */
  recoveredWreckUnitIds?: string[];
  /** HubSave fieldDrops left on this front cell, waiting near the drop zone (recovered if inside the boarding circle at lift-off). */
  strandedDrops?: StrandedCircuitDrop[];
  /** dropIds of circuit drops recovered at lift-off this sortie. */
  recoveredDropIds?: string[];
  /** Owned circuitIds at deploy time (used to filter out circuits already owned from recovered result lines). */
  initialOwnedCircuitIds?: string[]; };
export type WingmanIntent = { moveTarget: Vec2 | null; fireAt: Unit | null; trySalvage: boolean; };
