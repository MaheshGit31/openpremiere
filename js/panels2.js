import { P, h, bus, tc, clamp, hist, uid, seqDur, findClip, selClips, ls } from './core.js';
import { reg, popMenu } from './dock.js';
import { FX, CATS, newFx, val, setKey, delKey, kfKey, kfval, EASE_NAMES } from './fx.js';
import { pb } from './playback.js';
import { icon } from './icons.js';
import { item } from './media.js';
import * as E from './edit.js';

const focusClip = () => {
  if (!P.seq) return null;
  const id = P.sel.length ? (P.sel.includes(P.focusClip) ? P.focusClip : P.sel[P.sel.length - 1]) : null;
  const f = id && findClip(id); return f ? f.c : null;
};
export const lt = c => clamp(P.t - c.start, 0, c.dur);

// set a param (auto keyframe if animated)
export function setParam(c, fx, k, v) {
  const key = kfKey(fx.id, k);
  if (c.kf && c.kf[key]) setKey(c, fx.id, k, lt(c), v); else fx.p[k] = v;
  pb.invalidate(); bus.emit('param');
}

// scrubby numeric field
function num(c, fx, q, rerender) {
  const cur = () => val(c, fx, q.k, lt(c));
  const fmt = v => (q.step < 1 ? (+v).toFixed(q.step < .1 ? 2 : 1) : Math.round(+v)) + (q.u || '');
  const inp = h('span', { class: 'nv', title: 'Drag to change, double-click to type' }, fmt(cur() ?? 0));
  let startV, startX, drag = false, didHist = false;
  inp.addEventListener('pointerdown', e => {
    if (e.detail === 2) return;
    startX = e.clientX; startV = +cur(); drag = false; didHist = false; inp.setPointerCapture(e.pointerId);
    const mv = ev => {
      const d = ev.clientX - startX; if (!drag && Math.abs(d) < 2) return; drag = true;
      if (!didHist) { hist.push('Change ' + q.l); didHist = true; }
      const range = (q.max - q.min), sens = ev.shiftKey ? .1 : 1;
      let v = startV + d * Math.max(q.step, range / 400) * sens;
      v = clamp(Math.round(v / q.step) * q.step, q.min, q.max);
      setParam(c, fx, q.k, v); inp.textContent = fmt(v); const sl = inp.parentElement && inp.parentElement.querySelector('input[type=range]'); if (sl) sl.value = v;
    };
    const up = () => { inp.removeEventListener('pointermove', mv); inp.removeEventListener('pointerup', up); if (drag) bus.emit('fxchange'); };
    inp.addEventListener('pointermove', mv); inp.addEventListener('pointerup', up);
  });
  inp.addEventListener('dblclick', () => {
    const t = h('input', { class: 'nvi', value: cur() }); inp.replaceWith(t); t.focus(); t.select();
    const done = commit => { if (commit) { const v = parseFloat(t.value); if (!isNaN(v)) { hist.push('Change ' + q.l); setParam(c, fx, q.k, clamp(v, q.min * 2 - 0, q.max * 2)); } } rerender(); };
    t.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    t.addEventListener('blur', () => done(true));
  });
  return inp;
}

const EC = { open: {}, sel: null };
let ecBody;
function ecBuild(el) {
  el.classList.add('ec');
  ecBody = h('div', { class: 'ecb' }); el.append(ecBody);
  const draw = () => ecDraw();
  bus.on('select', draw); bus.on('seq', draw); bus.on('fxchange', () => ecRefresh());
  bus.on('time', () => { if (!P.playing) ecRefresh(); else ecPh(); });
  draw();
}
let ecRefreshQ = 0;
function ecRefresh() { if (ecRefreshQ) return; ecRefreshQ = requestAnimationFrame(() => { ecRefreshQ = 0; ecDraw(true); }); }
function ecPh() { /* playhead in lane while playing */ if (!ecBody) return; const c = focusClip(); if (!c) return; ecBody.querySelectorAll('.ecph').forEach(p => p.style.left = (lt(c) / c.dur * 100) + '%'); }

