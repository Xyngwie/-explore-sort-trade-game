import { extractionProgressPct } from "../extractProgress";
import { getCoverObjects } from "./coverObjects";
import { STANCE_LABEL, type World } from "./types";

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  cssW: number,
  cssH: number,
): void {
  const cam = world.camera;
  const sx = cssW / cam.w;
  const sy = cssH / cam.h;
  const tx = (x: number) => (x - cam.x) * sx;
  const ty = (y: number) => (y - cam.y) * sy;

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, cssW, cssH);

  // Grid
  ctx.strokeStyle = "#1a222c";
  ctx.lineWidth = 1;
  const grid = 80;
  const x0 = Math.floor(cam.x / grid) * grid;
  const y0 = Math.floor(cam.y / grid) * grid;
  for (let x = x0; x < cam.x + cam.w + grid; x += grid) {
    ctx.beginPath();
    ctx.moveTo(tx(x), 0);
    ctx.lineTo(tx(x), cssH);
    ctx.stroke();
  }
  for (let y = y0; y < cam.y + cam.h + grid; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, ty(y));
    ctx.lineTo(cssW, ty(y));
    ctx.stroke();
  }

  // Cover objects: visual-only in this PR. Positions are generated once per sortie.
  for (const cover of getCoverObjects(world)) {
    const px = tx(cover.pos.x);
    const py = ty(cover.pos.y);
    const r = cover.radius * sx;
    ctx.fillStyle = "#4b5b66";
    ctx.fillRect(px - r, py - r * 0.7, r * 2, r * 1.4);
    ctx.strokeStyle = "#8fa7b5";
    ctx.lineWidth = 2;
    ctx.strokeRect(px - r, py - r * 0.7, r * 2, r * 1.4);
    ctx.fillStyle = "#b8c7d0aa";
    ctx.font = "10px sans-serif";
    ctx.fillText("COVER", px - 18, py - r * 0.85);
  }

  // Boarding / extract circle (only while request active)
  if (world.boarding) {
    const b = world.boarding;
    const cx = tx(b.center.x);
    const cy = ty(b.center.y);
    const rr = b.radius * sx;
    ctx.fillStyle = b.cargoArrived ? "#3dd68c33" : "#3d8bfd22";
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = b.cargoArrived ? "#3dd68c" : "#3d8bfd";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const liftEta = Math.max(
      0,
      world.balance.boardingCargoDelaySec +
        world.balance.boardingLiftOffDelaySec -
        (world.elapsed - b.requestedAt),
    );
    const progress = extractionProgressPct(
      liftEta,
      world.balance.boardingCargoDelaySec,
      world.balance.boardingLiftOffDelaySec,
    );
    ctx.strokeStyle = b.cargoArrived ? "#3dd68c" : "#7eb6ff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      Math.max(4, rr - 5),
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * (progress / 100),
    );
    ctx.stroke();

    ctx.fillStyle = b.cargoArrived ? "#3dd68ccc" : "#7eb6ffcc";
    ctx.font = "12px sans-serif";
    const label = b.cargoArrived ? "BOARDING · CARGO" : "BOARDING";
    ctx.fillText(label, cx - 48, cy - rr - 6);
  }

  // Temporary staging camp (+ aura when stash > 0)
  if (world.camp) {
    const c = world.camp;
    const cx = tx(c.pos.x);
    const cy = ty(c.pos.y);
    if (c.stashedCount > 0) {
      const aura = world.balance.campAuraRadius * sx;
      ctx.fillStyle = "#c9a22722";
      ctx.beginPath();
      ctx.arc(cx, cy, aura, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e8c54755";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, aura, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#c9a22744";
    ctx.beginPath();
    ctx.arc(cx, cy, 22 * sx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e8c547";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, 22 * sx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffe08acc";
    ctx.font = "11px sans-serif";
    const drPct = Math.round((1 - world.balance.campDamageTakenMul) * 100);
    const campLabel =
      c.stashedCount > 0
        ? `CAMP · ${c.stashedCount} · 防衛−${drPct}%`
        : `CAMP · ${c.stashedCount}`;
    ctx.fillText(campLabel, cx - 44, cy - 28);
  }

  // Containers: only discovered (death-drop / purge get pulsing glow)
  for (const c of world.containers) {
    if (!c.discovered || c.taken) continue;
    const px = tx(c.pos.x);
    const py = ty(c.pos.y);
    if (c.glowT > 0) {
      const pulse = 0.55 + 0.45 * Math.sin(world.elapsed * 8);
      const r = 14 + pulse * 6;
      ctx.strokeStyle = `rgba(255, 120, 80, ${0.35 + pulse * 0.45})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 160, 60, ${0.12 + pulse * 0.18})`;
      ctx.beginPath();
      ctx.arc(px, py, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = c.glowT > 0 ? "#ff8a3d" : "#f0b429";
    ctx.fillRect(px - 8, py - 8, 16, 16);
    ctx.strokeStyle = c.glowT > 0 ? "#ffd0a0" : "#ffe08a";
    ctx.lineWidth = c.glowT > 0 ? 2 : 1;
    ctx.strokeRect(px - 8, py - 8, 16, 16);
    if (c.glowT > 0) {
      ctx.fillStyle = "#ffc98a";
      ctx.font = "10px sans-serif";
      ctx.fillText("DROP", px - 14, py - 12);
    }
  }

  const vision = world.balance.visionRange;
  const friendlies = [world.leader, ...world.wingmen];
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const seen = friendlies.some(
      (u) => u.alive && Math.hypot(u.pos.x - e.pos.x, u.pos.y - e.pos.y) <= vision,
    );
    if (!seen) continue;
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.arc(tx(e.pos.x), ty(e.pos.y), e.radius * sx, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bullets
  ctx.fillStyle = "#e8eaed";
  for (const b of world.bullets) {
    if (!b.alive) continue;
    ctx.fillRect(tx(b.pos.x) - 2, ty(b.pos.y) - 2, 4, 4);
  }

  // Wingmen
  for (const w of world.wingmen) {
    if (!w.alive) continue;
    if (w.inCover) drawCoverRing(ctx, tx(w.pos.x), ty(w.pos.y), w.radius * sx);
    drawCraft(ctx, tx(w.pos.x), ty(w.pos.y), w.radius * sx, "#7eb6ff", w.heading);
    ctx.fillStyle = "#9ecbff";
    ctx.font = "11px sans-serif";
    const quirkTag = w.quirk ? `·${quirkShort(w.quirk)}` : "";
    const coverTag = w.inCover ? "·カバー" : "";
    ctx.fillText(
      `${w.name}·${STANCE_LABEL[w.stance]}${quirkTag}${coverTag}`,
      tx(w.pos.x) - 28,
      ty(w.pos.y) - w.radius * sy - 8,
    );
    if (w.stance === "patrol" && w.waypoint) {
      ctx.strokeStyle = "#f0b42955";
      ctx.beginPath();
      ctx.arc(
        tx(w.waypoint.x),
        ty(w.waypoint.y),
        world.balance.patrolRadius * sx,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }

  // Leader
  if (world.leader.alive) {
    if (world.leader.inCover) {
      drawCoverRing(
        ctx,
        tx(world.leader.pos.x),
        ty(world.leader.pos.y),
        world.leader.radius * sx,
      );
    }
    drawCraft(
      ctx,
      tx(world.leader.pos.x),
      ty(world.leader.pos.y),
      world.leader.radius * sx,
      "#5cdb95",
      world.leader.heading,
    );
    ctx.fillStyle = "#b6f5d0";
    ctx.font = "11px sans-serif";
    const leadLabel = world.leader.inCover ? "隊長·カバー" : "隊長";
    ctx.fillText(leadLabel, tx(world.leader.pos.x) - 18, ty(world.leader.pos.y) - 22);
  }

  // Vision ring (leader)
  ctx.strokeStyle = "#ffffff18";
  ctx.beginPath();
  ctx.arc(
    tx(world.leader.pos.x),
    ty(world.leader.pos.y),
    vision * sx,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
}

function quirkShort(q: "cling" | "decoy" | "sniper"): string {
  return q === "cling" ? "密着" : q === "decoy" ? "囮" : "遠射";
}

function drawCoverRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  ctx.strokeStyle = "#8fd3ffaa";
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, r + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCraft(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  heading: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.7, r * 0.7);
  ctx.lineTo(-r * 0.4, 0);
  ctx.lineTo(-r * 0.7, -r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function worldFromCanvas(
  canvas: HTMLCanvasElement,
  world: World,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  return {
    x: world.camera.x + nx * world.camera.w,
    y: world.camera.y + ny * world.camera.h,
  };
}
