import { P, h, bus, setSeq, tc, clamp, hist, findClip, seqDur, selClips } from './core.js';
import { reg, popMenu } from './dock.js';
import { item } from './media.js';
import { pb } from './playback.js';
import { FX, setKey } from './fx.js';
import { TRANS, transRegion } from './trans.js';
import { ATRANS } from './afx.js';
import { icon } from './icons.js';
import * as E from './edit.js';

const HDR = 128, RULER = 26; let RH_V = 46, RH_A = 46;
let root, scroll, inner, ruler, playhead, tcEl, snapLine, seqTabs;
const pk = new Map(); // peaks cache by item id

async function peaksFor(it) {
  if (pk.has(it.id)) return pk.get(it.id);
  const p = (async () => {
    try {
      if (!it.file || it.file.size > 150e6) return null;
      const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
      const buf = await ac.decodeAudioData(await it.file.arrayBuffer());
      const ch = buf.getChannelData(0), n = 2000, step = Math.max(1, Math.floor(ch.length / n)), out = new Float32Array(n);
      for (let i = 0; i < n; i++) { let m = 0; for (let k = 0; k < step; k += 8) m = Math.max(m, Math.abs(ch[i * step + k] || 0)); out[i] = m; }
      return { out, dur: buf.duration };
    } catch { return null; }
  })();
  pk.set(it.id, p); return p;
}

const px = t => t * P.zoom;
const tOf = x => x / P.zoom;
const laneX = e => e.clientX - inner.getBoundingClientRect().left - HDR;

function rows() {
  const s = P.seq; if (!s) return [];
  return [...s.v.slice().reverse().map(t => ({ tr: t, k: 'v' })), ...s.a.map(t => ({ tr: t, k: 'a' }))];
}

function build(el) {
  root = h('div', { class: 'tl' });
  const head = h('div', { class: 'tl-head' });
  tcEl = h('div', { class: 'tl-tc' }, '00:00:00:00');
  tcEl.addEventListener('dblclick', () => { const v = prompt('Go to timecode (frames or seconds)'); if (v != null && v !== '') pb.seek(parseFloat(v) || 0); });
  const mkTool = (icon, title, on, get) => { const b = h('button', { class: 'tb' + (get() ? ' on' : ''), title, onclick: () => { on(); b.classList.toggle('on', get()); } }, icon); bus.on('toolsync', () => b.classList.toggle('on', get())); return b; };
  seqTabs = h('div', { class: 'tl-seqs' });
  head.append(tcEl,
    mkTool(icon('magnet', 15), 'Snap in Timeline (S)', () => { P.snap = !P.snap; }, () => P.snap),
    mkTool(icon('link', 15), 'Linked Selection', () => { P.linked = P.linked === false; }, () => P.linked !== false),
    h('button', { class: 'tb', title: 'Add Marker (M)', onclick: () => addMarker() }, icon('marker', 14)),
    seqTabs, h('div', { class: 'grow' }),
    h('input', { type: 'range', min: 5, max: 600, value: P.zoom, class: 'tl-zoom', title: 'Zoom', oninput: e => setZoom(+e.target.value) }));
  scroll = h('div', { class: 'tl-scroll' });
  inner = h('div', { class: 'tl-inner' });
  scroll.append(inner);
  root.append(head, scroll);
  el.append(root);
  scroll.addEventListener('wheel', e => {
    if (e.ctrlKey || e.altKey) { e.preventDefault(); const r = scroll.getBoundingClientRect(); const mx = e.clientX - r.left - HDR; const tt = (scroll.scrollLeft + mx) / P.zoom; setZoom(clamp(P.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 5, 600)); scroll.scrollLeft = tt * P.zoom - mx; }
    else if (e.shiftKey) { e.preventDefault(); scroll.scrollLeft += e.deltaY; }
  }, { passive: false });
  scroll.addEventListener('pointerdown', down);
  scroll.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/op-trans') || e.dataTransfer.types.includes('text/op-item') || e.dataTransfer.types.includes('text/op-fx')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  scroll.addEventListener('drop', drop);
  bus.on('seq', redraw); bus.on('project', () => {}); bus.on('time', tick);
  bus.on('resize', () => {}); bus.on('transport', () => {});
  bus.on('zoom', redraw);
  redraw();
}

export function setZoom(z) { P.zoom = z; const r = root && root.querySelector('.tl-zoom'); if (r) r.value = z; redraw(); }
export function fitZoom() { const w = (scroll ? scroll.clientWidth : 800) - HDR - 40; const d = Math.max(seqDur(), 5); setZoom(clamp(w / d, 5, 600)); }