function ecDraw(keepScroll) {
  if (!ecBody) return;
  if (ecBody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const sc = ecBody.scrollTop; ecBody.innerHTML = '';
  const c = focusClip();
  if (!c) { ecBody.append(h('div', { class: 'pempty' }, 'Select a clip')); return; }
  const it = item(c.item);
  ecBody.append(h('div', { class: 'echead' }, h('span', {}, (c.type === 'v' ? 'Video' : 'Audio') + ' – ' + c.name), h('i', {}, tc(c.start, P.seq.fps) + ' to ' + tc(c.start + c.dur, P.seq.fps))));
  for (const fx of c.fx) {
    const d = FX[fx.type]; if (!d) continue;
    const rer = () => ecDraw(true);
    const open = EC.open[fx.id + c.id] !== false;
    const hd = h('div', { class: 'fxh' },
      h('span', { class: 'twist' + (open ? ' o' : ''), onclick: () => { EC.open[fx.id + c.id] = !open; ecDraw(true); } }, icon('chev', 11)),
      !d.builtin || fx.type === 'lumetri' ? h('button', { class: 'fxtog' + (fx.on ? ' on' : ''), title: 'Toggle effect', onclick: () => { hist.push('Toggle effect'); fx.on = !fx.on; pb.invalidate(); rer(); } }, 'fx') : h('span', { class: 'fxtog on dis' }, 'fx'),
      h('span', { class: 'fxn' }, d.name),
      h('div', { class: 'grow' }),
      h('button', { class: 'tb sm', title: 'Reset Effect', onclick: () => { hist.push('Reset ' + d.name); d.params.forEach(q => { const dv = q.def == null ? fx.p[q.k] : q.def; fx.p[q.k] = dv; delete c.kf[kfKey(fx.id, q.k)]; }); pb.invalidate(); bus.emit('seq'); } }, icon('reset', 13)),
      !d.builtin ? h('button', { class: 'tb sm', title: 'Remove effect', onclick: () => { hist.push('Remove effect'); c.fx = c.fx.filter(x => x !== fx); pb.invalidate(); bus.emit('seq'); } }, icon('x', 13)) : null);
    ecBody.append(hd);
    if (!open) continue;
    const vis = (c.type === 'a' && fx.type !== 'avol') ? [] : d.params.filter(q => !(fx.type === 'motion' && q.k === 'flick') && !(fx.type === 'motion' && q.k === 'sw'));
    for (const q of vis) ecBody.append(paramRow(c, fx, q, rer));
  }
  ecBody.scrollTop = sc;
}

function paramRow(c, fx, q, rer) {
  const key = kfKey(fx.id, q.k); const arr = c.kf && c.kf[key]; const animated = !!(arr && arr.length);
  const t = lt(c);
  const sw = h('button', { class: 'stopw' + (animated ? ' on' : ''), title: 'Toggle Animation', onclick: () => {
    hist.push('Toggle animation');
    if (animated) { fx.p[q.k] = val(c, fx, q.k, t); delete c.kf[key]; } else setKey(c, fx.id, q.k, t, fx.p[q.k], 'linear');
    bus.emit('seq'); } }, icon('stopwatch', 13));
  const onKey = animated && arr.some(p => Math.abs(p.t - t) < 1 / (P.seq.fps * 2));
  const nav = h('span', { class: 'kfnav' },
    h('button', { class: 'tb xs', title: 'Previous Keyframe', disabled: !animated, onclick: () => { const p = [...arr].reverse().find(p => p.t < t - 1e-3); if (p) pb.seek(c.start + p.t); } }, icon('kprev', 10)),
    h('button', { class: 'tb xs kd' + (onKey ? ' on' : ''), title: 'Add/Remove Keyframe', onclick: () => { hist.push('Keyframe'); if (!animated) { setKey(c, fx.id, q.k, t, fx.p[q.k], 'linear'); } else if (onKey) delKey(c, fx.id, q.k, arr.find(p => Math.abs(p.t - t) < 1 / (P.seq.fps * 2)).t); else setKey(c, fx.id, q.k, t, val(c, fx, q.k, t), 'linear'); bus.emit('seq'); } }, icon('kdiam', 10)),
    h('button', { class: 'tb xs', title: 'Next Keyframe', disabled: !animated, onclick: () => { const p = arr.find(p => p.t > t + 1e-3); if (p) pb.seek(c.start + p.t); } }, icon('knext', 10)));
  const cv = val(c, fx, q.k, t);
  const row = h('div', { class: 'prow' }, sw, h('span', { class: 'pl' }, q.l), num(c, fx, q, rer),
    h('input', { type: 'range', class: 'psl', min: q.min, max: q.max, step: q.step, value: cv ?? 0, oninput: e => { setParam(c, fx, q.k, +e.target.value); e.target.parentElement.querySelector('.nv').textContent = (q.step < 1 ? (+e.target.value).toFixed(2) : Math.round(+e.target.value)) + (q.u || ''); }, onchange: () => { bus.emit('fxchange'); }, onpointerdown: () => hist.push('Change ' + q.l) }),
    nav);
  // keyframe lane
  const lane = h('div', { class: 'klane' }, h('div', { class: 'ecph', style: { left: (t / c.dur * 100) + '%' } }));
  if (arr) arr.forEach((p, i) => {
    const dia = h('div', { class: 'kd2', title: `${p.t.toFixed(2)}s · ${p.e || 'linear'}`, style: { left: (p.t / c.dur * 100) + '%' } });
    dia.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); hist.push('Move keyframe'); const r = lane.getBoundingClientRect(); const mv = ev => { p.t = clamp((ev.clientX - r.left) / r.width * c.dur, 0, c.dur); dia.style.left = (p.t / c.dur * 100) + '%'; pb.invalidate(); }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); arr.sort((a, b) => a.t - b.t); bus.emit('seq'); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
    dia.addEventListener('contextmenu', e => { e.preventDefault(); easeMenu(e, c, arr, p); });
    dia.addEventListener('dblclick', e => { e.stopPropagation(); easeMenu(e, c, arr, p); });
    lane.append(dia);
  });
  lane.addEventListener('pointerdown', e => { const r = lane.getBoundingClientRect(); pb.pause(); pb.seek(c.start + clamp((e.clientX - r.left) / r.width, 0, 1) * c.dur); });
  return h('div', { class: 'pwrap' }, row, lane);
}
function easeMenu(e, c, arr, p) {
  const groups = ['linear', 'hold', 'ease', 'easeIn', 'easeOut', 'easeInOut'];
  const items = groups.map(g => [g, () => { hist.push('Interpolation'); p.e = g; pb.invalidate(); bus.emit('seq'); }, '', (p.e || 'linear') === g]);
  items.push('-', ['More easings…', () => { const n = prompt('Easing (' + EASE_NAMES.join(', ') + ') or bezier(x1,y1,x2,y2)', p.e || 'linear'); if (n) { hist.push('Interpolation'); p.e = n; bus.emit('seq'); } }]);
  items.push('-', ['Delete Keyframe', () => { hist.push('Delete keyframe'); arr.splice(arr.indexOf(p), 1); if (!arr.length) for (const k in c.kf) if (c.kf[k] === arr) delete c.kf[k]; bus.emit('seq'); }]);
  popMenu(e.clientX, e.clientY, items);
}

