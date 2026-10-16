// program-monitor tools: text, shapes, pen, masks, object mask, layer handles
import { P, h, bus, hist, uid, clamp, findClip } from './core.js';
import { pb } from './playback.js';
import { item, elFor } from './media.js';
import * as E from './edit.js';
import { newLayer, fitLayer, measure, hitLayer, layerCorners, placeGraphic, fontStack } from './gfx.js';
import { val } from './fx.js';

const T = { edit: null, pen: null, maskPen: null, guide: null, drag: null };
export const GT = T;
const ovOf = () => document.querySelector('.pov');
const kOf = ov => P.seq ? P.seq.w / ov.getBoundingClientRect().width : 1;
const pt = (e, ov) => { const r = ov.getBoundingClientRect(), k = P.seq.w / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
const focus = () => { const s = P.seq; if (!s) return null; const id = P.sel.length ? P.sel[P.sel.length - 1] : null; if (!id) return null; for (const t of s.v) for (const c of t.clips) if (c.id === id) return { c, tr: t }; return null; };
const clipsAt = () => { const o = []; P.seq.v.forEach((tr, ti) => { if (tr.mute) return; for (const c of tr.clips) if (P.t >= c.start - 1e-6 && P.t < c.start + c.dur - 1e-6) o.push({ c, tr, ti }); }); return o.sort((a, b) => b.ti - a.ti); };

// ---- source <-> sequence mapping for a clip ----
function xf(c) {
  const m = c.fx.find(f => f.type === 'motion'), lt = P.t - c.start; if (!m) return null;
  return { px: val(c, m, 'px', lt), py: val(c, m, 'py', lt), sc: val(c, m, 'scale', lt) / 100, rot: val(c, m, 'rot', lt) * Math.PI / 180, ax: val(c, m, 'ax', lt), ay: val(c, m, 'ay', lt) };
}
export function toSrc(c, x, y) { const t = xf(c); if (!t) return [x, y]; const dx = x - t.px, dy = y - t.py, co = Math.cos(-t.rot), si = Math.sin(-t.rot); return [(dx * co - dy * si) / t.sc + t.ax, (dx * si + dy * co) / t.sc + t.ay]; }
export function fromSrc(c, x, y) { const t = xf(c); if (!t) return [x, y]; const X = (x - t.ax) * t.sc, Y = (y - t.ay) * t.sc, co = Math.cos(t.rot), si = Math.sin(t.rot); return [X * co - Y * si + t.px, X * si + Y * co + t.py]; }
const srcSize = c => { const it = item(c.item); return [it && it.w || P.seq.w, it && it.h || P.seq.h]; };

// ------------------------------------------------------------------
// overlay drawing
export function drawToolOv(g, k) {
  const f = focus();
  g.save();
  if (f && f.c.gfx && !P.playing) drawLayers(g, k, f.c);
  if (f && f.c.masks && P.maskSel && P.maskSel.clip === f.c.id && !P.playing) drawMasks(g, k, f.c);
  if (T.guide) { g.strokeStyle = '#ff3bd4'; g.lineWidth = 1; g.beginPath(); if (T.guide.x != null) { g.moveTo(T.guide.x * k, 0); g.lineTo(T.guide.x * k, g.canvas.height); } if (T.guide.y != null) { g.moveTo(0, T.guide.y * k); g.lineTo(g.canvas.width, T.guide.y * k); } g.stroke(); }
  if (T.pen) { drawPoly(g, k, T.pen.pts, T.pen.cur, T.pen.smooth); }
  if (T.maskPen) { drawPoly(g, k, T.maskPen.pts.map(p => fromSrc(T.maskPen.c, ...p)), T.maskPen.cur, false); }
  if (T.drag && T.drag.rect) { const [x1, y1, x2, y2] = T.drag.rect; g.strokeStyle = '#2d8ceb'; g.setLineDash([5, 4]); g.strokeRect(x1 * k, y1 * k, (x2 - x1) * k, (y2 - y1) * k); g.setLineDash([]); }
  g.restore();
  return !!(f && f.c.gfx);
}
function drawPoly(g, k, pts, cur, smooth) {
  g.strokeStyle = '#2d8ceb'; g.lineWidth = 1.5; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)); if (cur) g.lineTo(cur[0] * k, cur[1] * k); g.stroke();
  g.fillStyle = '#fff'; pts.forEach(([x, y], i) => { g.fillRect(x * k - 3.5, y * k - 3.5, 7, 7); if (i === 0) { g.strokeStyle = '#f5c842'; g.strokeRect(x * k - 5, y * k - 5, 10, 10); } });
}
function handle(g, x, y, r = 4) { g.fillStyle = '#fff'; g.strokeStyle = '#2d8ceb'; g.lineWidth = 1.2; g.fillRect(x - r, y - r, r * 2, r * 2); g.strokeRect(x - r, y - r, r * 2, r * 2); }
function layerHandles(l) {
  const c4 = layerCorners(l), mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const top = mid(c4[0], c4[1]), ctr = mid(c4[0], c4[2]);
  const nx = top[0] - ctr[0], ny = top[1] - ctr[1], nl = Math.hypot(nx, ny) || 1;
  return { c4, edges: [mid(c4[0], c4[1]), mid(c4[1], c4[2]), mid(c4[2], c4[3]), mid(c4[3], c4[0])], rot: [top[0] + nx / nl * 36, top[1] + ny / nl * 36], ctr, top };
}
function drawLayers(g, k, c) {
  for (const l of c.gfx.layers) {
    if (!l.vis) continue; const sel = P.selLayer === l.id; const H = layerHandles(l);
    g.strokeStyle = sel ? '#2d8ceb' : 'rgba(45,140,235,.45)'; g.lineWidth = sel ? 1.6 : 1; g.beginPath(); H.c4.forEach(([x, y], i) => i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)); g.closePath(); g.stroke();
    if (sel) {
      if (l.type !== 'text') H.edges.forEach(([x, y]) => handle(g, x * k, y * k, 3.5)); else if (l.area) { handle(g, H.edges[1][0] * k, H.edges[1][1] * k, 3.5); handle(g, H.edges[3][0] * k, H.edges[3][1] * k, 3.5); }
      H.c4.forEach(([x, y]) => handle(g, x * k, y * k));
      g.beginPath(); g.moveTo(H.top[0] * k, H.top[1] * k); g.lineTo(H.rot[0] * k, H.rot[1] * k); g.stroke(); g.beginPath(); g.arc(H.rot[0] * k, H.rot[1] * k, 5, 0, 7); g.fillStyle = '#fff'; g.fill(); g.stroke();
    }
  }
}
function maskGeom(c, m) {
  if (m.type === 'path') return m.pts.map(p => fromSrc(c, ...p));
  if (m.type === 'raster') return [];
  const x1 = Math.min(m.x1, m.x2), x2 = Math.max(m.x1, m.x2), y1 = Math.min(m.y1, m.y2), y2 = Math.max(m.y1, m.y2); return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(p => fromSrc(c, ...p));
}
function drawMasks(g, k, c) {
  for (const m of c.masks) {
    const sel = P.maskSel && P.maskSel.id === m.id; const pts = maskGeom(c, m); if (!pts.length) continue;
    g.strokeStyle = sel ? '#f5c842' : 'rgba(245,200,66,.5)'; g.lineWidth = 1.5; g.beginPath();
    if (m.type === 'ellipse') { const [a, b, , d] = pts; const cx = (a[0] + pts[2][0]) / 2, cy = (a[1] + pts[2][1]) / 2; const t = xf(c); g.ellipse(cx * k, cy * k, Math.abs(m.x2 - m.x1) / 2 * t.sc * k, Math.abs(m.y2 - m.y1) / 2 * t.sc * k, t.rot, 0, 7); }
    else { pts.forEach(([x, y], i) => i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)); g.closePath(); }
    g.stroke();
    if (sel) pts.forEach(([x, y]) => { g.fillStyle = '#f5c842'; g.fillRect(x * k - 4, y * k - 4, 8, 8); });
  }
}

