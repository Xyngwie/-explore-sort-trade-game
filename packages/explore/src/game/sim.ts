import { decideWingman } from "./brain";
import { onSalvageCompleted, pushLog } from "./orders";
import { angleOf, clamp, dist, dist2, norm, type Vec2 } from "./math";
import type { Bullet, Unit, World } from "./types";

function friendlyUnits(world: World): Unit[] {
  return [world.leader, ...world.wingmen];
}

function moveToward(unit: Unit, target: Vec2 | null, speed: number, dt: number, world: World): void {
  if (!target || !unit.alive) {
    unit.vel = { x: 0, y: 0 };
    return;
  }
  const d = dist(unit.pos, target);
  if (d < 4) {
    unit.vel = { x: 0, y: 0 };
    return;
  }
  const dir = norm({ x: target.x - unit.pos.x, y: target.y - unit.pos.y });
  unit.vel = { x: dir.x * speed, y: dir.y * speed };
  unit.heading = Math.atan2(dir.y, dir.x);
  unit.pos.x = clamp(unit.pos.x + unit.vel.x * dt, 20, world.balance.worldW - 20);
  unit.pos.y = clamp(unit.pos.y + unit.vel.y * dt, 20, world.balance.worldH - 20);
}

function revealVision(world: World): void {
  const r = world.balance.visionRange;
  const r2 = r * r;
  for (const u of friendlyUnits(world)) {
    if (!u.alive) continue;
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

function spawnBullet(
  world: World,
  from: Unit,
  to: Unit,
  fromEnemy: boolean,
): void {
  const dir = norm({ x: to.pos.x - from.pos.x, y: to.pos.y - from.pos.y });
  const speed = world.balance.bulletSpeed;
  const b: Bullet = {
    alive: true,
    pos: { ...from.pos },
    vel: { x: dir.x * speed, y: dir.y * speed },
    ttl: 1.2,
    damage: fromEnemy ? world.balance.enemyDamage : world.balance.bulletDamage,
    fromEnemy,
    ownerId: from.id,
  };
  world.bullets.push(b);
}

function tryFire(world: World, from: Unit, target: Unit, fromEnemy: boolean): void {
  if (!from.alive || !target.alive || from.cooldown > 0) return;
  if (dist(from.pos, target.pos) > world.balance.weaponRange) return;
  if (!fromEnemy) {
    if (world.ammo <= 0) return;
    world.ammo -= 1;
  }
  from.cooldown = world.balance.fireCooldown;
  from.heading = angleOf(from.pos, target.pos);
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
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;

    const targets = b.fromEnemy ? friendlyUnits(world) : world.enemies;
    for (const t of targets) {
      if (!t.alive) continue;
      if (dist(b.pos, t.pos) <= t.radius + 4) {
        b.alive = false;
        t.hp -= b.damage;
        if (!b.fromEnemy) {
          // friendly fire hit on enemy
        } else {
          world.combatHitsTaken += 1;
        }
        if (t.hp <= 0) {
          t.alive = false;
          t.hp = 0;
          const killer = b.fromEnemy
            ? "敵"
            : friendlyUnits(world).find((u) => u.id === b.ownerId)?.name ?? "分隊";
          reportBattle(world, `${killer} が ${t.name} を撃破`, t.pos);
        } else if (!inCamera(world, t.pos) || !inCamera(world, b.pos)) {
          reportBattle(
            world,
            `${t.name} が被弾 (−${b.damage})`,
            t.pos,
          );
        }
        break;
      }
    }
  }
  world.bullets = world.bullets.filter((b) => b.alive);
}

function updateSalvage(world: World, unit: Unit, want: boolean, dt: number): void {
  if (!unit.alive) return;
  if (unit.salvagedCount >= unit.capacity) return;
  if (world.salvaged >= world.carrierCapacity) return;

  if (!want && !unit.salvageId) return;

  let crate = unit.salvageId
    ? world.containers.find((c) => c.id === unit.salvageId)
    : world.containers.find(
        (c) =>
          c.discovered &&
          !c.taken &&
          dist(unit.pos, c.pos) < world.balance.interactRadius,
      );

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
  if (unit.salvageT >= world.balance.salvageSeconds) {
    crate.taken = true;
    onSalvageCompleted(world, unit);
  }
}

function updateEnemies(world: World, dt: number): void {
  for (const e of world.enemies) {
    if (!e.alive) continue;
    e.cooldown = Math.max(0, e.cooldown - dt);
    let nearest: Unit | null = null;
    let best = Infinity;
    for (const u of friendlyUnits(world)) {
      if (!u.alive) continue;
      const d = dist(e.pos, u.pos);
      if (d < best) {
        best = d;
        nearest = u;
      }
    }
    if (!nearest) continue;
    if (best < world.balance.visionRange * 1.2) {
      moveToward(e, nearest.pos, world.balance.enemySpeed, dt, world);
      if (best < world.balance.weaponRange) tryFire(world, e, nearest, true);
    }
  }
}

function updateCamera(world: World): void {
  const lead = world.leader.pos;
  world.camera.x = clamp(
    lead.x - world.camera.w * 0.4,
    0,
    world.balance.worldW - world.camera.w,
  );
  world.camera.y = clamp(
    lead.y - world.camera.h * 0.5,
    0,
    world.balance.worldH - world.camera.h,
  );
}

export type PlayerInput = {
  move: Vec2;
  /** Leader click-to-move target in world space. */
  clickMove: Vec2 | null;
  fire: boolean;
  interact: boolean;
};

export function tickWorld(world: World, dt: number, input: PlayerInput): void {
  if (world.phase !== "sortie") return;

  world.elapsed += dt;
  world.timeLeft = Math.max(0, world.timeLeft - dt);
  if (world.timeLeft <= 0) {
    world.phase = "result";
    world.extracted = false;
    world.failReason = "timeout";
    world.salvaged = 0;
    pushLog(world, "時間切れ。未脱出のため失敗。");
    return;
  }

  const leader = world.leader;
  if (!leader.alive) {
    world.phase = "result";
    world.extracted = false;
    world.failReason = "leader_down";
    world.salvaged = 0;
    pushLog(world, "隊長撃破。作戦失敗。");
    return;
  }

  leader.cooldown = Math.max(0, leader.cooldown - dt);

  // Leader movement: WASD vector wins; else click target.
  if (input.move.x !== 0 || input.move.y !== 0) {
    const n = norm(input.move);
    leader.moveTarget = {
      x: leader.pos.x + n.x * 40,
      y: leader.pos.y + n.y * 40,
    };
  } else if (input.clickMove) {
    leader.moveTarget = { ...input.clickMove };
  }
  moveToward(leader, leader.moveTarget, world.balance.moveSpeed, dt, world);

  // Leader fire: movement stays player-led; auto-engage nearest threat in weapon
  // range (escort-style reaction fire). Space/F also requests the same shot.
  let leadTarget: Unit | null = null;
  let best: number = world.balance.engageRange;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const d = dist(leader.pos, e.pos);
    if (d <= best) {
      best = d;
      leadTarget = e;
    }
  }
  if (
    leadTarget &&
    (input.fire || best <= world.balance.weaponRange)
  ) {
    tryFire(world, leader, leadTarget, false);
  }

  updateSalvage(world, leader, input.interact, dt);

  for (const w of world.wingmen) {
    if (!w.alive) continue;
    w.cooldown = Math.max(0, w.cooldown - dt);
    const intent = decideWingman(world, w, dt);
    w.moveTarget = intent.moveTarget;
    moveToward(w, intent.moveTarget, world.balance.wingmanSpeed, dt, world);
    if (intent.fireAt) tryFire(world, w, intent.fireAt, false);
    updateSalvage(world, w, intent.trySalvage, dt);
  }

  updateEnemies(world, dt);
  updateBullets(world, dt);
  revealVision(world);
  updateCamera(world);
}