// ---------------- Effects browser ----------------
const TR_LIST = []; // transitions arrive in phase 3
function efBuild(el) {
  el.classList.add('efp');
  const q = h('input', { class: 'psearch', placeholder: 'Search effects', oninput: () => draw() });
  const list = h('div', { class: 'eflist' });
  el.append(h('div', { class: 'ptool' }, q), list);
  const open = new Set(['Color Correction']);
  const draw = () => {
    list.innerHTML = ''; const s = q.value.toLowerCase();
    for (const cat of CATS) {
      const fxs = Object.values(FX).filter(f => f.cat === cat && !f.hidden && (!s || f.name.toLowerCase().includes(s)));
      if (!fxs.length) continue;
      const o = open.has(cat) || !!s;
      list.append(h('div', { class: 'efcat', onclick: () => { o ? open.delete(cat) : open.add(cat); draw(); } }, h('span', { class: 'twist' + (o ? ' o' : '') }, icon('chev', 11)), icon('folder', 14), cat));
      if (o) fxs.forEach(f => {
        const r = h('div', { class: 'efitem', draggable: 'true', title: 'Double-click to apply to selected clips' }, icon('fx', 14), f.name);
        r.addEventListener('dragstart', e => e.dataTransfer.setData('text/op-fx', f.type));
        r.addEventListener('dblclick', () => applyFx(f.type));
        list.append(r);
      });
    }
  };
  draw();
}
export function applyFx(type, clips) {
  const cs = (clips && clips.length ? clips : selClips()).filter(c => c.type === 'v' || false);
  if (!cs.length) return;
  hist.push('Apply ' + FX[type].name);
  cs.forEach(c => { if (type === 'lumetri') return; c.fx.push(newFx(type)); });
  pb.invalidate(); bus.emit('seq');
}

