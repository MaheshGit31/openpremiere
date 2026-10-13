import { uid, clamp, lerp } from './core.js';

// ---------- easing ----------
const bez = (x1, y1, x2, y2) => t => {
  if (t <= 0) return 0; if (t >= 1) return 1;
  let a = 0, b = 1, m = .5;
  for (let i = 0; i < 24; i++) {
    m = (a + b) / 2;
    const x = 3 * (1 - m) * (1 - m) * m * x1 + 3 * (1 - m) * m * m * x2 + m * m * m;
    if (x < t) a = m; else b = m;
  }
  return 3 * (1 - m) * (1 - m) * m * y1 + 3 * (1 - m) * m * m * y2 + m * m * m;
};
export const EASE = {
  linear: t => t,
  hold: t => (t < 1 ? 0 : 1),
  ease: bez(.25, .1, .25, 1), easeIn: bez(.42, 0, 1, 1), easeOut: bez(0, 0, .58, 1), easeInOut: bez(.42, 0, .58, 1),
  sineIn: t => 1 - Math.cos(t * Math.PI / 2), sineOut: t => Math.sin(t * Math.PI / 2), sineInOut: t => -(Math.cos(Math.PI * t) - 1) / 2,
  quadIn: t => t * t, quadOut: t => 1 - (1 - t) * (1 - t), quadInOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  cubicIn: t => t ** 3, cubicOut: t => 1 - Math.pow(1 - t, 3), cubicInOut: t => t < .5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2,
  quartIn: t => t ** 4, quartOut: t => 1 - Math.pow(1 - t, 4), quartInOut: t => t < .5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2,
  quintIn: t => t ** 5, quintOut: t => 1 - Math.pow(1 - t, 5), quintInOut: t => t < .5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2,
  expoIn: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10), expoOut: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t), expoInOut: t => t === 0 ? 0 : t === 1 ? 1 : t < .5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  circIn: t => 1 - Math.sqrt(1 - t * t), circOut: t => Math.sqrt(1 - (t - 1) ** 2), circInOut: t => t < .5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
  backIn: t => 2.70158 * t ** 3 - 1.70158 * t * t, backOut: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  backInOut: t => { const c = 1.70158 * 1.525; return t < .5 ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2 : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2; },
  elasticIn: t => t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI / 3)),
  elasticOut: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1,
  elasticInOut: t => { const c = 2 * Math.PI / 4.5; return t === 0 ? 0 : t === 1 ? 1 : t < .5 ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c)) / 2 : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c)) / 2 + 1; },
  bounceOut: t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; },
  bounceIn: t => 1 - EASE.bounceOut(1 - t),
  bounceInOut: t => t < .5 ? (1 - EASE.bounceOut(1 - 2 * t)) / 2 : (1 + EASE.bounceOut(2 * t - 1)) / 2,
};
export const EASE_NAMES = Object.keys(EASE);
const bezCache = {};
export const easeFn = e => {
  if (!e) return EASE.linear;
  if (typeof e === 'string' && e.startsWith('bezier(')) {
    return bezCache[e] ||= bez(...e.slice(7, -1).split(',').map(Number));
  }
  return EASE[e] || EASE.linear;
};

// ---------- effect registry ----------
// p: [key,label,min,max,default,step,unit]
const P_ = (k, l, mn, mx, d, st = 1, u = '') => ({ k, l, min: mn, max: mx, def: d, step: st, u });
export const FX = {};
const def = (type, name, cat, params, o = {}) => { FX[type] = { type, name, cat, params, ...o }; };