export const MCOL = { Comment: '#2ec27e', Chapter: '#e5a50a', Segmentation: '#c061cb', 'Web Link': '#4a8cf0', Todo: '#e66100' };
function addMarker(o = {}) { hist.push('Add marker'); const m = { id: 'm' + Math.random().toString(36).slice(2, 7), t: P.t, dur: 0, name: 'Marker', type: 'Comment', color: MCOL.Comment, comment: '', ...o }; P.markers.push(m); P.markers.sort((a, b) => a.t - b.t); bus.emit('markers'); redraw(); return m; }
export function markerDialog(m) {
  const ov = h('div', { class: 'pal', onclick: e => { if (e.target === ov) ov.remove(); } });
  const f = (l, el) => h('label', { class: 'mfld' }, h('span', {}, l), el);
  const name = h('input', { value: m.name }), cm = h('textarea', { rows: 3 }, m.comment || ''), du = h('input', { type: 'number', min: 0, step: .1, value: +(m.dur || 0).toFixed(2) });
  const ty = h('select', {}, Object.keys(MCOL).map(k => h('option', { value: k, selected: (m.type || 'Comment') === k }, k)));
  const co = h('input', { type: 'color', value: m.color || '#2ec27e' }); ty.onchange = () => { co.value = MCOL[ty.value]; };
  const ok = () => { hist.push('Edit marker'); m.name = name.value; m.comment = cm.value; m.dur = Math.max(0, +du.value || 0); m.type = ty.value; m.color = co.value; ov.remove(); bus.emit('markers'); redraw(); };
  ov.append(h('div', { class: 'box mdlg' }, h('div', { class: 'mh' }, 'Marker at ' + tc(m.t, P.seq.fps)), f('Name', name), f('Type', ty), f('Color', co), f('Duration (s)', du), f('Comment', cm),
    h('div', { class: 'mbt' }, h('button', { class: 'btn', onclick: () => { hist.push('Delete marker'); P.markers = P.markers.filter(x => x !== m); ov.remove(); bus.emit('markers'); redraw(); } }, 'Delete'), h('div', { class: 'grow' }), h('button', { class: 'btn', onclick: () => ov.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: ok }, 'OK'))));
  document.body.append(ov); name.focus(); name.select();
}

function drop(e) {
  const trT = e.dataTransfer.getData('text/op-trans');
  if (trT) {
    e.preventDefault(); const rowEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.row'); const tr = rowEl && E.trackOf(rowEl.dataset.tr);
    if (!tr) return; const t = tOf(laneX(e) + scroll.scrollLeft);
    let best = null; for (const c of tr.clips) for (const side of ['tin', 'tout']) { const T = side === 'tin' ? c.start : c.start + c.dur; const d = Math.abs(T - t); if (!best || d < best.d) best = { c, side, d }; }
    if (best) E.addTransition(tr, best.c, best.side, trT); return;
  }
  const fxT = e.dataTransfer.getData('text/op-fx');
  if (fxT) { e.preventDefault(); const ce = document.elementFromPoint(e.clientX, e.clientY)?.closest('.clip'); if (ce) { const f = findClip(ce.dataset.id); if (f) import('./panels2.js').then(m => m.applyFx(fxT, [f.c])); } return; }
  const id = e.dataTransfer.getData('text/op-item'); if (!id) return; e.preventDefault();
  const it = item(id); if (!it || !P.seq) return;
  const t = E.q(Math.max(0, tOf(laneX(e) + scroll.scrollLeft - 0)));
  const rowEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.row');
  let vtr = null, atr = null;
  if (rowEl) { const tr = E.trackOf(rowEl.dataset.tr); if (tr) { if (P.seq.v.includes(tr)) vtr = tr; else atr = tr; } }
  if (vtr && !atr) { atr = P.seq.a[Math.min(P.seq.a.length - 1, P.seq.v.indexOf(vtr))]; }
  if (atr && !vtr) { vtr = P.seq.v[Math.min(P.seq.v.length - 1, P.seq.a.indexOf(atr))]; }
  E.placeItem(it, { at: t, vtr, atr, mode: e.ctrlKey || e.metaKey ? 'insert' : 'overwrite' });
}