/** True if unit is within the shared extract radius. */
export function isInsideExtract(world: World, unit: Unit): boolean {
  return dist(unit.pos, world.extract.pos) <= world.extract.radius;
}

export type ExtractReadiness = {
  ready: boolean;
  /** Alive friendlies currently outside the extract radius. */
  missing: Unit[];
  /** Alive friendlies (leader + wingmen). */
  aliveCount: number;
};

/** All living friendlies must be in extract radius; dead wingmen do not block. */
export function extractReadiness(world: World): ExtractReadiness {
  const alive = friendlyUnits(world).filter((u) => u.alive);
  const missing = alive.filter((u) => !isInsideExtract(world, u));
  return {
    ready: missing.length === 0 && alive.length > 0 && world.leader.alive,
    missing,
    aliveCount: alive.length,
  };
}

export function tryExtract(world: World): boolean {
  if (world.phase !== "sortie" || !world.leader.alive) return false;
  const status = extractReadiness(world);
  if (!status.ready) {
    if (status.missing.length === 0) {
      pushLog(world, "抽出ポイントに到達していません。");
    } else if (status.missing.length === 1) {
      const u = status.missing[0]!;
      pushLog(
        world,
        `脱出未準備：${u.name} が抽出圏外です。生存友軍は全員 EXTRACT 内へ。`,
      );
    } else {
      const names = status.missing.map((u) => u.name).join("・");
      pushLog(
        world,
        `脱出未準備：${status.missing.length}名が抽出圏外（${names}）。生存友軍は全員 EXTRACT 内へ。`,
      );
    }
    return false;
  }
  world.phase = "result";
  world.extracted = true;
  world.failReason = null;
  pushLog(world, "脱出成功。");
  return true;
}

export function isWingmanOffscreen(world: World, wing: Unit): boolean {
  return !inCamera(world, wing.pos);
}
