"""Synthesize the 30s music bed for the leyla.ai x Expedia demo (no samples, no licences).
Soft pad + pulse at 104 bpm, whooshes on scene cuts, clicks on the two cursor clicks.
Usage: python3 -I tools/demo-video/music.py out.wav"""
import sys, wave, numpy as np
SR, T = 48000, 30.5
t = np.arange(int(SR * T)) / SR
out = np.zeros_like(t)
rng = np.random.default_rng(7)
def note(f): return 440 * 2 ** ((f - 69) / 12)
# chords (midi), 2 bars each at 104 bpm -> one chord per ~4.6s
bpm = 104; beat = 60 / bpm; bar = 4 * beat
prog = [[57, 64, 69, 72], [53, 60, 65, 69], [48, 55, 64, 67], [55, 62, 67, 71]]
for i in range(int(T / (2 * bar)) + 1):
    t0 = i * 2 * bar; ch = prog[i % 4]
    m = (t >= t0) & (t < t0 + 2 * bar + 0.6)
    tt = t[m] - t0
    env = np.minimum(tt / 0.8, 1) * np.exp(-np.maximum(tt - 2 * bar, 0) / 0.25)
    sig = sum(np.sin(2 * np.pi * note(n) * tt + 0.3 * np.sin(2 * np.pi * 0.2 * tt)) + 0.25 * np.sin(2 * np.pi * 2 * note(n) * tt) for n in ch)
    out[m] += 0.05 * env * sig
    # bass on the root
    out[m] += 0.10 * env * np.sin(2 * np.pi * note(ch[0] - 12) * tt)
# pulse: soft kick on every beat, tick on offbeats, starts quiet and builds
n_beats = int(T / beat)
for b in range(n_beats):
    tb = b * beat
    gain = 0.35 + 0.65 * min(tb / 15, 1)
    if 9.8 <= tb < 12.9: gain *= 0.25          # the question: hold back
    m = (t >= tb) & (t < tb + 0.35); tt = t[m] - tb
    out[m] += gain * 0.45 * np.sin(2 * np.pi * (50 + 90 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 9)
    to = tb + beat / 2
    m = (t >= to) & (t < to + 0.06); tt = t[m] - to
    out[m] += gain * 0.05 * rng.standard_normal(m.sum()) * np.exp(-tt * 70)
# whooshes into each cut
def whoosh(at, length=0.7, g=0.18):
    m = (t >= at - length) & (t < at + 0.15); tt = t[m] - (at - length)
    n = rng.standard_normal(m.sum())
    n = np.convolve(n, np.ones(12) / 12, mode='same')
    env = (tt / length) ** 2 * np.exp(-np.maximum(tt - length, 0) * 30)
    out[m] += g * n * env
for c in [5.5, 9.8, 12.9, 15.35, 22.6]: whoosh(c)
def click(at, g=0.25):
    m = (t >= at) & (t < at + 0.04); tt = t[m] - at
    out[m] += g * np.sin(2 * np.pi * 2400 * tt) * np.exp(-tt * 160)
click(15.35 + 1.7); click(15.35 + 6.4)
# final hit on the wordmark + gentle tail
m = t >= 26.3; tt = t[m] - 26.3
out[m] += 0.5 * np.sin(2 * np.pi * (45 + 70 * np.exp(-tt * 25)) * tt) * np.exp(-tt * 4)
out[m] += 0.06 * sum(np.sin(2 * np.pi * note(n) * tt) for n in [45, 57, 64, 69, 76]) * np.exp(-tt * 0.7)
# fade out
out *= np.clip((T - t) / 1.2, 0, 1)
out /= np.max(np.abs(out)) * 1.05
st = np.stack([out, np.roll(out, 240)], 1)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype('<i2').tobytes())
