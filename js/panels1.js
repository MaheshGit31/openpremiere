import { P, h, bus, tc, dur, uid, clamp, newSeq, hist, seqDur, selClips } from './core.js';
import { reg, popMenu } from './dock.js';
import { item, pickFiles, importFiles, makeBars, makeSolid, elFor } from './media.js';
import { pb } from './playback.js';
import * as E from './edit.js';
import { icon } from './icons.js';

// ---------------- Project ----------------
let projEl, projBody, projPath = 'root', projView = 'icon', projQ = '';
function projBuild(el) {
  projEl = el; el.classList.add('proj');
  const bar = h('div', { class: 'ptool' });
  const search = h('input', { class: 'psearch', placeholder: 'Search', oninput: e => { projQ = e.target.value.toLowerCase(); projDraw(); } });
  bar.append(search, h('div', { class: 'grow' }),
    h('button', { class: 'tb', title: 'List View', onclick: () => { projView = 'list'; projDraw(); } }, icon('list')),
    h('button', { class: 'tb', title: 'Icon View', onclick: () => { projView = 'icon'; projDraw(); } }, icon('grid')),
    h('button', { class: 'tb', title: 'New Bin', onclick: newBin }, icon('folder')),
    h('button', { class: 'tb', title: 'New Item', onclick: e => newItemMenu(e) }, icon('newitem')),
    h('button', { class: 'tb', title: 'Import (Ctrl+I)', onclick: pickFiles }, icon('import')));
  projBody = h('div', { class: 'pbodyl' });
  el.append(bar, projBody);
  el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  el.addEventListener('drop', e => { if (e.dataTransfer.files.length) { e.preventDefault(); importFiles([...e.dataTransfer.files], projPath); } });
  bus.on('project', projDraw); bus.on('seq', projDraw);
  projDraw();
}
export function newBin() { const n = prompt('Bin name', 'Bin'); if (!n) return; P.bins.push({ id: uid('b'), name: n, parent: projPath }); projDraw(); }
export function newItemMenu(e) {
  popMenu(e.clientX, e.clientY, [
    ['Sequence...', () => newSequence()], '-',
    ['Bars and Tone', () => makeBars()], ['Black Video', () => makeSolid('Black Video', '#000')], ['Color Matte...', () => { const c = prompt('Color', '#2d8ceb'); if (c) makeSolid('Color Matte', c); }],
  ]);
}
export function newSequence(name) {
  const n = name || 'Sequence ' + String(P.seqs.length + 1).padStart(2, '0');
  const s = newSeq(n); P.seqs.push(s); P.seq = s; P.t = 0; bus.emit('seq'); bus.emit('time'); return s;
}
function projDraw() {
  if (!projBody) return;
  projBody.innerHTML = '';
  const crumbs = []; let cur = projPath;
  while (cur) { const b = P.bins.find(x => x.id === cur); crumbs.unshift(b); cur = b && b.parent; }
  projBody.append(h('div', { class: 'crumbs' }, crumbs.map((b, i) => h('span', { onclick: () => { projPath = b.id; projDraw(); } }, b.name + (i < crumbs.length - 1 ? ' ›' : '')))));
  const wrap = h('div', { class: projView === 'icon' ? 'igrid' : 'ilist' });
  const bins = P.bins.filter(b => b.parent === projPath && (!projQ || b.name.toLowerCase().includes(projQ)));
  bins.forEach(b => wrap.append(h('div', { class: 'pitem bin', ondblclick: () => { projPath = b.id; projDraw(); } }, h('div', { class: 'pth' }, icon('folder', 40)), h('div', { class: 'pnm' }, b.name))));
  if (projPath === 'root') P.seqs.filter(s => !projQ || s.name.toLowerCase().includes(projQ)).forEach(s => wrap.append(h('div', { class: 'pitem seqi' + (s === P.seq ? ' on' : ''), ondblclick: () => { P.seq = s; P.sel = []; bus.emit('seq'); } }, h('div', { class: 'pth' }, icon('seq', 40)), h('div', { class: 'pnm' }, s.name), h('div', { class: 'pdr' }, tc(seqDur(s), s.fps)))));
  P.items.filter(i => i.bin === projPath && (!projQ || i.name.toLowerCase().includes(projQ))).forEach(it => {
    const d = h('div', { class: 'pitem' + (P.source === it ? ' on' : ''), draggable: 'true', title: it.name });
    d.addEventListener('dragstart', e => { e.dataTransfer.setData('text/op-item', it.id); e.dataTransfer.effectAllowed = 'copy'; });
    d.addEventListener('dblclick', () => openSource(it));
    d.addEventListener('click', () => { P.source = P.source; projBody.querySelectorAll('.pitem').forEach(x => x.classList.remove('on')); d.classList.add('on'); });
    d.append(h('div', { class: 'pth' }, it.thumb ? h('img', { src: it.thumb, draggable: false }) : icon(it.kind === 'audio' ? 'audio' : 'film', 36)),
      h('div', { class: 'pnm' }, it.name), h('div', { class: 'pdr' }, it.kind === 'image' ? '' : tc(it.dur, it.fps)));
    wrap.append(d);
  });
  if (!wrap.children.length) wrap.append(h('div', { class: 'pempty' }, 'Import media to begin'));
  projBody.append(wrap);
}

