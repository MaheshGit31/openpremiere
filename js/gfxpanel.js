import { P, h, bus, hist } from './core.js';
import { reg } from './dock.js';
import { pb } from './playback.js';
import { icon } from './icons.js';
import { FONTS, ANIMS, TEMPLATES, addTemplate, addNewText, addShape, newLayer, fitLayer, measure } from './gfx.js';
import { endEdit } from './gfxtools.js';

let body, tab = 'edit';
const focusGfx = () => { const s = P.seq; if (!s) return null; const id = P.sel.length ? P.sel[P.sel.length - 1] : null; if (!id) return null; for (const t of s.v) for (const c of t.clips) if (c.id === id && c.gfx) return c; return null; };
const changed = () => { pb.invalidate(); bus.emit('gfxchange'); bus.emit('param'); };
const get = (o, p) => p.split('.').reduce((a, k) => a && a[k], o);
const put = (o, p, v) => { const ks = p.split('.'); const l = ks.pop(); ks.reduce((a, k) => a[k], o)[l] = v; };

function build(el) {
  el.classList.add('ec', 'egp');
  body = h('div', { class: 'ecb' }); el.append(body);
  const redraw = () => { if (body.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox') return; draw(); };
  bus.on('select', redraw); bus.on('seq', redraw); bus.on('project', () => {});
  draw();
}
function sec(title, key, open = true) {
  const o = secOpen[key] ?? open;
  return [h('div', { class: 'fxh' }, h('span', { class: 'twist' + (o ? ' o' : ''), onclick: () => { secOpen[key] = !o; draw(); } }, icon('chev', 11)), h('span', { class: 'fxn' }, title)), o];
}
const secOpen = {};
const row = (label, ...ctl) => h('div', { class: 'pwrap' }, h('div', { class: 'prow simple eg' }, h('span', { class: 'stopw dis' }), h('span', { class: 'pl' }, label), h('span', { class: 'egc' }, ...ctl)));
function draw() {
  if (!body) return; const sc = body.scrollTop; body.innerHTML = '';
  body.append(h('div', { class: 'egtabs' }, ['edit', 'browse'].map(t => h('button', { class: 'egtab' + (tab === t ? ' on' : ''), onclick: () => { tab = t; draw(); } }, t === 'edit' ? 'Edit' : 'Browse'))));
  if (tab === 'browse') { browse(); body.scrollTop = sc; return; }
  const c = focusGfx();
  if (!c) { body.append(h('div', { class: 'pempty' }, 'Select a graphic clip, or create one', h('div', { style: { marginTop: '10px', display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' } }, h('button', { class: 'btn', onclick: () => { addNewText(); } }, 'Text'), h('button', { class: 'btn', onclick: () => addShape('rect') }, 'Rectangle'), h('button', { class: 'btn', onclick: () => addShape('ellipse') }, 'Ellipse')))); return; }
  const g = c.gfx; if (!g.layers.find(l => l.id === P.selLayer)) P.selLayer = g.layers.length ? g.layers[g.layers.length - 1].id : null;
  // layers list
  const [lh, lo] = sec('Layers', 'layers'); body.append(lh);
  if (lo) {
    const list = h('div', { class: 'egl' });
    [...g.layers].reverse().forEach(l => list.append(h('div', { class: 'egli' + (l.id === P.selLayer ? ' on' : ''), onclick: () => { P.selLayer = l.id; draw(); bus.emit('param'); } },
      h('button', { class: 'tb xs', title: 'Visibility', onclick: e => { e.stopPropagation(); hist.push('Layer visibility'); l.vis = !l.vis; changed(); draw(); } }, icon(l.vis ? 'eye' : 'x', 12)),
      h('span', { class: 'egn' }, l.type === 'text' ? (l.text.split('\n')[0].slice(0, 24) || 'Text') : l.name),
      h('button', { class: 'tb xs', title: 'Move up', onclick: e => { e.stopPropagation(); const i = g.layers.indexOf(l); if (i < g.layers.length - 1) { hist.push('Reorder'); g.layers.splice(i, 1); g.layers.splice(i + 1, 0, l); changed(); draw(); } } }, icon('chev', 11)),
      h('button', { class: 'tb xs', title: 'Delete layer', onclick: e => { e.stopPropagation(); if (g.layers.length < 2) return; hist.push('Delete layer'); g.layers.splice(g.layers.indexOf(l), 1); changed(); draw(); } }, icon('x', 11)))));
    body.append(list, h('div', { class: 'egadd' }, h('button', { class: 'btn', onclick: () => addLayer(c, 'text') }, '+ Text'), h('button', { class: 'btn', onclick: () => addLayer(c, 'rect') }, '+ Rect'), h('button', { class: 'btn', onclick: () => addLayer(c, 'ellipse') }, '+ Ellipse')));
  }
  const l = g.layers.find(x => x.id === P.selLayer); if (!l) return;
  const F = (label, type, path, o = {}) => row(label, field(l, type, path, o));
  // align
  const [ah, ao] = sec('Align and Transform', 'xf'); body.append(ah);
  if (ao) {
    const W = P.seq.w, H = P.seq.h, al = (fn) => () => { hist.push('Align'); const m = measure(l); fn(m); changed(); draw(); };
    body.append(h('div', { class: 'egal' },
      [['Left', m => l.x = 0], ['Center H', m => l.x = (W - m.w) / 2], ['Right', m => l.x = W - m.w], ['Top', m => l.y = 0], ['Center V', m => l.y = (H - m.h) / 2], ['Bottom', m => l.y = H - m.h]].map(([n, fn]) => h('button', { class: 'btn sm', onclick: al(fn) }, n))));
    body.append(F('Position X', 'num', 'x', { step: 1 }), F('Position Y', 'num', 'y', { step: 1 }));
    if (l.type !== 'text' || l.area) body.append(F('Width', 'num', 'w', { step: 1, min: 4 }));
    if (l.type !== 'text') body.append(F('Height', 'num', 'h', { step: 1, min: 4 }));
    body.append(F('Rotation', 'num', 'rot', { step: .5 }), F('Opacity', 'range', 'op', { min: 0, max: 100 }));
  }
  if (l.type === 'text') {
    const [th, to] = sec('Text', 'text'); body.append(th);
    if (to) {
      body.append(F('Text', 'area', 'text'), F('Font', 'select', 'font', { opts: FONTS.map(f => [f[0], f[0]]) }), F('Size', 'num', 'size', { step: 1, min: 4 }),
        F('Weight', 'select', 'weight', { opts: [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extrabold'], [900, 'Black']], num: true }),
        row('Align', h('div', { class: 'seg' }, ['left', 'center', 'right'].map(a => h('button', { class: 'segb' + (l.align === a ? ' on' : ''), onclick: () => { hist.push('Text align'); l.align = a; changed(); draw(); } }, a[0].toUpperCase() + a.slice(1))))),
        F('Italic', 'check', 'italic'), F('All caps', 'check', 'caps'), F('Tracking', 'num', 'track', { step: .5 }), F('Leading', 'num', 'lead', { step: .05, min: .5 }),
        F('Wrap in box', 'check', 'area', { after: () => { if (l.area) l.w = Math.max(l.w, 300); fitLayer(l); } }));
    }
  } else if (l.type === 'rect') { const [h1, o1] = sec('Shape', 'shape'); body.append(h1); if (o1) body.append(F('Corner radius', 'num', 'radius', { step: 1, min: 0 })); }
  else if (l.type === 'poly') { const [h1, o1] = sec('Shape', 'shape'); body.append(h1); if (o1) body.append(F('Sides', 'num', 'sides', { step: 1, min: 3 })); }
  else if (l.type === 'path') { const [h1, o1] = sec('Shape', 'shape'); body.append(h1); if (o1) body.append(F('Smooth curves', 'check', 'smooth'), F('Closed', 'check', 'closed')); }
  const [fh, fo] = sec('Appearance', 'app'); body.append(fh);
  if (fo) {
    body.append(F('Fill', 'check', 'fill.on'), F('Fill type', 'select', 'fill.type', { opts: [['solid', 'Solid'], ['grad', 'Gradient']] }), F('Fill color', 'color', 'fill.c'));
    if (l.fill.type === 'grad') body.append(F('Gradient color', 'color', 'fill.c2'), F('Gradient angle', 'num', 'fill.ang', { step: 1 }));
    body.append(F('Stroke', 'check', 'stroke.on'), F('Stroke color', 'color', 'stroke.c'), F('Stroke width', 'num', 'stroke.w', { step: .5, min: 0 }),
      F('Shadow', 'check', 'shadow.on'), F('Shadow color', 'color', 'shadow.c'), F('Shadow opacity', 'range', 'shadow.op', { min: 0, max: 100 }), F('Shadow angle', 'num', 'shadow.ang', { step: 1 }), F('Shadow distance', 'num', 'shadow.dist', { step: 1, min: 0 }), F('Shadow blur', 'num', 'shadow.blur', { step: 1, min: 0 }));
    if (l.type === 'text') body.append(F('Background', 'check', 'bg.on'), F('Background color', 'color', 'bg.c'), F('Background opacity', 'range', 'bg.op', { min: 0, max: 100 }), F('Padding', 'num', 'bg.pad', { step: 1, min: 0 }), F('Corner radius', 'num', 'bg.r', { step: 1, min: 0 }));
  }
  const [nh, no] = sec('Animation', 'anim'); body.append(nh);
  if (no) body.append(F('Animate in', 'select', 'ain.type', { opts: ANIMS }), F('In duration (s)', 'num', 'ain.dur', { step: .1, min: .1 }), F('Animate out', 'select', 'aout.type', { opts: ANIMS }), F('Out duration (s)', 'num', 'aout.dur', { step: .1, min: .1 }));
  body.scrollTop = sc;
}
function addLayer(c, type) {
  hist.push('Add layer'); const s = P.seq; let l;
  if (type === 'text') { l = newLayer('text', { text: 'New Text Layer', size: Math.round(s.h * .07) }); fitLayer(l); l.x = (s.w - l.w) / 2; l.y = (s.h - l.h) / 2 + c.gfx.layers.length * 20; }
  else { l = newLayer(type, { w: s.h * .3 * (type === 'rect' ? 1.6 : 1), h: s.h * .3, fill: { on: true, type: 'solid', c: '#2d8ceb', c2: '#8e44ff', ang: 90 } }); l.x = (s.w - l.w) / 2; l.y = (s.h - l.h) / 2; }
  c.gfx.layers.push(l); P.selLayer = l.id; changed(); draw();
}
function field(l, type, path, o) {
  const cur = () => get(l, path), set = v => { put(l, path, v); if (o.after) o.after(); if (l.type === 'text') fitLayer(l); changed(); };
  if (type === 'num') return h('input', { type: 'number', class: 'nvi', value: +(+cur()).toFixed(2), step: o.step || 1, min: o.min, onkeydown: e => e.stopPropagation(), onfocus: () => hist.push('Change ' + path), oninput: e => { const v = parseFloat(e.target.value); if (!isNaN(v)) set(v); } });
  if (type === 'range') return h('input', { type: 'range', class: 'psl', min: o.min, max: o.max, step: o.step || 1, value: cur(), onpointerdown: () => hist.push('Change ' + path), oninput: e => set(+e.target.value) });
  if (type === 'color') return h('input', { type: 'color', class: 'pcol', value: cur(), onpointerdown: () => hist.push('Change color'), oninput: e => set(e.target.value) });
  if (type === 'check') return h('input', { type: 'checkbox', class: 'pchk', checked: !!cur(), onchange: e => { hist.push('Change ' + path); set(e.target.checked); draw(); } });
  if (type === 'select') return h('select', { class: 'msel', onchange: e => { hist.push('Change ' + path); set(o.num ? +e.target.value : e.target.value); draw(); } }, o.opts.map(([v, lab]) => h('option', { value: v, selected: String(v) === String(cur()) }, lab)));
  if (type === 'area') return h('textarea', { class: 'ptxt egta', rows: 3, value: cur(), onkeydown: e => e.stopPropagation(), onfocus: () => hist.push('Edit text'), oninput: e => set(e.target.value) }, cur());
  return h('span');
}
function browse() {
  body.append(h('div', { class: 'egb' }, TEMPLATES.map(([n], i) => h('button', { class: 'egtile', title: 'Add to timeline at playhead', onclick: () => { addTemplate(i); } }, h('span', { class: 'egtn' }, n)))));
}
reg('essentialGraphics', 'Essential Graphics', build);
bus.on('gfxchange', () => {});
