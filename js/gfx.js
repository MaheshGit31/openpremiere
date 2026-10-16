// graphic clips: text and shape layers rendered with canvas2D
import { P, bus, uid, hist } from './core.js';
import * as E from './edit.js';

export const FONTS = [
  ['Source Sans 3', 'Source Sans 3, Segoe UI, Arial, sans-serif'], ['Inter', 'Inter, Arial, sans-serif'], ['Roboto', 'Roboto, Arial, sans-serif'], ['Open Sans', 'Open Sans, Arial, sans-serif'],
  ['Montserrat', 'Montserrat, Arial, sans-serif'], ['Poppins', 'Poppins, Arial, sans-serif'], ['Lato', 'Lato, Arial, sans-serif'], ['Raleway', 'Raleway, Arial, sans-serif'],
  ['Oswald', 'Oswald, Impact, sans-serif'], ['Bebas Neue', 'Bebas Neue, Impact, sans-serif'], ['Anton', 'Anton, Impact, sans-serif'], ['Playfair Display', 'Playfair Display, Georgia, serif'],
  ['Merriweather', 'Merriweather, Georgia, serif'], ['Lora', 'Lora, Georgia, serif'], ['Roboto Mono', 'Roboto Mono, Courier New, monospace'], ['Orbitron', 'Orbitron, Arial, sans-serif'],
  ['Lobster', 'Lobster, cursive'], ['Pacifico', 'Pacifico, cursive'], ['Dancing Script', 'Dancing Script, cursive'], ['Permanent Marker', 'Permanent Marker, cursive'],
  ['Arial', 'Arial, Helvetica, sans-serif'], ['Helvetica', 'Helvetica, Arial, sans-serif'], ['Verdana', 'Verdana, sans-serif'], ['Tahoma', 'Tahoma, sans-serif'], ['Trebuchet MS', 'Trebuchet MS, sans-serif'],
  ['Georgia', 'Georgia, serif'], ['Times New Roman', 'Times New Roman, Times, serif'], ['Palatino', 'Palatino Linotype, Palatino, serif'], ['Garamond', 'Garamond, Georgia, serif'],
  ['Impact', 'Impact, Haettenschweiler, sans-serif'], ['Courier New', 'Courier New, monospace'], ['Consolas', 'Consolas, monospace'], ['Comic Sans MS', 'Comic Sans MS, cursive'],
];
export const fontStack = n => ((FONTS.find(f => f[0] === n) || [0, n + ', Arial, sans-serif'])[1]).split(',').map(x => x.trim()).map(x => /\s/.test(x) && !/^["']/.test(x) ? '"' + x + '"' : x).join(', ');
export const GFONT_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto:wght@400;700&family=Open+Sans:wght@400;700&family=Montserrat:wght@400;700&family=Poppins:wght@400;700&family=Lato:wght@400;700&family=Raleway:wght@400;700&family=Oswald:wght@400;700&family=Bebas+Neue&family=Anton&family=Playfair+Display:wght@400;700&family=Merriweather:wght@400;700&family=Lora:wght@400;700&family=Roboto+Mono:wght@400;700&family=Orbitron:wght@400;700&family=Lobster&family=Pacifico&family=Dancing+Script:wght@400;700&family=Permanent+Marker&display=swap';

let fontVer = 0; const fontReq = new Set();
function ensureFont(l) {
  const k = `${l.italic ? 'italic ' : ''}${l.weight || 400} 32px "${l.font}"`;
  if (fontReq.has(k)) return; fontReq.add(k);
  try { document.fonts.load(k).then(() => { fontVer++; bus.emit('gfxfont'); }).catch(() => {}); } catch {}
}
if (typeof document !== 'undefined') { try { document.fonts && document.fonts.addEventListener('loadingdone', () => { fontVer++; bus.emit('gfxfont'); }); } catch {} }

export const newLayer = (type, o = {}) => ({
  id: uid('g'), type, name: type === 'text' ? 'Text' : type === 'rect' ? 'Rectangle' : type === 'ellipse' ? 'Ellipse' : type === 'poly' ? 'Polygon' : 'Path',
  x: 0, y: 0, w: 400, h: 200, rot: 0, op: 100, vis: true,
  text: 'New Text Layer', font: 'Source Sans 3', size: 100, weight: 700, italic: false, align: 'center', track: 0, lead: 1.15, caps: false, area: false,
  fill: { on: true, type: 'solid', c: '#ffffff', c2: '#2d8ceb', ang: 90 },
  stroke: { on: false, c: '#000000', w: 6 },
  shadow: { on: false, c: '#000000', op: 60, ang: 135, dist: 8, blur: 12 },
  bg: { on: false, c: '#000000', pad: 24, r: 8, op: 70 },
  radius: 0, sides: 5, pts: [], closed: true, smooth: false,
  ain: { type: 'none', dur: .6 }, aout: { type: 'none', dur: .6 },
  ...o,
});
export const ANIMS = [['none', 'None'], ['fade', 'Fade'], ['slideUp', 'Slide Up'], ['slideDown', 'Slide Down'], ['slideLeft', 'Slide Left'], ['slideRight', 'Slide Right'], ['pop', 'Pop (Scale)'], ['typewriter', 'Typewriter'], ['blur', 'Blur'], ['wipe', 'Wipe']];

const mctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
function setFont(g, l) { g.font = `${l.italic ? 'italic ' : ''}${l.weight || 400} ${l.size}px ${fontStack(l.font)}`; try { g.letterSpacing = (l.track || 0) + 'px'; } catch {} }
const txt = l => (l.caps ? l.text.toUpperCase() : l.text);
function lines(g, l, maxW) {
  const out = [];
  for (const raw of txt(l).split('\n')) {
    if (!maxW) { out.push(raw); continue; }
    let cur = '';
    for (const w of raw.split(/(\s+)/)) { const t = cur + w; if (cur && g.measureText(t.trimEnd()).width > maxW) { out.push(cur.trimEnd()); cur = w.trimStart(); } else cur = t; }
    out.push(cur);
  }
  return out;
}
export function measure(l) {
  if (l.type !== 'text') return { w: l.w, h: l.h };
  setFont(mctx, l);
  const ls = lines(mctx, l, l.area ? l.w : 0);
  const w = l.area ? l.w : Math.max(10, ...ls.map(s => mctx.measureText(s).width));
  return { w, h: Math.max(l.size, ls.length * l.size * l.lead), ls };
}
// keep point-text boxes in sync with their content
export function fitLayer(l) { if (l.type === 'text') { const m = measure(l); if (!l.area) l.w = m.w; l.h = m.h; } return l; }

function animState(l, lt, dur) {
  const s = { a: 1, dx: 0, dy: 0, sc: 1, chars: 1, blur: 0, wipe: 1 };
  const apply = (an, p, out) => {
    if (!an || an.type === 'none') return;
    const e = out ? p : 1 - p; // e: 1 = fully hidden
    const ease = x => x * x * (3 - 2 * x), q = ease(Math.min(1, Math.max(0, e)));
    switch (an.type) {
      case 'fade': s.a *= 1 - q; break;
      case 'slideUp': s.dy += out ? -q * 120 : q * 120; s.a *= 1 - q; break;
      case 'slideDown': s.dy += out ? q * 120 : -q * 120; s.a *= 1 - q; break;
      case 'slideLeft': s.dx += out ? -q * 200 : q * 200; s.a *= 1 - q; break;
      case 'slideRight': s.dx += out ? q * 200 : -q * 200; s.a *= 1 - q; break;
      case 'pop': s.sc *= 1 - q * .8; s.a *= 1 - q; break;
      case 'typewriter': s.chars = Math.min(s.chars, 1 - q); break;
      case 'blur': s.blur = Math.max(s.blur, q * 30); s.a *= 1 - q * .7; break;
      case 'wipe': s.wipe = Math.min(s.wipe, 1 - q); break;
    }
  };
  const ai = l.ain, ao = l.aout;
  if (ai && ai.type !== 'none' && lt < ai.dur) apply(ai, lt / ai.dur, false);
  if (ao && ao.type !== 'none' && lt > dur - ao.dur) apply(ao, (dur - lt) / ao.dur, true);
  return s;
}
const animated = l => (l.ain && l.ain.type !== 'none') || (l.aout && l.aout.type !== 'none');

function paintOf(g, f, w, h) {
  if (f.type === 'grad') { const a = (f.ang || 0) * Math.PI / 180, cx = w / 2, cy = h / 2, r = Math.abs(Math.cos(a)) * w / 2 + Math.abs(Math.sin(a)) * h / 2; const gr = g.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r); gr.addColorStop(0, f.c); gr.addColorStop(1, f.c2); return gr; }
  return f.c;
}
function shapePath(g, l, w, h) {
  g.beginPath();
  if (l.type === 'rect') { if (l.radius > 0 && g.roundRect) g.roundRect(0, 0, w, h, Math.min(l.radius, w / 2, h / 2)); else g.rect(0, 0, w, h); }
  else if (l.type === 'ellipse') g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (l.type === 'poly') { const n = Math.max(3, l.sides | 0); for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; const x = w / 2 + Math.cos(a) * w / 2, y = h / 2 + Math.sin(a) * h / 2; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); }
  else if (l.type === 'path' && l.pts.length > 1) {
    const P_ = l.pts.map(([x, y]) => [x * w, y * h]);
    if (l.smooth && P_.length > 2) { const n = P_.length, pt = i => P_[(i + n) % n]; g.moveTo(...P_[0]); const lim = l.closed ? n : n - 1; for (let i = 0; i < lim; i++) { const p0 = l.closed ? pt(i - 1) : P_[Math.max(0, i - 1)], p1 = pt(i), p2 = pt(i + 1), p3 = l.closed ? pt(i + 2) : P_[Math.min(n - 1, i + 2)]; g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]); } }
    else P_.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    if (l.closed) g.closePath();
  }
}
export function drawLayer(g, l, lt, dur, W, H) {
  if (!l.vis) return;
  ensureFont(l);
  const m = measure(l); const w = m.w, h = m.h; const st = animState(l, lt, dur);
  if (st.a <= 0.001) return;
  g.save();
  g.globalAlpha = (l.op / 100) * st.a;
  g.translate(l.x + w / 2 + st.dx, l.y + h / 2 + st.dy); g.rotate((l.rot || 0) * Math.PI / 180); g.scale(st.sc, st.sc); g.translate(-w / 2, -h / 2);
  if (st.blur) { try { g.filter = `blur(${st.blur}px)`; } catch {} }
  if (st.wipe < 1) { g.beginPath(); g.rect(-20, -20, (w + 40) * st.wipe, h + 40); g.clip(); }
  if (l.type === 'text') {
    if (l.bg.on) { g.save(); g.globalAlpha *= l.bg.op / 100; g.fillStyle = l.bg.c; const p = l.bg.pad; g.beginPath(); if (g.roundRect) g.roundRect(-p, -p * .6, w + p * 2, h + p * 1.2, l.bg.r); else g.rect(-p, -p * .6, w + p * 2, h + p * 1.2); g.fill(); g.restore(); }
    setFont(g, l); g.textBaseline = 'top'; g.textAlign = 'left';
    const ls = m.ls; let total = ls.reduce((a, s) => a + s.length, 0), shown = Math.floor(total * st.chars + 1e-6), used = 0;
    if (l.shadow.on) { const a = l.shadow.ang * Math.PI / 180; g.shadowColor = hexA(l.shadow.c, l.shadow.op / 100); g.shadowBlur = l.shadow.blur; g.shadowOffsetX = Math.cos(a) * l.shadow.dist; g.shadowOffsetY = Math.sin(a) * l.shadow.dist; }
    const fillStyle = l.fill.on ? paintOf(g, l.fill, w, h) : null;
    ls.forEach((s, i) => {
      let t = s; if (st.chars < 1) { const left = Math.max(0, shown - used); t = s.slice(0, left); used += s.length; }
      const lw = g.measureText(s).width; const x = l.align === 'center' ? (w - lw) / 2 : l.align === 'right' ? w - lw : 0; const y = i * l.size * l.lead + (l.size * l.lead - l.size) / 2;
      if (l.stroke.on && l.stroke.w > 0) { g.lineJoin = 'round'; g.miterLimit = 2; g.lineWidth = l.stroke.w * 2; g.strokeStyle = l.stroke.c; g.strokeText(t, x, y); }
      if (fillStyle) { g.fillStyle = fillStyle; g.fillText(t, x, y); }
    });
  } else {
    if (l.shadow.on) { const a = l.shadow.ang * Math.PI / 180; g.shadowColor = hexA(l.shadow.c, l.shadow.op / 100); g.shadowBlur = l.shadow.blur; g.shadowOffsetX = Math.cos(a) * l.shadow.dist; g.shadowOffsetY = Math.sin(a) * l.shadow.dist; }
    shapePath(g, l, w, h);
    if (l.fill.on && (l.type !== 'path' || l.closed)) { g.fillStyle = paintOf(g, l.fill, w, h); g.fill(); }
    if (l.stroke.on && l.stroke.w > 0) { g.shadowColor = 'transparent'; g.lineWidth = l.stroke.w; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = l.stroke.c; g.stroke(); }
  }
  g.restore();
}
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