def('motion', 'Motion', 'Built-in', [
  P_('px', 'Position X', -8000, 8000, null, 1, 'px'), P_('py', 'Position Y', -8000, 8000, null, 1, 'px'),
  P_('scale', 'Scale', 0, 600, 100, 1, '%'), P_('sw', 'Scale Width', 0, 600, 100, 1, '%'),
  P_('rot', 'Rotation', -3600, 3600, 0, .1, '°'),
  P_('ax', 'Anchor X', -8000, 8000, null, 1, 'px'), P_('ay', 'Anchor Y', -8000, 8000, null, 1, 'px'),
  P_('flick', 'Anti-flicker', 0, 1, 0, .01),
], { builtin: true, hidden: true });
def('opacity', 'Opacity', 'Built-in', [P_('op', 'Opacity', 0, 100, 100, 1, '%')], { builtin: true, hidden: true });
def('avol', 'Volume', 'Built-in', [P_('db', 'Level', -60, 15, 0, .1, 'dB')], { builtin: true, hidden: true });
def('time', 'Time Remapping', 'Built-in', [P_('speed', 'Speed', 0, 1000, 100, 1, '%')], { builtin: true, hidden: true });

def('lumetri', 'Lumetri Color', 'Color Correction', [
  P_('temp', 'Temperature', -100, 100, 0), P_('tint', 'Tint', -100, 100, 0),
  P_('exposure', 'Exposure', -5, 5, 0, .01), P_('contrast', 'Contrast', -100, 100, 0),
  P_('highlights', 'Highlights', -100, 100, 0), P_('shadows', 'Shadows', -100, 100, 0),
  P_('whites', 'Whites', -100, 100, 0), P_('blacks', 'Blacks', -100, 100, 0),
  P_('sat', 'Saturation', 0, 200, 100), P_('vib', 'Vibrance', -100, 100, 0),
  P_('hue', 'Hue Shift', -180, 180, 0),
  P_('fade', 'Faded Film', 0, 100, 0), P_('sharp', 'Sharpen', 0, 100, 0),
  P_('liftR', 'Shadows Red', -1, 1, 0, .01), P_('liftG', 'Shadows Green', -1, 1, 0, .01), P_('liftB', 'Shadows Blue', -1, 1, 0, .01),
  P_('gamR', 'Midtones Red', -1, 1, 0, .01), P_('gamG', 'Midtones Green', -1, 1, 0, .01), P_('gamB', 'Midtones Blue', -1, 1, 0, .01),
  P_('gainR', 'Highlights Red', -1, 1, 0, .01), P_('gainG', 'Highlights Green', -1, 1, 0, .01), P_('gainB', 'Highlights Blue', -1, 1, 0, .01),
  P_('vigAmt', 'Vignette Amount', -5, 5, 0, .01), P_('vigSize', 'Vignette Midpoint', 0, 100, 50), P_('vigFeather', 'Vignette Feather', 0, 100, 50),
], { builtin: true });
def('bc', 'Brightness & Contrast', 'Color Correction', [P_('bright', 'Brightness', -100, 100, 0), P_('contrast', 'Contrast', -100, 100, 0)]);
def('gamma', 'Gamma Correction', 'Color Correction', [P_('gamma', 'Gamma', 1, 28, 10, .1)]);
def('huesat', 'Hue / Saturation', 'Color Correction', [P_('hue', 'Hue', -180, 180, 0), P_('sat', 'Saturation', 0, 200, 100)]);
def('bw', 'Black & White', 'Image Control', []);
def('invert', 'Invert', 'Channel', []);
def('sepia', 'Color Pass / Sepia', 'Image Control', [P_('amt', 'Amount', 0, 100, 100)]);
def('colorbal', 'Color Balance', 'Color Correction', [
  P_('liftR', 'Shadow Red', -100, 100, 0), P_('liftG', 'Shadow Green', -100, 100, 0), P_('liftB', 'Shadow Blue', -100, 100, 0),
  P_('gamR', 'Midtone Red', -100, 100, 0), P_('gamG', 'Midtone Green', -100, 100, 0), P_('gamB', 'Midtone Blue', -100, 100, 0),
  P_('gainR', 'Highlight Red', -100, 100, 0), P_('gainG', 'Highlight Green', -100, 100, 0), P_('gainB', 'Highlight Blue', -100, 100, 0)]);
