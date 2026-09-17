import { dist } from "./math";
import type { Stance, Unit, World } from "./types";
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
