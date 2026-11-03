// A simulated call that spends no credits: fake Realtime events, RTCPeerConnection, microphone and fetch.
// It runs the real assets/live-call.js and assets/voice/mara.js on a small fake page, and the real api/realtime-session.js.
// Nothing here can reach the network or read a key.
// Run with: node --test api/_voice/mara.test.js

const { afterEach, beforeEach, describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const LIVE_CALL = fs.readFileSync(path.join(ROOT, 'assets/live-call.js'), 'utf8');
const MARA = fs.readFileSync(path.join(ROOT, 'assets/voice/mara.js'), 'utf8');

// ---------- a small fake page ----------

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.attrs = {};
    this.dataset = {};
    this.listeners = {};
    this._text = '';
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name),
    };
    const display = {};
    this.style = new Proxy(display, {
      get: (target, key) => (key === 'setProperty' ? () => {} : target[key] ?? ''),
      set: (target, key, value) => { target[key] = value; return true; },
    });
  }
  get childNodes() { return this.children; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get isConnected() {
    let node = this;
    while (node.parent) node = node.parent;
    return node.isRoot === true;
  }
  get offsetHeight() { return 60; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  set innerHTML(value) { this.children.forEach((child) => { child.parent = null; }); this.children = []; this._text = String(value); }
  setAttribute(name, value) { this.attrs[name] = value; }
  getAttribute(name) { return this.attrs[name]; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) {
    if (node.parent) node.remove();
    node.parent = this;
    this.children.push(node);
    return node;
  }
  insertBefore(node, before) {
    if (node.parent) node.remove();
    const at = this.children.indexOf(before);
    if (at < 0) throw new Error('NotFoundError: insertBefore');
    node.parent = this;
    this.children.splice(at, 0, node);
    return node;
  }
  removeChild(node) { node.remove(); return node; }
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  replaceChildren(...nodes) {
    this.children.forEach((child) => { child.parent = null; });
    this.children = [];
    nodes.forEach((node) => this.appendChild(node));
  }
  contains(node) {
    for (let at = node; at; at = at.parent) if (at === this) return true;
    return false;
  }
  closest() { return this.closestTarget || null; }
  querySelector(selector) {
    const attribute = selector.match(/^\[data-([\w-]+)\]$/);
    const className = selector.match(/^\.([\w-]+)$/);
    const matches = (node) => {
      if (attribute) return Object.prototype.hasOwnProperty.call(node.dataset, attribute[1].replace(/-(\w)/g, (_, char) => char.toUpperCase()));
      if (className) return node.classList.contains(className[1]);
      return false;
    };
    for (const child of this.children) {
      if (matches(child)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  animate() {
    const animation = { onfinish: null, oncancel: null };
    return animation;
  }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  removeEventListener(type, handler) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== handler); }
  dispatchEvent(event) { (this.listeners[event.type] || []).slice().forEach((handler) => handler(event)); return true; }
  blur() {}
  click() { this.dispatchEvent({ type: 'click' }); }
}

function buildSlide() {
  const page = new FakeElement('html');
  page.isRoot = true;
  const slide = new FakeElement('section');
  const other = new FakeElement('section');
  const root = new FakeElement('div');
  root.dataset.call = '';
  root.dataset.callScript = JSON.stringify([
    { role: 'you', text: 'Hi Mara, it is Luc from Dr. Lipp.' },
    { role: 'agent', text: 'Two minutes, sure.' },
  ]);
  root.closestTarget = slide;
  const orb = new FakeElement();
  orb.dataset.orb = '';
  const bubbles = new FakeElement();
  bubbles.dataset.bubbles = '';
  const avatar = new FakeElement();
  avatar.dataset.avatar = '';
  // The static bubble Luc's design leaves in the page.
  const staticBubble = new FakeElement();
  staticBubble.dataset.static = '';
  bubbles.appendChild(staticBubble);
  root.append(orb, bubbles, avatar);
  slide.appendChild(root);
  page.append(slide, other);
  return { page, slide, other, root, bubbles, avatar, orb };
}

// ---------- fake browser and fake OpenAI ----------

function fakeTrack() {
  return { enabled: true, stopped: false, onended: null, stop() { this.stopped = true; } };
}

class FakeChannel {
  constructor() { this.readyState = 'connecting'; this.sent = []; }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 'closed'; }
}

function makeWorld(options = {}) {
  const slideParts = buildSlide();
  const documentNode = new FakeElement('document');
  const windowListeners = {};
  const world = {
    ...slideParts,
    documentNode,
    ended: [],
    peers: [],
    streams: [],
    audios: [],
    contexts: [],
    fetchLog: [],
    warnings: [],
    tokenResponse: options.tokenResponse || (() => ({ status: 200, body: { value: 'ek_test' } })),
    sdpResponse: options.sdpResponse || (() => ({ status: 200, text: 'v=0 answer' })),
    mic: options.mic || (async () => fakeStream()),
    playResult: options.playResult || (() => Promise.resolve()),
    ctxState: options.ctxState || 'running',
  };

  function fakeStream() {
    const track = fakeTrack();
    const stream = { getAudioTracks: () => [track], getTracks: () => [track], track };
    world.streams.push(stream);
    return stream;
  }
  world.fakeStream = fakeStream;

  class FakePeer {
    constructor() {
      this.connectionState = 'new';
      this.closed = false;
      this.tracks = [];
      world.peers.push(this);
    }
    createDataChannel(label) {
      this.label = label;
      this.channel = new FakeChannel();
      return this.channel;
    }
    addTrack(track) { this.tracks.push(track); }
    async createOffer() { return { type: 'offer', sdp: 'v=0 offer' }; }
    async setLocalDescription() {}
    async setRemoteDescription(answer) { this.answer = answer; }
    close() { this.closed = true; this.connectionState = 'closed'; if (this.channel) this.channel.readyState = 'closed'; }
  }

  class FakeAudio {
    constructor() { this.paused = true; this.srcObject = null; world.audios.push(this); }
    play() {
      return world.playResult().then(() => { this.paused = false; });
    }
    pause() { this.paused = true; }
  }

  class FakeAudioContext {
    constructor() { this.state = world.ctxState; this.closed = false; world.contexts.push(this); }
    resume() {
      if (this.state === 'suspended' && world.ctxState === 'suspended') return new Promise(() => {}); // Chrome: pending without a gesture
      this.state = 'running';
      return Promise.resolve();
    }
    close() { this.closed = true; this.state = 'closed'; return Promise.resolve(); }
    createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0, getFloatTimeDomainData() {} }; }
    createMediaStreamSource() { return { connect() {} }; }
  }

  const fetchFake = async (url, init = {}) => {
    world.fetchLog.push({ url, init });
    const respond = url === '/api/realtime-session' ? world.tokenResponse : url === 'https://api.openai.com/v1/realtime/calls' ? world.sdpResponse : null;
    if (!respond) throw new Error(`Unexpected request to ${url}`);
    if (init.signal && init.signal.aborted) { const error = new Error('aborted'); error.name = 'AbortError'; throw error; }
    const answer = await respond(init);
    if (answer.networkError) throw new TypeError('Failed to fetch');
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => { if (answer.body === undefined) throw new Error('not json'); return answer.body; },
      text: async () => answer.text,
    };
  };

  const documentProxy = {
    querySelector: (selector) => (selector === '[data-call]' ? slideParts.root : null),
    get activeElement() { return world.activeElement; },
    createElement: (tag) => new FakeElement(tag),
    addEventListener: (type, handler) => documentNode.addEventListener(type, handler),
    removeEventListener: (type, handler) => documentNode.removeEventListener(type, handler),
    dispatchEvent: (event) => documentNode.dispatchEvent(event),
  };

  const sandbox = {
    console: { log() {}, debug() {}, warn: (...args) => world.warnings.push(args.join(' ')), error: (...args) => world.warnings.push(args.join(' ')) },
    document: documentProxy,
    location: { search: options.search || '' },
    navigator: { mediaDevices: options.noMediaDevices ? undefined : { getUserMedia: (constraints) => { world.micConstraints = constraints; return world.mic(); } } },
    fetch: fetchFake,
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (...args) => setInterval(...args),
    clearInterval: (id) => clearInterval(id),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    performance: { now: () => Date.now() },
    matchMedia: () => ({ matches: Boolean(options.reducedMotion) }),
    Audio: FakeAudio,
    AudioContext: FakeAudioContext,
    RTCPeerConnection: options.noPeerConnection ? undefined : FakePeer,
    AbortController,
    URLSearchParams,
    Float32Array,
    Map,
    Set,
    Promise,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Error,
    TypeError,
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    addEventListener: (type, handler) => { (windowListeners[type] ||= []).push(handler); },
    focus: () => { world.windowFocused = true; },
    MAYBE_REVIEW: options.review,
  };
  sandbox.window = sandbox;
  world.fireWindow = (type) => (windowListeners[type] || []).forEach((handler) => handler({ type }));
  world.sandbox = sandbox;

  documentNode.addEventListener('call:ended', (event) => world.ended.push(event.detail));
  const context = vm.createContext(sandbox);
  vm.runInContext(LIVE_CALL, context);
  vm.runInContext(MARA, context);
  world.view = sandbox.MAYBE_CALL;

  world.goToCallSlide = () => documentNode.dispatchEvent({ type: 'deck:slidechange', detail: { slide: slideParts.slide } });
  world.leaveSlide = () => documentNode.dispatchEvent({ type: 'deck:slidechange', detail: { slide: slideParts.other } });
  world.key = (key, extra = {}) => documentNode.dispatchEvent({ type: 'keydown', key, repeat: false, preventDefault() {}, ...extra });
  world.keyUp = (key) => documentNode.dispatchEvent({ type: 'keyup', key });

  world.peer = () => world.peers[world.peers.length - 1];
  world.openChannel = () => {
    const peer = world.peer();
    peer.channel.readyState = 'open';
    peer.connectionState = 'connected';
    if (peer.channel.onopen) peer.channel.onopen();
  };
  world.emit = (event) => {
    const channel = world.peer().channel;
    if (channel.onmessage) channel.onmessage({ data: JSON.stringify(event) });
  };
  world.sentTypes = () => world.peer().channel.sent.map((event) => event.type);
  world.track = () => world.streams[world.streams.length - 1].track;
  world.bubbleList = () => slideParts.bubbles.children
    .filter((node) => !node.dataset.leaving)
    .map((node) => ({ role: node.dataset.role, text: textOf(node) }));
  world.bubbleText = () => world.bubbleList().map((bubble) => `${bubble.role}: ${bubble.text}`);
  world.noticeText = () => {
    const notice = slideParts.root.children.find((node) => node.attrs.role === 'status');
    if (!notice || notice.style.display !== 'flex') return null;
    return notice.children[0].children[0].textContent;
  };
  world.noticeButton = () => {
    const notice = slideParts.root.children.find((node) => node.attrs.role === 'status');
    const button = notice.children[0].children[1];
    return notice.style.display === 'flex' && button.style.display === 'block' ? button : null;
  };
  return world;
}

