// audio effects (WebAudio graph factories) + audio transitions
import { N, SEL, BOOL } from './fx.js';
export const AFX = {};
export const ACATS = ['Amplitude and Compression', 'Delay and Echo', 'Filter and EQ', 'Modulation', 'Noise Reduction/Restoration', 'Reverb', 'Special', 'Stereo Imagery', 'Time and Pitch'];
const adef = (type, name, cat, params, build) => { AFX[type] = { type, name, cat, params, build, audio: true }; };
const dB = x => Math.pow(10, x / 20);

// ---------------- worklet (gate / declick / declip / pitch) ----------------
const WK = `
class OPFx extends AudioWorkletProcessor {
  constructor(o){ super(); this.mode = o.processorOptions.mode; this.p = {}; this.st = []; this.port.onmessage = e => Object.assign(this.p, e.data); this.env = 0; this.g = 1;
    this.buf = [new Float32Array(8192), new Float32Array(8192)]; this.w = 0; this.ph = 0; this.prev = [0,0]; this.avg = [0,0]; this.hold=[0,0]; this.cnt=[0,0]; }
  process(ins, outs){
    const i = ins[0], o = outs[0]; if(!i.length) return true; const n = i[0].length, p = this.p;
    if(this.mode === 'gate'){
      const thr = Math.pow(10, (p.thr ?? -50)/20), fl = Math.pow(10, (p.floor ?? -30)/20), at = Math.exp(-1/(sampleRate*Math.max(.0005,(p.att ?? 5)/1000))), rl = Math.exp(-1/(sampleRate*Math.max(.001,(p.rel ?? 150)/1000)));
      for(let k=0;k<n;k++){ let m = 0; for(let c=0;c<i.length;c++) m = Math.max(m, Math.abs(i[c][k]));
        this.env = m > this.env ? at*this.env + (1-at)*m : rl*this.env + (1-rl)*m;
        const tg = this.env >= thr ? 1 : Math.max(fl, Math.pow(this.env/thr, 2)); this.g += (tg - this.g) * (tg > this.g ? .02 : .002);
        for(let c=0;c<o.length;c++) o[c][k] = (i[c]||i[0])[k] * this.g; }
    } else if(this.mode === 'declick'){
      const sens = p.sens ?? 6, maxn = Math.round(sampleRate*(p.len ?? 2)/1000);
      for(let c=0;c<o.length;c++){ const x = (i[c]||i[0]), y = o[c]; this.p1 ||= [0,0]; this.p2 ||= [0,0];
        for(let k=0;k<n;k++){ const v = x[k], d2 = Math.abs(v - 2*this.p1[c] + this.p2[c]); let out;
          if(this.cnt[c] > 0){ out = (this.p1[c] + (this.p1[c] - this.p2[c])*.5); this.cnt[c]--; }
          else if(d2 > this.avg[c]*sens + .03){ this.cnt[c] = Math.min(maxn, 24); out = (this.p1[c] + (this.p1[c] - this.p2[c])*.5); this.avg[c] = this.avg[c]*.995 + Math.min(d2, this.avg[c]*sens*3 + .05)*.005; }
          else { out = v; this.avg[c] = this.avg[c]*.995 + d2*.005; }
          y[k] = out; this.p2[c] = this.p1[c]; this.p1[c] = out; } }
    } else if(this.mode === 'declip'){
      const dr = Math.max(.1, p.drive ?? 1.5), nn = Math.tanh(dr);
      for(let c=0;c<o.length;c++){ const x = (i[c]||i[0]), y = o[c]; for(let k=0;k<n;k++){ const v = x[k]; y[k] = Math.abs(v) > .85 ? Math.sign(v)*(.85 + (Math.tanh((Math.abs(v)-.85)*dr*3)/ (Math.tanh(dr*3)))*.15) : v; } }
    } else if(this.mode === 'pitch'){
      const r = Math.pow(2, ((p.semi ?? 0) + (p.cents ?? 0)/100)/12), L = 4096;
      for(let k=0;k<n;k++){
        for(let c=0;c<o.length;c++){ this.buf[c%2][this.w] = (i[c]||i[0])[k]; }
        this.ph += (1 - r)/L; this.ph -= Math.floor(this.ph);
        const d1 = this.ph*L, d2 = ((this.ph+.5)%1)*L, w1 = Math.sin(Math.PI*this.ph), w2 = Math.sin(Math.PI*((this.ph+.5)%1));
        for(let c=0;c<o.length;c++){ const b = this.buf[c%2]; const r1 = (this.w - d1 + 8192) % 8192, r2 = (this.w - d2 + 8192) % 8192;
          const a1 = b[Math.floor(r1)], a2 = b[Math.floor(r2)]; o[c][k] = a1*w1*w1 + a2*w2*w2 + 0; }
        this.w = (this.w + 1) % 8192;
      }
    } else { for(let c=0;c<o.length;c++) o[c].set(i[c]||i[0]); }
    return true;
  }
}
registerProcessor('op-fx', OPFx);`;
const wkState = new WeakMap();
export function wkReady(ac) { const s = wkState.get(ac); return s && s.ok; }
export function wkInit(ac) {
  if (wkState.has(ac)) return; const s = { ok: false }; wkState.set(ac, s);
  try { const url = URL.createObjectURL(new Blob([WK], { type: 'text/javascript' })); ac.audioWorklet.addModule(url).then(() => { s.ok = true; document.dispatchEvent(new Event('op-wk')); }).catch(e => console.warn('worklet', e)); } catch (e) { console.warn('worklet unsupported', e); }
}
const wk = (ac, mode, ch = 2) => new AudioWorkletNode(ac, 'op-fx', { processorOptions: { mode }, outputChannelCount: [ch], channelCount: ch, channelCountMode: 'explicit' });

