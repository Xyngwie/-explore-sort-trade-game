import {DEBUG_FIXTURE_ACTIVE,loadHubSaveFromLocalStorage, saveHubSaveToLocalStorage, firstSortieError, firstSortieCircuit} from "@estg/shared";
import { restoreFieldAtSortieStart } from "./fieldPersistence";
import { makeEnemyIdentity } from "./enemyIdentity";
import {
  DEFAULT_EXPEDITION_LOADOUT,
  rankEnemyMultiplier,
  exploreUnitId,
  parseInvadeToExploreSearch,
  parseTradeToExploreSearch,
  wingmanCountFromMechs,
  MECH_AMMO_BASE_CAPACITY,
  type MechBatteryState,
} from "@estg/shared";
import {
  BALANCE,
  balanceForThreat,
  ENGAGE_BRIEFING_LABEL,
  threatFromInvadeSector,
  type Balance,
  type DensityThreat,
} from "./balance";
import { playableFieldRect, type FieldRect } from "./fieldBounds";
import { revealOpenedBoardFog } from "./vision";
import {
  boardFromLayout,
  boardFromProgress,
  entryPointOf,
  hashUnit,
  wideSpots,
  type WideLayout,
} from "./wideField";
import type { Container, InvadeSectorContext, Unit, World } from "./types";
import { quirkForWingmanIndex } from "./types";
import { vec, type Vec2 } from "./math";
import { defaultCommandUnlockState } from "./commandUnlock";
import { buildEquippedByUnit, type EquippedByUnit } from "./circuitJudgement";
import { resolveCommandUnlockMode } from "./unlockMode";

function makeUnit(
  partial: Pick<Unit, "id" | "kind" | "name" | "pos" | "hp" | "maxHp" | "radius" | "alive"> &
    Partial<Pick<Unit, "stance" | "waypoint" | "capacity" | "instanceId" | "inCover" | "quirk">>,
): Unit {
  return {
    vel: vec(0, 0),
    heading: 0,
    cooldown: 0,
    patrolAngle: Math.random() * Math.PI * 2,
    salvageId: null,
    salvageT: 0,
    salvagedCount: 0,
    moveTarget: null,
    waypoint: null,
    stance: partial.stance ?? "escort",
    capacity: partial.capacity ?? BALANCE.carrierSlotsPerCraft,
    instanceId: partial.instanceId ?? null,
    inCover: partial.inCover ?? false,
    quirk: partial.quirk ?? null,
    hitWarnT: 0,
    engageWarnT: 0,
    id: partial.id,
    kind: partial.kind,
    name: partial.name,
    pos: partial.pos,
    hp: partial.hp,
    maxHp: partial.maxHp,
    radius: partial.radius,
    alive: partial.alive,
  };
}

/** Positions stay on the seed. Ids change per placement so a saved wreck does not collide with the next sortie. */
let placementSerial = 0;

function rngFromHash(seed: number, sx: number, sy: number, index: number): () => number {
  let n = 0;
  return () => {
    n += 1;
    return hashUnit(seed, sx, sy, 100 + index * 20 + n);
  };
}

