import { P, h, bus, ls, tc, hist, seqDur, selClips, findClip } from './core.js';
import { panels, initDock, setLayout, resetLayout, L, popMenu, openPanel, closePanel, isOpen, curWs, maxHovered } from './dock.js';
import './timeline.js'; import './panels1.js'; import './panels2.js';
import { pb } from './playback.js';
import { setTool, newSequence, newBin, openSource, src } from './panels1.js';
import { importFiles, pickFiles, makeBars, makeSolid } from './media.js';
import * as E from './edit.js';
import { tl } from './timeline.js';
import { SHORTCUTS } from './panels2.js';
import { icon } from './icons.js';
import { exportDialog } from './export.js';

window.OP_openPanel = openPanel;
const { tabs, split } = L;

// ---------- workspaces ----------
const WS = {
  'Learning': () => split('h', [split('v', [tabs(['learn']), tabs(['project', 'effects'])], [1, 1]), tabs(['program']), tabs(['effectControls', 'lumetri'])], [1, 1.6, 1]),
  'Assembly': () => split('v', [split('h', [tabs(['project', 'mediaBrowser', 'libraries', 'info', 'effects', 'markers', 'history']), tabs(['program'])], [1.2, 1]), split('h', [tabs(['tools']), tabs(['timeline'])], [.04, 1])], [1.5, 1]),
  'Editing': () => split('v', [split('h', [tabs(['source', 'effectControls', 'mixer', 'metadata']), tabs(['program']), tabs(['meters'])], [1.1, 1.1, .08]), split('h', [tabs(['project', 'mediaBrowser', 'libraries', 'info', 'effects', 'markers', 'history']), tabs(['tools']), tabs(['timeline'])], [1.1, .08, 4])], [1.2, 1]),
  'Color': () => split('h', [split('v', [split('h', [tabs(['scopes']), tabs(['program'])], [1, 1.2]), split('h', [tabs(['tools']), tabs(['timeline'])], [.06, 1])], [1.4, 1]), tabs(['lumetri', 'effectControls'])], [3, 1]),
  'Effects': () => split('v', [split('h', [tabs(['source']), tabs(['program']), tabs(['effects', 'project'])], [1, 1.2, .8]), split('h', [tabs(['effectControls']), tabs(['tools']), tabs(['timeline'])], [1, .05, 2.4])], [1.2, 1]),
  'Audio': () => split('v', [split('h', [tabs(['mixer', 'effectControls']), tabs(['program']), tabs(['meters'])], [1.4, 1, .15]), split('h', [tabs(['project', 'effects']), tabs(['tools']), tabs(['timeline'])], [.9, .06, 3])], [1.1, 1]),
  'Captions and Graphics': () => split('v', [split('h', [tabs(['project', 'effects']), tabs(['program']), tabs(['effectControls', 'lumetri'])], [1, 1.5, 1]), split('h', [tabs(['tools']), tabs(['timeline'])], [.04, 1])], [1.4, 1]),
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
function setWs(n) { ls.set('ws.cur', n); setLayout(n, WS[n]()); drawWs(); }

// ---------- menus ----------
const sel = () => selClips();
const MENUS = {
  File: () => [
    ['New Sequence…', () => newSequence(), 'Ctrl+N'], ['New Bin', () => newBin(), 'Ctrl+/'], '-',
    ['Import…', pickFiles, 'Ctrl+I'], '-',
    ['Export Media…', () => exportDialog(), 'Ctrl+M'], ['Export Frame', () => document.querySelector('[title^="Export Frame"]')?.click(), 'Ctrl+Shift+E'], '-',
    ['Save Project (local)', saveProject, 'Ctrl+S'],
  ],
  Edit: () => [
    ['Undo', () => hist.undo(), 'Ctrl+Z'], ['Redo', () => hist.redo(), 'Ctrl+Shift+Z'], '-',
    ['Copy', copy, 'Ctrl+C'], ['Paste', paste, 'Ctrl+V'], ['Paste Insert', () => paste(true), 'Ctrl+Shift+V'], ['Clear', () => E.removeClips(P.sel), 'Delete'], ['Ripple Delete', () => E.removeClips(P.sel, true), 'Shift+Del'], ['Duplicate', dup, 'Ctrl+Alt+D'], '-',
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
  Graphics: () => [['New Text Layer', () => import('./titles.js').then(m => m.addTitle()), 'Ctrl+T']],
  View: () => [
    ['Snap in Timeline', () => { P.snap = !P.snap; bus.emit('toolsync'); }, 'S', P.snap], ['Zoom In', () => tl.setZoom(P.zoom * 1.4), '='], ['Zoom Out', () => tl.setZoom(P.zoom / 1.4), '-'], ['Zoom to Fit', () => tl.fitZoom(), '\\'],
    '-', ['Loop Playback', () => { pb.loop = !pb.loop; }, '', pb.loop],
  ],
  Window: () => [
    ...Object.values(panels).map(p => [p.title, () => isOpen(p.id) ? closePanel(p.id) : openPanel(p.id), '', isOpen(p.id)]),
    '-', ['Reset to Saved Layout', () => resetLayout(curWs(), WS[curWs()]()), ''],
  ],
  Help: () => [['Keyboard Shortcuts', () => openPanel('learn')], ['About OpenPremiere', () => alert('OpenPremiere v0.1 — open source browser video editor')]],
};
function drawMenus() {
  const mb = document.getElementById('menubar'); mb.innerHTML = '';
  mb.append(h('div', { class: 'logo' }, 'Pr'));
  for (const n of Object.keys(MENUS)) {
    const m = h('div', { class: 'mn', onclick: e => { const r = m.getBoundingClientRect(); const items = MENUS[n]().map(it => it === '-' ? it : [it[0], it[1], it[2], it[3]]); const pm = popMenu(r.left, r.bottom, items.map(it => it === '-' ? it : [it[0], it[1] || (() => { }), it[2], it[3]])); pm.querySelectorAll('.mi').forEach((el, i) => { }); } }, n);
    mb.append(m);
  }
  mb.append(h('div', { class: 'grow' }), h('div', { class: 'projname' }, 'Untitled'),
    h('button', { class: 'btn primary', onclick: () => exportDialog() }, 'Export'));
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
function saveProject() { const o = { seqs: P.seqs, markers: P.markers, items: P.items.map(i => ({ ...i, file: undefined, url: i.solid ? i.url : null })) }; ls.set('proj', o); alert('Saved project metadata locally (media files must be re-imported)'); }

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
    else if (L_ === 'c') copy(); else if (L_ === 'v') paste(sh); else if (L_ === 'd' && e.altKey) dup();
    else if (L_ === 'a') { P.sel = []; for (const t of [...P.seq.v, ...P.seq.a]) t.clips.forEach(c => P.sel.push(c.id)); bus.emit('select'); tl.redraw(); }
    else if (L_ === 'i') pickFiles();
    else if (L_ === 'n') newSequence();
    else if (L_ === 'm') exportDialog();
    else if (L_ === 'l') linkToggle();
    else if (L_ === 'r') speedDlg();
    else if (L_ === 's') saveProject();
    else if (L_ === 'e' && sh) document.querySelector('[title^="Export Frame"]')?.click();
    else if (L_ === 't') import('./titles.js').then(m => m.addTitle());
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
    case 'Delete': case 'Backspace': if (P.sel.length) E.removeClips(P.sel, sh); break;
    case 'v': case 'a': case 'b': case 'r': case 'c': case 'y': case 'p': case 'h': case 'z': case 't': setTool(L_); break;
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
newSequence('Sequence 01');
drawMenus();
setWs(ls.get('ws.cur', 'Editing'));
document.body.dataset.tool = 'v';
P.history = []; bus.emit('history');
window.OPX = { P, pb, E, bus, setWs, openSource, importFiles, makeBars };