// ---------------- helpers ----------------
const gn = (ac, v = 1) => { const g = ac.createGain(); g.gain.value = v; return g; };
const bq = (ac, type, f = 1000, q = 1, g = 0) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g; return b; };
const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return { in: n[0], out: n[n.length - 1] }; };
const set = (prm, v, ac) => { try { prm.setTargetAtTime(v, ac.currentTime, .02); } catch { prm.value = v; } };
// parallel dry/wet wrapper
function dw(ac, wet) { const i = gn(ac), o = gn(ac), d = gn(ac), w = gn(ac); i.connect(d); d.connect(o); i.connect(wet.in); wet.out.connect(w); w.connect(o); return { in: i, out: o, mix(m) { set(d.gain, 1 - m, ac); set(w.gain, m, ac); } }; }
const curve = (fn, n = 2048) => { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1); return c; };
const sat = (ac, drive, kind = 0) => { const w = ac.createWaveShaper(); w.oversample = '2x'; w.curve = curve(x => { const d = drive; if (kind === 1) return Math.max(-1, Math.min(1, x * d)); if (kind === 2) return Math.sign(x) * (1 - Math.exp(-Math.abs(x) * d)); return Math.tanh(x * d) / Math.tanh(d); }); return w; };
function ir(ac, secs, decay, damp = .5, pre = 0, wide = 1) {
  const sr = ac.sampleRate, n = Math.max(1, Math.floor(sr * secs)), b = ac.createBuffer(2, n + Math.floor(pre * sr), sr);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n, e = Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1); const r = (Math.random() * 2 - 1); lp = lp + (r - lp) * (1 - damp * .92); d[i + Math.floor(pre * sr)] = lp * e * (c && wide < 1 ? (.5 + .5 * wide) : 1); } }
  return b;
}
const lazy = (ac, key, mk) => { ac.__c ||= {}; return ac.__c[key] ||= mk(); };

// ---------------- Amplitude and Compression ----------------
adef('amplify', 'Amplify', 'Amplitude and Compression', [N('gain', 'Gain (dB)', -30, 30, 0, .1)], ac => { const g = gn(ac); return { in: g, out: g, set: v => set(g.gain, dB(v.gain), ac) }; });
adef('chvol', 'Channel Volume', 'Amplitude and Compression', [N('l', 'Left (dB)', -60, 15, 0, .1), N('r', 'Right (dB)', -60, 15, 0, .1)], ac => {
  const sp = ac.createChannelSplitter(2), m = ac.createChannelMerger(2), l = gn(ac), r = gn(ac), i = gn(ac); i.channelCount = 2; i.channelCountMode = 'explicit'; i.connect(sp); sp.connect(l, 0); sp.connect(r, 1); l.connect(m, 0, 0); r.connect(m, 0, 1);
  return { in: i, out: m, set: v => { set(l.gain, dB(v.l), ac); set(r.gain, dB(v.r), ac); } }; });
