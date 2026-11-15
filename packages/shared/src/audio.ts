/**
 * WRECKLINE audio (docs/AUDIO_V0.md; 神宮決定 2026-11-15 B1–B3 = ★A).
 *
 * - One shared player for the canvas app. Web Audio, so loops are gapless (MP3 + manifest loop region).
 * - Starts on the first tap / key (mobile browsers allow sound only after a gesture).
 * - B3: a new BGM fades in over 1 s while the old one fades out.
 * - B2: one 「♪」 toggle mutes BGM and effects together; remembered per device (localStorage).
 * - BGM is fetched and decoded only when a scene asks for it; at most two decoded tracks are kept.
 * - Effects are quiet by design (tiers in the manifest) and the same effect is thinned when repeated fast.
 */
import manifest from "./audio/manifest.json";
import { BGM_URLS, SFX_URLS } from "./audio-urls";

export type BgmId = keyof typeof BGM_URLS;
export type SfxId = keyof typeof SFX_URLS;

export const AUDIO_MUTED_STORAGE_KEY = "wreckline.audio.muted";
/** B3 (★A): crossfade seconds. */
export const BGM_FADE_SEC = 1.0;
export const BGM_VOLUME = 0.5;
export const SFX_VOLUME = 0.9;
const DECODED_BGM_KEEP = 2;
/** The same effect is not restarted closer than this (seconds); combat sounds fire in bursts. */
const SFX_MIN_GAP: Record<string, number> = { ui: 0.03, work: 0.05, combat: 0.07, event: 0.12 };
const SFX_MAX_VOICES = 10;

type BgmEntry = { file: string; title: string; loop: [number, number] | null };
type SfxEntry = { file: string; label: string; tier: string };
const BGM_MANIFEST = manifest.bgm as Record<BgmId, BgmEntry>;
const SFX_MANIFEST = manifest.sfx as Record<SfxId, SfxEntry>;

export function bgmLoop(id: BgmId): [number, number] | null {
  return BGM_MANIFEST[id]?.loop ?? null;
}
export function sfxTier(id: SfxId): string {
  return SFX_MANIFEST[id]?.tier ?? "ui";
}

/** The parts of the Web Audio API the player uses (a fake in tests). */
export type AudioCtxLike = {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
};
export type ParamLike = {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  cancelScheduledValues(t: number): unknown;
};
export type GainLike = { gain: ParamLike; connect(to: unknown): unknown; disconnect(): unknown };
export type SourceLike = {
  buffer: unknown;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  connect(to: unknown): unknown;
  start(when?: number, offset?: number): unknown;
  stop(when?: number): unknown;
};

export type AudioDeps = {
  createContext: () => AudioCtxLike | null;
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  /** Seconds, for the repeat thinning (performance.now based in the browser). */
  now: () => number;
};

type Playing = { id: BgmId; src: SourceLike; gain: GainLike };

export class GameAudio {
  private ctx: AudioCtxLike | null = null;
  private master: GainLike | null = null;
  private bgmBus: GainLike | null = null;
  private sfxBus: GainLike | null = null;
  private wanted: BgmId | null = null;
  private playing: Playing | null = null;
  private bgmBuffers = new Map<BgmId, unknown>();
  private bgmLoading = new Map<BgmId, Promise<unknown>>();
  private sfxBuffers = new Map<SfxId, unknown>();
  private sfxLoading = new Map<SfxId, Promise<unknown>>();
  private lastSfx = new Map<SfxId, number>();
  private voices = 0;
  private pendingTap: ReturnType<typeof setTimeout> | null = null;
  private hidden = false;
  muted: boolean;

  constructor(private readonly deps: AudioDeps) {
    let m = false;
    try { m = deps.storage?.getItem(AUDIO_MUTED_STORAGE_KEY) === "1"; } catch { m = false; }
    this.muted = m;
  }

  /** The BGM a scene asks for (null = silence). Takes effect once audio is unlocked. */
  get wantedBgm(): BgmId | null { return this.wanted; }
  get playingBgm(): BgmId | null { return this.playing?.id ?? null; }
  get unlocked(): boolean { return this.ctx !== null; }

