import { clamp, dist } from "./math";
import type { Balance } from "./balance";
import type { Container, Stance, Unit, World } from "./types";
import { STANCE_LABEL } from "./types";

export function pushLog(
  world: World,
  text: string,
  kind: "tactical" | "battle" = "tactical",
): void {
  world.logs.unshift({ t: world.elapsed, text, kind });
  const max =
    kind === "battle"
      ? world.balance.maxBattleReports
      : world.balance.maxTacticalLog;
  // Keep mixed list bounded.
  if (world.logs.length > world.balance.maxTacticalLog + world.balance.maxBattleReports) {
    world.logs.length = world.balance.maxTacticalLog + world.balance.maxBattleReports;
  }
  void max;
}

export function abortSalvage(wing: Unit): void {
  wing.salvageId = null;
  wing.salvageT = 0;
}

/**
 * Apply a wingman order. Raid never requires a map click.
 * Patrol waypoint is optional (defaults to leader-centered orbit).
 */
export function applyOrder(
  world: World,
  wing: Unit,
  stance: Stance,
  opts?: { waypoint?: { x: number; y: number } | null },
): "applied" | "denied" {
  if (!wing.alive) return "denied";

  if (stance === "escort") {
    abortSalvage(wing);
    wing.stance = "escort";
    wing.waypoint = null;
    pushLog(world, `${wing.name}：帯同。隊長に付く。`);
    return "applied";
  }

  if (stance === "raid") {
    abortSalvage(wing);
    wing.stance = "raid";
    wing.waypoint = null; // no position targeting
    pushLog(world, `${wing.name}：遊撃。自律交戦を開始。`);
    return "applied";
  }

  if (stance === "patrol") {
    abortSalvage(wing);
    wing.stance = "patrol";
    wing.waypoint =
      opts?.waypoint != null
        ? { ...opts.waypoint }
        : { ...world.leader.pos };
    wing.patrolAngle = Math.atan2(
      wing.pos.y - wing.waypoint.y,
      wing.pos.x - wing.waypoint.x,
    );
    pushLog(world, `${wing.name}：哨戒。目標周辺を掃討。`);
    return "applied";
  }

  if (stance === "recover") {
    const discovered = world.containers.filter((c) => c.discovered && !c.taken);
    if (discovered.length === 0) {
      pushLog(world, `${wing.name}：発見済みコンテナなし。`);
      return "denied";
    }
    let target = discovered[0]!;
    let best = Infinity;
    for (const c of discovered) {
      const d = dist(wing.pos, c.pos);
      if (d < best) {
        best = d;
        target = c;
      }
    }
    wing.stance = "recover";
    wing.waypoint = { ...target.pos };
    pushLog(world, `${wing.name}：回収。コンテナへ向かう。`);
    return "applied";
  }

  return "denied";
}


/**
 * 散開捜索: captain + living wingmen all switch to raid and fan out
 * ~120° apart relative to captain heading (easy clear when 1v1-strong).
 */
export function scatterSearch(world: World): "applied" | "denied" {
  if (world.phase !== "sortie" || !world.leader.alive) return "denied";

  const living: Unit[] = [
    world.leader,
    ...world.wingmen.filter((w) => w.alive),
  ];
  if (living.length === 0) return "denied";

  const base = world.leader.heading;
  const origin = world.leader.pos;
  const distOut = world.balance.scatterSearchDist;
  // Three bearings: forward / +120° / -120° (assign in order to living units).
  const bearings = [0, (2 * Math.PI) / 3, -(2 * Math.PI) / 3];
  const pad = 20;

  for (let i = 0; i < living.length; i++) {
    const unit = living[i]!;
    const angle = base + bearings[i % bearings.length]!;
    const target = {
      x: clamp(origin.x + Math.cos(angle) * distOut, pad, world.balance.worldW - pad),
      y: clamp(origin.y + Math.sin(angle) * distOut, pad, world.balance.worldH - pad),
    };
    abortSalvage(unit);
    unit.stance = "raid";
    unit.moveTarget = { ...target };
    if (unit.kind === "leader") {
      // Captain stays player-led; seed click-style moveTarget only.
      unit.waypoint = null;
    } else {
      // Wingmen: raid brain uses waypoint as preferred fan-out search point.
      unit.waypoint = { ...target };
    }
  }

  pushLog(world, "散開捜索：隊長＋僚機を遊撃で三方向に展開。");
  return "applied";
}

/** Rally / call wingman back — alias of escort for off-screen command. */
export function rallyWingman(world: World, wing: Unit): "applied" | "denied" {
  return applyOrder(world, wing, "escort");
}

/**
 * After salvage channel completes → auto switch to escort (product rule).
 */
