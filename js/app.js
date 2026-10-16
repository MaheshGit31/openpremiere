import { VERSION } from './changelog.js';
import { P, h, bus, ls, tc, hist, seqDur, selClips, findClip, setSeq } from './core.js';
import { panels, initDock, setLayout, resetLayout, L, popMenu, openPanel, closePanel, isOpen, curWs, maxHovered } from './dock.js';
import './fxlib1.js'; import './fxlib2.js'; import './fxlib3.js';
import './timeline.js'; import './panels1.js'; import './panels2.js'; import './gfxpanel.js';
import { pb } from './playback.js';
import { setTool, newSequence, newBin, openSource, src } from './panels1.js';
import { importFiles, pickFiles, makeBars, makeSolid } from './media.js';
import * as E from './edit.js';
import { tl } from './timeline.js';
import { SHORTCUTS } from './panels2.js';
import { icon } from './icons.js';
import { exportDialog } from './export.js';
import { mountHome } from './home.js';
import { newProject, openProject, saveProject, startAutosave } from './project.js';
import { db } from './db.js';
import './shortcuts2.js';
import './amonitor.js';
import './library.js';
import './learn.js';

window.OP_openPanel = openPanel;
const { tabs, split } = L;

// ---------- workspaces ----------
const WS = {
  'Learning': () => split('h', [split('v', [tabs(['learn']), tabs(['project', 'effects'])], [1, 1]), tabs(['program']), tabs(['effectControls', 'lumetri'])], [1, 1.6, 1]),
  'Assembly': () => split('v', [split('h', [tabs(['project', 'mediaBrowser', 'libraries', 'info', 'effects', 'markers', 'history']), tabs(['program'])], [1.2, 1]), split('h', [tabs(['tools']), tabs(['timeline'])], [.04, 1])], [1.5, 1]),
  'Import': () => split('h', [tabs(['freeLib', 'mediaBrowser']), split('v', [tabs(['source']), tabs(['project'])], [1, 1.2])], [1.3, 1]),
  'Editing': () => split('v', [split('h', [tabs(['source', 'effectControls', 'mixer', 'metadata']), tabs(['program']), tabs(['meters'])], [1.1, 1.1, .08]), split('h', [tabs(['project', 'mediaBrowser', 'libraries', 'info', 'effects', 'markers', 'history', 'audioMonitor', 'freeLib']), tabs(['tools']), tabs(['timeline'])], [1.1, .08, 4])], [1.2, 1]),
  'Color': () => split('h', [split('v', [split('h', [tabs(['scopes']), tabs(['program'])], [1, 1.2]), split('h', [tabs(['tools']), tabs(['timeline'])], [.06, 1])], [1.4, 1]), tabs(['lumetri', 'effectControls'])], [3, 1]),
  'Effects': () => split('v', [split('h', [tabs(['source']), tabs(['program']), tabs(['effects', 'project'])], [1, 1.2, .8]), split('h', [tabs(['effectControls']), tabs(['tools']), tabs(['timeline'])], [1, .05, 2.4])], [1.2, 1]),
  'Audio': () => split('v', [split('h', [tabs(['mixer', 'effectControls']), tabs(['program']), tabs(['meters','audioMonitor'])], [1.4, 1, .5]), split('h', [tabs(['project', 'effects']), tabs(['tools']), tabs(['timeline'])], [.9, .06, 3])], [1.1, 1]),
  'Captions and Graphics': () => split('v', [split('h', [tabs(['project', 'effects']), tabs(['program']), tabs(['essentialGraphics', 'effectControls', 'lumetri'])], [1, 1.5, 1]), split('h', [tabs(['tools']), tabs(['timeline'])], [.04, 1])], [1.4, 1]),
  'Review': () => split('v', [tabs(['program']), tabs(['timeline'])], [2.2, 1]),
  'Libraries': () => split('v', [split('h', [tabs(['libraries', 'project']), tabs(['program'])], [1, 1.2]), split('h', [tabs(['tools']), tabs(['timeline'])], [.04, 1])], [1.4, 1]),
  'Metadata Logging': () => split('h', [split('v', [tabs(['project']), tabs(['metadata', 'info'])], [1.3, 1]), tabs(['source']), tabs(['markers', 'history'])], [1.2, 1.3, .9]),
};
const WS_ORDER = Object.keys(WS);
const wsbar = document.getElementById('wsbar');
function drawWs() {
  wsbar.innerHTML = '';
  const cur = curWs();
  const vis = WS_ORDER.slice(0, 7), more = WS_ORDER.slice(7);
  wsbar.append(h('div', { class: 'wsl' }, vis.map(n => h('div', { class: 'wst' + (n === cur ? ' on' : ''), onclick: () => setWs(n), oncontextmenu: e => { e.preventDefault(); popMenu(e.clientX, e.clientY, [['Reset to Saved Layout', () => resetLayout(n, WS[n]())]]); } }, n))),
    more.length ? h('div', { class: 'wst more', title: 'More workspaces', onclick: e => popMenu(e.clientX, e.clientY, more.map(n => [n, () => setWs(n)])) }, icon('more', 14)) : null,
    h('div', { class: 'grow' }), h('div', { class: 'brand' }, 'OpenPremiere'));
}
function setWs(n) { ls.set('ws.cur', n); setLayout(n, WS[n]()); drawWs(); if (typeof drawHeader === 'function' && document.getElementById('hdrbar')) drawHeader(); }