// ------------------------------------------------------------------
// pointer dispatch. returns true if handled
export function toolDown(e, ov) {
  if (!P.seq || e.button) return false;
  const tool = P.tool;
  if (tool === 't') return textDown(e, ov);
  if (tool === 'rect' || tool === 'ellipse' || tool === 'poly') return shapeDown(e, ov, tool);
  if (tool === 'p') return penDown(e, ov);
  if (tool === 'om_ellipse' || tool === 'om_rect') return maskDragDown(e, ov, tool === 'om_ellipse' ? 'ellipse' : 'rect');
  if (tool === 'om_pen') return maskPenDown(e, ov);
  if (tool === 'om_obj') return wandDown(e, ov);
  return selectDown(e, ov);
}
const sel = (c, l) => { P.sel = [c.id]; P.focusClip = c.id; if (l) P.selLayer = l.id; bus.emit('select'); };

// ---- selection tool on program monitor ----
function selectDown(e, ov) {
  const f = focus(); const [mx, my] = pt(e, ov), k = 1 / kOf(ov);
  // mask handles
  if (f && f.c.masks && P.maskSel && P.maskSel.clip === f.c.id && maskDown(e, ov, f.c, mx, my)) return true;
  if (f && f.c.gfx) {
    const sl = f.c.gfx.layers.find(l => l.id === P.selLayer);
    if (sl && layerHandleDown(e, ov, f.c, sl, mx, my)) return true;
    const hl = hitLayer(f.c, mx, my);
    if (hl) { if (e.detail === 2 && hl.type === 'text') { editText(f.c, hl); return true; } P.selLayer = hl.id; bus.emit('select'); moveLayer(e, ov, f.c, hl, mx, my); return true; }
  }
  // pick clip under cursor (topmost) if not hitting the focused clip's box
  const hits = clipsAt().filter(({ c }) => hitClip(c, mx, my));
  const inFocus = f && hits.some(x => x.c === f.c);
  if (!inFocus && hits.length) {
    const top = hits[0]; sel(top.c, top.c.gfx ? hitLayer(top.c, mx, my) : null);
    if (top.c.gfx) { const hl = hitLayer(top.c, mx, my); if (hl) { moveLayer(e, ov, top.c, hl, mx, my); return true; } }
    return false; // fall through to clip move
  }
  if (!hits.length && !(f && hitClip(f.c, mx, my))) { if (P.sel.length) { P.sel = []; P.selLayer = null; P.maskSel = null; bus.emit('select'); } return true; }
  return false;
}
function hitClip(c, x, y) {
  if (c.gfx) return !!hitLayer(c, x, y);
  const [sw, sh] = srcSize(c); const [u, v] = toSrc(c, x, y); return u >= 0 && v >= 0 && u <= sw && v <= sh;
}
function snapMove(l, nx, ny) {
  const m = measure(l), W = P.seq.w, H = P.seq.h; T.guide = null; const th = 8 * kOf(ovOf());
  const cx = nx + m.w / 2, cy = ny + m.h / 2; const gx = [[W / 2, cx], [0, nx], [W, nx + m.w], [W * .1, nx], [W * .9, nx + m.w]], gy = [[H / 2, cy], [0, ny], [H, ny + m.h], [H * .1, ny], [H * .9, ny + m.h]];
  for (const [t, v] of gx) if (Math.abs(t - v) < th) { nx += t - v; T.guide = { ...(T.guide || {}), x: t }; break; }
  for (const [t, v] of gy) if (Math.abs(t - v) < th) { ny += t - v; T.guide = { ...(T.guide || {}), y: t }; break; }
  return [nx, ny];
}
function moveLayer(e, ov, c, l, mx, my) {
  e.preventDefault(); const x0 = l.x, y0 = l.y; let moved = false;
  const mv = ev => { const [x, y] = pt(ev, ov); if (!moved && Math.hypot(x - mx, y - my) < 3) return; if (!moved) { hist.push('Move layer'); moved = true; } let nx = x0 + x - mx, ny = y0 + y - my; if (!ev.ctrlKey) [nx, ny] = snapMove(l, nx, ny); l.x = nx; l.y = ny; pb.invalidate(); bus.emit('gfxchange'); bus.emit('param'); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); T.guide = null; bus.emit('param'); if (moved) bus.emit('seq'); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function layerHandleDown(e, ov, c, l, mx, my) {
  const H = layerHandles(l), r = 11 * kOf(ov);
  const near = p => Math.hypot(p[0] - mx, p[1] - my) < r;
  if (near(H.rot)) { e.preventDefault(); hist.push('Rotate layer'); const [cx, cy] = H.ctr; const mv = ev => { const [x, y] = pt(ev, ov); let a = Math.atan2(y - cy, x - cx) * 180 / Math.PI + 90; if (ev.shiftKey) a = Math.round(a / 15) * 15; l.rot = Math.round(a * 10) / 10; pb.invalidate(); bus.emit('param'); }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); bus.emit('seq'); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); return true; }
  const ci = H.c4.findIndex(near);
  if (ci >= 0) { e.preventDefault(); hist.push('Resize layer'); resize(ov, l, ci, H, mx, my); return true; }
  if (l.type !== 'text' || l.area) {
    const ei = H.edges.findIndex(near);
    if (ei >= 0 && (l.type !== 'text' || ei === 1 || ei === 3)) { e.preventDefault(); hist.push('Resize layer'); resizeEdge(ov, l, ei); return true; }
  }
  return false;
}
function resize(ov, l, ci, H, mx, my) {
  const m0 = measure(l), cx = l.x + m0.w / 2, cy = l.y + m0.h / 2, d0 = Math.hypot(H.c4[ci][0] - cx, H.c4[ci][1] - cy) || 1, size0 = l.size, w0 = l.w, hh0 = l.h;
  const a = -(l.rot || 0) * Math.PI / 180, loc = (x, y) => { const dx = x - cx, dy = y - cy; return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]; };
  const opp = (ci + 2) % 4, sx = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; const ox = sx[opp][0] * m0.w / 2, oy = sx[opp][1] * m0.h / 2;
  const mv = ev => {
    const [x, y] = pt(ev, ov);
    if (l.type === 'text') { const s = Math.hypot(x - cx, y - cy) / d0; l.size = Math.max(6, Math.round(size0 * s)); if (l.area) l.w = Math.max(20, w0 * s); const m = measure(l); l.x = cx - m.w / 2; l.y = cy - m.h / 2; fitLayer(l); }
    else {
      let [px, py] = loc(x, y); let nw = Math.abs(px - ox), nh = Math.abs(py - oy);
      if (ev.shiftKey) { const s = Math.max(nw / w0, nh / hh0); nw = w0 * s; nh = hh0 * s; px = ox + Math.sign(px - ox) * nw; py = oy + Math.sign(py - oy) * nh; }
      const ncx = (px + ox) / 2, ncy = (py + oy) / 2, b = (l.rot || 0) * Math.PI / 180;
      l.w = Math.max(4, nw); l.h = Math.max(4, nh); const wx = cx + ncx * Math.cos(b) - ncy * Math.sin(b), wy = cy + ncx * Math.sin(b) + ncy * Math.cos(b); l.x = wx - l.w / 2; l.y = wy - l.h / 2;
    }
    pb.invalidate(); bus.emit('param'); bus.emit('gfxchange');
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); bus.emit('seq'); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function resizeEdge(ov, l, ei) {
  const m0 = measure(l), cx = l.x + m0.w / 2, cy = l.y + m0.h / 2, a = -(l.rot || 0) * Math.PI / 180, b = -a;
  const mv = ev => {
    const [x, y] = pt(ev, ov); const dx = x - cx, dy = y - cy; const px = dx * Math.cos(a) - dy * Math.sin(a), py = dx * Math.sin(a) + dy * Math.cos(a);
    let w = l.w, hh = l.h, ncx = 0, ncy = 0;
    if (ei === 1) { w = Math.max(10, px + m0.w / 2); ncx = (px - m0.w / 2) / 2; } else if (ei === 3) { w = Math.max(10, m0.w / 2 - px); ncx = (px + m0.w / 2) / 2; }
    else if (ei === 2) { hh = Math.max(10, py + m0.h / 2); ncy = (py - m0.h / 2) / 2; } else { hh = Math.max(10, m0.h / 2 - py); ncy = (py + m0.h / 2) / 2; }
    l.w = w; if (l.type !== 'text') l.h = hh; const wx = cx + ncx * Math.cos(b) - ncy * Math.sin(b), wy = cy + ncx * Math.sin(b) + ncy * Math.cos(b); const m = measure(l); l.x = wx - m.w / 2; l.y = wy - m.h / 2; fitLayer(l); pb.invalidate(); bus.emit('param'); bus.emit('gfxchange');
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); bus.emit('seq'); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

// ---- text tool ----
function textDown(e, ov) {
  e.preventDefault(); const [mx, my] = pt(e, ov);
  for (const { c } of clipsAt()) if (c.gfx) { const l = hitLayer(c, mx, my); if (l && l.type === 'text') { sel(c, l); editText(c, l); return true; } }
  let moved = false; T.drag = { rect: null };
  const mv = ev => { const [x, y] = pt(ev, ov); if (Math.hypot(x - mx, y - my) > 10 * kOf(ov)) moved = true; if (moved) { T.drag.rect = [Math.min(mx, x), Math.min(my, y), Math.max(mx, x), Math.max(my, y)]; bus.emit('param'); } };
  const up = ev => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); const rect = T.drag.rect; T.drag = null;
    hist.push('Type tool');
    const o = { text: '', size: Math.round(P.seq.h * .09) };
    let f;
    if (moved && rect && rect[2] - rect[0] > 40) { const l = newLayer('text', { ...o, area: true, w: rect[2] - rect[0], align: 'left' }); fitLayer(l); l.x = rect[0]; l.y = rect[1]; f = placeGraphic([l], { name: 'Text' }); if (f) { P.selLayer = l.id; editText(f, l, true); } }
    else { const l = newLayer('text', o); fitLayer(l); l.x = mx; l.y = my - l.h / 2; f = placeGraphic([l], { name: 'Text' }); if (f) { P.selLayer = l.id; editText(f, l, true); } }
    bus.emit('param');
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); return true;
}
export function editText(c, l, isNew = false) {
  const ov = ovOf(); if (!ov) return; endEdit(true);
  const wrap = ov.parentElement; const ta = h('textarea', { class: 'gtxt', spellcheck: 'false' }); ta.value = l.text; wrap.append(ta);
  T.edit = { c, l, ta, isNew };
  const place = () => {
    const r = ov.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), k = r.width / P.seq.w, m = measure(l);
    Object.assign(ta.style, { left: (r.left - wr.left + l.x * k) + 'px', top: (r.top - wr.top + l.y * k) + 'px', width: Math.max(30, m.w * k + (l.area ? 0 : 24)) + 'px', height: Math.max(20, m.h * k + 4) + 'px',
      font: `${l.italic ? 'italic ' : ''}${l.weight} ${l.size * k}px ${fontStack(l.font)}`, lineHeight: (l.size * l.lead * k) + 'px', textAlign: l.align, letterSpacing: (l.track || 0) * k + 'px', textTransform: l.caps ? 'uppercase' : 'none', whiteSpace: l.area ? 'pre-wrap' : 'pre', transform: `rotate(${l.rot || 0}deg)`, transformOrigin: 'center' });
  };
  ta.addEventListener('input', () => { l.text = ta.value; fitLayer(l); place(); pb.invalidate(); bus.emit('param'); bus.emit('gfxchange'); });
  ta.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape') endEdit(true); });
  ta.addEventListener('blur', () => setTimeout(() => endEdit(true), 0));
  ta.addEventListener('pointerdown', ev => ev.stopPropagation());
  place(); ta.focus(); ta.select();
}
export function endEdit() {
  const ed = T.edit; if (!ed) return; T.edit = null; ed.ta.remove();
  if (!ed.l.text.trim()) { if (ed.isNew) E.removeClips([ed.c.id]); else ed.l.text = ' '; }
  pb.invalidate(); bus.emit('seq');
}