export function onSalvageCompleted(world: World, unit: Unit): void {
  unit.salvageId = null;
  unit.salvageT = 0;
  unit.salvagedCount += 1;
  world.salvaged += 1;
  if (unit.kind === "wingman") {
    unit.stance = "escort";
    unit.waypoint = null;
    pushLog(
      world,
      `${unit.name}：回収完了 → ${STANCE_LABEL.escort}へ自動切替。`,
    );
  } else {
    pushLog(world, `${unit.name}：コンテナ回収完了。`);
  }
}

/**
 * Move-speed multiplier from carried cargo (empty → 1, full capacity → cargoSpeedMulMin).
 */
export function cargoSpeedMul(unit: Unit, balance: Balance): number {
  if (unit.capacity <= 0) return 1;
  const load = Math.min(1, Math.max(0, unit.salvagedCount / unit.capacity));
  return 1 - load * (1 - balance.cargoSpeedMulMin);
}

function friendliesNear(
  world: World,
  pos: { x: number; y: number },
  radius: number,
): Unit[] {
  return [world.leader, ...world.wingmen].filter(
    (u) => u.alive && dist(u.pos, pos) <= radius,
  );
}

function depositUnitIntoCamp(world: World, unit: Unit): number {
  if (!world.camp || unit.salvagedCount <= 0) return 0;
  const n = unit.salvagedCount;
  world.camp.stashedCount += n;
  unit.salvagedCount = 0;
  return n;
}

/**
 * Set camp at captain position, or relocate when stash is empty.
 * Depositing into an existing camp is explicit via unloadAtCamp（荷下ろし）.
 * Relocating an occupied camp is denied — clear stash first or return to it.
 */
export function setCampOrDeposit(
  world: World,
): "camp_set" | "moved" | "denied" {
  if (world.phase !== "sortie" || !world.leader.alive) return "denied";
  const leader = world.leader;
  const r = world.balance.interactRadius * 1.5;

  if (!world.camp) {
    world.camp = { pos: { ...leader.pos }, stashedCount: 0 };
    let deposited = depositUnitIntoCamp(world, leader);
    for (const u of friendliesNear(world, world.camp.pos, r)) {
      if (u.id === leader.id) continue;
      deposited += depositUnitIntoCamp(world, u);
    }
    pushLog(
      world,
      deposited > 0
        ? `仮設キャンプ設置（隊長位置）。貨物 ${deposited} を預けた。`
        : "仮設キャンプ設置（隊長位置）。",
    );
    return "camp_set";
  }

  if (dist(leader.pos, world.camp.pos) <= r) {
    // Deposit is explicit via unloadAtCamp（荷下ろし）— C only sets / relocates.
    pushLog(world, "キャンプは付近にある。荷下ろしは U / 荷下ろしボタン。");
    return "denied";
  }

  if (world.camp.stashedCount > 0) {
    pushLog(
      world,
      "既存キャンプに貨物あり。取上げてから移設するか、キャンプへ戻れ。",
    );
    return "denied";
  }
  world.camp.pos = { ...leader.pos };
  let deposited = depositUnitIntoCamp(world, leader);
  for (const u of friendliesNear(world, world.camp.pos, r)) {
    if (u.id === leader.id) continue;
    deposited += depositUnitIntoCamp(world, u);
  }
  pushLog(
    world,
    deposited > 0
      ? `キャンプ移設（隊長位置）。貨物 ${deposited} を預けた。`
      : "キャンプ移設（隊長位置）。",
  );
  return "moved";
}


/**
 * Explicit unload（荷下ろし）: deposit carried salvage into camp stash when near camp.
 * Does not set or relocate camp — use setCampOrDeposit for that.
 */
export function unloadAtCamp(world: World): "unloaded" | "denied" {
  if (world.phase !== "sortie" || !world.leader.alive || !world.camp) {
    if (world.phase === "sortie" && world.leader.alive && !world.camp) {
      pushLog(world, "キャンプ未設置。先に C で設置せよ。");
    }
    return "denied";
  }
  const camp = world.camp;
  const r = world.balance.interactRadius * 1.5;
  if (dist(world.leader.pos, camp.pos) > r) {
    pushLog(world, "キャンプが遠い。近づいてから荷下ろしせよ。");
    return "denied";
  }
  let deposited = 0;
  for (const u of friendliesNear(world, camp.pos, r)) {
    deposited += depositUnitIntoCamp(world, u);
  }
  if (deposited <= 0) {
    pushLog(world, "キャンプ付近に預ける貨物なし。");
    return "denied";
  }
  pushLog(
    world,
    `荷下ろし：${deposited}（置場 ${camp.stashedCount}）。軽装で探索可。`,
  );
  return "unloaded";
}

/**
 * Captain (and nearby friendlies) pick up stashed cargo into free capacity.
 */
