import { h, bus, ls } from './core.js';
import { icon } from './icons.js';

// panel registry: id -> {title, build(el), icon}
export const panels = {};
export const reg = (id, title, build, opt = {}) => { panels[id] = { id, title, build, ...opt, el: null }; };

let root = null, layout = null, host = null, wsName = null;
const getEl = id => {
  const p = panels[id]; if (!p) return null;
  if (!p.el) { p.el = h('div', { class: 'pbody', 'data-panel': id }); try { p.build(p.el); } catch (e) { console.error(id, e); } }
  return p.el;
};

const tabs = (list, active) => ({ t: 'tabs', panels: list, active: active || list[0] });
const split = (dir, kids, sizes) => ({ t: 'split', dir, kids, sizes: sizes || kids.map(() => 1) });
export const L = { tabs, split };

const clone = o => JSON.parse(JSON.stringify(o));

function prune(n) {
  if (n.t === 'tabs') { n.panels = n.panels.filter(p => panels[p]); if (!n.panels.includes(n.active)) n.active = n.panels[0]; return n.panels.length ? n : null; }
  const k = [], s = [];
  n.kids.forEach((c, i) => { const r = prune(c); if (r) { k.push(r); s.push(n.sizes[i]); } });
  if (!k.length) return null;
  if (k.length === 1) return k[0];
  n.kids = k; n.sizes = s; return n;
}

function removePanel(n, id) {
  if (n.t === 'tabs') { n.panels = n.panels.filter(p => p !== id); if (n.active === id) n.active = n.panels[0]; return; }
  n.kids.forEach(k => removePanel(k, id));
}

function save() { if (wsName) ls.set('ws.' + wsName, layout); }

export function render() {
  host.innerHTML = '';
  layout = prune(layout) || tabs([]);
  host.append(build(layout, null));
  bus.emit('dock');
  requestAnimationFrame(() => bus.emit('resize'));
}

function build(n, parent) {
  if (n.t === 'split') return buildSplit(n, parent);
  return buildTabs(n, parent);
}

function buildSplit(n, parent) {
  const el = h('div', { class: 'split ' + n.dir });
  n.kids.forEach((k, i) => {
    const c = build(k, n);
    c.style.flex = `${n.sizes[i]} 1 0`;
    el.append(c);
    if (i < n.kids.length - 1) {
      const g = h('div', { class: 'gutter ' + n.dir });
      g.addEventListener('pointerdown', e => dragGutter(e, n, i, el, g));
      el.append(g);
    }
  });
  return el;
}

function dragGutter(e, n, i, el, g) {
  e.preventDefault(); g.setPointerCapture(e.pointerId);
  const horiz = n.dir === 'h';
  const kids = [...el.children].filter(c => !c.classList.contains('gutter'));
  const a = kids[i], b = kids[i + 1];
  const sa = (horiz ? a.offsetWidth : a.offsetHeight), sb = (horiz ? b.offsetWidth : b.offsetHeight);
  const tot = sa + sb, start = horiz ? e.clientX : e.clientY;
  const totalFlex = n.sizes[i] + n.sizes[i + 1];
  document.body.classList.add('resizing', horiz ? 'rs-h' : 'rs-v');
  const mv = ev => {
    const d = (horiz ? ev.clientX : ev.clientY) - start;
    const na = Math.min(tot - 60, Math.max(60, sa + d));
    n.sizes[i] = totalFlex * na / tot; n.sizes[i + 1] = totalFlex * (tot - na) / tot;
    a.style.flex = `${n.sizes[i]} 1 0`; b.style.flex = `${n.sizes[i + 1]} 1 0`;
    bus.emit('resize');
  };
  const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); document.body.classList.remove('resizing', 'rs-h', 'rs-v'); save(); };
  g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
}

function buildTabs(n, parent) {
  const el = h('div', { class: 'group', 'data-ids': n.panels.join(',') });
  const bar = h('div', { class: 'tabbar' });
  n.panels.forEach(id => {
    const p = panels[id];
    const t = h('div', { class: 'tab' + (id === n.active ? ' on' : ''), 'data-id': id }, p.title);
    t.addEventListener('pointerdown', e => tabDown(e, id, n, t));
    bar.append(t);
    if (id === n.active) bar.append(h('div', { class: 'gmenu in', title: 'Panel menu', onclick: e => groupMenu(e, n, el) }, icon('menu', 15)));
  });
  bar.append(h('div', { class: 'grow' }));
  const body = h('div', { class: 'gbody' });
  const pe = getEl(n.active);
  if (pe) body.append(pe);
  el.append(bar, body);
  el.__node = n;
  return el;
}

function groupMenu(e, n, el) {
  e.stopPropagation();
  const items = [
    ['Close Panel', () => { removePanel(layout, n.active); render(); save(); }],
    ['Close Group', () => { n.panels = []; render(); save(); }],
    ['Maximize Panel Group (`)', () => toggleMax(el)],
  ];
  popMenu(e.clientX, e.clientY, items);
}

