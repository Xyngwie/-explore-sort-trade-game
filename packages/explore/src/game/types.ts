import type { Vec2 } from "./math";
import type { Balance } from "./balance";
import type { DensityThreat } from "./balance";

export type Stance = "patrol" | "escort" | "recover" | "raid";

export const STANCE_LABEL: Record<Stance, string> = {
  patrol: "哨戒",
  escort: "帯同",
  recover: "回収",
  raid: "遊撃",
};

/** Invade→explore sector handoff (parsed once on boot). */
export type InvadeSectorContext = {
  sectorX: number;
  sectorY: number;
  /** 0..1 provisional density from invade. */
  density: number;
  intelFlags: string[];
  /**
   * Combat handoff from invade minesweeper.
   * forced = mine step (cell + neighbors); raid = voluntary flagged cell.
   */
  engage?: "forced" | "raid";
  /** Enemy/mine cells pulled into the fight (world coords). */
  enemyCells?: Array<{ sx: number; sy: number }>;
  /** Optional neighbor count when enemyCells omitted (forced fallback). */
  neighborCount?: number;
};

export type Phase = "briefing" | "sortie" | "result";
/** extract_missed = captain outside boarding circle at lift-off. */
export type FailReason = "timeout" | "leader_down" | "extract_missed" | null;

export type UnitKind = "leader" | "wingman" | "enemy";

export type Unit = {
  id: string;
  kind: UnitKind;
  name: string;
  pos: Vec2;
  vel: Vec2;
  heading: number;
  hp: number;
  maxHp: number;
  radius: number;
  alive: boolean;
  stance: Stance;
  /** Patrol/recover focus. Raid never uses a player-picked point. */
  waypoint: Vec2 | null;
  moveTarget: Vec2 | null;
  cooldown: number;
  patrolAngle: number;
  salvageId: string | null;
  salvageT: number;
  salvagedCount: number;
  /**
   * Soft personal reference for cargo-speed curve only (not a hard carry cap).
   * Hard MAX carry was abolished — units may carry any count.
   */
  capacity: number;
  /** Bound owned-mech instance when I/O v2 ids present. */
  instanceId: string | null;
};

export type Container = {
  id: string;
  pos: Vec2;
  taken: boolean;
  /** True after any friendly unit has seen it. */
  discovered: boolean;
  /**
   * Remaining highlight seconds (death-drop / purge emphasis).
   * 0 = no special glow. Ticked down during sortie.
   */
  glowT: number;
};

export type Bullet = {
  alive: boolean;
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  damage: number;
  fromEnemy: boolean;
  ownerId: string;
};

export type LogLine = { t: number; text: string; kind: "tactical" | "battle" };

/** Active boarding circle while an extract request is in progress. */
export type BoardingState = {
  /** World position of circle center (= captain pos at request). */
  center: Vec2;
  radius: number;
  /** `world.elapsed` when the captain requested extract. */
  requestedAt: number;
  /** True after cargo delay elapsed (visual / log flag). */
  cargoArrived: boolean;
};

/** @deprecated Prefer boarding circle; kept for map label fallback when idle. */
export type ExtractPoint = { pos: Vec2; radius: number };

export type Camera = { x: number; y: number; w: number; h: number };

/** Temporary staging depot for stashed salvaged containers. */
export type CampState = {
  /** World position (= captain pos when set / last moved). */
  pos: Vec2;
  /** Containers deposited here (still counted in world.salvaged). */
  stashedCount: number;
};

export type World = {
  balance: Balance;
  phase: Phase;
  timeLeft: number;
  elapsed: number;
  maxOperationTimeSec: number;
  leader: Unit;
  wingmen: Unit[];
  enemies: Unit[];
  containers: Container[];
  /** Legacy fixed pad — not used for extract success; boarding supersedes. */
  extract: ExtractPoint;
  /** Active extract / boarding phase; null when idle. */
  boarding: BoardingState | null;
  /** Optional staging camp; null when unset. */
  camp: CampState | null;
  bullets: Bullet[];
  logs: LogLine[];
  salvaged: number;
  /**
   * Legacy expedition field (shared ExploreResult). Explore no longer enforces
   * this as a hard MAX — set high / informational for handoff only.
   */
  carrierCapacity: number;
  ammo: number;
  extracted: boolean;
  failReason: FailReason;
  note: string;
  deployedInstanceIds: string[];
  /** Durability at deploy time (from trade mechDurability); empty → assume max. */
  deployedDurability: Record<string, number>;
  /** Hub circuit durability buffer (wear absorb); from trade circuitBonuses. */
  circuitDurabilityBuffer: number;
  /** Hub circuit craft multiplier; forwarded explore→sort when > 1. */
  circuitCraftMultiplier: number;
  /** Invade sector when opened via invade→explore; null for direct / trade-only. */
  invadeSector: InvadeSectorContext | null;
  /** Resolved threat from density (or baseline). */
  densityThreat: DensityThreat;
  camera: Camera;
  /** Accumulated damage events for wear scaffold (flat returnKind still primary). */
  combatHitsTaken: number;
};

export type WingmanIntent = {
  moveTarget: Vec2 | null;
  fireAt: Unit | null;
  trySalvage: boolean;
};