// ---------- menus ----------
const sel = () => selClips();
const MENUS = {
  File: () => [
    ['New Project...', () => newDialog(), 'Ctrl+Alt+N'], ['Open Project...', () => goHome(), 'Ctrl+O'], ['New Sequence...', () => newSequence(), 'Ctrl+N'], ['New Bin', () => newBin(), 'Ctrl+/'], '-',
    ['Import...', pickFiles, 'Ctrl+I'], '-',
    ['Export Media…', () => exportDialog(), 'Ctrl+M'], ['Export Frame', () => document.querySelector('[title^="Export Frame"]')?.click(), 'Ctrl+Shift+E'], '-',
    ['Save Project', () => saveProject(true), 'Ctrl+S'], ['Close Project', () => goHome(), ''],
  ],
  Edit: () => [
    ['Undo', () => hist.undo(), 'Ctrl+Z'], ['Redo', () => hist.redo(), 'Ctrl+Shift+Z'], '-',
    ['Copy', copy, 'Ctrl+C'], ['Paste', paste, 'Ctrl+V'], ['Paste Insert', () => paste(true), 'Ctrl+Shift+V'], ['Clear', () => E.removeClips(P.sel), 'Delete'], ['Ripple Delete', () => E.removeClips(P.sel, true), 'Shift+Del'], ['Duplicate', dup, 'Ctrl+Alt+D'], '-',
    ['Preferences...', prefsDialog, 'Ctrl+,'], '-',
    ['Select All', () => { P.sel = []; for (const t of [...P.seq.v, ...P.seq.a]) t.clips.forEach(c => P.sel.push(c.id)); bus.emit('select'); tl.redraw(); }, 'Ctrl+A'], ['Deselect All', () => { P.sel = []; bus.emit('select'); tl.redraw(); }, 'Ctrl+Shift+A'],
  ],
  Clip: () => [
    ['Speed/Duration…', speedDlg, 'Ctrl+R'], ['Add Edit', () => E.split(P.t), 'Ctrl+K'], ['Add Edit to All Tracks', () => E.split(P.t), 'Ctrl+Shift+K'], '-',
    ['Link / Unlink', linkToggle, 'Ctrl+L'], ['Enable', () => { sel().forEach(c => c.disabled = !c.disabled); }, ''], '-',
    ['Reverse… (coming)', null], ['Duplicate', dup, ''],
  ],
  Sequence: () => [
    ['Sequence Settings…', seqSettings, ''], ['Render In to Out (n/a: GPU realtime)', null], '-',
    ['Add Tracks…', addTracks, ''], ['Delete Tracks…', delTrack, ''], '-',
    ['Go to Next Edit Point', () => nav(1), 'Down'], ['Go to Previous Edit Point', () => nav(-1), 'Up'], '-',
    ['Lift', () => E.liftExtract(false), ';'], ['Extract', () => E.liftExtract(true), "'"],
  ],
  Markers: () => [
    ['Mark In', () => { P.inP = P.t; bus.emit('seq'); }, 'I'], ['Mark Out', () => { P.outP = P.t; bus.emit('seq'); }, 'O'], ['Mark Clip', markClip, 'X'], ['Clear In and Out', () => { P.inP = P.outP = null; bus.emit('seq'); }, 'Ctrl+Shift+X'], '-',
    ['Add Marker', () => tl.addMarker(), 'M'], ['Clear All Markers', () => { P.markers = []; bus.emit('markers'); tl.redraw(); }, ''],
  ],
  'Graphics and Titles': () => [['New Text Layer', () => import('./gfx.js').then(m => m.addNewText()), 'Ctrl+T'], ['New Rectangle', () => import('./gfx.js').then(m => m.addShape('rect')), ''], ['New Ellipse', () => import('./gfx.js').then(m => m.addShape('ellipse')), ''], '-', ['Title Templates', () => { openPanel('essentialGraphics'); }, ''], ['Essential Graphics Panel', () => isOpen('essentialGraphics') ? closePanel('essentialGraphics') : openPanel('essentialGraphics'), '', isOpen('essentialGraphics')]],
  View: () => [
    ['Snap in Timeline', () => { P.snap = !P.snap; bus.emit('toolsync'); }, 'S', P.snap], ['Zoom In', () => tl.setZoom(P.zoom * 1.4), '='], ['Zoom Out', () => tl.setZoom(P.zoom / 1.4), '-'], ['Zoom to Fit', () => tl.fitZoom(), '\\'],
    '-', ['Loop Playback', () => { pb.loop = !pb.loop; }, '', pb.loop],
  ],
  Window: () => [
    ...Object.values(panels).map(p => [p.title, () => isOpen(p.id) ? closePanel(p.id) : openPanel(p.id), '', isOpen(p.id)]),
    '-', ['Reset to Saved Layout', () => resetLayout(curWs(), WS[curWs()]()), ''],
  ],
  Help: () => [['Tutorials and Changelog', () => openPanel('learn')], ['Keyboard Shortcuts', () => openPanel('learn')], ['About OpenPremiere', () => alert('OpenPremiere v' + VERSION)]],
};
const IS_MAC_DEFAULT = /Mac|iPhone|iPad/.test(navigator.platform || '');
export const plat = () => ls.get('platform', IS_MAC_DEFAULT ? 'mac' : 'win');
export function fmtKey(k) {
  if (!k) return '';
  if (plat() !== 'mac') return k;
  const parts = k.split('+'); let key = parts.pop(); const m = new Set(parts);
  const map = { Del: '\u232B', Delete: '\u232B', Left: '\u2190', Right: '\u2192', Up: '\u2191', Down: '\u2193', Enter: '\u21A9' };
  key = map[key] || key;
  return (m.has('Alt') ? '\u2325' : '') + (m.has('Shift') ? '\u21E7' : '') + (m.has('Ctrl') ? '\u2318' : '') + key;
}
function drawMenus() {
  const mb = document.getElementById('menubar'); mb.innerHTML = '';
  const mac = plat() === 'mac';
  mb.className = mac ? 'mac' : 'win';
  const mk = (n, items) => h('div', { class: 'mn' + (n === 'OpenPremiere' ? ' app' : ''), onclick: () => { const r = mb.querySelector('[data-mn="' + n + '"]').getBoundingClientRect(); popMenu(r.left, r.bottom, items().map(it => it === '-' ? it : [it[0], it[1] || (() => { }), fmtKey(it[2]), it[3]])); }, 'data-mn': n }, n);
  if (mac) mb.append(mk('OpenPremiere', () => [['About OpenPremiere', () => alert('OpenPremiere v' + VERSION)], '-', ['Preferences...', prefsDialog, 'Ctrl+,'], '-', ['Home', goHome, '']]));
  for (const n of Object.keys(MENUS)) mb.append(mk(n, MENUS[n]));
  const col = h('button', { class: 'topx', title: 'Hide top bar (hover the top edge to bring it back)', onclick: () => setTopCollapsed(!topCollapsed) });
  col.append(icon(topCollapsed ? 'pin' : 'closex', 14)); mb.append(h('div', { class: 'grow' }), col);
  drawHeader();
}
let editWs = ls.get('editWs', 'Editing');
let topCollapsed = !!ls.get('topCollapsed', false), peekT = 0;
function setTopCollapsed(v) {
  topCollapsed = v; ls.set('topCollapsed', v);
  document.getElementById('app').classList.toggle('topc', v); document.getElementById('app').classList.remove('peek');
  drawMenus(); setTimeout(() => bus.emit('resize'), 60);
}
{
  const app = document.getElementById('app');
  const hot = h('div', { id: 'tophot' });
  app.append(hot);
  const show = () => { clearTimeout(peekT); if (topCollapsed) app.classList.add('peek'); };
  const hide = () => { clearTimeout(peekT); peekT = setTimeout(() => app.classList.remove('peek'), 350); };
  for (const el of [hot, document.getElementById('menubar'), document.getElementById('hdrbar')]) { el.addEventListener('pointerenter', show); el.addEventListener('pointerleave', hide); }
  app.classList.toggle('topc', topCollapsed);
}
function drawHeader() {
  const hb = document.getElementById('hdrbar'); hb.innerHTML = '';
  const cur = curWs(); const mode = cur === 'Import' ? 'import' : 'edit';
  const mt = (id, label, fn) => h('div', { class: 'mode' + (id === mode ? ' on' : ''), onclick: fn }, label);
  const ib = (name, title, fn) => h('button', { class: 'hb', title, onclick: fn }, icon(name, 20));
  const wsMenu = e => { const r = e.currentTarget.getBoundingClientRect(); popMenu(r.left, r.bottom, WS_ORDER.filter(n => n !== 'Import').map(n => [n, () => { editWs = n; ls.set('editWs', n); setWs(n); }, '', n === cur])); };
  const title = h('div', { class: 'hb-title', title: 'Rename project', onclick: async () => { const n = prompt('Project name', P.projName); if (n) { P.projName = n; const { renameProject } = await import('./project.js'); await renameProject(P.projId, n); drawHeader(); } } });
  const setTitle = () => { title.textContent = P.projName + (P.history && P.history.length ? ' - Edited' : ''); };
  setTitle(); bus.on('history', setTitle);
  hb.append(h('button', { class: 'hb hb-home', title: 'Home', onclick: goHome }, icon('home', 22)),
    mt('import', 'Import', () => setWs('Import')), mt('edit', 'Edit', () => setWs(editWs)), mt('export', 'Export', () => exportDialog()),
    h('div', { class: 'hb-mid' }, title),
    h('div', { class: 'hb-ws', onclick: wsMenu, title: 'Workspaces' }, (cur === 'Import' ? editWs : cur).toUpperCase(), h('i', {}, icon('tarrow', 12))),
    ib('panels', 'Show / hide panels', e => { const r = e.currentTarget.getBoundingClientRect(); popMenu(r.left, r.bottom, Object.values(panels).sort((x, y) => x.title.localeCompare(y.title)).map(p => [p.title, () => isOpen(p.id) ? closePanel(p.id) : openPanel(p.id), '', isOpen(p.id)])); }),
    ib('share', 'Export', () => exportDialog()), ib('sliders', 'Preferences', () => prefsDialog()), ib('search', 'Search commands (Ctrl+Shift+P)', () => palette()),
    ib('audio', 'Mute audio', e => { pb.audioInit(); const m = pb.master.gain.value > 0; pb.master.gain.value = m ? 0 : 1; e.currentTarget.classList.toggle('off', m); }),
    ib('full', 'Full screen', () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => { }); }));
}
function prefsDialog() {
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const seg = (label, opts, cur, on) => h('div', { class: 'xrow' }, h('label', {}, label), h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { class: 'segb' + (String(cur) === String(v) ? ' on' : ''), onclick: e => { on(v); e.target.parentElement.querySelectorAll('.segb').forEach(b => b.classList.toggle('on', b === e.target)); } }, l))));
  const bright = h('input', { type: 'range', min: 10, max: 38, value: ls.get('bright', 14), class: 'psl', oninput: e => { ls.set('bright', +e.target.value); applyPrefs(); } });
  const m = h('div', { class: 'modal', onpointerdown: e => { if (e.target === m) m.remove(); } }, h('div', { class: 'mdl' }, h('div', { class: 'mh' }, 'Preferences'),
    h('div', { class: 'ph2' }, 'Appearance'),
    seg('Menu style', [['win', 'Windows'], ['mac', 'Mac']], plat(), v => { ls.set('platform', v); drawMenus(); }),
    seg('Interface font size', [[12, 'Small'], [14, 'Default'], [15, 'Large']], ls.get('fs', 14), v => { ls.set('fs', v); applyPrefs(); }),
    h('div', { class: 'xrow' }, h('label', {}, 'Brightness'), bright),
    h('div', { class: 'ph2' }, 'Editing'),
    seg('Snapping', [[1, 'On'], [0, 'Off']], P.snap ? 1 : 0, v => { P.snap = !!+v; bus.emit('toolsync'); }),
    seg('Loop playback', [[0, 'Off'], [1, 'On']], pb.loop ? 1 : 0, v => { pb.loop = !!+v; }),
    h('div', { class: 'xrow' }, h('label', {}, 'Workspace'), h('button', { class: 'btn', onclick: () => resetLayout(curWs(), WS[curWs()]()) }, 'Reset current layout')),
    h('div', { class: 'mf' }, h('button', { class: 'btn primary', onclick: () => m.remove() }, 'Done'))));
  document.body.append(m);
}
export function applyPrefs() {
  const b = ls.get('bright', 14), r = document.documentElement.style;
  r.setProperty('--pn', `hsl(0,0%,${b}%)`); r.setProperty('--bg', `hsl(0,0%,${Math.max(5, b - 5)}%)`); r.setProperty('--pn2', `hsl(0,0%,${b + 4}%)`);
  r.setProperty('--fs', ls.get('fs', 14) + 'px');
}
applyPrefs();

