/** docs/AUDIO_V0.md — the shared player with a fake Web Audio context. */
import assert from "node:assert/strict";
import {
  AUDIO_MUTED_STORAGE_KEY,
  BGM_FADE_SEC,
  GameAudio,
  bgmLoop,
  uiSfxForRegion,
  ACTION_SFX,
  type AudioCtxLike,
  type GainLike,
  type ParamLike,
  type SourceLike,
} from "./index";
import { BGM_URLS, SFX_URLS } from "./audio-urls";
import manifest from "./audio/manifest.json";

type Ramp = { v: number; t: number };
class FakeParam implements ParamLike {
  value = 1;
  ramps: Ramp[] = [];
  sets: Ramp[] = [];
  setValueAtTime(v: number, t: number) { this.value = v; this.sets.push({ v, t }); }
  linearRampToValueAtTime(v: number, t: number) { this.ramps.push({ v, t }); }
  cancelScheduledValues() {}
}
class FakeGain implements GainLike { gain = new FakeParam(); connect() {} disconnect() {} }
class FakeSource implements SourceLike {
  buffer: unknown = null; loop = false; loopStart = 0; loopEnd = 0; onended: (() => void) | null = null;
  started: { when?: number; offset?: number } | null = null; stoppedAt: number | null = null;
  connect() {}
  start(when?: number, offset?: number) { this.started = { when, offset }; }
  stop(when?: number) { this.stoppedAt = when ?? 0; }
}
class FakeCtx implements AudioCtxLike {
  currentTime = 10; state = "running"; destination = {};
  sources: FakeSource[] = []; resumed = 0; suspended = 0;
  createGain() { return new FakeGain(); }
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  async decodeAudioData(data: ArrayBuffer) { return { bytes: data.byteLength }; }
  async resume() { this.resumed++; this.state = "running"; }
  async suspend() { this.suspended++; this.state = "suspended"; }
}
class Store { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }
const flush = () => new Promise((r) => setTimeout(r, 5));

function make(storage = new Store()) {
  const ctx = new FakeCtx();
  let clock = 0;
  const fetched: string[] = [];
  const audio = new GameAudio({
    createContext: () => ctx,
    fetchBytes: async (url) => { fetched.push(url); return new ArrayBuffer(8); },
    storage,
    now: () => clock,
  });
  return { ctx, audio, fetched, storage, tick: (s: number) => { clock += s; } };
}

// --- the manifest and the URL table agree; every loop region is one period after the 0.5 s margin
assert.deepEqual(Object.keys(BGM_URLS).sort(), Object.keys(manifest.bgm).sort());
assert.deepEqual(Object.keys(SFX_URLS).sort(), Object.keys(manifest.sfx).sort());
assert.equal(bgmLoop("title"), null, "the title theme has an outro and does not loop");
for (const id of Object.keys(BGM_URLS) as (keyof typeof BGM_URLS)[]) {
  if (id === "title") continue;
  const loop = bgmLoop(id)!;
  assert.ok(loop && loop[0] === 0.5 && loop[1] > 20, `${id} loops`);
}
for (const id of Object.values(ACTION_SFX)) assert.ok(id in SFX_URLS, `action sound ${id} exists`);

(async () => {
  // --- nothing sounds before the first tap; the wanted track plays right after it
  {
    const { ctx, audio, fetched } = make();
    audio.setBgm("hangar");
    assert.equal(audio.unlocked, false);
    assert.equal(fetched.length, 0, "nothing is fetched before the first tap");
    audio.unlock();
    await flush();
    assert.equal(audio.playingBgm, "hangar");
    const src = ctx.sources.find((s) => s.loop)!;
    assert.deepEqual([src.loopStart, src.loopEnd], bgmLoop("hangar"), "loops over the manifest region");
    assert.equal(src.started!.offset, bgmLoop("hangar")![0], "starts at the loop start");
    assert.ok(fetched.includes(BGM_URLS.hangar));
    assert.equal(fetched.filter((u) => u === BGM_URLS.hangar).length, 1, "fetched once");
    // B3: switching crossfades over 1 s
    audio.setBgm("contact");
    await flush();
    assert.equal(audio.playingBgm, "contact");
    assert.equal(src.stoppedAt, ctx.currentTime + BGM_FADE_SEC + 0.05, "the old track stops after the fade");
    audio.setBgm("contact");
    await flush();
    assert.equal(ctx.sources.filter((s) => s.loop).length, 2, "same id → no restart");
    // the title plays once
    audio.setBgm("title");
    await flush();
    const title = ctx.sources[ctx.sources.length - 1]!;
    assert.equal(title.loop, false);
    assert.equal(title.started!.offset, 0);
    // null → silence (fade out)
    audio.setBgm(null);
    assert.equal(audio.playingBgm, null);
  }

  // --- at most two decoded tracks; a track wanted again is fetched again
  {
    const { audio, fetched } = make();
    audio.unlock();
    for (const id of ["hangar", "recon", "sorting", "hangar"] as const) { audio.setBgm(id); await flush(); }
    assert.equal(fetched.filter((u) => u === BGM_URLS.hangar).length, 2, "an evicted track is fetched again");
  }

  // --- B2: one toggle, remembered on this device
  {
    const storage = new Store();
    const a = make(storage);
    a.audio.unlock();
    a.audio.toggleMuted();
    assert.equal(storage.getItem(AUDIO_MUTED_STORAGE_KEY), "1");
    assert.ok(a.ctx.suspended >= 1, "muted → the context sleeps");
    const b = make(storage);
    assert.equal(b.audio.muted, true, "the next visit starts muted");
    b.audio.setMuted(false);
    assert.equal(storage.getItem(AUDIO_MUTED_STORAGE_KEY), "0");
  }

  // --- effects: loaded after the tap, thinned when repeated, silent while muted
  {
    const { ctx, audio, tick } = make();
    audio.sfx("fire-player");
    assert.equal(ctx.sources.length, 0, "no effect before the first tap");
    audio.unlock();
    await flush();
    const before = ctx.sources.length;
    audio.sfx("fire-player");
    audio.sfx("fire-player");
    assert.equal(ctx.sources.length, before + 1, "the same effect at once plays once");
    tick(0.2);
    audio.sfx("fire-player");
    assert.equal(ctx.sources.length, before + 2, "after the gap it plays again");
    audio.setMuted(true);
    tick(1);
    audio.sfx("enemy-down");
    assert.equal(ctx.sources.length, before + 2, "muted → no effect");
    audio.setMuted(false);
    // a plain tap gives way to a specific action sound in the same task
    tick(1);
    audio.tap();
    audio.sfx("coin-gain");
    await flush();
    assert.equal(ctx.sources.length, before + 3, "only the action sound (not the tap as well)");
    tick(1);
    audio.tap();
    await flush();
    assert.equal(ctx.sources.length, before + 4, "a tap alone sounds");
  }

  // --- UI ids → sounds
  assert.equal(uiSfxForRegion("dock:confirm:sell:ok"), "ui-confirm");
  assert.equal(uiSfxForRegion("dock:confirm:sell:cancel"), "ui-cancel");
  assert.equal(uiSfxForRegion("dock:nav:T"), "ui-open");
  assert.equal(uiSfxForRegion("explore:ctl:back"), "ui-back");
  assert.equal(uiSfxForRegion("explore:ctl:squad"), "ui-open");
  assert.equal(uiSfxForRegion("tab:DOCK"), "ui-tap");

  console.log("shared audio selftest: ok");
})().catch((e) => { console.error(e); process.exit(1); });