  /** First tap / key: create (or resume) the context, then play what the scene wants. */
  unlock(): void {
    if (!this.ctx) {
      const ctx = this.deps.createContext();
      if (!ctx) return;
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.master.gain.value = this.muted ? 0 : 1;
      this.bgmBus = ctx.createGain();
      this.bgmBus.gain.value = BGM_VOLUME;
      this.bgmBus.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = SFX_VOLUME;
      this.sfxBus.connect(this.master);
      for (const id of Object.keys(SFX_URLS) as SfxId[]) void this.loadSfx(id); // small: all effects up front
    }
    if (this.ctx.state === "suspended" && !this.muted && !this.hidden) void this.ctx.resume().catch(() => {});
    this.apply();
  }

  /** B2: one toggle for BGM and effects, remembered on this device. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    try { this.deps.storage?.setItem(AUDIO_MUTED_STORAGE_KEY, muted ? "1" : "0"); } catch { /* private mode */ }
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(muted ? 0 : 1, t);
    if (muted) void this.ctx.suspend().catch(() => {});
    else if (!this.hidden) void this.ctx.resume().catch(() => {});
  }
  toggleMuted(): void { this.setMuted(!this.muted); }

  /** The page went to the background (or came back). */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend().catch(() => {});
    else if (!this.muted) void this.ctx.resume().catch(() => {});
  }

  /** The scene's BGM. Same id → nothing; a new id crossfades (B3). */
  setBgm(id: BgmId | null): void {
    if (id === this.wanted) return;
    this.wanted = id;
    this.apply();
  }

  private apply(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmBus) return;
    const id = this.wanted;
    if ((this.playing?.id ?? null) === id) return;
    if (id === null) { this.fadeOutPlaying(); return; }
    const buf = this.bgmBuffers.get(id);
    if (!buf) {
      void this.loadBgm(id).then(() => { if (this.wanted === id) this.apply(); }).catch(() => {});
      return;
    }
    this.fadeOutPlaying();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const loop = bgmLoop(id);
    if (loop) { src.loop = true; src.loopStart = loop[0]; src.loopEnd = loop[1]; }
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + BGM_FADE_SEC);
    src.connect(gain);
    gain.connect(this.bgmBus);
    src.start(t, loop ? loop[0] : 0);
    const playing: Playing = { id, src, gain };
    src.onended = () => { if (this.playing === playing) this.playing = null; };
    this.playing = playing;
  }

  private fadeOutPlaying(): void {
    const p = this.playing;
    const ctx = this.ctx;
    if (!p || !ctx) return;
    this.playing = null;
    const t = ctx.currentTime;
    p.gain.gain.cancelScheduledValues(t);
    p.gain.gain.setValueAtTime(p.gain.gain.value, t);
    p.gain.gain.linearRampToValueAtTime(0, t + BGM_FADE_SEC);
    try { p.src.stop(t + BGM_FADE_SEC + 0.05); } catch { /* already stopped */ }
  }

  private async loadBgm(id: BgmId): Promise<unknown> {
    const hit = this.bgmBuffers.get(id);
    if (hit) return hit;
    let p = this.bgmLoading.get(id);
    if (!p) {
      p = this.deps.fetchBytes(BGM_URLS[id]).then((bytes) => this.ctx!.decodeAudioData(bytes));
      this.bgmLoading.set(id, p);
    }
    try {
      const buf = await p;
      this.bgmBuffers.set(id, buf);
      // Keep at most two decoded tracks (the playing one and the newest).
      for (const key of [...this.bgmBuffers.keys()]) {
        if (this.bgmBuffers.size <= DECODED_BGM_KEEP) break;
        if (key !== id && key !== this.playing?.id) this.bgmBuffers.delete(key);
      }
      return buf;
    } finally {
      this.bgmLoading.delete(id);
    }
  }

  private loadSfx(id: SfxId): Promise<unknown> {
    let p = this.sfxLoading.get(id);
    if (!p) {
      p = this.deps.fetchBytes(SFX_URLS[id]).then((bytes) => this.ctx!.decodeAudioData(bytes)).then((buf) => {
        this.sfxBuffers.set(id, buf);
        return buf;
      });
      p.catch(() => this.sfxLoading.delete(id));
      this.sfxLoading.set(id, p);
    }
    return p;
  }

  /** Play an effect (quiet tiers; the same effect repeated too fast is skipped). */
  sfx(id: SfxId): void {
    if (this.pendingTap) { clearTimeout(this.pendingTap); this.pendingTap = null; }
    this.playSfx(id);
  }

  /**
   * The plain button sound. Deferred one task: if the same tap also plays a more specific
   * effect (a sale, a repair, …) only that one sounds.
   */
  tap(id: SfxId = "ui-tap"): void {
    if (this.pendingTap) clearTimeout(this.pendingTap);
    this.pendingTap = setTimeout(() => { this.pendingTap = null; this.playSfx(id); }, 0);
  }

  private playSfx(id: SfxId): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.muted || this.hidden) return;
    const now = this.deps.now();
    const gap = SFX_MIN_GAP[sfxTier(id)] ?? 0.05;
    const last = this.lastSfx.get(id);
    if (last != null && now - last < gap) return;
    if (this.voices >= SFX_MAX_VOICES) return;
    const buf = this.sfxBuffers.get(id);
    if (!buf) { void this.loadSfx(id); return; }
    this.lastSfx.set(id, now);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxBus);
    this.voices++;
    src.onended = () => { this.voices = Math.max(0, this.voices - 1); };
    src.start(ctx.currentTime);
  }
}

