"""WRECKLINE BGM sketches: 'Hangar - Rust and Warmth' and 'Contact'. Run: python3 songs.py OUTDIR"""
import sys
import numpy as np
from synth import (SR, Track, adsr, bandpass, convolve_reverb, feedback_delay, highpass, lowpass, master, midi,
                   noise, osc, pan, reverb_ir, sweep_lowpass, write_mp3)


# ---------------------------------------------------------------- shared voices
def pad_note(note, dur, cutoff=1100, vol=0.14):
    n = int((dur + 1.5) * SR)
    x = sum(osc("saw", midi(note), n, phase=p, detune_cents=c) for p, c in ((0.0, -7), (0.33, 0), (0.71, 7))) / 3
    x = lowpass(x, cutoff, order=2)
    return x * adsr(n, a=1.2, d=0.6, s=0.8, r=1.5, gate=dur) * vol


def tri_bass(note, dur, vol=0.17):
    n = int((dur + 0.1) * SR)
    x = osc("tri", midi(note), n) * 0.8 + osc("sine", midi(note), n) * 0.4
    x = lowpass(x, 420)
    return x * adsr(n, a=0.02, d=0.2, s=0.75, r=0.12, gate=dur) * vol


def soft_kick(vol=0.55, pitch=(110, 42), length=0.45):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = pitch[1] + (pitch[0] - pitch[1]) * np.exp(-t * 28)
    ph = np.cumsum(f) / SR
    return np.sin(2 * np.pi * ph) * np.exp(-t * 7) * vol


def tick(vol=0.05, lo=3000, hi=9000, decay=55):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return bandpass(noise(n), lo, hi) * np.exp(-t * decay) * vol


def metal(base=800, vol=0.05, decay=4.0, length=1.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for ratio, amp in ((1.0, 1.0), (2.76, 0.6), (5.40, 0.35), (8.93, 0.2), (13.3, 0.1)):
        x += np.sin(2 * np.pi * base * ratio * t) * amp * np.exp(-t * decay * (1 + ratio * 0.15))
    return x * vol


def epiano(note, dur, vol=0.16):
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    f = midi(note)
    mod = np.sin(2 * np.pi * f * 2 * t) * 1.2 * np.exp(-t * 3)
    x = np.sin(2 * np.pi * f * t + mod) + 0.25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 4)
    return x * adsr(n, a=0.005, d=0.9, s=0.35, r=0.9, gate=dur) * vol


