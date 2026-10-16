// Free Library panel: sound effects (Openverse: Freesound + Wikimedia), meme templates (imgflip), reddit memes, and built-in synthesized SFX.
import { P, h, bus, uid, clamp, hist } from './core.js';
import { reg } from './dock.js';
import { icon } from './icons.js';
import { importFiles } from './media.js';
import * as E from './edit.js';

const API = '/api/lib/';
const prox = u => API + 'fetch?url=' + encodeURIComponent(u);
const MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const clean = s => (s || 'clip').replace(/[^\w\- ]+/g, '').trim().slice(0, 48) || 'clip';
const fmtDur = s => !s ? '' : s < 60 ? s.toFixed(1) + 's' : Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
async function jget(path) { const r = await fetch(API + path); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }

// ---------- built-in synthesized sounds (offline, no network, no licence worries) ----------
const SR = 44100;
function toWav(f) {
  const n = f.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f[i])) * 30000, true);
  return new Blob([b], { type: 'audio/wav' });
}
const noiseSrc = oc => { const b = oc.createBuffer(1, oc.length, SR), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = oc.createBufferSource(); s.buffer = b; return s; };
const gainEnv = (oc, pts, dest) => { const g = oc.createGain(); g.gain.setValueAtTime(pts[0][1], 0); for (const [t, v, e] of pts.slice(1)) e ? g.gain.exponentialRampToValueAtTime(Math.max(v, 1e-4), t) : g.gain.linearRampToValueAtTime(v, t); g.connect(dest); return g; };
const osc = (oc, type, f0, f1, t1, g, start = 0, stop = 99) => { const o = oc.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, start); if (f1 != null) o.frequency.exponentialRampToValueAtTime(f1, t1); o.connect(g); o.start(start); o.stop(Math.min(stop, oc.length / SR)); return o; };
const filt = (oc, type, f, q, dest) => { const x = oc.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; x.connect(dest); return x; };
const shaper = (oc, amt, dest) => { const s = oc.createWaveShaper(), c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * amt); } s.curve = c; s.connect(dest); return s; };
export const BUILTIN = [
  ['whoosh', 'Whoosh', .9, (oc, d) => { const n = noiseSrc(oc), f = filt(oc, 'bandpass', 300, 1.2, gainEnv(oc, [[0, 0], [.35, .9], [.85, 0]], d)); f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(4000, .35); f.frequency.exponentialRampToValueAtTime(300, .85); n.connect(f); n.start(); }],
  ['riser', 'Riser', 1.8, (oc, d) => { const g = gainEnv(oc, [[0, 0], [1.7, .8], [1.8, 0]], d), n = noiseSrc(oc), f = filt(oc, 'bandpass', 200, 3, g); f.frequency.exponentialRampToValueAtTime(7000, 1.7); n.connect(f); n.start(); osc(oc, 'sawtooth', 110, 900, 1.7, filt(oc, 'lowpass', 2500, .7, g)); }],
  ['impact', 'Impact hit', 1.4, (oc, d) => { osc(oc, 'sine', 130, 35, .8, gainEnv(oc, [[0, 1], [1.3, 1e-4, 1]], d)); const n = noiseSrc(oc); n.connect(filt(oc, 'lowpass', 900, .7, gainEnv(oc, [[0, .9], [.3, 1e-4, 1]], d))); n.start(); }],
  ['vineboom', 'Vine boom', 1.2, (oc, d) => { const s = shaper(oc, 4, gainEnv(oc, [[0, .9], [1.1, 1e-4, 1]], d)); osc(oc, 'sine', 95, 38, .4, s); osc(oc, 'sine', 190, 70, .4, gainEnv(oc, [[0, .5], [.5, 1e-4, 1]], s)); }],
  ['bassdrop', 'Bass drop', 1.6, (oc, d) => { osc(oc, 'sine', 160, 24, 1.4, shaper(oc, 2, gainEnv(oc, [[0, 1], [.1, 1], [1.55, 1e-4, 1]], d))); }],
  ['ding', 'Ding', 1.5, (oc, d) => { for (const [f, g, t] of [[1568, .5, 1.4], [2352, .25, 1], [3136, .12, .7]]) osc(oc, 'sine', f, null, 0, gainEnv(oc, [[0, g], [t, 1e-4, 1]], d)); }],
  ['pop', 'Pop', .2, (oc, d) => { osc(oc, 'sine', 900, 180, .1, gainEnv(oc, [[0, 1], [.15, 1e-4, 1]], d)); }],
  ['click', 'Click', .08, (oc, d) => { const n = noiseSrc(oc); n.connect(filt(oc, 'highpass', 2500, .7, gainEnv(oc, [[0, 1], [.04, 1e-4, 1]], d))); n.start(); }],
  ['coin', 'Coin', .6, (oc, d) => { const g = gainEnv(oc, [[0, .35], [.5, 1e-4, 1]], d); osc(oc, 'square', 988, null, 0, g, 0, .08); osc(oc, 'square', 1319, null, 0, g, .08, .6); }],
  ['laser', 'Laser', .4, (oc, d) => { osc(oc, 'square', 2200, 160, .35, gainEnv(oc, [[0, .4], [.38, 1e-4, 1]], d)); }],
  ['error', 'Error buzz', .5, (oc, d) => { const g = gainEnv(oc, [[0, .4], [.2, .4], [.21, 0], [.26, 0], [.27, .4], [.48, .4]], d); osc(oc, 'square', 150, null, 0, g); }],
  ['glitch', 'Glitch', .7, (oc, d) => { let t = 0; while (t < .65) { const l = .02 + Math.random() * .07; const g = gainEnv(oc, [[0, 0], [t, 0], [t + .002, .3], [t + l, 0]], d); osc(oc, Math.random() < .5 ? 'square' : 'sawtooth', 100 + Math.random() * 2500, null, 0, g, t, t + l); t += l + Math.random() * .04; } }],
  ['scratch', 'Record scratch', .6, (oc, d) => { const g = gainEnv(oc, [[0, 0], [.03, .8], [.5, .6], [.6, 0]], d); osc(oc, 'sawtooth', 1800, 90, .5, filt(oc, 'bandpass', 1500, 2, g)); const n = noiseSrc(oc); n.connect(filt(oc, 'bandpass', 3000, 3, gainEnv(oc, [[0, .3], [.5, .1], [.6, 0]], d))); n.start(); }],
  ['airhorn', 'Air horn', 1.4, (oc, d) => { const g = gainEnv(oc, [[0, 0], [.03, .3], [1.0, .3], [1.3, 0]], filt(oc, 'lowpass', 3500, .7, d)); for (const f of [415, 523, 622, 831]) osc(oc, 'sawtooth', f, null, 0, g); }],
  ['sadtrombone', 'Sad trombone', 2.6, (oc, d) => { const lp = filt(oc, 'lowpass', 1000, .7, d); let t = 0; for (const [f, l] of [[233, .45], [220, .45], [208, .45], [196, 1.1]]) { const g = gainEnv(oc, [[0, 0], [t, 0], [t + .04, .5], [t + l - .05, .4], [t + l, 0]], lp); const o = osc(oc, 'sawtooth', f, null, 0, g, t, t + l + .05); if (l > 1) { const lf = oc.createOscillator(), lg = oc.createGain(); lf.frequency.value = 5.5; lg.gain.value = 5; lf.connect(lg); lg.connect(o.frequency); lf.start(t); } t += l; } }],
  ['shutter', 'Camera shutter', .3, (oc, d) => { for (const t of [0, .09]) { const n = noiseSrc(oc); n.connect(filt(oc, 'bandpass', 3200, 1.5, gainEnv(oc, [[0, 0], [t, 0], [t + .002, .9], [t + .05, 0]], d))); n.start(); } }],
];
const bcache = new Map();
async function renderBuiltin(id) {
  if (bcache.has(id)) return bcache.get(id);
  const r = BUILTIN.find(x => x[0] === id); const oc = new OfflineAudioContext(1, Math.ceil(SR * r[2]), SR);
  const lim = oc.createGain(); lim.gain.value = .9; lim.connect(oc.destination); r[3](oc, lim);
  const buf = await oc.startRendering(); const blob = toWav(buf.getChannelData(0)); bcache.set(id, blob); return blob;
}

