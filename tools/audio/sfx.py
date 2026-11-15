"""WRECKLINE sound effects. Short, soft, mid-range. Run: python3 sfx.py OUTDIR"""
import sys
import numpy as np
from synth import SR, adsr, bandpass, highpass, lowpass, midi, noise, osc, sweep_lowpass, write_mp3

# Loudness tiers (peak dBFS): UI is the quietest, events the loudest. BGM peaks at about -1 dBFS.
TIER = {"ui": -18.0, "work": -14.0, "combat": -15.0, "event": -11.0}


def n_of(s):
    return int(s * SR)


class Sig(np.ndarray):
    """A mono signal whose + pads the shorter one with silence (sounds of different lengths mix)."""

    def __new__(cls, x):
        return np.asarray(x, dtype=float).view(cls)

    def __add__(self, other):
        if isinstance(other, np.ndarray) and other.ndim == 1 and len(other) != len(self):
            n = max(len(self), len(other))
            a = np.zeros(n); a[: len(self)] = self
            b = np.zeros(n); b[: len(other)] = other
            return Sig(a + b)
        return Sig(np.asarray(self) + other)

    __radd__ = __add__


def env_exp(n, rate, attack=0.002):
    t = np.arange(n) / SR
    return np.exp(-t * rate) * np.clip(t / attack, 0, 1)


def tone(freq, seconds, kind="sine", rate=12.0, attack=0.003):
    n = n_of(seconds)
    return Sig(osc(kind, freq, n) * env_exp(n, rate, attack))


def glide(f0, f1, seconds, kind="sine", rate=6.0, attack=0.005):
    n = n_of(seconds)
    t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / seconds)
    ph = np.cumsum(f) / SR
    if kind == "sine":
        x = np.sin(2 * np.pi * ph)
    elif kind == "saw":
        x = 2 * (ph % 1) - 1
    else:
        x = np.where(ph % 1 < 0.5, 1.0, -1.0)
    return Sig(x * env_exp(n, rate, attack))


def burst(seconds, lo, hi, rate, attack=0.001):
    n = n_of(seconds)
    return Sig(bandpass(noise(n), lo, hi) * env_exp(n, rate, attack))


def thump(f0=120, f1=45, seconds=0.25, rate=14):
    return glide(f0, f1, seconds, "sine", rate, 0.002)


def metal_hit(base, seconds=0.5, decay=6.0, partials=((1, 1), (2.76, 0.6), (5.4, 0.35), (8.93, 0.18))):
    n = n_of(seconds)
    t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * base * r * t) * a * np.exp(-t * decay * (1 + r * 0.2)) for r, a in partials)
    return Sig(x * np.clip(t / 0.001, 0, 1))


def at(parts, total):
    """[(start_seconds, signal)] → one buffer of `total` seconds."""
    out = np.zeros(n_of(total))
    for s, x in parts:
        i = n_of(s)
        j = min(len(out), i + len(x))
        out[i:j] += x[: j - i]
    return out


def finish(x, tier):
    x = highpass(x, 70)
    x = lowpass(x, 9000)
    fade = min(len(x), n_of(0.01))
    x[-fade:] *= np.linspace(1, 0, fade)
    peak = np.max(np.abs(x)) or 1.0
    return x / peak * 10 ** (TIER[tier] / 20)


# ---------------------------------------------------------------- UI
def ui_tap():
    return finish(at([(0, burst(0.03, 1500, 5000, 180)), (0, tone(1250, 0.04, rate=90) * 0.6)], 0.05), "ui")


def ui_back():
    return finish(at([(0, burst(0.03, 900, 3500, 160)), (0, glide(900, 600, 0.06, rate=60) * 0.6)], 0.07), "ui")


def ui_open():
    return finish(at([(0, tone(880, 0.07, rate=40)), (0.05, tone(1175, 0.09, rate=35))], 0.15), "ui")


def ui_confirm():
    latch = burst(0.02, 800, 4000, 200) + thump(220, 90, 0.08, 40) * 0.8
    return finish(at([(0, burst(0.015, 2000, 6000, 260) * 0.6), (0.045, latch)], 0.15), "ui")


def ui_cancel():
    return finish(at([(0, tone(988, 0.07, rate=40)), (0.06, tone(740, 0.1, rate=30))], 0.17), "ui")