adef('declipper', 'DeClipper', 'Amplitude and Compression', [N('drive', 'Gain', .1, 6, 1.5, .1)], ac => { if (!wkReady(ac)) return null; const n = wk(ac, 'declip'); return { in: n, out: n, set: v => n.port.postMessage({ drive: v.drive }) }; });
function comp(ac, thr, ratio, att, rel, knee = 6) { const c = ac.createDynamicsCompressor(); c.threshold.value = thr; c.ratio.value = ratio; c.attack.value = att; c.release.value = rel; c.knee.value = knee; return c; }
adef('dynamics', 'Dynamics', 'Amplitude and Compression', [N('thr', 'Compressor Threshold (dB)', -60, 0, -20, .1), N('ratio', 'Ratio', 1, 20, 3, .1), N('att', 'Attack (ms)', 0, 200, 10, 1), N('rel', 'Release (ms)', 10, 1000, 200, 1), N('make', 'Makeup Gain (dB)', 0, 30, 0, .1)], ac => { const c = comp(ac, -20, 3, .01, .2), g = gn(ac); c.connect(g); return { in: c, out: g, set: v => { set(c.threshold, v.thr, ac); set(c.ratio, v.ratio, ac); set(c.attack, v.att / 1000, ac); set(c.release, v.rel / 1000, ac); set(g.gain, dB(v.make), ac); } }; });
adef('limiter', 'Hard Limiter', 'Amplitude and Compression', [N('max', 'Maximum Amplitude (dB)', -24, 0, -3, .1), N('in', 'Input Boost (dB)', 0, 24, 0, .1), N('rel', 'Release (ms)', 1, 500, 100, 1)], ac => { const i = gn(ac), c = comp(ac, -3, 20, .001, .1, 0), o = gn(ac); chain(i, c, o); return { in: i, out: o, set: v => { set(i.gain, dB(v.in), ac); set(c.threshold, v.max, ac); set(c.release, v.rel / 1000, ac); } }; });
adef('multiband', 'Multiband Compressor', 'Amplitude and Compression', [N('x1', 'Crossover 1 (Hz)', 40, 1000, 200, 1), N('x2', 'Crossover 2 (Hz)', 1000, 12000, 3000, 1), N('thr', 'Threshold (dB)', -60, 0, -24, .1), N('ratio', 'Ratio', 1, 20, 3, .1), N('make', 'Makeup Gain (dB)', 0, 24, 0, .1)], ac => {
  const i = gn(ac), o = gn(ac); const lo = bq(ac, 'lowpass', 200, .7), b1 = bq(ac, 'highpass', 200, .7), b2 = bq(ac, 'lowpass', 3000, .7), hi = bq(ac, 'highpass', 3000, .7); const cs = [comp(ac, -24, 3, .01, .2), comp(ac, -24, 3, .01, .2), comp(ac, -24, 3, .01, .2)];
  i.connect(lo); lo.connect(cs[0]); i.connect(b1); b1.connect(b2); b2.connect(cs[1]); i.connect(hi); hi.connect(cs[2]); cs.forEach(c => c.connect(o));
  return { in: i, out: o, set: v => { set(lo.frequency, v.x1, ac); set(b1.frequency, v.x1, ac); set(b2.frequency, v.x2, ac); set(hi.frequency, v.x2, ac); cs.forEach(c => { set(c.threshold, v.thr, ac); set(c.ratio, v.ratio, ac); }); set(o.gain, dB(v.make), ac); } }; });
adef('singleband', 'Single-band Compressor', 'Amplitude and Compression', [N('thr', 'Threshold (dB)', -60, 0, -20, .1), N('ratio', 'Ratio', 1, 20, 3, .1), N('att', 'Attack (ms)', 0, 200, 10, 1), N('rel', 'Release (ms)', 10, 1000, 200, 1), N('make', 'Output Gain (dB)', -12, 24, 0, .1)], ac => { const c = comp(ac, -20, 3, .01, .2), g = gn(ac); c.connect(g); return { in: c, out: g, set: v => { set(c.threshold, v.thr, ac); set(c.ratio, v.ratio, ac); set(c.attack, v.att / 1000, ac); set(c.release, v.rel / 1000, ac); set(g.gain, dB(v.make), ac); } }; });
adef('tube', 'Tube-modeled Compressor', 'Amplitude and Compression', [N('thr', 'Threshold (dB)', -60, 0, -18, .1), N('ratio', 'Ratio', 1, 20, 3, .1), N('warm', 'Tube Warmth', 0, 100, 30), N('make', 'Output Gain (dB)', -12, 24, 0, .1)], ac => { const c = comp(ac, -18, 3, .005, .15), s = sat(ac, 1.5), g = gn(ac); chain(c, s, g); return { in: c, out: g, set: v => { set(c.threshold, v.thr, ac); set(c.ratio, v.ratio, ac); s.curve = curve(x => Math.tanh(x * (1 + v.warm * .04) + .1 * v.warm * .01) / Math.tanh(1 + v.warm * .04)); set(g.gain, dB(v.make), ac); } }; });

// ---------------- Delay and Echo ----------------
adef('delay', 'Delay', 'Delay and Echo', [N('delay', 'Delay (sec)', 0, 2, .25, .01), N('fb', 'Feedback (%)', 0, 95, 0), N('mix', 'Mix (%)', 0, 100, 50)], ac => {
  const d = ac.createDelay(2), f = gn(ac, 0); d.connect(f); f.connect(d); const w = { in: d, out: d }; const x = dw(ac, w); return { in: x.in, out: x.out, set: v => { set(d.delayTime, v.delay, ac); set(f.gain, v.fb / 100, ac); x.mix(v.mix / 100); } }; });
