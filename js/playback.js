import { P, bus, seqDur, clamp, findClip } from './core.js';
import { elFor, allEls, item } from './media.js';
import { Compositor } from './gl.js';
import { val } from './fx.js';

export const pb = {
  comp: null, cv: null, rate: 0, q: 1, loop: false,
  _raf: 0, _inv: 0, _wall: 0, _t0: 0, _hooked: new WeakSet(),
  ac: null, master: null, an: [null, null], meterData: [0, 0], peak: [0, 0],

  attach(canvas) {
    this.cv = canvas;
    try { this.comp = new Compositor(canvas); } catch (e) { console.error(e); this.comp = null; }
    this.invalidate();
  },

  audioInit() {
    if (this.ac) return;
    const ac = this.ac = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ac.createGain();
    const sp = ac.createChannelSplitter(2);
    this.an = [ac.createAnalyser(), ac.createAnalyser()];
    this.an.forEach(a => { a.fftSize = 512; a.smoothingTimeConstant = .6; });
    this.master.connect(sp); sp.connect(this.an[0], 0); sp.connect(this.an[1], 1);
    this.master.connect(ac.destination);
    this.dest = ac.createMediaStreamDestination(); this.master.connect(this.dest);
  },
  hook(el) {
    if (!el || el.tagName === 'IMG' || this._hooked.has(el)) return;
    this._hooked.add(el);
    this.audioInit();
    try { const s = this.ac.createMediaElementSource(el); s.connect(this.master); } catch (e) { /* already hooked */ }
  },
  level() {
    if (!this.an[0]) return [0, 0];
    const d = new Uint8Array(512), out = [0, 0];
    this.an.forEach((a, i) => { a.getByteTimeDomainData(d); let m = 0; for (let k = 0; k < 256; k++) m = Math.max(m, Math.abs(d[k] - 128) / 128); out[i] = m; });
    return out;
  },

  get seq() { return P.seq; },
  invalidate() { if (this._inv) return; this._inv = requestAnimationFrame(() => { this._inv = 0; this.render(); }); },

  clipAt(tr, t) { return tr.clips.find(c => t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6); },
  speed(c) { const f = (c.fx || []).find(x => x.type === 'time'); return f ? (f.p.speed / 100) : 1; },
  srcT(c, t) { const sp = this.speed(c); return c.in + (t - c.start) * sp; },

  // sync a media element with the timeline
  sync(c, it, t, playing, tr, soloAny) {
    const el = elFor(c, it);
    if (!el.__seek) { el.__seek = 1; el.addEventListener('seeked', () => this.invalidate()); el.addEventListener('loadeddata', () => this.invalidate()); }
    if (el.tagName === 'IMG') return el;
    const want = this.srcT(c, t), sp = this.speed(c) * (this.rate && Math.abs(this.rate) > 1 ? Math.abs(this.rate) : 1);
    if (c.type === 'a') {
      this.hook(el);
      const mute = tr.mute || (soloAny && !tr.solo);
      let vol = (c.vol == null ? 1 : c.vol);
      const vf = (c.fx || []).find(x => x.type === 'avol');
      if (vf) vol *= Math.pow(10, val(c, vf, 'db', t - c.start) / 20);
      el.volume = mute ? 0 : clamp(vol * (tr.vol == null ? 1 : tr.vol), 0, 1);
    }
    if (playing && this.rate > 0) {
      if (el.paused || Math.abs(el.currentTime - want) > .3) { try { el.currentTime = want; } catch {} }
      el.playbackRate = clamp(sp, .0625, 16);
      if (el.paused) el.play().catch(() => {});
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - want) > .008) { try { el.currentTime = want; } catch {} }
    }
    return el;
  },

  render() {
    const s = P.seq; if (!s) return;
    const t = P.t, playing = this.playing;
    const soloAny = s.a.some(x => x.solo);
    const active = new Set();
    // audio
    for (const tr of s.a) {
      const c = this.clipAt(tr, t);
      if (c && !tr.mute) { const it = item(c.item); if (it) { active.add(c.id); this.sync(c, it, t, playing, tr, soloAny); } }
    }
    const comp = this.comp;
    if (comp) {
      const W = s.w, H = s.h;
      comp.resize(Math.round(W * this.q), Math.round(H * this.q));
      const g = comp.g;
      g.viewport(0, 0, comp.cv.width, comp.cv.height);
      g.useProgram(comp.pr); g.clearColor(0, 0, 0, 1); g.clear(g.COLOR_BUFFER_BIT);
      for (const tr of s.v) {
        if (tr.mute) continue;
        const c = this.clipAt(tr, t); if (!c) continue;
        const it = item(c.item); if (!it) continue;
        active.add(c.id);
        const el = this.sync(c, it, t, playing, tr, soloAny);
        const ready = el.tagName === 'IMG' ? el.complete && el.naturalWidth : el.readyState >= 2;
        if (!ready) continue;
        const sw = it.w || el.videoWidth, sh = it.h || el.videoHeight;
        comp.drawClip(c, el, sw, sh, t, W, H);
      }
    }
    // pause everything not active
    for (const [id, el] of allEls()) if (!active.has(id) && el.pause && !el.paused) el.pause();
    bus.emit('frame');
  },

  play() {
    const s = P.seq; if (!s) return;
    if (P.t >= seqDur() - .01) P.t = 0;
    this.audioInit(); this.ac.resume();
    this.rate = this.rate > 0 ? this.rate : 1;
    this.start();
  },
  start() {
    this.playing = P.playing = true; this._wall = performance.now(); this._t0 = P.t;
    cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(this.tick);
    bus.emit('transport');
  },
  pause() {
    this.playing = P.playing = false; this.rate = 0;
    cancelAnimationFrame(this._raf);
    for (const [, el] of allEls()) if (el.pause) el.pause();
    bus.emit('transport'); this.render();
  },
  toggle() { this.playing ? this.pause() : this.play(); },
  tick: () => {
    const self = pb;
    if (!self.playing) return;
    const now = performance.now();
    const dt = (now - self._wall) / 1000; self._wall = now;
    const end = seqDur();
    P.t += dt * self.rate;
    if (self.rate > 0 && P.t >= end) { if (self.loop) { P.t = 0; self._t0 = 0; } else { P.t = end; self.pause(); bus.emit('time'); return; } }
    if (self.rate < 0 && P.t <= 0) { P.t = 0; self.pause(); bus.emit('time'); return; }
    self.render(); bus.emit('time');
    self._raf = requestAnimationFrame(self.tick);
  },
  seek(t) {
    P.t = clamp(t, 0, Math.max(seqDur() + 600, 1)); this.invalidate(); bus.emit('time');
  },
  step(n) { const fps = P.seq ? P.seq.fps : 30; if (this.playing) this.pause(); this.seek(Math.max(0, Math.round(P.t * fps + n) / fps)); },
  shuttle(dir) {
    // J/K/L: repeated presses speed up
    const cur = this.playing ? this.rate : 0;
    let r;
    if (dir > 0) r = cur > 0 ? Math.min(8, cur * 2) : 1;
    else r = cur < 0 ? Math.max(-8, cur * 2) : -1;
    this.rate = r; this.audioInit(); this.ac.resume();
    if (r < 0) { this.playing = P.playing = true; this._wall = performance.now(); for (const [, el] of allEls()) el.pause && el.pause(); cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(this.tick); bus.emit('transport'); }
    else this.start();
  },
  frameAt(t) { return t; },
};