# ---------------------------------------------------------------- Hangar - Rust and Warmth (80 bpm, D dorian)
def hangar():
    bpm, beat = 80, 60 / 80
    bar = beat * 4
    bars = 32
    dry = Track(bars * bar, tail=5)
    wet = Track(bars * bar, tail=5)
    chords = [  # (bass, voicing) each 2 bars
        (38, [50, 53, 57, 60, 64]),  # Dm9
        (34, [46, 50, 53, 57]),      # Bbmaj7
        (41, [53, 57, 60, 64]),      # Fmaj7
        (36, [48, 52, 55, 62]),      # Cadd9
    ]
    for b2 in range(bars // 2):
        root, voicing = chords[b2 % 4]
        at = b2 * 2 * bar
        for i, nt in enumerate(voicing):
            wet.add(at, pan(pad_note(nt, 2 * bar), -0.5 + i / max(len(voicing) - 1, 1)))
        for half in range(4):
            dry.add(at + half * 2 * beat, pan(tri_bass(root if half % 2 == 0 else root + 7, 2 * beat * 0.95), 0))
    rng = np.random.default_rng(3)
    for b in range(bars):
        at = b * bar
        section_b = (b // 8) % 2 == 1
        for e in range(8):  # 8th-note workshop ticks with a little swing
            swing = 0.06 * beat if e % 2 else 0
            v = 0.06 if e % 2 else 0.085
            v *= 0.7 + 0.6 * rng.random()
            dry.add(at + e * beat / 2 + swing, pan(tick(v), 0.35 if e % 2 else -0.2))
        dry.add(at, pan(soft_kick(0.26 if section_b else 0.18), 0))
        if section_b:
            dry.add(at + 2 * beat, pan(soft_kick(0.17), 0))
        if b % 2 == 1:
            wet.add(at + 3.5 * beat, pan(metal(780 if b % 4 == 1 else 660, 0.045), 0.6 if b % 4 == 1 else -0.6))
    phrase = [(0, 81, 1.5), (1.5, 79, 0.5), (2, 77, 2), (6, 76, 1), (7, 74, 1), (8, 76, 3),
              (12, 77, 1.5), (13.5, 79, 0.5), (14, 81, 1), (15, 84, 1), (16, 81, 4), (22, 79, 1),
              (23, 77, 1), (24, 76, 2), (26, 74, 2), (28, 72, 2), (30, 74, 2)]
    mel = Track(bars * bar, tail=5)
    for start_bar in (8, 24):
        for b0, nt, d in phrase:
            mel.add(start_bar * bar + b0 * beat, pan(epiano(nt, d * beat), 0.15))
    # hum + air
    n = dry.loop
    t = np.arange(n) / SR
    hum = (np.sin(2 * np.pi * 55 * t) * 0.3 + np.sin(2 * np.pi * 110 * t) * 0.5) * 0.008
    air = bandpass(noise(n), 400, 3000) * 0.006
    dry.buf[:n] += pan(hum + air, 0)
    ir = reverb_ir(2.8, 2.6, 5000)
    pads = convolve_reverb(wet.buf, ir, wet=0.45)
    melody = convolve_reverb(feedback_delay(mel.buf, beat * 0.75, 0.38, 0.28)[: len(mel.buf)], ir, wet=0.35)
    out = Track(bars * bar, tail=0)
    out.buf = np.zeros((max(len(pads), len(melody), len(dry.buf)), 2))
    out.buf[: len(dry.buf)] += dry.buf
    out.buf[: len(pads)] += pads
    out.buf[: len(melody)] += melody
    out.loop = dry.loop
    return master(highpass(out.looped(), 45), -1.5, 1.05)


# ---------------------------------------------------------------- Contact (130 bpm, E phrygian)
def dist_bass(note, dur, bright=2400, vol=0.30):
    n = int((dur + 0.02) * SR)
    x = osc("saw", midi(note), n) + 0.2 * osc("square", midi(note) / 2, n)
    x = np.tanh(x * 3.0)
    x = sweep_lowpass(x, bright, 380, steps=8)
    return x * adsr(n, a=0.003, d=0.08, s=0.6, r=0.03, gate=dur) * vol


def kick(vol=0.42):
    return soft_kick(vol, pitch=(160, 45), length=0.32) + np.concatenate([tick(0.1, 1500, 6000, 120), np.zeros(int(0.32 * SR) - int(0.08 * SR))])


def snare(vol=0.45):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.6
    sn = bandpass(noise(n), 1200, 9000) * np.exp(-t * 18)
    return np.tanh((body + sn) * 1.6) * vol


def hat(vol=0.08, open_=False):
    n = int((0.25 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    return highpass(noise(n), 7000) * np.exp(-t * (9 if open_ else 70)) * vol


def stab(notes, dur, bright=1800, vol=0.2):
    n = int((dur + 0.2) * SR)
    x = sum(osc("saw", midi(nt), n, detune_cents=c) for nt in notes for c in (-9, 9)) / (2 * len(notes))
    x = sweep_lowpass(np.tanh(x * 2.2), bright, 500, steps=6)
    return x * adsr(n, a=0.004, d=0.15, s=0.3, r=0.15, gate=dur) * vol


def lead(note, dur, vol=0.12):
    n = int((dur + 0.08) * SR)
    x = osc("square", midi(note), n) * 0.7 + osc("saw", midi(note), n, detune_cents=12) * 0.3
    x = lowpass(np.tanh(x * 1.5), 2600)
    return x * adsr(n, a=0.004, d=0.05, s=0.7, r=0.05, gate=dur) * vol


def contact():
    bpm = 130
    beat = 60 / bpm
    step = beat / 4
    bar = beat * 4
    bars = 32
    dry = Track(bars * bar, tail=3)
    wet = Track(bars * bar, tail=3)
    riff = [
        [40, 40, 52, 40, 40, 52, 40, 40, 40, 40, 52, 40, 43, 43, 41, 41],
        [40, 40, 52, 40, 40, 52, 40, 40, 40, 40, 52, 40, 46, 45, 43, 41],
    ]
    rng = np.random.default_rng(11)
    for b in range(bars):
        at = b * bar
        harsh = b >= 16
        pat = riff[b % 2]
        for s, nt in enumerate(pat):
            ghost = s in (3, 9) and not harsh  # A: lighter ghost notes instead of rests (a rest left a hole)
            dry.add(at + s * step, pan(dist_bass(nt, step * 0.9, 3400 if harsh else (1200 if ghost else 2200), 0.12 if ghost else 0.22), 0))
        for q in range(4):
            dry.add(at + q * beat, pan(kick(), 0))
        if b % 4 == 3:
            dry.add(at + 14 * step, pan(kick(0.5), 0))
        for q in (1, 3):
            wet.add(at + q * beat, pan(snare(), 0.05))
        for s in range(16):
            v = 0.22 if s % 4 == 2 else 0.13
            v *= 0.8 + 0.4 * rng.random()
            dry.add(at + s * step, pan(hat(v), 0.3))
        dry.add(at + 14 * step, pan(hat(0.07, True), 0.3))
        if b % 2 == 0:
            wet.add(at, pan(stab([64, 65, 71], step * 2, 2600 if harsh else 1600), -0.35))
            wet.add(at + 10 * step, pan(stab([64, 65, 71], step * 1.5, 2600 if harsh else 1600), 0.35))
        if b % 4 == 1:
            wet.add(at + 7 * step, pan(metal(1150, 0.06, 6.0, 0.6), -0.55))
            wet.add(at + 15 * step, pan(metal(1420, 0.05, 7.0, 0.5), 0.55))
        if harsh:  # B: tense square ostinato in 8ths
            line = [76, 79, 83, 81, 79, 77, 76, 74] if b % 2 == 0 else [76, 79, 83, 84, 83, 81, 79, 77]
            for e, nt in enumerate(line):
                wet.add(at + e * beat / 2, pan(lead(nt, beat / 2 * 0.8), -0.15 if e % 2 else 0.15))
    ir = reverb_ir(1.4, 4.5, 6500)
    room = convolve_reverb(wet.buf, ir, wet=0.28)
    out = Track(bars * bar, tail=0)
    out.buf = np.zeros((max(len(room), len(dry.buf)), 2))
    out.buf[: len(dry.buf)] += dry.buf
    out.buf[: len(room)] += room
    out.loop = dry.loop
    return master(highpass(out.looped(), 50), -1.0, 1.4)


if __name__ == "__main__":
    outdir = sys.argv[1]
    write_mp3(hangar(), f"{outdir}/hangar-rust-and-warmth.mp3", "Hangar - Rust and Warmth")
    print("hangar done")
    write_mp3(contact(), f"{outdir}/contact.mp3", "Contact")
    print("contact done")
