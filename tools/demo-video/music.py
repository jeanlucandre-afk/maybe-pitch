"""Sound design for the MAYBE demo films (no voice, no samples, no licences).

Musical spine: A major, 120 bpm, a four-note hook A5-C#6-E6-B5 that ends open (the "maybe")
and resolves B5->A5 on the final dot. UI sounds come from the film's own cue list and use the
deck's vocabulary (assets/careers.js): plucks, ticks, air, rises, the arrival chord, here with
FM plucks, detuned-saw chords, a kick with click and body, sidechain ducking, a decorrelated
stereo room and a gentle bus compressor.

Usage: python3 -I tools/demo-video/music.py cues.json out.wav [seconds]
cues.json comes from tools/demo-video/cues.mjs: [[time, type, param], ...]"""
import sys, json, wave, numpy as np

SR = 48000
cues = json.load(open(sys.argv[1]))
T = float(sys.argv[3]) if len(sys.argv) > 3 else 31.0
N = int(SR * T)
rng = np.random.default_rng(5)
BPM = 120; B = 60 / BPM; S16 = B / 4

# buses: mono centre, stereo (L,R) for panned UI, a room send, a ducked music bus, the beat
C = np.zeros(N); L = np.zeros(N); R = np.zeros(N); SEND = np.zeros(N); PAD = np.zeros(N); BEAT = np.zeros(N)

NOTES = [440, 493.88, 554.37, 659.25, 739.99, 880]        # A major pentatonic
MOTIF = [880, 1108.73, 1318.51, 987.77]                    # A5 C#6 E6 B5 -> resolves to A5
KICKS = []

def place(buf, at, sig):
    i = int(round(at * SR))
    if i >= N or i + len(sig) <= 0: return
    if i < 0: sig = sig[-i:]; i = 0
    j = min(N, i + len(sig)); buf[i:j] += sig[: j - i]

def env(n, attack, dur):
    t = np.arange(n) / SR
    return np.minimum(t / max(attack, 1e-4), 1) * np.exp(-6.9 * np.maximum(t - attack, 0) / max(dur - attack, 1e-3))

def put(at, s, pan=0.0, send=0.0):
    if pan == 0: place(C, at, s)
    else:
        place(L, at, s * np.sqrt((1 - pan) / 2) * 1.414); place(R, at, s * np.sqrt((1 + pan) / 2) * 1.414)
    if send: place(SEND, at, s * send)

def sine(f, n, to=None, dur=None):
    t = np.arange(n) / SR
    fr = f * (to / f) ** np.minimum(t / ((dur or n / SR) * .7), 1) if to else np.full(n, f)
    return np.sin(2 * np.pi * np.cumsum(fr) / SR)

def fm(at, f, dur, gain, ratio=3.5, index=3.0, pan=0, send=.3):
    n = int((dur + .05) * SR); t = np.arange(n) / SR
    idx = index * np.exp(-t / .08)
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * ratio * t))
    put(at, s * env(n, .003, dur) * gain, pan, send)

def saw(f, n, cutoff, detune=7):
    """band-limited saw, three voices detuned +-cents, harmonics above cutoff dropped"""
    t = np.arange(n) / SR; out = np.zeros(n)
    for c in (-detune, 0, detune):
        ff = f * 2 ** (c / 1200); k = 1
        while k * ff < min(cutoff, SR / 2.2):
            out += np.sin(2 * np.pi * k * ff * t + rng.uniform(0, 6.28)) / k * (1 - (k * ff / cutoff) ** 2); k += 1
    return out / 3

def noise_band(n, lo, hi):
    x = rng.standard_normal(n); X = np.fft.rfft(x); fr = np.fft.rfftfreq(n, 1 / SR)
    X[(fr < lo) | (fr > hi)] = 0; y = np.fft.irfft(X, n); return y / (np.max(np.abs(y)) + 1e-9)

