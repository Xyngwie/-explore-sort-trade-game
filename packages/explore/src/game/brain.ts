import { BALANCE } from "./balance";
import { canSee, enemyVisibleToSquad, ghostOf, ghostTrust, squadSees } from "./vision";
import { dist, dist2, type Vec2 } from "./math";
import {
  abortSalvage,
  containerNearWaypoint,
  recoverClaimedContainerIds,
} from "./orders";
import { isWingmanMobileFor } from "./commandUnlock";
import { dropLearningCargoForUnit, rangeMul, visionMul, wingRecoverWantsSalvage } from "./circuitPlay";
import { canTakeContainer, unitLoad, wreckCarrierId } from "./carry";
import {
  chooseLearningAction,
  isLearningWingman,
  LEARNING_DECISION_SEC,
  noteLearningEvent,
  openLearningActions,
  readLearningAction,
  type LearningAction,
  type LearningPickContext,
  type LearningStage,
  type LearningSubject,
  highestCargoSubjectForUnit,
} from "./learning";
import { isOperationTimedOut } from "./orders";
import type { Container, Unit, WingmanIntent, World } from "./types";

function nearestAliveEnemy(pos: Vec2, enemies: Unit[], maxRange?: number, ok?: (e: Unit) => boolean): Unit | null {
  let best: Unit | null = null;
  let bestD = maxRange != null ? maxRange * maxRange : Infinity;
  for (const e of enemies) {
    if (!e.alive || (ok && !ok(e))) continue;
    const d = dist2(pos, e.pos);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function nearestDiscoveredContainer(
  pos: Vec2,
  containers: Container[],
  excludeIds?: Set<string>,
  world?: World,
): Container | null {
  let best: Container | null = null;
  let bestD = Infinity;
  for (const c of containers) {
    if (!c.discovered) continue;
    if (excludeIds?.has(c.id)) continue;
    // PR2: decide from squad knowledge. Seen now → the truth; otherwise its faint image
    // (assumed still there; older = lower priority; ~120 s old = not trusted).
    let trust = 1;
    if (world && !squadSees(world, c.pos)) {
      const g = ghostOf(world, "container", c.id);
      trust = g ? ghostTrust(world, g) : 0;
      if (trust <= 0) continue;
    } else if (c.taken) continue;
    const d = dist2(pos, c.pos) / (trust * trust);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function escortOffset(
  leader: Unit,
  side: number,
  opts?: { followMul?: number; sideMul?: number },
): Vec2 {
  const b = BALANCE;
  const follow = b.escortFollowDist * (opts?.followMul ?? 1);
  const sideOff = side * (opts?.sideMul ?? 1);
  const lh = leader.moveHeading ?? leader.heading; // formation follows travel, not facing
  const hx = Math.cos(lh);
  const hy = Math.sin(lh);
  return {
    x: leader.pos.x - hx * follow + -hy * sideOff,
    y: leader.pos.y - hy * follow + hx * sideOff,
  };
}

/**
 * Coherent patrol: orbit around waypoint or leader.
 * Never "straight-line to a weird point then destination".
 */
export function nextPatrolOrbitTarget(
  self: Unit,
  center: Vec2,
  dt: number,
): Vec2 {
  const b = BALANCE;
  self.patrolAngle += b.patrolAngularSpeed * dt;
  const wobble = Math.sin(self.patrolAngle * b.patrolWobbleFreq) * b.patrolWobbleAmp;
  const r = b.patrolRadius + wobble;
  return {
    x: center.x + Math.cos(self.patrolAngle) * r,
    y: center.y + Math.sin(self.patrolAngle) * r,
  };
}

function noteLearningContainerSalvageAbort(world: World, unit: Unit): void {
  if (!(unit.salvageId != null || unit.salvageT > 0)) return;
  if (!isLearningWingman(unit)) return;
  if (readLearningAction(unit) !== "carry") return;
  const instanceId = unit.instanceId!.trim();
  world.mechLearningWork ??= {};
  const stage = buildLearningStage(world, unit);
  const action = readLearningAction(unit);
  const cells = world.mechLearningWork[instanceId] ?? [];
  world.mechLearningWork[instanceId] = noteLearningEvent(cells, stage, action, {
    kind: "quizFailure",
    subject: "container",
  });
}

export function decideWingman(world: World, self: Unit, dt: number): WingmanIntent {
  const b = world.balance;
  const shared = (e: Unit) => enemyVisibleToSquad(world, e) || canSee(world, self, e.pos);
  const weaponRange = b.weaponRange * rangeMul(world, self.id);
  const visionRange = b.visionRange * visionMul(world, self.id);
  const leader = world.leader;
  // No wing_mobility (release mode, no unlocking circuit): stand still and only
  // shoot enemies already within weapon range. No follow / chase / collect.
  if (!isWingmanMobileFor(world, self.id) || wreckCarrierId(world, self.id)) {
    // 項目4-2 C1: a palette 「回収」 runs its own salvage channel (circuitPlay) — keep it.
    if (self.salvageId && !wingRecoverWantsSalvage(world, self)) {
      noteLearningContainerSalvageAbort(world, self);
      abortSalvage(self);
    }
    return {
      moveTarget: null,
      fireAt: nearestAliveEnemy(self.pos, world.enemies, weaponRange, shared),
      trySalvage: false,
    };
  }

  // C20-b "stop" after an order it could not follow: hold in place, shoot only
  // enemies already in weapon range, no salvage, until the next order.
  if (self.holdOrder) {
    if (self.salvageId) {
      noteLearningContainerSalvageAbort(world, self);
      abortSalvage(self);
    }
    return {
      moveTarget: null,
      fireAt: nearestAliveEnemy(self.pos, world.enemies, weaponRange, shared),
      trySalvage: false,
    };
  }

  // PR2: chase only what this mech sees itself; shoot (turn + fire) at anything the squad sees in range.
  const ownSeen = nearestAliveEnemy(self.pos, world.enemies, visionRange * b.visionHuntMul * 2, (e) => canSee(world, self, e.pos));
  const enemy = ownSeen ?? nearestAliveEnemy(self.pos, world.enemies, weaponRange, shared);
  const canChase = enemy != null && enemy === ownSeen;
  const enemyDist = enemy ? dist(self.pos, enemy.pos) : Infinity;

  switch (self.stance) {
    case "escort": {
      const side = self.id.endsWith("a") ? -b.escortSide : b.escortSide;
      const cling = self.quirk === "cling";
      const followMul = cling ? b.quirkClingFollowMul : 1;
      const sideMul = cling ? b.quirkClingSideMul : 1;
      const engageR =
        self.quirk === "decoy"
          ? b.engageRange * b.quirkDecoyEngageMul
          : self.quirk === "sniper"
            ? b.engageRange * b.quirkSniperEngageMul
            : b.engageRange;
      return {
        moveTarget: escortOffset(leader, side, { followMul, sideMul }),
        fireAt: enemy && enemyDist < engageR ? enemy : null,
        trySalvage: false,
      };
    }
    case "patrol": {
      const center = self.waypoint ?? { ...leader.pos };
      // Keep orbiting every tick so path stays a sweep, not a one-shot ray.
      const orbit = nextPatrolOrbitTarget(self, center, dt);
      const react =
        enemy && enemyDist < b.engageRange
          ? { moveTarget: canChase ? enemy.pos : orbit, fireAt: enemy as Unit | null }
          : { moveTarget: orbit, fireAt: null };
      // Soft leash: if reacting but far from center, prefer orbit.
      if (
        react.fireAt &&
        dist(self.pos, center) > b.patrolRadius * b.patrolLeashMul
      ) {
        return { moveTarget: orbit, fireAt: react.fireAt, trySalvage: false };
      }
      return { ...react, trySalvage: false };
    }
    case "recover": {
      // 項目4-1 C4: full (cap 2, a wreck fills it) → stop seeking and stay with the leader.
      if (!canTakeContainer(world, self)) {
        return { moveTarget: escortOffset(leader, 0), fireAt: enemy && enemyDist < weaponRange ? enemy : null, trySalvage: false };
      }
      if (self.salvageId) {
        return {
          moveTarget: null,
          fireAt: enemy && enemyDist < weaponRange * b.recoverChannelFireMul ? enemy : null,
          trySalvage: true,
        };
      }
      const claimed = recoverClaimedContainerIds(world, self.id);
      const assigned = containerNearWaypoint(world, self.waypoint);
      const c =
        assigned ??
        nearestDiscoveredContainer(self.pos, world.containers, claimed, world);
      if (c) {
        const near = dist(self.pos, c.pos) < b.interactRadius;
        return {
          moveTarget: near ? null : { ...c.pos },
          fireAt: enemy && enemyDist < weaponRange * b.recoverSeekFireMul ? enemy : null,
          trySalvage: near,
        };
      }
      // Secondary approach goal (no free crate): honor distinct waypoint.
      if (self.waypoint && dist(self.pos, self.waypoint) > b.waypointArriveDist) {
        return {
          moveTarget: { ...self.waypoint },
          fireAt: enemy && enemyDist < weaponRange * b.recoverSeekFireMul ? enemy : null,
          trySalvage: false,
        };
      }
      return {
        moveTarget: escortOffset(leader, 0),
        fireAt: null,
        trySalvage: false,
      };
    }
    case "raid": {
      // Autonomous aggression — no player click target required.
      // Optional waypoint = scatter-search fan-out (散開捜索); cleared on arrive.
      // Prefer fan-out until arrived so wingmen do not stack on one hunt vector;
      // only break for a local engage-range threat.
      // Light quirk bias: cling stays closer to leader, decoy rushes in,
      // sniper holds weaponRange stand-off.
      const engageR =
        self.quirk === "decoy"
          ? b.engageRange * b.quirkDecoyEngageMul
          : self.quirk === "sniper"
            ? b.engageRange * b.quirkSniperEngageMul
            : b.engageRange;
      const rushFrac =
        self.quirk === "decoy"
          ? b.quirkDecoyRushFrac
          : self.quirk === "sniper"
            ? b.quirkSniperStandFrac
            : b.raidDefaultRushFrac;
      const raidStandOff = (foe: Unit) => {
        const d = dist(self.pos, foe.pos);
        const rush = weaponRange * rushFrac;
        const dx = foe.pos.x - self.pos.x;
        const dy = foe.pos.y - self.pos.y;
        const len = Math.hypot(dx, dy) || 1;
        // Cling: bias stand-off toward leader so bait stays near captain.
        if (self.quirk === "cling") {
          const toLead = {
            x: leader.pos.x - foe.pos.x,
            y: leader.pos.y - foe.pos.y,
          };
          const ll = Math.hypot(toLead.x, toLead.y) || 1;
          return {
            moveTarget: {
              x: foe.pos.x + (toLead.x / ll) * (rush * b.quirkClingRushBias),
              y: foe.pos.y + (toLead.y / ll) * (rush * b.quirkClingRushBias),
            },
            fireAt: d < engageR * b.raidEngageFireMul ? foe : null,
            trySalvage: false as const,
          };
        }
        return {
          moveTarget: {
            x: foe.pos.x - (dx / len) * rush,
            y: foe.pos.y - (dy / len) * rush,
          },
          fireAt: d < engageR * b.raidEngageFireMul ? foe : null,
          trySalvage: false as const,
        };
      };
      const local = nearestAliveEnemy(self.pos, world.enemies, engageR);
      if (local) return raidStandOff(local);
      if (self.waypoint) {
        if (dist(self.pos, self.waypoint) > b.waypointArriveDist) {
          return {
            moveTarget: { ...self.waypoint },
            fireAt: null,
            trySalvage: false,
          };
        }
        self.waypoint = null;
      }
      const hunt =
        nearestAliveEnemy(self.pos, world.enemies, visionRange * b.visionRaidHuntMul, shared) ??
        nearestAliveEnemy(self.pos, world.enemies);
      if (hunt) return raidStandOff(hunt);
      // No enemies: loiter near leader without consuming a click target.
      // Cling loiters tighter; decoy wider.
      const loiterR =
        self.quirk === "cling"
          ? b.raidLoiterCling
          : self.quirk === "decoy"
            ? b.raidLoiterDecoy
            : b.raidLoiterDefault;
      self.patrolAngle += b.patrolAngularSpeed * b.raidLoiterAngularMul * dt;
      return {
        moveTarget: {
          x: leader.pos.x + Math.cos(self.patrolAngle) * loiterR,
          y: leader.pos.y + Math.sin(self.patrolAngle) * loiterR,
        },
        fireAt: null,
        trySalvage: false,
      };
    }
  }
}

function learningCircle(world: World, unit: Unit): LearningStage["circle"] {
  const boarding = world.boarding;
  const center = boarding?.center ?? world.extract.pos;
  const radius = boarding?.radius ?? world.extract.radius;
  const vision = world.balance.visionRange * visionMul(world, unit.id);
  const d = dist(unit.pos, center);
  if (boarding && dist(unit.pos, center) <= radius) return "inside";
  if (d <= radius + vision) return "close";
  return "late";
}

function learningDistance(world: World, unit: Unit, target: Vec2 | null): LearningStage["distance"] {
  const weaponRange = world.balance.weaponRange * rangeMul(world, unit.id);
  const visionRange = world.balance.visionRange * visionMul(world, unit.id);
  if (!target) {
    const d = dist(unit.pos, world.leader.pos);
    if (d <= weaponRange) return "near";
    if (d <= visionRange) return "mid";
    return "far";
  }
  const d = dist(unit.pos, target);
  if (d <= weaponRange) return "near";
  if (d <= visionRange) return "mid";
  return "far";
}

function learningCargoState(world: World, unit: Unit): LearningStage["cargo"] {
  const load = unitLoad(world, unit);
  if (load > 0) return "holding";
  if (unit.droppedThisSortie) return "dropped";
  return "none";
}

function wreckSubject(world: World, wreckUnitId: string): "circuit" | "wreck" {
  const ids = world.circuitIdsByUnit[wreckUnitId] ?? [];
  return ids.length > 0 ? "circuit" : "wreck";
}

function learningFocusTarget(world: World, unit: Unit): Vec2 | null {
  const shared = (e: Unit) => enemyVisibleToSquad(world, e) || canSee(world, unit, e.pos);
  const enemy = nearestAliveEnemy(unit.pos, world.enemies, undefined, shared);
  if (enemy) return enemy.pos;
  if (unit.stance === "recover") {
    const claimed = recoverClaimedContainerIds(world, unit.id);
    const assigned = containerNearWaypoint(world, unit.waypoint);
    const c =
      assigned ??
      nearestDiscoveredContainer(unit.pos, world.containers, claimed, world);
    if (c) return c.pos;
  }
  return world.leader.pos;
}

export function buildLearningStage(world: World, unit: Unit): LearningStage {
  const focus = learningFocusTarget(world, unit);
  return {
    distance: learningDistance(world, unit, focus),
    circle: learningCircle(world, unit),
    hp: unit.alive && unit.maxHp > 0 && unit.hp / unit.maxHp > 0.5 ? "high" : "low",
    cargo: learningCargoState(world, unit),
  };
}

function learningPickContext(world: World, unit: Unit): LearningPickContext {
  const shared = (e: Unit) => enemyVisibleToSquad(world, e) || canSee(world, unit, e.pos);
  const seesEnemy = nearestAliveEnemy(unit.pos, world.enemies, undefined, shared) != null;
  const recoverSalvageOk = Boolean(
    unit.stance === "recover" &&
      (canTakeContainer(world, unit) ||
        !!unit.salvageId ||
        world.containers.some((c) => c.discovered && !c.taken)),
  );
  const carrySubject: LearningSubject = "container";
  return {
    stance: unit.stance,
    alive: unit.alive,
    timedOut: isOperationTimedOut(world),
    unitLoad: unitLoad(world, unit),
    droppedThisSortie: !!unit.droppedThisSortie,
    hasBoarding: world.boarding != null,
    seesEnemy,
    recoverSalvageOk,
    decisionCount: unit.learningDecisionCount ?? 0,
    subjects: {
      fight: "normal",
      carry: carrySubject,
      drop: highestCargoSubjectForUnit(world, unit),
      holdTransport: highestCargoSubjectForUnit(world, unit),
    },
  };
}

function learningFightEnemy(world: World, unit: Unit): Unit | null {
  const shared = (e: Unit) => enemyVisibleToSquad(world, e) || canSee(world, unit, e.pos);
  return nearestAliveEnemy(unit.pos, world.enemies, undefined, shared);
}

export function learningActionComplete(world: World, unit: Unit): boolean {
  const action = readLearningAction(unit);
  if (action === "fight") {
    const foe = unit.learningFightEnemyId
      ? world.enemies.find((e) => e.id === unit.learningFightEnemyId) ?? null
      : null;
    if (!foe || !foe.alive) return true;
    return !enemyVisibleToSquad(world, foe) && !canSee(world, unit, foe.pos);
  }
  if (action === "carry") {
    if (!unit.salvageId) return unit.learningDecisionAt != null;
    return false;
  }
  if (action === "drop") return unit.learningDropPending !== true && !!unit.droppedThisSortie;
  if (action === "extract") return world.boarding == null;
  return false;
}

export function refreshLearningDecision(world: World, unit: Unit): void {
  if (!isLearningWingman(unit) || !unit.alive) return;
  const instanceId = unit.instanceId!.trim();
  world.mechLearningWork ??= {};
  const cells = world.mechLearningWork[instanceId] ?? [];
  const stage = buildLearningStage(world, unit);
  const ctx = learningPickContext(world, unit);
  const menu = openLearningActions(ctx);
  if (menu.length === 0) return;
  const needsPick =
    unit.learningDecisionAt == null ||
    world.elapsed - unit.learningDecisionAt >= LEARNING_DECISION_SEC ||
    learningActionComplete(world, unit);
  if (!needsPick) return;
  const picked = chooseLearningAction(cells, ctx, stage);
  world.mechLearningWork[instanceId] = picked.cells;
  unit.learningAction = picked.action;
  unit.learningDecisionCount = (unit.learningDecisionCount ?? 0) + 1;
  unit.learningDecisionAt = world.elapsed;
  unit.learningDropPending = picked.action === "drop";
  if (picked.action === "drop") {
    const droppedSubjects = new Set<"container" | "circuit" | "wreck">();
    if (unit.salvagedCount > 0) droppedSubjects.add("container");
    for (const wreckId of world.circuitPlay?.carry?.[unit.id] ?? []) {
      droppedSubjects.add(wreckSubject(world, wreckId) === "circuit" ? "circuit" : "wreck");
    }
    dropLearningCargoForUnit(world, unit);
    const stage = buildLearningStage(world, unit);
    const action = readLearningAction(unit);
    let cells = world.mechLearningWork![instanceId] ?? [];
    for (const subject of droppedSubjects) {
      cells = noteLearningEvent(cells, stage, action, { kind: "quizFailure", subject });
    }
    world.mechLearningWork![instanceId] = cells;
    unit.learningDropPending = false;
  }
  if (picked.action === "fight") {
    const foe = learningFightEnemy(world, unit);
    unit.learningFightEnemyId = foe?.id ?? null;
  } else {
    unit.learningFightEnemyId = null;
  }
}

function fightIntent(world: World, self: Unit, dt: number): WingmanIntent {
  if (!isWingmanMobileFor(world, self.id) || wreckCarrierId(world, self.id)) {
    return decideWingman(world, self, dt);
  }
  const b = world.balance;
  const weaponRange = b.weaponRange * rangeMul(world, self.id);
  const shared = (e: Unit) => enemyVisibleToSquad(world, e) || canSee(world, self, e.pos);
  const foe =
    (self.learningFightEnemyId
      ? world.enemies.find((e) => e.id === self.learningFightEnemyId && e.alive)
      : null) ?? learningFightEnemy(world, self);
  if (!foe) return decideWingman(world, self, dt);
  const enemyDist = dist(self.pos, foe.pos);
  const engageR =
    self.quirk === "decoy"
      ? b.engageRange * b.quirkDecoyEngageMul
      : self.quirk === "sniper"
        ? b.engageRange * b.quirkSniperEngageMul
        : b.engageRange;
  const rushFrac =
    self.quirk === "decoy"
      ? b.quirkDecoyRushFrac
      : self.quirk === "sniper"
        ? b.quirkSniperStandFrac
        : b.raidDefaultRushFrac;
  const dx = foe.pos.x - self.pos.x;
  const dy = foe.pos.y - self.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  const rush = weaponRange * rushFrac;
  const leader = world.leader;
  let moveTarget: Vec2;
  if (self.quirk === "cling") {
    const toLead = { x: leader.pos.x - foe.pos.x, y: leader.pos.y - foe.pos.y };
    const ll = Math.hypot(toLead.x, toLead.y) || 1;
    moveTarget = {
      x: foe.pos.x + (toLead.x / ll) * (rush * b.quirkClingRushBias),
      y: foe.pos.y + (toLead.y / ll) * (rush * b.quirkClingRushBias),
    };
  } else {
    moveTarget = { x: foe.pos.x - (dx / len) * rush, y: foe.pos.y - (dy / len) * rush };
  }
  return {
    moveTarget,
    fireAt: enemyDist < engageR * b.raidEngageFireMul ? foe : null,
    trySalvage: false,
  };
}

function fleeIntent(world: World, self: Unit): WingmanIntent {
  if (!isWingmanMobileFor(world, self.id) || wreckCarrierId(world, self.id)) {
    return { moveTarget: null, fireAt: null, trySalvage: false };
  }
  const side = self.id.endsWith("a") ? -world.balance.escortSide : world.balance.escortSide;
  return { moveTarget: escortOffset(world.leader, side), fireAt: null, trySalvage: false };
}

function extractIntent(world: World, self: Unit): WingmanIntent {
  if (!isWingmanMobileFor(world, self.id) || wreckCarrierId(world, self.id)) {
    return { moveTarget: null, fireAt: null, trySalvage: false };
  }
  const c = world.boarding?.center ?? world.extract.pos;
  return { moveTarget: { ...c }, fireAt: null, trySalvage: false };
}

export function wingmanIntent(world: World, self: Unit, dt: number): WingmanIntent {
  if (!isLearningWingman(self)) return decideWingman(world, self, dt);
  // Release without wing_mobility keeps legacy decideWingman (no move/fire learning).
  if (!isWingmanMobileFor(world, self.id) || wreckCarrierId(world, self.id) || self.holdOrder) {
    return decideWingman(world, self, dt);
  }
  refreshLearningDecision(world, self);
  const action: LearningAction = readLearningAction(self);
  if (action === "hold") return decideWingman(world, self, dt);
  if (action === "fight") return fightIntent(world, self, dt);
  if (action === "flee" || action === "drop") return fleeIntent(world, self);
  if (action === "extract") return extractIntent(world, self);
  if (action === "carry") {
    const intent = decideWingman(world, self, dt);
    return { ...intent, fireAt: null };
  }
  return decideWingman(world, self, dt);
}