// ---------- importing into the project ----------
const made = new Map();
function binFor(name) { let b = P.bins.find(x => x.name === name && x.parent === 'root'); if (!b) { b = { id: uid('b'), name, parent: 'root' }; P.bins.push(b); } return b.id; }
export async function ensureItem(e) {
  const key = e.builtin ? 'b:' + e.builtin : (e.id || e.url);
  const ex = made.get(key); const have = ex && P.items.find(i => i.id === ex); if (have) return have;
  let blob, name, ext;
  if (e.builtin) { blob = await renderBuiltin(e.builtin); ext = 'wav'; name = clean(e.title) + '.wav'; }
  else {
    const r = await fetch(prox(e.url)); if (!r.ok) throw new Error('Download failed (' + r.status + ')');
    blob = await r.blob(); ext = (e.ext || (e.url.split('?')[0].match(/\.(\w+)$/) || [])[1] || (e.k === 'meme' ? 'jpg' : 'mp3')).toLowerCase(); name = clean(e.title) + '.' + ext;
  }
  const file = new File([blob], name, { type: MIME[ext] || blob.type });
  const [it] = await importFiles([file], binFor(e.k === 'meme' ? 'Memes' : 'Sound Effects'));
  if (!it) throw new Error('Could not read this file');
  it.credit = e.builtin ? 'Built-in synthesized sound' : `${e.title}${e.creator || e.author ? ' by ' + (e.creator || e.author) : ''}${e.license ? ' (' + e.license + ')' : ''}${e.landing ? ' - ' + e.landing : ''}`;
  it.name = clean(e.title) + (e.k === 'meme' ? '' : '');
  made.set(key, it.id); bus.emit('project'); return it;
}
function freeTrack(kind, t, d) {
  const s = P.seq, arr = kind === 'v' ? s.v : s.a;
  const free = arr.find((tr, i) => !tr.lock && (kind === 'a' || i > 0) && !tr.clips.some(c => c.start < t + d - 1e-6 && c.start + c.dur > t + 1e-6));
  if (free) return free;
  const n = arr.length + 1, tr = { id: (kind === 'v' ? 'V' : 'A') + uid('t').slice(-4), name: (kind === 'v' ? 'V' : 'A') + n, clips: [], mute: false, lock: false, target: false };
  if (kind === 'a') { tr.solo = false; tr.vol = 1; }
  arr.push(tr); return tr;
}
export async function insertEntry(e, at = P.t, track = null) {
  if (!P.seq) throw new Error('Open a sequence first');
  const it = await ensureItem(e);
  if (e.k === 'meme') { const d = 3; const vtr = track && P.seq.v.includes(track) ? track : freeTrack('v', at, d); E.placeItem(it, { at, outT: d, vtr }); }
  else { const atr = track && P.seq.a.includes(track) ? track : freeTrack('a', at, it.dur); E.placeItem(it, { at, atr }); }
  return it;
}

