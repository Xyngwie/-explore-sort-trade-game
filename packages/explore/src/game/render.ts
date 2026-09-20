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
    ctx.fillStyle = b.cargoArrived ? "#3dd68ccc" : "#7eb6ffcc";
    ctx.font = "12px sans-serif";
    const label = b.cargoArrived ? "BOARDING · CARGO" : "BOARDING";
    ctx.fillText(label, cx - 48, cy - rr - 6);
  }

  // Temporary staging camp
  if (world.camp) {
    const c = world.camp;
    const cx = tx(c.pos.x);
    const cy = ty(c.pos.y);
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
    ctx.fillText(`CAMP · ${c.stashedCount}`, cx - 28, cy - 28);
  }

  // Containers: only discovered
  for (const c of world.containers) {
    if (!c.discovered || c.taken) continue;
    ctx.fillStyle = "#f0b429";
    ctx.fillRect(tx(c.pos.x) - 8, ty(c.pos.y) - 8, 16, 16);
    ctx.strokeStyle = "#ffe08a";
    ctx.strokeRect(tx(c.pos.x) - 8, ty(c.pos.y) - 8, 16, 16);
  }

  // Enemies (only if in vision of any friendly — keep simple: always draw if in cam,
  // but undiscussed fog for crates is the product rule; enemies use vision soft)
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
    drawCraft(ctx, tx(w.pos.x), ty(w.pos.y), w.radius * sx, "#7eb6ff", w.heading);
    ctx.fillStyle = "#9ecbff";
    ctx.font = "11px sans-serif";
    ctx.fillText(
      `${w.name}·${STANCE_LABEL[w.stance]}`,
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
    ctx.fillText("隊長", tx(world.leader.pos.x) - 12, ty(world.leader.pos.y) - 22);
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
