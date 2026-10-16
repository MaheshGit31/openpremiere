// OpenPremiere core: state, bus, helpers
export const OP = window.OP = { v: '0.1' };

export const h = (tag, a = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const k in a) {
    const v = a[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};

export const bus = {
  m: {},
  on(n, f) { (this.m[n] ||= []).push(f); return f; },
  off(n, f) { this.m[n] = (this.m[n] || []).filter(x => x !== f); },
  emit(n, ...a) { for (const f of (this.m[n] || []).slice()) try { f(...a); } catch (e) { console.error(n, e); } },
};

export const ls = {
  get(k, d) { try { const v = localStorage.getItem('op.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('op.' + k, JSON.stringify(v)); } catch {} },
};

let _id = 1;
export const uid = (p = 'id') => p + (_id++).toString(36) + Math.random().toString(36).slice(2, 5);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const tc = (t, fps = 30, drop = false) => {
  t = Math.max(0, t || 0);
  const f = Math.round(t * fps), fr = Math.round(fps);
  const ff = f % fr, s = Math.floor(f / fr);
  const p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}${drop ? ';' : ':'}${p(ff)}`;
};
export const dur = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); };

// Project state
export const P = OP.P = {
  projId: null, projName: 'Untitled', openSeqs: [],
  items: [],       // media
  bins: [{ id: 'root', name: 'Project', parent: null }],
  seqs: [],
  seq: null,       // active sequence
  sel: [],         // selected clip ids
  tool: 'v',
  t: 0,            // playhead (s)
  playing: false,
  zoom: 80,        // px per second
  snap: true,
  inP: null, outP: null,
  history: [],
  focusClip: null, selTr: null, selLayer: null, maskSel: null,
  source: null,    // item loaded in source monitor
  srcIn: null, srcOut: null,
};

export const newSeq = (name = 'Sequence 01', w = 1920, h = 1080, fps = 30) => ({
  id: uid('s'), name, w, h, fps,
  v: [1, 2, 3, 4].map(i => ({ id: uid('V'), name: 'V' + i, clips: [], mute: false, lock: false, target: i === 1 })),
  a: [1, 2, 3, 4].map(i => ({ id: uid('A'), name: 'A' + i, clips: [], mute: false, solo: false, lock: false, target: i === 1, vol: 1 })),
});

export const seqDur = (s = P.seq) => {
  let d = 0;
  if (!s) return 0;
  for (const tr of [...s.v, ...s.a]) for (const c of tr.clips) d = Math.max(d, c.start + c.dur);
  return d;
};

export const findClip = id => {
  const s = P.seq; if (!s) return null;
  for (const tr of [...s.v, ...s.a]) for (const c of tr.clips) if (c.id === id) return { c, tr };
  return null;
};
export const selClips = () => P.sel.map(findClip).filter(Boolean).map(x => x.c);

// Undo/redo via snapshots of sequences
const stack = { u: [], r: [] };
const snap = () => JSON.stringify(P.seqs.map(s => ({ ...s })));
export const hist = {
  push(label) {
    stack.u.push({ label, s: snap(), seq: P.seq && P.seq.id });
    if (stack.u.length > 100) stack.u.shift();
    stack.r = [];
    P.history = stack.u.map(x => x.label);
    bus.emit('history');
  },
  restore(str, sid) {
    P.seqs = JSON.parse(str); P.seq = P.seqs.find(s => s.id === sid) || P.seqs[0];
    P.sel = []; bus.emit('seq'); bus.emit('history');
  },
  undo() {
    if (!stack.u.length) return;
    const top = stack.u.pop(); stack.r.push({ label: top.label, s: snap(), seq: P.seq && P.seq.id });
    this.restore(top.s, top.seq); P.history = stack.u.map(x => x.label); bus.emit('history');
  },
  redo() {
    if (!stack.r.length) return;
    const top = stack.r.pop(); stack.u.push({ label: top.label, s: snap(), seq: P.seq && P.seq.id });
    this.restore(top.s, top.seq); P.history = stack.u.map(x => x.label); bus.emit('history');
  },
};

// ---------- project lifecycle ----------
export const uidp = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export function resetProject() {
  for (const it of P.items) { try { if (it.url && it.url.startsWith('blob:')) URL.revokeObjectURL(it.url); } catch {} }
  Object.assign(P, { items: [], bins: [{ id: 'root', name: 'Project', parent: null }], seqs: [], seq: null, sel: [], t: 0, playing: false, inP: null, outP: null, history: [], focusClip: null, selTr: null, selLayer: null, maskSel: null, source: null, srcIn: null, srcOut: null, projId: null, projName: 'Untitled', openSeqs: [] });
  stack.u = []; stack.r = [];
  bus.emit('project'); bus.emit('seq'); bus.emit('history'); bus.emit('time');
}
export function serialize() {
  return {
    items: P.items.map(i => ({ ...i, file: undefined, url: (i.solid || i.title) ? i.url : null })),
    bins: P.bins, seqs: P.seqs, seqId: P.seq && P.seq.id, openSeqs: P.openSeqs || [],
  };
}

Object.defineProperty(P, 'markers', { get() { return P.seq ? (P.seq.markers ||= []) : []; }, set(v) { if (P.seq) P.seq.markers = v; }, enumerable: true });
export function setSeq(s) {
  if (P.seq) P.seq.t = P.t;
  P.seq = s; P.t = (s && s.t) || 0; P.sel = [];
  if (s && !P.openSeqs.includes(s.id)) P.openSeqs.push(s.id);
  bus.emit('seq'); bus.emit('time');
}