def('posterize', 'Posterize', 'Stylize', [P_('lv', 'Level', 2, 32, 6)]);
def('threshold', 'Threshold', 'Image Control', [P_('lv', 'Level', 0, 255, 128)]);
def('blur', 'Gaussian Blur', 'Blur & Sharpen', [P_('r', 'Blurriness', 0, 100, 0, .1)]);
def('sharpen', 'Sharpen', 'Blur & Sharpen', [P_('amt', 'Amount', 0, 100, 0)]);
def('mosaic', 'Mosaic', 'Stylize', [P_('n', 'Blocks', 1, 400, 60)]);
def('rgbsplit', 'RGB Split', 'Stylize', [P_('amt', 'Amount', 0, 100, 10, .1), P_('ang', 'Angle', 0, 360, 0)]);
def('noise', 'Noise', 'Noise & Grain', [P_('amt', 'Amount', 0, 100, 20)]);
def('vignette', 'Vignette', 'Stylize', [P_('amt', 'Amount', -5, 5, -1, .01), P_('size', 'Midpoint', 0, 100, 50), P_('feather', 'Feather', 0, 100, 50)]);
def('crop', 'Crop', 'Transform', [P_('l', 'Left', 0, 100, 0, .1, '%'), P_('t', 'Top', 0, 100, 0, .1, '%'), P_('r', 'Right', 0, 100, 0, .1, '%'), P_('b', 'Bottom', 0, 100, 0, .1, '%')]);
def('hflip', 'Horizontal Flip', 'Transform', []);
def('vflip', 'Vertical Flip', 'Transform', []);
def('mirror', 'Mirror', 'Distort', [P_('pos', 'Center', 0, 100, 50, .1, '%')]);
def('fadein', 'Fade', 'Video', [P_('amt', 'Amount', 0, 100, 0)]);

export const CATS = ['Color Correction', 'Image Control', 'Blur & Sharpen', 'Stylize', 'Transform', 'Distort', 'Noise & Grain', 'Channel', 'Video'];

export function newFx(type) {
  const d = FX[type]; const p = {};
  d.params.forEach(q => p[q.k] = q.def);
  return { id: uid('f'), type, on: true, p };
}

export function baseFx(clip, W, H, sw, sh) {
  const fit = Math.min(W / sw, H / sh) * 100;
  return [
    { id: 'motion', type: 'motion', on: true, p: { px: W / 2, py: H / 2, scale: Math.round(fit * 100) / 100, sw: 100, rot: 0, ax: sw / 2, ay: sh / 2, flick: 0 } },
    { id: 'opacity', type: 'opacity', on: true, p: { op: 100 } },
    { id: 'time', type: 'time', on: true, p: { speed: 100 } },
    newFxFixed('lumetri'),
  ];
}
const newFxFixed = t => { const f = newFx(t); f.id = t; return f; };

// ---------- keyframes ----------
export const kfKey = (fxId, k) => fxId + '.' + k;
export function kfval(arr, t, fallback) {
  if (!arr || !arr.length) return fallback;
  if (t <= arr[0].t) return arr[0].v;
  const last = arr[arr.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i], b = arr[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / (b.t - a.t || 1);
      return lerp(a.v, b.v, easeFn(a.e)(u));
    }
  }
  return last.v;
}
export function val(clip, fx, k, t) {
  const arr = clip.kf && clip.kf[kfKey(fx.id, k)];
  return kfval(arr, t, fx.p[k]);
}
export function setKey(clip, fxId, k, t, v, e) {
  clip.kf ||= {};
  const key = kfKey(fxId, k); const a = clip.kf[key] ||= [];
  const ex = a.find(x => Math.abs(x.t - t) < 1e-3);
  if (ex) { ex.v = v; if (e) ex.e = e; } else { a.push({ t, v, e: e || 'linear' }); a.sort((x, y) => x.t - y.t); }
}
export function delKey(clip, fxId, k, t) {
  const key = kfKey(fxId, k); const a = clip.kf && clip.kf[key]; if (!a) return;
  clip.kf[key] = a.filter(x => Math.abs(x.t - t) > 1e-3); if (!clip.kf[key].length) delete clip.kf[key];
}