/* ------------------------------------------------------------------ action names → effects */

/**
 * Hangar actions by their play-log operation name (`setPlayLogOperation`). Unlisted actions
 * (debug buttons, selection) only get the plain button sound.
 */
export const ACTION_SFX: Record<string, SfxId> = {
  "resource.sell": "coin-gain",
  "trade.sell-circuit": "coin-gain",
  "trade.sell-wreck": "coin-gain",
  "resource.buy": "coin-spend",
  "unopened.buy": "coin-spend",
  "circuit.purchase": "coin-spend",
  "trade.repair": "repair",
  "trade.revive": "repair",
  "trade.charge": "charge",
  "trade.scrap": "scrap",
  "trade.btn-buy-mech": "mech-new",
  "trade.btn-create-mech": "mech-new",
  "circuit.create": "mech-new",
  "trade.equip-equip": "equip",
  "trade.equip-unequip": "equip",
  "explore.air_support": "air-support",
};

/** UI sound for a tapped canvas region id. */
export function uiSfxForRegion(id: string): SfxId {
  if (/:cancel$/.test(id)) return "ui-cancel";
  if (/^(?:dock|explore|invade|restore|sort):confirm:.*:ok$/.test(id) || /:ok$/.test(id)) return "ui-confirm";
  if (/(?:^|:)back$|:detail-back$|^hdr:|^header:/.test(id)) return "ui-back";
  if (/^dock:nav:|^explore:ctl:|^explore:detail$|^explore:wing-card:/.test(id)) return "ui-open";
  return "ui-tap";
}

/* ------------------------------------------------------------------ the shared instance */

let shared: GameAudio | null = null;

/** The page's player (created on first use; null outside a browser). */
export function gameAudio(): GameAudio | null {
  if (shared) return shared;
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: new () => AudioCtxLike; webkitAudioContext?: new () => AudioCtxLike };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { storage = null; }
  shared = new GameAudio({
    createContext: () => { try { return Ctor ? new Ctor() : null; } catch { return null; } },
    fetchBytes: (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); }),
    storage,
    now: () => performance.now() / 1000,
  });
  return shared;
}

/** Play an effect on the page's player (no-op outside a browser or before the first tap). */
export function playSfx(id: SfxId): void {
  gameAudio()?.sfx(id);
}

/** Effect for a play-log operation name, if it has one. */
export function playActionSfx(kind: string): void {
  const id = ACTION_SFX[kind];
  if (id) playSfx(id);
}
