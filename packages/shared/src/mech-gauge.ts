/**
 * PR3 integrated mech gauge (docs/FULLSCREEN_SHELL_V0.md §9, values provisional).
 * Armor = blue outer ring, depleting clockwise from 12 o'clock.
 * Power = yellow core, liquid level. Ammo = red vertical magazine bar on the side.
 * Numbers are hidden; a tap shows them for MECH_GAUGE_TAP_MS (Q7).
 * Display only: it never changes gameplay or the save.
 */
export const MECH_GAUGE_COLORS = { armor: "#58a6ff", power: "#d4a72c", ammo: "#f85149", track: "#30363d", dead: "#6e7681" } as const;
/* Provisional (神宮 TBD). */
export const MECH_GAUGE_TAP_MS = 1500;
export const MECH_GAUGE_SIZE_PX = { hubCard: 44, explorePanel: 32 } as const;
export const MECH_GAUGE_ANIM_MS = 250;

export type GaugePair = readonly [current: number, max: number] | null;
export type MechGaugeInput = { armor: GaugePair; power: GaugePair; ammo: GaugePair; destroyed?: boolean; leader?: boolean };
export type GaugeLevel = { cur: number; max: number; frac: number; zero: boolean } | null;
export type MechGaugeModel = { armor: GaugeLevel; power: GaugeLevel; ammo: GaugeLevel; destroyed: boolean; leader: boolean; ringDeg: number; text: string };

const fin = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export function gaugeLevel(p: GaugePair): GaugeLevel {
  if (!p) return null;
  const max = Math.max(0, fin(p[1]));
  const cur = Math.min(max, Math.max(0, fin(p[0])));
  if (max <= 0) return { cur: 0, max: 0, frac: 0, zero: true };
  return { cur, max, frac: cur / max, zero: cur <= 0 };
}
/** Shown number: never 0 while something is left (ceil), never above max. */
export function gaugeNumber(v: number, max = Infinity): number {
  return Math.min(Math.ceil(Math.max(0, fin(v)) - 1e-9), Math.ceil(max));
}
export function mechGaugeText(m: Pick<MechGaugeModel, "armor" | "power" | "ammo">): string {
  const f = (k: string, l: GaugeLevel) => `${k} ${l ? `${gaugeNumber(l.cur, l.max)}/${gaugeNumber(l.max)}` : "—"}`;
  return [f("装甲", m.armor), f("電力", m.power), f("弾薬", m.ammo)].join(" · ");
}
export function mechGaugeModel(input: MechGaugeInput): MechGaugeModel {
  const armor = gaugeLevel(input.armor), power = gaugeLevel(input.power), ammo = gaugeLevel(input.ammo);
  const destroyed = !!input.destroyed;
  const ringDeg = destroyed || !armor ? 0 : 360 * armor.frac;
  const base = { armor, power, ammo };
  return { ...base, destroyed, leader: !!input.leader, ringDeg, text: mechGaugeText(base) };
}
/** SVG arc path for the remaining armor: clockwise, ends at 12 o'clock, empties from 12 clockwise. */
export function ringArcPath(cx: number, cy: number, r: number, deg: number): string {
  const d = Math.max(0, Math.min(360, deg));
  if (d <= 0) return "";
  if (d >= 359.999) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r}`;
  const start = 360 - d; // degrees clockwise from 12 o'clock
  const pt = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${+(cx + r * Math.cos(rad)).toFixed(3)} ${+(cy + r * Math.sin(rad)).toFixed(3)}`;
  };
  return `M ${pt(start)} A ${r} ${r} 0 ${d > 180 ? 1 : 0} 1 ${pt(360)}`;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
