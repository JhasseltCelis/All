# Original score + SFX for the AI For You brag videos. Usage: python3 music.py <cues.json> <out.wav>
# Cue file: bpm, transpose (semitones from A major), duration, groove_start, hats_start, end (outro chord),
# and sfx: [[kind, time, arg?], ...] with kinds thud, tick, bell (midi), pluck (midi), whoosh, typing (end time).
import json, sys, wave
import numpy as np
cue = json.load(open(sys.argv[1]))
SR = 48000; DUR = cue["duration"]; N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
BEAT = 60 / cue["bpm"]; TR = cue["transpose"]
G0, H0, END = cue["groove_start"], cue["hats_start"], cue["end"]
rng = np.random.default_rng(7)
def hz(m): return 440 * 2 ** ((m + TR - 69) / 12)
def lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s = (1 - a) * x[i] + a * s; y[i] = s
    return y
def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR); j = min(N, i + len(sig))
    if i >= N: return
    seg = sig[: j - i] * gain
    L[i:j] += seg * np.sqrt((1 - pan) / 2) * 1.414; R[i:j] += seg * np.sqrt((1 + pan) / 2) * 1.414
def env(n, a, d):
    e = np.ones(n); ai = int(a * SR); di = int(d * SR)
    if ai: e[:ai] = np.linspace(0, 1, ai)
    if di: e[-di:] *= np.linspace(1, 0, di)
    return e

# I, vi, IV, V in A major (transposed per video)
CH = [[57, 61, 64, 69], [54, 57, 61, 66], [50, 57, 62, 66], [52, 56, 59, 64]]
BAR = 4 * BEAT; nbars = int(np.ceil(DUR / BAR))
for b in range(nbars):  # pad: detuned soft saws, low passed
    st = b * BAR; n = int((BAR + 0.4) * SR); tt = np.arange(n) / SR
    sig = np.zeros(n)
    for m in CH[b % 4]:
        for det in (-0.12, 0.12):
            sig += 2 * ((tt * hz(m + det)) % 1) - 1
    sig = lp(sig / 8, 900) * env(n, 0.35, 0.45)
    add(sig, st, 0.10, -0.2); add(sig, st + 0.011, 0.10, 0.2)
for b in range(nbars):  # bass on beats 1 and 3
    for k in (0, 2):
        st = b * BAR + k * BEAT
        if st < G0 or st > END: continue
        n = int(0.55 * SR); tt = np.arange(n) / SR
        add(np.sin(2 * np.pi * hz(CH[b % 4][0] - 12) * tt) * np.exp(-tt * 5), st, 0.22)
for k in range(int(DUR / BEAT) + 1):  # kick
    st = k * BEAT
    if st < G0 + 0.05 or st > END: continue
    n = int(0.3 * SR); tt = np.arange(n) / SR
    f = 50 + 70 * np.exp(-tt * 30)
    add(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 12), st, 0.30)
for k in range(1, int(DUR / (BEAT / 2)) + 1, 2):  # offbeat hats
    st = k * BEAT / 2
    if st < H0 or st > END: continue
    n = int(0.06 * SR); tt = np.arange(n) / SR
    nz = rng.standard_normal(n); nz = nz - lp(nz, 6000)
    add(nz * np.exp(-tt * 70), st, 0.035, 0.3)
def pluck(m, ln=0.5, bright=1.0):
    n = int(ln * SR); tt = np.arange(n) / SR; f = hz(m)
    s = np.sin(2 * np.pi * f * tt) + 0.3 * bright * np.sin(4 * np.pi * f * tt) + 0.12 * bright * np.sin(6 * np.pi * f * tt)
    return s * np.exp(-tt * 7)
for k in range(int(DUR / (BEAT / 2)) + 1):  # arpeggio
    st = k * BEAT / 2
    if st < G0 or st >= END: continue
    ch = CH[int(st // BAR) % 4]
    add(pluck(ch[[0, 2, 3, 1, 2, 3, 1, 2][k % 8]] + 12), st, 0.07, 0.35 if k % 2 else -0.35)
for m in [57, 61, 64, 69, 73]:  # outro chord
    n = int((DUR - END + 0.2) * SR); tt = np.arange(n) / SR
    s = (np.sin(2 * np.pi * hz(m) * tt) + 0.25 * np.sin(4 * np.pi * hz(m) * tt)) * np.exp(-tt * 0.9) * env(n, 0.01, 1.2)
    add(s, END, 0.06)

# SFX, in the same key and kept under the music
def tick():
    n = int(0.025 * SR); tt = np.arange(n) / SR
    nz = rng.standard_normal(n); nz = nz - lp(nz, 2500)
    return nz * np.exp(-tt * 260)
def bell(m, ln=1.2):
    n = int(ln * SR); tt = np.arange(n) / SR; f = hz(m)
    return (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 6)) * np.exp(-tt * 4)
for ev in cue["sfx"]:
    kind, at = ev[0], ev[1]
    if kind == "thud":
        n = int(1.0 * SR); tt = np.arange(n) / SR
        add(np.sin(2 * np.pi * np.cumsum(45 + 80 * np.exp(-tt * 18)) / SR) * np.exp(-tt * 5), at, 0.34)
    elif kind == "tick": add(tick(), at, 0.2)
    elif kind == "click": add(tick(), at, 0.22); add(bell(81, 1.4), at + 0.03, 0.05)
    elif kind == "bell": add(bell(ev[2]), at, 0.06, 0.25)
    elif kind == "pluck": add(pluck(ev[2], 0.7, 0.5), at, 0.09, -0.1)
    elif kind == "whoosh":
        n = int(0.45 * SR); tt = np.arange(n) / SR
        nz = rng.standard_normal(n); nz = lp(nz, 1800) - lp(nz, 300)
        add(nz * np.sin(np.pi * tt / 0.45) ** 2, at, 0.12)
    elif kind == "typing":
        x = at
        while x < ev[2]:
            add(tick(), x + rng.uniform(-0.01, 0.01), 0.06 * rng.uniform(0.7, 1.1), rng.uniform(-0.3, 0.3)); x += 0.05

mix = np.stack([L, R], 1) * env(N, 0.08, 1.0)[:, None]
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 0.85 / np.abs(mix).max()
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
