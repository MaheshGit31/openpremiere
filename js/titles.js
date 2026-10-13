import { P, h, bus, uid } from './core.js';
import { thumb } from './media.js';
import * as E from './edit.js';

export function renderTitle(o) {
  const W = P.seq ? P.seq.w : 1920, H = P.seq ? P.seq.h : 1080;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.font = `${o.weight || 700} ${o.size}px ${o.font || 'Inter, Arial, sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = o.text.split('\n'); const lh = o.size * 1.2; const y0 = H * (o.y ?? .5) - (lines.length - 1) * lh / 2;
  if (o.shadow) { g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = o.size / 6; g.shadowOffsetY = o.size / 20; }
  lines.forEach((l, i) => {
    if (o.stroke) { g.lineWidth = o.size / 12; g.strokeStyle = o.strokeColor || '#000'; g.strokeText(l, W / 2, y0 + i * lh); }
    g.fillStyle = o.color; g.fillText(l, W / 2, y0 + i * lh);
  });
  return c;
}

export function addTitle() {
  if (!P.seq) return;
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const f = { text: 'Your Title', size: 120, color: '#ffffff', font: 'Inter, Arial, sans-serif', weight: 700, y: .5, shadow: true, stroke: false };
  const text = h('textarea', { class: 'nvi wide', rows: 2 }, f.text);
  const size = h('input', { type: 'number', class: 'nvi wide', value: f.size });
  const col = h('input', { type: 'color', value: f.color });
  const fnt = h('select', { class: 'msel wide' }, ['Inter, Arial, sans-serif', 'Georgia, serif', 'Impact, Haettenschweiler, sans-serif', '"Courier New", monospace', '"Trebuchet MS", sans-serif'].map(x => h('option', { value: x }, x.split(',')[0].replace(/"/g, ''))));
  const sh = h('input', { type: 'checkbox', checked: true });
  const row = (l, el) => h('div', { class: 'xrow' }, h('label', {}, l), el);
  const m = h('div', { class: 'modal' }, h('div', { class: 'mdl' }, h('div', { class: 'mh' }, 'New Text Layer'),
    row('Text', text), row('Font', fnt), row('Size', size), row('Color', col), row('Shadow', sh),
    h('div', { class: 'mf' }, h('button', { class: 'btn', onclick: () => m.remove() }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: () => {
        const cv = renderTitle({ ...f, text: text.value || ' ', size: +size.value || 100, color: col.value, font: fnt.value, shadow: sh.checked });
        const it = { id: uid('m'), name: (text.value || 'Title').split('\n')[0].slice(0, 24), kind: 'image', url: cv.toDataURL('image/png'), w: cv.width, h: cv.height, dur: 5, fps: P.seq.fps, thumb: thumb(cv, cv.width, cv.height), bin: 'root', hasAudio: false, title: true };
        P.items.push(it); bus.emit('project');
        const tr = P.seq.v[Math.min(1, P.seq.v.length - 1)];
        E.placeItem(it, { at: P.t, vtr: tr });
        m.remove();
      } }, 'Add to Timeline'))));
  document.body.append(m);
}
