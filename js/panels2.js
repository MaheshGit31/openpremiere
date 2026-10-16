import { P, h, bus, tc, clamp, hist, uid, seqDur, findClip, selClips, ls } from './core.js';
import { reg, popMenu } from './dock.js';
import { FX, CATS, newFx, val, setKey, delKey, kfKey, kfval, EASE_NAMES } from './fx.js';
import { pb } from './playback.js';
import { icon } from './icons.js';
import { item } from './media.js';
import { TRANS, TCATS } from './trans.js';
import { AFX, ACATS, ATRANS } from './afx.js';
import { defaultMask } from './gfxtools.js';
import * as E from './edit.js';
import { tl, markerDialog } from './timeline.js';

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
  if (P.selTr) {
    const f = findClip(P.selTr.id), x = f && f.c[P.selTr.side], d = x && (TRANS[x.type] || ATRANS[x.type]);
    if (!x || !d) P.selTr = null;
    else { trPanel(f.c, f.tr, P.selTr.side, x, d); ecBody.scrollTop = sc; return; }
  }
  const c = focusClip();
  if (!c) { ecBody.append(h('div', { class: 'pempty' }, 'Select a clip')); return; }
  const it = item(c.item);
  ecBody.append(h('div', { class: 'echead' }, h('span', {}, (c.type === 'v' ? 'Video' : 'Audio') + ' – ' + c.name), h('i', {}, tc(c.start, P.seq.fps) + ' to ' + tc(c.start + c.dur, P.seq.fps))));
  for (const fx of c.fx) {
    const d = FX[fx.type] || AFX[fx.type]; if (!d) continue;
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
    const vis = (c.type === 'a' && fx.type !== 'avol' && !AFX[fx.type]) ? [] : d.params.filter(q => !(fx.type === 'motion' && q.k === 'flick') && !(fx.type === 'motion' && q.k === 'sw'));
    for (const q of vis) ecBody.append(paramRow(c, fx, q, rer));
  }
  if (c.type === 'v') maskSection(c);
  ecBody.scrollTop = sc;
}

