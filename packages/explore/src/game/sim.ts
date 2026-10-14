import { enemyAmmoFeedback, tickCombatFeedback } from "./combatFeedback";
import { beginMovementPowerTick, consumeMovementPower, expireEmptyBatteries, movementTimeAvailable } from "./power";
import { backfillEnemyState, nearestEnemyTarget, enemyDestination, enemySpeed, lootEnemy, moveEnemy, enemyRate, enemyDamageMultiplier, enemyArmorMultiplier, handleEnemyDeaths, collectSupplies, scheduleRecall, spawnRecall } from "./enemyBehavior";
import { tickEnemyTag } from "./enemyIdentity";
import { decideWingman } from "./brain";
import { recoverStrandedAtLiftOff } from "./lostMechs";
import { recoverStrandedDropsAtLiftOff } from "./circuitDrops";
import { maybeAutoRescue, noteLeaderDown, resolveForcedRescueTimeout } from "./rescue";
import { recoverSortieWrecksAtLiftOff, sortieWreckUnits } from "./wrecks";
import {
  applyOrder,
  campDamageTakenMul,
  isOperationTimedOut,
  onSalvageCompleted,
  pushLog,
  shotHitChance,
  spawnContainersAt,
  unitMoveSpeedMul,
} from "./orders";
import { angleOf, clamp, dist, dist2, norm, type Vec2 } from "./math";
import { updateCoverMovement } from "./coverMovement";
import { isWingmanMobileFor } from "./commandUnlock";
import {
  applyCollectPress,
  applyLure,
  attackMul,
  bendHoming,
  circuitMoveTarget,
  circuitSpeed,
  circuitTryWeapon,
  abilityOf,
  usableAmmo,
  visionMul,
  enemyEmpMul,
  enemyHeld,
  focusTarget,
  movementLocked,
  noteCircuitExtract,
  noteDamageBreaksSuppress,
  noteEmpHit,
  rangeMul,
  salvageSeconds,
  secondExtractPull,
  stepCircuitPlay,
  tryDodge,
} from "./circuitPlay";
import type { Bullet, Unit, World } from "./types";
import { captainActive, wingRecoverWantsSalvage, wreckChannelOf } from "./circuitPlay";
import { canTakeContainer, wreckCarrierId } from "./carry";
import { placeCarried, captainRescuer } from "./circuitPlay";
import { dropUnitCargoToField } from "./orders";

export { isOperationTimedOut } from "./orders";

function friendlyUnits(world: World): Unit[] {
  return [world.leader, ...world.wingmen];
}

function circuitLocomotion(world: World, unit: Unit, fallback: Vec2 | null, fallbackSpeed: number): { target: Vec2 | null; speed: number } {
  const play = world.circuitPlay;
  if (!play?.rules) return { target: fallback, speed: fallbackSpeed };
  const ct = circuitMoveTarget(world, unit);
  if (ct) return { target: ct, speed: circuitSpeed(world, unit) ?? fallbackSpeed };
  if (unit.kind === "leader" && movementLocked(world)) return { target: null, speed: 0 };
  return { target: fallback, speed: fallbackSpeed };
}

function moveToward(unit: Unit, target: Vec2 | null, speed: number, dt: number, world: World): void {
  if (!target || !unit.alive || speed <= 0 || wreckCarrierId(world, unit.id) || Object.values(world.circuitPlay?.wreckChannel ?? {}).some(ch => ch.id === unit.id)) {
    unit.vel = { x: 0, y: 0 };
    return;
  }
  const d = dist(unit.pos, target);
  if (d < 4) {
    unit.vel = { x: 0, y: 0 };
    return;
  }
  const dir = norm({ x: target.x - unit.pos.x, y: target.y - unit.pos.y });
  const travelTime = Math.min(d / speed, movementTimeAvailable(world, unit, dt));
  const before = { ...unit.pos };
  unit.pos.x = clamp(before.x + dir.x * speed * travelTime, 20, world.balance.worldW - 20);
  unit.pos.y = clamp(before.y + dir.y * speed * travelTime, 20, world.balance.worldH - 20);
  const moved = dist(before, unit.pos);
  unit.vel = moved > 0 ? { x: dir.x * speed, y: dir.y * speed } : { x: 0, y: 0 };
  if (moved > 0) unit.heading = Math.atan2(dir.y, dir.x);
  consumeMovementPower(world, unit, moved / speed);
}

