/* MAYBE careers slide runtime (canvas board Slide05b2, right after the live call).
 *
 * The cards are planes in a stack, seen by an orthographic camera, so every card is a parallelogram on screen and
 * nothing here needs a 3D library: for each card this file works out its corner and two edges in stage pixels and
 * draws a bent strip with WebGL2 (or a flat one on a 2D canvas if WebGL2 is missing).
 *
 *   wheel / trackpad / drag   move with inertia and always stop on a card
 *   ↑ ↓                       one card
 *   Enter / click             open the active card (clicking a stacked card brings it to the front)
 *   Esc                       back from the editor
 *   M                         sound on or off
 *   ← →                       untouched: the deck changes slide
 *
 * The slide fills the window whatever its shape: the deck still scales a 1920x1080 stage, and this slide takes the
 * window measured in those same stage pixels, so one side is exactly 1920 or 1080 and the other is longer.
 *
 * All copy and images are in the board (src/Slide05b2.dc.html, careers()). A career with `opens` loads that page in an
 * iframe as soon as the slide opens. Opening it fires career:open on document with detail { id }, plays the company pick
 * on the curtain and calls MAYBE_EDITOR.start({ skipOpening: true }) in the iframe if it has one; going back fires
 * career:close. design:finish on document (ours or the iframe's) moves to the next slide. See docs/careers-reference.md.
 */