def ui_denied():
    b = lambda: lowpass(osc("square", 140, n_of(0.07)), 900) * env_exp(n_of(0.07), 30)
    return finish(at([(0, b()), (0.1, b())], 0.19), "ui")


def coin_gain():
    return finish(at([(0, metal_hit(1320, 0.25, 12)), (0.08, metal_hit(1760, 0.3, 10))], 0.38), "work")


def coin_spend():
    return finish(at([(0, metal_hit(1100, 0.2, 14)), (0.01, thump(160, 70, 0.15, 25) * 0.6)], 0.22), "work")


# ---------------------------------------------------------------- DOCK work
def repair():
    clicks = [(i * 0.09, burst(0.03, 1000, 3500, 150) + metal_hit(1500, 0.05, 50) * 0.3) for i in range(3)]
    hiss = (0.28, burst(0.18, 1500, 4000, 12, 0.03) * 0.2)
    return finish(at(clicks + [hiss], 0.5), "work")


def charge():
    x = glide(110, 330, 0.5, "saw", 1.5, 0.05)
    x = sweep_lowpass(x, 300, 1800, 10)
    n = len(x)
    x *= np.clip((0.5 - np.arange(n) / SR) / 0.08, 0, 1)
    return finish(at([(0, x), (0.48, tone(660, 0.12, rate=30) * 0.5)], 0.62), "work")


def equip():
    snap = burst(0.02, 1500, 6000, 220) + thump(260, 120, 0.06, 50) * 0.7
    chirp = glide(1200, 2000, 0.08, rate=25) * 0.35
    return finish(at([(0, snap), (0.04, chirp)], 0.18), "work")


def scrap():
    parts = [(0, metal_hit(420, 0.5, 7)), (0.12, metal_hit(610, 0.4, 9) * 0.7), (0.22, metal_hit(330, 0.4, 8) * 0.6),
             (0, thump(140, 50, 0.3, 10) * 0.7), (0.05, burst(0.25, 500, 3000, 14) * 0.25)]
    return finish(at(parts, 0.7), "work")


def mech_new():
    hiss = burst(0.35, 1500, 6000, 6, 0.04) * 0.35
    clunk = thump(180, 60, 0.3, 14) + metal_hit(520, 0.3, 10) * 0.5
    return finish(at([(0, hiss), (0.32, clunk)], 0.75), "work")


# ---------------------------------------------------------------- explore: combat
def fire(pitch=1.0, dark=1.0):
    crack = burst(0.06, 700 * pitch, 3200 * pitch / dark, 55)
    mid = burst(0.05, 350 * pitch, 1200 * pitch, 70)
    body = thump(180 * pitch, 70 * pitch, 0.12, 30)
    return at([(0, crack * 1.3), (0, mid * 0.9), (0, body * 0.6)], 0.14)


def fire_player():
    return finish(fire(1.0, 1.0), "combat")


def fire_wing():
    return finish(fire(1.15, 1.0), "combat") * 0.7


def fire_enemy():
    return finish(fire(0.8, 1.6), "combat") * 0.85


def hit_enemy():
    return finish(at([(0, metal_hit(1450, 0.09, 40)), (0, burst(0.03, 1500, 5000, 150) * 0.5)], 0.1), "combat")


def hit_self():
    return finish(at([(0, thump(150, 60, 0.15, 20) * 0.7), (0.01, burst(0.12, 400, 2500, 25) * 0.8), (0, metal_hit(520, 0.12, 25) * 0.5)], 0.17), "combat")


def enemy_down():
    parts = [(0, burst(0.08, 300, 3000, 30) * 1.2), (0, thump(130, 40, 0.4, 8) * 0.8),
             (0.06, metal_hit(470, 0.35, 9) * 0.5), (0.16, metal_hit(300, 0.35, 10) * 0.4),
             (0.1, burst(0.3, 200, 1200, 10, 0.02) * 0.35)]
    return finish(at(parts, 0.6), "event")


def ally_wrecked():
    parts = [(0, thump(110, 35, 0.6, 5) * 0.8), (0, burst(0.3, 150, 900, 8) * 0.6), (0, burst(0.25, 400, 2000, 12) * 0.5),
             (0.05, metal_hit(260, 0.5, 6) * 0.5),
             (0.35, tone(523, 0.12, "square", 25) * 0.15), (0.5, tone(440, 0.14, "square", 25) * 0.15)]
    return finish(at(parts, 0.8), "event")