function maskSection(c) {
  const open = EC.open['masks' + c.id] !== false;
  ecBody.append(h('div', { class: 'fxh' }, h('span', { class: 'twist' + (open ? ' o' : ''), onclick: () => { EC.open['masks' + c.id] = !open; ecDraw(true); } }, icon('chev', 11)), h('span', { class: 'fxn' }, 'Masks'), h('div', { class: 'grow' }),
    h('button', { class: 'tb sm', title: 'Add ellipse mask', onclick: () => { hist.push('Mask'); defaultMask(c, 'ellipse'); } }, icon('tmell', 14)),
    h('button', { class: 'tb sm', title: 'Add 4-point polygon mask', onclick: () => { hist.push('Mask'); defaultMask(c, 'rect'); } }, icon('tmrect', 14)),
    h('button', { class: 'tb sm', title: 'Draw free-form mask', onclick: () => { hist.push('Mask'); defaultMask(c, 'path'); } }, icon('tmpen', 14))));
  if (!open) return;
  (c.masks || []).forEach((m, i) => {
    const on = P.maskSel && P.maskSel.id === m.id;
    ecBody.append(h('div', { class: 'pwrap' }, h('div', { class: 'prow simple eg mrw' + (on ? ' on' : ''), onclick: () => { P.maskSel = { clip: c.id, id: m.id }; bus.emit('param'); ecDraw(true); } }, h('span', { class: 'stopw dis' }), h('span', { class: 'pl' }, (m.name || (m.type === 'rect' ? 'Polygon' : m.type[0].toUpperCase() + m.type.slice(1))) + ' Mask ' + (i + 1)), h('span', { class: 'egc' },
      h('label', { class: 'mchk', title: 'Invert' }, h('input', { type: 'checkbox', class: 'pchk', checked: !!m.inv, onclick: e => e.stopPropagation(), onchange: e => { hist.push('Invert mask'); m.inv = e.target.checked; pb.invalidate(); } }), 'Inverted'),
      h('button', { class: 'tb sm', onclick: e => { e.stopPropagation(); hist.push('Delete mask'); c.masks.splice(i, 1); if (P.maskSel && P.maskSel.id === m.id) P.maskSel = null; pb.invalidate(); bus.emit('seq'); } }, icon('x', 12))))));
    if (on) for (const [k, l, mn, mx, st] of [['feather', 'Mask Feather', 0, 300, 1], ['op', 'Mask Opacity', 0, 100, 1], ['exp', 'Mask Expansion', -100, 100, 1]])
      ecBody.append(h('div', { class: 'pwrap' }, h('div', { class: 'prow simple eg' }, h('span', { class: 'stopw dis' }), h('span', { class: 'pl' }, l), h('span', { class: 'egc' }, h('input', { type: 'range', class: 'psl', min: mn, max: mx, step: st, value: m[k] ?? (k === 'op' ? 100 : 0), onpointerdown: () => hist.push('Mask ' + k), oninput: e => { m[k] = +e.target.value; pb.invalidate(); } })))));
  });
}
function simpleRow(c, fx, q, rer) {
  const cur = () => fx.p[q.k];
  let ctl;
  if (q.t === 'color') ctl = h('input', { type: 'color', class: 'pcol', value: cur(), oninput: e => setParam(c, fx, q.k, e.target.value), onpointerdown: () => hist.push('Change ' + q.l) });
  else if (q.t === 'bool') ctl = h('input', { type: 'checkbox', class: 'pchk', checked: !!cur(), onchange: e => { hist.push('Change ' + q.l); setParam(c, fx, q.k, e.target.checked ? 1 : 0); } });
  else if (q.t === 'sel') ctl = h('select', { class: 'msel', onchange: e => { hist.push('Change ' + q.l); setParam(c, fx, q.k, +e.target.value); } }, q.opts.map((o, i) => h('option', { value: i, selected: i === Math.round(cur()) }, o)));
  else ctl = h('input', { type: 'text', class: 'ptxt', value: cur() || '', onkeydown: e => e.stopPropagation(), oninput: e => setParam(c, fx, q.k, e.target.value), onfocus: () => hist.push('Change ' + q.l) });
  return h('div', { class: 'pwrap' }, h('div', { class: 'prow simple' }, h('span', { class: 'stopw dis' }), h('span', { class: 'pl' }, q.l), ctl));
}
function trPanel(c, tr, side, x, d) {
  const fps = P.seq.fps;
  ecBody.append(h('div', { class: 'echead' }, h('span', {}, 'Transition - ' + d.name), h('i', {}, side === 'tin' ? 'at clip start' : 'at clip end')));
  const rer = () => ecDraw(true);
  const row = (l, ctl) => ecBody.append(h('div', { class: 'pwrap' }, h('div', { class: 'prow simple' }, h('span', { class: 'stopw dis' }), h('span', { class: 'pl' }, l), ctl)));
  const REG = x.audio ? ATRANS : TRANS;
  const typ = h('select', { class: 'msel', onchange: e => { hist.push('Change transition'); const n = e.target.value; x.type = n; x.p = {}; REG[n].params.forEach(q => x.p[q.k] = q.def); pb.invalidate(); bus.emit('seq'); } }, Object.values(REG).map(t => h('option', { value: t.type, selected: t.type === x.type }, t.name)));
  row('Transition', typ);
  row('Duration', h('input', { type: 'number', class: 'nvi', step: 1 / fps, min: 2 / fps, value: +x.dur.toFixed(3), onkeydown: e => e.stopPropagation(), onchange: e => { hist.push('Transition duration'); x.dur = Math.max(2 / fps, +e.target.value || 1); pb.invalidate(); bus.emit('seq'); } }));
  if (side === 'tin') row('Alignment', h('select', { class: 'msel', onchange: e => { hist.push('Transition alignment'); x.align = e.target.value; pb.invalidate(); bus.emit('seq'); } }, [['center', 'Center at Cut'], ['start', 'Start at Cut'], ['end', 'End at Cut']].map(([v, l]) => h('option', { value: v, selected: (x.align || 'center') === v }, l))));
  for (const q of d.params) {
    const get = () => x.p[q.k] ?? q.def, set = v => { x.p[q.k] = v; pb.invalidate(); };
    let ctl;
    if (q.t === 'color') ctl = h('input', { type: 'color', class: 'pcol', value: get(), onpointerdown: () => hist.push('Transition'), oninput: e => set(e.target.value) });
    else if (q.t === 'bool') ctl = h('input', { type: 'checkbox', class: 'pchk', checked: !!get(), onchange: e => { hist.push('Transition'); set(e.target.checked ? 1 : 0); } });
    else if (q.t === 'sel') ctl = h('select', { class: 'msel', onchange: e => { hist.push('Transition'); set(+e.target.value); } }, q.opts.map((o, i) => h('option', { value: i, selected: i === Math.round(get()) }, o)));
    else { const lab = h('span', { class: 'nv' }, String(+(+get()).toFixed(2))); ctl = h('span', { class: 'trnum' }, lab, h('input', { type: 'range', class: 'psl', min: q.min, max: q.max, step: q.step, value: get(), onpointerdown: () => hist.push('Transition'), oninput: e => { set(+e.target.value); lab.textContent = String(+(+e.target.value).toFixed(2)); } })); }
    row(q.l, ctl);
  }
  ecBody.append(h('div', { class: 'ptool' }, h('button', { class: 'btn', onclick: () => E.removeTransition(c.id, side) }, 'Remove transition')));
}
function paramRow(c, fx, q, rer) {
  if (q.t && q.t !== 'num') return simpleRow(c, fx, q, rer);
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
function efBuild(el) {
  el.classList.add('efp');
  const q = h('input', { class: 'psearch', placeholder: 'Search effects and transitions', oninput: () => draw() });
  const list = h('div', { class: 'eflist' });
  el.append(h('div', { class: 'ptool' }, q), list);
  const open = new Set(['Video Effects', 'Video Transitions', 'Video Effects/Color Correction', 'Video Transitions/Dissolve']);
  const fav = () => ls.get('favfx', []);
  const roots = () => [
    ['Video Effects', CATS.map(cat => [cat, Object.values(FX).filter(f => f.cat === cat && !f.hidden && !f.builtin || f.type === 'lumetri' && f.cat === cat).map(f => ({ name: f.name, type: f.type, kind: 'fx' }))])],
    ['Video Transitions', TCATS.map(cat => [cat, Object.values(TRANS).filter(f => f.cat === cat).map(f => ({ name: f.name, type: f.type, kind: 'tr' }))])],
    ['Audio Effects', ACATS.map(cat => [cat, Object.values(AFX).filter(f => f.cat === cat).map(f => ({ name: f.name, type: f.type, kind: 'afx' }))])],
    ['Audio Transitions', [['Crossfade', Object.values(ATRANS).map(f => ({ name: f.name, type: f.type, kind: 'atr' }))]]],
  ];
  const draw = () => {
    list.innerHTML = ''; const s = q.value.toLowerCase().trim();
    const fv = fav();
    if (fv.length && !s) {
      const key = 'Favorites', o = open.has(key);
      list.append(h('div', { class: 'efroot', onclick: () => { o ? open.delete(key) : open.add(key); draw(); } }, h('span', { class: 'twist' + (o ? ' o' : '') }, icon('chev', 11)), icon('star', 13), 'Favorites'));
      if (o) fv.forEach(t => { const it = findItem(t); if (it) list.append(itemRow(it, 1)); });
    }
    for (const [root, cats] of roots()) {
      const rk = root, ro = open.has(rk) || !!s;
      const rows = cats.map(([cat, items]) => [cat, items.filter(i => !s || i.name.toLowerCase().includes(s) || cat.toLowerCase().includes(s))]).filter(([, i]) => i.length);
      if (!rows.length) continue;
      list.append(h('div', { class: 'efroot', onclick: () => { ro && !s ? open.delete(rk) : open.add(rk); draw(); } }, h('span', { class: 'twist' + (ro ? ' o' : '') }, icon('chev', 11)), icon('folder', 14), root));
      if (!ro) continue;
      for (const [cat, items] of rows) {
        const ck = root + '/' + cat, o = open.has(ck) || !!s;
        list.append(h('div', { class: 'efcat', onclick: () => { o && !s ? open.delete(ck) : open.add(ck); draw(); } }, h('span', { class: 'twist' + (o ? ' o' : '') }, icon('chev', 11)), icon('folder', 13), cat));
        if (o) items.forEach(it => list.append(itemRow(it, 2)));
      }
    }
  };
  const findItem = t => { for (const [, cats] of roots()) for (const [, items] of cats) { const i = items.find(x => x.kind + ':' + x.type === t); if (i) return i; } return null; };
  const itemRow = (it, lvl) => {
    const key = it.kind + ':' + it.type, isF = fav().includes(key);
    const r = h('div', { class: 'efitem l' + lvl, draggable: 'true', title: 'Double-click to apply' }, icon(it.kind === 'tr' || it.kind === 'atr' ? 'trans' : it.kind === 'afx' ? 'wave' : 'fx', 14), h('span', { class: 'efn' }, it.name),
      h('button', { class: 'tb xs fav' + (isF ? ' on' : ''), title: 'Favorite', onclick: e => { e.stopPropagation(); const f = fav(); ls.set('favfx', isF ? f.filter(x => x !== key) : [...f, key]); draw(); } }, icon('star', 11)));
    r.addEventListener('dragstart', e => { if (it.kind === 'fx') e.dataTransfer.setData('text/op-fx', it.type); else if (it.kind === 'afx') e.dataTransfer.setData('text/op-fx', it.type); else e.dataTransfer.setData('text/op-trans', it.type); });
    r.addEventListener('dblclick', () => { if (it.kind === 'fx' || it.kind === 'afx') applyFx(it.type); else E.applyDefaultTransition(it.kind === 'tr' ? 'v' : 'a', it.type); });
    return r;
  };
  draw();
}
export function applyFx(type, clips) {
  const isA = !!AFX[type];
  const cs = (clips && clips.length ? clips : selClips()).filter(c => c.type === (isA ? 'a' : 'v'));
  if (!cs.length) return;
  const name = (FX[type] || AFX[type]).name;
  hist.push('Apply ' + name);
  cs.forEach(c => { if (type === 'lumetri') return; const f = isA ? (() => { const p = {}; AFX[type].params.forEach(q => p[q.k] = q.def); return { id: uid('f'), type, on: true, p }; })() : newFx(type); c.fx.push(f); });
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
  el.append(h('div', { class: 'mwrap' }, bars[0], bars[1], scale), h('div', { class: 'msolo' }, h('button', {}, 'S'), h('button', {}, 'S')));
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
  const draw = () => { el.innerHTML = ''; el.append(h('div', { class: 'mtool' }, h('button', { class: 'btn', onclick: () => tl.addMarker() }, 'Add marker'), h('button', { class: 'btn', onclick: () => { if (!P.markers.length) return; hist.push('Clear markers'); P.markers = []; bus.emit('markers'); bus.emit('seq'); } }, 'Clear all')));
    if (!P.markers.length) { el.append(h('div', { class: 'pempty' }, 'No markers. Press M to add one')); return; }
    P.markers.forEach(m => el.append(h('div', { class: 'mrow', onclick: () => pb.seek(m.t), ondblclick: () => markerDialog(m) }, h('i', { style: { background: m.color } }), h('span', {}, tc(m.t, P.seq ? P.seq.fps : 30)), h('b', {}, m.name, m.comment ? h('em', {}, ' ' + m.comment) : null), h('span', { class: 'mty' }, m.type || ''), h('button', { class: 'tb sm', onclick: e => { e.stopPropagation(); hist.push('Delete marker'); P.markers = P.markers.filter(x => x !== m); bus.emit('markers'); bus.emit('seq'); } }, icon('x', 12))))); };
  bus.on('markers', draw); bus.on('seq', draw); draw();
}
function metaBuild(el) {
  el.classList.add('info');
  const draw = () => { el.innerHTML = ''; const it = P.source || P.items[P.items.length - 1]; if (!it) { el.append(h('div', { class: 'pempty' }, 'No media selected')); return; }
    [['Name', it.name], ['Type', it.kind], ['Duration', tc(it.dur, it.fps)], ['Dimensions', it.w ? `${it.w} x ${it.h}` : '—'], ['Size', it.size ? (it.size / 1e6).toFixed(2) + ' MB' : '—']].forEach(([a, b]) => el.append(h('div', { class: 'irow' }, h('span', {}, a), h('b', {}, b)))); };
  bus.on('source', draw); bus.on('project', draw); draw();
}

// ---------------- Learn (shortcuts) ----------------
export const SHORTCUTS = [['Space', 'Play / Stop'], ['J K L', 'Shuttle reverse / pause / forward'], ['Left / Right', 'Step one frame'], ['Shift+Left / Right', 'Step five frames'], ['Up / Down', 'Previous / next edit point'], ['Home / End', 'Go to start / end'], ['I / O', 'Mark In / Out'], ['Shift+I / O', 'Go to In / Out'], ['X', 'Mark clip'], [', / .', 'Insert / Overwrite from source'], ['; / \'', 'Lift / Extract'], ['Ctrl+K', 'Add edit (razor at playhead)'], ['Delete', 'Clear selected'], ['Shift+Delete', 'Ripple delete'], ['V A B R C Y P H Z T', 'Tools'], ['S', 'Toggle snapping'], ['M', 'Add marker'], ['\\', 'Zoom timeline to fit'], ['= / -', 'Zoom in / out'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'], ['Ctrl+I', 'Import media'], ['Ctrl+Shift+E', 'Export frame'], ['`', 'Maximize hovered panel'], ['Q / W', 'Ripple trim previous / next edit to playhead'], ['Alt+Q / W', 'Trim previous / next edit to playhead'], ['E', 'Extend selected edit to playhead'], ['Shift+E', 'Enable / disable clip'], ['Shift+J / L', 'Slow shuttle'], ['Page Up / Down', 'Previous / next edit'], ['F', 'Match frame'], ['Shift+R', 'Reverse match frame'], ['G', 'Audio gain'], ['Ctrl+Shift+I / O', 'Clear In / Out'], ['Ctrl+Shift+X', 'Clear In and Out'], ['Shift+M', 'Next marker'], ['Ctrl+Shift+M', 'Previous marker'], ['Ctrl+Alt+M', 'Clear marker at playhead'], ['Ctrl+Alt+Shift+M', 'Clear all markers'], ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'], ['Alt+drag', 'Duplicate clip'], ['Alt+Arrows', 'Nudge clip'], ['Shift+= / Shift+-', 'Taller / shorter tracks'], ['Shift+1..8', 'Focus panels'], ['Ctrl+D / Ctrl+Shift+D', 'Default video / audio transition'], ['Ctrl+F', 'Find in project'], ['Ctrl+Shift+P', 'Command palette'], ['Shift+A', 'Track select backward'], ['N / U', 'Rolling / slide tool']];
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
