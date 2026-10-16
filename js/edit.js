import { P, uid, bus, hist, findClip, seqDur } from './core.js';
import { baseFx } from './fx.js';
import { item } from './media.js';

const allTracks = () => [...P.seq.v, ...P.seq.a];
export const trackOf = id => allTracks().find(t => t.id === id);
export const trackIdx = tr => { const v = P.seq.v.indexOf(tr); return v >= 0 ? { k: 'v', i: v } : { k: 'a', i: P.seq.a.indexOf(tr) }; };
export const FPS = () => (P.seq ? P.seq.fps : 30);
export const q = t => Math.round(t * FPS()) / FPS();

export function makeClip(it, type, start, inT, dur) {
  const s = P.seq;
  const c = { id: uid('c'), item: it.id, type, start: q(start), in: inT, dur, name: it.name, link: null, vol: 1, fx: [], kf: {} };
  if (type === 'v') c.fx = baseFx(c, s.w, s.h, it.w || s.w, it.h || s.h);
  else c.fx = [{ id: 'avol', type: 'avol', on: true, p: { db: 0 } }];
  return c;
}

// remove/trim whatever overlaps [a,b) on a track (overwrite semantic)
export function clearRange(tr, a, b, except) {
  const out = [];
  for (const c of tr.clips) {
    if (except && except.has(c.id)) { out.push(c); continue; }
    const ce = c.start + c.dur;
    if (ce <= a + 1e-6 || c.start >= b - 1e-6) { out.push(c); continue; }
    if (c.start < a - 1e-6 && ce > b + 1e-6) { // split
      const r = cloneClip(c); r.start = b; r.in = c.in + (b - c.start) * speedOf(c); r.dur = ce - b; shiftKf(r, b - c.start);
      c.dur = a - c.start; out.push(c, r);
    } else if (c.start < a - 1e-6) { c.dur = a - c.start; out.push(c); }
    else if (ce > b + 1e-6) { const d = b - c.start; c.in += d * speedOf(c); c.dur -= d; c.start = b; shiftKf(c, d); out.push(c); }
    // fully covered: dropped
  }
  tr.clips = out.sort((x, y) => x.start - y.start);
}
export const speedOf = c => { const f = (c.fx || []).find(x => x.type === 'time'); return f ? f.p.speed / 100 : 1; };
export function shiftKf(c, d) { for (const k in c.kf) c.kf[k].forEach(p => p.t -= d); }
export const cloneClip = c => { const n = JSON.parse(JSON.stringify(c)); n.id = uid('c'); n.link = null; delete n.tin; delete n.tout; return n; };

export function targetTrack(kind) { const s = P.seq; const arr = kind === 'v' ? s.v : s.a; return arr.find(t => t.target && !t.lock) || arr.find(t => !t.lock); }

export function placeItem(it, { at = P.t, mode = 'overwrite', inT = 0, outT = null, vtr = null, atr = null } = {}) {
  const s = P.seq; if (!s) return;
  hist.push(mode === 'insert' ? 'Insert' : 'Overwrite');
  const d = (outT == null ? it.dur : outT) - inT;
  const made = [];
  const hasV = it.kind === 'video' || it.kind === 'image';
  const hasA = it.kind === 'audio' || (it.kind === 'video' && it.hasAudio !== false);
  const link = hasV && hasA ? uid('l') : null;
  const place = (tr, c) => {
    if (mode === 'insert') for (const k of allTracks()) if (!k.lock) {
      // split any clip crossing 'at' then shift
      for (const x of [...k.clips]) if (x.start < c.start - 1e-6 && x.start + x.dur > c.start + 1e-6) {
        const r = cloneClip(x); const off = c.start - x.start; r.start = c.start; r.in = x.in + off * speedOf(x); r.dur = x.dur - off; shiftKf(r, off); x.dur = off; k.clips.push(r);
      }
      for (const x of k.clips) if (x.start >= c.start - 1e-6) x.start += d;
    }
    clearRange(tr, c.start, c.start + c.dur);
    tr.clips.push(c); tr.clips.sort((x, y) => x.start - y.start);
  };
  const vt = vtr || targetTrack('v'), at_ = atr || targetTrack('a');
  let vc = null, ac = null;
  if (hasV && vt) { vc = makeClip(it, 'v', at, inT, d); vc.link = link; if (it.kind === 'image') { vc.in = 0; } }
  if (hasA && at_) { ac = makeClip(it, 'a', at, inT, d); ac.link = link; }
  if (vc && mode === 'insert') { place(vt, vc); if (ac) { clearRange(at_, ac.start, ac.start + ac.dur); at_.clips.push(ac); at_.clips.sort((a, b) => a.start - b.start); } }
  else { if (vc) place(vt, vc); if (ac) place(at_, ac); }
  if (vc) made.push(vc.id); if (ac) made.push(ac.id);
  P.sel = made; bus.emit('seq');
  return made;
}