// ---------- UI ----------
let player = null, playing = null;
function stopPlayer() { if (player) { player.pause(); player = null; } if (playing) { playing.classList.remove('on'); playing.replaceChildren(icon('play', 14)); playing = null; } }
async function togglePlay(btn, e) {
  if (playing === btn) { stopPlayer(); return; }
  stopPlayer(); playing = btn; btn.classList.add('on'); btn.replaceChildren(icon('stopsq', 14));
  try {
    const url = e.builtin ? URL.createObjectURL(await renderBuiltin(e.builtin)) : prox(e.url);
    const a = new Audio(url); player = a; a.onended = () => { if (playing === btn) stopPlayer(); }; a.onerror = () => { if (playing === btn) { stopPlayer(); toast('Could not play this sound'); } };
    await a.play();
  } catch (err) { if (playing === btn) stopPlayer(); }
}
const toastEl = h('div', { class: 'flt-toast' });
function toast(m) { toastEl.textContent = m; toastEl.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('on'), 2200); }
async function run(btn, fn, ok) { btn.disabled = true; const t = btn.textContent; btn.textContent = '...'; try { await fn(); toast(ok); } catch (err) { toast(err.message || 'Failed'); } btn.disabled = false; btn.textContent = t; }

const SFX_CHIPS = ['whoosh', 'hit', 'boom', 'airhorn', 'laugh', 'applause', 'bruh', 'fail', 'sad', 'cartoon', 'pop', 'click', 'ding', 'glitch', 'scream', 'transition', 'riser', 'footsteps', 'rain', 'ambience', 'camera', 'explosion', 'sword', 'door'];
const SUBS = [['memes', 'Memes'], ['dankmemes', 'Dank'], ['wholesomememes', 'Wholesome'], ['me_irl', 'me_irl'], ['ProgrammerHumor', 'Programmer'], ['AdviceAnimals', 'Advice'], ['HistoryMemes', 'History'], ['PrequelMemes', 'Prequel'], ['funny', 'Funny'], ['reactiongifs', 'Reactions']];