function revealVision(world: World): void {
  for (const u of friendlyUnits(world)) {
    if (!u.alive) continue;
    const r = world.balance.visionRange * visionMul(world, u.id);
    const r2 = r * r;
    for (const c of world.containers) {
      if (c.discovered || c.taken) continue;
      if (dist2(u.pos, c.pos) <= r2) {
        c.discovered = true;
        pushLog(world, `発見：コンテナ ${c.id} を確認。`);
      }
    }
  }
}

function inCamera(world: World, pos: Vec2): boolean {
  const c = world.camera;
  return (
    pos.x >= c.x &&
    pos.x <= c.x + c.w &&
    pos.y >= c.y &&
    pos.y <= c.y + c.h
  );
}

function spawnBullet(world: World, from: Unit, to: Unit, fromEnemy: boolean): void {
  const dir = norm({ x: to.pos.x - from.pos.x, y: to.pos.y - from.pos.y });
  const speed = world.balance.bulletSpeed * (fromEnemy ? 1 : abilityOf(world, from.id).bulletSpeed);
  const b: Bullet = {
    alive: true,
    pos: { ...from.pos },
    vel: { x: dir.x * speed, y: dir.y * speed },
    ttl: world.balance.bulletTtlSec,
    damage: fromEnemy ? world.balance.enemyDamage * enemyDamageMultiplier(from) : world.balance.bulletDamage * attackMul(world, from.id),
    fromEnemy,
    ownerId: from.id,
  };
  world.bullets.push(b);
}

function tryFire(world: World, from: Unit, target: Unit, fromEnemy: boolean): void {
  if (!from.alive || !target.alive) return;
  if (fromEnemy && from.cooldown > 0) return;
  const previousEnemyAmmo = from.enemyState?.ammo ?? 0;
  if (fromEnemy) {
    from.instanceId = from.id;
    world.currentAmmo[from.id] = from.enemyState?.ammo ?? 0;
  }
  if (circuitTryWeapon(world, from, target)) {
    if (fromEnemy && from.enemyState) {
      from.enemyState.ammo = world.currentAmmo[from.id] ?? 0;
      enemyAmmoFeedback(world, from, previousEnemyAmmo);
    }
    return;
  }
  if (from.cooldown > 0) return;
  const range = world.balance.weaponRange * (fromEnemy ? 1 + enemyRate(from,"escort_range") : rangeMul(world, from.id));
  if (dist(from.pos, target.pos) > range) return;
  if (fromEnemy) {
    if (!from.enemyState || from.enemyState.ammo <= 0) return;
    from.enemyState.ammo -= 1;
    enemyAmmoFeedback(world, from, previousEnemyAmmo);
  }
  if (!fromEnemy) {
    if (from.instanceId == null) return;
    const currentAmmo = world.currentAmmo[from.instanceId];
    if (currentAmmo == null || currentAmmo <= 0 || usableAmmo(world, from) <= 0) return;
    world.currentAmmo[from.instanceId] = currentAmmo - 1;
  }
  from.cooldown = world.balance.fireCooldown * (fromEnemy ? 1 : abilityOf(world, from.id).fireInterval);
  from.heading = angleOf(from.pos, target.pos);
  if (from.kind === "wingman") from.engageWarnT = world.balance.wingEngageWarnSec;
  spawnBullet(world, from, target, fromEnemy);
}

function reportBattle(world: World, text: string, at: Vec2): void {
  const tag = inCamera(world, at) ? "" : "（画面外）";
  pushLog(world, `戦報: ${text}${tag}`, "battle");
}