// ---------------- Lumetri ----------------
const LUM_SECTIONS = [
  ['Basic Correction', ['temp', 'tint', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'sat']],
  ['Creative', ['fade', 'sharp', 'vib', 'hue']],
  ['Vignette', ['vigAmt', 'vigSize', 'vigFeather']],
];
const LOOKS = {
  'None': {},
  'Cinematic Teal & Orange': { contrast: 18, sat: 110, liftB: .06, liftG: .02, gainR: .08, gainB: -.05, shadows: -10 },
  'Faded Film': { fade: 40, contrast: -12, sat: 85, temp: 8 },
  'Cool Noir': { sat: 40, contrast: 28, temp: -25, blacks: -15, vigAmt: -1.2 },
  'Warm Vintage': { temp: 30, tint: 8, fade: 25, sat: 95, vigAmt: -.8 },
  'High Contrast B&W': { sat: 0, contrast: 45, highlights: 10, shadows: -15 },
  'Vibrant': { sat: 130, vib: 35, contrast: 10 },
  'Bleach Bypass': { sat: 55, contrast: 40, highlights: 15, blacks: -10 },
};
function lumBuild(el) {
  el.classList.add('ec', 'lum');
  const body = h('div', { class: 'ecb' }); el.append(body);
  const draw = () => {
    if (body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && document.activeElement.type !== 'range') return;
    body.innerHTML = '';
    const c = focusClip();
    if (!c || c.type !== 'v') { body.append(h('div', { class: 'pempty' }, 'Select a video clip')); return; }
    const fx = c.fx.find(f => f.type === 'lumetri'); const d = FX.lumetri;
    const look = h('select', { class: 'msel wide', onchange: e => { hist.push('Look'); const l = LOOKS[e.target.value]; d.params.forEach(q => { fx.p[q.k] = q.def; }); Object.assign(fx.p, l); pb.invalidate(); bus.emit('seq'); } }, Object.keys(LOOKS).map(k => h('option', {}, k)));
    body.append(h('div', { class: 'lumhead' }, h('span', {}, 'Look'), look, h('button', { class: 'tb', title: 'Reset all', onclick: () => { hist.push('Reset Lumetri'); d.params.forEach(q => { fx.p[q.k] = q.def; delete c.kf[kfKey(fx.id, q.k)]; }); pb.invalidate(); bus.emit('seq'); } }, icon('reset', 14))));
    for (const [title, keys] of LUM_SECTIONS) {
      const op = EC.open['lum' + title] !== false;
      body.append(h('div', { class: 'fxh' }, h('span', { class: 'twist' + (op ? ' o' : ''), onclick: () => { EC.open['lum' + title] = !op; draw(); } }, icon('chev', 11)), h('span', { class: 'fxn' }, title)));
      if (!op) continue;
      keys.forEach(k => { const q = d.params.find(x => x.k === k); body.append(paramRow(c, fx, q, draw)); });
    }
    const opw = EC.open.lumw !== false;
    body.append(h('div', { class: 'fxh' }, h('span', { class: 'twist' + (opw ? ' o' : ''), onclick: () => { EC.open.lumw = !opw; draw(); } }, icon('chev', 11)), h('span', { class: 'fxn' }, 'Color Wheels')));
    if (opw) {
      const wr = h('div', { class: 'wheels' });
      [['Shadows', 'lift'], ['Midtones', 'gam'], ['Highlights', 'gain']].forEach(([n, k]) => wr.append(wheel(c, fx, n, k, draw)));
      body.append(wr);
    }
  };
  bus.on('select', draw); bus.on('seq', draw); bus.on('fxchange', () => { });
  bus.on('time', () => { if (!P.playing) { const c = focusClip(); if (c && c.kf && Object.keys(c.kf).some(k => k.startsWith('lumetri'))) draw(); } });
  draw();
}
function wheel(c, fx, name, k, redraw) {
  const S = 96, cv = h('canvas', { width: S, height: S, class: 'wheel' });
  fx.meta ||= {}; const pos = fx.meta[k] ||= [0, 0];
  const g = cv.getContext('2d');
  const paint = () => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2), r = Math.hypot(dx, dy);
      const i = (y * S + x) * 4;
      if (r > 1) { img.data[i + 3] = 0; continue; }
      const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360; const [R, G, B] = hsv(hue, r, .9);
      img.data[i] = R * 255; img.data[i + 1] = G * 255; img.data[i + 2] = B * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = '#000'; g.lineWidth = 1; g.beginPath(); g.arc(S / 2 + pos[0] * S / 2, S / 2 + pos[1] * S / 2, 5, 0, 7); g.stroke(); g.strokeStyle = '#fff'; g.beginPath(); g.arc(S / 2 + pos[0] * S / 2, S / 2 + pos[1] * S / 2, 4, 0, 7); g.stroke();
  };
  const apply = () => {
    const r = Math.hypot(pos[0], pos[1]); const hue = (Math.atan2(pos[1], pos[0]) * 180 / Math.PI + 360) % 360;
    const [R, G, B] = hsv(hue, 1, 1); const m = (R + G + B) / 3; const sc = r * .5;
    const v = [(R - m) * sc, (G - m) * sc, (B - m) * sc];
    ['R', 'G', 'B'].forEach((ch, i) => setParam(c, fx, k + ch, +(v[i] * (k === 'gam' ? 1 : 1)).toFixed(3)));
  };
  paint();
  cv.addEventListener('pointerdown', e => {
    hist.push('Color wheel'); const rc = cv.getBoundingClientRect();
    const mv = ev => { let x = (ev.clientX - rc.left) / rc.width * 2 - 1, y = (ev.clientY - rc.top) / rc.height * 2 - 1; const r = Math.hypot(x, y); if (r > 1) { x /= r; y /= r; } pos[0] = x; pos[1] = y; paint(); apply(); };
    mv(e); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  cv.addEventListener('dblclick', () => { hist.push('Reset wheel'); pos[0] = pos[1] = 0; paint(); apply(); });
  return h('div', { class: 'wh' }, cv, h('div', {}, name));
}
function hsv(hh, s, v) { const c = v * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = v - c; let r = 0, g = 0, b = 0; if (hh < 60) [r, g, b] = [c, x, 0]; else if (hh < 120) [r, g, b] = [x, c, 0]; else if (hh < 180) [r, g, b] = [0, c, x]; else if (hh < 240) [r, g, b] = [0, x, c]; else if (hh < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]; return [r + m, g + m, b + m]; }

// ---------------- Scopes ----------------
function scopesBuild(el) {
  el.classList.add('scopes');
  const cv = h('canvas', { class: 'scv', width: 512, height: 280 });
  let mode = ls.get('scope', 'wave');
  const sel = h('select', { class: 'msel', onchange: e => { mode = e.target.value; ls.set('scope', mode); draw(); } }, [['wave', 'Waveform (Luma)'], ['rgb', 'RGB Parade'], ['hist', 'Histogram'], ['vec', 'Vectorscope']].map(([v, l]) => h('option', { value: v, selected: v === mode }, l)));
  el.append(h('div', { class: 'ptool' }, sel), cv);
  const tmp = document.createElement('canvas'); tmp.width = 256; tmp.height = 144; const tg = tmp.getContext('2d', { willReadFrequently: true });
  const draw = () => {
    const src = pb.cv; const g = cv.getContext('2d'); g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, cv.width, cv.height);
    if (!src || !P.seq) return;
    try { tg.drawImage(src, 0, 0, 256, 144); } catch { return; }
    const d = tg.getImageData(0, 0, 256, 144).data, W = cv.width, H = cv.height;
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '10px sans-serif';
    if (mode === 'wave' || mode === 'rgb') {
      for (let i = 0; i <= 10; i++) { const y = H - i / 10 * (H - 10) - 5; g.beginPath(); g.moveTo(24, y); g.lineTo(W, y); g.stroke(); if (i % 2 === 0) g.fillText(String(i * 10), 2, y + 3); }
      const parts = mode === 'wave' ? 1 : 3, cw = (W - 24) / parts;
      for (let p = 0; p < parts; p++) {
        g.fillStyle = mode === 'wave' ? 'rgba(120,255,140,.5)' : ['rgba(255,70,70,.55)', 'rgba(70,255,70,.55)', 'rgba(80,120,255,.6)'][p];
        for (let y = 0; y < 144; y += 1) for (let x = 0; x < 256; x += 1) {
          const i = (y * 256 + x) * 4; const v = mode === 'wave' ? (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) : d[i + p];
          g.fillRect(24 + p * cw + x / 256 * cw, H - 5 - v / 255 * (H - 10), 1.2, 1.2);
        }
      }
    } else if (mode === 'hist') {
      const b = [new Array(256).fill(0), new Array(256).fill(0), new Array(256).fill(0)];
      for (let i = 0; i < d.length; i += 4) { b[0][d[i]]++; b[1][d[i + 1]]++; b[2][d[i + 2]]++; }
      const mx = Math.max(...b.flat().map(v => v)) * .6 || 1; g.globalCompositeOperation = 'lighter';
      b.forEach((arr, ci) => { g.fillStyle = ['rgba(255,60,60,.6)', 'rgba(60,255,60,.6)', 'rgba(70,110,255,.7)'][ci]; arr.forEach((v, x) => { const hh = Math.min(1, v / mx) * (H - 12); g.fillRect(8 + x / 256 * (W - 16), H - 6 - hh, (W - 16) / 256 + .6, hh); }); });
      g.globalCompositeOperation = 'source-over';
    } else {
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 12;
      g.strokeStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, R / 2, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
      // skin tone line (approx 123°)
      g.strokeStyle = 'rgba(255,180,80,.5)'; g.beginPath(); g.moveTo(cx, cy); const a = 123 * Math.PI / 180; g.lineTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R); g.stroke();
      g.fillStyle = 'rgba(120,255,200,.35)';
      for (let i = 0; i < d.length; i += 8) { const r = d[i] / 255, gg = d[i + 1] / 255, bb = d[i + 2] / 255; const u = -.169 * r - .331 * gg + .5 * bb, v = .5 * r - .419 * gg - .081 * bb; g.fillRect(cx + u * 2 * R * 1.6, cy - v * 2 * R * 1.6, 1.4, 1.4); }
    }
  };
  bus.on('frame', () => { if (el.isConnected && el.offsetParent) draw(); });
  bus.on('time', () => { if (el.isConnected && el.offsetParent && !P.playing) draw(); });
  draw();
}