// ---------- home / project routing ----------
const homeEl = document.getElementById('home'), appEl = document.getElementById('app');
let homeApi = null;
const showHome = () => { homeEl.hidden = false; appEl.hidden = true; document.title = 'OpenPremiere'; if (homeApi) homeApi.reload(); };
const showEditor = () => { homeEl.hidden = true; appEl.hidden = false; drawMenus(); drawWs(); setTimeout(() => { bus.emit('resize'); tl.fitZoom(); pb.invalidate(); }, 60); };
export async function goHome() { pb.pause(); await saveProject(true); history.replaceState(null, '', '#/home'); showHome(); }
async function openById(id) { if (await openProject(id)) { history.replaceState(null, '', '#/edit/' + id); document.title = P.projName + ' - OpenPremiere'; showEditor(); startAutosave(); } else showHome(); }
async function createProject(o) { const id = await newProject(o); history.replaceState(null, '', '#/edit/' + id); showEditor(); startAutosave(); return id; }
function newDialog() {
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const name = h('input', { class: 'nvi wide', value: 'Untitled' });
  const w = h('input', { type: 'number', class: 'nvi', value: 1920 }), hh = h('input', { type: 'number', class: 'nvi', value: 1080 }), f = h('input', { type: 'number', class: 'nvi', value: 30 });
  const pre = h('select', { class: 'msel wide', onchange: e => { const [a, b, c] = e.target.value.split('x').map(Number); w.value = a; hh.value = b; f.value = c; } }, [['1920x1080x30', 'HD 1080p 30'], ['1920x1080x60', 'HD 1080p 60'], ['3840x2160x30', '4K UHD 30'], ['1080x1920x30', 'Vertical 9:16'], ['1080x1080x30', 'Square 1:1'], ['2048x858x24', 'Cinema 2.39:1 24'], ['1280x720x30', 'HD 720p 30']].map(([v, l]) => h('option', { value: v }, l)));
  const row = (l, ...e) => h('div', { class: 'xrow' }, h('label', {}, l), ...e);
  const m = h('div', { class: 'modal', onpointerdown: e => { if (e.target === m) m.remove(); } }, h('div', { class: 'mdl' }, h('div', { class: 'mh' }, 'New project'),
    row('Name', name), row('Preset', pre), row('Frame size', w, h('span', {}, 'x'), hh), row('Frame rate', f),
    h('div', { class: 'mf' }, h('button', { class: 'btn', onclick: () => m.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { m.remove(); createProject({ name: name.value || 'Untitled', w: +w.value || 1920, h: +hh.value || 1080, fps: +f.value || 30 }); } }, 'Create'))));
  document.body.append(m); name.select();
}
function startFromMedia() {
  const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'video/*,audio/*,image/*';
  i.onchange = async () => {
    const files = [...i.files]; if (!files.length) return;
    await createProject({ name: files[0].name.replace(/\.[^.]+$/, '') });
    const its = await importFiles(files);
    const v = its.find(x => x.kind === 'video' && x.w);
    if (v) { P.seq.w = v.w; P.seq.h = v.h; E.placeItem(v, { at: 0 }); } else if (its[0]) E.placeItem(its[0], { at: 0 });
    bus.emit('seq'); setTimeout(() => tl.fitZoom(), 100);
  };
  i.click();
}

