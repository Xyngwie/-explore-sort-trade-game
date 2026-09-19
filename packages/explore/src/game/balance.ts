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
  /**
   * Invade→explore density (0..1) → sortie threat.
   * density=0 → min count / far spawn / slower enemies;
   * density=1 → max count / near spawn / faster enemies.
   * No sector handoff → baselineEnemyCount at default spawn ring.
   */
  densityEnemyCountMin: 3,
  densityEnemyCountMax: 8,
  /** Enemy count when no invade sector is present. */
  baselineEnemyCount: 5,
  /** Distance from player spawn at density=0 (farther = safer). */
  densitySpawnDistFar: 560,
  /** Distance from player spawn at density=1 (closer = hotter). */
  densitySpawnDistNear: 240,
  /** Spawn-ring distance when no invade sector. */
  baselineSpawnDist: 420,
  densityEnemySpeedMulMin: 0.9,
  densityEnemySpeedMulMax: 1.4,
} as const;

export type Balance = typeof BALANCE;

/** Clamp density to 0..1. */
export function clampDensity(density: number): number {
  if (!Number.isFinite(density)) return 0;
  return Math.min(1, Math.max(0, density));
}

export type DensityThreat = {
  enemyCount: number;
  /** World-units from player spawn for the enemy ring. */
  spawnDist: number;
  /** Multiplier applied to BALANCE.enemySpeed. */
  enemySpeedMul: number;
};

/**
 * Map invade sector density → enemy count, spawn distance, speed mul.
 * Pass `null` for the no-sector baseline (fixed demo threat).
 */
export function threatFromDensity(density: number | null): DensityThreat {
  if (density == null) {
    return {
      enemyCount: BALANCE.baselineEnemyCount,
      spawnDist: BALANCE.baselineSpawnDist,
      enemySpeedMul: 1,
    };
  }
  const t = clampDensity(density);
  const enemyCount = Math.round(
    BALANCE.densityEnemyCountMin +
      (BALANCE.densityEnemyCountMax - BALANCE.densityEnemyCountMin) * t,
  );
  const spawnDist =
    BALANCE.densitySpawnDistFar +
    (BALANCE.densitySpawnDistNear - BALANCE.densitySpawnDistFar) * t;
  const enemySpeedMul =
    BALANCE.densityEnemySpeedMulMin +
    (BALANCE.densityEnemySpeedMulMax - BALANCE.densityEnemySpeedMulMin) * t;
  return { enemyCount, spawnDist, enemySpeedMul };
}

/** Balance copy with density-scaled enemySpeed (vision/weapon unchanged). */
export function balanceForDensity(density: number | null): Balance {
  const threat = threatFromDensity(density);
  if (threat.enemySpeedMul === 1) return BALANCE;
  return {
    ...BALANCE,
    enemySpeed: BALANCE.enemySpeed * threat.enemySpeedMul,
  } as Balance;
}
