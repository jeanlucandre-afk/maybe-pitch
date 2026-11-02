/* MAYBE live design editor: three moves on a DICE checkout, each by drag or by click, in any order.
 * The deck shows it in an iframe at 1440x810, so ← → Space and the numbers stay with the deck.
 * Finish fires design:finish on document, and on the parent's document when it is same-origin.
 * detail.moves lists the moves made, in order: 'price-with-fees', 'buy-button', 'remove-account'.
 * Nothing is stored: a reload returns to the first state. */
(function () {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const NEAR = 130; // a drop this close to its place counts
  const CAPTURE = 52; // this close, the piece snaps to its place like a magnet
  const EDGE = 60; // the account step counts as out once its centre is this close to the edge of the phone
  const TRASH_NEAR = 56;
  const FINISH_DELAY = 900; // the confirmation shows this long before the event goes out
  const FINISH_HOLD = 2400;

  const root = document.documentElement;
  const app = $('#app'), phone = $('#phone'), scr = $('#screen'), overlay = $('#overlay');
  const ticket = $('#ticket'), oldPrice = $('#old-price'), newPrice = $('#new-price');
  const account = $('#account'), continueBtn = $('#continue'), buy = $('#buy');
  const trash = $('#trash'), finishBtn = $('#finish'), layersBox = $('#layers'), inspect = $('#inspect');
  const selBox = $('#sel'), selTag = $('#sel-tag'), hovBox = $('#hov'), zoneBox = $('#zone'), guides = $('#guides');
  const saved = $('#saved'), savedText = $('#saved-text'), toast = $('#toast');
  const frameLabel = $('#frame-label'), original = $('#original');

  const PIECES = {
    price: { label: 'Price with fees', move: 'price-with-fees', layer: 'price', tile: $('#tile-price'), target: newPrice, zone: ticket, dim: oldPrice },
    buy: { label: 'Buy button', move: 'buy-button', layer: 'cta', tile: $('#tile-buy'), target: buy, zone: buy, dim: continueBtn },
    account: { label: 'Create an account', move: 'remove-account', layer: 'account', target: account }
  };
  PIECES.price.mini = $('.mini', PIECES.price.tile);
  PIECES.buy.mini = $('.mini', PIECES.buy.tile);

  const LAYERS = [
    { id: 'frame', name: 'Redesign', icon: 'i-frame', type: 'Frame', depth: 0 },
    { id: 'header', name: 'Header', icon: 'i-frame', type: 'Frame', depth: 1 },
    { id: 'hero', name: 'Event hero', icon: 'i-image', type: 'Image', depth: 1 },
    { id: 'ticket', name: 'Ticket row', icon: 'i-frame', type: 'Frame', depth: 1 },
    { id: 'ticket-name', name: 'General admission', icon: 'i-type', type: 'Text', depth: 2 },
    { id: 'price', name: 'Price', icon: 'i-type', type: 'Text', depth: 2 },
    { id: 'account', name: 'Create an account', icon: 'i-frame', type: 'Frame', depth: 1 },
    { id: 'details', name: 'Event details', icon: 'i-frame', type: 'Frame', depth: 1 },
    { id: 'cta', name: 'Continue', icon: 'i-rect', type: 'Rectangle', depth: 1 },
    { id: 'original', name: 'Original', icon: 'i-frame', type: 'Frame', depth: 0 }
  ];
  const layerById = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

  const done = { price: false, buy: false, account: false }; // the move counts
  const shown = { price: false, buy: false, account: false }; // the move is on the phone
  const moves = [];
  const flights = {}; // ghosts on their way back, by piece
  let scale = 1;
  let selected = 'frame';
  let hovered = null;
  let focus = null; // the ghost the selection frame follows
  let focusLabel = '';
  let press = null; // the pointer is down on a piece
  let drag = null; // the piece is moving
  let finishing = false;

  // ---------- geometry, in stage pixels ----------
  function rect(el) {
    const r = el.getBoundingClientRect();
    return { left: r.left / scale, top: r.top / scale, right: r.right / scale, bottom: r.bottom / scale, width: r.width / scale, height: r.height / scale, cx: (r.left + r.right) / 2 / scale, cy: (r.top + r.bottom) / 2 / scale };
  }
  const distTo = (r, x, y) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
  const inside = (r, x, y, inset = 0) => x > r.left + inset && x < r.right - inset && y > r.top + inset && y < r.bottom - inset;

  function setBox(el, x, y, w, h) {
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }

  function fit() {
    scale = Math.min(window.innerWidth / 1440, window.innerHeight / 810) || 1;
    root.style.setProperty('--s', String(scale));
    paint();
  }

  // ---------- layers ----------
  function buildLayers() {
    LAYERS.forEach((l) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'layer';
      row.style.setProperty('--depth', l.depth);
      row.hidden = l.id === 'original';
      row.innerHTML = `<svg class="i"><use href="#${l.icon}"/></svg><span>${l.name}</span>`;
      row.addEventListener('click', () => select(l.id));
      row.addEventListener('pointerenter', () => setHover(l.id));
      row.addEventListener('pointerleave', () => setHover(null));
      layersBox.appendChild(row);
      l.row = row;
    });
  }

  function flipRows(mutate) {
    const rows = LAYERS.filter((l) => l.row.isConnected).map((l) => l.row);
    const before = new Map(rows.map((row) => [row, row.getBoundingClientRect().top]));
    rows.forEach((row) => row.getAnimations().forEach((a) => { if (a.id === 'flip') a.cancel(); }));
    mutate();
    rows.forEach((row) => {
      if (!row.isConnected) return;
      const dy = (before.get(row) - row.getBoundingClientRect().top) / scale;
      if (Math.abs(dy) < 0.5) return;
      const a = row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: calm ? 1 : 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
      a.id = 'flip';
    });
  }

  function flashRow(row) {
    row.animate([{ backgroundColor: '#ede9fe' }, { backgroundColor: 'transparent' }], { duration: calm ? 1 : 900, easing: 'ease-out' });
  }

  function turnIntoInstance(id, name) {
    const l = layerById[id];
    l.name = name;
    l.icon = 'i-diamond';
    l.type = 'Instance';
    l.row.classList.add('is-instance');
    l.row.innerHTML = `<svg class="i"><use href="#i-diamond"/></svg><span>${name}</span>`;
    flashRow(l.row);
  }

  // ---------- selection, hover, inspector ----------
  function layerEl(id) {
    if (id === 'frame') return scr;
    if (id === 'original') return original;
    if (id === 'price') return shown.price ? newPrice : oldPrice;
    if (id === 'cta') return shown.buy ? buy : continueBtn;
    if (id === 'account') return shown.account ? null : account;
    return $(`[data-layer="${id}"]`, scr);
  }

  function select(id) {
    selected = id;
    LAYERS.forEach((l) => l.row.classList.toggle('is-selected', l.id === id));
    paint();
    paintInspector();
  }

  function setHover(id) {
    hovered = id;
    paintHover();
  }

  function paintSelection() {
    const el = focus ? focus.el : selected && layerEl(selected);
    selBox.classList.toggle('on', Boolean(el));
    frameLabel.style.visibility = !focus && selected === 'frame' ? 'hidden' : 'visible';
    if (!el) return;
    const r = rect(el);
    setBox(selBox, r.left, r.top, r.width, r.height);
    selTag.textContent = focus ? focusLabel : layerById[selected].name;
  }

  function paintHover() {
    const el = hovered && !press && !drag && hovered !== selected && layerEl(hovered);
    hovBox.classList.toggle('on', Boolean(el));
    if (!el) return;
    const r = rect(el);
    setBox(hovBox, r.left, r.top, r.width, r.height);
    hovBox.style.borderRadius = getComputedStyle(el).borderTopLeftRadius;
  }

  function paint() {
    paintSelection();
    paintHover();
  }

  function toHex(color) {
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a] = m[1].split(/[ ,/]+/).map(Number);
    if (a === 0) return null;
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }

  function writeInspector(name, type, el, left, top, width, height) {
    const origin = rect(scr);
    const style = getComputedStyle(el);
    const fill = el.tagName === 'IMG' ? null : type === 'Text' ? toHex(getComputedStyle(el.querySelector('b') || el).color) : toHex(style.backgroundColor);
    inspect.classList.remove('is-page');
    $('#ins-name').textContent = name;
    $('#ins-type').textContent = type;
    $('#ins-x').textContent = Math.round(left - origin.left);
    $('#ins-y').textContent = Math.round(top - origin.top);
    $('#ins-w').textContent = Math.round(width);
    $('#ins-h').textContent = Math.round(height);
    $('#ins-fill').textContent = el.tagName === 'IMG' ? 'Image' : fill || 'None';
    $('#ins-swatch').style.background = fill || 'transparent';
    $('#ins-radius').textContent = Math.round(parseFloat(style.borderTopLeftRadius) || 0);
  }

  function paintInspector() {
    if (drag) return; // the moving piece writes its own numbers
    const el = selected && layerEl(selected);
    if (!el || !rect(el).width) { // nothing selected: the page itself, as in Figma
      const fill = toHex(getComputedStyle($('.canvas')).backgroundColor);
      inspect.classList.add('is-page');
      $('#ins-name').textContent = 'Page 1';
      $('#ins-type').textContent = 'Page';
      $('#ins-fill').textContent = fill;
      $('#ins-swatch').style.background = fill;
      return;
    }
    const source = selected === 'hero' ? $('img', el) : selected === 'original' ? $('.screen', el) : el;
    const r = rect(selected === 'hero' ? el : source);
    writeInspector(layerById[selected].name, layerById[selected].type, source, r.left, r.top, r.width, r.height);
  }

  // Keep the frames on the moving elements while the layout animates.
  let trackUntil = 0, tracking = false;
  function track(ms) {
    trackUntil = Math.max(trackUntil, performance.now() + ms);
    if (!tracking) { tracking = true; requestAnimationFrame(trackTick); }
    clearTimeout(track.timer);
    track.timer = setTimeout(() => { paint(); paintInspector(); }, ms + 40);
  }
  function trackTick(now) {
    paint();
    if (now < trackUntil) requestAnimationFrame(trackTick);
    else { tracking = false; paintInspector(); }
  }

  // ---------- saved ----------
  let savedTimer = 0, freshTimer = 0;
  function markSaved() {
    saved.classList.add('is-saving');
    saved.classList.remove('is-fresh');
    savedText.textContent = 'Saving…';
    clearTimeout(savedTimer);
    clearTimeout(freshTimer);
    savedTimer = setTimeout(() => {
      saved.classList.remove('is-saving');
      saved.classList.add('is-fresh');
      savedText.textContent = 'Saved';
      freshTimer = setTimeout(() => saved.classList.remove('is-fresh'), 900);
    }, calm ? 1 : 520);
  }

  // ---------- the phone rearranges itself ----------
  function flip(mutate) {
    const items = $$('[data-flip]', scr);
    const before = new Map(items.map((el) => {
      const r = el.getBoundingClientRect();
      return [el, r.height ? r.top : null];
    }));
    items.forEach((el) => el.getAnimations().forEach((a) => { if (a.id === 'flip') a.cancel(); }));
    mutate();
    items.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.height) return;
      const was = before.get(el);
      let a;
      if (was === null) a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: calm ? 1 : 220, easing: 'ease-out' });
      else {
        const dy = (was - r.top) / scale;
        if (Math.abs(dy) < 0.5) return;
        a = el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: calm ? 1 : 440, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      a.id = 'flip';
    });
    track(480);
  }

  function pop(el) {
    el.animate([{ transform: 'scale(1.035)' }, { transform: 'scale(1)' }], { duration: calm ? 1 : 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  // ---------- the moves ----------
  function decide(id) {
    if (done[id]) return;
    done[id] = true;
    moves.push(PIECES[id].move);
    if (PIECES[id].tile) {
      PIECES[id].tile.classList.add('is-placed');
      PIECES[id].tile.removeAttribute('aria-label');
    }
  }

  // Puts a decided move on the phone.
  function apply(id) {
    if (shown[id]) return;
    flip(() => {
      shown[id] = true;
      scr.classList.add(`done-${id}`);
    });
    original.classList.add('on');
    layerById.original.row.hidden = false;
    if (id === 'price') {
      turnIntoInstance('price', 'Price with fees');
      pop(newPrice);
      select('price');
    } else if (id === 'buy') {
      turnIntoInstance('cta', 'Buy button');
      pop(buy);
      select('cta');
    } else {
      flipRows(() => layerById.account.row.remove());
      if (selected === 'account') select(null);
      else paint();
    }
    markSaved();
  }

  // ---------- ghosts: the copy of a piece that moves over everything ----------
  function makeGhost(id) {
    const target = PIECES[id].target;
    const r = rect(target);
    const el = target.cloneNode(true);
    ['id', 'data-layer', 'data-flip', 'role', 'tabindex', 'aria-label'].forEach((a) => el.removeAttribute(a));
    el.classList.remove('is-lifted');
    el.classList.add('ghost');
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
    overlay.appendChild(el);
    return { el, w: r.width, h: r.height };
  }
  const transformFor = (g, cx, cy, k) => `translate(${cx - g.w / 2}px, ${cy - g.h / 2}px) scale(${k})`;
  function place(g, cx, cy, k) {
    g.el.style.transform = transformFor(g, cx, cy, k);
  }

  function follow(g, label) {
    focus = g;
    focusLabel = label;
  }

  // One flight, with a timer behind it so a sleeping tab can never leave a move hanging.
  function fly(g, to, ms, easing, fade, end) {
    const from = g.el.style.transform;
    const frames = fade ? [{ transform: from, opacity: 1 }, { transform: to, opacity: 0 }] : [{ transform: from }, { transform: to }];
    const anim = g.el.animate(frames, { duration: calm ? 1 : ms, easing, fill: 'forwards' });
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      if (focus === g) focus = null;
      g.el.remove();
      end();
      paint();
    };
    const timer = setTimeout(finish, ms + 90);
    anim.onfinish = finish;
    track(ms + 40);
    return { stop() { over = true; clearTimeout(timer); anim.cancel(); if (focus === g) focus = null; g.el.remove(); } };
  }

  function land(id, g) {
    const p = PIECES[id];
    const t = rect(p.target);
    g.el.classList.add('is-landing');
    follow(g, p.label);
    fly(g, transformFor(g, t.cx, t.cy, 1), 190, 'cubic-bezier(.16,1,.3,1)', false, () => {
      apply(id);
      p.mini.classList.remove('is-lifted');
    });
  }

  function goBack(id, g) {
    const p = PIECES[id];
    if (id === 'account') {
      if (scr.classList.contains('done-account')) flip(() => scr.classList.remove('done-account'));
      const t = rect(account);
      flights[id] = fly(g, transformFor(g, t.cx, t.cy, 1), 240, 'cubic-bezier(.2,.8,.2,1)', false, () => {
        delete flights[id];
        account.classList.remove('is-lifted');
      });
    } else {
      const t = rect(p.mini);
      flights[id] = fly(g, transformFor(g, t.cx, t.cy, t.width / g.w), 260, 'cubic-bezier(.2,.8,.2,1)', false, () => {
        delete flights[id];
        p.mini.classList.remove('is-lifted');
      });
    }
  }

  function throwAccountAway(g) {
    const t = rect(trash);
    trash.classList.add('is-armed', 'is-near');
    if (focus === g) focus = null;
    fly(g, transformFor(g, t.cx, t.cy, 0.12), 300, 'cubic-bezier(.45,.05,.55,.95)', true, () => {
      trash.classList.remove('is-armed', 'is-near');
    });
    paint();
  }

  // A click does the same move a drag does.
  function perform(id) {
    if (done[id]) {
      if (shown[id] && id !== 'account') select(PIECES[id].layer);
      return;
    }
    if (flights[id]) { flights[id].stop(); delete flights[id]; }
    if (id === 'account') {
      const r = rect(account);
      const g = makeGhost('account');
      place(g, r.cx, r.cy, 1);
      decide('account');
      account.classList.remove('is-lifted');
      apply('account');
      throwAccountAway(g);
      return;
    }
    const p = PIECES[id];
    const from = rect(p.mini), to = rect(p.zone), t = rect(p.target);
    const g = makeGhost(id);
    place(g, from.cx, from.cy, from.width / g.w);
    decide(id);
    const zone = zoneBox.cloneNode(false);
    zone.removeAttribute('id');
    zone.classList.add('on', 'is-near');
    setBox(zone, to.left, to.top, to.width, to.height);
    overlay.appendChild(zone);
    follow(g, p.label);
    fly(g, transformFor(g, t.cx, t.cy, 1), 340, 'cubic-bezier(.3,.9,.3,1)', false, () => {
      zone.remove();
      apply(id);
    });
  }

  // ---------- drag ----------
  function pressPiece(e, id) {
    if (e.button !== 0) return;
    if (press) {
      if (press.pointerId !== e.pointerId) return;
      cancelGesture(); // its release never arrived: a lost gesture must not block the next one
    }
    if (done[id]) return;
    if (flights[id]) {
      flights[id].stop();
      delete flights[id];
      (PIECES[id].mini || account).classList.remove('is-lifted');
    }
    press = { id, pointerId: e.pointerId, x: e.clientX / scale, y: e.clientY / scale };
    setHover(null);
    try { app.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer: the window listeners still see it */ }
  }

  function beginDrag(x, y) {
    const id = press.id;
    const p = PIECES[id];
    const lifted = id === 'account' ? account : p.mini;
    const from = rect(lifted);
    const g = makeGhost(id);
    place(g, from.cx, from.cy, from.width / g.w);
    drag = { id, g, px: x, py: y, vx: 0, vy: 0, lastT: 0, offX: from.cx - press.x, offY: from.cy - press.y, k: from.width / g.w, pull: 0, t0: performance.now(), snapped: false, out: false };
    lifted.classList.add('is-lifted');
    root.classList.add('is-dragging');
    select(p.layer);
    follow(g, p.label);
    if (id === 'account') trash.classList.add('is-armed');
    else zoneBox.classList.add('on');
    requestAnimationFrame(tick);
  }

  function tick(now) {
    const d = drag;
    if (!d) return;
    const p = PIECES[d.id];
    const age = Math.min(1, (now - d.t0) / 160);
    // A panel piece grows to its real size around the cursor; the account step keeps the spot it was grabbed by.
    const keep = d.id === 'account' ? 1 : Math.pow(1 - age, 3);
    const fx = d.px + d.offX * keep, fy = d.py + d.offY * keep;
    let pullTo = 0, kTo = 1, sx = fx, sy = fy;

    if (d.id === 'account') {
      const t = rect(trash);
      const nearTrash = distTo(t, d.px, d.py) < TRASH_NEAR;
      const out = nearTrash || !inside(rect(phone), fx, fy, EDGE);
      if (out !== d.out) {
        d.out = out;
        flip(() => scr.classList.toggle('done-account', out));
      }
      trash.classList.toggle('is-near', nearTrash);
      focusLabel = out ? 'Release to remove' : p.label;
      sx = t.cx;
      sy = t.cy;
      pullTo = nearTrash ? 1 : 0;
      kTo = nearTrash ? 0.6 : 1;
    } else {
      const z = rect(p.zone), t = rect(p.target);
      const dist = distTo(z, fx, fy);
      const near = dist < NEAR;
      d.snapped = dist < CAPTURE + (d.snapped ? 14 : 0);
      sx = t.cx;
      sy = t.cy;
      pullTo = d.snapped ? 1 : near ? (1 - (dist - CAPTURE) / (NEAR - CAPTURE)) * 0.2 : 0;
      setBox(zoneBox, z.left, z.top, z.width, z.height);
      zoneBox.classList.toggle('is-near', near);
      p.dim.classList.toggle('is-dim', d.snapped);
      paintGuides(d.snapped ? t : null);
    }

    d.pull += (pullTo - d.pull) * (calm ? 1 : 0.3);
    d.k += (kTo - d.k) * (calm ? 1 : 0.28);
    const gx = fx + (sx - fx) * d.pull, gy = fy + (sy - fy) * d.pull;
    place(d.g, gx, gy, d.k);
    d.g.el.classList.toggle('is-landing', d.snapped);
    paintSelection();
    writeInspector(p.label, d.id === 'account' ? 'Frame' : 'Instance', d.g.el, gx - d.g.w / 2, gy - d.g.h / 2, d.g.w, d.g.h);
    requestAnimationFrame(tick);
  }

  function paintGuides(t) {
    guides.classList.toggle('on', Boolean(t));
    if (!t) return;
    const ph = rect(phone);
    const top = Math.round(ph.top), height = Math.round(ph.height + 18);
    const left = Math.round(ph.left - 34), width = Math.round(ph.width + 68);
    setBox($('#g-left'), Math.round(t.left) - 1, top, 2, height);
    setBox($('#g-right'), Math.round(t.right) - 1, top, 2, height);
    setBox($('#g-top'), left, Math.round(t.top) - 1, width, 2);
    setBox($('#g-bottom'), left, Math.round(t.bottom) - 1, width, 2);
  }

  function clearDragMarks(d) {
    root.classList.remove('is-dragging');
    zoneBox.classList.remove('on', 'is-near');
    guides.classList.remove('on');
    trash.classList.remove('is-armed', 'is-near');
    const dim = PIECES[d.id].dim;
    if (dim) dim.classList.remove('is-dim');
  }

  function release() {
    const pr = press, d = drag;
    press = null;
    drag = null;
    if (!d) { perform(pr.id); return; }
    clearDragMarks(d);
    const p = PIECES[d.id];
    const fresh = performance.now() - d.lastT < 70;
    const nx = d.px + (fresh ? d.vx * 110 : 0), ny = d.py + (fresh ? d.vy * 110 : 0); // where a quick throw was heading

    if (d.id === 'account') {
      const ph = rect(phone), t = rect(trash);
      const out = d.out || !inside(ph, nx + d.offX, ny + d.offY, EDGE) || distTo(t, nx, ny) < TRASH_NEAR;
      if (out) {
        decide('account');
        account.classList.remove('is-lifted');
        apply('account');
        throwAccountAway(d.g);
      } else goBack('account', d.g);
      return;
    }
    const z = rect(p.zone);
    if (distTo(z, d.px, d.py) < NEAR || distTo(z, nx, ny) < NEAR) {
      decide(d.id);
      land(d.id, d.g);
    } else {
      if (focus === d.g) focus = null;
      goBack(d.id, d.g);
    }
  }

  // Something took the pointer away (another window, a cancelled touch, Esc): the piece goes home.
  function cancelGesture() {
    const d = drag;
    press = null;
    drag = null;
    if (!d) return;
    clearDragMarks(d);
    if (focus === d.g) focus = null;
    goBack(d.id, d.g);
    paint();
  }

  function onPointerMove(e) {
    if (!press || e.pointerId !== press.pointerId) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) { // the release happened where we could not hear it
      if (drag) release();
      else press = null;
      return;
    }
    const x = e.clientX / scale, y = e.clientY / scale;
    if (!drag) {
      if (Math.hypot(x - press.x, y - press.y) < 4) return;
      beginDrag(x, y);
    }
    const now = performance.now();
    const dt = now - drag.lastT;
    if (drag.lastT && dt > 0 && dt < 80) {
      drag.vx = drag.vx * 0.4 + ((x - drag.px) / dt) * 0.6;
      drag.vy = drag.vy * 0.4 + ((y - drag.py) / dt) * 0.6;
    }
    drag.lastT = now;
    drag.px = x;
    drag.py = y;
  }

  function onPointerUp(e) {
    if (!press || e.pointerId !== press.pointerId) return;
    release();
  }

  // ---------- finish ----------
  function fireFinish() {
    const detail = { moves: moves.slice() };
    document.dispatchEvent(new CustomEvent('design:finish', { detail }));
    if (window.parent === window) return;
    try {
      window.parent.document.dispatchEvent(new window.parent.CustomEvent('design:finish', { detail }));
    } catch (err) { /* a parent on another origin has no document to reach */ }
  }

  function finish() {
    if (finishing) return;
    finishing = true;
    select(null);
    toast.classList.add('on');
    finishBtn.textContent = 'Finished';
    finishBtn.classList.add('is-done');
    setTimeout(fireFinish, calm ? 300 : FINISH_DELAY);
    setTimeout(() => {
      toast.classList.remove('on');
      finishBtn.textContent = 'Finish';
      finishBtn.classList.remove('is-done');
      finishing = false;
    }, FINISH_HOLD);
  }

  // ---------- wiring ----------
  // The frame beside the phone keeps the first state in view, so the before and the after sit side by side.
  function buildOriginal() {
    const copy = scr.cloneNode(true);
    [copy, ...$$('*', copy)].forEach((el) => ['id', 'data-layer', 'data-flip', 'role', 'tabindex', 'aria-label'].forEach((a) => el.removeAttribute(a)));
    $('.orig-phone', original).appendChild(copy);
  }

  buildOriginal();
  buildLayers();

  Object.keys(PIECES).forEach((id) => {
    const el = PIECES[id].tile || account;
    el.addEventListener('pointerdown', (e) => {
      if (id === 'account' && !done.account) select('account');
      else if (done[id] && shown[id] && id !== 'account') select(PIECES[id].layer);
      pressPiece(e, id);
    });
    el.addEventListener('click', (e) => { if (e.detail === 0) perform(id); }); // keyboard and scripted clicks
    if (PIECES[id].tile) {
      el.addEventListener('pointerenter', () => { if (!done[id]) setHover(PIECES[id].layer); });
      el.addEventListener('pointerleave', () => setHover(null));
    }
  });
  account.addEventListener('keydown', (e) => { if (e.key === 'Enter') perform('account'); });

  phone.addEventListener('pointerover', (e) => {
    if (press || drag) return;
    const hit = e.target.closest('[data-layer]');
    setHover(hit ? hit.dataset.layer : null);
  });
  phone.addEventListener('pointerleave', () => setHover(null));
  phone.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const hit = e.target.closest('[data-layer]');
    if (hit && hit !== account) select(hit.dataset.layer);
  });
  $('.canvas').addEventListener('pointerdown', (e) => { if (e.target === e.currentTarget) select(null); });
  finishBtn.addEventListener('click', finish);

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', (e) => { if (press && e.pointerId === press.pointerId) cancelGesture(); });
  window.addEventListener('blur', cancelGesture);
  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelGesture(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (press || drag)) cancelGesture(); });

  // No focus from the mouse, no native drags or menus: the keys and the stage stay clean.
  document.addEventListener('mousedown', (e) => e.preventDefault());
  document.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  // Space belongs to the deck: it must never press whatever has the keyboard focus here.
  ['keydown', 'keyup'].forEach((type) => document.addEventListener(type, (e) => {
    if (e.key === ' ' && e.target.closest && e.target.closest('button,[role="button"]')) e.preventDefault();
  }, true));

  fit();
  select('frame');
  // The fonts never hold up the first paint on a slow network; when they arrive, the frames fit themselves again.
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { paint(); paintInspector(); });
})();