// ---------- commands ----------
let clip = [];
function copy() { clip = sel().map(c => ({ ...JSON.parse(JSON.stringify(c)), _tr: findClip(c.id).tr.id })); }
function paste(ins) {
  if (!clip.length) return; hist.push('Paste');
  const base = Math.min(...clip.map(c => c.start)); const ids = [];
  const links = {};
  clip.forEach(c => {
    const n = JSON.parse(JSON.stringify(c)); n.id = 'c' + Math.random().toString(36).slice(2, 8); if (n.link) { links[n.link] ||= 'l' + Math.random().toString(36).slice(2, 6); n.link = links[n.link]; }
    n.start = E.q(P.t + (c.start - base)); const tr = E.trackOf(c._tr) || E.targetTrack(n.type); delete n._tr;
    E.clearRange(tr, n.start, n.start + n.dur); tr.clips.push(n); tr.clips.sort((a, b) => a.start - b.start); ids.push(n.id);
  });
  P.sel = ids; bus.emit('seq');
}
function dup() { copy(); const d = Math.max(...clip.map(c => c.start + c.dur)) - Math.min(...clip.map(c => c.start)); const t = P.t; P.t = Math.max(...sel().map(c => c.start + c.dur)); paste(); P.t = t; }
function linkToggle() { const cs = sel(); if (!cs.length) return; hist.push('Link'); const lk = cs.some(c => c.link) ? null : 'l' + Math.random().toString(36).slice(2, 6); cs.forEach(c => c.link = lk); bus.emit('seq'); }
function speedDlg() { const cs = sel(); if (!cs.length) return; const v = prompt('Speed (%)', '100'); if (!v) return; hist.push('Speed'); cs.forEach(c => { const f = c.fx.find(x => x.type === 'time'); if (!f) return; const old = f.p.speed / 100; f.p.speed = Math.max(5, Math.min(1000, +v)); c.dur = c.dur * old / (f.p.speed / 100); }); pb.invalidate(); bus.emit('seq'); }
function seqSettings() { const s = P.seq; const w = +prompt('Width', s.w); const hh = +prompt('Height', s.h); const f = +prompt('Frame rate', s.fps); if (w && hh && f) { s.w = w; s.h = hh; s.fps = f; bus.emit('seq'); } }
function addTracks() { const n = +prompt('Add how many video & audio tracks?', '1'); if (!n) return; hist.push('Add Tracks'); for (let i = 0; i < n; i++) { const v = P.seq.v.length + 1, a = P.seq.a.length + 1; P.seq.v.push({ id: 'V' + Math.random().toString(36).slice(2, 6), name: 'V' + v, clips: [], mute: false, lock: false, target: false }); P.seq.a.push({ id: 'A' + Math.random().toString(36).slice(2, 6), name: 'A' + a, clips: [], mute: false, solo: false, lock: false, target: false, vol: 1 }); } bus.emit('seq'); }
function delTrack() { const s = P.seq; if (s.v.length > 1 && s.v[s.v.length - 1].clips.length === 0) s.v.pop(); if (s.a.length > 1 && s.a[s.a.length - 1].clips.length === 0) s.a.pop(); bus.emit('seq'); }
function nav(dir) { const pts = E.editPoints(); const t = P.t; const n = dir > 0 ? pts.find(p => p > t + 1e-4) : [...pts].reverse().find(p => p < t - 1e-4); if (n != null) pb.seek(n); }
function markClip() { const c = sel()[0]; if (!c) return; P.inP = c.start; P.outP = c.start + c.dur; bus.emit('seq'); }

