import type { Vec2 } from "./math";
import { wreckWasStripped } from "./strippingRuntime";
import { equippedShield, SHIELD_HALF_ARC } from "./shields";
import { combatFeedback, feedbackLabel } from "./combatFeedback";
import { COLORS, MECH_R, OWN_WRECK_OUTLINE, SHAPE_SIZE, dropGlowRgba, leaderLabelLift, drawDisc, drawMechShape } from "./mapShapes";
import { fogCols, fogGrey, fogRows, ghostOf, GHOST_ALPHA, lastSeenFade, squadIntel, squadSees, viewRange, type GhostKind, FRONT_HALF_RAD, FRONT_RANGE_MUL, PERIPHERY_HALF_RAD } from "./vision";
import { strayShown, strayStoppedLabel, strayWreckLabel } from "./strayScatter";
import { layoutLabels } from "./labelLayout";
import { extractionProgressPct } from "../extractProgress";
import { FORCED_RESCUE_RING, forcedRescueRing } from "./rescue";
import { wreckLabel } from "./wrecks";
import { carriedWreckIds, wreckCarrierId } from "./carry";
import { getCoverObjects } from "./coverObjects";
import { visionMul } from "./circuitPlay";
import { STANCE_LABEL, type Unit, type World } from "./types";
import { isWingmanMobileFor } from "./commandUnlock";
import { QUESTION_COLOR, QUESTION_FONT, questionAlpha, wingStanceTagJa } from "./lockedOrder";
import { enemyDisplayNameJa } from "./enemyIdentity";
import { STATUS_BADGE_COLOR, STATUS_BADGE_OUTLINE, STATUS_BADGE_PX, wingmanStatusLine, wreckCircuitLine } from "./statusBadges";

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

  const drawShield = (unit: Unit, color: string) => {
    const entry = equippedShield(world, unit);
    if (!entry) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, entry.shield.hp / entry.shield.maxHp);
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx(unit.pos.x), ty(unit.pos.y), (unit.radius + 4) * sx,
      unit.heading - SHIELD_HALF_ARC, unit.heading + SHIELD_HALF_ARC);
    ctx.stroke(); ctx.restore();
  };

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

  // Cover objects: readable physical rubble/barriers with a subtle interaction boundary.
  for (const cover of getCoverObjects(world)) {
    const px = tx(cover.pos.x);
    const py = ty(cover.pos.y);
    const r = cover.radius * Math.min(sx, sy);

    ctx.strokeStyle = "#8fa7b544";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Low circular debris mound, leaving the snapped-to center readable.
    ctx.fillStyle = "#3f4b52";
    ctx.beginPath();
    const chunks = 9;
    for (let i = 0; i < chunks; i += 1) {
      const a = (Math.PI * 2 * i) / chunks;
      const rr = r * (0.58 + (i % 3) * 0.05);
      const x = px + Math.cos(a) * rr;
      const y = py + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 7; i += 1) {
      const a = (Math.PI * 2 * i) / 7 + 0.18;
      const rr = r * (0.52 + (i % 2) * 0.08);
      const cx = px + Math.cos(a) * rr;
      const cy = py + Math.sin(a) * rr;
      const w = r * (0.16 + (i % 3) * 0.025);
      const h = r * (0.11 + ((i + 1) % 3) * 0.025);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a + Math.PI / 5);
      ctx.fillStyle = i % 2 === 0 ? "#66737a" : "#566168";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = "#87949a99";
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }

    ctx.fillStyle = "#253037";
    ctx.beginPath();
    ctx.arc(px, py, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9aa8ae66";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.24, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 項目5-2b: thin warning ring. Color is not the boarding circle.
  const warnRing = forcedRescueRing(world);
  if (warnRing) {
    const cx = tx(warnRing.center.x);
    const cy = ty(warnRing.center.y);
    const rr = warnRing.radius * sx;
    ctx.strokeStyle = FORCED_RESCUE_RING;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
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
    ctx.arc(cx, cy, Math.max(4, rr - 5), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (progress / 100));
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
    const campLabel = c.stashedCount > 0 ? `CAMP · ${c.stashedCount} · 防衛−${drPct}%` : `CAMP · ${c.stashedCount}`;
    ctx.fillText(campLabel, cx - 44, cy - 28);
  }

  // PR2 fog: never seen = grey; watched now = black ground; unwatched fades back to grey over 60 s.
  {
    const cell = world.balance.fogCell, cols = fogCols(world), rows = fogRows(world);
    const c0 = Math.max(0, Math.floor(cam.x / cell)), c1 = Math.min(cols - 1, Math.floor((cam.x + cam.w) / cell));
    const r0 = Math.max(0, Math.floor(cam.y / cell)), r1 = Math.min(rows - 1, Math.floor((cam.y + cam.h) / cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const g = fogGrey(world, r * cols + c);
      if (g <= 0.01) continue;
      ctx.fillStyle = `rgba(74,80,88,${(0.88 * g).toFixed(3)})`;
      ctx.fillRect(Math.floor(tx(c * cell)), Math.floor(ty(r * cell)), Math.ceil(cell * sx) + 1, Math.ceil(cell * sy) + 1);
    }
  }
  // Seen now → the real thing; otherwise its faint image (original colour, 35%) from squad knowledge.
  const seenOrGhost = (kind: GhostKind, id: string, pos: { x: number; y: number }): { pos: { x: number; y: number }; alpha: number } | null => {
    if (squadSees(world, pos)) return { pos, alpha: 1 };
    const g = ghostOf(world, kind, id);
    return g ? { pos: g.pos, alpha: GHOST_ALPHA } : null;
  };

  // Containers: only discovered (death-drop / purge get pulsing glow)
  for (const c of world.containers) {
    if (!c.discovered) continue;
    const view = seenOrGhost("container", c.id, c.pos);
    if (!view || (view.alpha === 1 && c.taken)) continue;
    ctx.save(); ctx.globalAlpha = view.alpha;
    const px = tx(view.pos.x);
    const py = ty(view.pos.y);
    if (c.glowT > 0) {
      const pulse = 0.55 + 0.45 * Math.sin(world.elapsed * 8);
      const r = 14 + pulse * 6;
      ctx.strokeStyle = dropGlowRgba(0.35 + pulse * 0.45);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = dropGlowRgba(0.12 + pulse * 0.18);
      ctx.beginPath();
      ctx.arc(px, py, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = c.glowT > 0 ? COLORS.dropGlow : COLORS.container;
    ctx.fillRect(px - 8, py - 8, 16, 16);
    ctx.strokeStyle = c.glowT > 0 ? COLORS.dropGlow : COLORS.containerEdge;
    ctx.lineWidth = c.glowT > 0 ? 2 : 1;
    ctx.strokeRect(px - 8, py - 8, 16, 16);
    if (c.glowT > 0) {
      ctx.fillStyle = "#ffc98a";
      ctx.font = "10px sans-serif";
      ctx.fillText("DROP", px - 14, py - 12);
    }
    ctx.restore();
  }

  const vision = world.balance.visionRange;
  const friendlies = [world.leader, ...world.wingmen];
  void friendlies; void vision;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    if (!isEnemySeen(world, e)) continue;
    drawMechShape(ctx, tx(e.pos.x), ty(e.pos.y), MECH_R * SHAPE_SIZE.enemy * sx, COLORS.enemy, "triangle", e.heading);
    drawShield(e, COLORS.enemy);
    // Enemy PR1 (F1 = B): 「所属不明」 only after a tap, for a few seconds.
    if (world.enemyTag?.enemyId === e.id) {
      ctx.fillStyle = "#ffb3b3";
      ctx.font = "11px sans-serif";
      ctx.fillText(enemyDisplayNameJa(e), tx(e.pos.x) - 22, ty(e.pos.y) - e.radius * sy - 6);
    }
  }

  for (const e of world.enemies) {
    if (wreckWasStripped(world,e.id) || e.alive || e.enemyState?.recovered || wreckCarrierId(world,e.id)) continue;
    const v = seenOrGhost("enemyWreck", e.id, e.pos); if (!v) continue;
    ctx.save(); ctx.globalAlpha = v.alpha;
    drawDisc(ctx, tx(v.pos.x), ty(v.pos.y), MECH_R * SHAPE_SIZE.wreck * sx, COLORS.wreck);
    ctx.fillStyle='#c3c8cf'; ctx.font='11px sans-serif'; ctx.fillText('残骸',tx(v.pos.x),ty(v.pos.y)-12);
    ctx.restore();
  }
  // Faint images of wrecks recovered or carried off while unseen stay until the spot is seen again.
  for (const g of Object.values(squadIntel(world).ghosts)) {
    if (wreckWasStripped(world,g.id)) continue;
    if ((g.kind !== "enemyWreck" && g.kind !== "allyWreck") || squadSees(world, g.pos)) continue;
    const u = g.kind === "enemyWreck" ? world.enemies.find((x) => x.id === g.id) : [world.leader, ...world.wingmen].find((x) => x.id === g.id);
    const drawnAbove = g.kind === "enemyWreck"
      ? u && !u.alive && !u.enemyState?.recovered && !wreckCarrierId(world, u.id)
      : u && !u.alive && !(world.recoveredWreckUnitIds ?? []).includes(u.id) && wreckCarrierId(world, u.id) == null;
    if (drawnAbove) continue;
    ctx.save(); ctx.globalAlpha = GHOST_ALPHA;
    drawDisc(ctx, tx(g.pos.x), ty(g.pos.y), MECH_R * SHAPE_SIZE.wreck * sx, COLORS.wreck, g.kind === "allyWreck" ? OWN_WRECK_OUTLINE : undefined);
    ctx.restore();
  }
  // Faint images of enemy supplies taken while unseen stay until the spot is seen again.
  const liveSupplyIds = new Set((world.enemySupplies ?? []).map((d) => d.id));
  for (const g of Object.values(squadIntel(world).ghosts)) {
    if (g.kind !== "supply" || liveSupplyIds.has(g.id) || squadSees(world, g.pos)) continue;
    ctx.save(); ctx.globalAlpha = GHOST_ALPHA; drawDisc(ctx, tx(g.pos.x), ty(g.pos.y), MECH_R * SHAPE_SIZE.supply * sx, g.id.endsWith('-power') ? COLORS.powerDrop : COLORS.ammoDrop); ctx.restore();
  }
  for (const d of world.enemySupplies ?? []) {
    const v = seenOrGhost("supply", d.id, d.pos); if (!v) continue;
    ctx.save(); ctx.globalAlpha = v.alpha;
    drawDisc(ctx, tx(v.pos.x), ty(v.pos.y), MECH_R * SHAPE_SIZE.supply * sx, d.kind === 'power' ? COLORS.powerDrop : COLORS.ammoDrop);
    ctx.restore();
  }
  // Ground shields have no collision or pickup action in this PR.
  const groundGroups = new Map<string,{pos: Vec2; count:number}>();
  for (const [key,pos] of Object.entries(world.shieldState?.ground ?? {})) {
    if (!world.shieldState?.identities.shields[key] || !squadSees(world,pos)) continue;
    const groupKey = `${pos.x}:${pos.y}`;
    const group = groundGroups.get(groupKey);
    if (group) group.count++; else groundGroups.set(groupKey,{pos,count:1});
  }
  for (const {pos,count} of groundGroups.values()) {
    ctx.save(); ctx.fillStyle=COLORS.wreck; ctx.font="11px sans-serif";
    ctx.fillText(`盾 ×${count}`,tx(pos.x),ty(pos.y)); ctx.restore();
  }
  // Bullets
  ctx.fillStyle = "#e8eaed";
  for (const b of world.bullets) {
    if (!b.alive) continue;
    ctx.fillRect(tx(b.pos.x) - 2, ty(b.pos.y) - 2, 4, 4);
  }

  // Left-behind mechs waiting on this front cell (lostMechs.ts): recovered at
  // lift-off when inside the boarding circle; hidden once recovered.
  const recoveredLost = new Set(world.recoveredLostMechIds ?? []);
  for (let m of world.strandedMechs ?? []) {
    if (wreckWasStripped(world,`s:${m.instanceId}`) || recoveredLost.has(m.instanceId)) continue;
    if (wreckCarrierId(world, `s:${m.instanceId}`) != null) continue; // drawn on its carrier (項目4-1)
    if (!strayShown(m)) continue; // 10/17: hidden in fog until found
    // PR2: seen now → real; else its faint image. An old checkpoint (no found flag, no image) shows it faint.
    const sv = seenOrGhost("stray", m.instanceId, m.pos) ?? (m.found === undefined ? { pos: m.pos, alpha: GHOST_ALPHA } : null);
    if (!sv) continue;
    ctx.save(); ctx.globalAlpha = sv.alpha;
    m = { ...m, pos: sv.pos };
    if (m.wreck) {
      // Left-behind ex-wingman wreck: grey circle with the blue outline on its edge (width 2), same as own wrecks.
      drawDisc(ctx, tx(m.pos.x), ty(m.pos.y), MECH_R * SHAPE_SIZE.wreck * sx, COLORS.wreck, OWN_WRECK_OUTLINE);
      ctx.fillStyle = COLORS.wingman;
    } else {
      // Left-behind mech that can still move: grey inverted triangle (no facing), blue label.
      drawMechShape(ctx, tx(m.pos.x), ty(m.pos.y), MECH_R * SHAPE_SIZE.wingman * sx, COLORS.wreck, "invertedTriangle", null);
      ctx.fillStyle = COLORS.wingman;
    }
    ctx.font = "11px sans-serif";
    ctx.fillText(m.wreck ? strayWreckLabel(m.instanceId) : strayStoppedLabel(m.instanceId), tx(m.pos.x) - 34, ty(m.pos.y) - 9 * sy - 8);
    ctx.restore();
  }

  // 項目5-1b W6: this sortie's wrecks stay where they were destroyed (gray, 「残骸 僚機A」).
  for (const u of [world.leader, ...world.wingmen]) {
    if (wreckWasStripped(world,u.id) || u.alive || !u.instanceId) continue;
    if ((world.recoveredWreckUnitIds ?? []).includes(u.id)) continue;
    if (wreckCarrierId(world, u.id) != null) continue; // drawn on its carrier (項目4-1)
    const v = seenOrGhost("allyWreck", u.id, u.pos); if (!v) continue;
    ctx.save(); ctx.globalAlpha = v.alpha;
    drawDisc(ctx, tx(v.pos.x), ty(v.pos.y), MECH_R * SHAPE_SIZE.wreck * sx, COLORS.wreck, OWN_WRECK_OUTLINE);
    ctx.fillStyle = "#c3c8cf";
    ctx.font = "11px sans-serif";
    ctx.fillText(wreckLabel(u.kind === "leader" ? "隊長機" : u.name), tx(v.pos.x) - 30, ty(v.pos.y) - u.radius * sy - 8);
    // 21:29 神宮 1 = B: a wrecked wingman shows its circuits (type + value) over the label.
    if (u.kind !== "leader") drawOverheadLine(ctx, cssW, wreckCircuitLine(world, u), tx(v.pos.x) - 30, ty(v.pos.y) - u.radius * sy - 8);
    ctx.restore();
  }

  // Dropped circuits waiting on this front cell (circuitDrops.ts): recovered at
  // lift-off when inside the boarding circle; hidden once recovered.
  const recoveredDrops = new Set(world.recoveredDropIds ?? []);
  for (let d of world.strandedDrops ?? []) {
    if (recoveredDrops.has(d.dropId)) continue;
    if (!strayShown(d)) continue; // 10/17: hidden in fog until found
    const dv = seenOrGhost("drop", d.dropId, d.pos) ?? (d.found === undefined ? { pos: d.pos, alpha: GHOST_ALPHA } : null);
    if (!dv) continue;
    ctx.save(); ctx.globalAlpha = dv.alpha;
    d = { ...d, pos: dv.pos };
    // 10/17 神宮 6: whitish square (same 8px size as before; no outline).
    ctx.fillStyle = COLORS.circuitDrop;
    ctx.fillRect(tx(d.pos.x) - 4, ty(d.pos.y) - 4, 8, 8);
    ctx.fillStyle = COLORS.circuitDrop;
    ctx.font = "11px sans-serif";
    ctx.fillText(`落とし物 回路 ${d.circuitId}`, tx(d.pos.x) - 30, ty(d.pos.y) - 10);
    ctx.restore();
  }

  // Wingmen. Name labels that would overlap are shifted up a line (10/17 神宮 A).
  ctx.font = "11px sans-serif";
  const wingLabelText = (w: Unit) => {
    const quirkTag = w.quirk ? `·${quirkShort(w.quirk)}` : "";
    const coverTag = w.inCover ? "·カバー" : "";
    const stanceTag = isWingmanMobileFor(world, w.id) ? wingStanceTagJa(w, STANCE_LABEL[w.stance]) : "自衛のみ";
    return `${w.name}·${stanceTag}${quirkTag}${coverTag}`;
  };
  const liveWings = world.wingmen.filter((w) => w.alive);
  const leaderBox = world.leader.alive
    ? [{ x: tx(world.leader.pos.x) - 18, y: ty(world.leader.pos.y) - leaderLabelLift(sx), w: ctx.measureText(world.leader.inCover ? "隊長·カバー" : "隊長").width, h: 12 }]
    : [];
  const wingYs = layoutLabels(
    liveWings.map((u) => ({ x: tx(u.pos.x) - 28, y: ty(u.pos.y) - u.radius * sy - 8, w: ctx.measureText(wingLabelText(u)).width, h: 12 })),
    leaderBox,
  );
  const wingLabelY = new Map(liveWings.map((w, i) => [w.id, wingYs[i]!]));
  for (const w of world.wingmen) {
    if (!w.alive) continue;
    if (w.inCover) drawCoverRing(ctx, tx(w.pos.x), ty(w.pos.y), w.radius * sx);
    drawMechShape(ctx, tx(w.pos.x), ty(w.pos.y), MECH_R * SHAPE_SIZE.wingman * sx, COLORS.wingman, "invertedTriangle", w.heading);
    drawShield(w, COLORS.wingman);
    ctx.fillStyle = "#9ecbff";
    ctx.font = "11px sans-serif";
    // C20-b: 「待機」 while holding (mobile wingmen; immobile keep 「自衛のみ」) — see wingLabelText.
    const labelX = tx(w.pos.x) - 28;
    const labelY = wingLabelY.get(w.id) ?? ty(w.pos.y) - w.radius * sy - 8;
    ctx.fillText(wingLabelText(w), labelX, labelY);
    // feat/explore-status-badges: red outlined state line over the name label.
    // The canvas backing is fixed and CSS-scaled, so the font is sized in
    // backing px to land at STATUS_BADGE_PX on screen at any width / map zoom.
    const status = wingmanStatusLine(world, w);
    const topY = status ? drawOverheadLine(ctx, cssW, status, labelX, labelY) : labelY;
    const qa = questionAlpha(w);
    if (qa > 0) {
      // C20-b: 「？」 above the name label, fading out over QUESTION_MARK_SEC.
      ctx.save();
      ctx.globalAlpha = qa;
      ctx.fillStyle = QUESTION_COLOR;
      ctx.font = QUESTION_FONT;
      ctx.fillText("？", tx(w.pos.x) - 5, topY - 13);
      ctx.restore();
    }
    if (w.stance === "patrol" && w.waypoint) {
      ctx.strokeStyle = "#f0b42955";
      ctx.beginPath();
      ctx.arc(tx(w.waypoint.x), ty(w.waypoint.y), world.balance.patrolRadius * sx, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // P1 (PR-B): selected wingmen get a frame; ordered move points get a small marker.
  const play = world.circuitPlay;
  if (play) {
    for (const id of play.wingSelect?.ids ?? []) {
      const w = world.wingmen.find((u) => u.id === id);
      if (!w || !w.alive) continue;
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 2;
      ctx.strokeRect(tx(w.pos.x) - w.radius * sx - 5, ty(w.pos.y) - w.radius * sy - 5, (w.radius * sx + 5) * 2, (w.radius * sy + 5) * 2);
      ctx.lineWidth = 1;
    }
    for (const [id, pt] of Object.entries(play.wingMove ?? {})) {
      if (!world.wingmen.some((u) => u.id === id && u.alive)) continue;
      const mx = tx(pt.x);
      const my = ty(pt.y);
      ctx.strokeStyle = "#ffd166";
      ctx.beginPath();
      ctx.moveTo(mx, my - 6); ctx.lineTo(mx + 6, my); ctx.lineTo(mx, my + 6); ctx.lineTo(mx - 6, my); ctx.closePath();
      ctx.stroke();
    }
  }

  // Leader
  if (world.leader.alive) {
    if (world.leader.inCover) drawCoverRing(ctx, tx(world.leader.pos.x), ty(world.leader.pos.y), world.leader.radius * sx);
    drawMechShape(ctx, tx(world.leader.pos.x), ty(world.leader.pos.y), MECH_R * SHAPE_SIZE.leader * sx, COLORS.leader, "hexagon", world.leader.heading);
    drawShield(world.leader, COLORS.leader);
    ctx.fillStyle = "#9ecbff";
    ctx.font = "11px sans-serif";
    const leadLabel = world.leader.inCover ? "隊長·カバー" : "隊長";
    ctx.fillText(leadLabel, tx(world.leader.pos.x) - 18, ty(world.leader.pos.y) - leaderLabelLift(sx));
  }

  // 項目4-1 C7: a carried wreck is drawn small on top of its carrier, with 「積載中 残骸」.
  for (const u of [world.leader, ...world.wingmen]) {
    if (!u.alive) continue;
    const n = carriedWreckIds(world, u.id).length;
    if (n <= 0) continue;
    const cx = tx(u.pos.x);
    const cy = ty(u.pos.y) - u.radius * sy * 0.9;
    drawDisc(ctx, cx, cy, MECH_R * SHAPE_SIZE.wreck * 0.55 * sx, COLORS.wreck);
    ctx.fillStyle = "#e6d3a3";
    ctx.font = "11px sans-serif";
    ctx.fillText(n > 1 ? `積載中 残骸×${n}` : "積載中 残骸", cx + u.radius * sx * 0.8, cy + 4);
  }

  // PR2 vision cones (A): every living ally, very faint. Front 60° to 2×, periphery 270° to 1×.
  for (const u of [world.leader, ...world.wingmen]) {
    if (!u.alive) continue;
    const R = viewRange(world, u);
    const cx = tx(u.pos.x), cy = ty(u.pos.y);
    ctx.fillStyle = "rgba(126,182,255,0.035)"; ctx.strokeStyle = "rgba(126,182,255,0.10)"; // faction blue (under our command)
    for (const [half, r] of [[PERIPHERY_HALF_RAD, R], [FRONT_HALF_RAD, R * FRONT_RANGE_MUL]] as const) {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r * sx, u.heading - half, u.heading + half);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // PR2 last seen (A): red outline circle fading out over 5 s.
  for (const m of Object.values(squadIntel(world).lastSeen)) {
    const a = lastSeenFade(world, m.t);
    if (a <= 0) continue;
    ctx.strokeStyle = `rgba(255,107,107,${(0.85 * a).toFixed(3)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(tx(m.pos.x), ty(m.pos.y), world.balance.unitRadius * sx, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
  }
  ctx.save();
  const feedbackPx = 12 * cssW / (ctx.canvas.clientWidth || cssW);
  ctx.font = `bold ${feedbackPx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  for (const event of combatFeedback(world)) {
    const unit = [world.leader, ...world.wingmen, ...world.enemies].find(u => u.id === event.unitId);
    if (!unit || (!unit.alive && event.kind !== "friendly_fire") || (unit.kind === "enemy" && !isEnemySeen(world, unit))) continue;
    const x = tx(unit.pos.x), y = ty(unit.pos.y) - feedbackPx * (2 + (1.8 - event.ttl) + (event.kind === "friendly_fire" ? 3.2 : event.kind === "power" ? 1.4 : 0));
    ctx.globalAlpha = Math.min(1, event.ttl * 2);
    ctx.strokeStyle = "#102030";
    ctx.fillStyle = event.kind === "friendly_fire" ? COLORS.feedbackFriendlyFire : event.kind === "empty" ? COLORS.feedbackEmpty : event.kind === "ammo" ? COLORS.feedbackAmmo : COLORS.feedbackPower;
    ctx.strokeText(feedbackLabel(event), x, y);
    ctx.fillText(feedbackLabel(event), x, y);
  }
  ctx.restore();
}

function quirkShort(q: "cling" | "decoy" | "sniper"): string {
  return q === "cling" ? "密着" : q === "decoy" ? "囮" : "遠射";
}

function drawCoverRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.strokeStyle = "#8fd3ffaa";
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, r + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}


export function worldFromCanvas(canvas: HTMLCanvasElement, world: World, clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  return { x: world.camera.x + nx * world.camera.w, y: world.camera.y + ny * world.camera.h };
}

/**
 * feat/explore-status-badges: red outlined line over a label. The canvas
 * backing is fixed and CSS-scaled, so the font is sized in backing px to land
 * at STATUS_BADGE_PX on screen at any width / map zoom. Returns its baseline.
 */
function drawOverheadLine(ctx: CanvasRenderingContext2D, cssW: number, text: string, x: number, labelY: number): number {
  if (!text) return labelY;
  const shown = ctx.canvas.clientWidth > 0 ? ctx.canvas.clientWidth : cssW;
  const px = (STATUS_BADGE_PX * cssW) / shown;
  const y = labelY - px - 2;
  ctx.save();
  ctx.font = `bold ${px.toFixed(2)}px sans-serif`;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, px / 4);
  ctx.strokeStyle = STATUS_BADGE_OUTLINE;
  ctx.fillStyle = STATUS_BADGE_COLOR;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
  return y;
}

/** Enemy PR1: an enemy the squad can see (same rule as drawing it). */
export function isEnemySeen(world: World, e: Unit): boolean {
  const vision = world.balance.visionRange;
  void vision;
  return squadSees(world, e.pos); // PR2: cones + line of sight, shared by the squad
}