adef('echo', 'Echo', 'Delay and Echo', [N('delay', 'Delay (ms)', 10, 1500, 300, 1), N('fb', 'Feedback (%)', 0, 95, 40), N('mix', 'Mix (%)', 0, 100, 40)], ac => {
  const d = ac.createDelay(2), f = gn(ac, .4), lp = bq(ac, 'lowpass', 5000); d.connect(lp); lp.connect(f); f.connect(d); const x = dw(ac, { in: d, out: lp }); return { in: x.in, out: x.out, set: v => { set(d.delayTime, v.delay / 1000, ac); set(f.gain, v.fb / 100, ac); x.mix(v.mix / 100); } }; });

// ---------------- Filter and EQ ----------------
adef('fft', 'FFT Filter', 'Filter and EQ', [N('hp', 'Low Cut (Hz)', 20, 2000, 20, 1), N('lp', 'High Cut (Hz)', 1000, 20000, 20000, 1), N('gain', 'Gain (dB)', -24, 24, 0, .1)], ac => { const h = bq(ac, 'highpass', 20, .7), l = bq(ac, 'lowpass', 20000, .7), g = gn(ac); chain(h, l, g); return { in: h, out: g, set: v => { set(h.frequency, v.hp, ac); set(l.frequency, v.lp, ac); set(g.gain, dB(v.gain), ac); } }; });
const GEQ = { 10: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000], 20: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000, 20000, 31, 50, 80, 125].sort((a, b) => a - b), 30: [25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000] };
for (const n of [10, 20, 30]) {
  const fr = GEQ[n];
  adef('geq' + n, `Graphic Equalizer (${n} Bands)`, 'Filter and EQ', fr.map((f, i) => N('b' + i, (f >= 1000 ? f / 1000 + ' kHz' : f + ' Hz'), -15, 15, 0, .1)), ac => { const fs = fr.map(f => bq(ac, 'peaking', f, n === 10 ? 1.4 : n === 20 ? 2.5 : 4.3, 0)); const c = chain(...fs); return { in: c.in, out: c.out, set: v => fs.forEach((f, i) => set(f.gain, v['b' + i], ac)) }; });
}
adef('highpass', 'Highpass', 'Filter and EQ', [N('f', 'Cutoff (Hz)', 20, 5000, 100, 1), N('order', 'Order', 1, 4, 2, 1)], ac => { const fs = [0, 1, 2, 3].map(() => bq(ac, 'highpass', 100, .707)); const c = chain(...fs); return { in: c.in, out: c.out, set: v => fs.forEach((x, i) => { set(x.frequency, v.f, ac); x.Q.value = .707; x.type = i < v.order ? 'highpass' : 'allpass'; }) }; });
adef('lowpass', 'Lowpass', 'Filter and EQ', [N('f', 'Cutoff (Hz)', 200, 20000, 8000, 1), N('order', 'Order', 1, 4, 2, 1)], ac => { const fs = [0, 1, 2, 3].map(() => bq(ac, 'lowpass', 8000, .707)); const c = chain(...fs); return { in: c.in, out: c.out, set: v => fs.forEach((x, i) => { set(x.frequency, v.f, ac); x.type = i < v.order ? 'lowpass' : 'allpass'; }) }; });
adef('notch', 'Notch Filter', 'Filter and EQ', [N('f', 'Center (Hz)', 20, 20000, 1000, 1), N('q', 'Q', .5, 50, 10, .1), N('n', 'Notches', 1, 3, 1, 1)], ac => { const fs = [1, 2, 3].map(k => bq(ac, 'notch', 1000, 10)); const c = chain(...fs); return { in: c.in, out: c.out, set: v => fs.forEach((x, i) => { set(x.frequency, v.f * (i + 1), ac); x.Q.value = v.q; x.type = i < v.n ? 'notch' : 'allpass'; }) }; });
adef('parametric', 'Parametric Equalizer', 'Filter and EQ', [N('lf', 'Low Shelf Freq', 20, 1000, 120, 1), N('lg', 'Low Shelf Gain', -20, 20, 0, .1), N('m1f', 'Mid 1 Freq', 100, 8000, 500, 1), N('m1g', 'Mid 1 Gain', -20, 20, 0, .1), N('m1q', 'Mid 1 Q', .1, 10, 1, .1), N('m2f', 'Mid 2 Freq', 200, 12000, 2500, 1), N('m2g', 'Mid 2 Gain', -20, 20, 0, .1), N('m2q', 'Mid 2 Q', .1, 10, 1, .1), N('hf', 'High Shelf Freq', 1000, 20000, 8000, 1), N('hg', 'High Shelf Gain', -20, 20, 0, .1)], ac => {
  const a = bq(ac, 'lowshelf'), b = bq(ac, 'peaking'), c = bq(ac, 'peaking'), d = bq(ac, 'highshelf'); const ch = chain(a, b, c, d);
  return { in: ch.in, out: ch.out, set: v => { set(a.frequency, v.lf, ac); set(a.gain, v.lg, ac); set(b.frequency, v.m1f, ac); set(b.gain, v.m1g, ac); b.Q.value = v.m1q; set(c.frequency, v.m2f, ac); set(c.gain, v.m2g, ac); c.Q.value = v.m2q; set(d.frequency, v.hf, ac); set(d.gain, v.hg, ac); } }; });