def shield_break():
    glass = sum(metal_hit(b, 0.3, 14, ((1, 1), (2.3, 0.5), (3.9, 0.25))) for b in (1300, 1650, 2050)) / 3
    return finish(at([(0, glass), (0, burst(0.15, 1800, 4500, 25) * 0.4)], 0.32), "combat")


def air_support():
    whoosh = burst(0.8, 400, 3000, 1.2, 0.5)
    whoosh = sweep_lowpass(whoosh, 600, 3000, 12)
    boom = thump(90, 30, 0.7, 5) * 0.8 + burst(0.4, 100, 1200, 8) * 0.6 + burst(0.3, 400, 2200, 10) * 0.5
    return finish(at([(0, whoosh * 0.9), (0.8, boom)], 1.5), "event")


# ---------------------------------------------------------------- explore: salvage, orders, extraction
def salvage_start():
    return finish(at([(0, burst(0.02, 900, 4000, 180)), (0.03, thump(200, 110, 0.08, 40) * 0.7)], 0.12), "work")


def salvage_done():
    return finish(at([(0, thump(170, 80, 0.15, 25) * 0.7), (0.06, tone(784, 0.18, rate=14)), (0.14, tone(1047, 0.22, rate=12))], 0.38), "work")


def container_found():
    ping = tone(1568, 0.35, rate=9) + tone(1568 * 2, 0.2, rate=20) * 0.15
    echo = tone(1568, 0.3, rate=12) * 0.3
    return finish(at([(0, ping), (0.18, echo)], 0.5), "work")


def order():
    return finish(at([(0, burst(0.025, 1200, 4500, 160) * 0.7), (0.03, tone(1320, 0.07, "square", 40) * 0.3)], 0.12), "ui")


def extract_request():
    beep = lambda f: lowpass(osc("square", f, n_of(0.08)), 2500) * env_exp(n_of(0.08), 20, 0.005)
    return finish(at([(0, burst(0.03, 1000, 4000, 120) * 0.6), (0.05, beep(988)), (0.18, beep(1319))], 0.32), "event")


def liftoff():
    x = burst(1.6, 300, 4000, 0.5, 0.6)
    x = sweep_lowpass(x, 400, 3500, 16)
    rumble = lowpass(noise(n_of(1.6)), 180) * env_exp(n_of(1.6), 1.5, 0.3) * 1.5
    y = x + rumble
    n = len(y)
    y *= np.clip((1.6 - np.arange(n) / SR) / 0.4, 0, 1)
    return finish(y, "event")


def time_warning():
    tone2 = lambda f: lowpass(osc("tri", f, n_of(0.16)), 2000) * adsr(n_of(0.16), 0.01, 0.05, 0.7, 0.06)
    return finish(at([(0, tone2(660)), (0.22, tone2(660))], 0.42), "event")


def board_cleared():
    chord = sum(tone(midi(n), 0.6, "tri", 4, 0.01) for n in (57, 64, 69)) / 3
    return finish(at([(0, chord), (0.08, tone(midi(76), 0.5, rate=5, attack=0.01) * 0.5)], 0.7), "event")


# ---------------------------------------------------------------- puzzles
def restore_edge():
    return finish(at([(0, burst(0.012, 2000, 6000, 350)), (0, tone(1760, 0.025, rate=150) * 0.5)], 0.03), "ui")


def restore_cross():
    return finish(at([(0, burst(0.012, 900, 3000, 300)), (0, tone(660, 0.025, rate=150) * 0.4)], 0.03), "ui")


def restore_solved():
    notes = [(0, 72), (0.09, 76), (0.18, 79), (0.27, 84)]
    return finish(at([(t, tone(midi(n), 0.5, rate=6, attack=0.004)) for t, n in notes], 0.8), "event")


def restore_perfect():
    notes = [(0, 72), (0.08, 76), (0.16, 79), (0.24, 83), (0.32, 86)]
    shimmer = sum(tone(midi(91) * (1 + 0.004 * k), 0.8, rate=3, attack=0.2) for k in range(3)) * 0.12
    return finish(at([(t, tone(midi(n), 0.6, rate=5, attack=0.004)) for t, n in notes] + [(0.3, shimmer)], 1.1), "event")


def sort_open():
    creak = glide(180, 140, 0.25, "saw", 3, 0.03)
    creak = bandpass(creak, 300, 2000) * 0.4
    pop = burst(0.05, 600, 3500, 60) + thump(200, 90, 0.1, 30) * 0.8
    return finish(at([(0, creak), (0.24, pop)], 0.42), "work")


