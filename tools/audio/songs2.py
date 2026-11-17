"""WRECKLINE BGM, the other nine pieces. Run: python3 songs2.py OUTDIR [name ...]"""
import sys
import numpy as np
from synth import (SR, Track, adsr, bandpass, convolve_reverb, feedback_delay, highpass, lowpass, master, midi,
                   noise, osc, pan, reverb_ir, sweep_lowpass, write_mp3)
from songs import dist_bass, epiano, hat, kick, metal, pad_note, snare, soft_kick, stab, tick, tri_bass


# ---------------------------------------------------------------- extra voices
def wind(seconds, vol=0.05, seed=0):
    """High-altitude wind: band-passed noise with slow gusts (stereo)."""
    n = int(seconds * SR)
    rng = np.random.default_rng(seed)
    t = np.arange(n) / SR
    out = []
    for ch in range(2):
        x = bandpass(rng.uniform(-1, 1, n), 250, 2400)
        gust = 0.55 + 0.45 * np.sin(2 * np.pi * (0.07 + 0.02 * ch) * t + rng.uniform(0, 6.28)) * np.sin(2 * np.pi * 0.031 * t + ch)
        out.append(x * gust * vol)
    return np.stack(out, axis=1)


def drone(note, seconds, vol=0.06, cutoff=500):
    n = int(seconds * SR)
    x = sum(osc("saw", midi(note), n, phase=p, detune_cents=c) for p, c in ((0, -5), (0.4, 5))) / 2
    x = x + 0.5 * osc("sine", midi(note - 12), n)
    return lowpass(x, cutoff) * vol


def pluck(note, dur, bright=3000, vol=0.08):
    n = int((dur + 0.3) * SR)
    x = osc("saw", midi(note), n) * 0.7 + osc("square", midi(note), n, detune_cents=7) * 0.3
    x = sweep_lowpass(x, bright, 300, steps=6)
    return x * adsr(n, a=0.002, d=0.18, s=0.15, r=0.2, gate=dur) * vol


def blip(note, vol=0.10, length=0.35):
    n = int(length * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * midi(note) * t) * np.exp(-t * 9) * vol


def bell(note, dur, vol=0.07):
    n = int((dur + 2.0) * SR)
    t = np.arange(n) / SR
    f = midi(note)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 2.5) + 0.15 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 5)
    return x * np.exp(-t * 1.1) * adsr(n, a=0.004, d=0.1, s=1.0, r=0.6, gate=dur + 1.4) * vol