// ---------- keyboard ----------
const typing = t => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
addEventListener('keydown', e => {
  if (typing(e.target)) return;
  const k = e.key, ctrl = e.ctrlKey || e.metaKey, sh = e.shiftKey;
  const L_ = k.length === 1 ? k.toLowerCase() : k;
  const monFocus = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-panel="source"]');
  let used = true;
  if (ctrl) {
    if (L_ === 'z') sh ? hist.redo() : hist.undo();
    else if (L_ === 'y') hist.redo();
    else if (L_ === 'k') E.split(P.t);
    else if (L_ === 'c') copy(); else if (L_ === 'v') paste(sh); else if (L_ === 'd') { if (e.altKey) dup(); else if (sh) E.applyDefaultTransition('a'); else E.applyDefaultTransition('v'); }
    else if (L_ === 'a') { P.sel = []; for (const t of [...P.seq.v, ...P.seq.a]) t.clips.forEach(c => P.sel.push(c.id)); bus.emit('select'); tl.redraw(); }
    else if (L_ === 'i') pickFiles();
    else if (L_ === 'n') { if (e.altKey) newDialog(); else newSequence(); }
    else if (L_ === 'm') exportDialog();
    else if (L_ === 'l') linkToggle();
    else if (L_ === 'r') speedDlg();
    else if (L_ === 's') { saveProject(true); if (sh) { const n = prompt('Save project as', P.projName + ' copy'); if (n) { P.projName = n; saveProject(true); } } }
    else if (L_ === ',') prefsDialog();
    else if (L_ === 'o') goHome();
    else if (L_ === 'e' && sh) document.querySelector('[title^="Export Frame"]')?.click();
    else if (L_ === 't') import('./gfx.js').then(m => m.addNewText());
    else used = false;
  } else switch (L_) {
    case ' ': pb.toggle(); break;
    case 'k': pb.pause(); break;
    case 'l': pb.shuttle(1); break;
    case 'j': pb.shuttle(-1); break;
    case 'ArrowLeft': pb.step(sh ? -5 : -1); break;
    case 'ArrowRight': pb.step(sh ? 5 : 1); break;
    case 'ArrowUp': nav(-1); break;
    case 'ArrowDown': nav(1); break;
    case 'Home': pb.seek(0); break;
    case 'End': pb.seek(seqDur()); break;
    case 'i': if (sh) pb.seek(P.inP == null ? 0 : P.inP); else if (document.activeElement.closest?.('[data-panel="source"]') || (P.source && isSrcFocused())) src.markIn(); else { P.inP = P.t; if (P.outP != null && P.outP < P.inP) P.outP = null; bus.emit('seq'); } break;
    case 'o': if (sh) pb.seek(P.outP == null ? seqDur() : P.outP); else if (P.source && isSrcFocused()) src.markOut(); else { P.outP = P.t; if (P.inP != null && P.inP > P.outP) P.inP = null; bus.emit('seq'); } break;
    case 'x': markClip(); break;
    case ',': src.insert('insert'); break;
    case '.': src.insert('overwrite'); break;
    case ';': E.liftExtract(false); break;
    case "'": E.liftExtract(true); break;
    case 'd': if (sh) { E.applyDefaultTransition('v'); E.applyDefaultTransition('a'); } else used = false; break;
    case 'Delete': case 'Backspace': if (P.selTr && !P.sel.length) { E.removeTransition(P.selTr.id, P.selTr.side); break; } if (P.sel.length) E.removeClips(P.sel, sh); break;
    case 'a': setTool(sh ? 'sa' : 'a'); break;
    case 'v': case 'b': case 'n': case 'u': case 'r': case 'c': case 'y': case 'p': case 'h': case 'z': case 't': setTool(L_); break;
    case 's': P.snap = !P.snap; bus.emit('toolsync'); break;
    case 'm': tl.addMarker(); break;
    case '\\': tl.fitZoom(); break;
    case '=': case '+': tl.setZoom(P.zoom * 1.4); break;
    case '-': tl.setZoom(P.zoom / 1.4); break;
    case '`': maxHovered(); break;
    default: used = false;
  }
  if (used) e.preventDefault();
});
const isSrcFocused = () => { const g = document.querySelector('.group:hover'); return g && g.querySelector('[data-panel="source"]'); };
addEventListener('keyup', e => { });

