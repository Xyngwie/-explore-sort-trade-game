/**
 * Single tuning table for the explore behavior slice.
 *
 * Primary playtest knobs (ISSUE-02 / run-20260924-002):
 * - moveSpeed / wingmanSpeed — captain & wingman base move
 * - cargoSpeedMulMin (+ cargoSpeedRefSlots) — payload slowdown floor
 *   (~45% speed at soft ref slots; aka payloadPenalty)
 * - visionRange / weaponRange / engageRange — detection & combat range
 * - defaultTimeSec — sortie clock (starting ammo lives in
 *   `@estg/shared` DEFAULT_EXPEDITION_LOADOUT.ammoStock; keep explore-local
 *   combat/move knobs here, not in trade/economy files)
 *
 * Prefer editing this file (or the re-export index `./constants.ts`) over
 * sprinkling literals in brain/sim/orders.
 */
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
  enemyHp: 100,
  fireCooldown: 1.0,
  bulletSpeed: 320,
  bulletDamage: 10,
  enemyDamage: 5,
  carrierSlotsPerCraft: 2,
  cargoSpeedRefSlots: 2,
  carrierCapacityUnlimited: 9999,
  defaultTimeSec: 180,
  maxBattleReports: 24,
  maxTacticalLog: 40,
  fogCell: 40,
  boardingRadius: 110,
  boardingCargoDelaySec: 10,
  boardingLiftOffDelaySec: 15,
  densityEnemyCountMin: 3,
  densityEnemyCountMax: 8,
  baselineEnemyCount: 5,
  densitySpawnDistFar: 560,
  densitySpawnDistNear: 240,
  baselineSpawnDist: 420,
  densityEnemySpeedMulMin: 0.9,
  densityEnemySpeedMulMax: 1.4,
  engageForcedEnemyCountMin: 4,
  engageForcedEnemyCountMax: 12,
  engageForcedSpawnDist: 220,
  engageForcedSpeedMul: 1.45,
  engageForcedHpMul: 1.35,
  engageRaidEnemyCountDefault: 2,
  engageRaidEnemyCountMax: 3,
  engageRaidSpawnDist: 320,
  engageRaidSpeedMul: 1.1,
  engageRaidHpMul: 1.0,
  scatterSearchDist: 280,
  cargoSpeedMulMin: 0.45,
  campAuraRadius: 70,
  campDamageTakenMul: 0.72,
  campLightSpeedMul: 1.08,
  deathDropGlowSec: 8,
  fieldContainerCount: 20,
  enemyDeathDropMax: 2,
  coverIncomingHitMul: 0.70,
  coverAccuracyMul: 1.10,
  quirkClingFollowMul: 0.62,
  quirkClingSideMul: 0.55,
  quirkDecoyEngageMul: 1.35,
  quirkDecoyRushFrac: 0.22,
  quirkSniperStandFrac: 0.88,
  quirkSniperEngageMul: 1.15,
  wingHitWarnSec: 1.6,
  wingEngageWarnSec: 1.2,

  // --- brain / sim fractions formerly inline (refactor-only; values unchanged) ---
  visionHuntMul: 1.25,
  visionRaidHuntMul: 1.5,
  /** Enemy chase trigger. Keep slightly above weaponRange so ranged enemies stop just outside firing range, then fire from stand-off. */
  enemyChaseVisionMul: 0.76,
  patrolLeashMul: 1.8,
  recoverChannelFireMul: 0.7,
  recoverSeekFireMul: 0.65,
  waypointArriveDist: 24,
  raidDefaultRushFrac: 0.4,
  quirkClingRushBias: 0.85,
  raidEngageFireMul: 1.35,
  raidLoiterCling: 42,
  raidLoiterDefault: 70,
  raidLoiterDecoy: 95,
  raidLoiterAngularMul: 0.6,
  patrolWobbleAmp: 10,
  patrolWobbleFreq: 2.1,
  wasdMoveLookahead: 40,
  bulletHitPadding: 4,
  bulletTtlSec: 1.2,
  cameraLeadXFrac: 0.4,
  cameraLeadYFrac: 0.5,
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
  /** Multiplier applied to BALANCE.enemyHp (engage forced bumps this). */
  enemyHpMul: number;
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
      enemyHpMul: 1,
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
  return { enemyCount, spawnDist, enemySpeedMul, enemyHpMul: 1 };
}

