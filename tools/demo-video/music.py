"""Sound design for the MAYBE demo films, built from the same recipes as the deck's Web Audio sound
(assets/careers.js): soft pentatonic sines with a small made-up room, filtered air, rises and chords.
Plus a light beat so it moves like a launch film. No samples, no voice, no licences.

Usage: python3 -I tools/demo-video/music.py cues.json out.wav [seconds]
cues.json comes from tools/demo-video/cues.mjs: [[time, type, param], ...]"""
import sys, json, wave, numpy as np

SR = 48000
cues = json.load(open(sys.argv[1]))
T = float(sys.argv[3]) if len(sys.argv) > 3 else 30.4
N = int(SR * T)
dry = np.zeros(N); send = np.zeros(N); beat = np.zeros(N)
rng = np.random.default_rng(3)
NOTES = [392, 440, 523.25, 587.33, 659.25, 783.99]

# soft noise like the deck's (air, not hiss)
w = rng.uniform(-1, 1, SR * 3); soft = np.zeros_like(w); acc = 0.0
for i in range(len(w)): acc = acc * .86 + w[i] * .14; soft[i] = acc * 2.4

def place(buf, at, sig):
    i = int(at * SR)
    if i >= N: return
    j = min(N, i + len(sig)); buf[i:j] += sig[: j - i]

def env(n, attack, dur):
    t = np.arange(n) / SR
    a = np.minimum(t / max(attack, 1e-4), 1)
    return a * np.exp(-6.9 * np.maximum(t - attack, 0) / max(dur - attack, 1e-3))

def tone(at, f, dur, gain, to=None, attack=.004, snd=0, typ='sine'):
    n = int((dur + .05) * SR); t = np.arange(n) / SR
    if to: fr = f * (to / f) ** np.minimum(t / (dur * .7), 1)
    else: fr = np.full(n, f)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    s = np.sin(ph) if typ == 'sine' else np.sign(np.sin(ph)) * .3
    s = s * env(n, attack, dur) * gain
    place(dry, at, s)
    if snd: place(send, at, s * snd)

def bandnoise(n, f0, f1, q):
    """crude moving band-pass: two one-pole filters with a sweeping cutoff"""
    x = soft[(np.arange(n) + rng.integers(0, SR)) % len(soft)]
    fc = np.geomspace(f0, f1 if f1 else f0, n)
    a = np.exp(-2 * np.pi * fc / SR)
    lp = np.zeros(n); hp_in = np.zeros(n); y1 = y2 = 0.0
    bw = fc / max(q, .3)
    al = np.exp(-2 * np.pi * np.maximum(fc - bw / 2, 20) / SR)
    for i in range(n):
        y1 = (1 - a[i]) * x[i] + a[i] * y1           # low-pass at fc
        y2 = (1 - al[i]) * x[i] + al[i] * y2         # low-pass below the band
        lp[i] = y1 - y2 * .9
    return lp

def air(at, freq, dur, gain, to=None, q=1, rise=.004, snd=0):
    n = int((dur + .05) * SR)
    s = bandnoise(n, freq, to, q)
    s = s / (np.max(np.abs(s)) + 1e-9) * env(n, rise, dur) * gain
    place(dry, at, s)
    if snd: place(send, at, s * snd)

def kick(at, g=.5):
    n = int(.4 * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * np.cumsum(48 + 110 * np.exp(-t * 32)) / SR) * np.exp(-t * 8) * g
    place(beat, at, s)

def hat(at, g=.06):
    n = int(.07 * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n); x = np.diff(np.concatenate([[0], x]))
    place(beat, at, x * np.exp(-t * 60) * g)

def clap(at, g=.12):
    n = int(.2 * SR); t = np.arange(n) / SR
    x = bandnoise(n, 1500, None, 1.2); x /= np.max(np.abs(x)) + 1e-9
    e = np.exp(-t * 22) * (1 + .6 * (np.sin(2 * np.pi * 90 * t) > 0) * (t < .03))
    place(beat, at, x * e * g); place(send, at, x * e * g * .4)