def air(at, f0, f1, dur, gain, rise=.01, pan=0, send=0):
    n = int((dur + .05) * SR)
    # a sweep made from short band slices
    segs = 24; out = np.zeros(n); fr = np.geomspace(f0, f1, segs)
    for k in range(segs):
        a, b = k * n // segs, (k + 1) * n // segs + 400
        b = min(b, n); seg = noise_band(b - a, fr[k] * .7, fr[k] * 1.4)
        w = np.hanning(b - a); out[a:b] += seg * w
    put(at, out * env(n, rise, dur) * gain, pan, send)

def kick(at, g=.5):
    n = int(.35 * SR); t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * np.cumsum(46 + 120 * np.exp(-t * 30)) / SR) * np.exp(-t * 7)
    body = np.sin(2 * np.pi * 120 * t) * np.exp(-t * 28) * .5
    click = np.zeros(n); m = int(.004 * SR); click[:m] = noise_band(m, 2000, 5000) * np.linspace(1, 0, m) * .25
    place(BEAT, at, np.tanh((sub + body + click) * 1.4) * g); KICKS.append(at)

def hat(at, g=.05, pan=0):
    n = int(.06 * SR); x = noise_band(n, 7000, 14000) * np.exp(-np.arange(n) / SR * 70) * g
    place(L, at, x * (1 - pan) * .7); place(R, at, x * (1 + pan) * .7)

def clap(at, g=.12):
    n = int(.22 * SR); t = np.arange(n) / SR; x = noise_band(n, 900, 3500)
    e = np.exp(-t * 20); e[: int(.012 * SR)] *= 1.6
    place(BEAT, at, x * e * g); place(SEND, at, x * e * g * .5)

def crash(at, g=.18, dur=1.6):
    n = int(dur * SR); x = noise_band(n, 3000, 15000) * np.exp(-np.arange(n) / SR * 2.6) * g
    place(L, at, x); place(R, at, np.roll(x, 300)); place(SEND, at, x * .3)

def chord(at, notes, dur, gain, cutoff=2000, attack=.02, bus='pad', send=.6):
    n = int((dur + .1) * SR); t = np.arange(n) / SR
    s = sum(saw(f, n, cutoff) for f in notes) / len(notes) ** .5
    s = s * np.minimum(t / attack, 1) * np.exp(-np.maximum(t - dur * .55, 0) / (dur * .3)) * gain
    if bus == 'pad': place(PAD, at, s)
    else: put(at, s)
    if send: place(SEND, at, s * send)