/** Engage mode labels for briefing (invade → explore combat handoff). */
export const ENGAGE_BRIEFING_LABEL = {
  forced: "強制交戦・周囲引き込み",
  raid: "任意侵入",
} as const;

export type EngageThreatInput = {
  /** Sector density 0..1; null when no sector (should not happen with engage). */
  density: number | null;
  engage: "forced" | "raid";
  /** Mine / flagged cells from invade; count drives spawn size when present. */
  enemyCells?: readonly { sx: number; sy: number }[];
  /**
   * Optional neighbor count when enemyCells omitted (forced fallback).
   * Explore accepts this for forward-compat with invade payloads.
   */
  neighborCount?: number;
};

/**
 * Map invade engage handoff → sortie threat.
 * - forced: harder / more enemies (mine cell + neighbors via enemyCells count,
 *   or density + neighborCount when cells absent).
 * - raid: fewer focused enemies for a single flagged cell.
 */
export function threatFromEngage(input: EngageThreatInput): DensityThreat {
  const base = threatFromDensity(input.density);
  const cellCount = input.enemyCells?.length ?? 0;
  const neighborCount =
    input.neighborCount != null && Number.isFinite(input.neighborCount)
      ? Math.max(0, Math.floor(input.neighborCount))
      : null;

  if (input.engage === "forced") {
    let enemyCount: number;
    if (cellCount > 0) {
      enemyCount = cellCount;
    } else if (neighborCount != null) {
      // focus cell + neighbors
      enemyCount = 1 + neighborCount;
    } else {
      // density floor + pull-in bias
      enemyCount = base.enemyCount + 2;
    }
    enemyCount = Math.min(
      BALANCE.engageForcedEnemyCountMax,
      Math.max(BALANCE.engageForcedEnemyCountMin, enemyCount),
    );
    return {
      enemyCount,
      spawnDist: Math.min(base.spawnDist, BALANCE.engageForcedSpawnDist),
      enemySpeedMul: Math.max(base.enemySpeedMul, BALANCE.engageForcedSpeedMul),
      enemyHpMul: BALANCE.engageForcedHpMul,
    };
  }

  // raid / voluntary
  let enemyCount: number;
  if (cellCount > 0) {
    enemyCount = cellCount;
  } else {
    enemyCount = BALANCE.engageRaidEnemyCountDefault;
  }
  enemyCount = Math.min(
    BALANCE.engageRaidEnemyCountMax,
    Math.max(1, enemyCount),
  );
  return {
    enemyCount,
    spawnDist: BALANCE.engageRaidSpawnDist,
    enemySpeedMul: BALANCE.engageRaidSpeedMul,
    enemyHpMul: BALANCE.engageRaidHpMul,
  };
}

/** Resolve threat from optional engage + density (engage wins when present). */
export function threatFromInvadeSector(opts: {
  density: number | null;
  engage?: "forced" | "raid" | null;
  enemyCells?: readonly { sx: number; sy: number }[];
  neighborCount?: number;
}): DensityThreat {
  if (opts.engage === "forced" || opts.engage === "raid") {
    return threatFromEngage({
      density: opts.density,
      engage: opts.engage,
      enemyCells: opts.enemyCells,
      neighborCount: opts.neighborCount,
    });
  }
  return threatFromDensity(opts.density);
}

/** Balance copy with density/engage-scaled enemySpeed (vision/weapon unchanged). */
export function balanceForThreat(threat: DensityThreat): Balance {
  if (threat.enemySpeedMul === 1) return BALANCE;
  return {
    ...BALANCE,
    enemySpeed: BALANCE.enemySpeed * threat.enemySpeedMul,
  } as Balance;
}

/** @deprecated Prefer balanceForThreat; kept for density-only call sites. */
export function balanceForDensity(density: number | null): Balance {
  return balanceForThreat(threatFromDensity(density));
}
