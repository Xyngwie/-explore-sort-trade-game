import {
  DEFAULT_EXPEDITION_LOADOUT,
  parseInvadeToExploreSearch,
  parseTradeToExploreSearch,
  wingmanCountFromMechs,
} from "@estg/shared";
import {
  BALANCE,
  balanceForThreat,
  ENGAGE_BRIEFING_LABEL,
  threatFromInvadeSector,
  type DensityThreat,
} from "./balance";
import type { Container, InvadeSectorContext, Unit, World } from "./types";
import { vec } from "./math";

function makeUnit(
  partial: Pick<Unit, "id" | "kind" | "name" | "pos" | "hp" | "maxHp" | "radius" | "alive"> &
    Partial<Pick<Unit, "stance" | "waypoint" | "capacity" | "instanceId">>,
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

function clampToWorld(x: number, y: number, margin: number): { x: number; y: number } {
  return {
    x: Math.min(BALANCE.worldW - margin, Math.max(margin, x)),
    y: Math.min(BALANCE.worldH - margin, Math.max(margin, y)),
  };
}

/**
 * Scatter many salvage crates across the wreck field.
 * Deterministic positions (no RNG) so selftests stay stable.
 * Count from BALANCE.fieldContainerCount — no longer capped near 6.
 */
function placeContainers(): Container[] {
  const count = BALANCE.fieldContainerCount;
  const margin = 90;
  const spawnAvoid = vec(180, 500);
  const avoidR = 140;
  const spots: { x: number; y: number }[] = [];

  // Landmark seeds (readable early-game targets)
  const landmarks = [
    vec(420, 280),
    vec(780, 360),
    vec(980, 620),
    vec(560, 720),
    vec(1100, 240),
    vec(300, 520),
    vec(640, 180),
    vec(200, 780),
    vec(1250, 480),
    vec(880, 820),
  ];
  for (const p of landmarks) {
    if (spots.length >= count) break;
    spots.push(p);
  }

  // Fill remaining with a jittered grid covering the map
  const cols = 5;
  const rows = 4;
  const usableW = BALANCE.worldW - margin * 2;
  const usableH = BALANCE.worldH - margin * 2;
  let gi = 0;
  for (let row = 0; row < rows && spots.length < count; row++) {
    for (let col = 0; col < cols && spots.length < count; col++) {
      const jx = ((gi * 37) % 17) - 8;
      const jy = ((gi * 53) % 17) - 8;
      gi += 1;
      const x = margin + ((col + 0.5) / cols) * usableW + jx * 6;
      const y = margin + ((row + 0.5) / rows) * usableH + jy * 6;
      const pos = clampToWorld(x, y, margin);
      if (Math.hypot(pos.x - spawnAvoid.x, pos.y - spawnAvoid.y) < avoidR) continue;
      // Skip near-duplicates of already placed landmarks
      if (spots.some((s) => Math.hypot(s.x - pos.x, s.y - pos.y) < 55)) continue;
      spots.push(pos);
    }
  }

  // Safety fill if grid skipped too many near spawn
  let fill = 0;
  while (spots.length < count && fill < 40) {
    const i = spots.length + fill;
    const angle = i * 2.399; // golden-angle-ish
    const radius = 220 + (i % 7) * 70;
    const pos = clampToWorld(
      spawnAvoid.x + Math.cos(angle) * radius,
      spawnAvoid.y + Math.sin(angle) * radius,
      margin,
    );
    fill += 1;
    if (spots.some((s) => Math.hypot(s.x - pos.x, s.y - pos.y) < 50)) continue;
    spots.push(pos);
  }

  return spots.slice(0, count).map((pos, i) => ({
    id: `crate-${i}`,
    pos: { ...pos },
    taken: false,
    discovered: false,
    glowT: 0,
  }));
}

/**
 * Place enemies on a ring around player spawn.
 * Higher density → more enemies, closer ring (see threatFromDensity / BALANCE).
 */
function placeEnemies(
  spawn: { x: number; y: number },
  threat: DensityThreat,
): Unit[] {
  const count = Math.max(1, threat.enemyCount);
  const enemies: Unit[] = [];
  const margin = 40;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + 0.35;
    const raw = {
      x: spawn.x + Math.cos(angle) * threat.spawnDist,
      y: spawn.y + Math.sin(angle) * threat.spawnDist,
    };
    const pos = clampToWorld(raw.x, raw.y, margin);
    const hp = Math.max(1, Math.round(BALANCE.enemyHp * (threat.enemyHpMul ?? 1)));
    enemies.push(
      makeUnit({
        id: `enemy-${i}`,
        kind: "enemy",
        name: `敵${i + 1}`,
        pos,
        hp,
        maxHp: hp,
        radius: BALANCE.enemyRadius,
        alive: true,
        stance: "raid",
        capacity: 0,
      }),
    );
  }
  return enemies;
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
        ? `HUB v2 · 健在 ${craft} 機 · ids ${deployedInstanceIds.join(",")}`
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
    circuitDurabilityBuffer,
    circuitCraftMultiplier,
    invadeSector,
  };
}

export function createWorld(boot: SortieBootstrap): World {
  const spawn = vec(180, 500);
  const density = boot.invadeSector?.density ?? null;
  const threat = threatFromInvadeSector({
    density,
    engage: boot.invadeSector?.engage ?? null,
    enemyCells: boot.invadeSector?.enemyCells,
    neighborCount: boot.invadeSector?.neighborCount,
  });
  const balance = balanceForThreat(threat);

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
    const tag = i === 0 ? "a" : "b";
    const instanceId = boot.deployedInstanceIds[i + 1] ?? null;
    wingmen.push(
      makeUnit({
        id: `wing-${tag}`,
        kind: "wingman",
        name: i === 0 ? "僚機A" : "僚機B",
        pos: {
          x: spawn.x - 40,
          y: spawn.y + (i === 0 ? -40 : 40),
        },
        hp: BALANCE.wingmanHp,
        maxHp: BALANCE.wingmanHp,
        radius: BALANCE.unitRadius,
        alive: true,
        stance: "escort",
        instanceId,
      }),
    );
  }

  const craft = 1 + boot.wingmanCount;
  // Soft personal speed ref still uses carrierSlotsPerCraft per craft;
  // hard MAX carry abolished — handoff field stays informational / large.
  void craft;
  const carrierCapacity = BALANCE.carrierCapacityUnlimited;

  return {
    balance,
    phase: "briefing",
    timeLeft: boot.maxOperationTimeSec,
    elapsed: 0,
    maxOperationTimeSec: boot.maxOperationTimeSec,
    leader,
    wingmen,
    enemies: placeEnemies(spawn, threat),
    containers: placeContainers(),
    extract: { pos: vec(160, 480), radius: 48 },
    boarding: null,
    camp: null,
    bullets: [],
    logs: [],
    salvaged: 0,
    carrierCapacity,
    ammo: boot.ammoStock,
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
    camera: { x: 0, y: 200, w: 720, h: 420 },
    combatHitsTaken: 0,
  };
}

export function startSortie(world: World): void {
  world.phase = "sortie";
  world.timeLeft = world.maxOperationTimeSec;
  world.elapsed = 0;
  world.salvaged = 0;
  world.extracted = false;
  world.failReason = null;
  world.boarding = null;
  world.camp = null;
  world.logs = [];
  world.combatHitsTaken = 0;
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
  }
}
