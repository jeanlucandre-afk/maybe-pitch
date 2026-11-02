/* MAYBE pitch site: slide navigation, reveals, live frames, presenter notes, voice agent. */
(function () {
  'use strict';

  // ElevenLabs agent id. Paste it here to switch the voice agent on.
  const AGENT_ID = '';
  const WIDGET_SRC = 'https://unpkg.com/@elevenlabs/convai-widget-embed@0.20.0/dist/index.js';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slides = Array.from(document.querySelectorAll('.slide'));
  const total = slides.length;
  const bar = document.querySelector('.progress__bar');
  const cur = document.querySelector('[data-current]');
  document.querySelector('[data-total]').textContent = total;
  const dots = document.querySelector('.dots');
  const notes = document.getElementById('notes');
  let index = 0;

  // dots
  slides.forEach((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Slide ${i + 1}: ${s.dataset.title || ''}`);
    b.addEventListener('click', () => go(i));
    li.appendChild(b);
    dots.appendChild(li);
  });
  const dotBtns = Array.from(dots.querySelectorAll('button'));

  function setActive(i) {
    if (i < 0 || i >= total) return;
    index = i;
    cur.textContent = i + 1;
    bar.style.width = ((i + 1) / total * 100) + '%';
    dotBtns.forEach((b, j) => b.setAttribute('aria-current', j === i ? 'true' : 'false'));
    const id = slides[i].id;
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    renderNotes();
  }

  function go(i) {
    i = Math.max(0, Math.min(total - 1, i));
    slides[i].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActive(i);
  }

  function resolveSlide(ref) {
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) return Number(ref) - 1;
    const r = String(ref).toLowerCase().replace(/^#/, '');
    let i = slides.findIndex((s) => s.id === r);
    if (i < 0) i = slides.findIndex((s) => (s.dataset.title || '').toLowerCase().includes(r));
    return i;
  }

  // which slide is in view
  const activeObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && e.intersectionRatio >= 0.55) setActive(slides.indexOf(e.target));
    });
  }, { threshold: [0.55] });
  slides.forEach((s) => activeObs.observe(s));

  // reveal + lazy frames
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      e.target.querySelectorAll('iframe[data-src]').forEach(loadFrame);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px 20% 0px' });
  slides.forEach((s) => revealObs.observe(s));

  // keyboard
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { e.preventDefault(); go(index + 1); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { e.preventDefault(); go(index - 1); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(total - 1); }
    else if (/^[1-9]$/.test(k)) { go(Number(k) - 1); }
    else if (k === '0') { go(9); }
    else if (k === 'f' || k === 'F') { toggleFullscreen(); }
    else if (k === 'p' || k === 'P') { notes.hidden = !notes.hidden; renderNotes(); }
    else if (k === 'Escape' && !notes.hidden) { notes.hidden = true; }
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  function renderNotes() {
    if (notes.hidden) return;
    const s = slides[index];
    notes.querySelector('[data-notes-title]').textContent = `${index + 1} / ${total} · ${s.dataset.title || ''}`;
    notes.querySelector('[data-notes-body]').textContent = s.dataset.notes || 'No notes for this slide.';
  }

  // live frames: scale a 1440px-wide app to the frame width
  const DESIGN_W = 1440;
  function fit(view) {
    const f = view.querySelector('iframe');
    if (!f) return;
    const s = view.clientWidth / DESIGN_W;
    f.style.transform = `scale(${s})`;
    f.style.height = (view.clientHeight / s) + 'px';
  }
  const views = Array.from(document.querySelectorAll('.frame__view'));
  const ro = 'ResizeObserver' in window ? new ResizeObserver((es) => es.forEach((e) => fit(e.target))) : null;
  views.forEach((v) => { fit(v); ro && ro.observe(v); });
  window.addEventListener('resize', () => views.forEach(fit));

  function loadFrame(f) {
    const src = f.dataset.src;
    if (!src) return;
    delete f.dataset.src;
    if (location.protocol === 'file:') { f.src = src; return; }
    fetch(src, { method: 'HEAD' }).then((r) => {
      if (r.ok) { f.src = src; return; }
      missing(f, src);
    }).catch(() => { f.src = src; });
  }
  function missing(f, src) {
    const m = document.createElement('div');
    m.className = 'frame__missing';
    m.textContent = `This screen (${src}) is not published yet.`;
    f.replaceWith(m);
  }

  // parallax on covers
  const par = Array.from(document.querySelectorAll('[data-parallax]'));
  if (!reduce && par.length) {
    let ticking = false;
    const update = () => {
      const vh = window.innerHeight;
      par.forEach((img) => {
        const r = img.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const p = (r.top + r.height / 2 - vh / 2) / vh; // -1..1
        img.style.transform = `translateY(${(-6 - p * 8).toFixed(2)}%)`;
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  // deep link
  const start = resolveSlide((location.hash || '#slide-1').slice(1));
  if (start > 0) requestAnimationFrame(() => go(start)); else setActive(0);

  // ---------- voice agent ----------
  const agent = document.querySelector('[data-agent]');
  const agentBtns = Array.from(document.querySelectorAll('[data-agent-open]'));
  const tip = document.getElementById('agent-tip');

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
      const frame = document.querySelector(`.frame[data-screen="${name}"]`);
      if (!frame) return `Unknown screen "${screen}". Available: ${Array.from(document.querySelectorAll('.frame[data-screen]')).map((f) => f.dataset.screen).join(', ')}.`;
      const i = slides.indexOf(frame.closest('.slide'));
      go(i);
      return `Showing the ${name} screen on slide ${i + 1}.`;
    },
    getCurrentSlide: () => {
      const s = slides[index];
      return JSON.stringify({ number: index + 1, total, id: s.id, title: s.dataset.title, notes: s.dataset.notes || '' });
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
    sc.type = 'text/javascript';
    sc.onerror = () => { tip.textContent = 'Agent could not load'; disableAgent(); };
    document.head.appendChild(sc);
    // Our buttons open the widget by clicking its own start control (inside its shadow root).
    agentBtns.forEach((b) => b.addEventListener('click', () => {
      const root = w.shadowRoot;
      const btn = root && (root.querySelector('button[aria-label*="call" i], button[aria-label*="start" i], button'));
      if (btn) btn.click();
    }));
  }

  // expose for debugging in the console
  window.MAYBE_PITCH = { go, clientTools };
})();