adef('scientific', 'Scientific Filter', 'Filter and EQ', [SEL('type', 'Filter Type', ['Lowpass', 'Highpass', 'Bandpass', 'Bandstop']), N('f', 'Cutoff (Hz)', 20, 20000, 1000, 1), N('order', 'Order', 1, 4, 2, 1), N('q', 'Q / Width', .3, 20, 1, .1)], ac => {
  const fs = [0, 1, 2, 3].map(() => bq(ac, 'lowpass')); const c = chain(...fs); const T = ['lowpass', 'highpass', 'bandpass', 'notch'];
  return { in: c.in, out: c.out, set: v => fs.forEach((x, i) => { set(x.frequency, v.f, ac); x.Q.value = v.type >= 2 ? v.q : .707; x.type = i < v.order ? T[Math.round(v.type)] : 'allpass'; }) }; });

// ---------------- Modulation ----------------
function lfo(ac, rate) { const o = ac.createOscillator(); o.frequency.value = rate; o.start(); return o; }
adef('chorus', 'Chorus/Flanger', 'Modulation', [SEL('mode', 'Mode', ['Chorus', 'Flanger']), N('rate', 'Speed (Hz)', .05, 10, .6, .01), N('depth', 'Depth (%)', 0, 100, 50), N('fb', 'Feedback (%)', 0, 90, 0), N('mix', 'Mix (%)', 0, 100, 50)], ac => {
  const d = ac.createDelay(.1), o = lfo(ac, .6), dg = gn(ac, .003), fb = gn(ac, 0); o.connect(dg); dg.connect(d.delayTime); d.connect(fb); fb.connect(d); const x = dw(ac, { in: d, out: d });
  return { in: x.in, out: x.out, set: v => { const fl = v.mode >= .5; d.delayTime.value = fl ? .003 : .025; o.frequency.value = v.rate; dg.gain.value = (fl ? .002 : .008) * v.depth / 50; set(fb.gain, fl ? v.fb / 100 : 0, ac); x.mix(v.mix / 100); } }; });
adef('phaser', 'Phaser', 'Modulation', [N('rate', 'Rate (Hz)', .05, 10, .5, .01), N('depth', 'Depth (%)', 0, 100, 60), N('fb', 'Feedback (%)', 0, 90, 30), N('mix', 'Mix (%)', 0, 100, 50)], ac => {
  const aps = [0, 1, 2, 3].map(() => bq(ac, 'allpass', 800, .8)); const ch = chain(...aps); const o = lfo(ac, .5), og = gn(ac, 600); o.connect(og); aps.forEach(a => og.connect(a.frequency)); const fb = gn(ac, .3); ch.out.connect(fb); fb.connect(ch.in); const x = dw(ac, ch);
  return { in: x.in, out: x.out, set: v => { o.frequency.value = v.rate; og.gain.value = 1200 * v.depth / 100; set(fb.gain, v.fb / 100 * .8, ac); x.mix(v.mix / 100); } }; });

// ---------------- Noise reduction / restoration ----------------
const gateFx = (type, name, defs) => adef(type, name, 'Noise Reduction/Restoration', defs, ac => { if (!wkReady(ac)) return null; const n = wk(ac, 'gate'); return { in: n, out: n, set: v => n.port.postMessage(v) }; });
gateFx('denoise', 'DeNoise', [N('thr', 'Threshold (dB)', -80, -10, -50, .1), N('floor', 'Reduction (dB)', -60, 0, -24, .1), N('att', 'Attack (ms)', 1, 200, 5, 1), N('rel', 'Release (ms)', 10, 1000, 150, 1)].map(q => q));
gateFx('dereverb', 'DeReverb', [N('thr', 'Threshold (dB)', -60, -10, -35, .1), N('floor', 'Reduction (dB)', -40, 0, -12, .1), N('att', 'Attack (ms)', 1, 200, 10, 1), N('rel', 'Release (ms)', 10, 600, 60, 1)]);
adef('declicker', 'DeClicker', 'Noise Reduction/Restoration', [N('sens', 'Sensitivity', 2, 20, 6, .1), N('len', 'Max Click Length (ms)', .2, 5, 1.5, .1)], ac => { if (!wkReady(ac)) return null; const n = wk(ac, 'declick'); return { in: n, out: n, set: v => n.port.postMessage(v) }; });
adef('decrackler', 'DeCrackler', 'Noise Reduction/Restoration', [N('sens', 'Sensitivity', 2, 20, 4, .1), N('len', 'Max Crackle Length (ms)', .2, 5, 1, .1)], ac => { if (!wkReady(ac)) return null; const n = wk(ac, 'declick'); const lp = bq(ac, 'lowpass', 14000, .5); n.connect(lp); return { in: n, out: lp, set: v => n.port.postMessage(v) }; });
adef('deesser', 'DeEsser', 'Noise Reduction/Restoration', [N('f', 'Center (Hz)', 2000, 12000, 6500, 1), N('amt', 'Reduction (dB)', 0, 20, 6, .1)], ac => {
  const i = gn(ac), o = gn(ac), lo = bq(ac, 'lowpass', 6500, .7), hi = bq(ac, 'highpass', 6500, .7), c = comp(ac, -35, 8, .001, .06, 0); i.connect(lo); lo.connect(o); i.connect(hi); hi.connect(c); c.connect(o);
  return { in: i, out: o, set: v => { set(lo.frequency, v.f, ac); set(hi.frequency, v.f, ac); set(c.ratio, 1 + v.amt * .9, ac); } }; });
