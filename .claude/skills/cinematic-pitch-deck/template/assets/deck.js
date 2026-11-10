/* deck.js: presentation runtime.
 * Keys: ← → / Space / PageUp PageDown move · Home End · 1-9 jump · F full screen · P speaker notes
 * Every slide open: replays its choreography (.anim-on), sets the progress line, restarts its videos,
 * plays the title intro, mounts live prototype iframes and TikTok players, fires deck:slidechange.
 * Hash #slide-N deep-links. Swipe on touch. Controls appear only when the mouse moves. */
(function () {
  'use strict';
  const APP_WIDTH = 1440; // design width of the screens shown in [data-live] frames
  const slides = Array.from(document.querySelectorAll('.deck-slide'));
  const total = slides.length;
  const $ = (s) => document.querySelector(s);
  const cur = $('[data-cur]'), prevBtn = $('[data-prev]'), nextBtn = $('[data-next]');
  const notesPanel = $('[data-notes-panel]');
  const counted = slides.filter((s) => !s.hasAttribute('data-uncounted'));
  let index = -1;

  function fit() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.documentElement.style.setProperty('--scale', String(s));
  }
  window.addEventListener('resize', fit); fit();

  // progress line: share of the counted slides reached (a black pre-show slide is not counted)
  slides.forEach((s) => {
    const n = counted.indexOf(s) + 1;
    s.style.setProperty('--progress', n > 0 ? (n / counted.length * 100).toFixed(1) + '%' : '0%');
  });

  function replay(slide) {
    const root = slide.querySelector('.slide-root');
    if (!root || root.classList.contains('anim-off')) return;
    root.classList.remove('anim-on'); void root.offsetWidth; root.classList.add('anim-on');
  }

  function media(slide, on) {
    // video[data-play]: restart on open, pause on close; data-rate="2" plays faster
    slide.querySelectorAll('video[data-play]').forEach((v) => {
      if (on) { try { v.currentTime = 0; } catch (e) {} v.playbackRate = v.defaultPlaybackRate = parseFloat(v.dataset.rate) || 1; const p = v.play(); p && p.catch && p.catch(() => {}); }
      else v.pause();
    });
    // title intro: [data-intro] root holds video.intro-video + .intro-black; black until it starts
    const intro = slide.querySelector('[data-intro]');
    if (intro) {
      const v = intro.querySelector('video.intro-video');
      clearTimeout(intro._t);
      if (on && v) {
        intro.classList.remove('intro-playing', 'intro-done');
        intro._t = setTimeout(() => {
          v.addEventListener('loadedmetadata', () => intro.style.setProperty('--intro-len', v.duration + 's'), { once: true });
          if (v.duration) intro.style.setProperty('--intro-len', v.duration + 's');
          intro.classList.add('intro-playing');
          try { v.currentTime = 0; } catch (e) {}
          const p = v.play(); p && p.catch && p.catch(() => intro.classList.add('intro-done'));
        }, 250); // let the cross-fade settle first
        v.onended = () => { intro.classList.remove('intro-playing'); intro.classList.add('intro-done'); };
        v.onerror = () => intro.classList.add('intro-done');
      } else if (v) { v.pause(); try { v.currentTime = 0; } catch (e) {} intro.classList.remove('intro-playing', 'intro-done'); }
    }
    // [data-tiktok="https://www.tiktok.com/@user/video/<id>"]: real player while the slide is open.
    // data-autoplay starts it; data-sound keeps audio (others are muted).
    slide.querySelectorAll('[data-tiktok]').forEach((card) => {
      const id = ((card.getAttribute('data-tiktok') || '').match(/video\/(\d+)/) || [])[1];
      if (!id) return;
      let f = card.querySelector('iframe.tt-embed');
      if (on && !f) {
        f = document.createElement('iframe');
        f.className = 'tt-embed';
        f.src = `https://www.tiktok.com/player/v1/${id}?autoplay=${card.hasAttribute('data-autoplay') ? 1 : 0}&loop=1&music_info=0&description=0&rel=0`;
        if (!card.hasAttribute('data-sound')) {
          f._mute = () => { try { f.contentWindow.postMessage({ 'x-tiktok-player': true, type: 'mute', value: null }, '*'); } catch (e) {} };
          f.addEventListener('load', () => [300, 1200, 3000].forEach((t) => setTimeout(f._mute, t)));
        }
        f.allow = 'autoplay; encrypted-media; fullscreen';
        f.title = 'TikTok video';
        f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;z-index:2';
        card.appendChild(f);
      } else if (!on && f) f.remove();
    });
  }

  function mountLive(slide) {
    slide.querySelectorAll('[data-live]').forEach((box) => {
      if (box.querySelector('iframe')) return;
      const scale = box.clientWidth / APP_WIDTH;
      const f = document.createElement('iframe');
      f.src = box.dataset.live;
      f.title = box.getAttribute('aria-label') || 'Live prototype';
      f.style.width = APP_WIDTH + 'px';
      f.style.height = Math.ceil(box.clientHeight / scale) + 'px';
      f.style.transform = `scale(${scale})`;
      f.addEventListener('load', () => { try { f.contentWindow.addEventListener('keydown', onKey); } catch (e) {} });
      box.appendChild(f);
      const b = document.createElement('span'); b.className = 'live-badge'; b.textContent = 'Live · click and scroll'; box.appendChild(b);
    });
  }

  function go(i) {
    i = Math.max(0, Math.min(total - 1, i));
    if (i === index) return;
    if (slides[index]) { slides[index].classList.remove('is-active'); media(slides[index], false); }
    index = i;
    const s = slides[i];
    s.classList.add('is-active');
    replay(s); media(s, true); mountLive(s);
    if (slides[i + 1]) mountLive(slides[i + 1]); // preload the next live screen
    cur.textContent = String(i + 1);
    prevBtn.disabled = i === 0; nextBtn.disabled = i === total - 1;
    document.title = `${i + 1}. ${s.dataset.title} · ${document.body.dataset.deckTitle || ''}`;
    history.replaceState(null, '', `#slide-${i + 1}`);
    renderNotes();
    document.dispatchEvent(new CustomEvent('deck:slidechange', { detail: { index: i, slide: s } }));
  }

  function renderNotes() {
    if (notesPanel.hidden) return;
    const s = slides[index];
    $('[data-notes-title]').textContent = `${index + 1} / ${total} · ${s.dataset.title}`;
    $('[data-notes-text]').textContent = s.dataset.notes || 'No notes for this slide.';
  }

  const toggleFullscreen = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  const isTyping = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

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

  let tx = null;
  document.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 60) go(index + (dx < 0 ? 1 : -1));
  });

  let uiTimer;
  document.addEventListener('mousemove', () => {
    document.body.classList.add('show-ui'); clearTimeout(uiTimer);
    uiTimer = setTimeout(() => document.body.classList.remove('show-ui'), 1800);
  });

  // mute every TikTok clip without data-sound as soon as its player says it is ready
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object' || !d['x-tiktok-player'] || d.type !== 'onPlayerReady') return;
    document.querySelectorAll('iframe.tt-embed').forEach((f) => { if (f.contentWindow === e.source && f._mute) f._mute(); });
  });

  const m = (location.hash || '').match(/slide-(\d+)/);
  go(m ? parseInt(m[1], 10) - 1 : 0);
  window.DECK = { go, get index() { return index; }, total };
})();