function closeSeq(q) { const i = P.openSeqs.indexOf(q.id); P.openSeqs = P.openSeqs.filter(x => x !== q.id); if (P.seq === q) { const n = P.seqs.find(x => x.id === P.openSeqs[Math.max(0, i - 1)]) || P.seqs.find(x => x !== q); if (n) setSeq(n); } else redraw(); }
function dupSeq(q) { hist.push('Duplicate Sequence'); const n = JSON.parse(JSON.stringify(q)); const rid = () => Math.random().toString(36).slice(2, 8); n.id = 's' + rid(); n.name = q.name + ' copy'; for (const tr of [...n.v, ...n.a]) { tr.id = tr.id.charAt(0) + rid(); tr.clips.forEach(c => { c.id = 'c' + rid(); }); } P.seqs.push(n); setSeq(n); }
function redraw() {
  if (!inner) return;
  const s = P.seq;
  inner.innerHTML = '';
  seqTabs.innerHTML = '';
  if (!s) { inner.append(h('div', { class: 'tl-empty' }, 'Create a sequence')); return; }
  P.openSeqs = (P.openSeqs || []).filter(id => P.seqs.some(q => q.id === id)); if (!P.openSeqs.includes(s.id)) P.openSeqs.push(s.id);
  P.openSeqs.map(id => P.seqs.find(q => q.id === id)).forEach(q => seqTabs.append(h('div', { class: 'seqtab' + (q === s ? ' on' : ''), onclick: () => setSeq(q), oncontextmenu: ev => { ev.preventDefault(); popMenu(ev.clientX, ev.clientY, [['Duplicate Sequence', () => dupSeq(q)], ['Rename...', () => { const n = prompt('Sequence name', q.name); if (n) { q.name = n; bus.emit('seq'); } }], ['Close', () => closeSeq(q)]]); } }, h('span', {}, q.name), P.openSeqs.length > 1 ? h('i', { class: 'sx', title: 'Close', onclick: ev => { ev.stopPropagation(); closeSeq(q); } }, '×') : null)));
  seqTabs.append(h('div', { class: 'seqtab add', title: 'New Sequence', onclick: () => import('./panels1.js').then(m => m.newSequence()) }, '+'));
  const dur = Math.max(seqDur(), 10) + 30;
  const W = HDR + px(dur);
  inner.style.width = W + 'px';
  // ruler
  ruler = h('div', { class: 'tl-ruler' });
  const rl = h('div', { class: 'rl-lane', style: { left: HDR + 'px', width: px(dur) + 'px' } });
  const step = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(x => px(x) >= 90) || 600;
  const sub = step / (px(step) > 300 ? 10 : px(step) > 160 ? 5 : 2);
  for (let t = 0; t <= dur; t += sub) {
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    const tk = h('div', { class: 'tick' + (major ? ' maj' : ''), style: { left: px(t) + 'px' } });
    if (major) tk.append(h('span', {}, tc(t, s.fps)));
    rl.append(tk);
  }
  if (P.inP != null || P.outP != null) {
    const a = P.inP == null ? 0 : P.inP, b = P.outP == null ? dur : P.outP;
    rl.append(h('div', { class: 'range', style: { left: px(a) + 'px', width: px(Math.max(0, b - a)) + 'px' } }));
  }
  P.markers.forEach(m => { const el = h('div', { class: 'marker', title: m.name + (m.comment ? '\n' + m.comment : ''), style: { left: px(m.t) + 'px', '--c': m.color } }); if (m.dur > 0) el.append(h('b', { class: 'mdur', style: { width: px(m.dur) + 'px' } }));
    el.addEventListener('dblclick', ev => { ev.stopPropagation(); markerDialog(m); });
    el.addEventListener('pointerdown', ev => { ev.stopPropagation(); if (ev.detail > 1) return; const sx = ev.clientX, t0 = m.t; let mv0 = false; const mv = e2 => { if (!mv0 && Math.abs(e2.clientX - sx) < 3) return; if (!mv0) { hist.push('Move marker'); mv0 = true; } m.t = Math.max(0, E.q(t0 + (e2.clientX - sx) / P.zoom)); el.style.left = px(m.t) + 'px'; }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (mv0) { P.markers.sort((a, b) => a.t - b.t); bus.emit('markers'); redraw(); } else pb.seek(m.t); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
    rl.append(el); });
  ruler.append(h('div', { class: 'rl-corner', style: { width: HDR + 'px' } }), rl);
  inner.append(ruler);
  rows().forEach(({ tr, k }) => inner.append(buildRow(tr, k)));
  if (!seqDur()) inner.append(h('div', { class: 'tl-hint' }, 'Drop media here to start editing'));
  snapLine = h('div', { class: 'snapline' }); inner.append(snapLine);
  playhead = h('div', { class: 'playhead' }, h('div', { class: 'ph-head' })); inner.append(playhead);
  tick();
  if (!P.sel.length) bus.emit('select');
  bus.emit('select');
}

function buildRow(tr, k) {
  const row = h('div', { class: 'row ' + k, 'data-tr': tr.id, style: { height: (k === 'v' ? RH_V : RH_A) + 'px' } });
  const hd = h('div', { class: 'hdr', style: { width: HDR + 'px' } });
  const tgt = h('button', { class: 'tgt' + (tr.target ? ' on' : ''), title: 'Source Patching / Targeting', onclick: () => { P.seq[k].forEach(x => x.target = false); tr.target = true; redraw(); } }, tr.name);
  hd.append(tgt);
  if (k === 'v') hd.append(h('button', { class: 'tb sm' + (tr.mute ? '' : ' on'), title: 'Toggle Track Output', onclick: () => { tr.mute = !tr.mute; pb.invalidate(); redraw(); } }, icon('eye', 13)));
  else {
    hd.append(h('button', { class: 'tb sm' + (tr.mute ? ' on red' : ''), title: 'Mute Track', onclick: () => { tr.mute = !tr.mute; pb.invalidate(); redraw(); } }, 'M'));
    hd.append(h('button', { class: 'tb sm' + (tr.solo ? ' on yel' : ''), title: 'Solo Track', onclick: () => { tr.solo = !tr.solo; pb.invalidate(); redraw(); } }, 'S'));
  }
  hd.append(h('button', { class: 'tb sm' + (tr.lock ? ' on' : ''), title: 'Toggle Track Lock', onclick: () => { tr.lock = !tr.lock; redraw(); } }, icon(tr.lock ? 'lock' : 'unlock', 12)));
  const lane = h('div', { class: 'lane' + (tr.lock ? ' locked' : ''), style: { left: HDR + 'px', width: px(Math.max(seqDur(), 10) + 30) + 'px' } });
  tr.clips.forEach(c => lane.append(buildClip(c, tr, k)));
  tr.clips.forEach(c => ['tin', 'tout'].forEach(side => { const r = transRegion(tr, c, side); if (r) lane.append(buildTrn(c, side, r)); }));
  row.append(hd, lane);
  return row;
}

function buildTrn(c, side, r) {
  const sel = P.selTr && P.selTr.id === c.id && P.selTr.side === side;
  const el = h('div', { class: 'trn' + (sel ? ' sel' : '') + (r.a && r.b ? ' cut' : ''), 'data-id': c.id, 'data-side': side, title: (TRANS[r.x.type] || ATRANS[r.x.type] || {}).name || r.x.type, style: { left: px(Math.max(0, r.r0)) + 'px', width: Math.max(8, px(r.r1 - Math.max(0, r.r0))) + 'px' } },
    h('span', {}, (TRANS[r.x.type] || ATRANS[r.x.type] || {}).name || ''), h('div', { class: 'tedge l' }), h('div', { class: 'tedge r' }));
  return el;
}
function trnDown(e, el) {
  e.preventDefault(); e.stopPropagation();
  const id = el.dataset.id, side = el.dataset.side; const f = findClip(id); if (!f) return;
  const x = f.c[side]; P.selTr = { id, side }; P.sel = []; bus.emit('select'); redraw();
  const edge = e.target.classList.contains('tedge') ? (e.target.classList.contains('l') ? 'l' : 'r') : null;
  if (!edge) return;
  const sx = e.clientX, d0 = x.dur; let moved = false;
  const mv = ev => { if (!moved) { hist.push('Resize transition'); moved = true; } const d = tOf(ev.clientX - sx) * (edge === 'l' ? -1 : 1) * ((x.align === 'center' || !x.align) && f.tr.clips.some(y => y !== f.c && Math.abs(y.start + y.dur - f.c.start) < 2e-3) ? 2 : 1); x.dur = clamp(E.q(d0 + d), 2 / E.FPS(), 30); pb.invalidate(); bus.emit('seq'); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function buildClip(c, tr, k) {
  const it = item(c.item);
  const el = h('div', { class: 'clip ' + k + (P.sel.includes(c.id) ? ' sel' : '') + (c.off ? ' off' : '') + (c.fx.some(f => !f.on) ? '' : ''), 'data-id': c.id, style: { left: px(c.start) + 'px', width: Math.max(3, px(c.dur)) + 'px' } });
  const hasFx = c.fx.some(f => !['motion', 'opacity', 'time', 'avol'].includes(f.type) && f.type !== 'lumetri' || (f.type === 'lumetri' && Object.keys(f.p).some(x => f.p[x] !== FXDEF(f, x))));
  el.append(h('div', { class: 'clabel' }, h('span', { class: 'fxb' + (hasFx ? ' on' : '') }, 'fx'), c.name + (E.speedOf(c) !== 1 ? ' [' + Math.round(E.speedOf(c) * 100) + '%]' : '')));
  if (k === 'v' && it && it.thumb) { el.style.backgroundImage = `url(${it.thumb})`; el.classList.add('thumb'); }
  if (k === 'a') {
    const cv = h('canvas', { class: 'wave' }); el.append(cv);
    if (it) peaksFor(it).then(p => { if (!p) return; const w = Math.max(2, Math.round(px(c.dur))), hh = RH_A - 4; cv.width = Math.min(w, 4000); cv.height = hh; const g = cv.getContext('2d'); g.fillStyle = 'rgba(255,255,255,.75)'; const n = cv.width; for (let x = 0; x < n; x++) { const tt = c.in + (x / n) * c.dur * E.speedOf(c); const i = Math.min(p.out.length - 1, Math.floor(tt / p.dur * p.out.length)); const m = (p.out[i] || 0) * (c.vol == null ? 1 : c.vol); g.fillRect(x, hh / 2 - m * hh / 2, 1, Math.max(1, m * hh)); } });
  }
  // rubber band (volume for audio, opacity for video when pen tool is active)
  if (k === 'a' || P.tool === 'p') {
    const [fxId, kk, mn, mx] = bandKey(c); const fx = c.fx.find(f => f.id === fxId || f.type === fxId);
    if (fx) { const arr = c.kf && c.kf[fxId + '.' + kk]; const Hh = k === 'a' ? RH_A : RH_V; const Y = v => (1 - (v - mn) / (mx - mn)) * Hh; const W = Math.max(3, px(c.dur));
      const pts = arr && arr.length ? [[0, arr[0].v], ...arr.map(p => [px(p.t), p.v]), [W, arr[arr.length - 1].v]] : [[0, fx.p[kk]], [W, fx.p[kk]]];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'rband'); svg.setAttribute('width', W); svg.setAttribute('height', Hh);
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); pl.setAttribute('points', pts.map(([x, v]) => x + ',' + Y(v)).join(' ')); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', k === 'a' ? '#f5c842' : '#ff9d2e'); pl.setAttribute('stroke-width', '1.5'); svg.append(pl);
      (arr || []).forEach(p => { const ci = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); ci.setAttribute('cx', px(p.t)); ci.setAttribute('cy', Y(p.v)); ci.setAttribute('r', 3.5); ci.setAttribute('fill', '#fff'); svg.append(ci); });
      el.append(svg); }
  }
  // keyframe ticks on clip
  const lt = [];
  for (const key in c.kf) c.kf[key].forEach(p => lt.push(p.t));
  if (lt.length) new Set(lt.map(x => x.toFixed(3))).forEach(x => el.append(h('div', { class: 'kfmark', style: { left: px(+x) + 'px' } })));
  el.append(h('div', { class: 'edge l' }), h('div', { class: 'edge r' }));
  return el;
}
const FXDEF = (f, k) => { try { return FX[f.type].params.find(p => p.k === k).def; } catch { return 0; } };

function tick() {
  if (!playhead) return;
  const x = HDR + px(P.t);
  playhead.style.transform = `translateX(${x}px)`;
  const s = P.seq; tcEl.textContent = tc(P.t, s ? s.fps : 30);
  if (P.playing) { const r = scroll.getBoundingClientRect(); const vx = x - scroll.scrollLeft; if (vx > r.width - 40) scroll.scrollLeft = x - HDR - 40; else if (vx < HDR) scroll.scrollLeft = Math.max(0, x - HDR - 40); }
}

// ---------- pointer interactions ----------
function down(e) {
  if (e.button === 2) return;
  const target = e.target;
  const s = P.seq; if (!s) return;
  if (target.closest('.hdr')) return;
  const rect = inner.getBoundingClientRect();
  // ruler scrub
  if (target.closest('.tl-ruler')) {
    e.preventDefault();
    const scrub = ev => { pb.pause(); pb.seek(E.q(Math.max(0, tOf(ev.clientX - inner.getBoundingClientRect().left - HDR)))); };
    scrub(e);
    const up = () => { removeEventListener('pointermove', scrub); removeEventListener('pointerup', up); };
    addEventListener('pointermove', scrub); addEventListener('pointerup', up);
    return;
  }
  const trnEl = target.closest('.trn'); if (trnEl) { trnDown(e, trnEl); return; }
  const clipEl = target.closest('.clip');
  const tool = P.tool;
  const lane = target.closest('.lane');
  const tAt = ev => tOf(ev.clientX - inner.getBoundingClientRect().left - HDR);
  if (tool === 'h') { panDrag(e); return; }
  if (tool === 'z') { const t = tAt(e); setZoom(clamp(P.zoom * (e.altKey ? .6 : 1.6), 5, 600)); scroll.scrollLeft = px(t) - (e.clientX - scroll.getBoundingClientRect().left - HDR); return; }
  if (!clipEl) {
    if (lane) {
      // marquee select / click clears + moves playhead
      marquee(e); return;
    }
    if (!target.closest('.hdr') && !target.closest('.rl-lane') && e.clientY > scroll.getBoundingClientRect().top + RULER + 2) { marquee(e); return; }
    return;
  }
  const f = findClip(clipEl.dataset.id); if (!f) return;
  const { c, tr } = f;
  if (tr.lock) return;
  if (tool === 'c') { E.split(E.q(tAt(e)), e.shiftKey ? null : [c.id, ...linkedIds(c)]); return; }
  const rc = clipEl.getBoundingClientRect(); const edge = target.classList.contains('edge') ? (target.classList.contains('l') ? 'l' : 'r') : null;
  if (tool === 'a' || tool === 'sa') { selectForward(c, tr, e.shiftKey, tool === 'sa'); return; }
  // selection
  if (!P.sel.includes(c.id)) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) P.sel = [...P.sel, c.id]; else P.sel = [c.id];
    if (P.linked !== false && c.link) for (const t2 of [...s.v, ...s.a]) for (const d of t2.clips) if (d.link === c.link && !P.sel.includes(d.id)) P.sel.push(d.id);
    bus.emit('select'); markSel();
  } else if (e.shiftKey || e.ctrlKey || e.metaKey) { P.sel = P.sel.filter(x => x !== c.id); bus.emit('select'); markSel(); return; }
  P.focusClip = c.id; bus.emit('select');
  if (tool === 'p') { penDrag(e, c, tr, clipEl); return; }
  if (tool === 'n' && edge) { rollDrag(e, c, tr, edge); return; }
  if (tool === 'u') { slideDrag(e, c, tr); return; }
  if (edge || tool === 'b') { if (edge) { trimDrag(e, c, tr, edge, tool); return; } }
  if (tool === 'y') { slipDrag(e, c); return; }
  if (tool === 'r' && edge) { rateDrag(e, c, edge); return; }
  moveDrag(e, c, tr);
}
const linkedIds = c => { if (!c.link || P.linked === false) return []; const o = []; for (const t of [...P.seq.v, ...P.seq.a]) for (const d of t.clips) if (d.link === c.link && d !== c) o.push(d.id); return o; };