// drop files anywhere
addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
addEventListener('drop', e => { if (e.dataTransfer.files.length && !e.defaultPrevented) { e.preventDefault(); importFiles([...e.dataTransfer.files]); } });

// ---------- boot ----------
initDock(document.getElementById('dock'));
P.history = [];
homeApi = mountHome(homeEl, { open: openById, create: createProject, newDialog, prefs: prefsDialog, quick: startFromMedia });
window.OPX = { setTool, P, pb, E, bus, setWs, openSource, importFiles, makeBars, createProject, openById, goHome, db };
setWs(ls.get('ws.cur', 'Editing'));
document.body.dataset.tool = 'v';
const m = location.hash.match(/^#\/edit\/(.+)$/);
if (m) openById(m[1]); else showHome();
// block accidental text selection and image dragging outside of inputs
addEventListener('selectstart', e => { if (!typing(e.target) && !(e.target.closest && e.target.closest('.selectable'))) e.preventDefault(); });
addEventListener('dragstart', e => { if (e.target.tagName === 'IMG' || e.target.tagName === 'CANVAS') e.preventDefault(); });

// ---------- command palette (Ctrl+Shift+P) and project find (Ctrl+F) ----------
function palette() {
  if (document.querySelector('.pal')) return;
  const cmds = [];
  for (const [m, fn] of Object.entries(MENUS)) { try { fn().forEach(x => { if (Array.isArray(x) && x[1]) cmds.push({ n: x[0].replace('…', '...'), g: m, run: x[1], k: x[2] || '' }); }); } catch (e) { } }
  P.items.filter(i => !i.gfxItem).forEach(i => cmds.push({ n: i.name, g: 'Media', run: () => openSource(i), k: '' }));
  P.seqs.forEach(s => cmds.push({ n: s.name, g: 'Sequence', run: () => setSeq(s), k: '' }));
  WS_ORDER.forEach(n => cmds.push({ n: 'Workspace: ' + n, g: 'Workspace', run: () => setWs(n), k: '' }));
  import('./fx.js').then(() => 0);
  const ov = h('div', { class: 'pal', onclick: e => { if (e.target === ov) ov.remove(); } });
  const inp = h('input', { placeholder: 'Type a command, clip, sequence or workspace' }); const res = h('div', { class: 'res' });
  let idx = 0, list = [];
  const draw = () => { const q = inp.value.toLowerCase().trim(); list = cmds.filter(c => !q || c.n.toLowerCase().includes(q) || c.g.toLowerCase().includes(q)).slice(0, 40); idx = Math.min(idx, Math.max(0, list.length - 1)); res.innerHTML = ''; list.forEach((c, i) => res.append(h('div', { class: 'it' + (i === idx ? ' on' : ''), onclick: () => run(c) }, h('div', {}, c.n), h('span', {}, c.k || c.g)))); };
  const run = c => { ov.remove(); setTimeout(() => c.run(), 20); };
  inp.addEventListener('input', () => { idx = 0; draw(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') ov.remove(); else if (e.key === 'ArrowDown') { idx = Math.min(list.length - 1, idx + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter' && list[idx]) run(list[idx]); e.stopPropagation(); });
  ov.append(h('div', { class: 'box' }, inp, res)); document.body.append(ov); inp.focus(); draw();
}
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'p' && e.shiftKey) { e.preventDefault(); palette(); }
  else if (k === 'f' && !e.shiftKey && !(e.target.tagName === 'INPUT')) { e.preventDefault(); import('./panels1.js').then(m => m.focusProjectSearch()); }
}, true);