function updateBullets(world: World, dt: number): void {
  for (const b of world.bullets) {
    if (!b.alive) continue;
    b.ttl -= dt;
    if (b.ttl <= 0) {
      b.alive = false;
      continue;
    }
    bendHoming(world, b, dt);
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    const targets = b.fromEnemy ? [...friendlyUnits(world), ...world.enemies].filter(u => u.id !== b.ownerId) : world.enemies;
    for (const t of targets) {
      if (!t.alive) continue;
      if (dist(b.pos, t.pos) <= t.radius + world.balance.bulletHitPadding) {
        if (tryDodge(world, t, b)) continue;
        b.alive = false;
        const shooter = b.fromEnemy
          ? world.enemies.find((u) => u.id === b.ownerId)
          : friendlyUnits(world).find((u) => u.id === b.ownerId);
        if (shooter) {
          const chance = shotHitChance(shooter, t, world);
          if (chance < 1 && Math.random() >= chance) {
            if (!inCamera(world, t.pos) || !inCamera(world, b.pos)) reportBattle(world, `${t.name} がカバーで回避`, t.pos);
            break;
          }
        }
        let hitDmg = b.damage;
        if (b.fromEnemy && t.kind !== "enemy") {
          hitDmg *= campDamageTakenMul(world, t);
          world.combatHitsTaken += 1;
        }
        noteEmpHit(world, t, b);
        if (!b.fromEnemy) noteDamageBreaksSuppress(world, t);
        if (t.kind === "enemy") hitDmg /= enemyArmorMultiplier(t);
        t.hp -= hitDmg;
        if (t.kind === "wingman" && t.alive) t.hitWarnT = world.balance.wingHitWarnSec;
        if (t.hp <= 0) {
          t.alive = false;
          t.hp = 0;
          const killer = b.fromEnemy
            ? "敵"
            : friendlyUnits(world).find((u) => u.id === b.ownerId)?.name ?? "分隊";
          reportBattle(world, `${killer} が ${t.name} を撃破`, t.pos);
          if (t.kind === "enemy") handleEnemyDeaths(world);
        } else if (!inCamera(world, t.pos) || !inCamera(world, b.pos)) {
          reportBattle(world, `${t.name} が被弾 (−${Math.round(hitDmg)})`, t.pos);
        }
        break;
      }
    }
  }
  world.bullets = world.bullets.filter((b) => b.alive);
}

function updateSalvage(world: World, unit: Unit, want: boolean, dt: number): void {
  if (!unit.alive) return;
  if (!want && !unit.salvageId) return;
  // 項目4-1: no container pickup while an 8 s wreck pickup runs, or when full (C4).
  if (wreckChannelOf(world, unit.id) || !canTakeContainer(world, unit)) {
    unit.salvageId = null;
    unit.salvageT = 0;
    return;
  }
  let crate = unit.salvageId
    ? world.containers.find((c) => c.id === unit.salvageId)
    : world.containers.find((c) => c.discovered && !c.taken && dist(unit.pos, c.pos) < world.balance.interactRadius);
  if (!crate || crate.taken || !crate.discovered) {
    unit.salvageId = null;
    unit.salvageT = 0;
    return;
  }
  if (dist(unit.pos, crate.pos) > world.balance.interactRadius) {
    unit.salvageId = null;
    unit.salvageT = 0;
    return;
  }
  unit.salvageId = crate.id;
  unit.salvageT += dt;
  const salvageNeed = salvageSeconds(world) ?? world.balance.salvageSeconds;
  if (unit.salvageT >= salvageNeed) {
    crate.taken = true;
    onSalvageCompleted(world, unit);
  }
}

export function updateEnemies(world: World, dt: number): void {
  backfillEnemyState(world);
  for (const e of world.enemies) {
    if (!e.alive) continue;
    e.cooldown = Math.max(0, e.cooldown - dt);
    const st = e.enemyState!;
    const nearest = nearestEnemyTarget(world, e);
    const emp = enemyEmpMul(world,e);
    if (st.activity > st.capacity*.1 && applyLure(world,e,dt)) {
      if (Math.hypot(e.vel.x,e.vel.y)>0) st.activity = Math.max(st.capacity*.1, st.activity - .5*dt);
    } else if (!enemyHeld(world,e)) {
      const speed = enemySpeed(world,e)*emp.speed;
      if (!lootEnemy(world,e,dt,speed)) moveEnemy(world,e,enemyDestination(world,e,nearest),speed,dt);
    } else e.vel = {x:0,y:0};
    // Stationary / full / low-power enemies can still return fire.
    if (nearest) {
      const cd=e.cooldown;
      tryFire(world,e,nearest,true);
      if(e.cooldown!==cd)e.cooldown*=emp.interval;
    }
  }
}

function updateCamera(world: World): void {
  const lead = world.leader.pos;
  world.camera.x = clamp(lead.x - world.camera.w * world.balance.cameraLeadXFrac, 0, world.balance.worldW - world.camera.w);
  world.camera.y = clamp(lead.y - world.camera.h * world.balance.cameraLeadYFrac, 0, world.balance.worldH - world.camera.h);
}