function markSel() { inner.querySelectorAll('.clip').forEach(el => el.classList.toggle('sel', P.sel.includes(el.dataset.id))); }

function selectForward(c, tr, all, back) {
  const ids = [];
  const trs = all ? [...P.seq.v, ...P.seq.a] : [tr];
  for (const t of trs) for (const d of t.clips) if (back ? d.start + d.dur <= c.start + c.dur + 1e-6 : d.start >= c.start - 1e-6) ids.push(d.id);
  P.sel = ids; bus.emit('select'); markSel();
}

function panDrag(e) {
  const sx = e.clientX, sy = e.clientY, l0 = scroll.scrollLeft, t0 = scroll.scrollTop;
  const mv = ev => { scroll.scrollLeft = l0 - (ev.clientX - sx); scroll.scrollTop = t0 - (ev.clientY - sy); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

function marquee(e) {
  e.preventDefault();
  const base = inner.getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY; let moved = false;
  const box = h('div', { class: 'mq' }); inner.append(box);
  const additive = e.shiftKey;
  const was = additive ? [...P.sel] : [];
  let lastEv = null, raf = 0;
  const auto = () => { if (!lastEv) return; const r = scroll.getBoundingClientRect(); const dx = lastEv.clientX > r.right - 30 ? 18 : lastEv.clientX < r.left + HDR + 20 ? -18 : 0, dy = lastEv.clientY > r.bottom - 24 ? 14 : lastEv.clientY < r.top + RULER + 14 ? -14 : 0; if (dx || dy) { scroll.scrollLeft += dx; scroll.scrollTop += dy; mv(lastEv); } raf = requestAnimationFrame(auto); };
  const mv = ev => {
    moved = true; lastEv = ev; if (!raf) raf = requestAnimationFrame(auto);
    const x1 = Math.min(sx, ev.clientX), x2 = Math.max(sx, ev.clientX), y1 = Math.min(sy, ev.clientY), y2 = Math.max(sy, ev.clientY);
    Object.assign(box.style, { left: x1 - base.left + 'px', top: y1 - base.top + 'px', width: x2 - x1 + 'px', height: y2 - y1 + 'px' });
    const sel = [...was];
    inner.querySelectorAll('.clip').forEach(c => { const r = c.getBoundingClientRect(); if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) sel.push(c.dataset.id); });
    P.sel = [...new Set(sel)]; markSel(); bus.emit('select');
  };
  const up = ev => {
    cancelAnimationFrame(raf); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); box.remove();
    if (!moved) { if (!additive) { P.sel = []; markSel(); bus.emit('select'); } pb.seek(E.q(Math.max(0, tOf(ev.clientX - base.left - HDR)))); }
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

function showSnap(t) { if (!snapLine) return; if (t == null) snapLine.style.display = 'none'; else { snapLine.style.display = 'block'; snapLine.style.left = HDR + px(t) + 'px'; } }

function moveDrag(e, c, tr) {
  const ids = [...P.sel]; const set = new Set(ids); P._dragSet = set;
  const starts = {}; ids.forEach(id => { const f = findClip(id); starts[id] = { start: f.c.start, tr: f.tr.id }; });
  const sx = e.clientX, sy = e.clientY; let dt = 0, dTr = 0, moved = false, snapshotDone = false;
  const thr = 8 / P.zoom;
  const mv = ev => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    if (!moved && e.altKey) { hist.push('Duplicate'); ids.forEach(id => { const f = findClip(id); const n = E.cloneClip(f.c); n.id = n.id; f.tr.clips.push(n); }); snapshotDone = true; }
    moved = true;
    let d = tOf(ev.clientX - sx);
    // snap: clip start or end
    let best = null;
    if (P.snap) for (const id of ids) { const o = starts[id], cc = findClip(id).c; for (const edge of [o.start + d, o.start + d + cc.dur]) { const r = E.snapTo(edge, thr); if (r.hit != null && (best == null || Math.abs(r.t - edge) < Math.abs(best.adj))) best = { adj: r.t - edge, hit: r.hit }; } }
    if (best) d += best.adj; showSnap(best ? best.hit : null);
    const minStart = Math.min(...ids.map(id => starts[id].start)); if (minStart + d < 0) d = -minStart;
    dt = d; dTr = Math.round((ev.clientY - sy) / RH_V) * (c.type === 'v' ? -1 : 1);
    ids.forEach(id => { const el = inner.querySelector(`.clip[data-id="${id}"]`); if (el) { el.style.left = px(starts[id].start + dt) + 'px'; el.style.transform = `translateY(${(ev.clientY - sy)}px)`; el.classList.add('drag'); } });
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); showSnap(null); P._dragSet = null;
    if (moved) { hist.push('Move'); E.moveClips(starts, ids, dt, dTr); }
    else redraw();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

function trimDrag(e, c, tr, edge, tool) {
  e.preventDefault();
  const sx = e.clientX; const o = { start: c.start, dur: c.dur, in: c.in }; const sp = E.speedOf(c);
  const it = item(c.item); const maxDur = it && it.kind !== 'image' ? (it.dur - 0) : 1e9;
  P._dragSet = new Set([c.id]); let moved = false;
  const ripple = tool === 'b';
  const mv = ev => {
    moved = true; let d = tOf(ev.clientX - sx);
    const thr = 8 / P.zoom;
    if (edge === 'l') {
      let ns = o.start + d; const r = E.snapTo(ns, thr); if (r.hit != null) { ns = r.t; showSnap(r.hit); } else showSnap(null);
      ns = clamp(ns, ripple ? 0 : Math.max(0, o.start - o.in / sp), o.start + o.dur - 1 / E.FPS());
      const dd = ns - o.start; c.start = ns; c.in = o.in + dd * sp; c.dur = o.dur - dd;
    } else {
      let ne = o.start + o.dur + d; const r = E.snapTo(ne, thr); if (r.hit != null) { ne = r.t; showSnap(r.hit); } else showSnap(null);
      ne = Math.max(o.start + 1 / E.FPS(), ne);
      if (it && it.kind !== 'image') ne = Math.min(ne, o.start + (it.dur - o.in) / sp);
      c.dur = ne - o.start;
    }
    const el = inner.querySelector(`.clip[data-id="${c.id}"]`);
    if (el) { el.style.left = px(c.start) + 'px'; el.style.width = Math.max(3, px(c.dur)) + 'px'; }
    pb.invalidate();
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); showSnap(null); P._dragSet = null;
    if (!moved) return;
    const fin = { start: c.start, dur: c.dur, in: c.in };
    c.start = o.start; c.dur = o.dur; c.in = o.in; hist.push(ripple ? 'Ripple Edit' : 'Trim');
    c.start = fin.start; c.dur = fin.dur; c.in = fin.in; c.start = E.q(c.start); c.dur = Math.max(1 / E.FPS(), E.q(c.dur));
    const delta = (fin.dur - o.dur);
    if (ripple) { const end0 = o.start + o.dur; for (const c2 of tr.clips) if (c2 !== c && c2.start >= end0 - 1e-6) c2.start += delta; if (edge === 'l') c.start = o.start; }
    else { E.clearRange(tr, c.start, c.start + c.dur, new Set([c.id])); }
    tr.clips.sort((a, b) => a.start - b.start);
    // trim linked partner equally
    if (c.link && P.linked !== false) for (const t2 of [...P.seq.v, ...P.seq.a]) for (const d of t2.clips) if (d.link === c.link && d !== c) { d.start = c.start; d.in = c.in; d.dur = c.dur; }
    bus.emit('seq');
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

const adjL = (tr, c) => tr.clips.find(x => x !== c && Math.abs(x.start + x.dur - c.start) < 2e-3);
const adjR = (tr, c) => tr.clips.find(x => x !== c && Math.abs(x.start - (c.start + c.dur)) < 2e-3);
const maxOut = x => { const it = item(x.item); return it && it.kind !== 'image' ? (it.dur - x.in) / E.speedOf(x) : 1e9; };
function rollDrag(e, c, tr, edge) {
  e.preventDefault();
  // collect pairs on this track and on linked tracks with the same boundary
  const T0 = edge === 'l' ? c.start : c.start + c.dur; const pairs = [];
  const add = (t2) => { const L = t2.clips.find(x => Math.abs(x.start + x.dur - T0) < 2e-3), R = t2.clips.find(x => Math.abs(x.start - T0) < 2e-3); if (L && R) pairs.push([L, R]); };
  add(tr); if (c.link && P.linked !== false) for (const t2 of [...P.seq.v, ...P.seq.a]) if (t2 !== tr) { const m = t2.clips.find(x => x.link === c.link); if (m) add(t2); }
  if (!pairs.length) return;
  const o = pairs.map(([L, R]) => ({ L, R, ld: L.dur, rs: R.start, ri: R.in, rd: R.dur }));
  let moved = false, sx = e.clientX; const F = 1 / E.FPS(); P._dragSet = new Set(pairs.flat().map(x => x.id));
  const mv = ev => {
    let d = tOf(ev.clientX - sx);
    for (const p of o) { d = Math.min(d, maxOut(p.L) - p.ld, p.rd - F); d = Math.max(d, -(p.ld - F), -p.ri / E.speedOf(p.R)); }
    const r = E.snapTo(T0 + d, 8 / P.zoom); if (r.hit != null && P.snap) { const dd = r.t - T0; if (dd >= -1e9) d = dd; showSnap(r.hit); } else showSnap(null);
    if (!moved) { hist.push('Rolling Edit'); moved = true; }
    for (const p of o) { p.L.dur = p.ld + d; p.R.start = p.rs + d; p.R.in = p.ri + d * E.speedOf(p.R); p.R.dur = p.rd - d; }
    pb.invalidate(); redraw();
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); showSnap(null); P._dragSet = null; for (const p of o) { p.L.dur = E.q(p.L.dur); p.R.start = E.q(p.R.start); p.R.dur = Math.max(F, E.q(p.R.dur)); } bus.emit('seq'); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function slideDrag(e, c, tr) {
  e.preventDefault(); const L = adjL(tr, c), R = adjR(tr, c); const F = 1 / E.FPS();
  const o = { cs: c.start, ls: L && L.dur, rs: R && R.start, ri: R && R.in, rd: R && R.dur }; let moved = false, sx = e.clientX; P._dragSet = new Set([c.id]);
  const mv = ev => {
    let d = tOf(ev.clientX - sx);
    if (L) d = Math.min(Math.max(d, -(o.ls - F)), maxOut(L) - o.ls); else d = Math.max(d, -o.cs);
    if (R) d = Math.max(Math.min(d, o.rd - F), -o.ri / E.speedOf(R));
    if (!moved) { hist.push('Slide'); moved = true; }
    c.start = o.cs + d; if (L) L.dur = o.ls + d; if (R) { R.start = o.rs + d; R.in = o.ri + d * E.speedOf(R); R.dur = o.rd - d; }
    pb.invalidate(); redraw();
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); P._dragSet = null; c.start = E.q(c.start); if (L) L.dur = E.q(L.dur); if (R) { R.start = E.q(R.start); R.dur = Math.max(F, E.q(R.dur)); } bus.emit('seq'); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
// pen tool: rubber-band keyframes on opacity (video) / volume (audio)
function bandKey(c) { return c.type === 'a' ? ['avol', 'db', -60, 15] : ['opacity', 'op', 0, 100]; }
function penDrag(e, c, tr, clipEl) {
  e.preventDefault(); const [fxId, k, mn, mx] = bandKey(c); const fx = c.fx.find(f => f.id === fxId || f.type === fxId); if (!fx) return;
  const r = clipEl.getBoundingClientRect(); const key = fxId + '.' + k; const lt = clamp(tOf(e.clientX - r.left), 0, c.dur);
  const yv = ev => clamp(1 - (ev.clientY - r.top) / r.height, 0, 1) * (mx - mn) + mn;
  const arr = (c.kf && c.kf[key]) || [];
  let hit = arr.find(p => Math.abs(px(p.t) - px(lt)) < 7);
  hist.push('Rubber band');
  if (!hit) { const cur = arr.length ? kfv(arr, lt) : fx.p[k]; setKey(c, fxId, k, lt, cur, 'linear'); hit = c.kf[key].find(p => Math.abs(p.t - lt) < 1e-3); }
  const mv = ev => { const t = clamp(tOf(ev.clientX - r.left), 0, c.dur); hit.t = t; hit.v = Math.round(yv(ev) * 10) / 10; c.kf[key].sort((a, b) => a.t - b.t); pb.invalidate(); redraw(); };
  mv(e);
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); bus.emit('seq'); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
const kfv = (arr, t) => { if (t <= arr[0].t) return arr[0].v; const l = arr[arr.length - 1]; if (t >= l.t) return l.v; for (let i = 0; i < arr.length - 1; i++) if (t >= arr[i].t && t <= arr[i + 1].t) { const u = (t - arr[i].t) / (arr[i + 1].t - arr[i].t || 1); return arr[i].v + (arr[i + 1].v - arr[i].v) * u; } return l.v; };
function slipDrag(e, c) {
  const sx = e.clientX; const in0 = c.in; const it = item(c.item); let moved = false;
  hist.push('Slip');
  const mv = ev => { moved = true; const d = tOf(ev.clientX - sx) * E.speedOf(c); c.in = clamp(in0 - d, 0, it && it.kind !== 'image' ? Math.max(0, it.dur - c.dur * E.speedOf(c)) : 1e9); pb.invalidate(); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); bus.emit('seq'); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

function rateDrag(e, c, edge) {
  const sx = e.clientX; const d0 = c.dur, sp0 = E.speedOf(c); const f = c.fx.find(x => x.type === 'time'); let moved = false;
  hist.push('Rate Stretch');
  const mv = ev => { moved = true; const d = tOf(ev.clientX - sx); const nd = Math.max(1 / E.FPS(), d0 + (edge === 'r' ? d : -d)); c.dur = nd; if (edge === 'l') c.start = c.start; f.p.speed = clamp(sp0 * 100 * d0 / nd, 5, 1000); const el = inner.querySelector(`.clip[data-id="${c.id}"]`); if (el) el.style.width = px(c.dur) + 'px'; pb.invalidate(); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); bus.emit('seq'); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

reg('timeline', 'Timeline', build);

// exported helpers for keyboard
export const tl = { setRowHeight(n) { RH_V = RH_A = n; }, redraw, setZoom, fitZoom, addMarker, scrollToPlayhead() { if (scroll) scroll.scrollLeft = Math.max(0, px(P.t) - 200); } };