export function split(t, ids) {
  const s = P.seq; let any = false;
  const cands = [];
  for (const tr of allTracks()) if (!tr.lock) for (const c of tr.clips) {
    if (t > c.start + 1e-6 && t < c.start + c.dur - 1e-6 && (!ids || ids.includes(c.id))) cands.push([tr, c]);
  }
  if (!cands.length) return;
  hist.push('Razor');
  const links = {};
  for (const [tr, c] of cands) {
    const off = t - c.start; const r = cloneClip(c);
    r.start = t; r.in = c.in + off * speedOf(c); r.dur = c.dur - off; shiftKf(r, off); r.name = c.name;
    if (c.link) { links[c.link] ||= uid('l'); r.link = links[c.link]; }
    c.dur = off; r.type = c.type; if (c.tout) { r.tout = c.tout; delete c.tout; }
    tr.clips.push(r); tr.clips.sort((a, b) => a.start - b.start); any = true;
  }
  bus.emit('seq');
}

export function removeClips(ids, ripple = false) {
  if (!ids.length) return;
  hist.push(ripple ? 'Ripple Delete' : 'Clear');
  const gone = new Set(ids);
  // include linked
  for (const tr of allTracks()) for (const c of tr.clips) if (gone.has(c.id) && c.link && P.linked !== false) for (const t2 of allTracks()) for (const d of t2.clips) if (d.link === c.link) gone.add(d.id);
  for (const tr of allTracks()) {
    const removed = tr.clips.filter(c => gone.has(c.id));
    tr.clips = tr.clips.filter(c => !gone.has(c.id));
    if (ripple) for (const r of removed.sort((a, b) => b.start - a.start)) for (const c of tr.clips) if (c.start >= r.start + r.dur - 1e-6) c.start -= r.dur;
  }
  P.sel = []; bus.emit('seq');
}

export function liftExtract(extract) {
  const a = P.inP, b = P.outP; if (a == null || b == null || b <= a) return;
  hist.push(extract ? 'Extract' : 'Lift');
  const s = P.seq;
  for (const tr of allTracks()) if (!tr.lock) {
    // split at boundaries
    clearRange(tr, a, b);
    if (extract) for (const c of tr.clips) if (c.start >= b - 1e-6) c.start -= (b - a);
  }
  P.inP = P.outP = null; bus.emit('seq');
}

// edit points for snapping / up-down navigation
export function editPoints(exclude) {
  const pts = new Set([0, P.t]);
  if (P.inP != null) pts.add(P.inP); if (P.outP != null) pts.add(P.outP);
  P.markers.forEach(m => pts.add(m.t));
  for (const tr of allTracks()) for (const c of tr.clips) { if (exclude && exclude.has(c.id)) continue; pts.add(c.start); pts.add(c.start + c.dur); }
  return [...pts].sort((a, b) => a - b);
}
export function snapTo(t, thr) {
  if (!P.snap) return { t, hit: null };
  let best = null, bd = thr;
  for (const p of editPoints(P._dragSet)) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
  return best == null ? { t, hit: null } : { t: best, hit: best };
}

export function moveClips(starts, ids, dt, dTrack) {
  // starts: map id -> original {start, trId}
  const s = P.seq; const set = new Set(ids);
  const tracks = allTracks();
  const moved = [];
  for (const id of ids) {
    const f = findClip(id); if (!f) continue;
    const orig = starts[id];
    const ot = trackOf(orig.tr); const info = trackIdx(ot);
    const arr = info.k === 'v' ? s.v : s.a;
    const ni = Math.max(0, Math.min(arr.length - 1, info.i + dTrack));
    ot.clips = ot.clips.filter(c => c.id !== id);
    f.c.start = Math.max(0, q(orig.start + dt));
    moved.push([arr[ni], f.c]);
  }
  for (const [tr, c] of moved) { if (tr.lock) continue; clearRange(tr, c.start, c.start + c.dur, set); tr.clips.push(c); tr.clips.sort((a, b) => a.start - b.start); }
  bus.emit('seq');
}

// ---- transitions ----
import { newTrans, DEFAULT_VT, TRANS } from './trans.js';
import { ATRANS, DEFAULT_AT } from './afx.js';
export function addTransition(tr, c, side, type) {
  if (!type) type = c.type === 'a' ? DEFAULT_AT : DEFAULT_VT;
  const audio = !!ATRANS[type];
  if ((c.type === 'a') !== !!ATRANS[type]) return false;
  hist.push('Apply transition');
  c[side] = audio ? { id: uid('t'), type, dur: 1, align: 'center', p: {}, audio: true } : newTrans(type);
  P.selTr = { id: c.id, side }; bus.emit('seq'); bus.emit('select'); return true;
}
export function removeTransition(clipId, side) { const f = findClip(clipId); if (!f) return; hist.push('Remove transition'); delete f.c[side]; if (P.selTr && P.selTr.id === clipId) P.selTr = null; bus.emit('seq'); bus.emit('select'); }
// nearest edit on the selected / all clips of a kind to the playhead
export function applyDefaultTransition(kind = 'v', type = null, t = P.t) {
  let best = null;
  const sel = P.sel.map(id => findClip(id)).filter(f => f && f.c.type === kind);
  const cands = sel.length ? sel : (kind === 'v' ? P.seq.v : P.seq.a).flatMap(tr => tr.clips.map(c => ({ c, tr })));
  for (const { c, tr } of cands) for (const side of ['tin', 'tout']) {
    const T = side === 'tin' ? c.start : c.start + c.dur; const d = Math.abs(T - t);
    if (!best || d < best.d) best = { c, tr, side, d };
  }
  if (!best) return false;
  return addTransition(best.tr, best.c, best.side, type || (kind === 'a' ? DEFAULT_AT : DEFAULT_VT));
}