export type PlayerInput = { move: Vec2; clickMove: Vec2 | null; fire: boolean; interact: boolean };

export function isInsideBoarding(world: World, unit: Unit): boolean {
  const b = world.boarding;
  if (!b) return false;
  return dist(unit.pos, b.center) <= b.radius;
}

export function boardingElapsed(world: World): number { if (!world.boarding) return 0; return Math.max(0, world.elapsed - world.boarding.requestedAt); }
export function boardingCargoEta(world: World): number | null { if (!world.boarding || world.boarding.cargoArrived) return null; return Math.max(0, world.balance.boardingCargoDelaySec - boardingElapsed(world)); }
export function boardingLiftOffEta(world: World): number | null { if (!world.boarding) return null; return Math.max(0, world.balance.boardingLiftOffDelaySec - boardingElapsed(world)); }

export function spawnEnemyDeathDrops(world: World, at: Vec2, forcedCount?: number): number {
  const max = world.balance.enemyDeathDropMax;
  const count = forcedCount != null ? Math.max(0, Math.min(max, Math.floor(forcedCount))) : Math.floor(Math.random() * (max + 1));
  if (count <= 0) return 0;
  const spawned = spawnContainersAt(world, at, count, { discovered: true, idPrefix: "drop" });
  for (const c of spawned) c.glowT = world.balance.deathDropGlowSec;
  pushLog(world, `敵撃破ドロップ：コンテナ ${spawned.length} 出現！（発光マーカー）`, "battle");
  return spawned.length;
}

export type BoardingRequirementsHud = { active: boolean; liftOffEta: number | null; cargoEta: number | null; cargoArrived: boolean; mustBeIn: string; captainInside: boolean; aliveCount: number; insideCount: number; outsideCount: number; outsideNames: string[]; insideNames: string[]; lines: string[] };

export function boardingRequirementsHud(world: World): BoardingRequirementsHud {
  const mustBeIn = world.leader.alive ? "隊長が搭乗円内" : "隊長の残骸が搭乗円内";
  if (!world.boarding) return { active: false, liftOffEta: null, cargoEta: null, cargoArrived: false, mustBeIn, captainInside: false, aliveCount: friendlyUnits(world).filter((u) => u.alive).length, insideCount: 0, outsideCount: 0, outsideNames: [], insideNames: [], lines: ["帰還要件", "未要請 — X で搭乗円を展開", `必須: ${mustBeIn}（離昇時）`, `貨物 ${world.balance.boardingCargoDelaySec}s → 離昇 ${world.balance.boardingLiftOffDelaySec}s`] };
  const alive = friendlyUnits(world).filter((u) => u.alive);
  const inside = alive.filter((u) => isInsideBoarding(world, u));
  const outside = alive.filter((u) => !isInsideBoarding(world, u));
  // 項目5-2 10(b): a wreck inside the circle that was opened before the captain fell still counts.
  const captainInside = isInsideBoarding(world, world.leader);
  const liftOffEta = boardingLiftOffEta(world);
  const cargoEta = boardingCargoEta(world);
  const cargoArrived = world.boarding.cargoArrived;
  const lines = ["帰還要件", liftOffEta != null ? `離昇まで ${liftOffEta.toFixed(1)}s` : "離昇直前", `必須: ${mustBeIn} → ${captainInside ? "円内 OK" : "円外！戻れ"}`, `円内 ${inside.length} / 生存 ${alive.length}` + (outside.length > 0 ? `（円外: ${outside.map((u) => u.name).join("・")}）` : "（全員円内）")];
  if (!cargoArrived && cargoEta != null) lines.splice(2, 0, `貨物到着まで ${cargoEta.toFixed(1)}s`); else if (cargoArrived) lines.splice(2, 0, "貨物到着済 — 円内で離昇待機");
  return { active: true, liftOffEta, cargoEta, cargoArrived, mustBeIn, captainInside, aliveCount: alive.length, insideCount: inside.length, outsideCount: outside.length, outsideNames: outside.map((u) => u.name), insideNames: inside.map((u) => u.name), lines };
}