function textOf(bubble) {
  const holder = bubble.querySelector('[data-text]');
  return holder ? holder.textContent.trim() : bubble.textContent.trim();
}

const plain = (value) => JSON.parse(JSON.stringify(value)); // values made inside the fake page

const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise(setImmediate); };

async function liveCall(options) {
  const world = makeWorld(options);
  world.goToCallSlide();
  await settle();
  world.openChannel();
  await settle();
  return world;
}

function candidateSays(world, id, text) {
  world.emit({ type: 'input_audio_buffer.speech_started', item_id: id, audio_start_ms: 0 });
  world.emit({ type: 'conversation.item.input_audio_transcription.delta', item_id: id, delta: text });
  world.emit({ type: 'input_audio_buffer.speech_stopped', item_id: id, audio_end_ms: 900 });
  world.emit({ type: 'input_audio_buffer.committed', item_id: id, previous_item_id: null });
  world.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: text, content_index: 0 });
}

function maraSays(world, responseId, itemId, text, extraOutput = []) {
  world.emit({ type: 'response.created', response: { id: responseId } });
  world.emit({ type: 'response.output_item.added', response_id: responseId, item: { id: itemId, type: 'message' } });
  world.emit({ type: 'output_audio_buffer.started', response_id: responseId });
  world.emit({ type: 'response.output_audio_transcript.delta', response_id: responseId, item_id: itemId, delta: text });
  world.emit({ type: 'response.output_audio_transcript.done', response_id: responseId, item_id: itemId, transcript: text });
  world.emit({ type: 'response.done', response: { id: responseId, status: 'completed', output: [{ id: itemId, type: 'message' }, ...extraOutput] } });
  world.emit({ type: 'output_audio_buffer.stopped', response_id: responseId });
}

const END_CALL = { type: 'function_call', name: 'end_call', call_id: 'call_1', arguments: '{}' };

// ---------- the call ----------

