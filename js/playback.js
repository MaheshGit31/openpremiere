import { P, bus, seqDur, clamp, findClip } from './core.js';
import { elFor, allEls, item } from './media.js';
import { Compositor } from './gl.js';
import { val } from './fx.js';
import { transRegion } from './trans.js';
import { gfxCanvas } from './gfx.js';
import { chainFor, updateChain, audioTransGain, audioClipsAt } from './afx.js';

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

  // active video transition on a track at time t
  transAt(tr, t) {
    for (const c of tr.clips) for (const side of ['tin', 'tout']) {
      const r = transRegion(tr, c, side);
      if (r && t >= r.r0 && t < r.r1) return { a: r.a, b: r.b, p: (t - r.r0) / (r.r1 - r.r0), tr: r.x };
    }
    return null;
  },
  clipAt(tr, t) { return tr.clips.find(c => !c.off && t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6); },
  speed(c) { const f = (c.fx || []).find(x => x.type === 'time'); const w = (c.fx || []).find(x => x.type === 'timeWarp' && x.on !== false); return (f ? (f.p.speed / 100) : 1) * (w ? (+w.p.speed || 100) / 100 : 1); },
  posterized(c) { return (c.fx || []).some(x => x.type === 'posterizeTime' && x.on !== false); },
  srcT(c, t) {
    const sp = this.speed(c); let lt = t - c.start;
    const pz = (c.fx || []).find(x => x.type === 'posterizeTime' && x.on !== false); if (pz) { const r = Math.max(1, +pz.p.rate || 12); lt = Math.floor(lt * r + 1e-6) / r; }
    return c.in + lt * sp;
  },

  // sync a media element with the timeline
  sync(c, it, t, playing, tr, soloAny) {
    if (c.gfx) return gfxCanvas(c, P.seq.w, P.seq.h, Math.max(0, t - c.start));
    const el = elFor(c, it);
    if (!el.__seek) { el.__seek = 1; el.addEventListener('seeked', () => this.invalidate()); el.addEventListener('loadeddata', () => this.invalidate()); }
    if (el.tagName === 'IMG') return el;
    const want = this.srcT(c, t), sp = this.speed(c) * (this.rate && Math.abs(this.rate) > 1 ? Math.abs(this.rate) : 1);
    if (c.type === 'a') {
      this.audioInit();
      const mute = tr.mute || (soloAny && !tr.solo);
      let vol = (c.vol == null ? 1 : c.vol);
      const vf = (c.fx || []).find(x => x.type === 'avol');
      if (vf) vol *= Math.pow(10, val(c, vf, 'db', t - c.start) / 20);
      vol *= (tr.vol == null ? 1 : tr.vol);
      const ch = chainFor(this, el, c);
      if (ch) { el.volume = 1; updateChain(ch, c, t - c.start, val, mute ? 0 : vol, audioTransGain(tr, c, t), this.ac); }
      else { this.hook(el); el.volume = mute ? 0 : clamp(vol, 0, 1); }
    }
    if (playing && this.rate > 0 && !this.posterized(c)) {
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
      if (tr.mute) continue;
      for (const c of audioClipsAt(tr, t)) { const it = item(c.item); if (it) { active.add(c.id); this.sync(c, it, t, playing, tr, soloAny); } }
    }
    const comp = this.comp;
    if (comp) {
      const W = s.w, H = s.h, qW = Math.round(W * this.q), qH = Math.round(H * this.q);
      comp.resize(qW, qH);
      comp.begin(qW, qH);
      const ready = (el) => el.tagName === 'CANVAS' ? true : el.tagName === 'IMG' ? el.complete && el.naturalWidth : el.readyState >= 2;
      const q = this.q;
      const mkLayer = (c, tr, tt, play) => {
        const it = item(c.item); if (!it) return null;
        tt = clamp(tt, c.start, c.start + c.dur - .5 / s.fps);
        active.add(c.id);
        const el = this.sync(c, it, tt, play, tr, soloAny);
        if (!ready(el)) return null;
        const sw = it.w || el.videoWidth, sh = it.h || el.videoHeight;
        let matte = null;
        const tm = (c.fx || []).find(f => f.type === 'trackMatte' && f.on !== false);
        if (tm) {
          const mt = s.v[Math.round(val(c, tm, 'track', tt - c.start)) - 1], mc = mt && this.clipAt(mt, tt), mi = mc && item(mc.item);
          if (mc && mi && mc !== c) { const me = this.sync(mc, mi, tt, play, mt, soloAny); if (ready(me)) { const r = comp.layer(mc, me, mi.w || me.videoWidth, mi.h || me.videoHeight, tt, qW, qH, { q }); if (r) matte = r.layer; } }
        }
        const r = comp.layer(c, el, sw, sh, tt, qW, qH, { matte, q });
        if (matte && matte.k) comp.release(matte);
        return r;
      };
      const rel = r => { if (r && r.layer && r.layer.k && !r.layer.keep) comp.release(r.layer); };
      for (const tr of s.v) {
        if (tr.mute) continue;
        const tx = this.transAt(tr, t);
        if (tx) {
          const la = tx.a ? mkLayer(tx.a, tr, t, playing && t < tx.a.start + tx.a.dur) : null;
          const lb = tx.b ? mkLayer(tx.b, tr, t, playing && t >= tx.b.start) : null;
          const out = comp.transition(tx.tr, la, lb, tx.p, qW, qH, t);
          rel(la); rel(lb);
          if (out) { comp.blendLayer(out, 1, 0); comp.release(out); }
          continue;
        }
        const c = this.clipAt(tr, t); if (!c) continue;
        const r = mkLayer(c, tr, t, playing);
        if (r) { comp.blendLayer(r.layer, r.op, r.mode); rel(r); }
      }
      comp.end();
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