def glitch(vol=0.03, length=0.12, seed=0):
    rng = np.random.default_rng(seed)
    n = int(length * SR)
    hold = rng.integers(20, 90)
    base = rng.uniform(-1, 1, n // hold + 1)
    x = np.repeat(base, hold)[:n]  # sample-and-hold crackle
    x = bandpass(x, 1500, 9000)
    t = np.arange(n) / SR
    return x * np.exp(-t * 25) * vol


def funk_bass(note, dur, vol=0.22):
    n = int((dur + 0.03) * SR)
    x = osc("square", midi(note), n) * 0.6 + osc("saw", midi(note), n) * 0.4
    x = sweep_lowpass(x, 1800, 260, steps=6)
    return np.tanh(x * 1.6) * adsr(n, a=0.002, d=0.09, s=0.55, r=0.03, gate=dur) * vol


def shaker(vol=0.05):
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    return bandpass(noise(n), 5000, 12000) * np.exp(-t * 60) * (t / 0.004).clip(0, 1) * vol


def clap(vol=0.18):
    n = int(0.2 * SR)
    t = np.arange(n) / SR
    env = sum(np.exp(-np.clip(t - d, 0, None) * 80) * (t >= d) for d in (0, 0.009, 0.018)) + 0.6 * np.exp(-t * 14)
    return bandpass(noise(n), 900, 6000) * env * vol


def tom(note=45, vol=0.3):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    f = midi(note) * (1 + 0.6 * np.exp(-t * 25))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * vol


def charge(seconds, start_note, end_note, vol=0.05):
    """Mechanical charging hum: a filtered saw gliding up."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = midi(start_note) * (midi(end_note) / midi(start_note)) ** (t / seconds)
    ph = np.cumsum(f) / SR
    x = (2 * (ph % 1) - 1) * 0.7 + np.sin(2 * np.pi * ph * 0.5) * 0.4
    x = sweep_lowpass(x, 300, 2400, steps=16)
    env = np.clip(t / 0.4, 0, 1) * np.clip((seconds - t) / 0.3, 0, 1)
    return x * env * vol


def mix(tracks_and_reverbs, loop_seconds):
    """[(Track.buf, ir or None, wet)] → one Track (for looped())."""
    parts = []
    for buf, ir, wet in tracks_and_reverbs:
        parts.append(convolve_reverb(buf, ir, wet) if ir is not None else buf)
    out = Track(loop_seconds, tail=0)
    out.buf = np.zeros((max(len(p) for p in parts), 2))
    for p in parts:
        out.buf[: len(p)] += p
    out.loop = int(loop_seconds * SR)
    return out


def one_shot(track_buf, fade=3.0):
    x = track_buf.copy()
    n = int(fade * SR)
    x[-n:] *= np.linspace(1, 0, n)[:, None]
    return x


# ---------------------------------------------------------------- 1. WRECKLINE - Above the Shell (title, 70 bpm, A aeolian)
def title():
    beat = 60 / 70; bar = beat * 4; bars = 24
    L = bars * bar
    pads, dry, mel = Track(L, 6), Track(L, 6), Track(L, 6)
    prog = [(45, [57, 60, 64, 71]), (41, [53, 57, 60, 64]), (38, [50, 53, 57, 60, 64]), (40, [52, 55, 59, 62])]
    for i in range(bars // 2):
        root, v = prog[i % 4]
        at = i * 2 * bar
        for k, nt in enumerate(v):
            pads.add(at, pan(pad_note(nt, 2 * bar, cutoff=700, vol=0.12), -0.6 + 1.2 * k / (len(v) - 1)))
        dry.add(at, pan(drone(root - 12 + 12, 2 * bar + 1, 0.05, 260), 0))
    theme = [(0, 76, 3), (3, 74, 1), (4, 72, 4), (10, 71, 1), (11, 72, 1), (12, 74, 4),
             (16, 76, 2), (18, 79, 2), (20, 77, 4), (26, 76, 1), (27, 74, 1), (28, 72, 2), (30, 71, 2),
             (32, 69, 8)]
    for start_bar in (4, 14):
        for b0, nt, d in theme:
            mel.add(start_bar * bar + b0 * beat, pan(bell(nt, d * beat, 0.08), 0.1))
    for b in range(0, bars, 3):
        pads.add(b * bar + 2.5 * beat, pan(metal(520, 0.03, 2.0, 2.5), (-1) ** b * 0.5))
    # Outro: 4 bars on Am(add9) → A, the melody's last word, then only wind.
    outro = Track(L + 4 * bar, 9)
    outro.buf[: len(pads.buf)] += 0  # same length base
    oat = L
    for k, nt in enumerate([57, 60, 64, 71]):
        outro.add(oat, pan(pad_note(nt, 3 * bar, cutoff=600, vol=0.12), -0.6 + 0.4 * k))
    outro.add(oat, pan(drone(45, 4 * bar, 0.05, 240), 0))
    outro.add(oat + 1 * beat, pan(bell(76, 2 * beat, 0.07), 0.1))
    outro.add(oat + 3 * beat, pan(bell(72, 2 * beat, 0.06), 0.1))
    outro.add(oat + 6 * beat, pan(bell(69, 6 * beat, 0.07), 0.1))
    total = L + 4 * bar + 6
    n = int(total * SR)
    air = wind(total, 0.045, 1)
    t = np.arange(n) / SR
    air *= np.clip(1 - (t - (L + 4 * bar)) / 6, 0, 1)[:, None]  # wind fades last
    ir = reverb_ir(4.0, 1.6, 4500)
    parts = [convolve_reverb(pads.buf, ir, 0.55), convolve_reverb(outro.buf, ir, 0.55),
             convolve_reverb(feedback_delay(mel.buf, beat * 1.5, 0.45, 0.35)[: len(mel.buf)], ir, 0.5), dry.buf, air]
    out = np.zeros((n, 2))
    for p_ in parts:
        m = min(n, len(p_))
        out[:m] += p_[:m]
    fade_in = int(2.5 * SR)
    out[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]  # it starts from the wind
    return master(highpass(one_shot(out, 2.0), 40), -2.0, 1.0)


# ---------------------------------------------------------------- 3. Recon Grid (95 bpm, B minor)
def recon():
    beat = 60 / 95; step = beat / 4; bar = beat * 4; bars = 24
    L = bars * bar
    dry, wet = Track(L, 4), Track(L, 4)
    chords = [[59, 62, 66], [55, 59, 62], [52, 55, 59], [54, 59, 61]]  # Bm G Em F#sus4
    roots = [35, 31, 28, 30]
    for b in range(bars):
        at = b * bar
        ch = chords[(b // 2) % 4]
        arp = [ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1], ch[0] + 12, ch[2]]
        for s in range(16):
            nt = arp[s % 8]
            wet.add(at + s * step, pan(pluck(nt + 12, step * 0.6, 2400 + 600 * ((b // 8) == 2), 0.1), -0.4 if s % 2 else 0.4))
        for q in range(4):  # ticking clock
            dry.add(at + q * beat, pan(tick(0.09 if q == 0 else 0.06, 1800, 5000, 70), 0.2))
            dry.add(at + q * beat + beat / 2, pan(tick(0.035, 2500, 7000, 90), -0.2))
        dry.add(at, pan(tri_bass(roots[(b // 2) % 4] + 12, bar * 0.9, 0.08), 0))
        if b >= 16:  # variation: a low pulse on every beat
            for q in range(4):
                dry.add(at + q * beat, pan(soft_kick(0.1, (90, 40), 0.3), 0))
        if b % 2 == 0:
            wet.add(at + 2 * beat, pan(blip(95 if b % 4 == 0 else 90, 0.14), 0.5 if b % 4 == 0 else -0.5))
    son = feedback_delay(wet.buf, beat * 0.75, 0.4, 0.25)[: len(wet.buf)]
    ir = reverb_ir(2.2, 3.2, 6000)
    t = mix([(son, ir, 0.35), (dry.buf, None, 0)], L)
    return master(highpass(t.looped(), 45), -1.5, 1.1)


# ---------------------------------------------------------------- 4. Sorting the Salvage (105 bpm, G dorian)
def sorting():
    beat = 60 / 105; step = beat / 4; bar = beat * 4; bars = 24
    L = bars * bar
    dry, wet = Track(L, 3), Track(L, 3)
    bass = [(0, 43, 1.5), (3, 43, 0.5), (4, 55, 0.5), (6, 46, 1), (8, 43, 1), (10, 41, 0.5), (11, 43, 1), (14, 50, 0.5), (15, 48, 0.5)]
    hook = [(0, 74, 1), (2, 77, 1), (3, 79, 2), (6, 77, 1), (8, 74, 2), (11, 72, 1), (12, 70, 2), (14, 72, 1)]
    for b in range(bars):
        at = b * bar
        up = 0 if (b // 2) % 2 == 0 else 5  # Gm7 ↔ Cm7 feel
        for s, nt, d in bass:
            dry.add(at + s * step, pan(funk_bass(nt + up, d * step, 0.18), 0))
        for q in range(4):
            dry.add(at + q * beat, pan(kick(0.27), 0))
        for q in (1, 3):
            wet.add(at + q * beat, pan(clap(0.26), 0.1))
        for s in range(16):  # conveyor shaker
            dry.add(at + s * step, pan(shaker(0.13 if s % 2 else 0.08), 0.4))
        for s in (2, 6, 10, 14):
            dry.add(at + s * step, pan(metal(1900 if s % 8 == 2 else 2300, 0.02, 14, 0.25), -0.5))
        if b % 2 == 1:
            wet.add(at + 14 * step, pan(metal(640, 0.05, 5, 0.8), 0.6))
        if 8 <= b < 16 or b >= 20:
            for s, nt, d in hook:
                if (b % 2) == 0:
                    wet.add(at + s * step, pan(pluck(nt + up, d * step, 2800, 0.11), -0.2))
        if b % 2 == 0:
            for k, nt in enumerate((58 + up, 62 + up, 65 + up)):
                wet.add(at, pan(pad_note(nt, 2 * bar, 1300, 0.09), -0.4 + 0.4 * k))
        stabs = [62 + up, 65 + up, 69 + up]
        wet.add(at + 6 * step, pan(stab(stabs, step, 2200, 0.08), 0.3))
    ir = reverb_ir(1.2, 4.5, 6500)
    t = mix([(wet.buf, ir, 0.25), (dry.buf, None, 0)], L)
    return master(highpass(t.looped(), 45), -1.0, 1.25)


# ---------------------------------------------------------------- 5. Restoring the Circuit (72 bpm, F lydian)
def restoring():
    beat = 60 / 72; bar = beat * 4; bars = 28
    L = bars * bar
    pads, tones, dry = Track(L, 6), Track(L, 6), Track(L, 6)
    prog = [(41, [53, 57, 60, 64, 71]), (36, [52, 55, 60, 67]), (38, [53, 57, 60, 62]), (34, [50, 53, 57, 62])]
    for i in range(bars // 2):
        root, v = prog[i % 4]
        at = i * 2 * bar
        for k, nt in enumerate(v):
            pads.add(at, pan(pad_note(nt, 2 * bar, cutoff=650, vol=0.09), -0.5 + k / (len(v) - 1)))
        pads.add(at, pan(tri_bass(root, 2 * bar * 0.95, 0.10), 0))
        arp = [v[1] + 12, v[2] + 12, v[3] + 12, v[2] + 12]
        for k in range(8):  # slow sine arpeggio, every half bar
            tones.add(at + k * beat, pan(bell(arp[k % 4], beat * 0.8, 0.045), -0.3 + 0.6 * ((k * 3) % 4) / 3))
    rng = np.random.default_rng(5)
    for b in range(bars):
        for _ in range(2):
            dry.add(b * bar + rng.uniform(0, bar), pan(glitch(0.03, 0.1, int(rng.integers(1e6))), rng.uniform(-0.7, 0.7)))
    ir = reverb_ir(3.2, 2.0, 5200)
    t = mix([(pads.buf, ir, 0.5), (feedback_delay(tones.buf, beat * 1.5, 0.4, 0.3)[: len(tones.buf)], ir, 0.45), (dry.buf, ir, 0.3)], L)
    return master(highpass(t.looped(), 45), -3.0, 1.0)


# ---------------------------------------------------------------- 6. Briefing - Mass Driver (100 bpm, D minor)
def briefing():
    beat = 60 / 100; step = beat / 4; bar = beat * 4; bars = 24
    L = bars * bar
    dry, wet = Track(L, 3), Track(L, 3)
    roots = [38, 38, 34, 36]
    for b in range(bars):
        at = b * bar
        lvl = 1 if b < 8 else 2 if b < 16 else 1  # loopable: 1 → 2 → 1
        r = roots[(b // 2) % 4]
        for e in range(8):
            dry.add(at + e * beat / 2, pan(dist_bass(r + (12 if e % 4 == 3 else 0), beat / 2 * 0.7, 1500 + 500 * lvl, 0.1), 0))
        for q in range(4):
            dry.add(at + q * beat, pan(kick(0.17 + 0.05 * lvl), 0))
        if lvl >= 1:
            for q in (1, 3):
                wet.add(at + q * beat, pan(snare(0.3), 0))
        if lvl == 2:
            for s in range(16):
                dry.add(at + s * step, pan(hat(0.15 if s % 2 else 0.09), 0.3))
            if b % 4 == 3:
                for k, nt in enumerate((45, 43, 41, 38)):
                    wet.add(at + (12 + k) * step, pan(tom(nt, 0.25), -0.4 + 0.25 * k))
        else:
            for e in range(8):
                dry.add(at + e * beat / 2, pan(hat(0.06), 0.3))
        if b % 4 == 0:
            wet.add(at, pan(charge(4 * bar - 0.2, 50, 74, 0.07 + 0.015 * lvl), -0.2))
        if b % 2 == 0:
            wet.add(at, pan(pad_note(62 if (b // 2) % 4 < 2 else 58, 2 * bar, 1300, 0.12), 0.3))
            wet.add(at, pan(pad_note(65 if (b // 2) % 4 < 2 else 62, 2 * bar, 1300, 0.12), -0.3))
    ir = reverb_ir(1.8, 3.5, 6000)
    t = mix([(wet.buf, ir, 0.35), (dry.buf, None, 0)], L)
    return master(highpass(t.looped(), 45), -1.0, 1.2)


# ---------------------------------------------------------------- 7. Scavenging the Shell (90 bpm, E minor)
def scavenging():
    beat = 60 / 90; bar = beat * 4; bars = 32
    L = bars * bar
    dry, wet, mel = Track(L, 6), Track(L, 6), Track(L, 6)
    prog = [(40, [52, 55, 59, 62]), (36, [48, 52, 55, 59]), (43, [55, 59, 62, 66]), (38, [50, 54, 57, 62])]  # Em7 Cmaj7 Gmaj7 D
    for i in range(bars // 2):
        root, v = prog[i % 4]
        at = i * 2 * bar
        for k, nt in enumerate(v):
            wet.add(at, pan(pad_note(nt, 2 * bar, cutoff=600, vol=0.08), -0.6 + 1.2 * k / 3))
        for e in range(16):  # walking pulse: muted eighths
            dry.add(at + e * beat / 2, pan(tri_bass(root + (7 if e % 8 == 6 else 0), beat / 2 * 0.55, 0.14 if e % 2 == 0 else 0.09), 0))
    for b in range(bars):
        at = b * bar
        dry.add(at, pan(soft_kick(0.2), 0))
        dry.add(at + 2 * beat, pan(soft_kick(0.14), 0))
        for q in range(4):
            dry.add(at + q * beat + beat / 2, pan(tick(0.05, 3500, 9000, 80), 0.3))
        if b % 4 == 2:
            wet.add(at + 1.5 * beat, pan(metal(1320, 0.035, 3.0, 1.5), -0.6))  # ice glint
        if b % 8 == 5:
            wet.add(at + 3 * beat, pan(metal(430, 0.05, 1.8, 2.5), 0.5))  # distant rust groan
    line = [(0, 71, 2), (2, 74, 2), (4, 76, 4), (10, 74, 1), (11, 71, 1), (12, 69, 4),
            (16, 67, 2), (18, 69, 2), (20, 71, 3), (23, 74, 1), (24, 71, 6)]
    for start_bar in (8, 24):
        for b0, nt, d in line:
            mel.add(start_bar * bar + b0 * beat, pan(epiano(nt, d * beat, 0.11), -0.25))
    dry.buf[: int(L * SR)] += wind(L, 0.035, 2)
    ir = reverb_ir(3.0, 2.2, 5000)
    t = mix([(wet.buf, ir, 0.5), (dry.buf, None, 0), (feedback_delay(mel.buf, beat * 0.75, 0.42, 0.3)[: len(mel.buf)], ir, 0.5)], L)
    return master(highpass(t.looped(), 45), -1.5, 1.05)


# ---------------------------------------------------------------- 9. Extraction Window (120 bpm, C minor)
def extraction():
    beat = 60 / 120; step = beat / 4; bar = beat * 4; bars = 24
    L = bars * bar
    dry, wet = Track(L, 3), Track(L, 3)
    climb = [0, 2, 3, 5, 3, 2]  # rises every 4 bars, then steps back toward the start of the loop
    for b in range(bars):
        at = b * bar
        lift = climb[(b // 4) % len(climb)]
        for q in range(4):  # heartbeat kick
            dry.add(at + q * beat, pan(kick(0.25), 0))
            if q in (0, 2):
                dry.add(at + q * beat + step * 1.2, pan(kick(0.13), 0))
        for s in range(16):
            dry.add(at + s * step, pan(hat(0.16 if s % 2 else 0.1), 0.25))  # ticking
        if b % 2 == 1:
            wet.add(at + 3 * beat, pan(snare(0.28), 0))
        osti = [60, 67, 72, 67, 63, 67, 72, 75]
        for e, nt in enumerate(osti):
            wet.add(at + e * beat / 2, pan(pluck(nt + lift, beat / 2 * 0.7, 2800 + 150 * lift, 0.12), -0.3 if e % 2 else 0.3))
        dry.add(at, pan(dist_bass(48 + lift, bar * 0.95, 900 + 80 * lift, 0.08), 0))
        if b % 4 == 0:
            wet.add(at, pan(pad_note(60 + lift, 4 * bar, 1000, 0.07), 0.4))
            wet.add(at, pan(pad_note(63 + lift, 4 * bar, 1000, 0.07), -0.4))
    ir = reverb_ir(1.6, 3.8, 6500)
    t = mix([(wet.buf, ir, 0.3), (dry.buf, None, 0)], L)
    return master(highpass(t.looped(), 45), -1.0, 1.25)


# ---------------------------------------------------------------- 10a. Home with Cargo (short, D major)
def home():
    beat = 60 / 80; bar = beat * 4
    L = 8 * bar
    pads, mel, dry = Track(L, 6), Track(L, 6), Track(L, 6)
    prog = [([55, 59, 62, 66], 43), ([57, 61, 64, 67], 45), ([54, 57, 62, 66], 42), ([59, 62, 66, 69], 47)]  # Gmaj7 A7 D/F# Bm7
    for i, (v, root) in enumerate(prog):
        at = i * 2 * bar
        for k, nt in enumerate(v):
            pads.add(at, pan(pad_note(nt, 2 * bar, 1200, 0.12), -0.5 + k / 3))
        pads.add(at, pan(tri_bass(root, 2 * bar * 0.95, 0.15), 0))
    for b in range(8):
        for e in range(8):
            dry.add(b * bar + e * beat / 2, pan(tick(0.05 if e % 2 else 0.07, 3500, 9000, 70), 0.25))
        dry.add(b * bar, pan(soft_kick(0.14), 0))
    for b0, nt, d in [(0, 74, 1), (1, 76, 1), (2, 78, 2), (4, 81, 2), (6, 79, 1), (7, 78, 1), (8, 76, 4), (12, 74, 1), (13, 73, 1),
                      (14, 74, 2), (16, 78, 2), (18, 76, 2), (20, 74, 4), (26, 71, 1), (27, 73, 1), (28, 74, 2), (30, 73, 2)]:
        mel.add(b0 * beat, pan(epiano(nt, d * beat, 0.14), 0.1))
    ir = reverb_ir(3.0, 2.0, 5500)
    t = mix([(pads.buf, ir, 0.45), (feedback_delay(mel.buf, beat * 0.75, 0.35, 0.22)[: len(mel.buf)], ir, 0.4), (dry.buf, None, 0)], L)
    return master(highpass(t.looped(), 45), -2.0, 1.0)


# ---------------------------------------------------------------- 10b. Lost to the Cold (short, D minor)
def lost():
    beat = 60 / 60; bar = beat * 4
    L = 8 * bar
    pads, mel, air = Track(L, 7), Track(L, 7), Track(L, 7)
    prog = [([50, 53, 57], 38), ([46, 50, 53], 34), ([43, 50, 52, 55], 31), ([45, 49, 52], 33)]  # Dm Bb Gm6 A
    for i in range(8):
        v, root = prog[(i // 2) % 4]
        at = i * bar
        if i % 2 == 0:
            for k, nt in enumerate(v):
                pads.add(at, pan(pad_note(nt, 2 * bar, 500, 0.12), -0.4 + 0.8 * k / max(len(v) - 1, 1)))
            pads.add(at, pan(drone(root, 2 * bar + 1, 0.04, 220), 0))
    for b0, nt, d in [(1, 69, 2), (3, 67, 1), (4, 65, 3), (8, 64, 2), (10, 62, 2), (12, 61, 4),
                      (17, 65, 2), (19, 64, 1), (20, 62, 3), (24, 60, 2), (26, 58, 2), (28, 57, 4)]:
        mel.add(b0 * beat, pan(bell(nt, d * beat, 0.06), 0.15))
    air.buf[: int(L * SR)] += wind(L, 0.06, 3)
    ir = reverb_ir(4.5, 1.3, 4000)
    t = mix([(pads.buf, ir, 0.55), (mel.buf, ir, 0.55), (air.buf, None, 0)], L)
    return master(highpass(t.looped(), 40), -3.0, 1.0)


PIECES = {
    "wreckline-above-the-shell": ("WRECKLINE - Above the Shell", title),
    "recon-grid": ("Recon Grid", recon),
    "sorting-the-salvage": ("Sorting the Salvage", sorting),
    "restoring-the-circuit": ("Restoring the Circuit", restoring),
    "briefing-mass-driver": ("Briefing - Mass Driver", briefing),
    "scavenging-the-shell": ("Scavenging the Shell", scavenging),
    "extraction-window": ("Extraction Window", extraction),
    "home-with-cargo": ("Home with Cargo", home),
    "lost-to-the-cold": ("Lost to the Cold", lost),
}

if __name__ == "__main__":
    outdir = sys.argv[1]
    names = sys.argv[2:] or list(PIECES)
    for key in names:
        title_, fn = PIECES[key]
        write_mp3(fn(), f"{outdir}/{key}.mp3", title_)
        print(key, "done", flush=True)