# ---- the cue vocabulary (same names and recipes as the deck) ----
def do(at, typ, p):
    p = int(p) if isinstance(p, (int, float)) else 0
    if typ == 'pluck':
        f = NOTES[p % 6] * 2
        tone(at, f, .25, .14, snd=.35); tone(at, f * 2.01, .06, .03)
        air(at, 2800, .04, .12, q=1.3)
    elif typ == 'tick' or typ == 'logo':
        f = 440 * 2 ** ([0, 2, 4, 7, 9, 12, 14, 16, 19, 21][p % 10] / 12)
        tone(at, f, .18, .1, snd=.35); tone(at, f * 2.01, .05, .024)
        air(at, 3000, .03, .1, q=1.4)
    elif typ == 'pass':
        f = NOTES[p % 6] * 2
        tone(at, f, .2, .1, snd=.3); air(at, 2800, .05, .14, q=1.3)
        air(at - .1, 300, .3, .12, to=1800, q=.8, rise=.2)
    elif typ == 'pop':
        f = NOTES[(p + 2) % 6] * 4
        tone(at, f, .09, .07, snd=.25); tone(at, f / 2, .12, .05, to=f / 2 * 1.5)
    elif typ == 'click':
        tone(at, 1900, .03, .12); air(at, 4000, .02, .16, q=2); tone(at, 180, .06, .12, to=120)
    elif typ == 'nudge':
        tone(at, 170, .1, .12, to=120); air(at, 900, .08, .06, q=1)
    elif typ == 'scan':
        air(at, 400, 1.2, .2, to=5000, q=1.5, rise=.6, snd=.3)
        tone(at, 880, 1.1, .03, to=1760, attack=.5, snd=.4)
    elif typ == 'whoosh':
        air(at - .25, 260, .55, .26, to=3600, q=.8, rise=.4, snd=.3)
    elif typ == 'hit':
        tone(at, 55, .7, .5, to=40, attack=.005); air(at, 1200, .25, .18, to=300, q=.7, snd=.4)
    elif typ == 'rise':
        air(at, 280, .55, .26, to=3200, q=.8, rise=.35, snd=.3)
        tone(at, 58, .6, .3, to=96, attack=.1)
    elif typ == 'drop':
        tone(at, 660, .12, .1, to=330); tone(at + .05, 70, .35, .4, to=45)
    elif typ == 'slide':
        tone(at, 300, .6, .05, to=600, attack=.2, snd=.3)
    elif typ == 'sort':
        for k in range(4): tone(at + k * .07, NOTES[(k * 2) % 6] * 2, .15, .07, snd=.3)
        air(at, 600, .5, .12, to=2000, q=.8, rise=.25)
    elif typ in ('chord', 'chordS', 'chordEnd'):
        notes = [[220, 0], [329.63, .05], [440, .1], [554.37, .16], [659.25, .23], [987.77, .32]]
        g = {'chord': 1, 'chordS': .6, 'chordEnd': 1.2}[typ]; L = {'chord': 2.3, 'chordS': 1.4, 'chordEnd': 3.2}[typ]
        for k, (f, d) in enumerate(notes):
            tone(at + d, f, L - d * 2, (.1 - .009 * k) * g, attack=.014, snd=.75)
            tone(at + d, f * 2.003, .8, .02 * g, attack=.006, snd=.6)
    elif typ == 'close':
        air(at, 2600, .5, .16, to=320, q=.8, rise=.12)
        tone(at + .18, 659.25, .9, .07, attack=.01, snd=.6); tone(at + .28, 440, 1.1, .08, attack=.01, snd=.6)
    elif typ == 'hush':
        pass

for at, typ, p in cues: do(at, typ, p)

# ---- the beat: tension under the problem, lift under the product, silence for the question ----
bpm = 120; b = 60 / bpm
def groove(t0, t1, full):
    t = t0
    k = 0
    while t < t1:
        kick(t, .42 if full else .3)
        hat(t + b / 2, .05)
        if full and k % 2 == 1: clap(t, .1)
        if full: hat(t + b / 4, .025); hat(t + 3 * b / 4, .025)
        t += b; k += 1
groove(3.1, 8.8, False)
groove(13.0, 24.2, True)
# sub pad under the product section
for at, f in [(13.0, 55), (16.0, 49), (19.0, 61.7), (22.0, 55)]:
    tone(at, f, 3.2, .12, attack=.4, snd=.2); tone(at, f * 2, 3.2, .05, attack=.6, snd=.4)

# soft pad and a pulse of hats under the 'at scale' wall
for f in [220, 277.18, 329.63, 440]:
    tone(24.3, f, 3.2, .035, attack=.8, snd=.6)
for k in range(12): hat(24.4 + k * .25, .03)

# ---- the room: noise impulse that dies away, like the deck ----
L = int(SR * 1.9)
ir = rng.uniform(-1, 1, L) * (1 - np.arange(L) / L) ** 3.4
wet = np.fft.irfft(np.fft.rfft(send, N + L) * np.fft.rfft(ir, N + L))[:N]
wet = wet / (np.max(np.abs(wet)) + 1e-9) * np.max(np.abs(send)) * 1.2
mix = dry + wet * .5 + beat
# gentle compressor-ish: soft clip
mix = np.tanh(mix * 1.6) / 1.6
mix *= np.clip((T - np.arange(N) / SR) / .6, 0, 1)
mix /= np.max(np.abs(mix)) * 1.12
st = np.stack([mix, np.roll(mix, 180) * .97 + mix * .03], 1)
with wave.open(sys.argv[2], 'wb') as wv:
    wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR)
    wv.writeframes((st * 32767).astype('<i2').tobytes())
print('wrote', sys.argv[2])
