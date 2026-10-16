import { P, h, bus, setSeq, tc, dur, uid, clamp, newSeq, hist, seqDur, selClips } from './core.js';
import { reg, popMenu } from './dock.js';
import { item, pickFiles, importFiles, makeBars, makeSolid, elFor } from './media.js';
import { pb } from './playback.js';
import * as E from './edit.js';
import { icon } from './icons.js';
import { ls } from './core.js';
import { tl } from './timeline.js';
import { toolDown, drawToolOv, GT, endEdit } from './gfxtools.js';

// ---------------- Project ----------------
let projEl, projBody, projPath = 'root', projView = ls.get('proj.view', 'icon'), projQ = '', projSort = ls.get('proj.sort', 'name'), projFilter = 'all', projSel = new Set(), projLast = null, projSearchEl, projCount;
const LABELS = ['#7c8cf8', '#2ec27e', '#e5a50a', '#e66100', '#c64600', '#c061cb', '#26a269', '#ff7b63'];
export const usedIds = () => { const u = new Set(); for (const s of P.seqs) for (const t of [...s.v, ...s.a]) for (const c of t.clips) u.add(c.item); return u; };
function projBuild(el) {
  projEl = el; el.classList.add('proj'); el.tabIndex = 0;
  const info = h('div', { class: 'pinfo' }, h('span', { class: 'pfi' }, icon('filmstrip', 18)), h('span', {}, (P.projName || 'Untitled') + '.oprproj'));
  projSearchEl = h('input', { class: 'psearch', placeholder: '', title: 'Search project (Ctrl+F)', oninput: e => { projQ = e.target.value.toLowerCase(); projDraw(); } });
  projCount = h('div', { class: 'pcount' });
  const srow = h('div', { class: 'psrow' }, h('div', { class: 'psbox' }, icon('search', 15), projSearchEl), projCount);
  const sortBtn = h('button', { class: 'pb', title: 'Sort and Filter', onclick: e => popMenu(e.clientX, e.clientY, [
    ...['name', 'duration', 'type', 'date added'].map(k => ['Sort by ' + k, () => { projSort = k; ls.set('proj.sort', k); projDraw(); }, '', projSort === k]), '-',
    ...[['all', 'Show all'], ['video', 'Video only'], ['audio', 'Audio only'], ['image', 'Images only'], ['unused', 'Unused media'], ['fav', 'Favorites']].map(([k, l]) => [l, () => { projFilter = k; projDraw(); }, '', projFilter === k])]) }, icon('sort', 17));
  const vb = (name, v, title) => h('button', { class: 'pb' + (projView === v ? ' on' : ''), title, 'data-v': v, onclick: () => { projView = v; ls.set('proj.view', v); projEl.querySelectorAll('.pb[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); projDraw(); } }, icon(name, 17));
  const zoomS = h('input', { type: 'range', class: 'pzoom', min: 70, max: 220, value: ls.get('proj.zoom', 120), title: 'Thumbnail size', oninput: e => { ls.set('proj.zoom', +e.target.value); el.style.setProperty('--ps', e.target.value + 'px'); } });
  el.style.setProperty('--ps', ls.get('proj.zoom', 120) + 'px');
  const bot = h('div', { class: 'pbot' }, vb('list', 'list', 'List View'), vb('grid', 'icon', 'Icon View'), h('span', { class: 'pzl' }, icon('chev', 0)), zoomS, sortBtn, h('div', { class: 'grow' }),
    h('button', { class: 'pb', title: 'New Bin', onclick: newBin }, icon('folder', 17)), h('button', { class: 'pb', title: 'New Item', onclick: e => newItemMenu(e) }, icon('newitem', 17)),
    h('button', { class: 'pb', title: 'Import (Ctrl+I)', onclick: pickFiles }, icon('import', 17)), h('button', { class: 'pb', title: 'Delete', onclick: () => delItems([...projSel]) }, icon('trash', 17)));
  projBody = h('div', { class: 'pbodyl' });
  el.append(info, srow, projBody, bot);
  el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  el.addEventListener('drop', e => { if (e.dataTransfer.files.length) { e.preventDefault(); importFiles([...e.dataTransfer.files], projPath); } });
  el.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); projSearchEl.focus(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && projSel.size) { e.stopPropagation(); delItems([...projSel]); }
    else if (e.key === 'F2' && projSel.size === 1) renameItem([...projSel][0]);
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); e.stopPropagation(); P.items.filter(i => !i.gfxItem && i.bin === projPath).forEach(i => projSel.add(i.id)); projDraw(); }
  });
  // marquee selection
  projBody.addEventListener('pointerdown', e => {
    if (e.target.closest('.pitem') || e.button) return; el.focus();
    const r0 = projBody.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY; const box = h('div', { class: 'marq' }); document.body.append(box); const base = e.shiftKey ? new Set(projSel) : new Set();
    projSel = new Set(base);
    const mv = ev => { const x1 = Math.min(sx, ev.clientX), x2 = Math.max(sx, ev.clientX), y1 = Math.min(sy, ev.clientY), y2 = Math.max(sy, ev.clientY); Object.assign(box.style, { left: x1 + 'px', top: y1 + 'px', width: x2 - x1 + 'px', height: y2 - y1 + 'px' });
      projSel = new Set(base); projBody.querySelectorAll('.pitem[data-id]').forEach(d => { const r = d.getBoundingClientRect(); const hit = r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2; d.classList.toggle('on', hit || base.has(d.dataset.id)); if (hit) projSel.add(d.dataset.id); }); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); box.remove(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  bus.on('project', projDraw); bus.on('seq', projDraw);
  projDraw();
}
export function focusProjectSearch() { openPanelLater('project'); setTimeout(() => projSearchEl && projSearchEl.focus(), 50); }
const openPanelLater = id => import('./dock.js').then(m => m.openPanel(id));
function delItems(ids) { if (!ids.length) return; hist.push('Delete media'); P.items = P.items.filter(i => !ids.includes(i.id)); for (const s of P.seqs) for (const t of [...s.v, ...s.a]) t.clips = t.clips.filter(c => !ids.includes(c.item)); projSel.clear(); bus.emit('project'); bus.emit('seq'); }
function renameItem(id) { const it = P.items.find(i => i.id === id); if (!it) return; const n = prompt('Rename', it.name); if (n) { it.name = n; bus.emit('project'); } }
export function newBin() { const n = prompt('Bin name', 'Bin'); if (!n) return; P.bins.push({ id: uid('b'), name: n, parent: projPath }); projDraw(); }
export function newItemMenu(e) {
  popMenu(e.clientX, e.clientY, [
    ['Sequence...', () => newSequence()], '-',
    ['Bars and Tone', () => makeBars()], ['Black Video', () => makeSolid('Black Video', '#000')], ['Color Matte...', () => { const c = prompt('Color', '#2d8ceb'); if (c) makeSolid('Color Matte', c); }],
  ]);
}
export function newSequence(name) {
  const n = name || 'Sequence ' + String(P.seqs.length + 1).padStart(2, '0');
  const s = newSeq(n); P.seqs.push(s); setSeq(s); return s;
}
function projDraw() {
  if (!projBody) return;
  projBody.innerHTML = '';
  const crumbs = []; let cur = projPath;
  while (cur) { const b = P.bins.find(x => x.id === cur); crumbs.unshift(b); cur = b && b.parent; }
  const searching = !!projQ;
  if (searching || projPath !== 'root') projBody.append(h('div', { class: 'crumbs' }, searching ? h('span', {}, 'Search results for "' + projQ + '"') : crumbs.map((b, i) => h('span', { onclick: () => { projPath = b.id; projDraw(); } }, b.name + (i < crumbs.length - 1 ? ' ›' : '')))));
  const wrap = h('div', { class: projView === 'icon' ? 'igrid' : 'ilist' });
  const q = s => s.toLowerCase().includes(projQ);
  const bins = P.bins.filter(b => (searching ? q(b.name) : b.parent === projPath));
  bins.forEach(b => wrap.append(h('div', { class: 'pitem bin', ondblclick: () => { projPath = b.id; projQ = ''; if (projSearchEl) projSearchEl.value = ''; projDraw(); } }, h('div', { class: 'pth' }, icon('folder', 40)), h('div', { class: 'pnm' }, b.name))));
  if (searching || projPath === 'root') P.seqs.filter(s => !searching || q(s.name)).forEach(s => wrap.append(h('div', { class: 'pitem seqi' + (s === P.seq ? ' on' : ''), ondblclick: () => setSeq(s) }, h('div', { class: 'pth' }, icon('seq', 40), h('i', { class: 'pbadge' }, icon('seq', 13))), h('div', { class: 'pnm' }, s.name), h('div', { class: 'pdr' }, tc(seqDur(s), s.fps)))));
  const used = usedIds();
  let list = P.items.filter(i => !i.gfxItem && (searching ? q(i.name) : i.bin === projPath));
  if (projFilter === 'unused') list = list.filter(i => !used.has(i.id)); else if (projFilter === 'fav') list = list.filter(i => i.fav); else if (projFilter !== 'all') list = list.filter(i => i.kind === projFilter);
  const cmp = { name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }), duration: (a, b) => (b.dur || 0) - (a.dur || 0), type: (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name), 'date added': (a, b) => P.items.indexOf(b) - P.items.indexOf(a) }[projSort];
  list.sort(cmp);
  list.forEach(it => {
    const d = h('div', { class: 'pitem' + (projSel.has(it.id) || P.source === it ? ' on' : ''), draggable: 'true', title: it.name, 'data-id': it.id });
    d.addEventListener('dragstart', e => { e.dataTransfer.setData('text/op-item', it.id); e.dataTransfer.effectAllowed = 'copy'; });
    d.addEventListener('dblclick', () => openSource(it));
    d.addEventListener('click', e => {
      projEl.focus();
      if (e.ctrlKey || e.metaKey) { projSel.has(it.id) ? projSel.delete(it.id) : projSel.add(it.id); }
      else if (e.shiftKey && projLast) { const ids = list.map(x => x.id); const a = ids.indexOf(projLast), b = ids.indexOf(it.id); if (a >= 0 && b >= 0) { projSel = new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1)); } }
      else projSel = new Set([it.id]);
      projLast = it.id; projBody.querySelectorAll('.pitem[data-id]').forEach(x => x.classList.toggle('on', projSel.has(x.dataset.id)));
    });
    d.addEventListener('contextmenu', e => { e.preventDefault(); if (!projSel.has(it.id)) { projSel = new Set([it.id]); projDraw(); } popMenu(e.clientX, e.clientY, [
      ['Open in Source Monitor', () => openSource(it)], ['Insert at Playhead', () => { openSource(it); E.placeItem(it, { mode: 'insert' }); }], ['Overwrite at Playhead', () => E.placeItem(it, { mode: 'overwrite' })], '-',
      [it.fav ? 'Remove Favorite' : 'Add to Favorites', () => { it.fav = !it.fav; projDraw(); }],
      ...LABELS.slice(0, 4).map((c, i) => ['Label ' + ['Violet', 'Green', 'Yellow', 'Orange'][i], () => { [...projSel].forEach(id => { const x = P.items.find(y => y.id === id); if (x) x.label = c; }); projDraw(); }]), ['Clear Label', () => { [...projSel].forEach(id => { const x = P.items.find(y => y.id === id); if (x) x.label = null; }); projDraw(); }], '-',
      ['Rename...', () => renameItem(it.id), 'F2'], ['Delete', () => delItems([...projSel]), 'Del']]); });
    const thumb = h('div', { class: 'pth' }, it.thumb ? h('img', { src: it.thumb, draggable: false }) : icon(it.kind === 'audio' ? 'audio' : 'film', 36), h('i', { class: 'pbadge' }, icon(it.kind === 'audio' ? 'audio' : it.kind === 'image' ? 'freeform' : 'filmstrip', 13)));
    if (it.kind === 'video' && it.thumb && projView === 'icon') hoverScrub(thumb, it);
    d.append(thumb, h('div', { class: 'pnm' }, h('i', { class: 'plab', style: { background: it.label || 'transparent' } }), it.fav ? h('span', { class: 'pfav' }, icon('star', 10)) : null, h('span', {}, it.name)), h('div', { class: 'pdr' }, it.kind === 'image' ? '' : tc(it.dur, it.fps)));
    if (!used.has(it.id) && projFilter === 'all') d.classList.add('unused');
    wrap.append(d);
  });
  if (!wrap.children.length) wrap.append(h('div', { class: 'pempty' }, searching ? 'No matches' : 'Import media to begin'));
  projBody.append(wrap);
  if (projCount) projCount.textContent = (projSel.size || (P.source ? 1 : 0)) + ' of ' + (list.length + (projPath === 'root' ? P.seqs.length : 0)) + ' items selected';
}
// hover to scrub: seek a hidden video on mouse move and paint its frame over the thumbnail
function hoverScrub(box, it) {
  let v = null, cv = null;
  box.addEventListener('pointerenter', () => { if (v) return; v = document.createElement('video'); v.src = it.url; v.muted = true; v.preload = 'auto'; cv = h('canvas', { class: 'hscrub' }); cv.width = 160; cv.height = 90; box.append(cv); cv.style.display = 'none';
    v.addEventListener('seeked', () => { try { cv.getContext('2d').drawImage(v, 0, 0, 160, 90); cv.style.display = 'block'; } catch (e) { } }); });
  box.addEventListener('pointermove', e => { if (!v || !v.duration) return; const r = box.getBoundingClientRect(); v.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * v.duration * .999; });
  box.addEventListener('pointerleave', () => { if (cv) cv.style.display = 'none'; if (v) { v.removeAttribute('src'); v.load(); v = null; } if (cv) { cv.remove(); cv = null; } });
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
    b('marker', 'Add Marker (M)', () => tl.addMarker()), b('markin', 'Mark In (I)', () => src.markIn()), b('markout', 'Mark Out (O)', () => src.markOut()),
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
    h('span', { class: 'sep' }), b('lift', 'Lift (;)', () => E.liftExtract(false)), b('extract', "Extract (')", () => E.liftExtract(true)), b('camera', 'Export Frame (Ctrl+Shift+E)', exportFrame), h('span', { class: 'sep' }), b('plus', 'Button Editor', e => popMenu(e.clientX, e.clientY, [['Insert (,)', () => src.insert('insert')], ['Overwrite (.)', () => src.insert('overwrite')], ['Export Frame', exportFrame]])));
  el.append(pgWrap, h('div', { class: 'mtcs' }, pgTc, fit, q, h('button', { class: 'tb', title: 'Settings', onclick: e => popMenu(e.clientX, e.clientY, [['Fit', () => { zoomMode = 'fit'; layoutMon(); }], ['100%', () => { zoomMode = '1'; layoutMon(); }], ['Full resolution', () => { pb.q = 1; pb.invalidate(); }], ['Half resolution', () => { pb.q = .5; pb.invalidate(); }]]) }, icon('wrench', 16)), h('div', { class: 'grow' }), pgDur), pgBar, h('div', { class: 'mnav' }, h('i', {}), h('i', {})), ctl);
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
  ov.addEventListener('pointerdown', e => { if (!toolDown(e, ov)) ovDown(e); });
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
  const k = ov.width / P.seq.w;
  const custom = drawToolOv(g, k);
  const c = FOCUS(); if (!c || P.playing || custom || c.gfx) return;
  const b = clipBox(c); if (!b) return;
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
// groups: first entry is default; hold a group button to pick another tool of that group
export const TOOL_ALL = {
  v: ['Selection Tool (V)', 'tsel'], a: ['Track Select Forward Tool (A)', 'tfwd'], sa: ['Track Select Backward Tool (Shift+A)', 'tback'],
  b: ['Ripple Edit Tool (B)', 'tripple'], n: ['Rolling Edit Tool (N)', 'troll'], r: ['Rate Stretch Tool (R)', 'trate'],
  c: ['Razor Tool (C)', 'trazor'], y: ['Slip Tool (Y)', 'tslip'], u: ['Slide Tool (U)', 'tslide'], p: ['Pen Tool (P)', 'tpen'],
  rect: ['Rectangle Tool', 'trect'], ellipse: ['Ellipse Tool', 'tellipse'], poly: ['Polygon Tool', 'tpoly'],
  om_obj: ['Object Mask Tool', 'tobj'], om_ellipse: ['Ellipse Mask Tool', 'tmell'], om_rect: ['Rectangle Mask Tool', 'tmrect'], om_pen: ['Pen Mask Tool', 'tmpen'],
  h: ['Hand Tool (H)', 'thand'], z: ['Zoom Tool (Z)', 'tzoom'], t: ['Type Tool (T)', 'ttype'],
};
const TOOL_GROUPS = [['v'], ['a', 'sa'], ['b', 'n', 'r'], ['c'], ['y', 'u'], ['p'], ['rect', 'ellipse', 'poly'], ['om_obj', 'om_ellipse', 'om_rect', 'om_pen'], ['h', 'z'], ['t']];
const grpCur = g => { const k = ls.get('tg.' + g[0], g[0]); return g.includes(k) ? k : g[0]; };
export function setTool(k) {
  if (!TOOL_ALL[k]) return;
  const g = TOOL_GROUPS.find(x => x.includes(k)); if (g && g.length > 1) ls.set('tg.' + g[0], k);
  endTextEdit();
  P.tool = k; document.body.dataset.tool = k; bus.emit('tool');
}
function endTextEdit() { try { GT.pen = null; GT.maskPen = null; endEdit(); } catch {} }
function toolsBuild(el) {
  el.classList.add('tools');
  const draw = () => {
    el.innerHTML = '';
    TOOL_GROUPS.forEach(g => {
      const cur = g.includes(P.tool) ? P.tool : grpCur(g), [title, ic] = TOOL_ALL[cur];
      const b = h('button', { class: 'tool' + (g.includes(P.tool) ? ' on' : '') + (g.length > 1 ? ' grp' : ''), title: title + (g.length > 1 ? ' - hold for more' : '') }, icon(ic));
      let timer = 0, held = false;
      const menu = () => { held = true; const r = b.getBoundingClientRect(); popMenu(r.right + 2, r.top, g.map(k => [TOOL_ALL[k][0], () => setTool(k), '', k === cur])); };
      b.addEventListener('pointerdown', e => { held = false; if (g.length > 1) timer = setTimeout(menu, 340); });
      b.addEventListener('pointerup', () => { clearTimeout(timer); if (!held) setTool(cur); });
      b.addEventListener('pointerleave', () => clearTimeout(timer));
      b.addEventListener('contextmenu', e => { e.preventDefault(); if (g.length > 1) menu(); });
      el.append(b);
    });
  };
  bus.on('tool', draw); draw();
}

reg('project', 'Project', projBuild);
reg('source', 'Source', srcBuild);
reg('program', 'Program', pgBuild);
reg('tools', 'Tools', toolsBuild);