// ---------- status bar (tool hint, like Premiere) ----------
const HINTS = {
  v: 'Click to select, or click in empty space and drag to marquee select. Use Shift, Alt and Ctrl for other options.',
  a: 'Click to select all clips to the right of the clicked clip on the same track. Use Shift to select on all tracks.',
  sa: 'Click to select all clips to the left of the clicked clip on the same track.',
  b: 'Click and drag a clip edge to trim it and ripple the following clips.',
  n: 'Drag the edit point between two clips to trim both at once.',
  r: 'Drag a clip edge to change its speed so it fits the new duration.',
  c: 'Click on a clip to cut it at that point. Hold Shift to cut all tracks.',
  y: 'Drag a clip to slip its source in and out points without changing its position.',
  u: 'Drag a clip to slide it and trim its neighbours.',
  p: 'Click to add a keyframe. Drag a keyframe or a rubber band segment to change values.',
  rect: 'Drag in the Program Monitor to draw a rectangle. Hold Shift to constrain proportions.',
  ellipse: 'Drag in the Program Monitor to draw an ellipse. Hold Shift for a circle.',
  poly: 'Drag in the Program Monitor to draw a polygon.',
  om_obj: 'Click an object in the Program Monitor to create a mask around it.',
  om_ellipse: 'Drag over a clip in the Program Monitor to draw an ellipse mask.',
  om_rect: 'Drag over a clip in the Program Monitor to draw a rectangle mask.',
  om_pen: 'Click points over a clip to draw a custom mask. Press Enter to finish.',
  h: 'Click and drag to scroll the timeline.',
  z: 'Click to zoom in the timeline. Hold Alt to zoom out.',
  t: 'Click in the Program Monitor to add text. Drag to create a text box.',
};
const sbar = document.getElementById('statusbar');
const drawStatus = () => { if (sbar) sbar.textContent = HINTS[P.tool] || HINTS.v; };
bus.on('tool', drawStatus); drawStatus();