adef('dehummer', 'DeHummer', 'Noise Reduction/Restoration', [SEL('hz', 'Frequency', ['50 Hz', '60 Hz']), N('q', 'Q', 5, 80, 30, 1), N('h', 'Harmonics', 1, 5, 3, 1)], ac => { const fs = [1, 2, 3, 4, 5].map(() => bq(ac, 'notch', 50, 30)); const c = chain(...fs); return { in: c.in, out: c.out, set: v => fs.forEach((x, i) => { set(x.frequency, (v.hz >= .5 ? 60 : 50) * (i + 1), ac); x.Q.value = v.q; x.type = i < v.h ? 'notch' : 'allpass'; }) }; });

// ---------------- Reverb ----------------
adef('convolution', 'Convolution Reverb', 'Reverb', [SEL('room', 'Impulse', ['Small Room', 'Large Hall', 'Cathedral', 'Plate', 'Spring']), N('mix', 'Mix (%)', 0, 100, 30), N('pre', 'Pre-delay (ms)', 0, 200, 0)], ac => {
  const cv = ac.createConvolver(); const x = dw(ac, { in: cv, out: cv }); let last = -1;
  return { in: x.in, out: x.out, set: v => { const r = Math.round(v.room); if (r !== last) { last = r; const P = [[.5, 3, .5], [2.4, 2.2, .4], [5, 1.8, .3], [1.6, 3.5, .1], [.9, 5, .7]][r]; cv.buffer = ir(ac, P[0], P[1], P[2], v.pre / 1000); } x.mix(v.mix / 100); } }; });
adef('studio', 'Studio Reverb', 'Reverb', [N('size', 'Room Size', 0, 100, 40), N('decay', 'Decay (s)', .1, 8, 1.4, .1), N('damp', 'Damping', 0, 100, 40), N('pre', 'Pre-delay (ms)', 0, 100, 10), N('dry', 'Dry (%)', 0, 100, 80), N('wet', 'Wet (%)', 0, 100, 25)], ac => {
  const cv = ac.createConvolver(), i = gn(ac), o = gn(ac), d = gn(ac), w = gn(ac); i.connect(d); d.connect(o); i.connect(cv); cv.connect(w); w.connect(o); let key = '';
  return { in: i, out: o, set: v => { const k = [v.size, v.decay, v.damp, v.pre].join(); if (k !== key) { key = k; cv.buffer = ir(ac, Math.min(8, v.decay * (.6 + v.size / 100)), 2.5, v.damp / 100, v.pre / 1000); } set(d.gain, v.dry / 100, ac); set(w.gain, v.wet / 100, ac); } }; });
adef('surround', 'Surround Reverb', 'Reverb', [N('decay', 'Decay (s)', .2, 8, 2, .1), N('wide', 'Width', 0, 100, 80), N('mix', 'Mix (%)', 0, 100, 30)], ac => {
  const cv = ac.createConvolver(); const x = dw(ac, { in: cv, out: cv }); let key = '';
  return { in: x.in, out: x.out, set: v => { const k = v.decay + ':' + v.wide; if (k !== key) { key = k; cv.buffer = ir(ac, v.decay, 2, .45, .015, v.wide / 100); } x.mix(v.mix / 100); } }; });