def sort_place():
    return finish(at([(0, thump(190, 100, 0.08, 40)), (0, burst(0.02, 900, 3000, 200) * 0.4)], 0.09), "ui")


def invade_open():
    return finish(at([(0, burst(0.04, 500, 2500, 90)), (0, thump(240, 140, 0.05, 60) * 0.5)], 0.07), "ui")


def invade_flag():
    return finish(at([(0, burst(0.06, 1200, 5000, 50) * 0.6), (0.03, tone(1047, 0.06, "tri", 40) * 0.5)], 0.1), "ui")


def invade_mine():
    boom = thump(100, 30, 0.6, 5) * 0.8 + burst(0.35, 120, 1500, 9) * 0.7 + burst(0.25, 400, 2200, 12) * 0.5
    alarm = at([(0, tone(523, 0.12, "square", 20)), (0.16, tone(392, 0.16, "square", 15))], 0.35)
    return finish(at([(0, boom), (0.35, lowpass(alarm, 2200) * 0.25)], 0.75), "event")


SFX = [
    # (file, 日本語の場面, function)
    ("ui-tap", "画面：ボタンを押す", ui_tap),
    ("ui-back", "画面：‹ 戻る", ui_back),
    ("ui-open", "画面：パレットを開く", ui_open),
    ("ui-confirm", "画面：確認ダイアログで決定", ui_confirm),
    ("ui-cancel", "画面：やめる", ui_cancel),
    ("ui-denied", "画面：できない操作", ui_denied),
    ("coin-gain", "格納庫：売却して入金", coin_gain),
    ("coin-spend", "格納庫：購入して支払い", coin_spend),
    ("repair", "格納庫：修理・残骸復活", repair),
    ("charge", "格納庫：充電", charge),
    ("equip", "格納庫：回路を装備・外す", equip),
    ("scrap", "格納庫：解体", scrap),
    ("mech-new", "格納庫：新品購入・新規作成", mech_new),
    ("fire-player", "探索：隊長の射撃", fire_player),
    ("fire-wing", "探索：僚機の射撃（小さめ）", fire_wing),
    ("fire-enemy", "探索：敵の射撃（暗め）", fire_enemy),
    ("hit-enemy", "探索：敵に命中", hit_enemy),
    ("hit-self", "探索：味方が被弾", hit_self),
    ("shield-break", "探索：盾が壊れる", shield_break),
    ("enemy-down", "探索：敵を撃破", enemy_down),
    ("ally-wrecked", "探索：味方が大破", ally_wrecked),
    ("air-support", "探索：航空支援", air_support),
    ("salvage-start", "探索：回収を始める", salvage_start),
    ("salvage-done", "探索：回収完了", salvage_done),
    ("container-found", "探索：コンテナ発見", container_found),
    ("order", "探索：僚機へ指示", order),
    ("extract-request", "探索：帰還要請", extract_request),
    ("time-warning", "探索：残り30秒", time_warning),
    ("liftoff", "探索：離昇", liftoff),
    ("board-cleared", "探索：地雷マスを「済」に", board_cleared),
    ("restore-edge", "修復：線を引く", restore_edge),
    ("restore-cross", "修復：×を付ける", restore_cross),
    ("restore-solved", "修復：完成", restore_solved),
    ("restore-perfect", "修復：パーフェクト", restore_perfect),
    ("sort-open", "仕分：コンテナを開ける", sort_open),
    ("sort-place", "仕分：物を置く", sort_place),
    ("invade-open", "偵察：マスを開く", invade_open),
    ("invade-flag", "偵察：旗を立てる", invade_flag),
    ("invade-mine", "偵察：地雷を踏む", invade_mine),
]

if __name__ == "__main__":
    outdir = sys.argv[1]
    sampler = []
    for name, label, fn in SFX:
        x = fn()
        write_mp3(np.stack([x, x], axis=1), f"{outdir}/{name}.mp3", f"SFX {name}", kbps=96)
        sampler += [x, np.zeros(n_of(0.7))]
    s = np.concatenate(sampler)
    write_mp3(np.stack([s, s], axis=1), f"{outdir}/_sampler.mp3", "WRECKLINE SFX sampler", kbps=128)
    print(len(SFX), "sfx done")
