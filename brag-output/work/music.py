# Original score + SFX for the AI For You brag video. 100 BPM, A major. Writes music.wav (48 kHz stereo).
import numpy as np, wave, sys
SR = 48000; DUR = 20.4; N = int(SR * DUR)
t = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)
BEAT = 60 / 100
def hz(m): return 440 * 2 ** ((m - 69) / 12)
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
    e[:ai] = np.linspace(0, 1, ai) if ai else 1
    if di: e[-di:] *= np.linspace(1, 0, di)
    return e

# Chords per bar (4 beats = 2.5s): A, F#m, D, E
CH = [[57, 61, 64, 69], [54, 57, 61, 66], [50, 57, 62, 66], [52, 56, 59, 64]]
BAR = 4 * BEAT
nbars = int(np.ceil(DUR / BAR))
# Pad: detuned soft saws, low passed
for b in range(nbars):
    st = b * BAR; ln = BAR + 0.4; n = int(ln * SR); tt = np.arange(n) / SR
    sig = np.zeros(n)
    for m in CH[b % 4]:
        for det in (-0.12, 0.12):
            f = hz(m) * 2 ** (det / 12)
            sig += 2 * ((tt * f) % 1) - 1
    sig = lp(sig / 8, 900) * env(n, 0.35, 0.45)
    add(sig, st, 0.10, -0.2); add(sig, st + 0.011, 0.10, 0.2)
# Bass on beats 1 and 3 from 3.4s
for b in range(nbars):
    for k in (0, 2):
        st = b * BAR + k * BEAT
        if st < 3.4 or st > 16.4: continue
        n = int(0.55 * SR); tt = np.arange(n) / SR
        sig = np.sin(2 * np.pi * hz(CH[b % 4][0] - 12) * tt) * np.exp(-tt * 5)
        add(sig, st, 0.22)
# Kick from 3.4 to 16.4
for k in range(int(DUR / BEAT) + 1):
    st = k * BEAT
    if st < 3.45 or st > 16.4: continue
    n = int(0.3 * SR); tt = np.arange(n) / SR
    f = 50 + 70 * np.exp(-tt * 30)
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 12)
    add(sig, st, 0.30)
# Hats (offbeat 8ths) from 6.4 to 16.4
rng = np.random.default_rng(7)
for k in range(int(DUR / (BEAT / 2)) + 1):
    st = k * BEAT / 2 + BEAT / 2 * 0  # 8ths
    if k % 2 == 0 or st < 6.4 or st > 16.4: continue
    n = int(0.06 * SR); tt = np.arange(n) / SR
    nz = rng.standard_normal(n); nz = nz - lp(nz, 6000)
    add(nz * np.exp(-tt * 70), st, 0.035, 0.3)
# Pluck arpeggio 8ths from 3.4 to 16.4, ends on a sustained A chord at 16.4
def pluck(m, ln=0.5, bright=1.0):
    n = int(ln * SR); tt = np.arange(n) / SR; f = hz(m)
    s = np.sin(2 * np.pi * f * tt) + 0.3 * bright * np.sin(4 * np.pi * f * tt) + 0.12 * bright * np.sin(6 * np.pi * f * tt)
    return s * np.exp(-tt * 7)
for k in range(int(DUR / (BEAT / 2)) + 1):
    st = k * BEAT / 2
    if st < 3.4 or st >= 16.4: continue
    b = int(st // BAR); ch = CH[b % 4]
    pat = [0, 2, 3, 1, 2, 3, 1, 2]
    m = ch[pat[k % 8]] + 12
    add(pluck(m), st, 0.07, 0.35 if k % 2 else -0.35)
# Outro chord
for m in [57, 61, 64, 69, 73]:
    n = int(4.2 * SR); tt = np.arange(n) / SR
    s = (np.sin(2 * np.pi * hz(m) * tt) + 0.25 * np.sin(4 * np.pi * hz(m) * tt)) * np.exp(-tt * 0.9) * env(n, 0.01, 1.2)
    add(s, 16.4, 0.06)

# --- SFX, tuned to A major and kept under the music ---
def tick(gain):
    n = int(0.025 * SR); tt = np.arange(n) / SR
    nz = rng.standard_normal(n); nz = nz - lp(nz, 2500)
    return nz * np.exp(-tt * 260) * gain
def bell(m, ln=1.2):
    n = int(ln * SR); tt = np.arange(n) / SR; f = hz(m)
    return (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 6)) * np.exp(-tt * 4)
def thud(when, gain):
    n = int(1.0 * SR); tt = np.arange(n) / SR
    add(np.sin(2 * np.pi * np.cumsum(45 + 80 * np.exp(-tt * 18)) / SR) * np.exp(-tt * 5), when, gain)
# Hook: the "You'd rewrite this" stamp lands
thud(1.55, 0.32); add(tick(1), 1.55, 0.25)
# Reveal and black band land with a low hit
thud(3.5, 0.35); thud(13.05, 0.35)
# Lab: each "Add next layer" press is a click plus a rising bell
for when, m in [(7.38, 81), (9.18, 85), (10.88, 88)]:
    add(tick(1), when, 0.2); add(bell(m), when + 0.12, 0.06, 0.25)
add(bell(93, 1.6), 11.0, 0.04, -0.25)
# Four cells
for when, m in [(13.75, 76), (13.95, 81), (14.15, 85), (14.35, 88)]: add(pluck(m, 0.7, 0.5), when, 0.09, -0.1)
# Outro button click
add(tick(1), 18.85, 0.22); add(bell(81, 1.4), 18.88, 0.05)
# Whooshes on cuts
for when in (3.15, 6.15, 12.75, 16.15):
    n = int(0.45 * SR); tt = np.arange(n) / SR
    nz = rng.standard_normal(n); nz = lp(nz, 1800) - lp(nz, 300)
    add(nz * np.sin(np.pi * tt / 0.45) ** 2, when, 0.12, 0.0)

mix = np.stack([L, R], 1)
mix *= env(N, 0.08, 1.0)[:, None]
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 0.89 / np.abs(mix).max()
pcm = (mix * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