// ---- shape tools ----
function shapeDown(e, ov, kind) {
  e.preventDefault(); const [mx, my] = pt(e, ov); T.drag = { rect: [mx, my, mx, my] }; let moved = false;
  const mv = ev => { let [x, y] = pt(ev, ov); let w = x - mx, hh = y - my; if (ev.shiftKey) { const s = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * s; hh = Math.sign(hh || 1) * s; }
    let x1 = mx, y1 = my, x2 = mx + w, y2 = my + hh; if (ev.altKey) { x1 = mx - w; y1 = my - hh; } T.drag.rect = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]; moved = moved || Math.hypot(w, hh) > 4; bus.emit('param'); };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); let [x1, y1, x2, y2] = T.drag.rect; T.drag = null;
    if (!moved || x2 - x1 < 6) { x1 = mx - 200; y1 = my - 120; x2 = mx + 200; y2 = my + 120; if (kind !== 'rect') { x1 = mx - 150; y1 = my - 150; x2 = mx + 150; y2 = my + 150; } }
    hist.push('Shape');
    const l = newLayer(kind, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, fill: { on: true, type: 'solid', c: '#2d8ceb', c2: '#8e44ff', ang: 90 }, stroke: { on: false, c: '#ffffff', w: 6 } });
    const f = placeGraphic([l], { name: kind === 'rect' ? 'Rectangle' : kind === 'ellipse' ? 'Ellipse' : 'Polygon' }); if (f) P.selLayer = l.id; bus.emit('param');
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); return true;
}