function placeWideContents(
  layout: WideLayout,
  threat: DensityThreat,
  neighborCount: number,
  rank: number,
): { enemies: Unit[]; containers: Container[] } {
  const board = boardFromLayout(layout);
  const spots = wideSpots(board, layout.seed);
  // Hull HP stays the rank multiplier only, as placeEnemies did. Density and
  // engage still set world.balance.enemySpeed. Count is the board, not threat.enemyCount.
  void threat;
  const enemies: Unit[] = [];
  const containers: Container[] = [];
  let enemyOrdinal = 0;
  for (const spot of spots) {
    if (spot.kind === "enemy") {
      const hp = BALANCE.enemyHp * rankEnemyMultiplier(rank);
      const id = `enemy-${spot.sx}-${spot.sy}-${spot.index}-${placementSerial++}`;
      const enemy = makeUnit({
        id,
        kind: "enemy",
        name: `敵${enemyOrdinal + 1}`,
        pos: { x: spot.x, y: spot.y },
        hp,
        maxHp: hp,
        radius: BALANCE.enemyRadius,
        alive: true,
        stance: "raid",
        capacity: 0,
      });
      enemy.homeCell = { sx: spot.sx, sy: spot.sy };
      enemy.enemyIdentity = makeEnemyIdentity(enemy, rngFromHash(layout.seed, spot.sx, spot.sy, spot.index), neighborCount);
      enemies.push(enemy);
      enemyOrdinal += 1;
      continue;
    }
    const prefix = spot.kind === "mine-container" ? "crate-m" : "crate-s";
    containers.push({
      id: `${prefix}-${spot.sx}-${spot.sy}`,
      pos: { x: spot.x, y: spot.y },
      taken: false,
      discovered: false,
      glowT: 0,
    });
  }
  return { enemies, containers };
}

export type SortieBootstrap = {
  wingmanCount: number;
  ammoStock: number;
  maxOperationTimeSec: number;
  note: string;
  deployedInstanceIds: string[];
  deployedDurability: Record<string, number>;
  /** Hub circuit wear buffer from circuitBonuses query. */
  circuitDurabilityBuffer: number;
  /** Hub circuit craft multiplier from circuitBonuses (default 1). */
  circuitCraftMultiplier: number;
  /** Canonical carried ammo snapshot grouped by OwnedMech.instanceId. */
  mechCurrentAmmo: Array<{ instanceId: string; currentAmmo: number }>;
  /** Canonical persistent battery snapshot keyed by deployed instanceId. */
  mechBattery: Record<string, MechBatteryState>;
  /** All equipped circuit ids grouped by Explore unit id for return-state capture. */
  circuitIdsByUnit: Record<string, string[]>;
  /** Active circuit ids grouped by Explore unit id. */
  equippedByUnit: EquippedByUnit;
  /** Parsed invade→explore sector; null when keys absent. */
  invadeSector: InvadeSectorContext | null;
};