// ---------------- Audio meters / mixer ----------------
function metersBuild(el) {
  el.classList.add('meters');
  const bars = [h('div', { class: 'mbar2' }, h('div', { class: 'fill' }), h('div', { class: 'pk' })), h('div', { class: 'mbar2' }, h('div', { class: 'fill' }), h('div', { class: 'pk' }))];
  const scale = h('div', { class: 'mscale' }, [0, -6, -12, -18, -24, -36, -48, -60].map(d => h('span', { style: { bottom: dbPos(d) + '%' } }, String(d))));
  el.append(h('div', { class: 'mwrap' }, scale, bars[0], bars[1]));
  const pk = [0, 0]; let raf = 0;
  const loop = () => { if (!el.isConnected) return; if (el.offsetParent) { const l = pb.level(); l.forEach((v, i) => { const db = v > 0 ? 20 * Math.log10(v) : -90; const pos = dbPos(db); bars[i].firstChild.style.height = pos + '%'; pk[i] = Math.max(pos, pk[i] - .6); bars[i].lastChild.style.bottom = pk[i] + '%'; }); } raf = requestAnimationFrame(loop); };
  loop();
}
const dbPos = d => clamp((d + 60) / 60 * 100, 0, 100);

function mixerBuild(el) {
  el.classList.add('mixer');
  const wrap = h('div', { class: 'mixw' }); el.append(wrap);
  const draw = () => {
    wrap.innerHTML = ''; if (!P.seq) return;
    P.seq.a.forEach(tr => {
      const f = h('input', { type: 'range', class: 'fader', min: -60, max: 12, step: .5, value: tr.vol ? 20 * Math.log10(tr.vol) : -60, orient: 'vertical', oninput: e => { tr.vol = Math.pow(10, +e.target.value / 20); lab.textContent = (+e.target.value).toFixed(1); pb.invalidate(); } });
      const lab = h('div', { class: 'db' }, (tr.vol ? 20 * Math.log10(tr.vol) : -60).toFixed(1));
      wrap.append(h('div', { class: 'strip' }, h('div', { class: 'sn' }, tr.name), h('div', { class: 'ms' }, h('button', { class: 'tb sm' + (tr.mute ? ' on red' : ''), onclick: () => { tr.mute = !tr.mute; pb.invalidate(); draw(); } }, 'M'), h('button', { class: 'tb sm' + (tr.solo ? ' on yel' : ''), onclick: () => { tr.solo = !tr.solo; pb.invalidate(); draw(); } }, 'S')), f, lab));
    });
  };
  bus.on('seq', draw); draw();
}