describe('call slide', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 }));
  afterEach(() => mock.timers.reset());

  describe('taking over the slide', () => {
    it('takes over at once: no demo bubble ever appears, even after waiting', async () => {
      const world = makeWorld({ tokenResponse: () => new Promise(() => {}) });
      world.goToCallSlide();
      assert.equal(world.bubbles.children.length, 0, 'the static design bubble is gone in the same tick');
      mock.timers.tick(5000);
      await settle();
      assert.deepEqual(plain(world.bubbleList()), []);
    });

    it('never asks for the microphone twice', async () => {
      let asked = 0;
      const world = makeWorld({ mic: async () => { asked += 1; return world.fakeStream(); } });
      world.goToCallSlide();
      await settle();
      assert.equal(asked, 1);
    });

    it('does not wait for a suspended AudioContext (no gesture yet)', async () => {
      const world = makeWorld({ ctxState: 'suspended' });
      world.goToCallSlide();
      await settle();
      assert.ok(world.peer(), 'the connection is made anyway');
      assert.ok(world.fetchLog.some((entry) => entry.url.includes('/realtime/calls')));
    });

    it('connects the way the docs show', async () => {
      const world = makeWorld();
      world.goToCallSlide();
      await settle();
      const calls = world.fetchLog.find((entry) => entry.url.includes('/realtime/calls'));
      assert.equal(calls.init.method, 'POST');
      assert.equal(calls.init.headers.Authorization, 'Bearer ek_test');
      assert.equal(calls.init.headers['Content-Type'], 'application/sdp');
      assert.equal(calls.init.body, 'v=0 offer');
      assert.equal(world.peer().label, 'oai-events');
      assert.equal(world.peer().answer.sdp, 'v=0 answer');
    });

    it('keeps the microphone closed until the call is live', async () => {
      const world = makeWorld();
      world.goToCallSlide();
      await settle();
      assert.equal(world.track().enabled, false);
      world.openChannel();
      assert.equal(world.track().enabled, true);
      assert.equal(world.noticeText(), null, 'no notice once the call is live');
    });

    it('shows a status while connecting', async () => {
      const world = makeWorld({ tokenResponse: () => new Promise(() => {}) });
      world.goToCallSlide();
      await settle();
      assert.equal(world.noticeText(), 'Connecting…');
    });
  });

  describe('bubbles', () => {
    it('updates only the current bubble and never clears', async () => {
      const world = await liveCall();
      const added = [];
      const clears = [];
      const realAdd = world.view.addMessage;
      world.view.addMessage = (...args) => { added.push(args); return realAdd(...args); };
      const realClear = world.view.clear;
      world.view.clear = (...args) => { clears.push(args); return realClear(...args); };

      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      ['Hi ', 'there, ', 'do ', 'you ', 'have '].forEach((delta) => world.emit({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'u1', delta }));
      assert.equal(clears.length, 0);
      assert.equal(added.length, 5);
      assert.equal(added[0][2], undefined, 'the first word opens the bubble');
      added.slice(1).forEach((args) => assert.equal(args[2].replaceLast, true));
      assert.deepEqual(plain(world.bubbleText()), ['you: Hi there, do you have']);
    });

    it('does not put the orb in idle while words stream in', async () => {
      const world = await liveCall();
      const modes = [];
      const orbClasses = world.orb.classList;
      const realAdd = orbClasses.add;
      orbClasses.add = (...names) => { modes.push(...names); return realAdd(...names); };
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      modes.length = 0;
      ['one ', 'two ', 'three '].forEach((delta) => world.emit({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'u1', delta }));
      assert.deepEqual(modes, []);
      assert.equal(world.orb.classList.contains('orb--you'), true);
    });

    it('keeps the order when the presenter\'s text arrives after Mara started', async () => {
      const world = await liveCall();
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      world.emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'u1' });
      world.emit({ type: 'input_audio_buffer.committed', item_id: 'u1' });
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.output_item.added', response_id: 'r1', item: { id: 'm1', type: 'message' } });
      world.emit({ type: 'response.output_audio_transcript.delta', response_id: 'r1', item_id: 'm1', delta: 'Do I know you?' });
      assert.deepEqual(plain(world.bubbleText()), ['agent: Do I know you?']);
      world.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Hi, sorry to interrupt.' });
      assert.deepEqual(plain(world.bubbleText()), ['you: Hi, sorry to interrupt.', 'agent: Do I know you?']);
      // Mara keeps streaming into her own bubble, which is still the last one.
      world.emit({ type: 'response.output_audio_transcript.delta', response_id: 'r1', item_id: 'm1', delta: ' I am busy.' });
      assert.deepEqual(plain(world.bubbleText()), ['you: Hi, sorry to interrupt.', 'agent: Do I know you? I am busy.']);
    });

    it('corrects the presenter\'s bubble in place once it is no longer the last', async () => {
      const world = await liveCall();
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      world.emit({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'u1', delta: 'Have you eating' });
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.output_item.added', response_id: 'r1', item: { id: 'm1', type: 'message' } });
      world.emit({ type: 'response.output_audio_transcript.delta', response_id: 'r1', item_id: 'm1', delta: 'No, not yet.' });
      world.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Have you eaten today?' });
      assert.deepEqual(plain(world.bubbleText()), ['you: Have you eaten today?', 'agent: No, not yet.']);
      assert.equal(world.bubbles.children[1].style.opacity, '1', 'the last bubble stays fully visible');
    });

    it('never overwrites a previous bubble of the same speaker', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'First thought.');
      candidateSays(world, 'u2', 'Second thought.');
      assert.deepEqual(plain(world.bubbleText()), ['you: First thought.', 'you: Second thought.']);
    });

    it('ignores a transcript with no words', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', ' . ');
      assert.deepEqual(plain(world.bubbleList()), []);
    });

    it('survives the view having trimmed the bubble it needs to go before (reduced motion)', async () => {
      const world = await liveCall({ reducedMotion: true });
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'late' });
      world.emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'late' });
      world.emit({ type: 'input_audio_buffer.committed', item_id: 'late' });
      for (let i = 0; i < 4; i += 1) {
        maraSays(world, `r${i}`, `m${i}`, `Line ${i}.`);
      }
      world.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'late', transcript: 'Late words.' });
      mock.timers.tick(60000);
      world.leaveSlide();
      await settle();
      assert.equal(world.ended[0].turns[0].text, 'Late words.', 'the transcript order holds even if the bubble was trimmed');
    });
  });

  describe('Mara speaking', () => {
    it('closes the microphone while she talks and reopens it a moment after', async () => {
      const world = await liveCall();
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
      assert.equal(world.track().enabled, false);
      assert.equal(world.avatar.classList.contains('avatar--talking'), true);
      world.emit({ type: 'output_audio_buffer.stopped', response_id: 'r1' });
      assert.equal(world.avatar.classList.contains('avatar--talking'), false);
      assert.equal(world.track().enabled, false, 'still closed: the room may still be playing her last word');
      mock.timers.tick(400);
      assert.equal(world.track().enabled, true);
    });

    it('does not get stuck with the microphone closed if the stop event never comes', async () => {
      const world = await liveCall();
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
      mock.timers.tick(26000);
      assert.equal(world.track().enabled, true);
      assert.equal(world.orb.classList.contains('orb--idle'), true);
    });

    it('removes a reply she never said out loud', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Hi there, I wanted to');
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.output_item.added', response_id: 'r1', item: { id: 'm1', type: 'message' } });
      world.emit({ type: 'response.output_audio_transcript.delta', response_id: 'r1', item_id: 'm1', delta: 'What do you want' });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'cancelled', status_details: { reason: 'turn_detected' }, output: [] } });
      assert.deepEqual(plain(world.bubbleText()), ['you: Hi there, I wanted to']);
      world.leaveSlide();
      await settle();
      assert.equal(world.ended[0].turns.length, 1);
    });

    it('keeps what she did say when cut off', async () => {
      const world = await liveCall();
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.output_item.added', response_id: 'r1', item: { id: 'm1', type: 'message' } });
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
      world.emit({ type: 'response.output_audio_transcript.delta', response_id: 'r1', item_id: 'm1', delta: 'Well, you see' });
      world.emit({ type: 'output_audio_buffer.cleared', response_id: 'r1' });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'cancelled', output: [] } });
      assert.deepEqual(plain(world.bubbleText()), ['agent: Well, you see']);
    });

    it('answers wait_for_user so the conversation stays valid, and does not hang up', async () => {
      const world = await liveCall();
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ type: 'function_call', name: 'wait_for_user', call_id: 'c9', arguments: '{}' }] } });
      const output = world.peer().channel.sent.find((event) => event.type === 'conversation.item.create');
      assert.equal(output.item.type, 'function_call_output');
      assert.equal(output.item.call_id, 'c9');
      mock.timers.tick(30000);
      assert.equal(world.ended.length, 0);
    });
  });

  describe('ending', () => {
    it('end_call with no audio pending closes the call', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Hello there, are you hungry?');
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.function_call_arguments.done', response_id: 'r1', name: 'end_call', call_id: 'c1', arguments: '{}' });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [END_CALL] } });
      mock.timers.tick(1);
      await settle();
      assert.equal(world.ended.length, 1);
      assert.equal(world.peer().closed, true);
    });

    it('end_call from a cancelled reply does not hang up', async () => {
      const world = await liveCall();
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.function_call_arguments.done', response_id: 'r1', name: 'end_call', call_id: 'c1', arguments: '{' });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'cancelled', output: [] } });
      mock.timers.tick(60000);
      assert.equal(world.ended.length, 0);
    });

    it('with speech, waits for her last word and the room before hanging up', async () => {
      const world = await liveCall();
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.output_item.added', response_id: 'r1', item: { id: 'm1', type: 'message' } });
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
      world.emit({ type: 'response.output_audio_transcript.done', response_id: 'r1', item_id: 'm1', transcript: "Okay, I'll take the banana." });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ id: 'm1', type: 'message' }, END_CALL] } });
      mock.timers.tick(5000);
      assert.equal(world.ended.length, 0, 'still speaking');
      assert.equal(world.track().enabled, false);
      world.emit({ type: 'output_audio_buffer.stopped', response_id: 'r1' });
      mock.timers.tick(200);
      assert.equal(world.ended.length, 0, 'the room is still hearing the last word');
      mock.timers.tick(600);
      assert.equal(world.ended.length, 1);
    });

    it('hangs up on the closing sentence even if the model forgets end_call', async () => {
      const world = await liveCall();
      maraSays(world, 'r1', 'm1', 'No thanks, I’ll pass.');
      mock.timers.tick(800);
      assert.equal(world.ended.length, 1);
      assert.equal(world.ended[0].turns[0].text, "No thanks, I'll pass.", 'curly apostrophes become straight for the review rules');
    });

    it('does not hang up on a mention of goodbye in the middle of a sentence', async () => {
      const world = await liveCall();
      maraSays(world, 'r1', 'm1', 'Say goodbye to my focus then. So how much is it?');
      mock.timers.tick(60000);
      assert.equal(world.ended.length, 0);
    });

    it('hangs up even if the stop event never comes', async () => {
      const world = await liveCall();
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ id: 'm1', type: 'message' }, END_CALL] } });
      mock.timers.tick(16000);
      assert.equal(world.ended.length, 1);
    });

    it('the bubbles stay and the demo does not come back when the call ends', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Hi, have you eaten?');
      maraSays(world, 'r1', 'm1', "Okay, I'll take the banana.", [END_CALL]);
      mock.timers.tick(1000);
      assert.equal(world.ended.length, 1);
      const before = world.bubbleText();
      mock.timers.tick(30000);
      await settle();
      assert.deepEqual(plain(world.bubbleText()), before);
      assert.equal(before.length, 2);
    });

    it('fires call:ended exactly once however many ways the call ends', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Hello, how are you?');
      maraSays(world, 'r1', 'm1', "Okay, I'll take the banana.", [END_CALL]);
      mock.timers.tick(800);
      world.view.root.dispatchEvent({ type: 'call:end' });
      world.leaveSlide();
      world.fireWindow('pagehide');
      world.emit({ type: 'output_audio_buffer.stopped', response_id: 'r1' });
      mock.timers.tick(60000);
      await settle();
      assert.equal(world.ended.length, 1);
    });

    it('call:ended has exactly the agreed shape, in conversation order', async () => {
      const world = await liveCall();
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      mock.timers.tick(1000);
      world.emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'u1' });
      world.emit({ type: 'input_audio_buffer.committed', item_id: 'u1' });
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.output_item.added', response_id: 'r1', item: { id: 'm1', type: 'message' } });
      world.emit({ type: 'response.output_audio_transcript.done', response_id: 'r1', item_id: 'm1', transcript: 'Do I know you?' });
      world.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Hi, sorry.' });
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ id: 'm1', type: 'message' }] } });
      world.leaveSlide();
      await settle();
      const { turns } = world.ended[0];
      assert.deepEqual(plain(turns), [
        { id: 'u1', speaker: 'candidate', text: 'Hi, sorry.', atMs: 0 },
        { id: 'm1', speaker: 'prospect', text: 'Do I know you?', atMs: 1000 },
      ]);
    });

    it('call:ended passes the review endpoint limits', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'x'.repeat(5000));
      world.leaveSlide();
      await settle();
      assert.equal(world.ended[0].turns[0].text.length, 2000);
    });

    it('waits for the transcript of the last sentence, but not for long', async () => {
      const world = await liveCall();
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      world.leaveSlide();
      assert.equal(world.ended.length, 0, 'waiting for the last words');
      assert.ok(world.sentTypes().includes('input_audio_buffer.commit'));
      assert.equal(world.track().stopped, true, 'the microphone is released at once');
      world.emit({ type: 'input_audio_buffer.committed', item_id: 'u1' });
      world.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Goodbye then.' });
      assert.equal(world.ended.length, 1);
      assert.equal(world.ended[0].turns[0].text, 'Goodbye then.');

      const silent = await liveCall();
      silent.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      silent.leaveSlide();
      mock.timers.tick(3100);
      assert.equal(silent.ended.length, 1);
    });

    it('after the call ended, late audio events do not make her look like she talks', async () => {
      const world = await liveCall();
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      world.leaveSlide();
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r9' });
      assert.equal(world.avatar.classList.contains('avatar--talking'), false);
    });

    it('does not restart the orb loop on a slide that is no longer showing', async () => {
      const world = await liveCall();
      let levelCalls = 0;
      const realSet = world.view.setLevel;
      world.view.setLevel = (...args) => { levelCalls += 1; return realSet(...args); };
      world.leaveSlide();
      await settle();
      assert.equal(levelCalls, 0);
    });
  });

  describe('errors', () => {
    it('a recoverable error does not end the call', async () => {
      const world = await liveCall();
      world.emit({ type: 'error', error: { type: 'invalid_request_error', code: 'conversation_already_has_active_response', message: 'busy' } });
      world.emit({ type: 'error', error: { type: 'invalid_request_error', code: 'input_audio_buffer_commit_empty', message: 'empty' } });
      world.emit({ type: 'error', error: { type: 'server_error', message: 'hiccup' } });
      mock.timers.tick(10000);
      assert.equal(world.ended.length, 0);
      assert.equal(world.noticeText(), null);
      assert.equal(world.peer().closed, false);
    });

    it('a bad event or a broken JSON message does not end the call', async () => {
      const world = await liveCall();
      world.peer().channel.onmessage({ data: 'not json' });
      world.emit({ type: 'response.done' });
      world.emit({ type: 'made.up.event' });
      assert.equal(world.peer().closed, false);
    });

    it('out of credits shows a notice and stops', async () => {
      const world = await liveCall();
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'failed', status_details: { error: { code: 'credit_balance_exhausted' } }, output: [] } });
      assert.equal(world.noticeText(), 'The voice service is out of credits.');
      assert.equal(world.peer().closed, true);
      assert.equal(world.ended.length, 0, 'still the same call: it can be retried');
    });

    it('a failed reply is asked for again once, then a notice', async () => {
      const world = await liveCall();
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'failed', output: [] } });
      assert.ok(world.sentTypes().includes('response.create'));
      assert.equal(world.noticeText(), null);
      world.emit({ type: 'response.done', response: { id: 'r2', status: 'failed', output: [] } });
      assert.equal(world.noticeText(), 'Mara is not answering. Try again.');
    });

    it('a turn with no reply is nudged once, then a notice', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Hello?');
      mock.timers.tick(6100);
      assert.ok(world.sentTypes().includes('response.create'));
      assert.equal(world.noticeText(), null);
      mock.timers.tick(14100);
      assert.equal(world.noticeText(), 'Mara is not answering. Try again.');
    });

    it('a reply arriving in time cancels the nudge', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Hello?');
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      mock.timers.tick(30000);
      assert.equal(world.sentTypes().includes('response.create'), false);
      assert.equal(world.noticeText(), null);
    });
  });

  describe('failing to connect', () => {
    const cases = [
      ['microphone denied', { mic: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } }, 'Microphone blocked. Allow it in the address bar, then try again.'],
      ['no microphone', { mic: async () => { throw Object.assign(new Error('x'), { name: 'NotFoundError' }); } }, 'No microphone found. Connect one, then try again.'],
      ['microphone in use', { mic: async () => { throw Object.assign(new Error('x'), { name: 'NotReadableError' }); } }, 'The microphone is in use by another app. Close it, then try again.'],
      ['no secure context', { noMediaDevices: true }, 'The microphone only works on HTTPS or localhost.'],
      ['old browser', { noPeerConnection: true }, 'This browser cannot make the call. Use Chrome.'],
      ['internet down', { tokenResponse: () => ({ networkError: true }) }, 'Connection lost. Check the internet, then try again.'],
      ['origin refused', { tokenResponse: () => ({ status: 403, body: { code: 'origin' } }) }, 'This address is not allowed to start a call.'],
      ['too many attempts', { tokenResponse: () => ({ status: 429, body: { code: 'rate_limited' } }) }, 'Too many attempts. Wait a moment, then try again.'],
      ['no credits', { tokenResponse: () => ({ status: 502, body: { code: 'no_credits' } }) }, 'The voice service is out of credits.'],
      ['server error', { tokenResponse: () => ({ status: 502, body: { code: 'upstream' } }) }, 'Mara could not connect. Try again.'],
      ['a page instead of the function', { tokenResponse: () => ({ status: 404 }) }, 'Mara could not connect. Try again.'],
      ['a 503 that is not ours', { tokenResponse: () => ({ status: 503 }) }, 'Mara could not connect. Try again.'],
      ['OpenAI refuses the offer', { sdpResponse: () => ({ status: 500, text: '' }) }, 'Mara could not connect. Try again.'],
    ];
    for (const [name, options, message] of cases) {
      it(`${name}: shows the notice with a retry, and no demo`, async () => {
        const world = makeWorld(options);
        world.goToCallSlide();
        await settle();
        assert.equal(world.noticeText(), message);
        assert.ok(world.noticeButton());
        assert.equal(world.noticeButton().textContent, 'Try again');
        mock.timers.tick(5000);
        await settle();
        assert.deepEqual(plain(world.bubbleList()), [], 'no demo bubbles');
        assert.equal(world.ended.length, 0);
      });
    }

    it('times out when nothing answers', async () => {
      const world = makeWorld({ tokenResponse: (init) => new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })));
      }) });
      world.goToCallSlide();
      await settle();
      mock.timers.tick(10100);
      await settle();
      assert.equal(world.noticeText(), 'Connection lost. Check the internet, then try again.');
    });

    it('times out when the connection never opens', async () => {
      const world = makeWorld();
      world.goToCallSlide();
      await settle();
      mock.timers.tick(15100);
      assert.equal(world.noticeText(), 'Connection lost. Check the internet, then try again.');
      assert.equal(world.peer().closed, true);
    });

    it('asks for the microphone with a visible message while waiting', async () => {
      const world = makeWorld({ mic: () => new Promise(() => {}) });
      world.goToCallSlide();
      await settle();
      assert.equal(world.noticeText(), 'Connecting…', 'an allowed microphone opens before this would show');
      mock.timers.tick(700);
      assert.equal(world.noticeText(), 'Allow the microphone to start the call.');
    });

    it('a denied microphone can be retried with the button', async () => {
      let denied = true;
      const world = makeWorld({ mic: async () => {
        if (denied) throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
        return world.fakeStream();
      } });
      world.goToCallSlide();
      await settle();
      denied = false;
      world.noticeButton().click();
      await settle();
      world.openChannel();
      assert.equal(world.noticeText(), null);
      assert.equal(world.track().enabled, true);
    });

    it('Enter retries too, and only when there is something to retry', async () => {
      let denied = true;
      const world = makeWorld({ mic: async () => {
        if (denied) throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
        return world.fakeStream();
      } });
      world.goToCallSlide();
      await settle();
      denied = false;
      const before = world.fetchLog.length;
      world.key('Enter');
      await settle();
      assert.ok(world.fetchLog.length > before);
      const afterRetry = world.fetchLog.length;
      world.openChannel();
      world.key('Enter');
      await settle();
      assert.equal(world.fetchLog.length, afterRetry);
    });

    it('leaving a failed call reports it once, with no turns', async () => {
      const world = makeWorld({ tokenResponse: () => ({ status: 502, body: {} }) });
      world.goToCallSlide();
      await settle();
      world.leaveSlide();
      assert.equal(world.ended.length, 1);
      assert.deepEqual(plain(world.ended[0].turns), []);
      assert.equal(world.noticeText(), null);
    });
  });

  describe('the demo', () => {
    it('appears only when the server says there is no key, and fires no call:ended', async () => {
      const world = makeWorld({ tokenResponse: () => ({ status: 503, body: { code: 'not_configured' } }), mic: async () => { throw Object.assign(new Error('x'), { name: 'NotFoundError' }); } });
      world.goToCallSlide();
      await settle();
      assert.equal(world.noticeText(), null);
      mock.timers.tick(1000);
      await settle();
      assert.ok(world.bubbleList().length > 0, 'the demo plays');
      assert.equal(world.bubbleList()[0].role, 'you');
      assert.equal(world.peers.length, 0);
      world.leaveSlide();
      await settle();
      assert.equal(world.ended.length, 0);
    });

    it('does not ask for the live microphone before knowing there is no key', async () => {
      let asked = 0;
      const world = makeWorld({ tokenResponse: () => ({ status: 503, body: { code: 'not_configured' } }), mic: async () => { asked += 1; throw Object.assign(new Error('x'), { name: 'NotFoundError' }); } });
      world.goToCallSlide();
      await settle();
      assert.equal(asked, 1, 'only the demo\'s own meter asks, once');
    });

    it('comes back on the next visit only if there is still no key', async () => {
      const world = makeWorld({ tokenResponse: () => ({ status: 503, body: { code: 'not_configured' } }) });
      world.goToCallSlide();
      await settle();
      world.leaveSlide();
      world.tokenResponse = () => ({ status: 200, body: { value: 'ek_test' } });
      world.goToCallSlide();
      await settle();
      mock.timers.tick(5000);
      await settle();
      assert.deepEqual(plain(world.bubbleList()), [], 'a key now: no demo');
      assert.equal(world.peers.length, 1);
    });
  });

  describe('dropped connection', () => {
    it('a short disconnection does not end anything', async () => {
      const world = await liveCall();
      const peer = world.peer();
      peer.connectionState = 'disconnected';
      peer.onconnectionstatechange();
      mock.timers.tick(3000);
      peer.connectionState = 'connected';
      peer.onconnectionstatechange();
      mock.timers.tick(30000);
      assert.equal(world.peers.length, 1);
      assert.equal(peer.closed, false);
      assert.equal(world.ended.length, 0);
    });

    it('a long one reconnects once by itself, with the call so far, in the same call', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Hi, have you eaten?');
      maraSays(world, 'r1', 'm1', 'Not yet, no.');
      const firstPeer = world.peer();
      firstPeer.connectionState = 'disconnected';
      firstPeer.onconnectionstatechange();
      mock.timers.tick(6100);
      assert.equal(firstPeer.closed, true);
      assert.equal(world.track().stopped, true);
      assert.equal(world.noticeText(), 'Connection lost. Reconnecting…');
      assert.deepEqual(plain(world.bubbleText()), ['you: Hi, have you eaten?', 'agent: Not yet, no.'], 'the bubbles stay');
      mock.timers.tick(700);
      await settle();
      assert.equal(world.peers.length, 2);
      assert.equal(world.noticeText(), 'Reconnecting…');
      world.openChannel();
      assert.equal(world.noticeText(), null);
      const history = world.peer().channel.sent.find((event) => event.type === 'conversation.item.create');
      assert.equal(history.item.role, 'system');
      assert.match(history.item.content[0].text, /Him: Hi, have you eaten\?\nYou: Not yet, no\./);
      assert.deepEqual(plain(world.bubbleText()), ['you: Hi, have you eaten?', 'agent: Not yet, no.']);
      assert.equal(world.ended.length, 0);

      candidateSays(world, 'u2', 'One euro, want one?');
      maraSays(world, 'r2', 'm2', "Okay, I'll take the banana.", [END_CALL]);
      mock.timers.tick(800);
      assert.equal(world.ended.length, 1);
      assert.deepEqual(plain(Array.from(world.ended[0].turns, (t) => t.id)), ['u1', 'm1', 'u2', 'm2']);
      const times = world.ended[0].turns.map((t) => t.atMs);
      assert.deepEqual(plain(times), plain([...times].sort((a, b) => a - b)));
    });

    it('if the reconnect fails, the notice offers a retry and the transcript survives', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Have you eaten?');
      world.tokenResponse = () => ({ networkError: true });
      world.peer().channel.onclose();
      assert.equal(world.noticeText(), 'Connection lost. Reconnecting…');
      mock.timers.tick(700);
      await settle();
      assert.equal(world.noticeText(), 'Connection lost. Check the internet, then try again.');
      assert.equal(world.ended.length, 0);
      world.leaveSlide();
      assert.equal(world.ended.length, 1);
      assert.equal(world.ended[0].turns[0].text, 'Have you eaten?');
    });

    it('coming back online retries by itself', async () => {
      const world = await liveCall();
      world.tokenResponse = () => ({ networkError: true });
      world.peer().channel.onclose();
      mock.timers.tick(700);
      await settle();
      world.tokenResponse = () => ({ status: 200, body: { value: 'ek_test' } });
      world.fireWindow('online');
      await settle();
      world.openChannel();
      assert.equal(world.noticeText(), null);
    });

    it('going offline for a moment does not drop a call that stayed connected', async () => {
      const world = await liveCall();
      world.fireWindow('offline');
      mock.timers.tick(2000);
      world.fireWindow('online');
      mock.timers.tick(30000);
      assert.equal(world.peers.length, 1);
      assert.equal(world.peer().closed, false);
    });

    it('a microphone unplugged mid-call shows a notice', async () => {
      const world = await liveCall();
      world.track().onended();
      assert.equal(world.noticeText(), 'The microphone stopped working. Check it, then try again.');
    });

    it('a blocked sound shows a button and does not end the call', async () => {
      const world = await liveCall({ playResult: () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) });
      world.peer().ontrack({ streams: [{}] });
      await settle();
      assert.equal(world.noticeText(), 'Mara cannot play sound yet.');
      assert.equal(world.noticeButton().textContent, 'Turn on sound');
      assert.equal(world.peer().closed, false);
      world.playResult = () => Promise.resolve();
      world.noticeButton().click();
      await settle();
      assert.equal(world.noticeText(), null);
    });
  });

  describe('leaving and coming back', () => {
    it('leaving while the token is on its way cancels everything', async () => {
      let resolveToken;
      const world = makeWorld({ tokenResponse: () => new Promise((resolve) => { resolveToken = resolve; }) });
      world.goToCallSlide();
      await settle();
      world.leaveSlide();
      resolveToken({ status: 200, body: { value: 'ek_test' } });
      await settle();
      assert.equal(world.streams.length, 0, 'the microphone was never opened');
      assert.equal(world.peers.length, 0);
      assert.equal(world.ended.length, 1);
    });

    it('leaving while the microphone is being asked for releases it when it arrives', async () => {
      let resolveMic;
      const world = makeWorld({ mic: () => new Promise((resolve) => { resolveMic = resolve; }) });
      world.goToCallSlide();
      await settle();
      world.leaveSlide();
      const stream = world.fakeStream();
      resolveMic(stream);
      await settle();
      assert.equal(stream.track.stopped, true);
      assert.equal(world.peers.length, 0);
    });

    it('leaving while OpenAI answers the offer closes the connection', async () => {
      let resolveSdp;
      const world = makeWorld({ sdpResponse: () => new Promise((resolve) => { resolveSdp = resolve; }) });
      world.goToCallSlide();
      await settle();
      world.leaveSlide();
      resolveSdp({ status: 200, text: 'v=0 answer' });
      await settle();
      assert.equal(world.peer().closed, true);
      assert.equal(world.peer().answer, undefined);
      assert.equal(world.ended.length, 1);
    });

    it('coming back starts a clean new call, and old events cannot touch it', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'First call.');
      const oldPeer = world.peer();
      const oldHandler = oldPeer.channel.onmessage;
      world.leaveSlide();
      await settle();
      assert.equal(world.ended.length, 1);
      assert.equal(oldPeer.closed, true);
      assert.equal(world.track().stopped, true);
      world.goToCallSlide();
      assert.deepEqual(plain(world.bubbleList()), [], 'clean again at once');
      await settle();
      world.openChannel();
      assert.equal(world.peers.length, 2);
      assert.equal(oldHandler === world.peer().channel.onmessage, false);
      assert.equal(oldPeer.channel.onmessage, null, 'the old connection has no listeners left');
      candidateSays(world, 'u9', 'Second call.');
      assert.deepEqual(plain(world.bubbleText()), ['you: Second call.']);
      world.leaveSlide();
      await settle();
      assert.equal(world.ended.length, 2);
      assert.equal(world.ended[1].turns[0].text, 'Second call.');
    });

    it('a transcript still draining from the old call does not land in the new call', async () => {
      const world = await liveCall();
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      const oldChannel = world.peer().channel;
      world.leaveSlide();
      world.goToCallSlide();
      await settle();
      oldChannel.onmessage({ data: JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'u1' }) });
      oldChannel.onmessage({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Old words.' }) });
      assert.deepEqual(plain(world.bubbleList()), []);
      assert.equal(world.ended.length, 1);
      assert.equal(world.ended[0].turns[0].text, 'Old words.');
    });

    it('the T and M keys do nothing away from the slide', async () => {
      const world = await liveCall();
      world.leaveSlide();
      await settle();
      const sentBefore = world.peer().channel.sent.length;
      world.key('t');
      world.key('m');
      world.keyUp('t');
      assert.equal(world.peer().channel.sent.length, sentBefore);
    });
  });

  describe('a call that goes on too long', () => {
    it('asks Mara to wrap up, then hangs up', async () => {
      const world = await liveCall();
      mock.timers.tick(150100);
      const wrap = world.peer().channel.sent.find((event) => event.type === 'conversation.item.create');
      assert.equal(wrap.item.role, 'system');
      assert.ok(world.sentTypes().includes('response.create'));
      assert.equal(world.ended.length, 0);
      mock.timers.tick(30000);
      assert.equal(world.ended.length, 1);
      assert.equal(world.peer().closed, true);
      assert.equal(world.track().stopped, true);
    });

    it('does not talk over him when asking to wrap up', async () => {
      const world = await liveCall();
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      mock.timers.tick(150100);
      assert.ok(world.sentTypes().includes('conversation.item.create'));
      assert.equal(world.sentTypes().includes('response.create'), false);
    });

    it('lets her finish her sentence at the limit', async () => {
      const world = await liveCall();
      mock.timers.tick(179000);
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
      mock.timers.tick(2000);
      assert.equal(world.ended.length, 0);
      world.emit({ type: 'output_audio_buffer.stopped', response_id: 'r1' });
      mock.timers.tick(800);
      assert.equal(world.ended.length, 1);
    });

    it('suggests the backup when he seems to be talking forever (noise)', async () => {
      const world = await liveCall();
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      mock.timers.tick(20100);
      assert.equal(world.noticeText(), 'Noisy room? Hold T to talk.');
      world.emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'u1' });
      assert.equal(world.noticeText(), null);
    });
  });

  describe('microphone keys', () => {
    it('M mutes and says so, and the next call starts unmuted', async () => {
      const world = await liveCall();
      world.key('m');
      assert.equal(world.track().enabled, false);
      assert.equal(world.noticeText(), 'Microphone muted. Press M to unmute.');
      world.key('M');
      assert.equal(world.track().enabled, true);
      world.key('m');
      world.leaveSlide();
      await settle();
      world.goToCallSlide();
      await settle();
      world.openChannel();
      assert.equal(world.track().enabled, true);
      assert.equal(world.noticeText(), null);
    });

    it('does not react while typing', async () => {
      const world = await liveCall();
      world.key('m', { target: { tagName: 'INPUT' } });
      world.key('t', { target: { tagName: 'INPUT' } });
      assert.equal(world.track().enabled, true);
      assert.equal(world.sentTypes().includes('session.update'), false);
    });
  });

  describe('push to talk', () => {
    it('first press turns voice detection off, and a held key opens the microphone', async () => {
      const world = await liveCall();
      assert.equal(world.track().enabled, true, 'automatic to begin with');
      world.key('t');
      const update = world.peer().channel.sent.find((event) => event.type === 'session.update');
      assert.equal(update.session.type, 'realtime');
      assert.equal(update.session.audio.input.turn_detection, null);
      assert.deepEqual(plain(world.sentTypes().slice(-2)), ['input_audio_buffer.clear', 'response.cancel']);
      assert.equal(world.track().enabled, true);
      assert.equal(world.noticeText(), 'Talking. Release T to send.');
      assert.equal(world.orb.classList.contains('orb--you'), true);
    });

    it('release sends the audio and asks for a reply, keeping the mic a moment for the last sound', async () => {
      const world = await liveCall();
      world.key('t');
      mock.timers.tick(1500);
      world.keyUp('t');
      assert.equal(world.track().enabled, true);
      assert.equal(world.sentTypes().includes('input_audio_buffer.commit'), false);
      mock.timers.tick(250);
      assert.equal(world.track().enabled, false);
      const sent = world.sentTypes();
      assert.deepEqual(plain(sent.slice(-2)), ['input_audio_buffer.commit', 'response.create']);
      assert.equal(world.noticeText(), 'Hold T to talk.');
    });

    it('the turn gets the time he started talking', async () => {
      const world = await liveCall();
      mock.timers.tick(5000);
      world.key('t');
      mock.timers.tick(3000);
      world.keyUp('t');
      mock.timers.tick(250);
      world.emit({ type: 'input_audio_buffer.committed', item_id: 'p1' });
      world.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'p1', transcript: 'Hello there.' });
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.leaveSlide();
      await settle();
      assert.equal(world.ended[0].turns[0].atMs, 5000);
      assert.equal(world.ended[0].turns[0].speaker, 'candidate');
    });

    it('a tap sends nothing, and only arms the mode', async () => {
      const world = await liveCall();
      world.key('t');
      mock.timers.tick(100);
      world.keyUp('t');
      mock.timers.tick(250);
      const sent = world.sentTypes();
      assert.equal(sent.includes('input_audio_buffer.commit'), false);
      assert.equal(sent.includes('response.create'), false);
      assert.equal(world.noticeText(), 'Hold T to talk.');
      assert.equal(world.track().enabled, false);
    });

    it('pressing while Mara talks cuts her off in the documented order', async () => {
      const world = await liveCall();
      world.key('t');
      mock.timers.tick(1000);
      world.keyUp('t');
      mock.timers.tick(250);
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
      world.peer().channel.sent.length = 0;
      world.key('t');
      assert.deepEqual(plain(world.sentTypes()), ['input_audio_buffer.clear', 'response.cancel', 'output_audio_buffer.clear']);
      assert.equal(world.track().enabled, true);
    });

    it('the window losing focus counts as letting go', async () => {
      const world = await liveCall();
      world.key('t');
      mock.timers.tick(1000);
      world.fireWindow('blur');
      mock.timers.tick(250);
      assert.equal(world.track().enabled, false);
      assert.ok(world.sentTypes().includes('input_audio_buffer.commit'));
    });

    it('key repeat is ignored', async () => {
      const world = await liveCall();
      world.key('t');
      const count = world.sentTypes().length;
      world.key('t', { repeat: true });
      world.key('t', { repeat: true });
      assert.equal(world.sentTypes().length, count);
    });

    it('Shift+T returns to automatic with the settings the session started with', async () => {
      const world = await liveCall();
      const detection = { type: 'semantic_vad', eagerness: 'medium', create_response: true, interrupt_response: true };
      world.emit({ type: 'session.created', session: { audio: { input: { turn_detection: detection } } } });
      world.key('t');
      mock.timers.tick(100);
      world.keyUp('t');
      mock.timers.tick(10);
      world.key('T', { shiftKey: true });
      const updates = world.peer().channel.sent.filter((event) => event.type === 'session.update');
      assert.deepEqual(plain(updates[updates.length - 1].session.audio.input.turn_detection), detection);
      assert.equal(world.track().enabled, true);
      assert.equal(world.noticeText(), null);
    });

    it('the mode carries over to a retry and to the next call on the page', async () => {
      const world = await liveCall();
      world.key('t');
      mock.timers.tick(100);
      world.keyUp('t');
      mock.timers.tick(10);
      world.leaveSlide();
      await settle();
      world.goToCallSlide();
      await settle();
      world.openChannel();
      const update = world.peer().channel.sent.find((event) => event.type === 'session.update');
      assert.equal(update.session.audio.input.turn_detection, null);
      assert.equal(world.track().enabled, false);
      assert.equal(world.noticeText(), 'Hold T to talk.');
    });

    it('?ptt=1 starts in this mode', async () => {
      const world = await liveCall({ search: '?ptt=1' });
      const update = world.peer().channel.sent.find((event) => event.type === 'session.update');
      assert.equal(update.session.audio.input.turn_detection, null);
      assert.equal(world.track().enabled, false);
      assert.equal(world.noticeText(), 'Hold T to talk.');
    });

    it('holding T as the slide is left still gets the last words transcribed', async () => {
      const world = await liveCall();
      world.key('t');
      mock.timers.tick(800);
      world.leaveSlide();
      assert.ok(world.sentTypes().includes('input_audio_buffer.commit'));
      assert.equal(world.sentTypes().filter((type) => type === 'response.create').length, 0);
      world.emit({ type: 'input_audio_buffer.committed', item_id: 'p1' });
      world.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'p1', transcript: 'Thanks.' });
      assert.equal(world.ended.length, 1);
      assert.equal(world.ended[0].turns[0].text, 'Thanks.');
      world.key('t');
      world.keyUp('t');
    });
  });

  describe('rehearsal switches', () => {
    it('?vad=server sends the volume-based detector', async () => {
      const world = await liveCall({ search: '?vad=server' });
      const update = world.peer().channel.sent.find((event) => event.type === 'session.update');
      assert.equal(update.session.audio.input.turn_detection.type, 'server_vad');
      assert.equal(update.session.audio.input.turn_detection.silence_duration_ms, 800);
      assert.equal(update.session.audio.input.turn_detection.interrupt_response, true);
    });

    it('?noise=near and ?noise=off change the noise reduction', async () => {
      const near = await liveCall({ search: '?noise=near' });
      assert.equal(near.peer().channel.sent.find((event) => event.type === 'session.update').session.audio.input.noise_reduction.type, 'near_field');
      const off = await liveCall({ search: '?noise=off' });
      assert.equal(off.peer().channel.sent.find((event) => event.type === 'session.update').session.audio.input.noise_reduction, null);
    });

    it('without switches nothing is sent at the start, the server settings stand', async () => {
      const world = await liveCall();
      assert.deepEqual(plain(world.sentTypes()), []);
    });
  });

  describe('found in review', () => {
    it('a long T hold survives a committed event that was already on its way', async () => {
      const world = await liveCall();
      world.emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'noise' });
      world.key('t');
      world.emit({ type: 'input_audio_buffer.committed', item_id: 'noise' });
      mock.timers.tick(4000);
      world.keyUp('t');
      mock.timers.tick(250);
      assert.deepEqual(plain(world.sentTypes().slice(-2)), ['input_audio_buffer.commit', 'response.create']);
    });

    it('T held from before the call is live opens the microphone with the next key repeat', async () => {
      const world = makeWorld({ search: '?ptt=1' });
      world.goToCallSlide();
      await settle();
      world.key('t');
      world.openChannel();
      assert.equal(world.track().enabled, false);
      world.key('t', { repeat: true });
      assert.equal(world.track().enabled, true);
      assert.equal(world.noticeText(), 'Talking. Release T to send.');
      mock.timers.tick(1500);
      world.keyUp('t');
      mock.timers.tick(250);
      assert.ok(world.sentTypes().includes('input_audio_buffer.commit'));
    });

    it('T held across a reconnect also recovers with the next key repeat', async () => {
      const world = await liveCall();
      world.key('t');
      world.peer().channel.onclose();
      mock.timers.tick(700);
      await settle();
      world.openChannel();
      world.key('t', { repeat: true });
      assert.equal(world.track().enabled, true);
    });

    it('a repeat of Shift+T does not turn push to talk back on', async () => {
      const world = await liveCall();
      world.key('t');
      mock.timers.tick(100);
      world.keyUp('t');
      mock.timers.tick(10);
      world.key('T', { shiftKey: true });
      world.key('t', { repeat: true });
      assert.equal(world.noticeText(), null);
    });

    it('a dropped link after she closed ends the call instead of reconnecting', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'One euro, want it?');
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.output_item.added', response_id: 'r1', item: { id: 'm1', type: 'message' } });
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
      world.emit({ type: 'response.output_audio_transcript.done', response_id: 'r1', item_id: 'm1', transcript: "Okay, I'll take the banana." });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ id: 'm1', type: 'message' }, END_CALL] } });
      world.peer().channel.onclose();
      assert.equal(world.ended.length, 1);
      assert.equal(world.peers.length, 1);
      mock.timers.tick(60000);
      await settle();
      assert.equal(world.ended.length, 1);
      assert.equal(world.peers.length, 1);
    });

    it('the same if the line was spoken but the link dies before the reply is done', async () => {
      const world = await liveCall();
      world.emit({ type: 'response.output_audio_transcript.done', response_id: 'r1', item_id: 'm1', transcript: 'No thanks, I\'ll pass.' });
      world.peer().channel.onclose();
      assert.equal(world.ended.length, 1);
    });

    it('after a reconnect she answers his unanswered line, and only then', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Have you eaten today?');
      world.peer().channel.onclose();
      mock.timers.tick(700);
      await settle();
      world.openChannel();
      assert.deepEqual(plain(world.sentTypes()), ['conversation.item.create', 'response.create']);

      const other = await liveCall();
      candidateSays(other, 'u1', 'Have you eaten today?');
      maraSays(other, 'r1', 'm1', 'Not yet, no.');
      other.peer().channel.onclose();
      mock.timers.tick(700);
      await settle();
      other.openChannel();
      assert.deepEqual(plain(other.sentTypes()), ['conversation.item.create']);
    });

    it('a speech_started already on its way when T turns detection off does not stick the orb on him', async () => {
      const world = await liveCall();
      world.key('t');
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'late' });
      mock.timers.tick(1000);
      world.keyUp('t');
      mock.timers.tick(250);
      assert.equal(world.orb.classList.contains('orb--idle'), true);
      world.leaveSlide();
      assert.equal(world.ended.length, 1, 'nothing to wait for');
    });

    it('a line she never said out loud stays out of call:ended, whichever way it arrives', async () => {
      const during = await liveCall();
      candidateSays(during, 'u1', 'One euro, want it?');
      during.emit({ type: 'input_audio_buffer.committed', item_id: 'u2' }); // keeps the call draining
      during.emit({ type: 'response.created', response: { id: 'r1' } });
      during.leaveSlide();
      during.emit({ type: 'response.output_audio_transcript.delta', response_id: 'r1', item_id: 'm1', delta: "Okay, I'll take the banana." });
      during.emit({ type: 'response.done', response: { id: 'r1', status: 'cancelled', output: [] } });
      during.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u2', transcript: 'Thanks.' });
      assert.equal(during.ended.length, 1);
      assert.deepEqual(plain(during.ended[0].turns.map((t) => t.speaker)), ['candidate', 'candidate']);

      const before = await liveCall();
      candidateSays(before, 'u1', 'One euro, want it?');
      before.emit({ type: 'response.created', response: { id: 'r1' } });
      before.emit({ type: 'response.output_item.added', response_id: 'r1', item: { id: 'm1', type: 'message' } });
      before.emit({ type: 'response.output_audio_transcript.delta', response_id: 'r1', item_id: 'm1', delta: "Okay, I'll take the banana." });
      before.leaveSlide();
      assert.deepEqual(plain(before.ended[0].turns.map((t) => t.speaker)), ['candidate']);
      assert.deepEqual(plain(before.bubbleText()), ['you: One euro, want it?']);
    });

    it('her closing line stays even if the audio events never came', async () => {
      const world = await liveCall();
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.output_item.added', response_id: 'r1', item: { id: 'm1', type: 'message' } });
      world.emit({ type: 'response.output_audio_transcript.done', response_id: 'r1', item_id: 'm1', transcript: "Okay, I'll take the banana." });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ id: 'm1', type: 'message' }, END_CALL] } });
      mock.timers.tick(16000);
      assert.equal(world.ended[0].turns[0].text, "Okay, I'll take the banana.");
    });

    it('a key that disappears in the middle of a call does not bring the demo back', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Have you eaten today?');
      world.tokenResponse = () => ({ status: 503, body: { code: 'not_configured' } });
      world.peer().channel.onclose();
      mock.timers.tick(700);
      await settle();
      assert.equal(world.noticeText(), 'Mara could not connect. Try again.');
      assert.deepEqual(plain(world.bubbleText()), ['you: Have you eaten today?']);
      world.leaveSlide();
      assert.equal(world.ended.length, 1);
    });

    it('a retry gets a fresh count of failed replies', async () => {
      const world = await liveCall();
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'failed', output: [] } });
      world.emit({ type: 'response.done', response: { id: 'r2', status: 'failed', output: [] } });
      world.noticeButton().click();
      await settle();
      world.openChannel();
      world.emit({ type: 'response.done', response: { id: 'r3', status: 'failed', output: [] } });
      assert.equal(world.noticeText(), null);
      assert.ok(world.sentTypes().includes('response.create'));
    });

    it('going offline, then leaving, does not throw when the timer fires', async () => {
      const world = await liveCall();
      world.fireWindow('offline');
      mock.timers.tick(2000);
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      world.leaveSlide();
      assert.doesNotThrow(() => mock.timers.tick(4500));
      assert.equal(world.ended.length, 1);
    });

    it('T while muted says nothing to the server and does not cut her off', async () => {
      const world = await liveCall();
      world.key('m');
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
      world.key('t');
      mock.timers.tick(1000);
      world.keyUp('t');
      mock.timers.tick(250);
      const sent = world.sentTypes();
      ['response.cancel', 'output_audio_buffer.clear', 'input_audio_buffer.commit', 'response.create'].forEach((type) => assert.equal(sent.includes(type), false, type));
      assert.equal(world.noticeText(), 'Microphone muted. Press M to unmute.');
    });

    it('focus left in a live screen iframe is taken back on entering the slide', async () => {
      const world = makeWorld({ tokenResponse: () => new Promise(() => {}) });
      let blurred = false;
      world.activeElement = { tagName: 'IFRAME', blur() { blurred = true; } };
      world.goToCallSlide();
      assert.equal(blurred, true);
      assert.equal(world.windowFocused, true);
    });

    it('focus anywhere else is left alone', async () => {
      const world = makeWorld({ tokenResponse: () => new Promise(() => {}) });
      world.activeElement = { tagName: 'BODY', blur() { throw new Error('must not blur'); } };
      assert.doesNotThrow(() => world.goToCallSlide());
    });

    it('coming straight back does not let the old review open over the new call', async () => {
      let closes = 0;
      const world = await liveCall({ review: { close() { closes += 1; } } });
      candidateSays(world, 'u1', 'Have you eaten today?');
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u2' });
      const oldChannel = world.peer().channel;
      world.leaveSlide();
      world.goToCallSlide();
      assert.equal(closes, 2, 'once on entering: the first entry and this one');
      oldChannel.onmessage({ data: JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'u2' }) });
      oldChannel.onmessage({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u2', transcript: 'Thanks.' }) });
      assert.equal(world.ended.length, 1);
      assert.equal(closes, 3, 'and again right after the old call:ended, which would have opened it');
    });

    it('moving on to the next slide still lets the review open', async () => {
      let closes = 0;
      const world = await liveCall({ review: { close() { closes += 1; } } });
      candidateSays(world, 'u1', 'Have you eaten today?');
      closes = 0;
      world.leaveSlide();
      assert.equal(world.ended.length, 1);
      assert.equal(closes, 0);
    });

    it('a reply cancelled by noise is still answered if she then ignores the noise', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Have you eaten today?');
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'noise' });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'cancelled', status_details: { reason: 'turn_detected' }, output: [] } });
      world.emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'noise' });
      world.emit({ type: 'input_audio_buffer.committed', item_id: 'noise' });
      world.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'noise', transcript: 'Thank you.' });
      world.emit({ type: 'response.created', response: { id: 'r2' } });
      world.emit({ type: 'response.done', response: { id: 'r2', status: 'completed', output: [{ type: 'function_call', name: 'wait_for_user', call_id: 'c1', arguments: '{}' }] } });
      const create = world.peer().channel.sent.find((event) => event.type === 'response.create');
      assert.equal(create.response.tool_choice, 'none');
      assert.deepEqual(plain(world.bubbleText()), ['you: Have you eaten today?'], 'the noise is not his words');
    });

    it('noise after she already answered gets no forced reply', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Have you eaten today?');
      maraSays(world, 'r1', 'm1', 'Not yet, no.');
      candidateSays(world, 'noise', 'Thank you.');
      world.emit({ type: 'response.created', response: { id: 'r2' } });
      world.emit({ type: 'response.done', response: { id: 'r2', status: 'completed', output: [{ type: 'function_call', name: 'wait_for_user', call_id: 'c1', arguments: '{}' }] } });
      assert.equal(world.sentTypes().includes('response.create'), false);
      assert.deepEqual(plain(world.bubbleText()), ['you: Have you eaten today?', 'agent: Not yet, no.']);
    });

    it('noise she ignored stays out, even when its transcript arrives afterwards', async () => {
      const world = await liveCall();
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'noise' });
      world.emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'noise' });
      world.emit({ type: 'input_audio_buffer.committed', item_id: 'noise' });
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ type: 'function_call', name: 'wait_for_user', call_id: 'c1', arguments: '{}' }] } });
      world.emit({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'noise', delta: 'Someone in the room' });
      world.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'noise', transcript: 'Someone in the room.' });
      assert.deepEqual(plain(world.bubbleList()), []);
      world.leaveSlide();
      assert.equal(world.ended.length, 1, 'and it does not hold up the end of the call');
      assert.deepEqual(plain(world.ended[0].turns), []);
    });

    it('a reply cut short with no audio leaves nothing behind', async () => {
      const world = await liveCall();
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.output_item.added', response_id: 'r1', item: { id: 'm1', type: 'message' } });
      world.emit({ type: 'response.output_audio_transcript.delta', response_id: 'r1', item_id: 'm1', delta: 'Well' });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'incomplete', status_details: { reason: 'content_filter' }, output: [] } });
      assert.deepEqual(plain(world.bubbleList()), []);
    });

    it('A ends the call before the review takes the screen and the keys', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Have you eaten today?');
      world.key('a');
      assert.equal(world.ended.length, 1);
      assert.equal(world.track().stopped, true);
      assert.equal(world.peer().closed, true);
      world.fireWindow('online');
      await settle();
      assert.equal(world.peers.length, 1, 'nothing comes back behind the review');
    });

    it('A on a failed call ends it too, so no second review appears later', async () => {
      const world = await liveCall();
      world.tokenResponse = () => ({ networkError: true });
      world.peer().channel.onclose();
      mock.timers.tick(700);
      await settle();
      world.key('a');
      assert.equal(world.ended.length, 1);
      world.leaveSlide();
      assert.equal(world.ended.length, 1);
    });

    it('a tap that cancels her reply on its way asks for it again, whichever comes first', async () => {
      const cancelFirst = await liveCall();
      candidateSays(cancelFirst, 'u1', 'Have you eaten today?');
      cancelFirst.emit({ type: 'response.created', response: { id: 'r1' } });
      cancelFirst.key('t');
      cancelFirst.emit({ type: 'response.done', response: { id: 'r1', status: 'cancelled', output: [] } });
      mock.timers.tick(100);
      cancelFirst.keyUp('t');
      mock.timers.tick(10);
      assert.equal(cancelFirst.sentTypes().filter((type) => type === 'response.create').length, 1);

      const tapFirst = await liveCall();
      candidateSays(tapFirst, 'u1', 'Have you eaten today?');
      tapFirst.emit({ type: 'response.created', response: { id: 'r1' } });
      tapFirst.key('t');
      mock.timers.tick(100);
      tapFirst.keyUp('t');
      mock.timers.tick(10);
      assert.equal(tapFirst.sentTypes().includes('response.create'), false);
      tapFirst.emit({ type: 'response.done', response: { id: 'r1', status: 'cancelled', output: [] } });
      assert.equal(tapFirst.sentTypes().filter((type) => type === 'response.create').length, 1);
    });

    it('a tap that cuts off her speech asks for nothing', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Have you eaten today?');
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
      world.key('t');
      world.emit({ type: 'output_audio_buffer.cleared', response_id: 'r1' });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'cancelled', output: [] } });
      mock.timers.tick(100);
      world.keyUp('t');
      mock.timers.tick(10);
      assert.equal(world.sentTypes().includes('response.create'), false);
    });

    it('the owed reply is not lost when his transcript has not arrived yet', async () => {
      const world = await liveCall();
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      world.emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'u1' });
      world.emit({ type: 'input_audio_buffer.committed', item_id: 'u1' });
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'noise' });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'cancelled', output: [] } });
      world.emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'noise' });
      world.emit({ type: 'input_audio_buffer.committed', item_id: 'noise' });
      world.emit({ type: 'response.created', response: { id: 'r2' } });
      world.emit({ type: 'response.done', response: { id: 'r2', status: 'completed', output: [{ type: 'function_call', name: 'wait_for_user', call_id: 'c1', arguments: '{}' }] } });
      assert.equal(world.peer().channel.sent.find((event) => event.type === 'response.create').response.tool_choice, 'none');
    });

    it('the owed reply waits if he is already talking again', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Have you eaten today?');
      world.emit({ type: 'response.created', response: { id: 'r1' } });
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'cancelled', output: [] } });
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u2' });
      world.emit({ type: 'response.done', response: { id: 'r2', status: 'completed', output: [{ type: 'function_call', name: 'wait_for_user', call_id: 'c1', arguments: '{}' }] } });
      assert.equal(world.sentTypes().includes('response.create'), false);
    });

    it('the reply asked for after a reconnect is watched like any other', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'Have you eaten today?');
      world.peer().channel.onclose();
      mock.timers.tick(700);
      await settle();
      world.openChannel();
      mock.timers.tick(6100);
      assert.equal(world.sentTypes().filter((type) => type === 'response.create').length, 2, 'asked once more');
      mock.timers.tick(14100);
      assert.equal(world.noticeText(), 'Mara is not answering. Try again.');
    });

    it('a reply that fails twice leaves no unheard line and no sale behind', async () => {
      const world = await liveCall();
      candidateSays(world, 'u1', 'One euro, want it?');
      world.emit({ type: 'response.done', response: { id: 'r1', status: 'failed', output: [] } });
      world.emit({ type: 'response.created', response: { id: 'r2' } });
      world.emit({ type: 'response.output_item.added', response_id: 'r2', item: { id: 'm2', type: 'message' } });
      world.emit({ type: 'response.output_audio_transcript.done', response_id: 'r2', item_id: 'm2', transcript: "Okay, I'll take the banana." });
      world.emit({ type: 'response.done', response: { id: 'r2', status: 'failed', output: [] } });
      assert.equal(world.noticeText(), 'Mara is not answering. Try again.');
      assert.equal(world.ended.length, 0);
      assert.deepEqual(plain(world.bubbleText()), ['you: One euro, want it?']);
      world.noticeButton().click();
      await settle();
      world.openChannel();
      assert.ok(world.sentTypes().includes('response.create'), 'and she answers his question after the retry');
    });

    it('A with the sample open does not get closed by an old call finishing', async () => {
      let closes = 0;
      const world = await liveCall({ review: { close() { closes += 1; } } });
      world.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
      const oldChannel = world.peer().channel;
      world.leaveSlide();
      world.goToCallSlide();
      await settle();
      world.key('a');
      closes = 0;
      oldChannel.onmessage({ data: JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'u1' }) });
      oldChannel.onmessage({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Thanks.' }) });
      assert.equal(world.ended.length, 2);
      assert.equal(closes, 0);
    });

    it('the bubbles are told not to shrink', async () => {
      const world = makeWorld();
      const rule = world.root.children.find((node) => node.tagName === 'STYLE');
      assert.match(rule.textContent, /\.bubble-live\s*\{\s*flex:\s*none/);
    });
  });

  describe('a whole call', () => {
    it('a good sale runs from the first word to call:ended', async () => {
      const world = await liveCall();
      const script = [
        ['Hi, sorry to interrupt. How is your day going?', 'Oh, hi. Busy, honestly. Do I know you?'],
        ['No, I am Luc. Have you eaten anything today?', 'Now that you ask, no. I am starving.'],
        ['This banana is quick and filling, and you can stay at your laptop.', 'I could just get pizza later, though. Why a banana?'],
        ['Pizza means a queue and a break. This takes one minute.', 'Fair enough. How much is it?'],
        ['One euro. Would you like to buy it?', "Okay, I'll take the banana."],
      ];
      script.forEach(([him, her], index) => {
        mock.timers.tick(6000);
        candidateSays(world, `u${index}`, him);
        mock.timers.tick(1000);
        const last = index === script.length - 1;
        maraSays(world, `r${index}`, `m${index}`, her, last ? [END_CALL] : []);
        if (!last) mock.timers.tick(400);
      });
      assert.equal(world.ended.length, 0);
      mock.timers.tick(800);
      assert.equal(world.ended.length, 1);
      const { turns } = world.ended[0];
      assert.equal(turns.length, 10);
      assert.deepEqual(plain(turns.map((t) => t.speaker)), ['candidate', 'prospect', 'candidate', 'prospect', 'candidate', 'prospect', 'candidate', 'prospect', 'candidate', 'prospect']);
      assert.equal(turns[9].text, "Okay, I'll take the banana.");
      assert.ok(turns.every((t) => Object.keys(t).join() === 'id,speaker,text,atMs'));
      assert.equal(world.bubbleList().length, 4, 'the view keeps the last four');
      assert.equal(world.bubbleList()[3].text, "Okay, I'll take the banana.");
      assert.equal(world.track().stopped, true);
      assert.equal(world.contexts.every((ctx) => ctx.closed), true);
      assert.deepEqual(plain(world.warnings), []);
    });
  });
});