// ---- pen tool (shapes in the program monitor) ----
let penKeyInstalled = false;
function penKeys() { if (penKeyInstalled) return; penKeyInstalled = true; addEventListener('keydown', ev => { if (T.pen) { if (ev.key === 'Enter') { ev.preventDefault(); finishPen(false); } else if (ev.key === 'Escape') { T.pen = null; bus.emit('param'); } } if (T.maskPen) { if (ev.key === 'Enter') { ev.preventDefault(); finishMaskPen(); } else if (ev.key === 'Escape') { T.maskPen = null; bus.emit('param'); } } }, true); }
function penDown(e, ov) {
  penKeys(); e.preventDefault(); const [mx, my] = pt(e, ov);
  if (!T.pen) T.pen = { pts: [], cur: null, smooth: false };
  const pen = T.pen;
  if (pen.pts.length > 2 && Math.hypot(pen.pts[0][0] - mx, pen.pts[0][1] - my) < 10 * kOf(ov)) { finishPen(true); return true; }
  if (e.detail === 2 && pen.pts.length > 1) { finishPen(false); return true; }
  pen.pts.push([mx, my]);
  const mv = ev => { const [x, y] = pt(ev, ov); pen.cur = [x, y]; if (Math.hypot(x - mx, y - my) > 8 * kOf(ov)) pen.smooth = true; bus.emit('param'); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up);
  const hov = ev => { if (T.pen) { T.pen.cur = pt(ev, ov); bus.emit('param'); } else removeEventListener('pointermove', hov); }; addEventListener('pointermove', hov);
  bus.emit('param'); return true;
}
function finishPen(closed) {
  const pen = T.pen; T.pen = null; if (!pen || pen.pts.length < 2) { bus.emit('param'); return; }
  const xs = pen.pts.map(p => p[0]), ys = pen.pts.map(p => p[1]); const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys), w = Math.max(2, x2 - x1), hh = Math.max(2, y2 - y1);
  hist.push('Pen shape');
  const l = newLayer('path', { x: x1, y: y1, w, h: hh, pts: pen.pts.map(([x, y]) => [(x - x1) / w, (y - y1) / hh]), closed, smooth: pen.smooth, fill: { on: closed, type: 'solid', c: '#2d8ceb', c2: '#8e44ff', ang: 90 }, stroke: { on: true, c: closed ? '#ffffff' : '#2d8ceb', w: closed ? 0 : 10 } });
  if (closed) l.stroke.on = false;
  const f = placeGraphic([l], { name: 'Shape' }); if (f) P.selLayer = l.id; bus.emit('param');
}