// ---------------- Info / History / Markers / Metadata ----------------
function infoBuild(el) {
  el.classList.add('info');
  const draw = () => { el.innerHTML = ''; const c = focusClip(); const it = P.source;
    const rows = c ? [['Clip', c.name], ['Type', c.type === 'v' ? 'Video' : 'Audio'], ['Start', tc(c.start, P.seq.fps)], ['End', tc(c.start + c.dur, P.seq.fps)], ['Duration', tc(c.dur, P.seq.fps)], ['Source In', tc(c.in, P.seq.fps)]] : P.seq ? [['Sequence', P.seq.name], ['Size', `${P.seq.w} x ${P.seq.h}`], ['Frame rate', P.seq.fps + ' fps'], ['Duration', tc(seqDur(), P.seq.fps)]] : [];
    rows.forEach(([a, b]) => el.append(h('div', { class: 'irow' }, h('span', {}, a), h('b', {}, b)))); };
  bus.on('select', draw); bus.on('seq', draw); draw();
}
function histBuild(el) {
  el.classList.add('hist');
  const draw = () => { el.innerHTML = ''; el.append(h('div', { class: 'hitem dim' }, 'Open Project'));
    P.history.forEach((l, i) => el.append(h('div', { class: 'hitem', onclick: () => { const n = P.history.length - i; for (let k = 0; k < n; k++) hist.undo(); } }, l)));
    el.scrollTop = 1e6; };
  bus.on('history', draw); draw();
}
function markersBuild(el) {
  el.classList.add('markers');
  const draw = () => { el.innerHTML = ''; if (!P.markers.length) { el.append(h('div', { class: 'pempty' }, 'No markers')); return; }
    P.markers.forEach(m => el.append(h('div', { class: 'mrow', onclick: () => pb.seek(m.t) }, h('i', { style: { background: m.color } }), h('span', {}, tc(m.t, P.seq ? P.seq.fps : 30)), h('b', {}, m.name), h('button', { class: 'tb sm', onclick: e => { e.stopPropagation(); P.markers = P.markers.filter(x => x !== m); bus.emit('markers'); bus.emit('seq'); } }, icon('x', 12))))); };
  bus.on('markers', draw); draw();
}
function metaBuild(el) {
  el.classList.add('info');
  const draw = () => { el.innerHTML = ''; const it = P.source || P.items[P.items.length - 1]; if (!it) { el.append(h('div', { class: 'pempty' }, 'No media selected')); return; }
    [['Name', it.name], ['Type', it.kind], ['Duration', tc(it.dur, it.fps)], ['Dimensions', it.w ? `${it.w} x ${it.h}` : '—'], ['Size', it.size ? (it.size / 1e6).toFixed(2) + ' MB' : '—']].forEach(([a, b]) => el.append(h('div', { class: 'irow' }, h('span', {}, a), h('b', {}, b)))); };
  bus.on('source', draw); bus.on('project', draw); draw();
}