// ---------------- Special ----------------
adef('distortion', 'Distortion', 'Special', [SEL('kind', 'Type', ['Soft Clip', 'Hard Clip', 'Tube']), N('drive', 'Drive', 1, 40, 8, .1), N('tone', 'Tone (Hz)', 500, 18000, 8000, 1), N('mix', 'Mix (%)', 0, 100, 100), N('out', 'Output (dB)', -30, 6, -6, .1)], ac => {
  const w = ac.createWaveShaper(); w.oversample = '4x'; const lp = bq(ac, 'lowpass', 8000, .7), g = gn(ac); chain(w, lp, g); const x = dw(ac, { in: w, out: g });
  return { in: x.in, out: x.out, set: v => { const k = Math.round(v.kind), d = v.drive; w.curve = curve(k === 1 ? (z => Math.max(-1, Math.min(1, z * d))) : k === 2 ? (z => Math.sign(z) * (1 - Math.exp(-Math.abs(z) * d))) : (z => Math.tanh(z * d))); set(lp.frequency, v.tone, ac); set(g.gain, dB(v.out), ac); x.mix(v.mix / 100); } }; });
adef('guitar', 'Guitar Suite', 'Special', [N('comp', 'Compressor (%)', 0, 100, 30), N('drive', 'Drive', 1, 30, 6, .1), N('bass', 'Bass (dB)', -12, 12, 0, .1), N('treble', 'Treble (dB)', -12, 12, 2, .1), N('chorus', 'Chorus (%)', 0, 100, 20), N('verb', 'Reverb (%)', 0, 100, 20)], ac => {
  const c = comp(ac, -30, 4, .005, .15), s = ac.createWaveShaper(), lo = bq(ac, 'lowshelf', 200), hi = bq(ac, 'highshelf', 3500), ch = ac.createDelay(.1), o = lfo(ac, .8), og = gn(ac, .004), cv = ac.createConvolver(); o.connect(og); og.connect(ch.delayTime); ch.delayTime.value = .02; cv.buffer = ir(ac, 1.4, 3, .5);
  const pre = chain(c, s, lo, hi); const a = dw(ac, { in: ch, out: ch }), b = dw(ac, { in: cv, out: cv }); pre.out.connect(a.in); a.out.connect(b.in);
  return { in: pre.in, out: b.out, set: v => { set(c.ratio, 1 + v.comp * .12, ac); s.curve = curve(z => Math.tanh(z * v.drive) / Math.tanh(v.drive)); set(lo.gain, v.bass, ac); set(hi.gain, v.treble, ac); a.mix(v.chorus / 200); b.mix(v.verb / 150); } }; });
adef('loudness', 'Loudness Radar Meter', 'Special', [BOOL('on', 'Measure', true)], ac => { const g = gn(ac); const an = ac.createAnalyser(); an.fftSize = 2048; g.connect(an); return { in: g, out: g, set: () => {}, an }; });
adef('vocal', 'Vocal Enhancer', 'Special', [SEL('kind', 'Type', ['Male', 'Female', 'Music', 'Music w/ vocal']), N('amt', 'Amount (%)', 0, 100, 50)], ac => {
  const hp = bq(ac, 'highpass', 80, .7), pres = bq(ac, 'peaking', 3500, 1, 0), air = bq(ac, 'highshelf', 9000, .7, 0), c = comp(ac, -26, 3, .01, .2), o = gn(ac); chain(hp, pres, air, c, o);
  return { in: hp, out: o, set: v => { const k = Math.round(v.kind), a = v.amt / 100; set(hp.frequency, k === 0 ? 90 : k === 1 ? 140 : 40, ac); set(pres.frequency, k === 0 ? 2800 : k === 1 ? 4200 : 3000, ac); set(pres.gain, 5 * a, ac); set(air.gain, 4 * a, ac); set(c.ratio, 1 + 3 * a, ac); } }; });

// ---------------- Stereo imagery ----------------
adef('balance', 'Balance', 'Stereo Imagery', [N('bal', 'Balance', -100, 100, 0, 1)], ac => {
  const sp = ac.createChannelSplitter(2), m = ac.createChannelMerger(2), l = gn(ac), r = gn(ac), i = gn(ac); i.channelCount = 2; i.channelCountMode = 'explicit'; i.connect(sp); sp.connect(l, 0); sp.connect(r, 1); l.connect(m, 0, 0); r.connect(m, 0, 1);
  return { in: i, out: m, set: v => { set(l.gain, v.bal > 0 ? 1 - v.bal / 100 : 1, ac); set(r.gain, v.bal < 0 ? 1 + v.bal / 100 : 1, ac); } }; });
adef('invert', 'Invert', 'Stereo Imagery', [BOOL('l', 'Left', true), BOOL('r', 'Right', true)], ac => {
  const sp = ac.createChannelSplitter(2), m = ac.createChannelMerger(2), l = gn(ac), r = gn(ac), i = gn(ac); i.channelCount = 2; i.channelCountMode = 'explicit'; i.connect(sp); sp.connect(l, 0); sp.connect(r, 1); l.connect(m, 0, 0); r.connect(m, 0, 1);
  return { in: i, out: m, set: v => { set(l.gain, v.l >= .5 ? -1 : 1, ac); set(r.gain, v.r >= .5 ? -1 : 1, ac); } }; });