# ---------- cue vocabulary ----------
def do(at, typ, p):
    k = int(p) if isinstance(p, (int, float)) and float(p).is_integer() else 0
    pan = ((k % 5) - 2) * .15
    if typ == 'motif':
        f = MOTIF[k % 4]; fm(at, f, .5, .16, ratio=2, index=2.2, send=.45); fm(at, f / 2, .3, .05, ratio=3.5, index=1.5)
    elif typ == 'resolve':
        fm(at - .12, MOTIF[3], .25, .12, ratio=2, index=2, send=.4); fm(at + .1, 880, 1.6, .18, ratio=2, index=2.4, send=.6)
    elif typ == 'pluck':
        fm(at, NOTES[k % 6] * 2, .3, .11, pan=pan, send=.35)
    elif typ in ('tick', 'logo'):
        fm(at, NOTES[k % 6] * 2, .14, .06, ratio=3.5, index=2.5, pan=pan, send=.25)
    elif typ == 'pass':
        fm(at, NOTES[k % 6] * 2, .2, .08, pan=pan, send=.3); air(at - .12, 400, 2600, .28, .1, rise=.18, pan=pan)
    elif typ == 'pop':
        fm(at, NOTES[(k + 2) % 6] * 4, .09, .05, ratio=1.5, index=1.5, pan=-pan, send=.2)
    elif typ == 'click':
        put(at, noise_band(int(.012 * SR), 2500, 6000) * np.linspace(1, 0, int(.012 * SR)) * .18)
        put(at, sine(190, int(.06 * SR), to=120, dur=.06) * env(int(.06 * SR), .002, .05) * .12)
    elif typ == 'nudge':
        put(at, sine(170, int(.1 * SR), to=120, dur=.1) * env(int(.1 * SR), .003, .09) * .12, pan)
    elif typ == 'scan':
        air(at, 400, 6000, 1.1, .16, rise=.7, send=.3); fm(at, 1760, .9, .03, ratio=1.01, index=.5, send=.4)
    elif typ == 'whoosh':
        air(at - .25, 300, 4000, .5, .2, rise=.35, send=.2)
    elif typ == 'hit':
        g = float(p) if p else 1
        kick(at, .55 * g); crash(at, .08 * g, 1.0)
    elif typ == 'impact':
        kick(at, .65); put(at, sine(40, int(1.2 * SR)) * env(int(1.2 * SR), .005, 1.1) * .45); crash(at, .2, 2.2)
    elif typ == 'riser':
        d = float(p) or .5
        air(at, 300, 6000, d, .22, rise=d * .95, send=.25)
        put(at, sine(45, int(d * SR), to=90, dur=d / .7) * np.linspace(0, 1, int(d * SR)) ** 2 * .25)
    elif typ == 'rise':
        air(at, 280, 3200, .55, .2, rise=.35, send=.3)
    elif typ == 'drop':
        fm(at, 660, .12, .08, ratio=1, index=.5); put(at + .05, sine(70, int(.35 * SR), to=45, dur=.35) * env(int(.35 * SR), .004, .33) * .35)
    elif typ == 'slide':
        put(at, sine(330, int(.5 * SR), to=660, dur=.5) * env(int(.5 * SR), .2, .5) * .04, .2, .3)
    elif typ == 'sort':
        for j in range(4): fm(at + j * S16, NOTES[(j * 2) % 6] * 2, .15, .06, pan=(j - 1.5) * .2, send=.3)
    elif typ == 'chord':
        chord(at, [220, 277.18, 329.63, 440, 554.37], 2.2, .22, cutoff=2400, bus='put')
    elif typ == 'chordS':
        chord(at, [220, 329.63, 440, 554.37], 1.2, .14, cutoff=1800, bus='put')
    elif typ == 'chordEnd':
        chord(at, [110, 220, 277.18, 329.63, 440, 554.37, 659.25], 3.0, .3, cutoff=5000, bus='put', send=.8)

# snap UI sounds in the product section to the 16th grid so they sit with the hats
for at, typ, p in cues:
    if 12.9 < at < 24.6 and typ in ('tick', 'pop', 'pluck', 'click', 'sort'):
        at = 12.9 + round((at - 12.9) / S16) * S16
    do(at, typ, p)

# ---------- the groove and the harmony ----------
def groove(t0, t1, kg, full, four=False):
    t = t0; k = 0
    while t < t1 - 1e-6:
        kick(t, kg)
        hat(t + B / 2, .045, .3)
        if full:
            if k % 2 == 1: clap(t, .1)
            hat(t + B / 4, .02, -.3); hat(t + 3 * B / 4, .02, .3)
        t += B; k += 1

groove(3.0, 8.9, .3, False)                 # tension under the problem
groove(12.9, 24.6, .5, True)                # lift under the product
groove(24.85, 27.35, .3, False)             # build under the value prop
# progression under the product: A  F#m  D  E  A  F#m  (one bar each, 2 s)
PROG = [[220, 277.18, 329.63], [185, 220, 277.18], [146.83, 220, 293.66], [164.81, 246.94, 329.63], [220, 277.18, 329.63], [185, 220, 277.18]]
ROOT = [55, 46.25, 36.71, 41.2, 55, 46.25]
for i, (ch, r) in enumerate(zip(PROG, ROOT)):
    at = 12.9 + i * 2 * B * 2
    chord(at, ch, 2.1, .05, cutoff=1500, attack=.08)
    n = int(2.05 * SR); sub = np.tanh(sine(r * 2, n) * 2.5) * env(n, .05, 2.0) * .16
    place(PAD, at, sub)
