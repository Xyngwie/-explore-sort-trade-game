import {
  DEFAULT_EXPEDITION_LOADOUT,
  parseTradeToExploreSearch,
  wingmanCountFromMechs,
} from "@estg/shared";
import { BALANCE } from "./balance";
import type { Container, Unit, World } from "./types";
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

function placeContainers(): Container[] {
  const spots = [
    vec(420, 280),
    vec(780, 360),
    vec(980, 620),
    vec(560, 720),
    vec(1100, 240),
    vec(300, 520),
  ];
  return spots.map((pos, i) => ({
    id: `crate-${i}`,
    pos,
    taken: false,
    discovered: false,
  }));
}

function placeEnemies(): Unit[] {
  const spots = [
    vec(650, 200),
    vec(900, 480),
    vec(500, 600),
    vec(1050, 700),
    vec(750, 800),
  ];
  return spots.map((pos, i) =>
    makeUnit({
      id: `enemy-${i}`,
      kind: "enemy",
      name: `敵${i + 1}`,
      pos: { ...pos },
      hp: BALANCE.enemyHp,
      maxHp: BALANCE.enemyHp,
      radius: BALANCE.enemyRadius,
      alive: true,
      stance: "raid",
      capacity: 0,
    }),
  );
}

export type SortieBootstrap = {
  wingmanCount: number;
  ammoStock: number;
  maxOperationTimeSec: number;
  note: string;
  deployedInstanceIds: string[];
  deployedDurability: Record<string, number>;
};

export function bootstrapFromSearch(search: string): SortieBootstrap {
  const inbound = parseTradeToExploreSearch(search);
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
  const note =
    inbound != null
      ? deployedInstanceIds.length > 0
        ? `HUB v2 · 健在 ${craft} 機 · ids ${deployedInstanceIds.join(",")}`
        : `HUB 受取 · 配備 ${craft} 機（僚機 ${wingmanCount}） · 実弾 ${ammoStock}`
      : "デモ編成 · 僚機 2 · 既定実弾";
  return {
    wingmanCount,
    ammoStock,
    maxOperationTimeSec: DEFAULT_EXPEDITION_LOADOUT.maxOperationTimeSec,
    note,
    deployedInstanceIds,
    deployedDurability,
  };
}

export function createWorld(boot: SortieBootstrap): World {
  const spawn = vec(180, 500);
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
  const carrierCapacity = BALANCE.carrierSlotsPerCraft * craft;

  return {
    balance: BALANCE,
    phase: "briefing",
    timeLeft: boot.maxOperationTimeSec,
    elapsed: 0,
    maxOperationTimeSec: boot.maxOperationTimeSec,
    leader,
    wingmen,
    enemies: placeEnemies(),
    containers: placeContainers(),
    extract: { pos: vec(160, 480), radius: 48 },
    boarding: null,
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
