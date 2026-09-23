import { BALANCE } from "./balance";
import { dist, dist2, type Vec2 } from "./math";
import {
  containerNearWaypoint,
  recoverClaimedContainerIds,
} from "./orders";
import type { Container, Unit, WingmanIntent, World } from "./types";

function nearestAliveEnemy(pos: Vec2, enemies: Unit[], maxRange?: number): Unit | null {
  let best: Unit | null = null;
  let bestD = maxRange != null ? maxRange * maxRange : Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
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
): Container | null {
  let best: Container | null = null;
  let bestD = Infinity;
  for (const c of containers) {
    if (c.taken || !c.discovered) continue;
    if (excludeIds?.has(c.id)) continue;
    const d = dist2(pos, c.pos);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function escortOffset(
  leader: Unit,
  side: number,
  opts?: { followMul?: number; sideMul?: number },
): Vec2 {
  const b = BALANCE;
  const follow = b.escortFollowDist * (opts?.followMul ?? 1);
  const sideOff = side * (opts?.sideMul ?? 1);
  const hx = Math.cos(leader.heading);
  const hy = Math.sin(leader.heading);
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
  const wobble = Math.sin(self.patrolAngle * 2.1) * 10;
  const r = b.patrolRadius + wobble;
  return {
    x: center.x + Math.cos(self.patrolAngle) * r,
    y: center.y + Math.sin(self.patrolAngle) * r,
  };
}

export function decideWingman(world: World, self: Unit, dt: number): WingmanIntent {
  const b = world.balance;
  const leader = world.leader;
  const enemy = nearestAliveEnemy(self.pos, world.enemies, b.visionRange * 1.25);
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
          ? { moveTarget: enemy.pos, fireAt: enemy as Unit | null }
          : { moveTarget: orbit, fireAt: null };
      // Soft leash: if reacting but far from center, prefer orbit.
      if (
        react.fireAt &&
        dist(self.pos, center) > b.patrolRadius * 1.8
      ) {
        return { moveTarget: orbit, fireAt: react.fireAt, trySalvage: false };
      }
      return { ...react, trySalvage: false };
    }
    case "recover": {
      // No hard carry MAX — keep channeling current crate, else seek next.
      if (self.salvageId) {
        return {
          moveTarget: null,
          fireAt: enemy && enemyDist < b.weaponRange * 0.7 ? enemy : null,
          trySalvage: true,
        };
      }
      const claimed = recoverClaimedContainerIds(world, self.id);
      const assigned = containerNearWaypoint(world, self.waypoint);
      const c =
        assigned ??
        nearestDiscoveredContainer(self.pos, world.containers, claimed);
      if (c) {
        const near = dist(self.pos, c.pos) < b.interactRadius;
        return {
          moveTarget: near ? null : { ...c.pos },
          fireAt: enemy && enemyDist < b.weaponRange * 0.65 ? enemy : null,
          trySalvage: near,
        };
      }
      // Secondary approach goal (no free crate): honor distinct waypoint.
      if (self.waypoint && dist(self.pos, self.waypoint) > 24) {
        return {
          moveTarget: { ...self.waypoint },
          fireAt: enemy && enemyDist < b.weaponRange * 0.65 ? enemy : null,
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
            : 0.4;
      const raidStandOff = (foe: Unit) => {
        const d = dist(self.pos, foe.pos);
        const rush = b.weaponRange * rushFrac;
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
              x: foe.pos.x + (toLead.x / ll) * (rush * 0.85),
              y: foe.pos.y + (toLead.y / ll) * (rush * 0.85),
            },
            fireAt: d < engageR * 1.35 ? foe : null,
            trySalvage: false as const,
          };
        }
        return {
          moveTarget: {
            x: foe.pos.x - (dx / len) * rush,
            y: foe.pos.y - (dy / len) * rush,
          },
          fireAt: d < engageR * 1.35 ? foe : null,
          trySalvage: false as const,
        };
      };
      const local = nearestAliveEnemy(self.pos, world.enemies, engageR);
      if (local) return raidStandOff(local);
      if (self.waypoint) {
        if (dist(self.pos, self.waypoint) > 24) {
          return {
            moveTarget: { ...self.waypoint },
            fireAt: null,
            trySalvage: false,
          };
        }
        self.waypoint = null;
      }
      const hunt =
        nearestAliveEnemy(self.pos, world.enemies, b.visionRange * 1.5) ??
        nearestAliveEnemy(self.pos, world.enemies);
      if (hunt) return raidStandOff(hunt);
      // No enemies: loiter near leader without consuming a click target.
      // Cling loiters tighter; decoy wider.
      const loiterR =
        self.quirk === "cling" ? 42 : self.quirk === "decoy" ? 95 : 70;
      self.patrolAngle += b.patrolAngularSpeed * 0.6 * dt;
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