// ----- per-clip canvas cache -----
const cache = new Map();
export function gfxCanvas(c, W, H, lt) {
  const g = c.gfx; const anim = g.layers.some(animated);
  const key = JSON.stringify(g.layers) + '|' + W + 'x' + H + '|' + fontVer + '|' + (anim ? Math.round(lt * 30) + ':' + Math.round(c.dur * 30) : '');
  let e = cache.get(c.id);
  if (!e) { const cv = document.createElement('canvas'); e = { cv, key: '' }; cache.set(c.id, e); }
  if (e.key !== key) {
    e.key = key; const cv = e.cv; if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, W, H);
    for (const l of g.layers) drawLayer(ctx, l, lt, c.dur, W, H);
  }
  return e.cv;
}
// hit test: topmost layer under seq-space point
export function hitLayer(c, x, y) {
  const ls = c.gfx.layers;
  for (let i = ls.length - 1; i >= 0; i--) {
    const l = ls[i]; if (!l.vis) continue; const m = measure(l);
    const cx = l.x + m.w / 2, cy = l.y + m.h / 2, a = -(l.rot || 0) * Math.PI / 180, dx = x - cx, dy = y - cy;
    const px = dx * Math.cos(a) - dy * Math.sin(a), py = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(px) <= m.w / 2 + 6 && Math.abs(py) <= m.h / 2 + 6) return l;
  }
  return null;
}
export function layerCorners(l) {
  const m = measure(l), cx = l.x + m.w / 2, cy = l.y + m.h / 2, a = (l.rot || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { const X = sx * m.w / 2, Y = sy * m.h / 2; return [cx + X * co - Y * si, cy + X * si + Y * co]; });
}

