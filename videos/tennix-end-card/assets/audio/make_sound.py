"""Soundtrack for the Tennix end card v2 (6.0s), cut to the composition's beats.

Usage: python make_sound.py <out.wav>   (numpy only; 48 kHz stereo)
Beats: ball bounces 0.30 / 0.55, pillar slams 0.60 / 0.95 / 1.30 / 1.65, riser into the X slam at 2.00,
ball smash 2.35, match-cut whoosh 2.35-2.95, slot ticks to 3.40, closing chord and living hold to 6.0.
Key: E minor for the slams, resolving to E major on the logo.
"""
import sys
import wave

import numpy as np

SR, DUR = 48000, 6.0
N = int(SR * DUR)
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(11)


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    s = sig[: j - i] * gain
    L[i:j] += s * np.sqrt((1 - pan) / 2) * 1.414
    R[i:j] += s * np.sqrt((1 + pan) / 2) * 1.414


def t_(d):
    return np.arange(int(d * SR)) / SR


def onepole(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    s = 0.0
    for k in range(len(x)):
        s = (1 - a) * x[k] + a * s
        y[k] = s
    return y


def pock(gain=1.0, pitch=1.0):
    """Tennis ball on court: a hollow, very short resonant knock."""
    t = t_(0.09)
    body = np.sin(2 * np.pi * 1150 * pitch * t) * np.exp(-t * 70) + 0.5 * np.sin(2 * np.pi * 620 * pitch * t) * np.exp(-t * 55)
    click = rng.standard_normal(len(t)) * np.exp(-t * 900)
    return (body + 0.35 * click) * gain


def kick(f0=130, f1=42, dec=9.0, d=0.45):
    t = t_(d)
    f = f1 + (f0 - f1) * np.exp(-t * 28)
    return np.tanh(2.2 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * dec))


def clap(d=0.22):
    t = t_(d)
    n = rng.standard_normal(len(t))
    n = n - onepole(n, 900)
    env = np.exp(-t * 26) * (1 + 0.6 * np.sin(2 * np.pi * 90 * t) * np.exp(-t * 60))
    return n * env


def stab(notes, d=0.32, bright=2600):
    """Detuned saw chord, filtered, punchy decay."""
    t = t_(d)
    s = np.zeros(len(t))
    for m in notes:
        for det in (-0.08, 0.08):
            s += 2 * ((t * hz(m + det)) % 1) - 1
    s = onepole(s / (len(notes) * 2), bright) * np.exp(-t * 7)
    return s


def whoosh(d, f_from, f_to, up=True):
    t = t_(d)
    n = rng.standard_normal(len(t))
    fc = np.linspace(f_from, f_to, len(t))
    y = np.empty_like(n)
    s = 0.0
    for k in range(len(n)):  # time-varying one-pole low pass
        a = np.exp(-2 * np.pi * fc[k] / SR)
        s = (1 - a) * n[k] + a * s
        y[k] = s
    env = (t / d) ** 2 if up else np.sin(np.pi * t / d) ** 2
    return y * env


def crash(d=2.2):
    t = t_(d)
    n = rng.standard_normal(len(t))
    n = n - onepole(n, 4000)
    return n * np.exp(-t * 2.2)


def bell(m, d=1.6):
    t = t_(d)
    f = hz(m)
    return (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 5)
            + 0.25 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 9)) * np.exp(-t * 2.6)


def pad(notes, d, att=0.5, rel=1.4):
    t = t_(d)
    s = np.zeros(len(t))
    for m in notes:
        for det in (-0.1, 0.0, 0.1):
            s += 2 * ((t * hz(m + det)) % 1) - 1
    s = onepole(s / (len(notes) * 3), 1400)
    env = np.minimum(1, t / att) * np.minimum(1, (d - t) / rel)
    return s * env


# 0.00-0.60 the rally: low tension bed and the court drawing in
add(whoosh(0.6, 200, 2200), 0.0, 0.10)
t = t_(0.6)
add(np.sin(2 * np.pi * 41.2 * t) * np.minimum(1, t / 0.3) * 0.5, 0.0, 0.25)
add(pock(1.0, 0.95), 0.30, 0.55, -0.2)
add(pock(1.0, 1.05), 0.55, 0.65, 0.2)

# Four pillar slams on the beat: kick + clap + an E minor stab climbing each time, with a whoosh into each
stabs = [[40, 47, 52, 55], [43, 50, 55, 59], [45, 52, 57, 60], [47, 54, 59, 62]]
for k, at in enumerate([0.60, 0.95, 1.30, 1.65]):
    add(whoosh(0.12, 800, 6000), at - 0.12, 0.10, 0.4 if k % 2 else -0.4)
    add(kick(), at, 0.85)
    add(clap(), at, 0.28, 0.1 if k % 2 else -0.1)
    add(stab(stabs[k]), at, 0.30, -0.15)
    add(stab([n + 12 for n in stabs[k]], d=0.25, bright=4200), at + 0.005, 0.12, 0.15)

# Riser into the X slam, then a beat of silence before the payoff
add(whoosh(0.30, 300, 9000), 1.68, 0.22)
t = t_(0.30)
add(np.sin(2 * np.pi * np.cumsum(220 + 1400 * (t / 0.3) ** 2) / SR) * (t / 0.3) ** 2 * 0.25, 1.68, 0.6)

# 2.00 the giant X slams in: sub boom, distorted kick, crash
add(kick(160, 36, 3.2, 1.6), 2.00, 1.0)
add(crash(1.6), 2.00, 0.14, -0.3)
add(stab([28, 40, 47], d=0.6, bright=900), 2.00, 0.35)

# 2.35 the ball smashes into the crossing: big pock, shimmer, wide crash
add(pock(1.6, 0.85), 2.35, 0.9)
add(kick(120, 50, 12, 0.3), 2.35, 0.5)
add(crash(2.4), 2.35, 0.22, 0.35)
for k, m in enumerate([76, 83, 88, 95]):
    add(bell(m, 1.2), 2.36 + k * 0.025, 0.05, (-0.5, 0.5, -0.2, 0.2)[k])

# 2.35-2.95 match cut down to the lockup
add(whoosh(0.6, 7000, 400, up=False), 2.35, 0.16)

# 2.95-3.40 the tagline slot rolls: rising ticks, then it locks on FOLLOW FOR MORE
for k, at in enumerate([3.03, 3.13, 3.23, 3.33]):
    t = t_(0.03)
    add(np.sin(2 * np.pi * (1800 + 250 * k) * t) * np.exp(-t * 180), at, 0.22)
add(bell(88, 1.8), 3.40, 0.12)
add(bell(95, 1.8), 3.42, 0.07, 0.3)
add(clap(0.12), 3.40, 0.12)

# Closing: E major resolution and a soft pulse that keeps the hold alive
add(pad([40, 52, 56, 59, 66], 2.65, att=0.35, rel=1.6), 3.35, 0.22)
add(kick(90, 45, 10, 0.4), 3.40, 0.5)
for k in range(9):
    at = 3.70 + k * 0.25
    t = t_(0.05)
    n = rng.standard_normal(len(t))
    n = n - onepole(n, 7000)
    add(n * np.exp(-t * 90), at, 0.05 * (1 - k / 10), 0.3)

mix = np.stack([L, R], 1)
fade = np.ones(N)
fi = int(0.4 * SR)
fade[-fi:] = np.linspace(1, 0, fi)
mix *= fade[:, None]
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix *= 0.56 / np.abs(mix).max()  # about -14 LUFS, the social platforms target
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