function sfxRow(e) {
  const pb = h('button', { class: 'flb play', title: 'Preview', onclick: () => togglePlay(pb, e) }, icon('play', 14));
  const row = h('div', { class: 'flrow', draggable: 'true' },
    pb, h('div', { class: 'flmeta' }, h('div', { class: 'fln' }, e.title), h('div', { class: 'fls' }, [e.builtin ? 'Built-in' : (e.creator || 'Unknown'), e.license, fmtDur(e.dur)].filter(Boolean).join('  /  '))),
    h('button', { class: 'flb txt', title: 'Add to project', onclick: ev => run(ev.currentTarget, () => ensureItem(e), 'Added to the Sound Effects bin') }, 'Add'),
    h('button', { class: 'flb txt acc', title: 'Place on the timeline at the playhead', onclick: ev => run(ev.currentTarget, () => insertEntry(e), 'Placed at the playhead') }, 'Insert'));
  row.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/op-lib', JSON.stringify(e)); ev.dataTransfer.effectAllowed = 'copy'; });
  return row;
}
function memeTile(e) {
  const t = h('div', { class: 'fltile', draggable: 'true', title: e.title },
    h('img', { src: prox(e.thumb || e.url), loading: 'lazy', draggable: false, onerror: ev => { ev.target.style.visibility = 'hidden'; } }),
    h('div', { class: 'flov' }, h('div', { class: 'flt2' }, e.title),
      h('div', { class: 'flbtns' },
        h('button', { class: 'flb txt', onclick: ev => run(ev.currentTarget, () => ensureItem(e), 'Added to the Memes bin') }, 'Add'),
        h('button', { class: 'flb txt acc', onclick: ev => run(ev.currentTarget, () => insertEntry(e), 'Placed on a free video track') }, 'Insert'))));
  t.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/op-lib', JSON.stringify(e)); ev.dataTransfer.effectAllowed = 'copy'; });
  return t;
}
const more = fn => h('button', { class: 'btn flmore', onclick: fn }, 'Load more');
const note = (t, err) => h('div', { class: 'flnote' + (err ? ' err' : '') }, t);

function buildSfx(pane) {
  let q = '', page = 1, src = 'all', busy = false;
  const list = h('div', { class: 'fllist' }); const foot = h('div', { class: 'flfoot' });
  const input = h('input', { class: 'flsearch', placeholder: 'Search sounds, e.g. whoosh, airhorn, laugh', onkeydown: ev => { if (ev.key === 'Enter') go(input.value); ev.stopPropagation(); } });
  const sel = h('select', { class: 'msel', onchange: ev => { src = ev.target.value; go(q || 'whoosh'); } }, [['all', 'All sources'], ['freesound', 'Freesound'], ['wikimedia_audio', 'Wikimedia']].map(([v, l]) => h('option', { value: v }, l)));
  const chips = h('div', { class: 'flchips' }, SFX_CHIPS.map(c => h('button', { class: 'flchip', onclick: () => { input.value = c; go(c); } }, c)));
  async function load() {
    if (busy) return; busy = true; foot.replaceChildren(note('Loading...'));
    try {
      const j = await jget(`sfx?q=${encodeURIComponent(q)}&page=${page}&source=${src}`);
      j.items.forEach(e => { e.k = 'sfx'; list.append(sfxRow(e)); });
      if (!list.children.length) foot.replaceChildren(note('No sounds found. Try another word.'));
      else foot.replaceChildren(j.items.length >= 12 ? more(() => { page++; load(); }) : note('End of results'));
    } catch (err) { foot.replaceChildren(note('Could not reach the sound library. Check your connection and try again.', true), more(load)); }
    busy = false;
  }
  function go(s) { q = s.trim() || 'whoosh'; page = 1; list.replaceChildren(); stopPlayer(); load(); }
  pane.append(h('div', { class: 'flbar' }, h('div', { class: 'flsb' }, icon('search', 15), input), sel), chips, h('div', { class: 'flscroll' }, list, foot,
    h('div', { class: 'flcred' }, 'Sounds come from Openverse (Freesound and Wikimedia Commons), CC licensed. Credit lines are saved on each item.')));
  go('whoosh');
}

