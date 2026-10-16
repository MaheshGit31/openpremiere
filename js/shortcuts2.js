import { P, bus, hist, selClips, findClip, clamp, tc } from './core.js';
import * as E from './edit.js';
import { pb } from './playback.js';
import { tl } from './timeline.js';
import { openSource } from './panels1.js';
import { item } from './media.js';
import { openPanel, maxHovered } from './dock.js';

const allT = () => [...P.seq.v, ...P.seq.a];
const items = id => item(id);
const sel = () => selClips();
const toast = m => { let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.append(t); } t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1400); };
export { toast };

// ripple/plain trim of the clip edges nearest the playhead
function trimEdit(side, ripple) {
  const t = P.t; hist.push(ripple ? 'Ripple Trim' : 'Trim to Playhead');
  const targets = P.seq.v.concat(P.seq.a).filter(tr => !tr.lock && (tr.target || true));
  let changed = false;
  for (const tr of targets) {
    for (const c of tr.clips) {
      const end = c.start + c.dur, sp = E.speedOf(c);
      if (side === 'prev' && t > c.start + 1e-6 && t < end - 1e-6) {
        // trim head of clip containing playhead
        const d = t - c.start; c.in += d * sp; c.dur -= d; E.shiftKf(c, d); changed = true;
        if (ripple) { c.start = t - d; } else c.start = t;
      } else if (side === 'next' && t > c.start + 1e-6 && t < end - 1e-6) {
        const d = end - t; c.dur -= d; changed = true;
        if (ripple) for (const o of tr.clips) if (o !== c && o.start >= end - 1e-6) o.start -= d;
      }
    }
    tr.clips.sort((a, b) => a.start - b.start);
  }
  if (!changed) { hist.undo && 0; toast('Nothing under the playhead'); return; }
  bus.emit('seq');
}
function extendEdit() {
  const cs = sel(); if (!cs.length) return; hist.push('Extend Edit'); const t = P.t;
  for (const c of cs) {
    const end = c.start + c.dur, sp = E.speedOf(c);
    if (t > end) c.dur = t - c.start;
    else if (t < c.start) { const d = c.start - t; c.in = Math.max(0, c.in - d * sp); c.start = t; c.dur += d; }
  }
  bus.emit('seq');
}
function clearInOut(which) { if (which !== 'out') P.inP = null; if (which !== 'in') P.outP = null; bus.emit('seq'); }
function goMarker(dir) { const m = P.markers.map(x => x.t); const t = P.t; const n = dir > 0 ? m.find(x => x > t + 1e-4) : [...m].reverse().find(x => x < t - 1e-4); if (n != null) pb.seek(n); }
function clearMarker(all) {
  hist.push('Clear Marker'); if (all) P.markers = []; else { const t = P.t; let best = null, bd = 1e9; P.markers.forEach(m => { const d = Math.abs(m.t - t); if (d < bd) { bd = d; best = m; } }); if (best) P.markers = P.markers.filter(m => m !== best); }
  bus.emit('markers'); bus.emit('seq');
}
function group(on) {
  const cs = sel(); if (!cs.length) return; hist.push(on ? 'Group' : 'Ungroup');
  const g = on ? 'g' + Math.random().toString(36).slice(2, 6) : null; cs.forEach(c => { c.link = g; }); bus.emit('seq');
}
function toggleEnable() { const cs = sel(); if (!cs.length) return; hist.push('Enable/Disable'); const on = cs.every(c => c.off); cs.forEach(c => c.off = on ? false : true); pb.invalidate(); bus.emit('seq'); }
function gainDlg() {
  const cs = sel().filter(c => c.type === 'a'); if (!cs.length) { toast('Select an audio clip'); return; }
  const f = cs[0].fx.find(x => x.type === 'avol'); const v = prompt('Audio gain (dB)', f ? f.p.db : 0); if (v == null || v === '') return;
  hist.push('Audio Gain'); cs.forEach(c => { const q = c.fx.find(x => x.type === 'avol'); if (q) q.p.db = clamp(+v, -60, 15); }); pb.invalidate(); bus.emit('seq'); bus.emit('fxchange');
}
function nudge(dx, dy) {
  const cs = sel(); if (!cs.length) return; hist.push('Nudge');
  if (dx) { const d = dx / P.seq.fps; for (const c of cs) c.start = Math.max(0, E.q(c.start + d)); }
  if (dy) { for (const c of cs) { const f = findClip(c.id); if (!f) continue; const arr = c.type === 'v' ? P.seq.v : P.seq.a; const i = arr.indexOf(f.tr) + dy; const n = arr[clamp(i, 0, arr.length - 1)]; if (n && n !== f.tr && !n.lock) { f.tr.clips = f.tr.clips.filter(x => x !== c); n.clips.push(c); n.clips.sort((a, b) => a.start - b.start); } } }
  allT().forEach(t => t.clips.sort((a, b) => a.start - b.start)); bus.emit('seq');
}
function matchFrame() {
  let c = sel()[0];
  if (!c) { for (const tr of [...P.seq.v].reverse()) { c = tr.clips.find(x => P.t >= x.start && P.t < x.start + x.dur); if (c) break; } }
  if (!c) { toast('No clip under the playhead'); return; }
  const it = items(c.item); if (!it) return; openSource(it);
  setTimeout(() => { const lt = c.in + (P.t - c.start) * E.speedOf(c); const m = document.querySelector('[data-panel="source"] video'); if (m) m.currentTime = clamp(lt, 0, it.dur || lt); }, 60);
  toast('Match frame');
}
function reverseMatch() {
  const it = P.source; if (!it) return; const hit = allT().flatMap(t => t.clips).find(c => c.item === it.id && P.t >= c.start && P.t < c.start + c.dur);
  const c = allT().flatMap(t => t.clips).find(c => c.item === it.id); if (c) { pb.seek(c.start); P.sel = [c.id]; bus.emit('select'); }
}
function trackHeight(dir) { const r = document.documentElement; const cur = +getComputedStyle(r).getPropertyValue('--rh') || 46; const n = clamp(cur + dir * 10, 26, 120); r.style.setProperty('--rh', n); tl.setRowHeight && tl.setRowHeight(n); tl.redraw(); }
const PANELS = { 1: 'project', 2: 'source', 3: 'effectControls', 4: 'timeline', 5: 'program', 6: 'effects', 7: 'audioMonitor', 8: 'markers' };