// ---------- the server ----------

describe('api/realtime-session', () => {
  const FILE = path.join(ROOT, 'api/realtime-session.js');
  const ENV = ['OPENAI_API_KEY', 'OPENAI_REALTIME_MODEL', 'OPENAI_TRANSCRIBE_MODEL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL'];
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  let saved;
  let calls;
  let logged;

  beforeEach(() => {
    saved = Object.fromEntries(ENV.map((name) => [name, process.env[name]]));
    ENV.forEach((name) => delete process.env[name]);
    calls = [];
    logged = [];
    console.warn = (...args) => logged.push(args.join(' '));
    globalThis.fetch = async () => { throw new Error('This test must set a fake fetch'); };
  });
  afterEach(() => {
    ENV.forEach((name) => { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; });
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  });

  function load() {
    delete require.cache[require.resolve(FILE)];
    return require(FILE);
  }

  async function post(handler, origin = 'http://localhost:3010', method = 'POST', ip = '1.1.1.1') {
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      end(body) { this.body = body ? JSON.parse(body) : undefined; },
    };
    await handler({ method, headers: { origin, 'x-forwarded-for': ip }, socket: {} }, res);
    return res;
  }

  function openAI(...answers) {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      const answer = answers.length > 1 ? answers.shift() : answers[0];
      return { ok: answer.status < 300, status: answer.status, json: async () => answer.body };
    };
  }

  it('without a key says so in a way the page can tell apart, and calls nobody', async () => {
    const res = await post(load());
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'not_configured');
    assert.equal(calls.length, 0);
  });

  it('accepts any local port outside production', async () => {
    const handler = load();
    for (const origin of ['http://localhost:3000', 'http://localhost:3010', 'http://127.0.0.1:5173', 'http://localhost:49152']) {
      assert.equal((await post(handler, origin)).statusCode, 503, origin);
    }
  });

  it('refuses other origins, and local ones in production', async () => {
    const handler = load();
    assert.equal((await post(handler, 'https://evil.example')).statusCode, 403);
    assert.equal((await post(handler, 'http://localhost.evil.example:3000')).statusCode, 403);
    assert.equal((await post(handler, null)).statusCode, 403);
    process.env.VERCEL_ENV = 'production';
    assert.equal((await post(handler, 'http://localhost:3010')).statusCode, 403);
    assert.equal((await post(handler, 'https://maybe-pitch.vercel.app')).statusCode, 503);
  });

  it('accepts the Vercel preview addresses', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'maybe-pitch-abc.vercel.app';
    process.env.VERCEL_BRANCH_URL = 'maybe-pitch-git-voice.vercel.app';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'boris-maybe.vercel.app';
    const handler = load();
    for (const host of ['maybe-pitch-abc', 'maybe-pitch-git-voice', 'boris-maybe']) {
      assert.equal((await post(handler, `https://${host}.vercel.app`)).statusCode, 503, host);
    }
  });

  it('only takes POST', async () => {
    assert.equal((await post(load(), 'http://localhost:3010', 'GET')).statusCode, 405);
  });

  it('allows a rehearsal pace, and still has a limit', async () => {
    const handler = load();
    for (let i = 0; i < 30; i += 1) assert.equal((await post(handler)).statusCode, 503);
    assert.equal((await post(handler)).statusCode, 429);
    assert.equal((await post(handler, 'http://localhost:3010', 'POST', '2.2.2.2')).statusCode, 503, 'per address');
  });

  it('asks OpenAI for the settings in the docs and hands over only the short-lived key', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    openAI({ status: 200, body: { value: 'ek_abc', expires_at: 1, session: {} } });
    const res = await post(load());
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { value: 'ek_abc' });
    assert.equal(calls[0].url, 'https://api.openai.com/v1/realtime/client_secrets');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');
    const { session } = calls[0].body;
    assert.equal(session.type, 'realtime');
    assert.equal(session.model, 'gpt-realtime-2.1');
    assert.deepEqual(session.reasoning, { effort: 'low' });
    assert.equal(session.audio.output.voice, 'marin');
    assert.deepEqual(session.audio.input.noise_reduction, { type: 'far_field' });
    assert.equal(session.audio.input.transcription.model, 'gpt-live-transcribe');
    assert.deepEqual(session.audio.input.transcription.languages, ['en']);
    assert.equal(session.audio.input.transcription.language, undefined, 'the docs: do not send both');
    assert.equal(session.audio.input.turn_detection.type, 'semantic_vad');
    assert.equal(session.audio.input.turn_detection.interrupt_response, true);
    assert.equal(session.audio.input.turn_detection.create_response, true);
    assert.deepEqual(session.tools.map((tool) => tool.name), ['end_call', 'wait_for_user']);
  });

  it('keywords follow the rules in the docs', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    openAI({ status: 200, body: { value: 'ek' } });
    await post(load());
    calls[0].body.session.audio.input.transcription.keywords.forEach((word) => assert.doesNotMatch(word, /[<>\r\n]/));
  });

  it('the persona has the scene that was asked for', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    openAI({ status: 200, body: { value: 'ek' } });
    await post(load());
    const { instructions } = calls[0].body.session;
    assert.ok(instructions.includes(`"Okay, I'll take the banana."`));
    assert.ok(instructions.includes(`"No thanks, I'll pass."`));
    assert.match(instructions, /He speaks first/);
    assert.match(instructions, /asking whether you want or like one, does not count/);
    assert.match(instructions, /If he said anything to you, reply/);
    assert.match(instructions, /pizza/);
    assert.match(instructions, /you are an AI/);
    assert.match(instructions, /One or two short/);
    assert.doesNotMatch(instructions, /career|personality test|Dr\. Lipp/i);
  });

  it('falls back to the older transcription model if OpenAI refuses the new one', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    openAI(
      { status: 400, body: { error: { code: 'invalid_value', param: 'session.audio.input.transcription.model', message: 'no' } } },
      { status: 200, body: { value: 'ek_fallback' } },
    );
    const res = await post(load());
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.value, 'ek_fallback');
    assert.equal(calls.length, 2);
    const second = calls[1].body.session.audio.input.transcription;
    assert.equal(second.model, 'gpt-4o-transcribe');
    assert.equal(second.language, 'en');
    assert.equal(second.languages, undefined);
    assert.equal(second.keywords, undefined);
  });

  it('tells the page when there are no credits, in any of the documented codes', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    for (const code of ['insufficient_quota', 'credit_balance_exhausted', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded']) {
      openAI({ status: 429, body: { error: { code, message: 'x' } } });
      const res = await post(load());
      assert.equal(res.body.code, 'no_credits', code);
    }
  });

  it('never logs an OpenAI message or the key, and never returns one', async () => {
    process.env.OPENAI_API_KEY = 'test-secret-key';
    openAI({ status: 401, body: { error: { code: 'invalid_api_key', message: 'Incorrect API key provided: test-secret-key' } } });
    const res = await post(load());
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.code, 'upstream');
    assert.doesNotMatch(JSON.stringify(res.body), /test-secret-key/);
    assert.doesNotMatch(logged.join(' '), /test-secret-key|Incorrect/);
  });

  it('a network failure or a broken answer is a clean error', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    assert.equal((await post(load())).statusCode, 502);
    openAI({ status: 200, body: { nope: true } });
    assert.equal((await post(load())).statusCode, 502);
  });

  it('the model can be changed from the environment', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_REALTIME_MODEL = 'gpt-realtime-1.5';
    process.env.OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-transcribe';
    openAI({ status: 200, body: { value: 'ek' } });
    await post(load());
    assert.equal(calls[0].body.session.model, 'gpt-realtime-1.5');
    assert.equal(calls[0].body.session.reasoning, undefined, 'older models have no reasoning setting');
    assert.equal(calls[0].body.session.audio.input.transcription.language, 'en');
  });
});