export function requestExtract(world: World): boolean {
  // 項目4-2 C2: a wingman carrying the captain's wreck can call the circle too.
  if (world.phase !== "sortie" || !captainActive(world)) return false;
  if (isOperationTimedOut(world)) { pushLog(world, "時間切れのため新規の帰還要請は不可。進行中の搭乗円の完了を待つ。"); return false; }
  if (world.boarding) {
    if (secondExtractPull(world)) return true;
    pushLog(world, "帰還シーケンス進行中。キャンセル不可。");
    return false;
  }
  const center = { ...world.leader.pos };
  const radius = world.balance.boardingRadius;
  world.boarding = { center, radius, requestedAt: world.elapsed, cargoArrived: false };
  scheduleRecall(world);
  world.extract = { pos: { ...center }, radius };
  for (const w of world.wingmen) if (w.alive) applyOrder(world, w, "patrol", { waypoint: center });
  pushLog(world, `帰還要請。搭乗円展開（半径 ${radius}）。僚機は円中心を哨戒。貨物 ${world.balance.boardingCargoDelaySec}s／離昇 ${world.balance.boardingLiftOffDelaySec}s。`);
  return true;
}

export function tryExtract(world: World): boolean { return requestExtract(world); }

function resolveBoardingLiftOff(world: World): void {
  const boarding = world.boarding;
  if (!boarding) return;
  const alive = friendlyUnits(world).filter((u) => u.alive);
  const inside = alive.filter((u) => dist(u.pos, boarding.center) <= boarding.radius);
  const outside = alive.filter((u) => dist(u.pos, boarding.center) > boarding.radius);
  // Alive captain, or the captain's wreck, inside the circle (項目5-2 10(b)).
  const captainIn = isInsideBoarding(world, world.leader);
  world.leftBehind = outside
    .filter((u) => u.kind === "wingman")
    .map((u) => ({ id: u.id, name: u.name, reason: isWingmanMobileFor(world, u.id) ? "outside_circle" : "no_circuit" }));
  if (outside.length > 0) pushLog(world, `置き去り：${outside.map((u) => u.name).join("・")}（搭乗円外のため回収せず）。`);
  if (inside.length > 0) pushLog(world, `回収完了：${inside.map((u) => u.name).join("・")}。`);
  const strandedById = new Map((world.strandedMechs ?? []).map((m) => [m.instanceId, m]));
  const recoveredLost = recoverStrandedAtLiftOff(world, boarding, captainIn);
  const recoveredLostMechs = recoveredLost.filter((id) => !strandedById.get(id)?.wreck);
  const recoveredOldWrecks = recoveredLost.filter((id) => strandedById.get(id)?.wreck);
  if (recoveredLostMechs.length > 0) pushLog(world, `置き去りだった機体を回収：${recoveredLostMechs.join("・")}（部隊に復帰）。`);
  // 項目5-1b W2 B: wrecks inside the circle (this sortie's and earlier ones) come home destroyed.
  const recoveredWrecks = recoverSortieWrecksAtLiftOff(world, boarding, captainIn);
  const wreckNames = [
    ...sortieWreckUnits(world).filter((u) => recoveredWrecks.includes(u.id)).map((u) => u.name),
    ...recoveredOldWrecks,
  ];
  if (wreckNames.length > 0) pushLog(world, `残骸を回収：${wreckNames.join("・")}（大破のまま格納庫へ）。`);
  world.recoveredEnemyUnits = world.enemies.filter(e => !e.alive && e.hp <= 0 && dist(e.pos, boarding.center) <= boarding.radius && captainIn);
  for (const e of world.recoveredEnemyUnits) if (e.enemyState) e.enemyState.recovered = true;
  const recoveredDrops = recoverStrandedDropsAtLiftOff(world, boarding, captainIn);
  if (recoveredDrops.length > 0) pushLog(world, `落とし物の回路を回収：${recoveredDrops.length}件。`);
  noteCircuitExtract(world, captainIn);
  world.boarding = null; world.camp = null; world.phase = "result";
  if (captainIn) {
    let circleCrates = 0;
    for (const c of world.containers) {
      if (c.taken) continue;
      if (dist(c.pos, boarding.center) <= boarding.radius) { c.taken = true; c.discovered = true; c.glowT = 0; circleCrates += 1; world.salvaged += 1; }
    }
    world.extracted = true; world.failReason = null;
    if (!world.leader.alive) {
      pushLog(world, circleCrates > 0
        ? `帰還成功（隊長の残骸を回収）。搭乗円内コンテナ ${circleCrates} を全回収（合計サルベージ ${world.salvaged}）。`
        : `帰還成功（隊長の残骸を回収）。サルベージ ${world.salvaged} を保持。`);
    } else {
      pushLog(world, circleCrates > 0 ? `帰還成功（隊長搭乗）。搭乗円内コンテナ ${circleCrates} を全回収（合計サルベージ ${world.salvaged}）。` : `帰還成功（隊長搭乗）。サルベージ ${world.salvaged} を保持。`);
    }
  } else { world.extracted = false; world.failReason = "extract_missed"; world.salvaged = 0; pushLog(world, "帰還失敗：隊長が搭乗円外のため離昇せず。"); }
}

