import type { Vec2 } from "./math";
import type { Balance } from "./balance";

export type Stance = "patrol" | "escort" | "recover" | "raid";

export const STANCE_LABEL: Record<Stance, string> = {
  patrol: "哨戒",
  escort: "帯同",
  recover: "回収",
  raid: "遊撃",
};

export type Phase = "briefing" | "sortie" | "result";
export type FailReason = "timeout" | "leader_down" | null;

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

export type ExtractPoint = { pos: Vec2; radius: number };

export type Camera = { x: number; y: number; w: number; h: number };

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
  extract: ExtractPoint;
  bullets: Bullet[];
  logs: LogLine[];
  salvaged: number;
  carrierCapacity: number;
  ammo: number;
  extracted: boolean;
  failReason: FailReason;
  note: string;
  deployedInstanceIds: string[];
  camera: Camera;
  /** Accumulated damage events for wear scaffold (flat returnKind still primary). */
  combatHitsTaken: number;
};

export type WingmanIntent = {
  moveTarget: Vec2 | null;
  fireAt: Unit | null;
  trySalvage: boolean;
};