// ---------------- Source monitor ----------------
let srcMedia, srcWrap, srcTc, srcDur, srcBar, srcPh, srcRange, srcHold;
export function openSource(it) {
  P.source = it; P.srcIn = null; P.srcOut = null; srcT = 0;
  if (!srcWrap) return;
  srcWrap.innerHTML = '';
  if (it.kind === 'image') srcMedia = h('img', { src: it.url });
  else { srcMedia = document.createElement(it.kind === 'video' ? 'video' : 'audio'); srcMedia.src = it.url; srcMedia.muted = false; srcMedia.playsInline = true; if (it.kind === 'audio') srcMedia.style.display = 'none'; srcMedia.addEventListener('timeupdate', srcUpdate); srcMedia.addEventListener('ended', srcUpdate); }
  srcWrap.append(srcMedia);
  if (it.kind === 'audio') srcWrap.append(h('div', { class: 'audioicon' }, icon('audio', 64)));
  srcDur.textContent = it.kind === 'image' ? '00:00:05:00' : tc(it.dur, it.fps);
  srcUpdate(); bus.emit('source');
  if (window.OP_openPanel) window.OP_openPanel('source');
}
let srcT = 0;
const srcCur = () => (srcMedia && srcMedia.currentTime) || srcT || 0;
function srcUpdate() {
  const it = P.source; if (!it) return;
  const t = srcCur(); srcTc.textContent = tc(t, it.fps);
  srcPh.style.left = (it.dur ? t / it.dur * 100 : 0) + '%';
  const a = P.srcIn == null ? 0 : P.srcIn, b = P.srcOut == null ? it.dur : P.srcOut;
  srcRange.style.left = (a / it.dur * 100) + '%'; srcRange.style.width = ((b - a) / it.dur * 100) + '%'; srcRange.style.display = P.srcIn == null && P.srcOut == null ? 'none' : 'block';
}
export const src = {
  play() { if (!srcMedia || srcMedia.tagName === 'IMG') return; srcMedia.paused ? srcMedia.play() : srcMedia.pause(); },
  seek(t) { if (!srcMedia || !P.source) return; if (srcMedia.tagName !== 'IMG') srcMedia.currentTime = clamp(t, 0, P.source.dur); srcT = t; srcUpdate(); },
  step(n) { const it = P.source; if (!it) return; this.seek(srcCur() + n / (it.fps || 30)); },
  markIn() { if (P.source) { P.srcIn = srcCur(); if (P.srcOut != null && P.srcOut < P.srcIn) P.srcOut = null; srcUpdate(); } },
  markOut() { if (P.source) { P.srcOut = srcCur() || P.source.dur; srcUpdate(); } },
  insert(mode) {
    const it = P.source; if (!it || !P.seq) return;
    const a = P.srcIn == null ? 0 : P.srcIn, b = P.srcOut == null ? it.dur : P.srcOut;
    E.placeItem(it, { at: P.t, inT: a, outT: b, mode }); P.t = Math.min(P.t + (b - a), P.t + (b - a));
    pb.seek(P.t + (b - a));
  },
};
function srcBuild(el) {
  el.classList.add('mon');
  srcWrap = h('div', { class: 'mview' }, h('div', { class: 'mempty' }, 'Source: (no clips)'));
  srcTc = h('div', { class: 'mtc blue' }, '00:00:00:00'); srcDur = h('div', { class: 'mtc' }, '00:00:00:00');
  srcPh = h('div', { class: 'mph' }); srcRange = h('div', { class: 'mrange' });
  srcBar = h('div', { class: 'mbar' }, srcRange, srcPh);
  srcBar.addEventListener('pointerdown', e => { const mv = ev => { const r = srcBar.getBoundingClientRect(); if (P.source) src.seek(clamp((ev.clientX - r.left) / r.width, 0, 1) * P.source.dur); }; mv(e); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
  const b = (ic, t, f) => h('button', { class: 'tb', title: t, onclick: f }, icon(ic));
  const ctl = h('div', { class: 'mctl' },
    b('markin', 'Mark In (I)', () => src.markIn()), b('markout', 'Mark Out (O)', () => src.markOut()),
    b('gotoin', 'Go to In', () => src.seek(P.srcIn || 0)), b('stepb', 'Step Back (Left)', () => src.step(-1)), b('play', 'Play (Space)', () => src.play()), b('stepf', 'Step Forward (Right)', () => src.step(1)), b('gotoout', 'Go to Out', () => src.seek(P.srcOut == null ? (P.source ? P.source.dur : 0) : P.srcOut)),
    h('span', { class: 'sep' }), b('insert', 'Insert (,)', () => src.insert('insert')), b('overwrite', 'Overwrite (.)', () => src.insert('overwrite')));
  el.append(srcWrap, h('div', { class: 'mtcs' }, srcTc, h('div', { class: 'grow' }), srcDur), srcBar, ctl);
  if (P.source) openSource(P.source);
}

// ---------------- Program monitor ----------------
let pgCv, pgWrap, pgTc, pgDur, pgBar, pgPh, pgRange, ov;
function pgBuild(el) {
  el.classList.add('mon');
  pgCv = h('canvas', { class: 'pcv' }); ov = h('canvas', { class: 'pov' });
  pgWrap = h('div', { class: 'mview' }, pgCv, ov);
  pgTc = h('div', { class: 'mtc blue' }, '00:00:00:00'); pgDur = h('div', { class: 'mtc' }, '00:00:00:00');
  pgPh = h('div', { class: 'mph' }); pgRange = h('div', { class: 'mrange' });
  pgBar = h('div', { class: 'mbar' }, pgRange, pgPh);
  pgBar.addEventListener('pointerdown', e => { const mv = ev => { const r = pgBar.getBoundingClientRect(); const d = Math.max(seqDur(), 1); pb.seek(E.q(clamp((ev.clientX - r.left) / r.width, 0, 1) * d)); }; pb.pause(); mv(e); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
  const b = (ic, t, f) => h('button', { class: 'tb', title: t, onclick: f }, icon(ic));
  const q = h('select', { class: 'msel', title: 'Playback Resolution', onchange: e => { pb.q = +e.target.value; pb.invalidate(); } }, [['1', 'Full'], ['.5', '1/2'], ['.25', '1/4']].map(([v, l]) => h('option', { value: v }, l)));
  const fit = h('select', { class: 'msel', title: 'Zoom Level', onchange: e => { zoomMode = e.target.value; layoutMon(); } }, [['fit', 'Fit'], ['.25', '25%'], ['.5', '50%'], ['1', '100%'], ['2', '200%']].map(([v, l]) => h('option', { value: v }, l)));
  const ctl = h('div', { class: 'mctl' },
    b('markin', 'Mark In (I)', () => { P.inP = P.t; if (P.outP != null && P.outP < P.inP) P.outP = null; bus.emit('seq'); }), b('markout', 'Mark Out (O)', () => { P.outP = P.t; if (P.inP != null && P.inP > P.outP) P.inP = null; bus.emit('seq'); }),
    b('gotoin', 'Go to In (Shift+I)', () => pb.seek(P.inP == null ? 0 : P.inP)), b('stepb', 'Step Back (Left)', () => pb.step(-1)), b('play', 'Play/Stop (Space)', () => pb.toggle()), b('stepf', 'Step Forward (Right)', () => pb.step(1)), b('gotoout', 'Go to Out (Shift+O)', () => pb.seek(P.outP == null ? seqDur() : P.outP)),
    h('span', { class: 'sep' }), b('lift', 'Lift (;)', () => E.liftExtract(false)), b('extract', "Extract (')", () => E.liftExtract(true)), b('camera', 'Export Frame (Ctrl+Shift+E)', exportFrame));
  el.append(pgWrap, h('div', { class: 'mtcs' }, pgTc, fit, q, h('div', { class: 'grow' }), pgDur), pgBar, ctl);
  pb.attach(pgCv);
  const upd = () => {
    const s = P.seq; if (!s) return;
    pgTc.textContent = tc(P.t, s.fps); const d = seqDur();
    pgDur.textContent = tc(d, s.fps); pgPh.style.left = (d ? clamp(P.t / d, 0, 1) * 100 : 0) + '%';
    const a = P.inP == null ? 0 : P.inP, bb = P.outP == null ? d : P.outP;
    pgRange.style.display = P.inP == null && P.outP == null ? 'none' : 'block'; pgRange.style.left = (d ? a / d * 100 : 0) + '%'; pgRange.style.width = (d ? (bb - a) / d * 100 : 0) + '%';
    drawOv();
  };
  bus.on('time', upd); bus.on('seq', () => { layoutMon(); upd(); pb.invalidate(); }); bus.on('resize', layoutMon); bus.on('select', drawOv); bus.on('param', () => { pb.invalidate(); drawOv(); });
  new ResizeObserver(layoutMon).observe(pgWrap);
  ov.addEventListener('pointerdown', ovDown);
  layoutMon(); upd();
}
let zoomMode = 'fit';
function layoutMon() {
  if (!pgWrap || !P.seq) return;
  const r = pgWrap.getBoundingClientRect(); const s = P.seq;
  let w = r.width - 8, hh = r.height - 8;
  let k = Math.min(w / s.w, hh / s.h);
  if (zoomMode !== 'fit') k = +zoomMode;
  const cw = Math.max(10, s.w * k), ch = Math.max(10, s.h * k);
  for (const c of [pgCv, ov]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
  ov.width = Math.round(cw); ov.height = Math.round(ch);
  drawOv();
}
function exportFrame() { pb.render(); pgCv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'frame.png'; a.click(); }); }

// transform handles
const FOCUS = () => { const s = P.seq; if (!s) return null; const id = P.sel.length ? P.sel[P.sel.length - 1] : null; if (!id) return null; for (const t of s.v) for (const c of t.clips) if (c.id === id) return c; return null; };
import { val, setKey, FX } from './fx.js';
function clipBox(c) {
  const s = P.seq, it = item(c.item); if (!it) return null;
  const lt = P.t - c.start; const m = c.fx.find(f => f.type === 'motion'); if (!m) return null;
  const px_ = val(c, m, 'px', lt), py = val(c, m, 'py', lt), sc = val(c, m, 'scale', lt) / 100, rot = val(c, m, 'rot', lt) * Math.PI / 180, ax = val(c, m, 'ax', lt), ay = val(c, m, 'ay', lt);
  const sw = it.w || s.w, sh = it.h || s.h;
  const pts = [[0, 0], [sw, 0], [sw, sh], [0, sh]].map(([x, y]) => { let X = (x - ax) * sc, Y = (y - ay) * sc; return [X * Math.cos(rot) - Y * Math.sin(rot) + px_, X * Math.sin(rot) + Y * Math.cos(rot) + py]; });
  return { pts, m, c, px: px_, py, sc, rot, sw, sh, ax, ay };
}
function drawOv() {
  if (!ov || !P.seq) return;
  const g = ov.getContext('2d'); g.clearRect(0, 0, ov.width, ov.height);
  const c = FOCUS(); if (!c || P.playing) return;
  const b = clipBox(c); if (!b) return;
  const k = ov.width / P.seq.w;
  g.strokeStyle = '#2d8ceb'; g.lineWidth = 1.5; g.beginPath(); b.pts.forEach(([x, y], i) => i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)); g.closePath(); g.stroke();
  g.fillStyle = '#fff'; g.strokeStyle = '#2d8ceb';
  b.pts.forEach(([x, y]) => { g.fillRect(x * k - 4, y * k - 4, 8, 8); g.strokeRect(x * k - 4, y * k - 4, 8, 8); });
  g.beginPath(); g.arc(b.px * k, b.py * k, 3, 0, 7); g.stroke();
}
function ovDown(e) {
  const c = FOCUS(); if (!c) return;
  const b = clipBox(c); if (!b) return;
  const r = ov.getBoundingClientRect(); const k = P.seq.w / r.width;
  const mx = (e.clientX - r.left) * k, my = (e.clientY - r.top) * k;
  let corner = b.pts.findIndex(([x, y]) => Math.hypot(x - mx, y - my) < 12 * k);
  // inside polygon?
  const inside = (() => { let ins = false; const p = b.pts; for (let i = 0, j = 3; i < 4; j = i++) { if ((p[i][1] > my) !== (p[j][1] > my) && mx < (p[j][0] - p[i][0]) * (my - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) ins = !ins; } return ins; })();
  if (corner < 0 && !inside) return;
  e.preventDefault(); hist.push(corner >= 0 ? 'Scale' : 'Position');
  const m = b.m, lt = P.t - c.start, ak = c.kf && Object.keys(c.kf).some(k => k.startsWith('motion.'));
  const px0 = b.px, py0 = b.py, sc0 = b.sc; const d0 = Math.hypot(mx - b.px, my - b.py);
  const setP = (k, v) => { if (c.kf[`motion.${k}`]) setKey(c, 'motion', k, lt, v); else m.p[k] = v; };
  const mv = ev => {
    const x = (ev.clientX - r.left) * k, y = (ev.clientY - r.top) * k;
    if (corner >= 0) { const nd = Math.hypot(x - px0, y - py0); setP('scale', Math.max(1, sc0 * 100 * nd / d0)); }
    else { setP('px', px0 + (x - mx)); setP('py', py0 + (y - my)); }
    bus.emit('param'); bus.emit('fxchange');
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); bus.emit('seq'); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

// ---------------- Tools ----------------
const TOOLS = [['v', 'Selection Tool (V)', 'tsel'], ['a', 'Track Select Forward Tool (A)', 'tfwd'], ['b', 'Ripple Edit Tool (B)', 'tripple'], ['r', 'Rate Stretch Tool (R)', 'trate'], ['c', 'Razor Tool (C)', 'trazor'], ['y', 'Slip Tool (Y)', 'tslip'], ['p', 'Pen Tool (P)', 'tpen'], ['h', 'Hand Tool (H)', 'thand'], ['z', 'Zoom Tool (Z)', 'tzoom'], ['t', 'Type Tool (T)', 'ttype']];
export function setTool(k) {
  if (!TOOLS.find(t => t[0] === k)) return;
  P.tool = k; document.body.dataset.tool = k; bus.emit('tool');
}
function toolsBuild(el) {
  el.classList.add('tools');
  const draw = () => { el.innerHTML = ''; TOOLS.forEach(([k, t, ic]) => el.append(h('button', { class: 'tool' + (P.tool === k ? ' on' : ''), title: t, onclick: () => setTool(k) }, icon(ic)))); };
  bus.on('tool', draw); draw();
}

reg('project', 'Project', projBuild);
reg('source', 'Source', srcBuild);
reg('program', 'Program', pgBuild);
reg('tools', 'Tools', toolsBuild);
