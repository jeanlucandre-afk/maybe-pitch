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
 *   ← →                       untouched: the deck changes slide
 *
 * All copy and images are in the board (src/Slide05b2.dc.html, careers()). A career with `opens` loads that page in a
 * 1440x810 iframe, scaled to the whole stage, as soon as the slide opens. Opening it fires career:open on document with
 * detail { id }; going back fires career:close. design:finish on document (ours or the iframe's) moves to the next
 * slide. See docs/careers-reference.md.
 */
(function () {
  'use strict';
  const root = document.querySelector('[data-careers]');
  if (!root) return;
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));

  // ---------- content, read from the board ----------
  const careers = $$('[data-career]').map((el) => ({
    el, id: el.dataset.career, name: el.dataset.name, status: el.dataset.status, state: el.dataset.state,
    duration: el.dataset.duration, does: el.dataset.does, evidence: el.dataset.evidence, opens: el.dataset.opens,
    image: el.dataset.image, focus: (el.dataset.focus || '0.5 0.5').split(' ').map(Number), swatches: (el.dataset.swatches || '').split(','),
    cover: null, tex: null, tag: null, tagTex: null, tagAt: null,
  }));
  const N = careers.length;
  if (!N) return;
  const RING = N * 2; // the ring repeats the careers so the stacks stay full

  const ui = {
    canvas: $('[data-cr-canvas]'), num: $('[data-cr-num]'), duration: $('[data-cr-duration]'), does: $('[data-cr-does]'), evidence: $('[data-cr-evidence]'),
    swatches: $$('[data-cr-swatches] i'), curtain: $('[data-cr-curtain]'), curtainIn: $('[data-cr-curtain-in]'), curtainTitle: $('[data-cr-curtain-title]'),
    wall: $('[data-cr-wall]'), peep: $('[data-cr-wall-peep]'), veil: $('[data-cr-veil]'), word: $('[data-cr-veil-word]'), editor: $('[data-cr-editor]'), enter: $$('[data-cr-enter]'),
  };
  const S_W = 1920, S_H = 1080;

  // ---------- the scene, in stage pixels ----------
  const SCALE = 1.07;             // card size against the reference: a projector wants a little more image
  const CARD_W = 449 * SCALE, CARD_H = 366 * SCALE, CARD_R = 12 * SCALE;
  const UNIT = 100 * SCALE;       // one step in the stack
  const FOCUS_AT = { x: 985, y: 530 };
  const GAP_ABOVE = 6.2, GAP_BELOW = 7; // empty steps on each side of the active card
  const LINE_AT = { x: FOCUS_AT.x - 66, y: FOCUS_AT.y + 54 }; // where the stack line passes near the centre

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
  const BEND_GAIN = .34, BEND_MAX = 1.9;
  let target = 0, mid = 0, x = 0, velocity = 0, listPos = 0;
  let active = false, raf = 0, last = 0, index = -1;
  let view = 'cards', busy = false, intro = false, introAnims = [], introTimer = 0, introHold = false, textLock = false;
  let hoverCard = -1, lift = new Float32Array(RING), zoom = 0, shake = 0;
  let cardsNow = [];
  let wheelTimer = 0, wheelDir = 0, wheelLast = 0, session = 0;

  // ---------- drawing ----------
  const STRIP = 28;
  const TEX_W = 1200, TEX_H = Math.round(TEX_W * CARD_H / CARD_W);
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
      uniform float uR, uZoom, uHaze, uFade, uTagA, uShadow;
      uniform vec3 uTint;
      uniform float uHasTex;
      uniform vec4 uTag;                            // x, y, w, h of the status tag, 0..1 over the card
      uniform sampler2D uT, uTagTex;
      out vec4 o;
      float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main() {
        float d = box(vP - uSize * 0.5, uSize * 0.5, uR);
        float aa = max(fwidth(d), 0.001);
        float a = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, d);
        float ds = box(vP - uSize * 0.5 - vec2(0.0, 18.0), uSize * 0.5, uR);
        float sh = uShadow * exp(-pow(max(ds, 0.0) / 38.0, 2.0)) * (1.0 - a);
        if (a <= 0.0 && sh <= 0.002) discard;
        vec2 uv = 0.5 + (vP / uSize - 0.5) * uZoom;
        vec3 c = uHasTex > 0.5 ? texture(uT, uv).rgb : uTint;
        if (uHasTex > 0.5) { vec4 tag = texture(uTagTex, (vP / uSize - uTag.xy) / uTag.zw) * uTagA; c = c * (1.0 - tag.a) + tag.rgb; }
        float line = 1.0 - smoothstep(0.0, 1.4, -d);  // hairline so light covers keep an edge on the zinc ground
        c = mix(c, c * 0.82, line * 0.85);
        c = mix(c, vec3(0.957, 0.957, 0.961), uHaze); // the far stack recedes into the page
        o = (vec4(c * a, a) + vec4(0.0, 0.0, 0.0, sh)) * uFade;
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    for (const n of ['uO', 'uX', 'uY', 'uB', 'uRes', 'uSize', 'uR', 'uZoom', 'uTint', 'uHasTex', 'uTag', 'uT', 'uTagTex', 'uPad', 'uHaze', 'uFade', 'uTagA', 'uShadow']) U[n] = gl.getUniformLocation(prog, n);
    const verts = [];
    for (let i = 0; i <= STRIP; i++) { const v = i / STRIP; verts.push(0, v, 1, v); }
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aUv');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(U.uT, 0);
    gl.uniform1i(U.uTagTex, 1);
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
    if (!c.tex) { c.tex = gl.createTexture(); c.tagTex = gl.createTexture(); }
    uploadTexture(c.tex, c.cover, false);
    uploadTexture(c.tagTex, c.tag, true);
  }

  // The cover cropped to the card, and its status tag apart, so the zoom on hover never cuts the text.
  function composeCover(c, img) {
    const cv = document.createElement('canvas');
    cv.width = TEX_W; cv.height = TEX_H;
    const g = cv.getContext('2d', { willReadFrequently: true }); // CPU canvas: the upload to the GPU never comes back black
    const ia = img.naturalWidth / img.naturalHeight, ta = TEX_W / TEX_H;
    let sw = img.naturalWidth, sh = img.naturalHeight;
    if (ia > ta) sw = sh * ta; else sh = sw / ta;
    const sx = (img.naturalWidth - sw) * c.focus[0], sy = (img.naturalHeight - sh) * c.focus[1];
    g.drawImage(img, sx, sy, sw, sh, 0, 0, TEX_W, TEX_H);
    c.cover = cv;
    const dark = c.state === 'tried' || c.state === 'open';
    const label = c.name + ' · ' + c.status;
    const font = '600 46px Geist, system-ui, sans-serif';
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    const m = 6, w = Math.ceil(measure.measureText(label).width) + 56, h = 84; // m: a clear edge, so the tag ends cleanly
    const tag = document.createElement('canvas');
    tag.width = w + m * 2; tag.height = h + m * 2;
    const t = tag.getContext('2d', { willReadFrequently: true });
    t.fillStyle = dark ? '#09090B' : '#FFFFFF';
    t.beginPath(); t.roundRect(m, m, w, h, 42); t.fill();
    if (!dark) { t.strokeStyle = '#E4E4E7'; t.lineWidth = 2; t.stroke(); }
    t.font = font;
    t.fillStyle = dark ? '#FAFAFA' : '#09090B';
    t.textBaseline = 'middle';
    t.fillText(label, m + 28, m + h / 2 + 2);
    c.tag = tag;
    c.tagAt = [(36 - m) / TEX_W, (34 - m) / TEX_H, tag.width / TEX_W, tag.height / TEX_H];
    if (gl && prog) uploadCover(c);
  }

  function preload() {
    const loads = careers.map((c) => new Promise((res) => {
      const img = new Image();
      img.onload = () => { (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => { c.img = img; composeCover(c, img); res(); wake(); }); };
      img.onerror = () => res();
      img.src = c.image;
    }));
    // the status is written with Geist, so write it again once the font is in
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('600 46px Geist'), Promise.all(loads)]).then(() => { careers.forEach((c) => { if (c.img) composeCover(c, c.img); }); drawOnce(); }).catch(() => {});
    }
  }

  function sizeCanvas() {
    const rect = root.getBoundingClientRect();
    const k = clamp((rect.width / S_W) * (window.devicePixelRatio || 1), 1, 1.5); // sharper than this costs frames and the covers have no more detail
    if (k === renderScale && ui.canvas.width === Math.round(S_W * k)) return;
    renderScale = k;
    ui.canvas.width = Math.round(S_W * k); ui.canvas.height = Math.round(S_H * k);
  }

  function computeCards() {
    const list = [];
    const bend = clamp(velocity * BEND_GAIN, -BEND_MAX, BEND_MAX) * UNIT;
    for (let i = 0; i < RING; i++) {
      const d = wrap(i - x, RING), ad = Math.abs(d), sg = d >= 0 ? 1 : -1;
      const s = -(d + sg * smooth(.08, .92, ad) * (d >= 0 ? GAP_BELOW : GAP_ABOVE)); // < 0 goes down and left, > 0 up and right
      const fade = 1 - smooth(9.3, 10.5, s);                 // the far end of the stack dissolves before it reaches the list
      if (fade <= 0) continue;
      const f = smooth(0, 1, 1 - smooth(0, .82, ad));        // 1 only when it faces the viewer
      const ex = turned(FRAME_STACK.x, f), ey = turned(FRAME_STACK.y, f), en = turned(FRAME_STACK.n, f);
      const ax = -FRAME_STACK.n[0] * UNIT, ay = -FRAME_STACK.n[1] * UNIT;
      let cx = LINE_AT.x + ax * s, cy = LINE_AT.y + ay * s;
      cx += (FOCUS_AT.x - cx) * f; cy += (FOCUS_AT.y - cy) * f;
      cy -= lift[i] * 26 * (1 - f);
      if (f > .5) cx += Math.sin(shake * 26) * shake * 14;
      const X = [ex[0] * CARD_W, ex[1] * CARD_W], Y = [ey[0] * CARD_H, ey[1] * CARD_H];
      const o = [cx - X[0] / 2 - Y[0] / 2, cy - X[1] / 2 - Y[1] / 2];
      const b = [-en[0] * bend, -en[1] * bend];
      const pad = 140;
      const xs = [o[0], o[0] + X[0], o[0] + Y[0], o[0] + X[0] + Y[0]], ys = [o[1], o[1] + X[1], o[1] + Y[1], o[1] + X[1] + Y[1]];
      if (Math.max(...xs) < -pad || Math.min(...xs) > S_W + pad || Math.max(...ys) < -pad || Math.min(...ys) > S_H + pad) continue;
      const haze = s > 0 ? Math.min(s / 7.2, 1.4) * .3 : 0;  // the active card must lead, never the neighbour above it
      list.push({ i, s, f, o, X, Y, b, fade, haze, tagA: smooth(.55, .95, f), shadow: .13 * f, career: careers[i % N] });
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
      gl.activeTexture(gl.TEXTURE0);
      for (const c of cardsNow) {
        gl.uniform2f(U.uO, c.o[0], c.o[1]);
        gl.uniform2f(U.uX, c.X[0], c.X[1]);
        gl.uniform2f(U.uY, c.Y[0], c.Y[1]);
        gl.uniform2f(U.uB, c.b[0], c.b[1]);
        gl.uniform1f(U.uZoom, 1 - .13 * zoom * smooth(.7, 1, c.f));
        gl.uniform1f(U.uHasTex, c.career.tex ? 1 : 0);
        gl.uniform1f(U.uPad, c.shadow > .002 ? 110 : 3);
        gl.uniform1f(U.uHaze, c.haze);
        gl.uniform1f(U.uFade, c.fade);
        gl.uniform1f(U.uTagA, c.tagA);
        gl.uniform1f(U.uShadow, c.shadow);
        gl.uniform3f(U.uTint, .894, .894, .906);
        if (c.career.tex) {
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, c.career.tagTex);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, c.career.tex);
          gl.uniform4f(U.uTag, c.career.tagAt[0], c.career.tagAt[1], c.career.tagAt[2], c.career.tagAt[3]);
        }
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
        if (c.career.cover) {
          const a = c.career.tagAt;
          flat.globalAlpha = c.fade;
          flat.drawImage(c.career.cover, 0, 0, CARD_W, CARD_H);
          flat.globalAlpha = c.fade * c.tagA;
          flat.drawImage(c.career.tag, a[0] * CARD_W, a[1] * CARD_H, a[2] * CARD_W, a[3] * CARD_H);
          flat.globalAlpha = c.fade * c.haze;
          flat.fillStyle = '#F4F4F5'; flat.fillRect(0, 0, CARD_W, CARD_H);
        } else { flat.fillStyle = '#E4E4E7'; flat.fillRect(0, 0, CARD_W, CARD_H); }
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
      if (!textLock) { const idx = mod(near0, N); if (idx !== index) setActive(idx, true); }
      else if (Math.abs(x) < .5) { textLock = false; }
      const goal = textLock ? 0 : near0;
      if (Math.abs(goal - listPos) > .0008) { listPos = REDUCED ? goal : near(listPos, goal, dt, .075); moving = true; } else listPos = goal;
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
    if (moving || intro) raf = requestAnimationFrame(tick);
  }

  const SLOT = 212;
  function placeList() {
    careers.forEach((c, i) => {
      const y = S_H / 2 + wrap(i - listPos, N) * SLOT;
      c.el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) translateY(-50%)`;
    });
  }
  const isFront = (ringIndex) => { const d = wrap(ringIndex - x, RING); return Math.abs(d) < .5; };

  // ---------- active career: text swaps with a pulse of blur, never a plain fade ----------
  const pulse = (el, peak, delay) => {
    if (REDUCED || !el.animate) return;
    el.animate([{ filter: 'blur(0px)' }, { filter: `blur(${peak}px)`, offset: .2 }, { filter: 'blur(0px)' }], { duration: 640, delay: delay || 0, easing: 'cubic-bezier(.22,.61,.36,1)' });
  };
  function setActive(i, animate) {
    index = i;
    const c = careers[i];
    const number = String(i + 1).padStart(2, '0');
    ui.num.textContent = number.replace(/0/g, 'O'); // Geist Mono's zero has a slash that reads as Ø at this size
    ui.num.setAttribute('aria-label', number);
    ui.duration.textContent = c.duration;
    ui.does.textContent = c.does;
    ui.evidence.textContent = c.evidence;
    careers.forEach((o, k) => { o.el.classList.toggle('is-active', k === i); if (k === i) o.el.setAttribute('aria-current', 'true'); else o.el.removeAttribute('aria-current'); });
    ui.swatches.forEach((el, k) => { el.style.backgroundColor = c.swatches[k] || ''; });
    root.classList.toggle('can-open', c.state === 'open');
    if (animate) {
      pulse(ui.num, 9);
      pulse(ui.duration, 5, 20);
      pulse(ui.does, 5, 40);
      pulse(ui.evidence, 5, 60);
    }
  }

  // ---------- moving ----------
  function go(to) {
    target = to;
    wake();
  }
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
    if (!active || view !== 'cards' || intro) return;
    if (drag && !(e.buttons & 1)) onPointerUp(e); // released outside the window
    if (drag) { onDragMove(e); if (drag.on) return; }
    const hit = pick(toStage(e));
    const item = hit < 0 && e.target.closest ? e.target.closest('[data-career]') : null;
    const lockedFront = hit >= 0 && isFront(hit) && careers[mod(settled(), N)].state !== 'open';
    root.style.cursor = (hit >= 0 && !lockedFront) || item ? 'pointer' : '';
    if (hit !== hoverCard) { hoverCard = hit; wake(); }
  }
  function onPointerLeave() { if (hoverCard !== -1) { hoverCard = -1; wake(); } root.style.cursor = ''; }
  function onClick(e) {
    if (!active) return;
    if (skipClick) { skipClick = false; return; }
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
    const st = careers[mod(settled(), N)].el.querySelector('.cr-item__status');
    if (st && st.animate && !REDUCED) st.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 360, easing: 'ease-out' });
    wake();
  }
  function tryOpen() {
    if (busy || view !== 'cards') return;
    const c = careers[mod(settled(), N)];
    if (c.state !== 'open') { nudge(); return; }
    open(c);
  }
  async function curtain(title, swap) {
    const sid = session;
    busy = true;
    document.body.classList.add('cr-black');
    if (REDUCED || !ui.curtain.animate) { swap(); busy = false; document.body.classList.remove('cr-black'); return; }
    ui.curtainTitle.textContent = title;
    ui.curtain.hidden = false;
    const run = (el, from, to, duration, delay) => el.animate([{ transform: `translateY(${from}%)` }, { transform: `translateY(${to}%)` }], { duration, delay: delay || 0, easing: EASE_CURTAIN, fill: 'both' });
    const up = run(ui.curtain, 100, 0, 460); const upIn = run(ui.curtainIn, -100, 0, 460);
    const t = ui.curtainTitle.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 530, easing: 'ease-out', fill: 'both' }); // black first, then the title
    await up.finished.catch(() => {});
    if (sid !== session) return;
    swap();
    await wait(560);
    if (sid !== session) return;
    const down = run(ui.curtain, 0, 100, 540); const downIn = run(ui.curtainIn, 0, -100, 540);
    await down.finished.catch(() => {});
    if (sid !== session) return;
    [up, upIn, t, down, downIn].forEach((a) => a.cancel());
    ui.curtain.hidden = true;
    busy = false;
    document.body.classList.remove('cr-black');
  }
  const blurIn = (el, delay, px) => el.animate([{ opacity: 0, filter: `blur(${px}px)` }, { opacity: 1, filter: 'blur(0px)' }], { duration: 420, delay, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'backwards' });
  function open(c) {
    document.dispatchEvent(new CustomEvent('career:open', { detail: { id: c.id } }));
    hoverCard = -1; root.style.cursor = '';
    curtain(c.name, () => {
      view = 'editor';
      root.classList.add('is-editor');
      document.body.classList.add('cr-full');
      ui.editor.setAttribute('aria-hidden', 'false');
      focusFrame();
    });
  }
  function close() {
    if (view !== 'editor' || busy) return;
    const id = careers[mod(settled(), N)].id;
    releaseFocus();
    curtain('Careers', () => {
      view = 'cards';
      root.classList.remove('is-editor');
      document.body.classList.remove('cr-full');
      ui.editor.setAttribute('aria-hidden', 'true');
      draw();
      wake();
    }).then(() => document.dispatchEvent(new CustomEvent('career:close', { detail: { id } })));
  }

  // ---------- the page a career opens, in an iframe, ready before anyone asks for it ----------
  // The first look uses <object> because it is the one loader that fails quietly: fetch and iframe log a 404 in the console.
  const opener = careers.find((c) => c.opens);
  let frameEl = null, probeEl = null, pageThere = null, frameTimer = 0;
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
  function startIntro() {
    if (REDUCED || !ui.wall.animate) return;
    intro = true; textLock = true;
    document.body.classList.add('cr-black');
    ui.wall.hidden = false; ui.veil.hidden = false;
    x = mid = -7.4; target = 0; introHold = true; velocity = 0; listPos = 0;
    // Black first, a fast shove, a stubborn moment, then the wall gives way: 1.43 s in all.
    const START = 320, PUSH = 1090, GIVES = .68;
    const wall = ui.wall.animate([
      { transform: 'translateX(0)', easing: 'cubic-bezier(.2,.7,.3,1)' },
      { transform: 'translateX(1130px)', offset: .36, easing: 'linear' },
      { transform: 'translateX(1230px)', offset: GIVES, easing: 'cubic-bezier(.7,0,.9,.4)' },
      { transform: 'translateX(2600px)' },
    ], { duration: PUSH, delay: START, fill: 'both' });
    const bob = ui.peep.animate([{ transform: 'rotate(10deg) translateY(8px)' }, { transform: 'rotate(13deg) translateY(-10px)' }, { transform: 'rotate(10deg) translateY(8px)' }], { duration: 300, iterations: 6, delay: START });
    const gone = { duration: 300, delay: START + PUSH * GIVES, easing: 'ease-in', fill: 'both' };
    introAnims = [wall, bob, ui.veil.animate([{ opacity: 1 }, { opacity: 0 }], gone), ui.word.animate([{ filter: 'blur(0px)' }, { filter: 'blur(14px)' }], gone)];
    ui.enter.forEach((el, k) => introAnims.push(blurIn(el, 900 + k * 16, 12)));
    introTimer = setTimeout(() => { introHold = false; wake(); }, 960);
    wall.finished.then(endIntro).catch(() => {});
  }
  function endIntro() {
    if (!intro) return;
    intro = false;
    ui.wall.hidden = true; ui.veil.hidden = true;
    document.body.classList.remove('cr-black');
    prepareFrame(); // it shares a thread with the cards, so it waits for the intro to finish
    wake();
  }
  function skipIntro() {
    if (!intro) return;
    clearTimeout(introTimer); introHold = false;
    introAnims.forEach((a) => a.cancel()); introAnims = [];
    x = mid = target = 0; velocity = 0; listPos = 0; textLock = false;
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
      else if (e.key === 'Enter') { e.preventDefault(); tryOpen(); }
    } else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  // ---------- entering and leaving the slide ----------
  function reset() {
    target = mid = x = 0; velocity = 0; listPos = 0; index = -1; hoverCard = -1; zoom = 0; shake = 0; lift.fill(0);
    view = 'cards'; busy = false; textLock = false; intro = false; drag = null; skipClick = false;
    root.classList.remove('is-editor', 'is-dragging');
    ui.editor.setAttribute('aria-hidden', 'true');
    ui.curtain.hidden = true; ui.wall.hidden = true; ui.veil.hidden = true;
    clearTimeout(introTimer); introHold = false;
    root.style.cursor = '';
    document.body.classList.remove('cr-black', 'cr-full');
    root.getAnimations && root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    introAnims = [];
    setActive(0, false);
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
    reset();
    removeFrame(); // a fresh editor on every visit
    startIntro();
    if (!intro) prepareFrame();
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
    document.body.classList.remove('cr-on', 'cr-black', 'cr-full');
    releaseFocus();
    frameTimer = setTimeout(removeFrame, 450); // once the slide has faded out
    lockEsc(false);
  }

  // ---------- boot ----------
  if (gl) {
    setupGL();
    ui.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    ui.canvas.addEventListener('webglcontextrestored', () => { careers.forEach((c) => { c.tex = c.tagTex = null; }); setupGL(); drawOnce(); });
  }
  reset();
  preload();
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
  window.addEventListener('resize', () => { if (active) { sizeCanvas(); drawOnce(); } });
  document.addEventListener('deck:slidechange', (e) => { if (e.detail.slide.contains(root)) enter(); else leave(); });

  window.MAYBE_CAREERS = {
    root, careers,
    get index() { return mod(settled(), N); },
    get view() { return view; },
    goTo(i) { if (view === 'cards') go(settled() + wrap(i - mod(settled(), N), N)); },
    open: tryOpen, close,
  };
})();