function updateBoarding(world: World): void {
  const boarding = world.boarding;
  if (!boarding || world.phase !== "sortie") return;
  const elapsed = boardingElapsed(world);
  if (!boarding.cargoArrived && elapsed >= world.balance.boardingCargoDelaySec) { boarding.cargoArrived = true; pushLog(world, "貨物到着。離昇まで搭乗円内へ。"); }
  if (elapsed >= world.balance.boardingLiftOffDelaySec) resolveBoardingLiftOff(world);
}

function leaderAbortSalvageOnTimeout(world: World): void { for (const u of friendlyUnits(world)) { u.salvageId = null; u.salvageT = 0; } }

export function tickWorld(world: World, dt: number, input: PlayerInput): void {
  tickEnemyTag(world, dt); // Enemy PR1: the 「所属不明」 tag fades out
  if (world.phase !== "sortie") return;
  tickCombatFeedback(world, dt);
  beginMovementPowerTick(world);
  world.elapsed += dt; world.timeLeft = Math.max(0, world.timeLeft - dt);
  if (world.timeLeft <= 0 && !world.operationTimedOut) {
    world.operationTimedOut = true;
    leaderAbortSalvageOnTimeout(world);
    // A circle already out finishes as today's extract. Otherwise the sortie ends now.
    if (!world.boarding) {
      resolveForcedRescueTimeout(world);
      return;
    }
  }
  stepCircuitPlay(world, dt);
  expireEmptyBatteries(world);
  const timedOut = isOperationTimedOut(world);
  const waitingBoarding = timedOut && world.boarding != null;
  const leader = world.leader;
  // 項目5-2: a downed captain does not fail the sortie. A total wipe rescues at once.
  // While a timeout is waiting on a circle, that circle resolves the sortie (5-2b).
  if (!waitingBoarding && maybeAutoRescue(world)) return;
  const leaderDown = !leader.alive;
  if (leaderDown) noteLeaderDown(world);
  leader.cooldown = Math.max(0, leader.cooldown - dt);
  if (leaderDown || timedOut || wreckCarrierId(world, leader.id)) { leader.moveTarget = null; leader.vel = { x: 0, y: 0 }; }
  else {
    let fallback: Vec2 | null = leader.moveTarget;
    if (input.move.x !== 0 || input.move.y !== 0) { const n = norm(input.move); const reach = Math.max(world.balance.wasdMoveLookahead, world.balance.moveSpeed * unitMoveSpeedMul(leader, world) * abilityOf(world, leader.id).moveSpeed * dt); fallback = { x: leader.pos.x + n.x * reach, y: leader.pos.y + n.y * reach }; }
    else if (input.clickMove) fallback = { ...input.clickMove };
    const locked = movementLocked(world);
    const cruise = circuitLocomotion(world, leader, locked ? null : fallback, world.balance.moveSpeed * unitMoveSpeedMul(leader, world) * abilityOf(world, leader.id).moveSpeed);
    leader.moveTarget = cruise.target;
    if (!locked) updateCoverMovement(world, leader, input.move, dt);
    moveToward(leader, leader.moveTarget, cruise.speed, dt, world);
  }
  placeCarried(world);
  if (!leaderDown) {
    const focusing = world.circuitPlay?.rules === true && world.circuitPlay.order?.kind === "focus";
    const focus = focusTarget(world, leader);
    if (focusing) {
      if (focus) tryFire(world, leader, focus, false);
    } else {
      let leadTarget: Unit | null = null; let best: number = world.balance.engageRange * rangeMul(world, leader.id);
      for (const e of world.enemies) { if (!e.alive) continue; const d = dist(leader.pos, e.pos); if (d <= best) { best = d; leadTarget = e; } }
      const weaponReach = world.balance.weaponRange * rangeMul(world, leader.id);
      if (leadTarget && (input.fire || best <= weaponReach)) tryFire(world, leader, leadTarget, false);
    }
    if (!timedOut && !wreckCarrierId(world, leader.id) && !movementLocked(world)) {
      const playEdge = world.circuitPlay;
      if (playEdge?.rules) {
        if (input.interact && !playEdge.collectDown) applyCollectPress(world);
        playEdge.collectDown = input.interact;
      }
      const leaderWantSalvage = input.interact || world.containers.some((c) => c.discovered && !c.taken && dist(leader.pos, c.pos) < world.balance.interactRadius);
      updateSalvage(world, leader, leaderWantSalvage, dt);
    }
  }
  for (const w of world.wingmen) {
    if (!w.alive) continue;
    w.cooldown = Math.max(0, w.cooldown - dt);
    const riding = wreckCarrierId(world, w.id) != null;
    const intent = decideWingman(world, w, dt);
    const cruise = circuitLocomotion(world, w, intent.moveTarget, world.balance.moveSpeed * unitMoveSpeedMul(w, world) * abilityOf(world, w.id).moveSpeed /* 項目4-1: load 0 is 120 for wingmen too (2026-10-07 7:36 神宮) */);
    w.moveTarget = timedOut || riding ? null : cruise.target;
    // A living captain riding a wingman controls that carrier with WASD too.
    if (!timedOut && captainRescuer(world)?.id === w.id && (input.move.x || input.move.y)) {
      const direction = norm(input.move);
      const reach = Math.max(world.balance.wasdMoveLookahead, cruise.speed * dt);
      w.moveTarget = { x: w.pos.x + direction.x * reach, y: w.pos.y + direction.y * reach };
    }
    if (timedOut) w.vel = { x: 0, y: 0 };
    else moveToward(w, w.moveTarget, cruise.speed, dt, world);
    placeCarried(world);
    const focusing = world.circuitPlay?.rules === true && world.circuitPlay.order?.kind === "focus";
    const focus = focusTarget(world, w);
    if (focusing) {
      if (focus) { w.engageWarnT = Math.max(w.engageWarnT, world.balance.wingEngageWarnSec * 0.75); tryFire(world, w, focus, false); }
    } else if (intent.fireAt) { w.engageWarnT = Math.max(w.engageWarnT, world.balance.wingEngageWarnSec * 0.75); tryFire(world, w, intent.fireAt, false); }
    if (!timedOut && !riding && !movementLocked(world)) updateSalvage(world, w, intent.trySalvage || wingRecoverWantsSalvage(world, w), dt);
  }
  placeCarried(world);
  spawnRecall(world);
  updateEnemies(world, dt); updateBullets(world, dt); handleEnemyDeaths(world); collectSupplies(world); revealVision(world);
  // 項目4-1 C6: a destroyed carrier drops its containers on the spot (wrecks: circuitPlay placeCarried).
  for (const u of friendlyUnits(world)) if (!u.alive && u.salvagedCount > 0) { const n = dropUnitCargoToField(world, u); if (n > 0) pushLog(world, `${u.kind === "leader" ? "隊長機" : u.name}が大破：積載していたコンテナ ${n} をその場に落とした。`); }
  for (const c of world.containers) if (c.glowT > 0) c.glowT = Math.max(0, c.glowT - dt);
  for (const w of world.wingmen) { if (w.hitWarnT > 0) w.hitWarnT = Math.max(0, w.hitWarnT - dt); if (w.engageWarnT > 0) w.engageWarnT = Math.max(0, w.engageWarnT - dt); if ((w.questionT ?? 0) > 0) w.questionT = Math.max(0, (w.questionT ?? 0) - dt); }
  placeCarried(world);
  if (!world.leader.alive) noteLeaderDown(world);
  // A wipe during this tick rescues before a boarding circle can lift off (6A),
  // except a timeout that is already waiting on that circle (5-2b).
  if (!(isOperationTimedOut(world) && world.boarding) && maybeAutoRescue(world)) return;
  updateCamera(world); updateBoarding(world);
}

export function isWingmanOffscreen(world: World, wing: Unit): boolean { return !inCamera(world, wing.pos); }