adef('expander', 'Stereo Expander', 'Stereo Imagery', [N('width', 'Width (%)', 0, 300, 100)], ac => {
  const i = gn(ac); i.channelCount = 2; i.channelCountMode = 'explicit'; const sp = ac.createChannelSplitter(2), m = ac.createChannelMerger(2);
  const mid = gn(ac, .5), sideL = gn(ac, .5), sideR = gn(ac, -.5), side = gn(ac, 1), wide = gn(ac, 1), outL = gn(ac), outR = gn(ac), invS = gn(ac, -1);
  i.connect(sp); sp.connect(mid, 0); sp.connect(mid, 1); sp.connect(sideL, 0); sp.connect(sideR, 1); sideL.connect(side); sideR.connect(side); side.connect(wide);
  mid.connect(outL); wide.connect(outL); mid.connect(outR); wide.connect(invS); invS.connect(outR); outL.connect(m, 0, 0); outR.connect(m, 0, 1);
  return { in: i, out: m, set: v => set(wide.gain, v.width / 100, ac) }; });

// ---------------- Time and pitch ----------------
adef('pitch', 'Pitch Shifter', 'Time and Pitch', [N('semi', 'Semitones', -12, 12, 0, 1), N('cents', 'Cents', -100, 100, 0, 1)], ac => { if (!wkReady(ac)) return null; const n = wk(ac, 'pitch'); return { in: n, out: n, set: v => n.port.postMessage(v) }; });

// ================= audio transitions =================
export const ATRANS = {
  constantGain: { type: 'constantGain', name: 'Constant Gain', cat: 'Crossfade', params: [], fin: p => p, fout: p => 1 - p },
  constantPower: { type: 'constantPower', name: 'Constant Power', cat: 'Crossfade', params: [], fin: p => Math.sin(p * Math.PI / 2), fout: p => Math.cos(p * Math.PI / 2) },
  exponential: { type: 'exponential', name: 'Exponential Fade', cat: 'Crossfade', params: [], fin: p => p * p, fout: p => (1 - p) * (1 - p) },
};
export const DEFAULT_AT = 'constantPower';

// -------- per-clip chains --------
// clip: audio clip, el: media element, pb: playback object. Returns the chain {vg, tg}
export function chainFor(pb, el, clip) {
  const ac = pb.ac; wkInit(ac);
  let ch = el.__ch;
  if (!ch) {
    let src; try { src = ac.createMediaElementSource(el); } catch { return null; }
    ch = el.__ch = { src, vg: gn(ac), tg: gn(ac), nodes: [], sig: '' };
  }
  const fxs = (clip.fx || []).filter(f => f.on !== false && AFX[f.type]);
  const sig = fxs.map(f => f.type + f.id).join('|') + (wkReady(ac) ? ':w' : '');
  if (sig !== ch.sig) {
    ch.sig = sig;
    try { ch.src.disconnect(); ch.vg.disconnect(); ch.tg.disconnect(); } catch {}
    ch.nodes.forEach(n => { try { n.out.disconnect(); } catch {} }); ch.nodes = [];
    let last = ch.vg; ch.src.connect(ch.vg);
    for (const f of fxs) { const n = AFX[f.type].build(ac); if (!n) continue; n.fx = f; last.connect(n.in); last = n.out; ch.nodes.push(n); }
    last.connect(ch.tg); ch.tg.connect(pb.master);
  }
  return ch;
}
export function updateChain(ch, clip, lt, valFn, vol, tgain, ac) {
  ch.vg.gain.value = vol; ch.tg.gain.value = tgain;
  for (const n of ch.nodes) { const d = AFX[n.fx.type], v = {}; d.params.forEach(q => v[q.k] = valFn(clip, n.fx, q.k, lt)); const key = JSON.stringify(v); if (n.__k !== key) { n.__k = key; n.set(v); } }
}

// audio-transition gain for clip c on track tr at time t, and clips that need to play beyond their range
import { transRegion } from './trans.js';
export function audioTransGain(tr, c, t) {
  let g = 1;
  for (const o of tr.clips) for (const side of ['tin', 'tout']) {
    const r = transRegion(tr, o, side); if (!r || !r.x.audio) continue;
    const T = ATRANS[r.x.type]; if (!T || t < r.r0 || t >= r.r1) continue; const p = (t - r.r0) / (r.r1 - r.r0);
    if (r.b === c) g *= T.fin(p); else if (r.a === c) g *= T.fout(p);
  }
  return g;
}
export function audioClipsAt(tr, t) {
  const out = []; const m = tr.clips.find(c => !c.off && t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6); if (m) out.push(m);
  for (const o of tr.clips) for (const side of ['tin', 'tout']) { const r = transRegion(tr, o, side); if (!r || !r.x.audio || t < r.r0 || t >= r.r1) continue; for (const c of [r.a, r.b]) if (c && !out.includes(c)) out.push(c); }
  return out;
}