export function bootstrapFromSearch(search: string): SortieBootstrap {
  const inbound = parseTradeToExploreSearch(search);
  const sectorIn = parseInvadeToExploreSearch(search);
  const invadeSector: InvadeSectorContext | null =
    sectorIn != null
      ? {
          sectorX: sectorIn.sectorX,
          sectorY: sectorIn.sectorY,
          density: sectorIn.density,
          invadeRank: sectorIn.invadeRank ?? 0,
          ...(sectorIn.neighborCount != null ? {neighborCount: sectorIn.neighborCount} : {}),
          intelFlags: sectorIn.intelFlags ? [...sectorIn.intelFlags] : [],
          ...(sectorIn.engage != null ? { engage: sectorIn.engage } : {}),
          ...(sectorIn.enemyCells != null && sectorIn.enemyCells.length > 0
            ? {
                enemyCells: sectorIn.enemyCells.map((c) => ({
                  sx: c.sx,
                  sy: c.sy,
                })),
              }
            : {}),
        }
      : null;

  const deployedInstanceIds = inbound?.deployedInstanceIds
    ? [...inbound.deployedInstanceIds]
    : [];
  const deployedDurability: Record<string, number> = {};
  if (inbound?.deployedDurability) {
    for (const row of inbound.deployedDurability) {
      deployedDurability[row.instanceId] = row.durability;
    }
  }
  const mechBattery: Record<string, MechBatteryState> = {};
  for (const row of inbound?.mechBattery ?? []) {
    mechBattery[row.instanceId] = { ...row.battery };
  }
  const circuitIdsByUnit: Record<string, string[]> = {};
  const unitIds = deployedInstanceIds.map((_, i) => exploreUnitId(i));
  for (let i = 0; i < Math.min(unitIds.length, deployedInstanceIds.length); i += 1) {
    const entries = inbound?.mechCircuits?.[deployedInstanceIds[i]!] ?? [];
    const ids = [...new Set(entries.map((entry) => entry.circuitId.trim()).filter(Boolean))];
    if (ids.length > 0) circuitIdsByUnit[unitIds[i]!] = ids;
  }
  const craftFromIds = deployedInstanceIds.length;
  const wingmanCount =
    craftFromIds > 0
      ? wingmanCountFromMechs(craftFromIds)
      : inbound?.deployableMechs != null
        ? wingmanCountFromMechs(inbound.deployableMechs)
        : 2;
  const ammoStock =
    inbound?.startingAmmo != null
      ? inbound.startingAmmo
      : DEFAULT_EXPEDITION_LOADOUT.ammoStock;
  const craft = 1 + wingmanCount;

  let note: string;
  if (inbound != null) {
    note =
      deployedInstanceIds.length > 0
        ? `HUB v2 · 健在 ${craft} 機 · ids ${deployedInstanceIds.join(",")} · 実弾 ${ammoStock}`
        : `HUB 受取 · 配備 ${craft} 機（僚機 ${wingmanCount}） · 実弾 ${ammoStock}`;
  } else {
    note = "デモ編成 · 僚機 2 · 既定実弾";
  }
  const circuitDurabilityBuffer = Math.max(
    0,
    Math.floor(inbound?.circuitBonuses?.durabilityBuffer ?? 0),
  );
  const rawCraft = inbound?.circuitBonuses?.craftMultiplier;
  const circuitCraftMultiplier =
    rawCraft != null && Number.isFinite(rawCraft) && rawCraft > 0
      ? rawCraft
      : 1;
  if (invadeSector != null) {
    const flags =
      invadeSector.intelFlags.length > 0
        ? ` · intel ${invadeSector.intelFlags.join(",")}`
        : "";
    const engageLabel =
      invadeSector.engage === "forced" || invadeSector.engage === "raid"
        ? ` · ${ENGAGE_BRIEFING_LABEL[invadeSector.engage]}`
        : "";
    const cellN =
      invadeSector.enemyCells != null && invadeSector.enemyCells.length > 0
        ? ` · cells ${invadeSector.enemyCells.length}`
        : "";
    note += ` · 戦線 (${invadeSector.sectorX},${invadeSector.sectorY}) dens=${invadeSector.density.toFixed(3)}${engageLabel}${cellN}${flags}`;
  }
  if (circuitDurabilityBuffer > 0) {
    note += ` · 回路緩衝 ${circuitDurabilityBuffer}`;
  }
  if (circuitCraftMultiplier > 1) {
    note += ` · craft×${circuitCraftMultiplier.toFixed(2)}`;
  }

  return {
    wingmanCount,
    ammoStock,
    maxOperationTimeSec: DEFAULT_EXPEDITION_LOADOUT.maxOperationTimeSec,
    note,
    deployedInstanceIds,
    deployedDurability,
    mechCurrentAmmo: inbound?.mechCurrentAmmo ? inbound.mechCurrentAmmo.map((row) => ({ instanceId: row.instanceId, currentAmmo: row.currentAmmo })) : [],
    mechBattery,
    circuitIdsByUnit,
    equippedByUnit: buildEquippedByUnit(deployedInstanceIds, inbound?.mechCircuits),
    circuitDurabilityBuffer,
    circuitCraftMultiplier,
    invadeSector,
  };
}

/** Wingmen sit evenly on a ring around the spawn (8 per ring, then an outer ring). */
export function wingmanRingPos(spawn: Vec2, i: number, n: number): Vec2 {
  const ring = Math.floor(i / 8), inRing = Math.min(8, n - ring * 8), k = i % 8;
  const a = -Math.PI / 2 + (Math.PI * 2 * (k + 0.5)) / Math.max(1, inRing);
  const r = 50 + ring * 35;
  return { x: spawn.x + Math.cos(a) * r, y: spawn.y + Math.sin(a) * r };
}