// ---- masks ----
function targetClip(mx, my) {
  const f = focus(); if (f && !f.c.gfx || f && f.c.gfx) return f.c;
  const hits = clipsAt().filter(({ c }) => hitClip(c, mx, my)); return hits.length ? hits[0].c : null;
}
export function addMask(c, m) { c.masks ||= []; const mk = { id: uid('mk'), feather: 0, op: 100, exp: 0, inv: false, ...m }; c.masks.push(mk); P.maskSel = { clip: c.id, id: mk.id }; pb.invalidate(); bus.emit('seq'); return mk; }
export function defaultMask(c, type) {
  const [sw, sh] = srcSize(c);
  if (type === 'path') return addMask(c, { type: 'path', pts: [[sw * .5, sh * .2], [sw * .8, sh * .5], [sw * .5, sh * .8], [sw * .2, sh * .5]] });
  return addMask(c, { type, x1: sw * .2, y1: sh * .2, x2: sw * .8, y2: sh * .8 });
}
function maskDragDown(e, ov, type) {
  e.preventDefault(); const [mx, my] = pt(e, ov); const c = targetClip(mx, my); if (!c) return true; sel(c);
  const s0 = toSrc(c, mx, my); T.drag = { rect: [mx, my, mx, my] };
  const mv = ev => { const [x, y] = pt(ev, ov); T.drag.rect = [Math.min(mx, x), Math.min(my, y), Math.max(mx, x), Math.max(my, y)]; bus.emit('param'); };
  const up = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); const [x, y] = pt(ev, ov); T.drag = null; hist.push('Mask'); const s1 = toSrc(c, x, y); if (Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) < 6) defaultMask(c, type); else addMask(c, { type, x1: s0[0], y1: s0[1], x2: s1[0], y2: s1[1] }); bus.emit('param'); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); return true;
}
function maskPenDown(e, ov) {
  penKeys(); e.preventDefault(); const [mx, my] = pt(e, ov);
  if (!T.maskPen) { const c = targetClip(mx, my); if (!c) return true; sel(c); T.maskPen = { c, pts: [], cur: null }; }
  const mp = T.maskPen; const p = toSrc(mp.c, mx, my);
  if (mp.pts.length > 2 && Math.hypot(...fromSrc(mp.c, ...mp.pts[0]).map((v, i) => v - [mx, my][i])) < 10 * kOf(ov)) { finishMaskPen(); return true; }
  mp.pts.push(p);
  const hov = ev => { if (T.maskPen) { T.maskPen.cur = pt(ev, ov); bus.emit('param'); } else removeEventListener('pointermove', hov); }; addEventListener('pointermove', hov);
  bus.emit('param'); return true;
}
function finishMaskPen() { const mp = T.maskPen; T.maskPen = null; if (mp && mp.pts.length > 2) { hist.push('Pen mask'); addMask(mp.c, { type: 'path', pts: mp.pts }); } bus.emit('param'); }
function maskDown(e, ov, c, mx, my) {
  const m = c.masks.find(x => x.id === P.maskSel.id); if (!m || m.type === 'raster') return false;
  const pts = maskGeom(c, m), r = 10 * kOf(ov); const i = pts.findIndex(p => Math.hypot(p[0] - mx, p[1] - my) < r);
  if (i >= 0) {
    e.preventDefault(); if (m.type === 'path' && e.altKey) { hist.push('Delete point'); if (m.pts.length > 3) m.pts.splice(i, 1); pb.invalidate(); bus.emit('seq'); return true; }
    hist.push('Edit mask');
    const mv = ev => { const [x, y] = pt(ev, ov); const s = toSrc(c, x, y);
      if (m.type === 'path') m.pts[i] = s; else { const corners = ['x1,y1', 'x2,y1', 'x2,y2', 'x1,y2']; const xs = Math.min(m.x1, m.x2), xe = Math.max(m.x1, m.x2), ys = Math.min(m.y1, m.y2), ye = Math.max(m.y1, m.y2); const ox = [xe, xs, xs, xe][i], oy = [ye, ye, ys, ys][i]; m.x1 = ox; m.y1 = oy; m.x2 = s[0]; m.y2 = s[1]; }
      pb.invalidate(); bus.emit('param'); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); bus.emit('seq'); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); return true;
  }
  // inside -> move; shift on path edge -> add point
  const inside = (() => { if (m.type === 'path' || m.type === 'rect') { let ins = false; for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { if ((pts[a][1] > my) !== (pts[b][1] > my) && mx < (pts[b][0] - pts[a][0]) * (my - pts[a][1]) / (pts[b][1] - pts[a][1]) + pts[a][0]) ins = !ins; } return ins; } const s = toSrc(c, mx, my); const cx = (m.x1 + m.x2) / 2, cy = (m.y1 + m.y2) / 2; return ((s[0] - cx) / (Math.abs(m.x2 - m.x1) / 2 || 1)) ** 2 + ((s[1] - cy) / (Math.abs(m.y2 - m.y1) / 2 || 1)) ** 2 <= 1; })();
  if (m.type === 'path' && e.shiftKey) { let best = 0, bd = 1e9; const s = toSrc(c, mx, my); for (let a = 0; a < m.pts.length; a++) { const p = m.pts[a], q = m.pts[(a + 1) % m.pts.length]; const d = Math.hypot((p[0] + q[0]) / 2 - s[0], (p[1] + q[1]) / 2 - s[1]); if (d < bd) { bd = d; best = a; } } hist.push('Add point'); m.pts.splice(best + 1, 0, s); pb.invalidate(); bus.emit('seq'); return true; }
  if (inside) {
    e.preventDefault(); hist.push('Move mask'); const s0 = toSrc(c, mx, my), o = JSON.parse(JSON.stringify(m));
    const mv = ev => { const [x, y] = pt(ev, ov); const s = toSrc(c, x, y), dx = s[0] - s0[0], dy = s[1] - s0[1]; if (m.type === 'path') m.pts = o.pts.map(([a, b]) => [a + dx, b + dy]); else { m.x1 = o.x1 + dx; m.x2 = o.x2 + dx; m.y1 = o.y1 + dy; m.y2 = o.y2 + dy; } pb.invalidate(); bus.emit('param'); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); bus.emit('seq'); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); return true;
  }
  return false;
}

