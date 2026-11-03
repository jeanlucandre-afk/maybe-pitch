/* MAYBE live design editor: three moves on a DICE checkout, each by drag or by click, in any order, and a final.
 * The deck shows it in an iframe at 1440x810, so ← → Space and the numbers stay with the deck.
 * Nothing starts until window.MAYBE_EDITOR.start(): the opening, then the CEO's cursor. The careers screen loads this page
 * in an iframe before showing it, so there it waits for the call; opened on its own, it starts by itself. A second call does nothing.
 * start({ skipOpening: true }) goes straight to the CEO's cursor, for a screen whose own curtain has already said the line.
 * Finish completes whatever is missing, plays the final and only then fires design:finish, once, on document and on
 * the parent's document when it is same-origin. detail.moves lists the moves the person made, in order:
 * 'price-with-fees', 'buy-button', 'remove-account'. The ones the final completed are not in the list.
 * window.MAYBE_EDITOR.reset() returns to the state before start() without a reload. */
(function () {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = (ms) => (calm ? Math.min(ms, 90) : ms);

  const NEAR = 130; // a drop this close to its place counts
  const CAPTURE = 52; // this close, the piece snaps to its place like a magnet
  const EDGE = 60; // the account step counts as out once its centre is this close to the edge of the phone
  const TRASH_NEAR = 56;
  const PRICE_ENTRY = 1.45; // the price lands this big and settles
  const DROP = 74; // the button falls from this high
  const OPENING_HOLD = 1200; // the line stands alone this long; its fade closes the 1.5 s
  const OPENING_END = 1500;
  const STRIP = 28;
  const CLOSE_UP = 1.5; // how close the final gets to the button
  const TICKET_OVER = 8; // how far the landed ticket lies over the phone: over the edge, never over its words
  const TICKET_SWING = 6; // the little extra of its landing, which must not reach the words either
  const BUY_LABEL = 'Buy ticket · €93.50';
  const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
  const EASE_MOVE = 'cubic-bezier(.3,.7,.2,1)';
  // The final, in ms: under 4 s from the click even with moves to complete.
  const BEATS = calm
    ? { auto: 140, push: 100, enter: 100, tap: 140, feed: 160, head: 120, land: 100, hold: 560 }
    : { auto: 400, push: 620, enter: 400, tap: 300, feed: 720, head: 520, land: 340, hold: 600 };

  const root = document.documentElement;
  const alone = window.parent === window;
  const app = $('#app'), rig = $('#rig'), phone = $('#phone'), scr = $('#screen'), overlay = $('#overlay');
  const ticketRow = $('#ticket-row'), oldPrice = $('#old-price'), newPrice = $('#new-price');
  const account = $('#account'), continueBtn = $('#continue'), buy = $('#buy'), buyLabel = $('#buy-label');
  const hero = $('#hero'), sheet = $('#sheet');
  const trash = $('#trash'), finishBtn = $('#finish'), layersBox = $('#layers');
  const selBox = $('#sel'), selTag = $('#sel-tag'), selSize = $('#sel-size'), hovBox = $('#hov'), zoneBox = $('#zone'), guides = $('#guides');
  const saved = $('#saved'), savedText = $('#saved-text');
  const frameLabel = $('#frame-label'), comment = $('#comment'), commentText = $('#comment-text'), orig = $('#orig');
  const ceo = $('#ceo'), ceoInner = $('#ceo-inner'), phoneDim = $('#phone-dim');
  const slot = $('#slot'), ticket = $('#ticket'), ticketCover = $('#ticket-cover'), ticketFlash = $('#ticket-flash');
  const opening = $('#opening'), pinsBox = $('#pins');
  const props = $('#props'), assets = $('#assets'), tabs = $$('.tab');
  const P = { icon: $('#p-icon'), name: $('#p-name'), kind: $('#p-kind'), x: $('#p-x'), y: $('#p-y'), w: $('#p-w'), h: $('#p-h'), auto: $('#p-auto'), radius: $('#p-radius'), fill: $('#p-fill'), swatch: $('#p-swatch') };

  const IDS = ['price', 'buy', 'account'];
  const PIECES = {
    price: { label: 'Price with fees', move: 'price-with-fees', layer: 'price', tile: $('#tile-price'), target: newPrice, zone: ticketRow, dim: oldPrice },
    buy: { label: 'Buy button', move: 'buy-button', layer: 'cta', tile: $('#tile-buy'), target: buy, zone: buy, dim: continueBtn },
    account: { label: 'Create an account', move: 'remove-account', layer: 'account', target: account }
  };
  PIECES.price.mini = $('.mini', PIECES.price.tile);
  PIECES.buy.mini = $('.mini', PIECES.buy.tile);
  const TILE_LABELS = { price: PIECES.price.tile.getAttribute('aria-label'), buy: PIECES.buy.tile.getAttribute('aria-label') };

  // The whole file, as the tree on the left. auto is the auto layout the properties show; ink, a layer whose fill is its text.
  const LAYERS = [
    { id: 'frame', name: 'Your redesign', icon: 'i-frame', kind: 'Frame', depth: 0 },
    { id: 'header', name: 'Header', icon: 'i-frame', kind: 'Frame', depth: 1, parent: 'frame', auto: 'Vertical' },
    { id: 'hero', name: 'Hero', icon: 'i-frame', kind: 'Frame', depth: 1, parent: 'frame', image: true },
    { id: 'photo', name: 'Festival photo', icon: 'i-image', kind: 'Image', depth: 2, parent: 'hero', image: true },
    { id: 'title', name: 'Berlin Summer Festival', icon: 'i-type', kind: 'Text', depth: 2, parent: 'hero', ink: true },
    { id: 'row', name: 'Ticket row', icon: 'i-frame', kind: 'Frame', depth: 1, parent: 'frame', auto: 'Horizontal' },
    { id: 'kind', name: 'General admission', icon: 'i-type', kind: 'Text', depth: 2, parent: 'row', ink: true },
    { id: 'price', name: '€89 excl. fee', icon: 'i-type', kind: 'Text', depth: 2, parent: 'row', ink: true },
    { id: 'account', name: 'Create an account', icon: 'i-frame', kind: 'Frame', depth: 1, parent: 'frame', auto: 'Vertical' },
    { id: 'email', name: 'Email', icon: 'i-rect', kind: 'Rectangle', depth: 2, parent: 'account', auto: 'Horizontal' },
    { id: 'password', name: 'Password', icon: 'i-rect', kind: 'Rectangle', depth: 2, parent: 'account', auto: 'Horizontal' },
    { id: 'cta', name: 'Continue', icon: 'i-rect', kind: 'Rectangle', depth: 1, parent: 'frame' },
    { id: 'before', name: 'Before', icon: 'i-frame', kind: 'Frame', depth: 0, auto: 'Vertical' } // joins the tree with the first move
  ];
  const ACCOUNT_LAYERS = ['account', 'email', 'password'];
  const TAGGED = ['frame', 'hero', 'photo', 'price', 'account', 'cta', 'header'];
  const SIZE_ABOVE = ['header', 'password']; // below them lies text
  const LAYER_ELS = { frame: scr, header: $('.p-top'), hero, photo: hero, title: $('#hero-text'), row: ticketRow, kind: $('#ticket-name'), account, email: $('#field-email'), password: $('#field-password'), before: $('.orig-screen') };

  let started = false; // start() was called
  let live = false; // the opening has lifted: the pieces and Finish answer
  let done = {}; // the move counts
  let shown = {}; // the move is on the phone
  let moves = []; // only the moves the person made
  let layerById = {};
  let collapsed = new Set();
  let flights = {}; // ghosts on their way back, by piece
  let scale = 1;
  let selected = null;
  let hovered = null;
  let focus = null; // the ghost the selection frame follows
  let focusLabel = '';
  let settling = 0; // the placed piece is still landing until this moment
  let press = null; // the pointer is down on a piece
  let drag = null; // the piece is moving
  let finale = false;
  let fired = false;

  // Every timer goes through here, so reset() can stop them all.
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }
  function stopLater(id) {
    clearTimeout(id);
    timers.delete(id);
  }

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
    layersBox.textContent = '';
    layerById = {};
    collapsed = new Set();
    LAYERS.forEach((def) => {
      const l = { ...def };
      const group = LAYERS.some((other) => other.parent === l.id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'layer';
      row.style.setProperty('--d', l.depth);
      row.innerHTML = `<span class="layer-arrow">${group ? '<svg class="i"><use href="#i-chevron"/></svg>' : ''}</span><svg class="i layer-icon"><use href="#${l.icon}"/></svg><span class="layer-name">${l.name}</span>`;
      row.addEventListener('click', (e) => {
        if (group && e.target.closest('.layer-arrow')) toggleGroup(l.id);
        else select(l.id);
      });
      row.addEventListener('pointerenter', () => setHover(l.id));
      row.addEventListener('pointerleave', () => setHover(null));
      layersBox.appendChild(row);
      l.row = row;
      layerById[l.id] = l;
    });
  }

  function syncRows() {
    Object.values(layerById).forEach((l) => {
      let up = l.parent, shut = false;
      while (up && !shut) { shut = collapsed.has(up); up = layerById[up].parent; }
      l.row.hidden = shut || (l.id === 'before' && !orig.classList.contains('on'));
      l.row.classList.toggle('is-collapsed', collapsed.has(l.id));
    });
  }

  function toggleGroup(id) {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    syncRows();
  }

  function flipRows(mutate) {
    const rows = Object.values(layerById).filter((l) => l.row.isConnected && !l.row.hidden).map((l) => l.row);
    const before = new Map(rows.map((row) => [row, row.getBoundingClientRect().top]));
    mutate();
    rows.forEach((row) => {
      if (!row.isConnected || row.hidden) return;
      const dy = (before.get(row) - row.getBoundingClientRect().top) / scale;
      if (Math.abs(dy) < 0.5) return;
      row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: D(320), easing: EASE_MOVE });
    });
  }

  function turnIntoInstance(id, name) {
    const l = layerById[id];
    l.name = name;
    l.kind = 'Instance';
    l.icon = 'i-diamond';
    l.row.classList.add('is-instance');
    $('.layer-icon use', l.row).setAttribute('href', '#i-diamond');
    $('.layer-name', l.row).textContent = name;
    l.row.animate([{ backgroundColor: '#7c3aed' }, {}], { duration: D(700), easing: 'ease-out' });
  }

  // ---------- selection and hover ----------
  function layerEl(id) {
    if (id === 'price') return shown.price ? newPrice : oldPrice;
    if (id === 'cta') return shown.buy ? buy : continueBtn;
    if (shown.account && ACCOUNT_LAYERS.includes(id)) return null;
    return LAYER_ELS[id];
  }

  // The hero runs on under the white sheet: only what shows of it counts.
  function frameOf(id) {
    const el = layerEl(id);
    if (!el) return null;
    const r = rect(el);
    if (el !== hero) return r;
    const bottom = Math.min(r.bottom, rect(sheet).top);
    return { ...r, bottom, height: bottom - r.top, cy: (r.top + bottom) / 2 };
  }

  function select(id) {
    selected = id;
    let up = id && layerById[id].parent;
    while (up) { collapsed.delete(up); up = layerById[up].parent; }
    syncRows();
    Object.values(layerById).forEach((l) => l.row.classList.toggle('is-selected', l.id === id));
    paint();
    props.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: D(220), easing: 'ease-out' });
  }

  function setHover(id) {
    hovered = id;
    Object.values(layerById).forEach((l) => l.row.classList.toggle('is-hover', l.id === id));
    paintHover();
  }

  function paintSelection() {
    const r = focus ? rect(focus.el) : selected && frameOf(selected);
    selBox.classList.toggle('on', Boolean(r));
    frameLabel.style.visibility = !focus && (selected === 'frame' || selected === 'header') ? 'hidden' : 'visible';
    if (!r) return;
    setBox(selBox, r.left, r.top, r.width, r.height);
    selTag.textContent = focus ? focusLabel : layerById[selected].name;
    const landing = performance.now() < settling; // a piece on its way down would drag its labels over the words above it
    selTag.style.display = !landing && (focus || TAGGED.includes(selected)) ? '' : 'none'; // inside a tight stack a name would cover its neighbour: there, the size says enough
    selSize.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
    // Nothing to measure yet while a piece flies or settles; a pin takes the place above Continue, and the row has no free side at all.
    selBox.classList.toggle('is-moving', Boolean(focus) || landing || selected === 'row');
    selBox.classList.toggle('is-tight', !focus && (SIZE_ABOVE.includes(selected) || (selected === 'cta' && shown.buy) || r.bottom + 34 > app.offsetHeight));
    selBox.classList.toggle('is-inset', !focus && (selected === 'hero' || selected === 'photo'));
  }

  function paintHover() {
    const r = hovered && !press && !drag && !finale && hovered !== selected && frameOf(hovered);
    hovBox.classList.toggle('on', Boolean(r));
    if (!r) return;
    setBox(hovBox, r.left, r.top, r.width, r.height);
    hovBox.style.borderRadius = getComputedStyle(layerEl(hovered)).borderTopLeftRadius;
  }

  // ---------- properties: read from the real elements, so they change with every move ----------
  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  const toHex = (color) => `#${color.match(/[\d.]+/g).slice(0, 3).map((n) => Math.round(+n).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

  function paintFill(l, el) {
    if (l && l.image) {
      setText(P.fill, 'Image');
      P.swatch.style.backgroundColor = '';
      P.swatch.style.backgroundImage = 'url(img/dice-festival.jpg)';
      return;
    }
    const source = !l ? app : l.ink ? $('b', el) || el : el;
    const style = getComputedStyle(source);
    const color = l && l.ink ? style.color : style.backgroundColor;
    if (/,\s*0\)$/.test(color)) return; // lifted, the step leaves an empty outline: its fill stays what it was
    setText(P.fill, toHex(color));
    P.swatch.style.backgroundImage = 'none';
    P.swatch.style.backgroundColor = color;
  }

  function autoLayoutOf(l) {
    if (l.id === 'price') return shown.price ? 'Vertical' : 'Off';
    if (l.id === 'cta') return shown.buy ? 'Horizontal' : 'Off';
    return l.auto || 'Off';
  }

  function paintProps() {
    if (finale) return;
    const l = selected && layerById[selected];
    const r = l && frameOf(selected);
    props.classList.toggle('is-page', !r);
    if (!r) {
      P.icon.setAttribute('href', '#i-rect');
      setText(P.name, 'Page 1');
      setText(P.kind, 'Page');
      paintFill(null);
      return;
    }
    const s = rect(scr), el = layerEl(selected);
    P.icon.setAttribute('href', `#${l.icon}`);
    setText(P.name, l.name);
    setText(P.kind, l.kind);
    setText(P.x, String(Math.round(r.left - s.left)));
    setText(P.y, String(Math.round(r.top - s.top)));
    setText(P.w, String(Math.round(r.width)));
    setText(P.h, String(Math.round(r.height)));
    setText(P.auto, autoLayoutOf(l));
    setText(P.radius, String(Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius)) || 0));
    paintFill(l, el);
  }

  function showTab(name) {
    tabs.forEach((tab) => {
      const on = tab.dataset.tab === name;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', String(on));
    });
    props.hidden = name !== 'design';
    assets.hidden = name !== 'assets';
  }

  function paint() {
    paintSelection();
    paintHover();
    paintProps();
  }

  // Keep the frames on the moving elements while the layout animates.
  let trackUntil = 0, tracking = false, trackTimer = 0;
  function track(ms) {
    trackUntil = Math.max(trackUntil, performance.now() + ms);
    if (!tracking) { tracking = true; requestAnimationFrame(trackTick); }
    stopLater(trackTimer);
    trackTimer = later(paint, ms + 40);
  }
  function trackTick(now) {
    paint();
    if (now < trackUntil) requestAnimationFrame(trackTick);
    else tracking = false;
  }

  // ---------- saved ----------
  let savedTimer = 0, freshTimer = 0;
  function markSaved() {
    saved.classList.add('is-saving');
    saved.classList.remove('is-fresh');
    savedText.textContent = 'Saving…';
    stopLater(savedTimer);
    stopLater(freshTimer);
    savedTimer = later(() => {
      saved.classList.remove('is-saving');
      saved.classList.add('is-fresh');
      savedText.textContent = 'Saved';
      freshTimer = later(() => saved.classList.remove('is-fresh'), 900);
    }, calm ? 1 : 520);
  }

  // ---------- effects ----------
  // A brief violet flash around an element. In the final it rides on the rig, in the rig's own units.
  function flash(el, delay = 0) {
    const onRig = app.classList.contains('is-finale');
    const r = rect(el);
    const base = onRig ? rect(rig) : { left: 0, top: 0, width: 1 };
    const k = onRig ? base.width / rig.offsetWidth : 1;
    const f = document.createElement('div');
    f.className = 'flash';
    f.style.cssText = `left:${(r.left - base.left) / k}px;top:${(r.top - base.top) / k}px;width:${r.width / k}px;height:${r.height / k}px;border-radius:${getComputedStyle(el).borderTopLeftRadius}`;
    (onRig ? rig : overlay).appendChild(f);
    f.animate([{ opacity: 0, transform: 'scale(.98)' }, { opacity: 1, offset: 0.24 }, { opacity: 0, transform: 'scale(1.09)' }], { duration: D(640), delay: D(delay), easing: 'ease-out', fill: 'both' });
    later(() => f.remove(), D(delay) + D(640) + 60);
  }

  function enterPrice() {
    newPrice.animate([{ transform: `scale(${PRICE_ENTRY})` }, { transform: 'none' }], { duration: D(440), easing: EASE_OUT });
  }

  function dropButton() {
    flash(buy, 240); // measured first: the fall moves the button
    buy.animate([
      { transform: `translateY(${-DROP}px)`, easing: 'cubic-bezier(.55,0,1,.7)' },
      { transform: 'translateY(0) scale(1.03,.92)', offset: 0.48, easing: 'cubic-bezier(0,.6,.5,1)' },
      { transform: 'translateY(-11px)', offset: 0.7, easing: 'cubic-bezier(.5,0,1,.6)' },
      { transform: 'translateY(0) scale(1.01,.98)', offset: 0.86, easing: 'cubic-bezier(0,.5,.5,1)' },
      { transform: 'none' }
    ], { duration: D(500) });
  }

  // The first move brings the original out from behind the phone, small: until then there is only one phone.
  function showBefore() {
    if (finale || orig.classList.contains('on')) return;
    orig.classList.add('on');
    orig.animate([{ transform: 'translateX(150px) scale(.92)' }, { transform: 'none' }], { duration: D(460), easing: EASE_OUT });
    syncRows();
    layerById.before.row.animate([{ backgroundColor: '#7c3aed' }, {}], { duration: D(700), easing: 'ease-out' });
  }

  // ---------- the moves ----------
  function placeTile(id) {
    const tile = PIECES[id].tile;
    if (!tile) return;
    tile.classList.add('is-placed');
    tile.removeAttribute('aria-label');
  }

  function decide(id) {
    if (done[id]) return;
    done[id] = true;
    moves.push(PIECES[id].move);
    placeTile(id);
  }

  // Puts a decided move on the phone: its pin goes, its step gets its check.
  function apply(id) {
    if (shown[id]) return;
    shown[id] = true;
    scr.classList.add(`done-${id}`);
    $(`#pin-${id}`).classList.add('is-fixed');
    $(`#step-${id}`).classList.add('is-done');
    showBefore();
    if (IDS.every((m) => shown[m])) {
      comment.classList.add('is-resolved');
      finishBtn.classList.add('is-ready');
    }
    settling = performance.now() + D(id === 'account' ? 0 : 520);
    if (id === 'price') {
      turnIntoInstance('price', 'Price with fees');
      enterPrice();
      if (!finale) select('price');
    } else if (id === 'buy') {
      turnIntoInstance('cta', 'Buy button');
      dropButton();
      if (!finale) select('cta');
    } else {
      flipRows(() => ACCOUNT_LAYERS.forEach((l) => layerById[l].row.remove()));
      if (!finale) select('hero'); // the room the step leaves goes to the hero: watch its H grow
    }
    if (!finale) showTab('design');
    markSaved();
    track(720);
  }

  // ---------- ghosts: the copy of a piece that moves over everything ----------
  function makeGhost(id) {
    const target = PIECES[id].target;
    const r = rect(target);
    const el = target.cloneNode(true);
    ['id', 'data-layer', 'role', 'tabindex', 'aria-label'].forEach((a) => el.removeAttribute(a));
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
    const anim = g.el.animate(frames, { duration: D(ms), easing, fill: 'forwards' });
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      stopLater(timer);
      if (focus === g) focus = null;
      g.el.remove();
      end();
      paint();
    };
    const timer = later(finish, ms + 90);
    anim.onfinish = finish;
    track(ms + 40);
    return { stop() { over = true; stopLater(timer); anim.cancel(); if (focus === g) focus = null; g.el.remove(); } };
  }

  // Where a piece flies before the real one takes over: the price big, the button up in the air.
  function landingPose(id, g) {
    const t = rect(PIECES[id].target);
    return id === 'price' ? transformFor(g, t.cx - (t.width * (PRICE_ENTRY - 1)) / 2, t.cy, PRICE_ENTRY) : transformFor(g, t.cx, t.cy - DROP, 1);
  }

  function land(id, g) {
    const p = PIECES[id];
    g.el.classList.add('is-landing');
    follow(g, p.label);
    if (id === 'price') flash(ticketRow);
    fly(g, landingPose(id, g), 170, EASE_OUT, false, () => {
      apply(id);
      p.mini.classList.remove('is-lifted');
    });
  }

  function goBack(id, g) {
    const p = PIECES[id];
    if (id === 'account') {
      scr.classList.remove('done-account');
      track(600);
      const t = rect(account);
      flights[id] = fly(g, transformFor(g, t.cx, t.cy, 1), 240, EASE_MOVE, false, () => {
        delete flights[id];
        account.classList.remove('is-lifted');
      });
    } else {
      const t = rect(p.mini);
      flights[id] = fly(g, transformFor(g, t.cx, t.cy, t.width / g.w), 260, EASE_MOVE, false, () => {
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
    if (!live || finale) return;
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
    const from = rect(p.mini);
    const g = makeGhost(id);
    place(g, from.cx, from.cy, from.width / g.w);
    decide(id);
    follow(g, p.label);
    if (id === 'price') flash(ticketRow, 170);
    fly(g, landingPose(id, g), 320, 'cubic-bezier(.3,.9,.3,1)', false, () => apply(id));
  }

  // ---------- drag ----------
  function pressPiece(e, id) {
    if (e.button !== 0 || !live || finale) return;
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
        scr.classList.toggle('done-account', out);
      }
      trash.classList.toggle('is-near', nearTrash);
      focusLabel = out ? 'Release to remove' : p.label;
      sx = t.cx;
      sy = t.cy;
      pullTo = nearTrash ? 1 : 0;
      kTo = nearTrash ? 0.36 : 1;
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
    place(d.g, fx + (sx - fx) * d.pull, fy + (sy - fy) * d.pull, d.k);
    d.g.el.classList.toggle('is-landing', d.snapped);
    paintSelection();
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

  // ---------- the CEO in the room ----------
  function moveCeo(x, y, ms, easing) {
    const from = getComputedStyle(ceo).transform;
    const to = `translate(${x}px, ${y}px)`;
    ceo.getAnimations().filter((a) => a.id === 'ceo-move').forEach((a) => a.cancel());
    ceo.style.transform = to;
    const a = ceo.animate([{ transform: from === 'none' ? to : from }, { transform: to }], { duration: D(ms), easing });
    a.id = 'ceo-move';
  }

  // The cursor comes up from below the stage, the one side with no panel in its way, to the corner of its comment.
  function startCeo() {
    if (finale) return;
    if (!rig.offsetHeight) { later(startCeo, 100); return; } // an iframe still display:none has no layout to aim at
    const x = comment.offsetLeft + 3, y = comment.offsetTop + comment.offsetHeight + 7;
    ceo.style.transform = `translate(${x + 70}px, ${rig.offsetHeight + 90}px)`;
    ceo.classList.remove('is-idle');
    ceo.classList.add('on');
    moveCeo(x, y, 860, EASE_OUT);
    later(() => {
      if (finale) return;
      comment.classList.add('on');
      ceo.classList.add('is-idle');
    }, D(700));
  }

  // ---------- the start ----------
  function goLive() {
    live = true;
    opening.classList.add('is-gone');
    pinsBox.classList.add('on');
  }

  function start(options) {
    if (started) return;
    started = true;
    if (options && options.skipOpening) {
      goLive();
      startCeo();
      return;
    }
    opening.classList.add('is-playing');
    later(goLive, OPENING_HOLD);
    later(startCeo, OPENING_END);
  }

  // ---------- finish ----------
  function fireFinish() {
    if (fired) return;
    fired = true;
    const detail = { moves: moves.slice() };
    document.dispatchEvent(new CustomEvent('design:finish', { detail }));
    if (alone) return;
    try {
      window.parent.document.dispatchEvent(new window.parent.CustomEvent('design:finish', { detail }));
    } catch (err) { /* a parent on another origin has no document to reach */ }
  }

  // The final completes a move the person left undone, quickly and off the record.
  function autoMove(id) {
    if (flights[id]) { flights[id].stop(); delete flights[id]; }
    (PIECES[id].mini || account).classList.remove('is-lifted');
    done[id] = true;
    placeTile(id);
    if (id === 'account') {
      const r = rect(account);
      const g = makeGhost('account');
      place(g, r.cx, r.cy, 1);
      fly(g, transformFor(g, r.cx, r.cy, 0.92), 220, 'ease-out', true, () => {});
    }
    if (id === 'price') flash(ticketRow);
    apply(id);
  }

  function setBuyLabel(html) {
    buyLabel.innerHTML = html;
    buyLabel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D(180), easing: 'ease-out' });
  }

  function tapBuy(x, y) {
    ceo.classList.remove('is-idle');
    ceoInner.animate([{ transform: 'scale(1)' }, { transform: 'scale(.72)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: D(280), easing: 'ease-out' });
    const ring = document.createElement('i');
    ring.className = 'tap-ring';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    rig.appendChild(ring);
    ring.animate([{ opacity: 1, transform: 'scale(.3)' }, { opacity: 1, offset: 0.35 }, { opacity: 0, transform: 'scale(4.6)' }], { duration: D(600), easing: 'ease-out', fill: 'forwards' });
    later(() => ring.remove(), D(600) + 40);
    flash(buy);
    buy.animate([{ transform: 'none' }, { transform: 'scale(.92)', offset: 0.3 }, { transform: 'scale(1.05)', offset: 0.65 }, { transform: 'none' }], { duration: D(380), easing: 'ease-out' });
    later(() => setBuyLabel('Printing ticket…'), D(140));
    later(() => {
      moveCeo(x - 300, y + 300, 460, 'ease-in');
      ceo.classList.remove('on');
    }, D(280));
  }

  // Blank paper feeds out of the phone in short bursts, as a printer does.
  function feedPaper() {
    slot.classList.add('on');
    if (calm) {
      ticket.style.transform = 'none';
      ticket.animate([{ opacity: 0 }, { opacity: 1 }], { duration: BEATS.feed, easing: 'ease-out' });
      return;
    }
    const steps = 6;
    const frames = [{ transform: 'translateX(-100%)', offset: 0, easing: 'cubic-bezier(.3,0,.3,1)' }];
    for (let i = 1; i <= steps; i++) {
      const at = `translateX(${-100 + (100 * i) / steps}%)`;
      if (i < steps) frames.push({ transform: at, offset: (i - 0.2) / steps, easing: 'linear' }, { transform: at, offset: i / steps, easing: 'cubic-bezier(.3,0,.3,1)' });
      else frames.push({ transform: at, offset: 1 });
    }
    ticket.animate(frames, { duration: BEATS.feed, fill: 'forwards' });
  }

  // A violet print head writes the ticket, in reading order.
  function printInk() {
    ticketCover.animate([{ transform: 'none' }, { transform: 'translateX(102%)' }], { duration: BEATS.head, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'forwards' });
  }

  // The ticket comes free, drops in front of the phone and takes the light.
  function landTicket() {
    slot.classList.add('is-free');
    slot.animate([
      { transform: 'rotate(-2.5deg)' },
      { transform: `translateX(${-TICKET_OVER - TICKET_SWING}px) rotate(.9deg) scale(1.02)`, offset: 0.58 },
      { transform: `translateX(${-TICKET_OVER}px) rotate(-1deg)` }
    ], { duration: BEATS.land, easing: 'ease-out', fill: 'forwards' });
    phoneDim.animate([{ opacity: 0 }, { opacity: 0.45 }], { duration: BEATS.land, easing: 'ease-out', fill: 'forwards' }); // its words stay above 4.5:1
    ticketFlash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: D(600), easing: 'ease-out' });
    setBuyLabel('<svg class="i"><use href="#i-check"/></svg>Ticket printed');
  }

  function stageFinale() {
    focus = null;
    hovered = null;
    paint();
    app.classList.add('is-finale');
    const W = app.offsetWidth, H = app.offsetHeight, w = rig.offsetWidth, h = rig.offsetHeight;
    const r = rect(rig), b = rect(buy);
    const pose = (cx, cy, k) => `translate(${cx - r.cx}px, ${cy - r.cy}px) scale(${k})`;
    // First a close-up on the button. Then the camera pulls back, for the phone whole and the ticket.
    const closeUp = pose(W / 2, H * 0.72 - (b.cy - r.cy) * CLOSE_UP, CLOSE_UP);
    const kAside = (H - STRIP - 24) / h;
    const pair = (w + slot.offsetWidth - 14 - TICKET_OVER) * kAside;
    const aside = pose((W - pair) / 2 + (w * kAside) / 2, STRIP + (H - STRIP) / 2, kAside);
    const tapX = b.cx - r.left, tapY = b.cy - r.top + 16;

    rig.animate([{ transform: 'none' }, { transform: closeUp }], { duration: BEATS.push, easing: EASE_OUT, fill: 'forwards' });
    ceo.classList.add('on');
    ceo.classList.remove('is-idle');

    let t = Math.max(0, BEATS.push - 140);
    later(() => moveCeo(tapX, tapY, BEATS.enter, EASE_MOVE), t);
    t += BEATS.enter;
    later(() => tapBuy(tapX, tapY), t);
    t += BEATS.tap;
    later(() => {
      feedPaper();
      rig.animate([{ transform: closeUp }, { transform: aside }], { duration: BEATS.feed + 80, easing: EASE_MOVE, fill: 'forwards' });
    }, t);
    t += BEATS.feed;
    later(printInk, t);
    t += BEATS.head;
    later(landTicket, t);
    t += BEATS.land + BEATS.hold;
    later(fireFinish, t);
  }

  function finish() {
    if (!live || finale) return;
    finale = true;
    app.classList.add('is-locked');
    cancelGesture();
    select(null);
    const missing = IDS.filter((id) => !done[id]);
    missing.forEach(autoMove);
    const settling = missing.length > 0 || IDS.some((id) => !shown[id]);
    if (settling) later(stageFinale, BEATS.auto);
    else stageFinale();
  }

  // ---------- back to the state before start(), without a reload ----------
  function reset() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    app.classList.add('no-anim');
    document.getAnimations().forEach((a) => a.cancel());
    Object.values(flights).forEach((f) => f.stop());
    $$('.ghost,.flash,.tap-ring', app).forEach((el) => el.remove());
    started = false;
    live = false;
    done = {};
    shown = {};
    moves = [];
    flights = {};
    press = null;
    drag = null;
    focus = null;
    hovered = null;
    finale = false;
    fired = false;
    trackUntil = 0;
    settling = 0;

    root.classList.remove('is-dragging');
    app.classList.remove('is-finale', 'is-locked');
    IDS.forEach((id) => {
      scr.classList.remove(`done-${id}`);
      $(`#pin-${id}`).classList.remove('is-fixed');
      $(`#step-${id}`).classList.remove('is-done');
    });
    opening.classList.remove('is-gone', 'is-playing');
    pinsBox.classList.remove('on');
    orig.classList.remove('on');
    comment.classList.remove('on', 'is-resolved');
    ceo.classList.remove('on', 'is-idle');
    ceo.style.transform = '';
    slot.classList.remove('on', 'is-free');
    ticket.style.transform = '';
    buyLabel.textContent = BUY_LABEL;
    finishBtn.classList.remove('is-ready');
    trash.classList.remove('is-armed', 'is-near');
    zoneBox.classList.remove('on', 'is-near');
    guides.classList.remove('on');
    oldPrice.classList.remove('is-dim');
    continueBtn.classList.remove('is-dim');
    account.classList.remove('is-lifted');
    ['price', 'buy'].forEach((id) => {
      PIECES[id].tile.classList.remove('is-placed');
      PIECES[id].tile.setAttribute('aria-label', TILE_LABELS[id]);
      PIECES[id].mini.classList.remove('is-lifted');
    });
    saved.classList.remove('is-saving', 'is-fresh');
    savedText.textContent = 'Saved';

    buildLayers();
    showTab('design');
    select('frame');
    void app.offsetWidth; // the first state lands at once, with nothing animating back
    app.classList.remove('no-anim');
    if (alone) start();
  }

  // ---------- wiring ----------
  function buildComment() {
    commentText.setAttribute('aria-label', commentText.textContent);
    commentText.innerHTML = commentText.textContent.split(' ').map((word, i) => `<span style="--i:${i}">${word}</span>`).join(' ');
  }

  // A pattern that reads as a QR code and encodes nothing.
  function buildQR() {
    const n = 29;
    const finder = (x, y) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
    let d = finder(0, 0) + finder(n - 7, 0) + finder(0, n - 7);
    let seed = 0x5a3c;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const inFinder = (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
        seed = (seed >> 1) ^ (seed & 1 ? 0xb400 : 0);
        if (!inFinder && seed & 1) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    $('#qr-path').setAttribute('d', d);
  }

  buildComment();
  buildQR();
  buildLayers();

  Object.keys(PIECES).forEach((id) => {
    const el = PIECES[id].tile || account;
    el.addEventListener('pointerdown', (e) => {
      if (!live || finale) return;
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
    if (e.button !== 0 || !live) return;
    const hit = e.target.closest('[data-layer]');
    if (hit && hit !== account) select(hit.dataset.layer);
  });
  $('#canvas').addEventListener('pointerdown', (e) => { if (live && (e.target === e.currentTarget || e.target === rig)) select(null); });
  tabs.forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
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

  window.MAYBE_EDITOR = { start, reset };

  fit();
  select('frame');
  if (alone) start();
  // The fonts never hold up the first paint on a slow network; when they arrive, the frames fit themselves again.
  if (document.fonts) document.fonts.addEventListener('loadingdone', paint);
})();