const typing = t => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
addEventListener('keydown', e => {
  if (typing(e.target) || !P.seq) return;
  const ctrl = e.ctrlKey || e.metaKey, sh = e.shiftKey, alt = e.altKey, k = e.key, K = k.length === 1 ? k.toLowerCase() : k;
  let done = true;
  if (!ctrl && !alt && !sh && K === 'q') trimEdit('prev', true);
  else if (!ctrl && !alt && !sh && K === 'w') trimEdit('next', true);
  else if (alt && !ctrl && K === 'q') trimEdit('prev', false);
  else if (alt && !ctrl && K === 'w') trimEdit('next', false);
  else if (!ctrl && !alt && !sh && K === 'e') extendEdit();
  else if (!ctrl && !alt && sh && K === 'e') toggleEnable();
  else if (!ctrl && !alt && !sh && K === 'f') matchFrame();
  else if (!ctrl && !alt && sh && K === 'r') reverseMatch();
  else if (!ctrl && !alt && !sh && K === 'g') gainDlg();
  else if (!ctrl && !alt && sh && K === 'j') { pb.shuttle(-1); pb.rate = -.5; }
  else if (!ctrl && !alt && sh && K === 'l') { pb.shuttle(1); pb.rate = .5; }
  else if (!ctrl && !alt && !sh && K === 'PageUp') { const pts = E.editPoints(); const n = [...pts].reverse().find(p => p < P.t - 1e-4); if (n != null) pb.seek(n); }
  else if (!ctrl && !alt && !sh && K === 'PageDown') { const pts = E.editPoints(); const n = pts.find(p => p > P.t + 1e-4); if (n != null) pb.seek(n); }
  else if (ctrl && sh && !alt && K === 'i') clearInOut('in');
  else if (ctrl && sh && !alt && K === 'o') clearInOut('out');
  else if (ctrl && sh && !alt && K === 'x') clearInOut('both');
  else if (!ctrl && !alt && sh && K === 'm') goMarker(1);
  else if (ctrl && sh && !alt && K === 'm') goMarker(-1);
  else if (ctrl && alt && !sh && K === 'm') clearMarker(false);
  else if (ctrl && alt && sh && K === 'm') clearMarker(true);
  else if (ctrl && !alt && !sh && K === 'g') group(true);
  else if (ctrl && !alt && sh && K === 'g') group(false);
  else if (alt && !ctrl && !sh && (K === 'ArrowLeft' || K === 'ArrowRight')) nudge(K === 'ArrowLeft' ? -1 : 1, 0);
  else if (alt && !ctrl && sh && (K === 'ArrowLeft' || K === 'ArrowRight')) nudge(K === 'ArrowLeft' ? -5 : 5, 0);
  else if (alt && !ctrl && (K === 'ArrowUp' || K === 'ArrowDown')) nudge(0, K === 'ArrowUp' ? 1 : -1);
  else if (sh && !ctrl && !alt && (k === '+' || k === '=')) trackHeight(1);
  else if (sh && !ctrl && !alt && (k === '_' || k === '-')) trackHeight(-1);
  else if (ctrl && K === '`') maxHovered();
  else if (sh && !ctrl && !alt && /^Digit[1-8]$/.test(e.code)) openPanel(PANELS[e.code.slice(5)]);
  else if (!ctrl && !alt && !sh && K === 'Enter') document.querySelector('[title^="Export"], .exportbtn')?.click();
  else done = false;
  if (done) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