/**
 * Stage 3 ignores worldW/worldH. Every sortie is the playable board
 * (decision 18). frontProgress selects the mine layout and which cells
 * are already known safe. Omitted progress uses the campaign seed.
 */
export type CreateWorldOptions = {
  worldW?: number;
  worldH?: number;
  frontProgress?: import("@estg/shared").InvadeFrontProgress | null;
};

/** Initial 720×420 view centred on the entry, kept inside the playable field. */
function cameraAtSpawn(spawn: Vec2, rect: FieldRect): { x: number; y: number; w: number; h: number } {
  const w = 720;
  const h = 420;
  return {
    x: Math.min(Math.max(rect.minX, spawn.x - w / 2), Math.max(rect.minX, rect.maxX - w)),
    y: Math.min(Math.max(rect.minY, spawn.y - h / 2), Math.max(rect.minY, rect.maxY - h)),
    w,
    h,
  };
}

export function createWorld(boot: SortieBootstrap, options?: CreateWorldOptions): World {
  const rect = playableFieldRect();
  const worldW = rect.maxX - rect.minX;
  const worldH = rect.maxY - rect.minY;
  const at = entryPointOf(boot.invadeSector);
  const spawn = vec(at.x, at.y);
  const laid = boardFromProgress(options?.frontProgress);
  const density = boot.invadeSector?.density ?? null;
  const threat = threatFromInvadeSector({
    density,
    engage: boot.invadeSector?.engage ?? null,
    enemyCells: boot.invadeSector?.enemyCells,
    neighborCount: boot.invadeSector?.neighborCount,
  });
  const baseBalance = balanceForThreat(threat);
  const balance: Balance = {
    ...baseBalance,
    enemyDamage: baseBalance.enemyDamage * rankEnemyMultiplier(boot.invadeSector?.invadeRank ?? 0),
    worldW,
    worldH,
    minX: rect.minX,
    maxX: rect.maxX,
    minY: rect.minY,
    maxY: rect.maxY,
  };
  const placed = placeWideContents(
    laid.layout,
    threat,
    boot.invadeSector?.neighborCount ?? 0,
    boot.invadeSector?.invadeRank ?? 0,
  );

  const leaderId = boot.deployedInstanceIds[0] ?? null;
  const leader = makeUnit({
    id: "leader",
    kind: "leader",
    name: "隊長",
    pos: { ...spawn },
    hp: BALANCE.leaderHp,
    maxHp: BALANCE.leaderHp,
    radius: BALANCE.unitRadius,
    alive: true,
    instanceId: leaderId,
  });

  const wingmen: Unit[] = [];
  for (let i = 0; i < boot.wingmanCount; i++) {
    const instanceId = boot.deployedInstanceIds[i + 1] ?? null;
    wingmen.push(
      makeUnit({
        id: exploreUnitId(i + 1),
        kind: "wingman",
        name: i === 0 ? "僚機A" : i === 1 ? "僚機B" : `僚機${i + 1}`,
        pos: wingmanRingPos(spawn, i, boot.wingmanCount),
        hp: BALANCE.wingmanHp,
        maxHp: BALANCE.wingmanHp,
        radius: BALANCE.unitRadius,
        alive: true,
        stance: "escort",
        instanceId,
        quirk: quirkForWingmanIndex(i),
      }),
    );
  }

  const craft = 1 + boot.wingmanCount;
  // Soft personal speed ref still uses carrierSlotsPerCraft per craft;
  // hard MAX carry abolished — handoff field stays informational / large.
  void craft;
  const carrierCapacity = BALANCE.carrierCapacityUnlimited;

  const world: World = {
    balance,
    phase: "briefing",
    timeLeft: boot.maxOperationTimeSec,
    operationTimedOut: false,
    elapsed: 0,
    maxOperationTimeSec: boot.maxOperationTimeSec,
    leader,
    wingmen,
    enemies: placed.enemies,
    containers: placed.containers,
    extract: { pos: vec(spawn.x, spawn.y), radius: 48 },
    boarding: null,
    camp: null,
    bullets: [],
    logs: [],
    salvaged: 0,
    carrierCapacity,
    ammoStock: boot.ammoStock,
    mechBattery: { ...boot.mechBattery },
    circuitIdsByUnit: Object.fromEntries(
      Object.entries(boot.circuitIdsByUnit).map(([unitId, ids]) => [unitId, [...ids]]),
    ),
    currentAmmo: Object.fromEntries(
      boot.deployedInstanceIds.map((instanceId) => {
        const row = boot.mechCurrentAmmo.find((entry) => entry.instanceId === instanceId);
        // Interim rule (2026-10-03, pending 神宮's economy decision on how the
        // shared ammoLoad is split per mech): a deployed mech whose currentAmmo
        // is unset sorties full (per-mech capacity). A given value — including
        // 0 — is used as-is. See docs/MECH_FLEET.md "携行弾".
        return [instanceId, row?.currentAmmo ?? MECH_AMMO_BASE_CAPACITY];
      }),
    ),
    extracted: false,
    failReason: null,
    note: boot.note,
    deployedInstanceIds: [...boot.deployedInstanceIds],
    deployedDurability: { ...boot.deployedDurability },
    circuitDurabilityBuffer: Math.max(0, Math.floor(boot.circuitDurabilityBuffer ?? 0)),
    circuitCraftMultiplier:
      boot.circuitCraftMultiplier != null &&
      Number.isFinite(boot.circuitCraftMultiplier) &&
      boot.circuitCraftMultiplier > 0
        ? boot.circuitCraftMultiplier
        : 1,
    invadeSector: boot.invadeSector
      ? {
          sectorX: boot.invadeSector.sectorX,
          sectorY: boot.invadeSector.sectorY,
          density: boot.invadeSector.density,
          invadeRank: boot.invadeSector.invadeRank ?? 0,
          intelFlags: [...boot.invadeSector.intelFlags],
          ...(boot.invadeSector.engage != null
            ? { engage: boot.invadeSector.engage }
            : {}),
          ...(boot.invadeSector.enemyCells != null &&
          boot.invadeSector.enemyCells.length > 0
            ? {
                enemyCells: boot.invadeSector.enemyCells.map((c) => ({
                  sx: c.sx,
                  sy: c.sy,
                })),
              }
            : {}),
          ...(boot.invadeSector.neighborCount != null
            ? { neighborCount: boot.invadeSector.neighborCount }
            : {}),
        }
      : null,
    densityThreat: { ...threat },
    camera: cameraAtSpawn(spawn, rect),
    wideLayout: laid.layout,
    combatHitsTaken: 0,
    commandUnlock: defaultCommandUnlockState(
      resolveCommandUnlockMode(),
      boot.equippedByUnit,
    ),
  };
  revealOpenedBoardFog(world);
  return world;
}