(function () {
  'use strict';
  const root = document.querySelector('[data-careers]');
  if (!root) return;
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));

  // ---------- content, read from the board ----------
  const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
  const careers = $$('[data-career]').map((el) => ({
    el, id: el.dataset.career, ground: el.dataset.ground, groundRgb: rgb(el.dataset.ground), name: el.dataset.name, state: el.dataset.state, cta: el.dataset.cta,
    does: el.dataset.does, who: el.dataset.who, keeps: el.dataset.keeps, opens: el.dataset.opens, image: el.dataset.image,
    cover: null, tex: null,
  }));
  const N = careers.length;
  if (!N) return;
  const RING = N * 2; // the ring repeats the careers so the stacks stay full

  const ui = {
    canvas: $('[data-cr-canvas]'), num: $('[data-cr-num]'), does: $('[data-cr-does]'), who: $('[data-cr-who]'), keeps: $('[data-cr-keeps]'), facts: $('[data-cr-facts]'),
    tryBtn: $('[data-cr-try]'), tryLabel: $('[data-cr-try-label]'), soundBtn: $('[data-cr-sound]'), soundLabel: $('[data-cr-sound-label]'), soundBars: $('.cr-sound__bars'),
    title: $$('[data-cr-title] .cr-title__line > span'), steps: $('[data-cr-steps]'), stepItems: $$('[data-cr-step]'),
    curtain: $('[data-cr-curtain]'), curtainIn: $('[data-cr-curtain-in]'), curtainWords: $('[data-cr-curtain-words]'), curtainTitle: $('[data-cr-curtain-title]'), curtainSub: $('[data-cr-curtain-sub]'),
    pick: $('[data-cr-pick]'), pickRow: $('[data-cr-pick-row]'), pickLogos: $$('[data-cr-pick-logo]'),
    wall: $('[data-cr-wall]'), peep: $('[data-cr-wall-peep]'), word: $('[data-cr-wall-word]'), editor: $('[data-cr-editor]'), enter: $$('[data-cr-enter]'),
  };
  let S_W = 1920, S_H = 1080; // the window in stage pixels

  // ---------- the scene, in stage pixels ----------
  const CARD_W = 540, CARD_H = 380, CARD_R = 16, INK = 2.6; // INK: the card's outline, like the peeps' ink
  const GROW = .4;               // the active card comes forward: it has to lead, even next to art this loud
  const UNIT = 120;               // one step in the stack
  const FOCUS_AT = { x: 935, y: 530 }, LINE_AT = { x: 856, y: 595 }; // the active card, and where the stack line passes near it
  const GAP_ABOVE = 4.7, GAP_BELOW = 5.5; // empty steps on each side of the active card: close enough to read the names

  function layout() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    S_W = Math.ceil(window.innerWidth / s) + 2; S_H = Math.ceil(window.innerHeight / s) + 2; // a pixel over on each side, so no edge shows through
    root.style.setProperty('--cr-w', S_W + 'px');
    root.style.setProperty('--cr-h', S_H + 'px');
    root.style.setProperty('--cr-k', String(clamp(S_W / 1920, 1, 1.12)));
    FOCUS_AT.x = S_W * .484; FOCUS_AT.y = S_H * .49;
    LINE_AT.x = FOCUS_AT.x - 79; LINE_AT.y = FOCUS_AT.y + 65;
  }

  // A stacked card leans back; the active one turns almost flat to the viewer. x, y are its edges on screen.
  const frame = (xx, xy, yx, yy) => {
    const xz = Math.sqrt(Math.max(0, 1 - xx * xx - xy * xy));
    let yz = -(xx * yx + xy * yy) / (xz || 1);
    const l = Math.hypot(yx, yy, yz); yx /= l; yy /= l; yz /= l;
    return { x: [xx, xy, xz], y: [yx, yy, yz], n: [xy * yz - xz * yy, xz * yx - xx * yz, xx * yy - xy * yx] };
  };
  const FRAME_STACK = frame(.9428, .1506, .0766, .7679);
  const FRAME_FOCUS = frame(.9987, .0171, -.0251, .9776);
  // the turn between both, as axis and angle
  const TURN = (() => {
    const a = FRAME_STACK, b = FRAME_FOCUS;
    const mul = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    // R = b * transpose(a), written out by rows of a
    const R = [0, 1, 2].map((r) => [0, 1, 2].map((c) => b.x[r] * a.x[c] + b.y[r] * a.y[c] + b.n[r] * a.n[c]));
    const tr = R[0][0] + R[1][1] + R[2][2];
    const angle = Math.acos(Math.min(1, Math.max(-1, (tr - 1) / 2)));
    let ax = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
    const l = Math.hypot(ax[0], ax[1], ax[2]) || 1; ax = ax.map((v) => v / l);
    return { ax, angle, mul };
  })();
  const turned = (v, t) => { // Rodrigues
    const a = TURN.angle * t, c = Math.cos(a), s = Math.sin(a), k = TURN.ax;
    const d = TURN.mul(k, v) * (1 - c);
    return [
      v[0] * c + (k[1] * v[2] - k[2] * v[1]) * s + k[0] * d,
      v[1] * c + (k[2] * v[0] - k[0] * v[2]) * s + k[1] * d,
      v[2] * c + (k[0] * v[1] - k[1] * v[0]) * s + k[2] * d,
    ];
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mod = (v, m) => ((v % m) + m) % m;
  const wrap = (v, m) => mod(v + m / 2, m) - m / 2;
  const near = (cur, to, dt, tau) => cur + (to - cur) * (1 - Math.exp(-dt / tau));

  // ---------- state ----------
  const TAU_IN = .085, TAU_OUT = .3; // two smoothing stages: quick to start, long to stop, no bounce
  const BEND_GAIN = .3, BEND_MAX = 1.7;
  let target = 0, mid = 0, x = 0, velocity = 0, listPos = 0;
  let active = false, raf = 0, last = 0, index = -1;
  let view = 'cards', busy = false, intro = false, introAnims = [], introTimer = 0, introHold = false, textLock = false, tickAt = 0;
  let hoverCard = -1, lift = new Float32Array(RING), zoom = 0, shake = 0;
  let cardsNow = [];
  let wheelTimer = 0, wheelDir = 0, wheelLast = 0, session = 0, stepTimer = 0;

  // ---------- sound: everything is made here with Web Audio, there are no files ----------
  const sound = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    const NOTES = [392, 440, 523.25, 587.33, 659.25, 783.99]; // a pentatonic scale: each career has its own soft note
    let ctx = null, master = null, roomIn = null, windGain = null, windFilter = null, meter = null, data = null, noise = null;
    let on = true, inSlide = false, lastPass = 0, meterRaf = 0, peak = 0, suspendTimer = 0;

    function build() {
      if (ctx || !AC) return !!ctx;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = .004; comp.release.value = .18;
      meter = ctx.createAnalyser(); meter.fftSize = 1024; data = new Float32Array(meter.fftSize);
      master.connect(comp); comp.connect(ctx.destination); comp.connect(meter);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      let soft = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; soft = soft * .86 + w * .14; d[i] = soft * 2.4; } // softer than white noise: air, not hiss
      // a small made-up room: noise that dies away
      const room = ctx.createConvolver(), len = Math.round(ctx.sampleRate * 1.9), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const t = ir.getChannelData(c); for (let i = 0; i < len; i++) t[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4); }
      room.buffer = ir;
      roomIn = ctx.createGain(); roomIn.gain.value = .5;
      roomIn.connect(room); room.connect(master);
      // the wind that follows the speed of the cards
      const w = ctx.createBufferSource(); w.buffer = noise; w.loop = true;
      windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 260; windFilter.Q.value = .7;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      w.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);
      w.start();
      return true;
    }
    function tone(freq, at, o) {
      const osc = ctx.createOscillator(), g = ctx.createGain(), dur = o.dur, attack = o.attack || .004;
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, at);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + dur * .7);
      g.gain.setValueAtTime(.0001, at);
      g.gain.exponentialRampToValueAtTime(o.gain, at + attack);
      g.gain.exponentialRampToValueAtTime(.0001, at + dur);
      osc.connect(g); g.connect(master);
      if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; g.connect(s); s.connect(roomIn); }
      osc.start(at); osc.stop(at + dur + .02);
    }
    function air(at, o) {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), dur = o.dur;
      src.buffer = noise; f.type = 'bandpass'; f.Q.value = o.q || 1;
      f.frequency.setValueAtTime(o.freq, at);
      if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, at + dur);
      g.gain.setValueAtTime(.0001, at);
      g.gain.exponentialRampToValueAtTime(o.gain, at + (o.rise || .004));
      g.gain.exponentialRampToValueAtTime(.0001, at + dur);
      src.connect(f); f.connect(g); g.connect(master);
      if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; g.connect(s); s.connect(roomIn); }
      src.start(at, Math.random() * 1.5); src.stop(at + dur + .02);
    }
    const ready = () => ctx && ctx.state === 'running' && on && inSlide;
    function meterLoop() {
      meterRaf = 0;
      if (!ctx || !inSlide) return;
      meter.getFloatTimeDomainData(data);
      let top = 0;
      for (let i = 0; i < data.length; i += 4) top = Math.max(top, Math.abs(data[i]));
      peak = Math.max(peak, top);
      ui.soundBars.style.setProperty('--lvl', on ? Math.min(1, top * 3.2).toFixed(3) : '0');
      meterRaf = requestAnimationFrame(meterLoop);
    }
    function raise() {
      clearTimeout(suspendTimer);
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, .05);
      if (!meterRaf) meterRaf = requestAnimationFrame(meterLoop);
    }
    return {
      // browsers only let sound start after a key or a click
      unlock() { if (inSlide && build()) raise(); },
      enter() { inSlide = true; if (ctx || (navigator.userActivation && navigator.userActivation.hasBeenActive)) this.unlock(); },
      leave() {
        inSlide = false;
        if (!ctx) return;
        const t = ctx.currentTime;
        windGain.gain.cancelScheduledValues(t); windGain.gain.setValueAtTime(0, t);
        master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(0, t, .03);
        ui.soundBars.style.setProperty('--lvl', '0');
        clearTimeout(suspendTimer);
        suspendTimer = setTimeout(() => { if (!inSlide) ctx.suspend().catch(() => {}); }, 220);
      },
      get on() { return on; },
      toggle() {
        on = !on;
        ui.soundBtn.setAttribute('aria-pressed', String(on));
        ui.soundLabel.textContent = on ? 'Sound on' : 'Sound off';
        if (!ctx) return;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, .03);
        if (on) this.pass(3, 0);
      },
      // a soft touch for each card that goes by; many at once stay quiet
      pass(i, speed) {
        if (!ready()) return;
        const t = ctx.currentTime;
        if (t - lastPass < .03) return;
        lastPass = t;
        const soft = 1 - clamp(speed / 10, 0, .62);
        tone(NOTES[i % NOTES.length] * 2, t, { dur: .2, gain: .1 * soft, send: .3 });
        tone(NOTES[i % NOTES.length] * 4.01, t, { dur: .055, gain: .026 * soft });
        air(t, { dur: .04, gain: .2 * soft, freq: 2800, q: 1.3 });
      },
      // a breath that follows the speed
      speed(v) {
        if (!ctx) return;
        const a = ready() ? clamp(Math.abs(v) / 7, 0, 1) : 0, t = ctx.currentTime;
        windGain.gain.setTargetAtTime(Math.pow(a, 1.4) * .26, t, .06);
        windFilter.frequency.setTargetAtTime(240 + a * a * 2700, t, .08);
      },
      // air that rises with the curtain
      rise() {
        if (!ready()) return;
        const t = ctx.currentTime;
        air(t, { dur: .5, gain: .22, freq: 280, to: 3200, q: .8, rise: .32, send: .3 });
        tone(58, t, { dur: .55, gain: .28, to: 96, attack: .1 });
      },
      // a soft touch for each logo the highlight reaches, a little higher each time
      logo(k) {
        if (!ready()) return;
        const t = ctx.currentTime, f = 440 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19, 21][k % 10] / 12);
        tone(f, t, { dur: .18, gain: .1, send: .35 });
        tone(f * 2.01, t, { dur: .05, gain: .024 });
        air(t, { dur: .03, gain: .12, freq: 3000, q: 1.4 });
      },
      // the chord when it stops
      chord() {
        if (!ready()) return;
        const t = ctx.currentTime;
        [[220, 0], [329.63, .05], [440, .1], [554.37, .16], [659.25, .23], [987.77, .32]].forEach(([f, d], k) => {
          tone(f, t + d, { dur: 2.3 - d * 2, gain: .1 - .009 * k, send: .75, attack: .014 });
          tone(f * 2.003, t + d, { dur: .8, gain: .02, send: .6, attack: .006 });
        });
      },
      close() {
        if (!ready()) return;
        const t = ctx.currentTime;
        air(t, { dur: .5, gain: .16, freq: 2600, to: 320, q: .8, rise: .12 });
        tone(659.25, t + .18, { dur: .9, gain: .07, send: .6, attack: .01 });
        tone(440, t + .28, { dur: 1.1, gain: .08, send: .6, attack: .01 });
      },
      // the discreet "not this one": two muted knocks
      nudge() {
        if (!ready()) return;
        const t = ctx.currentTime;
        tone(170, t, { dur: .1, gain: .2, to: 120 });
        tone(150, t + .1, { dur: .11, gain: .15, to: 110 });
      },
      info() { const v = peak; peak = 0; return { state: ctx ? ctx.state : 'none', on, peak: v, gain: master ? master.gain.value : 0 }; },
    };
  })();

  // ---------- drawing ----------
  const STRIP = 28;
  const COVER_BAND = .205; // the top of a cover, where the name is
  const TEX_W = 1600, TEX_H = Math.round(TEX_W * CARD_H / CARD_W);
  const gl = ui.canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  const flat = gl ? null : ui.canvas.getContext('2d');
  let prog = null, U = {}, vao = null, renderScale = 1;

  function setupGL() {
    const vs = `#version 300 es
      in vec2 aUv;
      uniform vec2 uO, uX, uY, uB, uRes, uSize;
      uniform float uPad;
      out vec2 vP;
      void main() {
        vec2 e = vec2(uPad / length(uX), uPad / length(uY));
        vec2 q = mix(-e, 1.0 + e, aUv);
        float t = 1.0 - q.y;                         // 1 at the top edge
        vec2 p = uO + uX * q.x + uY * q.y + uB * (t * (2.0 - t));
        vP = q * uSize;
        vec2 c = p / uRes * 2.0 - 1.0;
        gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
      }`;
    const fs = `#version 300 es
      precision highp float;
      in vec2 vP;
      uniform vec2 uSize;
      uniform float uR, uZoom, uFade, uInk, uFlat, uBand;
      uniform vec3 uGround;
      uniform float uHasTex;
      uniform sampler2D uT;
      out vec4 o;
      float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main() {
        float d = box(vP - uSize * 0.5, uSize * 0.5, uR);
        float aa = max(fwidth(d), 0.001);
        float a = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, d);
        if (a <= 0.0) discard;
        vec2 uv = 0.5 + (vP / uSize - 0.5) * uZoom;
        vec3 c = uHasTex > 0.5 ? texture(uT, uv).rgb : uGround;
        c = mix(c, uGround, uFlat * step(uBand, vP.y / uSize.y)); // in the stacks a card is a sheet of colour: no art to pile up, no text cut in half
        float line = 1.0 - smoothstep(uInk - aa, uInk + aa, -d); // the ink outline keeps the card's edge on any ground, violet on violet too
        c = mix(c, vec3(0.035, 0.035, 0.043), line);
        o = vec4(c * a, a) * uFade;
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    for (const n of ['uO', 'uX', 'uY', 'uB', 'uRes', 'uSize', 'uR', 'uZoom', 'uGround', 'uHasTex', 'uT', 'uPad', 'uFade', 'uInk', 'uFlat', 'uBand']) U[n] = gl.getUniformLocation(prog, n);
    const verts = [];
    for (let i = 0; i <= STRIP; i++) { const v = i / STRIP; verts.push(0, v, 1, v); }
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aUv');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(U.uT, 0);
    gl.clearColor(0, 0, 0, 0);
    for (const c of careers) if (c.cover) uploadCover(c);
  }

  function uploadTexture(tex, source, premultiply) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }
  function uploadCover(c) {
    if (!gl) return;
    if (!c.tex) c.tex = gl.createTexture();
    uploadTexture(c.tex, c.cover, false);
  }

  // The cover on a CPU canvas, so the upload to the GPU never comes back black, cropped to the card if it had to be.
  function composeCover(c, img) {
    const cv = document.createElement('canvas');
    cv.width = TEX_W; cv.height = TEX_H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const ia = img.naturalWidth / img.naturalHeight, ta = TEX_W / TEX_H;
    let sw = img.naturalWidth, sh = img.naturalHeight;
    if (ia > ta) sw = sh * ta; else sh = sw / ta;
    g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, TEX_W, TEX_H);
    c.cover = cv;
    if (gl && prog) uploadCover(c);
  }

  function preload() {
    careers.forEach((c) => {
      const img = new Image();
      img.onload = () => { (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => { composeCover(c, img); wake(); drawOnce(); }); };
      img.src = c.image;
    });
  }

  function sizeCanvas() {
    const rect = root.getBoundingClientRect();
    const k = clamp((rect.width / S_W) * (window.devicePixelRatio || 1), 1, 1.5); // sharper than this costs frames
    const w = Math.round(S_W * k), h = Math.round(S_H * k);
    renderScale = k;
    if (ui.canvas.width === w && ui.canvas.height === h) return;
    ui.canvas.width = w; ui.canvas.height = h;
  }

  function computeCards() {
    const list = [];
    const bend = clamp(velocity * BEND_GAIN, -BEND_MAX, BEND_MAX) * UNIT;
    for (let i = 0; i < RING; i++) {
      const d = wrap(i - x, RING), ad = Math.abs(d), sg = d >= 0 ? 1 : -1;
      const s = -(d + sg * smooth(.08, .92, ad) * (d >= 0 ? GAP_BELOW : GAP_ABOVE)); // < 0 goes down and left, > 0 up and right
      const fade = (1 - smooth(7.75, 8.65, s)) * (1 - smooth(7.8, 8.4, -s)); // three stay above and two below; at rest none is half gone
      if (fade <= 0) continue;
      const f = smooth(0, 1, 1 - smooth(0, .82, ad));        // 1 only when it faces the viewer
      const ex = turned(FRAME_STACK.x, f), ey = turned(FRAME_STACK.y, f), en = turned(FRAME_STACK.n, f);
      const ax = -FRAME_STACK.n[0] * UNIT, ay = -FRAME_STACK.n[1] * UNIT;
      // the line bends a little: the top keeps clear of the list and the bottom keeps clear of the big number
      let cx = LINE_AT.x + ax * s + (s > 0 ? -24 * smooth(0, 3, s) : 112 * smooth(0, 3, -s)), cy = LINE_AT.y + ay * s;
      cx += (FOCUS_AT.x - cx) * f; cy += (FOCUS_AT.y - cy) * f;
      cy -= lift[i] * 26 * (1 - f);
      if (f > .5) cx += Math.sin(shake * 26) * shake * 10;
      const grow = 1 + GROW * f;
      const X = [ex[0] * CARD_W * grow, ex[1] * CARD_W * grow], Y = [ey[0] * CARD_H * grow, ey[1] * CARD_H * grow];
      const o = [cx - X[0] / 2 - Y[0] / 2, cy - X[1] / 2 - Y[1] / 2];
      const b = [-en[0] * bend, -en[1] * bend];
      const pad = 140;
      const xs = [o[0], o[0] + X[0], o[0] + Y[0], o[0] + X[0] + Y[0]], ys = [o[1], o[1] + X[1], o[1] + Y[1], o[1] + X[1] + Y[1]];
      if (Math.max(...xs) < -pad || Math.min(...xs) > S_W + pad || Math.max(...ys) < -pad || Math.min(...ys) > S_H + pad) continue;
      // above, only the nearest card keeps its art; below, the cards keep just the band with their name
      const flatness = s > 0 ? smooth(6, 6.5, s) : smooth(3.6, 6.2, -s);
      list.push({ i, s, f, o, X, Y, b, fade, flat: flatness, band: s > 0 ? 0 : COVER_BAND, career: careers[i % N] });
    }
    list.sort((a, c) => c.s - a.s); // far ones first
    cardsNow = list;
  }

  function draw() {
    if (!active && !gl) return;
    sizeCanvas();
    computeCards();
    if (gl) {
      gl.viewport(0, 0, ui.canvas.width, ui.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog); gl.bindVertexArray(vao);
      gl.uniform2f(U.uRes, S_W, S_H);
      gl.uniform2f(U.uSize, CARD_W, CARD_H);
      gl.uniform1f(U.uR, CARD_R);
      gl.uniform1f(U.uInk, INK);
      gl.uniform1f(U.uPad, 3);
      gl.activeTexture(gl.TEXTURE0);
      for (const c of cardsNow) {
        gl.uniform2f(U.uO, c.o[0], c.o[1]);
        gl.uniform2f(U.uX, c.X[0], c.X[1]);
        gl.uniform2f(U.uY, c.Y[0], c.Y[1]);
        gl.uniform2f(U.uB, c.b[0], c.b[1]);
        gl.uniform1f(U.uZoom, 1 - .05 * zoom * smooth(.7, 1, c.f));
        gl.uniform1f(U.uHasTex, c.career.tex ? 1 : 0);
        gl.uniform1f(U.uFade, c.fade);
        gl.uniform1f(U.uFlat, c.flat);
        gl.uniform1f(U.uBand, c.band);
        gl.uniform3f(U.uGround, c.career.groundRgb[0], c.career.groundRgb[1], c.career.groundRgb[2]);
        if (c.career.tex) gl.bindTexture(gl.TEXTURE_2D, c.career.tex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, (STRIP + 1) * 2);
      }
    } else if (flat) {
      const k = ui.canvas.width / S_W;
      flat.setTransform(1, 0, 0, 1, 0, 0);
      flat.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
      for (const c of cardsNow) {
        flat.setTransform(c.X[0] / CARD_W * k, c.X[1] / CARD_W * k, c.Y[0] / CARD_H * k, c.Y[1] / CARD_H * k, c.o[0] * k, c.o[1] * k);
        flat.save();
        flat.beginPath(); flat.roundRect(0, 0, CARD_W, CARD_H, CARD_R); flat.clip();
        flat.globalAlpha = c.fade;
        if (c.career.cover) flat.drawImage(c.career.cover, 0, 0, CARD_W, CARD_H);
        else { flat.fillStyle = c.career.ground; flat.fillRect(0, 0, CARD_W, CARD_H); }
        if (c.flat > 0) { flat.globalAlpha = c.fade * c.flat; flat.fillStyle = c.career.ground; flat.fillRect(0, c.band * CARD_H, CARD_W, CARD_H * (1 - c.band)); flat.globalAlpha = c.fade; }
        flat.lineWidth = INK * 2; flat.strokeStyle = '#09090B'; flat.stroke();
        flat.restore();
      }
    }
  }
  function drawOnce() { if (!raf) draw(); }

  // ---------- the loop only runs while something moves ----------
  function wake() { if (active && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(now) {
    raf = 0;
    if (!active) return;
    const dt = clamp((now - last) / 1000, .001, .05); last = now;
    let moving = false;
    if (view === 'cards') {
      if (REDUCED) { x = mid = target; velocity = 0; }
      else if (!introHold) {
        mid = near(mid, target, dt, TAU_IN);
        const before = x;
        x = near(x, mid, dt, TAU_OUT);
        velocity = near(velocity, (x - before) / dt, dt, .05);
      }
      if (Math.abs(target - x) < .002 && Math.abs(target - mid) < .002) { x = mid = target; velocity = 0; }
      if (x !== target || velocity !== 0) moving = true;

      const near0 = Math.round(x);
      if (near0 !== tickAt) { tickAt = near0; if (!introHold) sound.pass(mod(near0, N), Math.abs(velocity)); }
      sound.speed(introHold ? 0 : velocity);
      // While the cards fly in after the intro, the words already show where they will land. Any move during that time
      // moves the landing with it, in either direction, so words and cards can never disagree.
      if (textLock && Math.abs(target - x) < .5) textLock = false;
      const goal = textLock ? Math.round(target) : near0;
      if (mod(goal, N) !== index) setActive(mod(goal, N), true);
      const listGoal = textLock ? Math.round(target) : near0;
      if (Math.abs(listGoal - listPos) > .0008) { listPos = REDUCED ? listGoal : near(listPos, listGoal, dt, .075); moving = true; } else listPos = listGoal;
      placeList();

      for (let i = 0; i < RING; i++) {
        const to = hoverCard === i ? 1 : 0;
        if (Math.abs(lift[i] - to) > .002) { lift[i] = near(lift[i], to, dt, .11); moving = true; } else lift[i] = to;
      }
      const zTo = hoverCard >= 0 && isFront(hoverCard) ? 1 : 0;
      if (Math.abs(zoom - zTo) > .002) { zoom = near(zoom, zTo, dt, .22); moving = true; } else zoom = zTo;
      if (shake > .002) { shake = near(shake, 0, dt, .16); moving = true; } else shake = 0;
      draw();
    }
    if (moving || intro) raf = requestAnimationFrame(tick); else sound.speed(0);
  }

  // The active name is big and has its facts under it; the others wait in a small size above and below.
  const LIST_SMALL = .5, SLOT = 44, FACTS_H = 238, NAME_H = 42;
  const listY = () => S_H * .36;
  function placeList() {
    const y0 = listY();
    careers.forEach((c, i) => {
      const d = mod(i - listPos + 2.5, N) - 2.5; // two above and three below at rest; a name only fades while it wraps around
      const big = 1 - clamp(Math.abs(d), 0, 1);
      const above = Math.min(d, 0), below = Math.max(d, 0);
      const y = y0 + above * SLOT - clamp(-d, 0, 1) * 12 + below * SLOT + clamp(d, 0, 1) * (FACTS_H + NAME_H - 12);
      const a = clamp((d + 2.5) / .5, 0, 1) * clamp((3.5 - d) / .5, 0, 1);
      c.el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${(LIST_SMALL + (1 - LIST_SMALL) * big).toFixed(4)})`;
      c.el.style.opacity = a.toFixed(3);
      c.el.style.pointerEvents = a > .5 ? '' : 'none';
    });
    const still = 1 - smooth(.02, .22, Math.abs(listPos - Math.round(listPos)));
    ui.facts.style.transform = `translate3d(0, ${(y0 + NAME_H).toFixed(1)}px, 0)`;
    ui.facts.style.opacity = still.toFixed(3);
  }
  const isFront = (ringIndex) => { const d = wrap(ringIndex - x, RING); return Math.abs(d) < .5; };

  // ---------- active career: text swaps with a pulse of blur, never a plain fade ----------
  const pulse = (el, peak, delay) => {
    if (REDUCED || !el.animate) return;
    el.animate([{ filter: 'blur(0px)' }, { filter: `blur(${peak}px)`, offset: .2 }, { filter: 'blur(0px)' }], { duration: 640, delay: delay || 0, easing: 'cubic-bezier(.22,.61,.36,1)' });
  };
  const rise = (el, delay) => {
    if (REDUCED || !el.animate) return;
    el.animate([{ opacity: 0, transform: 'translateY(16px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 460, delay, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'backwards' });
  };
  function setActive(i, animate) {
    index = i;
    const c = careers[i];
    ui.num.textContent = String(i + 1).padStart(2, '0');
    ui.does.textContent = c.does;
    ui.who.textContent = c.who;
    ui.keeps.textContent = c.keeps;
    ui.tryLabel.textContent = c.cta;
    careers.forEach((o, k) => { o.el.classList.toggle('is-active', k === i); if (k === i) o.el.setAttribute('aria-current', 'true'); else o.el.removeAttribute('aria-current'); });
    root.classList.toggle('can-open', c.state === 'open');
    if (animate) {
      pulse(ui.num, 12);
      pulse(ui.tryLabel, 4, 40);
      rise(ui.does, 40); rise(ui.who, 110); rise(ui.keeps, 180);
    }
  }

  // ---------- the three steps: a white block walks through them, and stays on the one the presenter is at ----------
  function setStep(i) {
    ui.steps.style.setProperty('--step', String(i));
    ui.facts.dataset.step = String(i);
    ui.stepItems.forEach((el, k) => el.classList.toggle('is-on', k === i));
  }
  let step = 0;
  function runSteps(from) {
    clearInterval(stepTimer);
    step = from; setStep(step);
    if (REDUCED) return;
    stepTimer = setInterval(() => { step = (step + 1) % 3; setStep(step); }, 2200);
  }
  function holdSteps(at) { clearInterval(stepTimer); step = at; setStep(at); }

  // ---------- moving ----------
  function go(to) {
    target = to;
    moved();
    wake();
  }
  // browsing is step one: the walk starts again from there once the cards are still
  function moved() { if (active && view === 'cards') runSteps(0); }
  const settled = () => Math.round(target);
  function move(by) { go(settled() + by); }

  function onWheel(e) {
    if (!active || e.ctrlKey) return;
    e.preventDefault();
    if (view !== 'cards' || busy || (drag && drag.on)) return;
    if (intro) { skipIntro(); return; }
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 33; else if (e.deltaMode === 2) dy *= S_H;
    if (!dy) return;
    // A mouse wheel notch is one card. A trackpad sends many deltas, even large ones in a flick, and follows the
    // fingers until it snaps. The lead is capped so a hard flick can't run away from the presenter.
    const now = performance.now(), gap = now - wheelLast; wheelLast = now;
    const notch = Math.abs(dy) >= 80 && gap >= 60;
    const step = notch ? Math.sign(dy) : clamp(dy / 170, -.5, .5);
    const lead = notch ? 5 : 2;
    wheelDir = Math.sign(dy);
    target = clamp(target + step, x - lead, x + lead);
    moved();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      const frac = target - Math.floor(target);
      if (frac !== 0) target = wheelDir > 0 ? Math.ceil(target - .22) : Math.floor(target + .22);
      wake();
    }, 110);
    wake();
  }

  // ---------- pointer ----------
  function toStage(e) {
    const r = root.getBoundingClientRect();
    return { x: (e.clientX - r.left) * S_W / r.width, y: (e.clientY - r.top) * S_H / r.height };
  }
  function pick(p) {
    for (let k = cardsNow.length - 1; k >= 0; k--) {
      const c = cardsNow[k];
      const det = c.X[0] * c.Y[1] - c.X[1] * c.Y[0];
      if (Math.abs(det) < 1) continue;
      const dx = p.x - c.o[0], dy = p.y - c.o[1];
      const u = (dx * c.Y[1] - dy * c.Y[0]) / det, v = (c.X[0] * dy - c.X[1] * dx) / det;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return c.i;
    }
    return -1;
  }
  // Dragging follows the stack's diagonal: up and to the right brings the next card.
  const DRAG_PX = 300; // mouse travel for one card
  const DRAG_AXIS = (() => { const n = FRAME_STACK.n, l = Math.hypot(n[0], n[1]); return [-n[0] / l, -n[1] / l]; })();
  let drag = null, skipClick = false;
  function onPointerDown(e) {
    if (!active || e.button !== 0 || e.pointerType === 'touch') return;
    if (e.target.closest && e.target.closest('button')) return;
    if (intro) { skipIntro(); skipClick = true; return; }
    if (view !== 'cards' || busy) return;
    const p = toStage(e);
    drag = { x: p.x, y: p.y, from: target, on: false, t: e.timeStamp, last: 0, speed: 0 };
  }
  function onDragMove(e) {
    const p = toStage(e);
    const amount = ((p.x - drag.x) * DRAG_AXIS[0] + (p.y - drag.y) * DRAG_AXIS[1]) / DRAG_PX;
    if (!drag.on) {
      if (Math.hypot(p.x - drag.x, p.y - drag.y) < 6) return;
      drag.on = true;
      root.setPointerCapture(e.pointerId);
      root.classList.add('is-dragging');
      root.style.cursor = '';
      hoverCard = -1;
      clearTimeout(wheelTimer);
    }
    const dt = Math.max(1, e.timeStamp - drag.t) / 1000;
    drag.speed = near(drag.speed, (amount - drag.last) / dt, dt, .06); // cards per second
    drag.last = amount; drag.t = e.timeStamp;
    target = clamp(drag.from + amount, x - 2, x + 2);
    moved();
    wake();
  }
  function onPointerUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.on) return; // a plain click
    skipClick = true;
    setTimeout(() => { skipClick = false; }, 0);
    root.classList.remove('is-dragging');
    // A release in motion carries on a little; a third of a card is enough to reach the next one.
    const speed = e.timeStamp - d.t > 90 ? 0 : d.speed;
    const base = Math.round(d.from), aim = target + clamp(speed * .12, -.7, .7);
    target = base + Math.sign(aim - base) * Math.round(Math.abs(aim - base) + .15);
    wake();
  }
  function onPointerMove(e) {
    if (!active || view !== 'cards' || intro || busy) return;
    if (drag && !(e.buttons & 1)) onPointerUp(e); // released outside the window
    if (drag) { onDragMove(e); if (drag.on) return; }
    const hit = pick(toStage(e));
    const item = hit < 0 && e.target.closest ? e.target.closest('[data-career]') : null;
    root.style.cursor = hit >= 0 || item ? 'pointer' : '';
    if (hit !== hoverCard) { hoverCard = hit; wake(); }
  }
  function onPointerLeave() { if (hoverCard !== -1) { hoverCard = -1; wake(); } root.style.cursor = ''; }
  function onClick(e) {
    if (!active) return;
    if (skipClick) { skipClick = false; return; }
    if (e.target.closest && e.target.closest('button')) return;
    if (intro) { skipIntro(); return; }
    if (view !== 'cards' || busy) return;
    const hit = pick(toStage(e));
    if (hit >= 0) {
      if (isFront(hit) && Math.abs(target - x) < .5) tryOpen();
      else go(Math.round(x) + Math.round(wrap(hit - x, RING)));
      return;
    }
    const item = e.target.closest && e.target.closest('[data-career]');
    if (item) {
      const i = careers.findIndex((c) => c.el === item);
      if (i === mod(settled(), N)) tryOpen();
      else go(settled() + wrap(i - mod(settled(), N), N));
    }
  }

  // ---------- opening a career ----------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const EASE_CURTAIN = 'cubic-bezier(.76,0,.24,1)';
  function nudge() {
    shake = REDUCED ? 0 : 1;
    sound.nudge();
    wake();
  }
  function tryOpen() {
    if (busy || view !== 'cards') return;
    const c = careers[mod(settled(), N)];
    if (c.state !== 'open') { nudge(); return; }
    open(c);
  }
  const slideY = (el, from, to, duration) => el.animate([{ transform: `translateY(${from}%)` }, { transform: `translateY(${to}%)` }], { duration, easing: EASE_CURTAIN, fill: 'both' });
  async function curtain(title, sub, swap) {
    const sid = session;
    busy = true;
    document.body.classList.add('cr-cover');
    if (REDUCED || !ui.curtain.animate) { swap(); busy = false; document.body.classList.remove('cr-cover'); return; }
    ui.curtainTitle.textContent = title;
    ui.curtainSub.textContent = sub;
    ui.curtain.hidden = false;
    ui.pick.hidden = true; ui.curtainWords.hidden = false;
    const up = slideY(ui.curtain, 100, 0, 460); const upIn = slideY(ui.curtainIn, -100, 0, 460);
    const words = [ui.curtainTitle, ui.curtainSub].map((el, k) => el.animate([{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 300, delay: 360 + k * 90, easing: 'ease-out', fill: 'both' }));
    await up.finished.catch(() => {});
    if (sid !== session) return;
    swap();
    await wait(660);
    if (sid !== session) return;
    const down = slideY(ui.curtain, 0, 100, 540); const downIn = slideY(ui.curtainIn, 0, -100, 540);
    await down.finished.catch(() => {});
    if (sid !== session) return;
    [up, upIn, down, downIn].concat(words).forEach((a) => a.cancel());
    ui.curtain.hidden = true;
    busy = false;
    document.body.classList.remove('cr-cover');
  }
  const blurIn = (el, delay, px) => el.animate([{ opacity: 0, filter: `blur(${px}px)` }, { opacity: 1, filter: 'blur(0px)' }], { duration: 420, delay, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'backwards' });
  // Opening UX/UI Design, on one clock that starts at the press: about 4.8 s until the editor is fully in view.
  // The curtain rises, a highlight walks the logos, slower each time, stops on the last one, the task stays for about
  // 3 s so the room can read it, and the curtain falls.
  const PICK = { up: 380, walk: 400, hops: [30, 34, 40, 50, 65, 85, 115, 155, 210], down: 4300, downFor: 480 };
  function clearPick() {
    ui.pick.classList.remove('is-walking', 'is-chosen');
    ui.pickLogos.forEach((el) => el.classList.remove('is-on'));
  }
  function hopTo(k, ms) {
    ui.pickRow.style.setProperty('--at', String(k));
    ui.pickRow.style.setProperty('--hop', ms + 'ms');
    ui.pickLogos.forEach((el, i) => el.classList.toggle('is-on', i === k));
  }
  function chooseLast() {
    const last = ui.pickLogos.length - 1;
    hopTo(last, 0);
    ui.pick.classList.add('is-walking', 'is-chosen');
    sound.chord();
  }
  function showEditor() {
    view = 'editor';
    root.classList.add('is-editor');
    document.body.classList.add('cr-full');
    ui.editor.setAttribute('aria-hidden', 'false');
  }
  // Keys and clicks wait in `busy`; a deck key that leaves the slide ends this through `session`, and enter() cleans up.
  async function openWithPick() {
    const sid = session, t0 = performance.now();
    const at = (ms) => wait(Math.max(0, t0 + ms - performance.now()));
    const gone = () => sid !== session;
    busy = true;
    document.body.classList.add('cr-cover');
    clearPick();
    ui.curtainWords.hidden = true; ui.pick.hidden = false; ui.curtain.hidden = false;
    let anims;
    if (REDUCED) {
      anims = [slideY(ui.curtain, 0, 0, 1), slideY(ui.curtainIn, 0, 0, 1)];
      chooseLast();
      showEditor();
      await at(3000);
      if (gone()) return;
    } else {
      anims = [slideY(ui.curtain, 100, 0, PICK.up), slideY(ui.curtainIn, -100, 0, PICK.up)];
      sound.rise();
      await at(PICK.up);
      if (gone()) return;
      showEditor(); // behind the curtain, so its screen is ready when the curtain falls
      await at(PICK.walk);
      if (gone()) return;
      const n = ui.pickLogos.length;
      let when = PICK.walk;
      ui.pick.classList.add('is-walking');
      hopTo(0, 0);
      sound.logo(0);
      for (let i = 0; i < PICK.hops.length; i++) {
        when += PICK.hops[i];
        await at(when);
        if (gone()) return;
        const k = (i + 1) % n;
        hopTo(k, k === 0 ? 0 : Math.round(PICK.hops[i] * .7)); // back to the start in one jump, never across the row
        sound.logo(i + 1);
      }
      chooseLast();
      await at(PICK.down);
      if (gone()) return;
    }
    startPending = true;
    startEditor();
    if (!REDUCED) {
      anims.forEach((a) => a.cancel());
      anims = [slideY(ui.curtain, 0, 100, PICK.downFor), slideY(ui.curtainIn, 0, -100, PICK.downFor)];
      await anims[0].finished.catch(() => {});
      if (gone()) return;
    }
    anims.forEach((a) => a.cancel());
    ui.curtain.hidden = true; ui.pick.hidden = true; ui.curtainWords.hidden = false;
    clearPick();
    busy = false;
    document.body.classList.remove('cr-cover');
    focusFrame();
  }
  function open(c) {
    document.dispatchEvent(new CustomEvent('career:open', { detail: { id: c.id } }));
    hoverCard = -1; root.style.cursor = '';
    holdSteps(1);
    openWithPick();
  }
  function close() {
    if (view !== 'editor' || busy) return;
    const id = careers[mod(settled(), N)].id;
    releaseFocus();
    sound.close();
    curtain('Careers', 'Pick a career', () => {
      view = 'cards';
      root.classList.remove('is-editor');
      document.body.classList.remove('cr-full');
      ui.editor.setAttribute('aria-hidden', 'true');
      resetEditor();
      runSteps(0);
      draw();
      wake();
    }).then(() => document.dispatchEvent(new CustomEvent('career:close', { detail: { id } })));
  }

  // ---------- the page a career opens, in an iframe, ready before anyone asks for it ----------
  // The first look uses <object> because it is the one loader that fails quietly: fetch and iframe log a 404 in the console.
  const opener = careers.find((c) => c.opens);
  let frameEl = null, probeEl = null, pageThere = null, frameTimer = 0, startPending = false;
  // The editor waits for this call. It may not exist in every build, and the page may still be loading: then its load event tries again.
  function startEditor() {
    if (!startPending || !frameEl) return;
    try {
      const editor = frameEl.contentWindow && frameEl.contentWindow.MAYBE_EDITOR;
      if (!editor || !editor.start) return;
      startPending = false;
      Promise.resolve(editor.start({ skipOpening: true })).catch(() => {});
    } catch (err) { /* nothing to start: the page stays as it is */ }
  }
  // Going back to the cards leaves the editor ready for the next opening.
  function resetEditor() {
    try {
      const editor = frameEl && frameEl.contentWindow && frameEl.contentWindow.MAYBE_EDITOR;
      if (editor && editor.reset) editor.reset();
    } catch (err) { /* nothing to reset */ }
  }
  function probePage() {
    if (!opener || probeEl || pageThere) return;
    probeEl = document.createElement('object');
    probeEl.className = 'cr-probe'; probeEl.type = 'text/html'; probeEl.data = opener.opens;
    probeEl.setAttribute('aria-hidden', 'true');
    const done = (there) => {
      if (probeEl) probeEl.remove();
      probeEl = null; pageThere = there;
      ui.editor.classList.toggle('is-missing', !there);
      if (there && active && !intro && !frameEl) mountFrame();
    };
    probeEl.addEventListener('load', () => done(true));
    probeEl.addEventListener('error', () => done(false));
    ui.editor.appendChild(probeEl);
  }
  function prepareFrame() { if (pageThere) { if (!frameEl) mountFrame(); } else probePage(); }
  function removeFrame() { clearTimeout(frameTimer); if (frameEl) frameEl.remove(); frameEl = null; }
  function mountFrame() {
    removeFrame();
    frameEl = document.createElement('iframe');
    frameEl.className = 'cr-editor__frame';
    frameEl.title = opener.name + ' editor';
    frameEl.src = opener.opens;
    frameEl.addEventListener('load', wireFrame);
    ui.editor.appendChild(frameEl);
  }
  function wireFrame() {
    try {
      const w = frameEl.contentWindow;
      w.addEventListener('keydown', onFrameKey);
      w.document.addEventListener('design:finish', onFinish);
      startEditor();
      if (view === 'editor') w.focus();
    } catch (err) { /* another origin: nothing to wire */ }
  }
  function focusFrame() { if (frameEl && frameEl.contentWindow) frameEl.contentWindow.focus(); }
  function releaseFocus() { if (frameEl) frameEl.blur(); window.focus(); }
  // With the focus inside the iframe the deck hears nothing, so its keys are passed up, unless the editor used them.
  function onFrameKey(e) {
    if (!active || view !== 'editor' || e.defaultPrevented) return;
    const t = e.target;
    if (e.key !== 'Escape' && t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const up = new KeyboardEvent('keydown', { key: e.key, code: e.code, repeat: e.repeat, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, bubbles: true, cancelable: true });
    if (!document.dispatchEvent(up)) e.preventDefault();
  }
  function onFinish() {
    if (active && view === 'editor' && window.MAYBE_DECK) window.MAYBE_DECK.clientTools.nextSlide();
  }

  // ---------- intro: under 1.5 s, any key skips it ----------
  // The screen starts violet. A peep comes in from the right, shoving the wall, until it stops as the panel.
  function startIntro() {
    if (REDUCED || !ui.wall.animate) return;
    intro = true; textLock = true;
    document.body.classList.add('cr-cover');
    root.classList.add('is-intro');
    ui.wall.hidden = false;
    x = mid = -7.4; target = 0; introHold = true; velocity = 0; listPos = 0; tickAt = Math.round(x);
    const START = 170, PUSH = 860, to = S_W * .26 - S_W;
    const wall = ui.wall.animate([
      { transform: 'translateX(0)', easing: 'cubic-bezier(.2,.7,.3,1)' },
      { transform: `translateX(${to * .66}px)`, offset: .46, easing: 'linear' },
      { transform: `translateX(${to * .74}px)`, offset: .68, easing: 'cubic-bezier(.5,0,.1,1)' },
      { transform: `translateX(${to}px)` },
    ], { duration: PUSH, delay: START, fill: 'both' });
    const bob = ui.peep.animate([{ transform: 'rotate(-10deg) translateY(8px)' }, { transform: 'rotate(-13deg) translateY(-10px)' }, { transform: 'rotate(-10deg) translateY(8px)' }], { duration: 300, iterations: 3, delay: START });
    const fall = ui.peep.animate([{ transform: 'rotate(-10deg) translateY(8px)' }, { transform: 'rotate(14deg) translateY(1100px)' }], { duration: 330, delay: START + PUSH - 30, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' });
    const word = ui.word.animate([{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(14px)' }], { duration: 240, delay: START + 180, easing: 'ease-in', fill: 'both' });
    introAnims = [wall, bob, fall, word];
    ui.enter.forEach((el) => introAnims.push(blurIn(el, Number(el.dataset.crEnter) || 900, 12)));
    ui.title.forEach((el, k) => introAnims.push(el.animate([{ transform: 'translateY(108%)' }, { transform: 'none' }], { duration: 520, delay: 800 + k * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' })));
    introTimer = setTimeout(() => { introHold = false; wake(); }, 560);
    fall.finished.then(endIntro).catch(() => {});
  }
  function endIntro() {
    if (!intro) return;
    intro = false;
    ui.wall.hidden = true;
    root.classList.remove('is-intro');
    document.body.classList.remove('cr-cover');
    runSteps(0);
    prepareFrame(); // it shares a thread with the cards, so it waits for the intro to finish
    wake();
  }
  function skipIntro() {
    if (!intro) return;
    clearTimeout(introTimer); introHold = false;
    introAnims.forEach((a) => a.cancel()); introAnims = [];
    x = mid = target = 0; velocity = 0; listPos = 0; textLock = false; tickAt = 0;
    endIntro();
  }

  // ---------- keyboard ----------
  function onKey(e) {
    if (!active || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (intro) { if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); skipIntro(); return; }
    if (view === 'cards') {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!busy) move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!busy) move(-1); }
      else if (e.key === 'm' || e.key === 'M') sound.toggle();
      else if (e.key === 'Enter' && t !== ui.soundBtn) { e.preventDefault(); tryOpen(); } // on the sound button, reached with Tab, Enter is that button's
    } else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  // ---------- entering and leaving the slide ----------
  function reset() {
    target = mid = x = 0; velocity = 0; listPos = 0; index = -1; hoverCard = -1; zoom = 0; shake = 0; lift.fill(0); tickAt = 0;
    view = 'cards'; busy = false; textLock = false; intro = false; drag = null; skipClick = false;
    root.classList.remove('is-editor', 'is-dragging', 'is-intro');
    ui.editor.setAttribute('aria-hidden', 'true');
    ui.curtain.hidden = true; ui.wall.hidden = true;
    clearTimeout(introTimer); introHold = false;
    root.style.cursor = '';
    document.body.classList.remove('cr-cover', 'cr-full');
    root.getAnimations && root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    introAnims = [];
    setActive(0, false);
    holdSteps(0);
    clearPick(); ui.pick.hidden = true; ui.curtainWords.hidden = false; startPending = false;
    placeList();
  }
  function lockEsc(on) {
    // in full screen the browser would take Esc for itself
    const kb = navigator.keyboard;
    if (!kb || !kb.lock) return;
    try { if (on && document.fullscreenElement) kb.lock(['Escape']).catch(() => {}); else kb.unlock(); } catch (err) { /* not available here */ }
  }
  function enter() {
    active = true;
    session++;
    document.body.classList.add('cr-on');
    layout();
    reset();
    sound.enter();
    removeFrame(); // a fresh editor on every visit
    startIntro();
    if (!intro) { prepareFrame(); runSteps(0); }
    lockEsc(true);
    draw();
    wake();
  }
  function leave() {
    if (!active) return;
    active = false;
    session++;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    drag = null;
    clearTimeout(introTimer);
    clearInterval(stepTimer);
    sound.leave();
    document.body.classList.remove('cr-on', 'cr-cover', 'cr-full');
    releaseFocus();
    frameTimer = setTimeout(removeFrame, 450); // once the slide has faded out
    lockEsc(false);
  }

  // ---------- boot ----------
  if (gl) {
    setupGL();
    ui.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    ui.canvas.addEventListener('webglcontextrestored', () => { careers.forEach((c) => { c.tex = null; }); setupGL(); drawOnce(); });
  }
  layout();
  reset();
  preload();
  ui.pickLogos.forEach((el) => { const img = el.firstElementChild; if (img.decode) img.decode().catch(() => {}); }); // ready before the curtain rises
  probePage();
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('pointerleave', onPointerLeave);
  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  document.addEventListener('design:finish', onFinish);
  document.addEventListener('fullscreenchange', () => { if (active) lockEsc(true); });
  window.addEventListener('resize', () => { layout(); if (active) { sizeCanvas(); placeList(); drawOnce(); } });
  // the first key or click of the visit lets the sound start
  const unlock = () => { if (active) sound.unlock(); };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  // after a mouse click the button gives the focus back: in a live demo, the next Enter must open the career
  ui.soundBtn.addEventListener('click', (e) => { sound.toggle(); if (e.detail > 0) ui.soundBtn.blur(); });
  ui.tryBtn.addEventListener('click', () => tryOpen());
  document.addEventListener('deck:slidechange', (e) => { if (e.detail.slide.contains(root)) enter(); else leave(); });

  window.MAYBE_CAREERS = {
    root, careers,
    get index() { return mod(settled(), N); },
    get view() { return view; },
    goTo(i) { if (view === 'cards') go(settled() + wrap(i - mod(settled(), N), N)); },
    open: tryOpen, close,
    soundInfo: () => sound.info(),
  };
})();
