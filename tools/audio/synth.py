"""Tiny offline synth for WRECKLINE BGM sketches (numpy + scipy). Stereo float32 at 44.1 kHz."""
import numpy as np
from scipy import signal

SR = 44100
RNG = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def t_of(seconds):
    return np.arange(int(seconds * SR)) / SR


def adsr(n, a=0.01, d=0.1, s=0.7, r=0.2, gate=None):
    """Envelope of n samples; gate = seconds held before release (default: until the end minus r)."""
    total = n / SR
    gate = total - r if gate is None else min(gate, total)
    t = np.arange(n) / SR
    env = np.where(t < a, t / max(a, 1e-6), 0.0)
    dec = (t >= a) & (t < a + d)
    env = np.where(dec, 1 - (1 - s) * (t - a) / max(d, 1e-6), env)
    env = np.where((t >= a + d) & (t < gate), s, env)
    level_at_gate = s if gate >= a + d else (gate / max(a, 1e-6) if gate < a else 1 - (1 - s) * (gate - a) / max(d, 1e-6))
    rel = t >= gate
    env = np.where(rel, level_at_gate * np.clip(1 - (t - gate) / max(r, 1e-6), 0, 1), env)
    return env


def osc(kind, freq, n, phase=0.0, detune_cents=0.0):
    f = freq * 2 ** (detune_cents / 1200)
    ph = (phase + f * np.arange(n) / SR) % 1.0
    if kind == "sine":
        return np.sin(2 * np.pi * ph)
    if kind == "saw":
        return 2 * ph - 1
    if kind == "square":
        return np.where(ph < 0.5, 1.0, -1.0)
    if kind == "tri":
        return 4 * np.abs(ph - 0.5) - 1
    raise ValueError(kind)


def lowpass(x, cutoff, q=0.707, order=2):
    cutoff = min(cutoff, SR * 0.45)
    sos = signal.butter(order, cutoff, btype="low", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def highpass(x, cutoff, order=2):
    sos = signal.butter(order, cutoff, btype="high", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, min(hi, SR * 0.45)], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def sweep_lowpass(x, start, end, steps=24):
    """Time-varying low-pass by blocks (cutoff moves exponentially from start to end)."""
    out = np.zeros_like(x)
    edges = np.linspace(0, len(x), steps + 1).astype(int)
    zi = None
    for i in range(steps):
        c = start * (end / start) ** (i / max(steps - 1, 1))
        sos = signal.butter(2, min(c, SR * 0.45), btype="low", fs=SR, output="sos")
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        seg = x[edges[i]:edges[i + 1]]
        y, zi = signal.sosfilt(sos, seg, zi=zi)
        out[edges[i]:edges[i + 1]] = y
    return out


def noise(n):
    return RNG.uniform(-1, 1, n)


def pan(mono, p):
    """p in [-1, 1] → stereo (equal power)."""
    a = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], axis=1)


def reverb_ir(seconds=2.5, decay=3.0, bright=6000):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.stack([noise(n), noise(n)], axis=1) * np.exp(-decay * t)[:, None]
    ir = lowpass(ir, bright)
    ir[: int(0.012 * SR)] *= 0  # small pre-delay
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def convolve_reverb(dry, ir, wet=0.25):
    out = np.zeros((len(dry) + len(ir) - 1, 2))
    for ch in range(2):
        out[:, ch] = signal.fftconvolve(dry[:, ch], ir[:, ch])
    out[: len(dry)] = out[: len(dry)] * wet + dry * (1 - wet * 0.5)
    out[len(dry):] *= wet
    return out


def feedback_delay(x, seconds, feedback=0.35, mix=0.25, taps=6):
    d = int(seconds * SR)
    out = x.copy()
    pad = np.zeros((d * taps, 2))
    out = np.concatenate([out, pad])
    g = mix
    for k in range(1, taps + 1):
        seg = x * g
        # ping-pong: swap channels on odd taps
        if k % 2:
            seg = seg[:, ::-1]
        out[d * k: d * k + len(x)] += seg
        g *= feedback
    return out


class Track:
    """A stereo buffer you place sounds into at a time (seconds)."""

    def __init__(self, seconds, tail=4.0):
        self.loop = int(seconds * SR)
        self.buf = np.zeros((self.loop + int(tail * SR), 2))

    def add(self, at, stereo):
        i = int(at * SR)
        j = min(i + len(stereo), len(self.buf))
        if i >= len(self.buf):
            return
        self.buf[i:j] += stereo[: j - i]

    def looped(self):
        """Wrap the tail (reverb/delay past the loop end) onto the start: a seamless loop."""
        out = self.buf[: self.loop].copy()
        tail = self.buf[self.loop:]
        k = 0
        while k < len(tail):
            m = min(self.loop, len(tail) - k)
            out[:m] += tail[k:k + m]
            k += m
        return out


def master(x, target_db=-1.0, drive=1.15):
    x = x - np.mean(x, axis=0)
    peak = np.max(np.abs(x)) or 1.0
    x = x / peak
    x = np.tanh(x * drive) / np.tanh(drive)
    return x * (10 ** (target_db / 20))


def write_mp3(x, path, title, kbps=160, channels=2):
    import subprocess, tempfile, wave
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        with wave.open(tmp.name, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", tmp.name, "-ac", str(channels), "-codec:a", "libmp3lame", "-b:a", f"{kbps}k",
             "-metadata", f"title={title}", "-metadata", "artist=WRECKLINE", path],
            check=True,
        )