/** Inline SVG markup (HUB card, Explore panel). */
export function mechGaugeSvg(m: MechGaugeModel, size: number): string {
  const s = size, c = s / 2, sw = Math.max(3, s * 0.1), r = c - sw / 2 - s * 0.12, core = r - sw / 2 - s * 0.06;
  const C = MECH_GAUGE_COLORS;
  const dead = m.destroyed;
  const lvl = dead || !m.power ? 0 : m.power.frac;
  const ammo = dead || !m.ammo ? 0 : m.ammo.frac;
  const barW = Math.max(2, s * 0.09), barX = s - barW, barH = s * 0.8, barY = s * 0.1;
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  const zero = (l: GaugeLevel) => (!dead && l?.zero ? ' stroke-dasharray="2 2"' : "");
  return `<svg class="mech-gauge-svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">
<circle cx="${c - barW / 2}" cy="${c}" r="${r}" fill="none" stroke="${C.track}" stroke-width="${sw}"${zero(m.armor)}/>
${dead ? "" : `<path class="mg-ring" d="${ringArcPath(c - barW / 2, c, r, m.ringDeg)}" fill="none" stroke="${C.armor}" stroke-width="${sw}" stroke-linecap="butt"/>`}
<clipPath id="${id}"><circle cx="${c - barW / 2}" cy="${c}" r="${core}"/></clipPath>
<circle cx="${c - barW / 2}" cy="${c}" r="${core}" fill="#0d1117" stroke="${dead ? C.dead : C.track}" stroke-width="1"${zero(m.power)}/>
<rect class="mg-core" clip-path="url(#${id})" x="0" y="${c + core - 2 * core * lvl}" width="${s}" height="${2 * core * lvl}" fill="${C.power}"/>
<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="1" fill="${C.track}"${zero(m.ammo)}/>
<rect class="mg-ammo" x="${barX}" y="${barY + barH * (1 - ammo)}" width="${barW}" height="${barH * ammo}" rx="1" fill="${C.ammo}"/>
${dead ? `<path d="M ${c - core} ${c - core} L ${c + core - barW} ${c + core} M ${c + core - barW} ${c - core} L ${c - core} ${c + core}" stroke="${C.dead}" stroke-width="2"/>` : ""}
${m.leader ? `<circle class="mg-leader" cx="${c - barW / 2}" cy="${c}" r="${c - 1 - barW / 2}" fill="none" stroke="#ffffff" stroke-width="1" opacity=".6"/>` : ""}
</svg>`;
}
/** Wrapper element: a button that shows the numbers on tap. */
export function mechGaugeHtml(m: MechGaugeModel, size: number, extraClass = ""): string {
  return `<button type="button" class="mech-gauge${m.destroyed ? " destroyed" : ""}${extraClass ? " " + extraClass : ""}" data-mech-gauge="${esc(m.text)}" aria-label="${esc(m.text)}">${mechGaugeSvg(m, size)}</button>`;
}
export const MECH_GAUGE_CSS = `
.mech-gauge{all:unset;display:inline-flex;vertical-align:middle;cursor:pointer;line-height:0;border-radius:50%;padding:2px}
.mech-gauge:focus-visible{outline:2px solid #4f8fe8}
.mech-gauge .mg-ring,.mech-gauge .mg-core,.mech-gauge .mg-ammo{transition:all ${MECH_GAUGE_ANIM_MS}ms ease-out}
#mech-gauge-tip{position:fixed;z-index:2147483002;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:6px;padding:4px 8px;font:12px/1.3 system-ui,sans-serif;white-space:nowrap;pointer-events:none}
@media (prefers-reduced-motion:reduce){.mech-gauge .mg-ring,.mech-gauge .mg-core,.mech-gauge .mg-ammo{transition:none}}
`;
/** One delegated listener per document: tap a gauge → numbers for 1.5s. Does not bubble to the card (no selection). */
export function installMechGaugeTap(doc: Document = document): void {
  const w = doc.defaultView as (Window & { __mechGaugeTap?: true }) | null;
  if (!w || w.__mechGaugeTap) return;
  w.__mechGaugeTap = true;
  if (!doc.getElementById("mech-gauge-style")) {
    const st = doc.createElement("style"); st.id = "mech-gauge-style"; st.textContent = MECH_GAUGE_CSS; doc.head.appendChild(st);
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  doc.addEventListener("click", (e) => {
    const el = (e.target instanceof Element ? e.target : null)?.closest<HTMLElement>("[data-mech-gauge]");
    if (!el) return;
    e.stopPropagation(); e.preventDefault();
    showMechGaugeTip(doc, el.dataset.mechGauge ?? "", el.getBoundingClientRect());
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => doc.getElementById("mech-gauge-tip")?.remove(), MECH_GAUGE_TAP_MS);
  }, true);
}
function showMechGaugeTip(doc: Document, text: string, r: DOMRect): void {
  let tip = doc.getElementById("mech-gauge-tip");
  if (!tip) { tip = doc.createElement("div"); tip.id = "mech-gauge-tip"; tip.setAttribute("role", "status"); doc.body.appendChild(tip); }
  tip.textContent = text;
  const vw = doc.documentElement.clientWidth;
  const left = Math.max(4, Math.min(vw - 4 - tip.offsetWidth, r.left + r.width / 2 - tip.offsetWidth / 2));
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(4, r.top - tip.offsetHeight - 6)}px`;
}
