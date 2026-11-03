/* MAYBE presentation deck runtime.
 * ← → / PageUp PageDown / Space move · Home End · 1-9 jump · F full screen · P speaker notes
 * Live screens: every [data-live="<screen>"] box gets app/<screen>.html in an iframe when its slide opens.
 * Voice agent: set AGENT_ID below (ElevenLabs Conversational AI). Client tools: goToSlide, nextSlide,
 * prevSlide, openScreen, getCurrentSlide (see agent-prompt.md). */
(function () {
  'use strict';
  const AGENT_ID = '';
  const WIDGET_SRC = 'https://unpkg.com/@elevenlabs/convai-widget-embed@0.20.0/dist/index.js';
  const APP_WIDTH = 1440; // design width of the app screens

  const slides = Array.from(document.querySelectorAll('.deck-slide'));
  const total = slides.length;
  const $ = (s) => document.querySelector(s);
  const cur = $('[data-cur]'), prevBtn = $('[data-prev]'), nextBtn = $('[data-next]');
  const notesPanel = $('[data-notes-panel]');
  let index = -1;

  // ---------- scale the 1920x1080 stage to the window ----------
  function fit() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.documentElement.style.setProperty('--scale', String(s));
  }
  window.addEventListener('resize', fit);
  fit();

  // ---------- live screens ----------
  function mountLive(slide) {
    slide.querySelectorAll('[data-live]').forEach((box) => {
      if (box.querySelector('iframe')) return;
      const screen = box.dataset.live;
      const w = box.clientWidth, h = box.clientHeight;
      const scale = w / APP_WIDTH;
      const f = document.createElement('iframe');
      f.src = `app/${screen}.html`;
      f.title = `Live prototype: ${screen.replace(/-/g, ' ')}`;
      f.style.width = APP_WIDTH + 'px';
      f.style.height = Math.ceil(h / scale) + 'px';
      f.style.transform = `scale(${scale})`;
      f.addEventListener('load', () => {
        box.classList.add('is-live');
        try { f.contentWindow.addEventListener('keydown', onKey); } catch (e) { /* cross-origin: ignore */ }
      });
      box.appendChild(f);
      const badge = document.createElement('span');
      badge.className = 'live-badge';
      badge.textContent = 'Live · click and scroll';
      box.appendChild(badge);
    });
  }

  // ---------- navigation ----------
  function restartAnimations(slide) {
    const root = slide.querySelector('.deck-stage > *');
    if (!root || !root.classList.contains('anim-on')) return;
    root.classList.remove('anim-on');
    void root.offsetWidth; // reflow so the keyframes run again
    root.classList.add('anim-on');
  }

  // Intro video on a slide (canvas boards with video.mb-intro): play when the slide opens, reset when it closes.
  function setIntro(slide, on) {
    // Other slide videos (video[data-play], e.g. the product walkthrough): restart on open, pause on close; data-rate="2" plays at 2x.
    slide && slide.querySelectorAll('video[data-play]').forEach((pv) => {
      if (on) { try { pv.currentTime = 0; } catch (e) {} pv.playbackRate = pv.defaultPlaybackRate = parseFloat(pv.dataset.rate) || 1; const p = pv.play(); if (p && p.catch) p.catch(() => {}); }
      else pv.pause();
    });
    // TikTok cards ([data-tiktok="https://www.tiktok.com/@user/video/123…"]): show the real TikTok in the card while the slide is open.
    // data-autoplay starts it by itself; data-sound keeps its audio (all other clips play muted).
    slide && slide.querySelectorAll('[data-tiktok]').forEach((card) => {
      const id = ((card.getAttribute('data-tiktok') || '').match(/video\/(\d+)/) || [])[1];
      if (!id) return;
      let f = card.querySelector('iframe.tt-embed');
      if (on && !f) {
        f = document.createElement('iframe');
        f.className = 'tt-embed';
        const auto = card.hasAttribute('data-autoplay') ? 1 : 0; // data-autoplay: starts by itself
        f.src = `https://www.tiktok.com/player/v1/${id}?autoplay=${auto}&loop=1&music_info=0&description=0&rel=0`;
        // Only cards with data-sound keep their audio; the rest are muted once the player is ready.
        if (!card.hasAttribute('data-sound')) {
          const mute = () => { try { f.contentWindow.postMessage({ 'x-tiktok-player': true, type: 'mute', value: null }, '*'); } catch (e) {} };
          f._mute = mute;
          f.addEventListener('load', () => [300, 1200, 3000].forEach((t) => setTimeout(mute, t)));
        }
        f.allow = 'autoplay; encrypted-media; fullscreen';
        f.title = 'TikTok video';
        f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;z-index:2';
        card.appendChild(f);
      } else if (!on && f) f.remove();
    });
    const v = slide && slide.querySelector('video.mb-intro');
    if (!v) return;
    const root = slide.querySelector('.deck-stage > *');
    if (root.classList.contains('mb-intro-off')) return;
    clearTimeout(v._t);
    if (on) {
      v._t = setTimeout(() => {
        root.classList.remove('mb-waiting', 'mb-playing');
        void root.offsetWidth;
        root.classList.add('mb-playing');
        try { v.currentTime = 0; } catch (e) {}
        const p = v.play(); if (p && p.catch) p.catch(() => {});
      }, 250);
    } else {
      root.classList.remove('mb-playing'); root.classList.add('mb-waiting');
      v.pause(); try { v.currentTime = 0; } catch (e) {}
    }
  }

  function go(i, { focus = false } = {}) {
    i = Math.max(0, Math.min(total - 1, i));
    if (i === index) return;
    if (slides[index]) { slides[index].classList.remove('is-active'); setIntro(slides[index], false); }
    index = i;
    const s = slides[i];
    s.classList.add('is-active');
    restartAnimations(s);
    setIntro(s, true);
    mountLive(s);
    if (slides[i + 1]) mountLive(slides[i + 1]); // preload the next live screen
    cur.textContent = String(i + 1);
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === total - 1;
    document.title = `${i + 1}. ${s.dataset.title} · MAYBE`;
    history.replaceState(null, '', `#slide-${i + 1}`);
    renderNotes();
    document.dispatchEvent(new CustomEvent('deck:slidechange', { detail: { index: i, slide: s } }));
    if (focus) document.activeElement && document.activeElement.blur && document.activeElement.blur();
  }

  function resolveSlide(v) {
    const str = String(v == null ? '' : v).trim().toLowerCase();
    if (/^\d+$/.test(str)) return parseInt(str, 10) - 1;
    const byId = slides.findIndex((s) => s.id === str || s.id === 'slide-' + str.replace(/^slide-?/, ''));
    if (byId >= 0) return byId;
    return slides.findIndex((s) => (s.dataset.title || '').toLowerCase().includes(str));
  }

  function renderNotes() {
    if (notesPanel.hidden) return;
    const s = slides[index];
    $('[data-notes-title]').textContent = `${index + 1} / ${total} · ${s.dataset.title}`;
    $('[data-notes-text]').textContent = s.dataset.notes || 'No notes for this slide.';
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  }

  function isTyping(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { e.preventDefault(); go(index + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { e.preventDefault(); go(index - 1); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(total - 1); }
    else if (/^[1-9]$/.test(k)) go(parseInt(k, 10) - 1);
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === 'p' || k === 'P') { notesPanel.hidden = !notesPanel.hidden; renderNotes(); }
  }
  document.addEventListener('keydown', onKey);
  prevBtn.addEventListener('click', () => go(index - 1));
  nextBtn.addEventListener('click', () => go(index + 1));
  $('[data-fullscreen]').addEventListener('click', toggleFullscreen);

  // swipe on touch screens (not inside live screens)
  let tx = null;
  document.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 60) go(index + (dx < 0 ? 1 : -1));
  });

  // show controls briefly when the mouse moves
  let uiTimer;
  document.addEventListener('mousemove', () => {
    document.body.classList.add('show-ui');
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => document.body.classList.remove('show-ui'), 1800);
  });

  const start = resolveSlide((location.hash || '#slide-1').slice(1));
  go(start >= 0 ? start : 0);

  // ---------- voice agent ----------
  const agent = $('[data-agent]');
  const agentBtns = Array.from(document.querySelectorAll('[data-agent-open]'));
  const tip = document.getElementById('agent-tip');
  const screens = () => Array.from(document.querySelectorAll('[data-live]')).map((b) => b.dataset.live);

  const clientTools = {
    goToSlide: ({ slide }) => {
      const i = resolveSlide(slide);
      if (i < 0 || i >= total) return `No slide matches "${slide}". There are ${total} slides.`;
      go(i);
      return `Now on slide ${i + 1}: ${slides[i].dataset.title}`;
    },
    nextSlide: () => { go(index + 1); return `Now on slide ${index + 1}: ${slides[index].dataset.title}`; },
    prevSlide: () => { go(index - 1); return `Now on slide ${index + 1}: ${slides[index].dataset.title}`; },
    openScreen: ({ screen }) => {
      const name = String(screen || '').toLowerCase().replace(/\.html$/, '');
      const box = document.querySelector(`[data-live="${CSS.escape(name)}"]`);
      if (!box) return `Unknown screen "${screen}". Available: ${screens().join(', ')}.`;
      const i = slides.indexOf(box.closest('.deck-slide'));
      go(i);
      return `Showing the ${name} screen on slide ${i + 1}.`;
    },
    getCurrentSlide: () => {
      const s = slides[index];
      return JSON.stringify({ number: index + 1, total, id: s.id, title: s.dataset.title, notes: s.dataset.notes || '', screens: Array.from(s.querySelectorAll('[data-live]')).map((b) => b.dataset.live) });
    }
  };

  function disableAgent() {
    agentBtns.forEach((b) => { b.setAttribute('aria-disabled', 'true'); b.title = 'Agent not connected yet'; });
    agentBtns.forEach((b) => b.addEventListener('click', (e) => e.preventDefault()));
  }

  if (!AGENT_ID) {
    disableAgent();
  } else {
    tip.textContent = 'Talk to the MAYBE agent';
    const w = document.createElement('elevenlabs-convai');
    w.setAttribute('agent-id', AGENT_ID);
    w.setAttribute('variant', 'compact');
    document.body.appendChild(w);
    w.addEventListener('elevenlabs-convai:call', (event) => {
      event.detail.config.clientTools = clientTools;
      agent.classList.add('is-on');
    });
    const sc = document.createElement('script');
    sc.src = WIDGET_SRC;
    sc.async = true;
    sc.onerror = () => { tip.textContent = 'Agent could not load'; disableAgent(); };
    document.head.appendChild(sc);
    agentBtns.forEach((b) => b.addEventListener('click', () => {
      const root = w.shadowRoot;
      const btn = root && root.querySelector('button[aria-label*="call" i], button[aria-label*="start" i], button');
      if (btn) btn.click();
    }));
  }

  // TikTok players announce themselves when ready; mute every clip that isn't marked data-sound.
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object' || !d['x-tiktok-player'] || d.type !== 'onPlayerReady') return;
    document.querySelectorAll('iframe.tt-embed').forEach((f) => { if (f.contentWindow === e.source && f._mute) f._mute(); });
  });

  window.MAYBE_DECK = { go, clientTools };
})();