export function startSortie(world: World): boolean {
  const hub = loadHubSaveFromLocalStorage()?.hub;
  const nonce = Math.random().toString(36).slice(2, 10);
  if (typeof window !== "undefined" && !DEBUG_FIXTURE_ACTIVE && !hub) {
    world.logs.push({
      t: world.elapsed,
      text: "出撃機の保存データがありません。格納庫で新規ゲームを開始してください。",
      kind: "tactical",
    });
    return false;
  }
  if (
    !DEBUG_FIXTURE_ACTIVE &&
    hub?.newGameIntro &&
    !hub.newGameIntro.firstSortie
  ) {
    const error = firstSortieError(hub, world.leader.instanceId);
    if (error) {
      world.logs.push({ t: world.elapsed, text: error, kind: "tactical" });
      return false;
    }
    const circuitId = firstSortieCircuit(hub, world.leader.instanceId)!;
    if (
      !saveHubSaveToLocalStorage({
        ...hub,
        newGameIntro: {
          ...hub.newGameIntro,
          firstSortie: { nonce, leaderId: world.leader.instanceId!, circuitId },
        },
      })
    ) {
      world.logs.push({
        t: world.elapsed,
        text: "記録を保存できません。格納庫へ戻って再試行してください。",
        kind: "tactical",
      });
      return false;
    }
  }
  delete world.shieldReturnSettled;
  delete world.barricades;
  delete world.fieldReturnReport;
  const layout = world.wideLayout ?? boardFromProgress(null).layout;
  world.wideLayout = layout;
  world.enemies = placeWideContents(
    layout,
    world.densityThreat,
    world.invadeSector?.neighborCount ?? 0,
    world.invadeSector?.invadeRank ?? 0,
  ).enemies;
  world.enemySupplies = [];
  world.recallSpawns = undefined;
  world.recoveredEnemyUnits = [];
  world.phase = "sortie";
  world.timeLeft = world.maxOperationTimeSec;
  world.operationTimedOut = false;
  world.elapsed = 0;
  world.salvaged = 0;
  world.extracted = false;
  world.failReason = null;
  world.boarding = null;
  world.camp = null;
  world.logs = [];
  world.combatHitsTaken = 0;
  world.friendlyFire = { count: 0, byShooter: {} };
  world.leftBehind = [];
  world.recoveredLostMechIds = [];
  world.sortieNonce = nonce;
  if (world.circuitPlay) {
    world.circuitPlay.order = null;
    world.circuitPlay.pending = null;
    world.circuitPlay.fogOpen = null;
    world.circuitPlay.lastSeen = {};
    world.circuitPlay.airWrecks = [];
    world.circuitPlay.grantTrue = false;
    world.circuitPlay.pullOutside = false;
    world.circuitPlay.collectTap = null;
    world.circuitPlay.collectDown = false;
    world.circuitPlay.carry = {};
    world.circuitPlay.wreckChannel = {};
  }
  if (world.coverObjects) {
    for (let i = world.coverObjects.length - 1; i >= 0; i--) {
      if (world.coverObjects[i]!.id.startsWith("trench-"))
        world.coverObjects.splice(i, 1);
    }
  }
  for (const c of world.containers) {
    c.taken = false;
    c.discovered = false;
  }
  for (const e of world.enemies) {
    e.alive = true;
    e.hp = e.maxHp;
  }
  for (const u of [world.leader, ...world.wingmen]) {
    u.alive = true;
    u.hp = u.maxHp;
    u.stance = "escort";
    u.waypoint = null;
    u.salvageId = null;
    u.salvageT = 0;
    u.salvagedCount = 0;
    u.inCover = false;
  }
  faceAtSortieStart(world);
  restoreFieldAtSortieStart(world);
  delete world.squadIntel;
  revealOpenedBoardFog(world);
  return true;
}

/** Facing PR1 (神宮 10/17): the leader faces up the screen, wingmen face outward from the spawn; enemies face the nearest ally. */
export function faceAtSortieStart(world: World): void {
  const allies = [world.leader, ...world.wingmen];
  const up = -Math.PI / 2;
  const spawn = world.extract.pos;
  for (const u of allies) {
    const dx = u.pos.x - spawn.x, dy = u.pos.y - spawn.y;
    const out = u.kind === "leader" || Math.hypot(dx, dy) < 1 ? up : Math.atan2(dy, dx);
    u.heading = out; u.moveHeading = out; u.aimWant = null;
  }
  for (const e of world.enemies) {
    let best = allies[0]!, bd = Infinity;
    for (const a of allies) { const d = (a.pos.x - e.pos.x) ** 2 + (a.pos.y - e.pos.y) ** 2; if (d < bd) { bd = d; best = a; } }
    e.heading = Math.atan2(best.pos.y - e.pos.y, best.pos.x - e.pos.x); e.moveHeading = null; e.aimWant = null;
  }
}