export function toggleMax(el) {
  const on = el.classList.toggle('max');
  document.body.classList.toggle('has-max', on);
  bus.emit('resize');
}
export function maxHovered() {
  const g = document.querySelector('.group.max') || document.querySelector('.group:hover');
  if (g) toggleMax(g);
}

export function popMenu(x, y, items) {
  document.querySelectorAll('.popmenu').forEach(m => m.remove());
  const m = h('div', { class: 'popmenu' });
  items.forEach(it => {
    if (it === '-') return m.append(h('div', { class: 'sep' }));
    const [label, fn, key, chk] = it;
    m.append(h('div', { class: 'mi' + (chk ? ' chk' : ''), onclick: () => { m.remove(); fn && fn(); } }, h('span', {}, label), h('i', {}, key || '')));
  });
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 4) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 4) + 'px';
  const close = ev => { if (!m.contains(ev.target)) { m.remove(); removeEventListener('pointerdown', close, true); } };
  setTimeout(() => addEventListener('pointerdown', close, true), 0);
  return m;
}

function findGroup(n, id) {
  if (n.t === 'tabs') return n.panels.includes(id) ? n : null;
  for (const k of n.kids) { const r = findGroup(k, id); if (r) return r; }
  return null;
}

function replaceNode(n, target, repl) {
  if (n === target) return repl;
  if (n.t === 'split') n.kids = n.kids.map(k => replaceNode(k, target, repl));
  return n;
}

function tabDown(e, id, n, tabEl) {
  if (e.button !== 0) return;
  const sx = e.clientX, sy = e.clientY;
  let drag = false, ghost = null, zone = null, ov = null;
  const mv = ev => {
    if (!drag && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
      drag = true; ghost = h('div', { class: 'tabghost' }, panels[id].title); document.body.append(ghost);
      ov = h('div', { class: 'dropov' }); document.body.append(ov);
    }
    if (!drag) return;
    ghost.style.left = ev.clientX + 8 + 'px'; ghost.style.top = ev.clientY + 8 + 'px';
    const g = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.group');
    if (!g) { ov.style.display = 'none'; zone = null; return; }
    const r = g.getBoundingClientRect();
    const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
    let z = 'center';
    if (ev.clientY - r.top > 30) { if (fx < .25) z = 'left'; else if (fx > .75) z = 'right'; else if (fy < .25) z = 'top'; else if (fy > .75) z = 'bottom'; }
    zone = { g, z };
    ov.style.display = 'block';
    const box = { center: [0, 0, 1, 1], left: [0, 0, .5, 1], right: [.5, 0, .5, 1], top: [0, 0, 1, .5], bottom: [0, .5, 1, .5] }[z];
    Object.assign(ov.style, { left: r.left + box[0] * r.width + 'px', top: r.top + box[1] * r.height + 'px', width: box[2] * r.width + 'px', height: box[3] * r.height + 'px' });
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    ghost && ghost.remove(); ov && ov.remove();
    if (!drag) { if (n.active !== id) { n.active = id; render(); save(); } return; }
    if (!zone) return;
    const tgt = zone.g.__node;
    if (tgt === n && zone.z === 'center') return;
    if (tgt === n && n.panels.length === 1) return;
    removePanel(layout, id);
    if (zone.z === 'center') { tgt.panels.push(id); tgt.active = id; }
    else {
      const nt = tabs([id]);
      const dir = zone.z === 'left' || zone.z === 'right' ? 'h' : 'v';
      const first = zone.z === 'left' || zone.z === 'top';
      const sp = split(dir, first ? [nt, tgt] : [tgt, nt], [1, 1]);
      layout = replaceNode(layout, tgt, sp);
    }
    render(); save();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

export function openPanel(id) {
  let g = findGroup(layout, id);
  if (g) { g.active = id; render(); save(); return; }
  // add to the largest group
  let best = null;
  document.querySelectorAll('.group').forEach(x => { if (!best || x.offsetWidth * x.offsetHeight > best.offsetWidth * best.offsetHeight) best = x; });
  const tgt = best ? best.__node : layout;
  if (tgt.t === 'tabs') { tgt.panels.push(id); tgt.active = id; render(); save(); }
}
export const isOpen = id => !!findGroup(layout, id);
export function closePanel(id) { removePanel(layout, id); render(); save(); }

export function initDock(el) { host = el; }

export function setLayout(name, preset) {
  wsName = name;
  layout = clone(ls.get('ws.' + name, null) || preset);
  render();
  bus.emit('workspace', name);
}
export function resetLayout(name, preset) { ls.set('ws.' + name, null); setLayout(name, preset); }
export const curWs = () => wsName;