export function pickUpFromCamp(world: World): "picked" | "denied" {
  if (world.phase !== "sortie" || !world.leader.alive || !world.camp) {
    return "denied";
  }
  const camp = world.camp;
  const r = world.balance.interactRadius * 1.5;
  if (dist(world.leader.pos, camp.pos) > r) {
    pushLog(world, "キャンプが遠い。近づいてから取り上げよ。");
    return "denied";
  }
  if (camp.stashedCount <= 0) {
    pushLog(world, "キャンプに貨物なし。");
    return "denied";
  }

  let taken = 0;
  const near = friendliesNear(world, camp.pos, r);
  const order = [
    ...near.filter((u) => u.kind === "leader"),
    ...near.filter((u) => u.kind !== "leader"),
  ];
  for (const u of order) {
    if (camp.stashedCount <= 0) break;
    const free = Math.max(0, u.capacity - u.salvagedCount);
    if (free <= 0) continue;
    const n = Math.min(free, camp.stashedCount);
    u.salvagedCount += n;
    camp.stashedCount -= n;
    taken += n;
  }
  if (taken <= 0) {
    pushLog(world, "積載に空きなし。預けたまま軽装を維持。");
    return "denied";
  }
  pushLog(
    world,
    `キャンプから積込：${taken}（残置場 ${camp.stashedCount}）。`,
  );
  return "picked";
}


/** Allocate a unique container id within this sortie. */
export function nextContainerId(world: World, prefix = "crate"): string {
  let n = world.containers.length;
  let id = `${prefix}-${n}`;
  const used = new Set(world.containers.map((c) => c.id));
  while (used.has(id)) {
    n += 1;
    id = `${prefix}-${n}`;
  }
  return id;
}

/**
 * Spawn salvage containers at a world position (field loot / purge drop / death drop).
 * Slight radial offsets so stacked drops remain pickable.
 */
export function spawnContainersAt(
  world: World,
  at: { x: number; y: number },
  count: number,
  opts?: { discovered?: boolean; idPrefix?: string },
): Container[] {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0) return [];
  const discovered = opts?.discovered ?? true;
  const prefix = opts?.idPrefix ?? "crate";
  const spawned: Container[] = [];
  const pad = 20;
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / Math.max(1, n) + i * 0.35;
    const radius = n === 1 ? 0 : 14 + i * 6;
    const pos = {
      x: clamp(at.x + Math.cos(angle) * radius, pad, world.balance.worldW - pad),
      y: clamp(at.y + Math.sin(angle) * radius, pad, world.balance.worldH - pad),
    };
    const c: Container = {
      id: nextContainerId(world, prefix),
      pos,
      taken: false,
      discovered,
    };
    world.containers.push(c);
    spawned.push(c);
  }
  return spawned;
}

function dropUnitCargoToField(world: World, unit: Unit): number {
  const n = unit.salvagedCount;
  if (n <= 0) return 0;
  abortSalvage(unit);
  unit.salvagedCount = 0;
  world.salvaged = Math.max(0, world.salvaged - n);
  spawnContainersAt(world, unit.pos, n, {
    discovered: true,
    idPrefix: "purge",
  });
  return n;
}

/**
 * パージ / キャンプへ降ろす:
 * - Near camp → deposit carried cargo into camp stash (keeps world.salvaged).
 * - Otherwise → drop carried cargo onto the field as pickable crates (frees speed for combat).
 * Affects living friendlies with cargo (wingmen + captain).
 */
export function purgeCargo(
  world: World,
): "purged" | "denied" {
  if (world.phase !== "sortie" || !world.leader.alive) return "denied";

  const r = world.balance.interactRadius * 1.5;
  const camp = world.camp;
  let deposited = 0;
  let dropped = 0;
  const carriers = [world.leader, ...world.wingmen].filter(
    (u) => u.alive && u.salvagedCount > 0,
  );
  if (carriers.length === 0) {
    pushLog(world, "パージ：積載貨物なし。");
    return "denied";
  }

  for (const u of carriers) {
    if (camp && dist(u.pos, camp.pos) <= r) {
      deposited += depositUnitIntoCamp(world, u);
      abortSalvage(u);
    } else {
      dropped += dropUnitCargoToField(world, u);
    }
  }

  if (deposited <= 0 && dropped <= 0) {
    pushLog(world, "パージ：降ろす貨物なし。");
    return "denied";
  }

  const parts: string[] = [];
  if (deposited > 0) {
    parts.push(`キャンプへ ${deposited}（置場 ${camp!.stashedCount}）`);
  }
  if (dropped > 0) {
    parts.push(`戦場へ投下 ${dropped}（軽装化）`);
  }
  pushLog(world, `パージ：${parts.join(" · ")}。`);
  return "purged";
}