// ----- placing graphics on the timeline -----
export function placeGraphic(layers, { at = P.t, dur = 5, name } = {}) {
  const s = P.seq; if (!s) return null;
  layers.forEach(fitLayer);
  const it = { id: uid('m'), name: name || layers[0].name, kind: 'image', url: '', w: s.w, h: s.h, dur, fps: s.fps, thumb: null, bin: 'root', hasAudio: false, gfxItem: true };
  P.items.push(it);
  // first video track from V2 up with no clip in range; else last track
  const free = s.v.slice(1).find(t => !t.lock && !t.clips.some(c => c.start < at + dur - 1e-6 && c.start + c.dur > at + 1e-6)) || s.v[s.v.length - 1];
  const made = E.placeItem(it, { at, outT: dur, vtr: free });
  const f = made && made.length ? P.seq.v.flatMap(t => t.clips).find(c => c.id === made[0]) : null;
  if (!f) return null;
  f.gfx = { layers }; f.name = name || layers[0].name; P.sel = [f.id]; P.focusClip = f.id;
  bus.emit('seq'); bus.emit('select'); return f;
}
export const TEMPLATES = [
  ['Title', () => [newLayer('text', { text: 'Your Title', size: 140, x: 0, y: 0, shadow: { on: true, c: '#000000', op: 55, ang: 90, dist: 6, blur: 14 } })], c => c],
  ['Subtitle', () => [newLayer('text', { text: 'Subtitle goes here', size: 60, weight: 400 })]],
  ['Lower Third', () => [newLayer('rect', { w: 760, h: 120, fill: { on: true, type: 'solid', c: '#2d8ceb', c2: '#000', ang: 90 }, ain: { type: 'wipe', dur: .5 } , name: 'Bar' }), newLayer('text', { text: 'Name Surname', size: 54, weight: 700, align: 'left', ain: { type: 'slideRight', dur: .6 }, name: 'Name' }), newLayer('text', { text: 'Role or caption', size: 34, weight: 400, align: 'left', name: 'Role' })]],
  ['Quote', () => [newLayer('text', { text: '"Make something people want."', size: 90, weight: 400, italic: true, font: 'Playfair Display', area: true, w: 1300, align: 'center' })]],
  ['Callout', () => [newLayer('text', { text: 'Look here', size: 64, bg: { on: true, c: '#ff3b30', pad: 24, r: 14, op: 100 }, ain: { type: 'pop', dur: .35 } })]],
  ['Gradient Title', () => [newLayer('text', { text: 'BIG IDEA', size: 220, font: 'Anton', fill: { on: true, type: 'grad', c: '#ffcf33', c2: '#ff3b6b', ang: 90 }, stroke: { on: false, c: '#000', w: 6 } })]],
  ['Typewriter', () => [newLayer('text', { text: 'Typing a message...', size: 80, font: 'Roboto Mono', weight: 400, ain: { type: 'typewriter', dur: 2 } })]],
  ['Neon Sign', () => [newLayer('text', { text: 'OPEN', size: 200, font: 'Orbitron', fill: { on: true, type: 'solid', c: '#ffffff', c2: '#000', ang: 90 }, shadow: { on: true, c: '#00e5ff', op: 100, ang: 0, dist: 0, blur: 40 } })]],
];
export function addTemplate(i) {
  const s = P.seq; if (!s) return null;
  const layers = TEMPLATES[i][1](); const f = placeGraphic(layers.map(l => l), { name: TEMPLATES[i][0] });
  if (!f) return null;
  // center / position layers
  layers.forEach(fitLayer);
  if (TEMPLATES[i][0] === 'Lower Third') { layers[0].x = 120; layers[0].y = s.h - 300; layers[1].x = 160; layers[1].y = s.h - 285; layers[2].x = 160; layers[2].y = s.h - 215; }
  else layers.forEach(l => { const m = measure(l); l.x = (s.w - m.w) / 2; l.y = (s.h - m.h) / 2; });
  bus.emit('seq'); return f;
}
export function newTextAt(x, y, o = {}) {
  const l = newLayer('text', { text: 'New Text Layer', ...o }); fitLayer(l); l.x = x - (o.w ? 0 : l.w / 2); l.y = y - l.h / 2;
  const f = placeGraphic([l], { name: 'Text' }); return f && { c: f, l };
}

export function addNewText() {
  const s = P.seq; if (!s) return null;
  const l = newLayer('text', { text: 'New Text Layer', size: Math.round(s.h * .09), shadow: { on: true, c: '#000000', op: 55, ang: 90, dist: 4, blur: 10 } }); fitLayer(l); l.x = (s.w - l.w) / 2; l.y = (s.h - l.h) / 2;
  const f = placeGraphic([l], { name: 'Text' }); if (f) P.selLayer = l.id; return f;
}
export function addShape(kind) {
  const s = P.seq; if (!s) return null;
  const l = newLayer(kind, { w: s.h * .4 * (kind === 'rect' ? 1.6 : 1), h: s.h * .4, fill: { on: true, type: 'solid', c: '#2d8ceb', c2: '#8e44ff', ang: 90 } }); l.x = (s.w - l.w) / 2; l.y = (s.h - l.h) / 2;
  const f = placeGraphic([l], { name: kind === 'rect' ? 'Rectangle' : kind === 'ellipse' ? 'Ellipse' : 'Polygon' }); if (f) P.selLayer = l.id; return f;
}