// ---- object mask (color-region wand on the current frame) ----
function wandDown(e, ov) {
  e.preventDefault(); const [mx, my] = pt(e, ov); const hits = clipsAt().filter(({ c }) => hitClip(c, mx, my)); if (!hits.length) return true;
  const c = hits[0].c; sel(c); const it = item(c.item); if (!it) return true;
  const el = c.gfx ? null : elFor(c, it); if (!el && !c.gfx) return true;
  const [sw, sh] = srcSize(c); const k = Math.min(1, 512 / Math.max(sw, sh)), w = Math.round(sw * k), hh = Math.round(sh * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hh; const g = cv.getContext('2d', { willReadFrequently: true });
  try { g.drawImage(el, 0, 0, w, hh); } catch { return true; }
  const im = g.getImageData(0, 0, w, hh), d = im.data; const s = toSrc(c, mx, my); const sx = clamp(Math.round(s[0] * k), 0, w - 1), sy = clamp(Math.round(s[1] * k), 0, hh - 1);
  const tol = (P.wandTol || 38) ** 2, i0 = (sy * w + sx) * 4; const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2];
  // average of a small neighborhood as the seed color
  let ar = 0, ag = 0, ab = 0, n = 0; for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) { const X = clamp(sx + xx, 0, w - 1), Y = clamp(sy + yy, 0, hh - 1), i = (Y * w + X) * 4; ar += d[i]; ag += d[i + 1]; ab += d[i + 2]; n++; } ar /= n; ag /= n; ab /= n;
  const seen = new Uint8Array(w * hh), q = [sx, sy], out = new Uint8ClampedArray(w * hh * 4); seen[sy * w + sx] = 1;
  while (q.length) { const y = q.pop(), x = q.pop(); const i = (y * w + x) * 4; const dr = d[i] - ar, dg = d[i + 1] - ag, db = d[i + 2] - ab; if (dr * dr + dg * dg + db * db > tol) continue; out[i] = out[i + 1] = out[i + 2] = 255; out[i + 3] = 255;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (nx >= 0 && ny >= 0 && nx < w && ny < hh && !seen[ny * w + nx]) { seen[ny * w + nx] = 1; q.push(nx, ny); } }
  const mc = document.createElement('canvas'); mc.width = w; mc.height = hh; const mg = mc.getContext('2d'); mg.putImageData(new ImageData(out, w, hh), 0, 0);
  // close small holes: blur+threshold-ish via filter
  const mc2 = document.createElement('canvas'); mc2.width = w; mc2.height = hh; const m2 = mc2.getContext('2d'); m2.filter = 'blur(2px)'; m2.drawImage(mc, 0, 0);
  hist.push('Object mask'); addMask(c, { type: 'raster', data: mc2.toDataURL('image/png'), feather: 2, name: 'Object' }); bus.emit('param'); return true;
}