# opening bed: the A chord breathing in, a heartbeat pulse once the role lands
chord(0.0, [220, 277.18, 329.63, 440], 3.1, .05, cutoff=1400, attack=.3)
for k in range(4): kick(1.1 + k * B, .18); hat(1.1 + k * B + B / 2, .03, .2)
# soft bed under the problem and the question
chord(3.0, [220, 329.63, 440], 5.8, .035, cutoff=900, attack=.6)
chord(8.95, [146.83, 220, 293.66, 369.99], 2.6, .05, cutoff=1200, attack=.5)
# value-prop build: pad opens up into the riser
n = int(2.6 * SR); t = np.arange(n) / SR
build = sum(saw(f, n, 4000) for f in [220, 277.18, 329.63, 440]) / 2
lp = np.zeros(n); y = 0.0; fc = np.geomspace(500, 4000, n); a = np.exp(-2 * np.pi * fc / SR)
for i in range(n): y = (1 - a[i]) * build[i] + a[i] * y; lp[i] = y
place(PAD, 24.85, lp * np.minimum(t / .4, 1) * .09)
# silences before the two big hits
for s0, s1 in [(12.84, 12.9), (27.45, 27.6)]:
    for buf in (C, L, R, SEND, PAD, BEAT):
        buf[int(s0 * SR):int(s1 * SR)] *= np.linspace(1, 0, int(s1 * SR) - int(s0 * SR)) ** 4

# ---------- sidechain: pad and room duck on every kick ----------
duck = np.ones(N)
for k in KICKS:
    i = int(k * SR); m = min(N - i, int(.5 * SR))
    if m > 0: duck[i:i + m] = np.minimum(duck[i:i + m], 1 - .6 * np.exp(-np.arange(m) / SR / .12))

# ---------- room: two decorrelated impulses, 20 ms pre-delay, send high-passed at 300 Hz ----------
X = np.fft.rfft(SEND); fr = np.fft.rfftfreq(N, 1 / SR); X[fr < 300] *= (fr[fr < 300] / 300) ** 2; SEND = np.fft.irfft(X, N)
Lr = int(SR * 1.8); pre = int(.02 * SR)
def ir():
    x = rng.uniform(-1, 1, Lr) * (1 - np.arange(Lr) / Lr) ** 3.2; return np.concatenate([np.zeros(pre), x])
def conv(x, h):
    m = len(x) + len(h); return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(h, m))[: len(x)]
wl, wr = conv(SEND, ir()), conv(SEND, ir())
sc = np.max(np.abs(SEND)) / (max(np.max(np.abs(wl)), 1e-9)) * 1.1
wl *= sc; wr *= sc

mono = C + BEAT + PAD * duck
outL = mono + L + wl * duck * .45
outR = mono + R + wr * duck * .45
# high-pass the master at 30 Hz
for ch in (outL, outR):
    Y = np.fft.rfft(ch); Y[fr < 30] = 0; ch[:] = np.fft.irfft(Y, N)

# ---------- section levels, then a gentle 2:1 bus compressor ----------
lvl = np.ones(N); tt = np.arange(N) / SR
lvl[(tt >= 3.0) & (tt < 8.95)] = .8
lvl[(tt >= 8.95) & (tt < 11.45)] = .7
lvl[(tt >= 24.85) & (tt < 27.45)] = np.linspace(.85, 1.1, ((tt >= 24.85) & (tt < 27.45)).sum())
outL *= lvl; outR *= lvl
mid = (np.abs(outL) + np.abs(outR)) / 2
w = int(.01 * SR); envl = np.convolve(mid, np.ones(w) / w, 'same')
thr = np.percentile(envl, 80)
gr = np.where(envl > thr, (thr / np.maximum(envl, 1e-9)) ** .5, 1)
gr = np.convolve(gr, np.ones(int(.05 * SR)) / int(.05 * SR), 'same')
outL *= gr; outR *= gr
fade = np.clip((T - tt) / .3, 0, 1); outL *= fade; outR *= fade
pk = max(np.max(np.abs(outL)), np.max(np.abs(outR))) * 1.1
st = np.stack([outL / pk, outR / pk], 1)
with wave.open(sys.argv[2], 'wb') as wv:
    wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR)
    wv.writeframes((st * 32767).astype('<i2').tobytes())
print('wrote', sys.argv[2])