// ---------------- Learn (shortcuts) ----------------
export const SHORTCUTS = [['Space', 'Play / Stop'], ['J K L', 'Shuttle reverse / pause / forward'], ['Left / Right', 'Step one frame'], ['Shift+Left / Right', 'Step five frames'], ['Up / Down', 'Previous / next edit point'], ['Home / End', 'Go to start / end'], ['I / O', 'Mark In / Out'], ['Shift+I / O', 'Go to In / Out'], ['X', 'Mark clip'], [', / .', 'Insert / Overwrite from source'], ['; / \'', 'Lift / Extract'], ['Ctrl+K', 'Add edit (razor at playhead)'], ['Delete', 'Clear selected'], ['Shift+Delete', 'Ripple delete'], ['V A B R C Y P H Z T', 'Tools'], ['S', 'Toggle snapping'], ['M', 'Add marker'], ['\\', 'Zoom timeline to fit'], ['= / -', 'Zoom in / out'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'], ['Ctrl+I', 'Import media'], ['Ctrl+Shift+E', 'Export frame'], ['`', 'Maximize hovered panel']];
function learnBuild(el) {
  el.classList.add('info');
  SHORTCUTS.forEach(([k, d]) => el.append(h('div', { class: 'irow' }, h('b', {}, k), h('span', {}, d))));
}

// ---------------- Libraries (presets) ----------------
function libBuild(el) {
  el.classList.add('info');
  const draw = () => { el.innerHTML = ''; const lib = ls.get('lib', []);
    el.append(h('div', { class: 'ptool' }, h('button', { class: 'btn', onclick: () => { const c = focusClip(); if (!c) return; const n = prompt('Preset name', 'My Look'); if (!n) return; lib.push({ n, fx: c.fx.filter(f => !['motion', 'opacity', 'time', 'avol'].includes(f.type)).map(f => JSON.parse(JSON.stringify(f))) }); ls.set('lib', lib); draw(); } }, 'Save clip effects as preset')));
    lib.forEach((p, i) => el.append(h('div', { class: 'irow link', onclick: () => { selClips().forEach(c => { hist.push('Apply preset'); c.fx = c.fx.filter(f => ['motion', 'opacity', 'time', 'avol'].includes(f.type)).concat(p.fx.map(f => ({ ...JSON.parse(JSON.stringify(f)), id: f.type === 'lumetri' ? 'lumetri' : uid('f') }))); }); pb.invalidate(); bus.emit('seq'); } }, h('span', {}, p.n), h('button', { class: 'tb sm', onclick: e => { e.stopPropagation(); lib.splice(i, 1); ls.set('lib', lib); draw(); } }, icon('x', 12)))));
    if (!lib.length) el.append(h('div', { class: 'pempty' }, 'No presets saved')); };
  draw();
}

// ---------------- Media browser ----------------
import { pickFiles, importFiles } from './media.js';
function mbBuild(el) {
  el.classList.add('info');
  el.append(h('div', { class: 'pempty' }, h('button', { class: 'btn', onclick: pickFiles }, 'Browse for files…'), h('div', { style: { marginTop: '8px' } }, 'or drop files here')));
  el.addEventListener('dragover', e => e.preventDefault()); el.addEventListener('drop', e => { e.preventDefault(); importFiles([...e.dataTransfer.files]); });
}

reg('effectControls', 'Effect Controls', ecBuild);
reg('effects', 'Effects', efBuild);
reg('lumetri', 'Lumetri Color', lumBuild);
reg('scopes', 'Lumetri Scopes', scopesBuild);
reg('meters', 'Audio Meters', metersBuild);
reg('mixer', 'Audio Track Mixer', mixerBuild);
reg('info', 'Info', infoBuild);
reg('history', 'History', histBuild);
reg('markers', 'Markers', markersBuild);
reg('metadata', 'Metadata', metaBuild);
reg('learn', 'Learn', learnBuild);
reg('libraries', 'Libraries', libBuild);
reg('mediaBrowser', 'Media Browser', mbBuild);
