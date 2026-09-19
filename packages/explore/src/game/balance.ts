/** Single tuning table for the explore behavior slice. */
export const BALANCE = {
  worldW: 1400,
  worldH: 1000,
  moveSpeed: 120,
  wingmanSpeed: 115,
  enemySpeed: 70,
  visionRange: 220,
  weaponRange: 160,
  engageRange: 180,
  interactRadius: 28,
  salvageSeconds: 2.2,
  escortFollowDist: 52,
  escortSide: 36,
  patrolRadius: 90,
  patrolAngularSpeed: 0.85,
  unitRadius: 14,
  enemyRadius: 13,
  leaderHp: 100,
  wingmanHp: 80,
  enemyHp: 40,
  fireCooldown: 0.45,
  bulletSpeed: 320,
  bulletDamage: 12,
  enemyDamage: 8,
  carrierSlotsPerCraft: 2,
  defaultTimeSec: 180,
  maxBattleReports: 24,
  maxTacticalLog: 40,
  fogCell: 40,
  /** Boarding / extract circle radius (world units). */
  boardingRadius: 110,
  /** Seconds after extract request until cargo arrives. */
  boardingCargoDelaySec: 10,
  /** Seconds after extract request until lift-off / recovery. */
  boardingLiftOffDelaySec: 15,
} as const;

export type Balance = typeof BALANCE;