function buildMemes(pane) {
  let mode = 'tpl', sub = 'memes', filter = '';
  const grid = h('div', { class: 'flgrid' }), foot = h('div', { class: 'flfoot' }); const seen = new Set();
  let tpl = null;
  const seg = h('div', { class: 'flseg' }, [['tpl', 'Templates'], ['red', 'Reddit feed']].map(([v, l]) => h('button', { class: 'flsegb' + (v === mode ? ' on' : ''), onclick: () => { mode = v; seg.querySelectorAll('.flsegb').forEach((b, i) => b.classList.toggle('on', i === (v === 'tpl' ? 0 : 1))); redraw(); } }, l)));
  const input = h('input', { class: 'flsearch', placeholder: 'Filter templates', oninput: ev => { filter = ev.target.value.toLowerCase(); if (mode === 'tpl') drawTpl(); }, onkeydown: ev => ev.stopPropagation() });
  const chips = h('div', { class: 'flchips' }, SUBS.map(([v, l]) => h('button', { class: 'flchip' + (v === sub ? ' on' : ''), onclick: () => { sub = v; chips.querySelectorAll('.flchip').forEach(c => c.classList.toggle('on', c.textContent === l)); seen.clear(); redraw(); } }, l)));
  async function drawTpl() {
    grid.replaceChildren(); foot.replaceChildren(note('Loading...'));
    try { tpl ||= (await jget('templates')).items; const items = tpl.filter(t => !filter || t.title.toLowerCase().includes(filter)); items.forEach(t => grid.append(memeTile({ ...t, k: 'meme', ext: 'jpg' }))); foot.replaceChildren(items.length ? note(items.length + ' templates') : note('No match')); }
    catch { foot.replaceChildren(note('Could not load templates.', true), more(drawTpl)); }
  }
  async function loadRed(reset) {
    if (reset) { grid.replaceChildren(); seen.clear(); } foot.replaceChildren(note('Loading...'));
    try { const j = await jget('reddit?sub=' + sub + '&n=24'); let add = 0; for (const m of j.items) { if (seen.has(m.id)) continue; seen.add(m.id); add++; grid.append(memeTile({ ...m, k: 'meme' })); } foot.replaceChildren(add || grid.children.length ? more(() => loadRed(false)) : note('Nothing came back. Try another feed.')); }
    catch { foot.replaceChildren(note('Could not reach the meme feed.', true), more(() => loadRed(true))); }
  }
  function redraw() { chips.style.display = mode === 'red' ? '' : 'none'; input.parentElement.style.display = mode === 'tpl' ? '' : 'none'; mode === 'tpl' ? drawTpl() : loadRed(true); }
  pane.append(h('div', { class: 'flbar' }, seg, h('div', { class: 'flsb' }, icon('search', 15), input)), chips, h('div', { class: 'flscroll' }, grid, foot,
    h('div', { class: 'flcred' }, 'Templates from imgflip, feed from public Reddit meme subs. Memes belong to their creators, so check usage rights before publishing.')));
  redraw();
}

function buildBuiltin(pane) {
  const list = h('div', { class: 'fllist' });
  BUILTIN.forEach(([id, title, dur]) => list.append(sfxRow({ k: 'sfx', builtin: id, title, dur, license: 'Free to use' })));
  pane.append(h('div', { class: 'flscroll' }, h('div', { class: 'flnote' }, 'Made in your browser, so they work offline and are always free to use.'), list));
}

function build(el) {
  el.classList.add('flib');
  const panes = { sfx: h('div', { class: 'flpane' }), meme: h('div', { class: 'flpane' }), built: h('div', { class: 'flpane' }) };
  const built = {}; const tabs = [['sfx', 'Sound Effects', buildSfx], ['meme', 'Memes', buildMemes], ['built', 'Built-in', buildBuiltin]];
  const bar = h('div', { class: 'fltabs' }, tabs.map(([k, l]) => h('button', { class: 'fltab', 'data-k': k, onclick: () => show(k) }, l)));
  function show(k) { stopPlayer(); bar.querySelectorAll('.fltab').forEach(b => b.classList.toggle('on', b.dataset.k === k)); for (const [kk, p] of Object.entries(panes)) p.style.display = kk === k ? '' : 'none'; if (!built[k]) { built[k] = 1; tabs.find(t => t[0] === k)[2](panes[k]); } }
  el.append(bar, panes.sfx, panes.meme, panes.built, toastEl); show('sfx');
}
reg('freeLib', 'Free Library', build);
