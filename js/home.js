import { h, bus, ls } from './core.js';
import { db } from './db.js';
import { icon } from './icons.js';
import { popMenu } from './dock.js';
import { deleteProject, duplicateProject, renameProject } from './project.js';

const PRESETS = [
  ['HD 1080p', '1920 x 1080 · 30 fps', { w: 1920, h: 1080, fps: 30 }, 'p169'],
  ['4K UHD', '3840 x 2160 · 30 fps', { w: 3840, h: 2160, fps: 30 }, 'p169'],
  ['Vertical 9:16', '1080 x 1920 · Reels, Shorts, TikTok', { w: 1080, h: 1920, fps: 30 }, 'p916'],
  ['Square 1:1', '1080 x 1080 · Feed posts', { w: 1080, h: 1080, fps: 30 }, 'p11'],
  ['Cinema 2.39:1', '2048 x 858 · 24 fps', { w: 2048, h: 858, fps: 24 }, 'pcin'],
  ['HD 720p', '1280 x 720 · 30 fps', { w: 1280, h: 720, fps: 30 }, 'p169'],
];
const LEARN = [
  ['Make your first edit', ['Drag a video from the Project panel to the timeline', 'Press C for the razor tool, click a clip to cut it', 'Press V, select the gap and press Shift+Delete to ripple delete', 'Press Space to play, Ctrl+M to export']],
  ['Color grade with Lumetri', ['Switch to the Color workspace', 'Select a clip and use Basic Correction sliders', 'Use the wheels for shadows, midtones, highlights', 'Open Lumetri Scopes to check exposure']],
  ['Keyframes and easing', ['Select a clip and open Effect Controls', 'Click the stopwatch on Scale to start animating', 'Move the playhead, change the value for a new keyframe', 'Right click a keyframe diamond to pick an easing curve']],
  ['Add text and shapes', ['Press T and click in the Program monitor', 'Type your text, press Escape when done', 'Style it in the Essential Graphics panel', 'Hold the Rectangle tool for ellipse and polygon']],
  ['Keyboard shortcuts', ['Open the Learn panel for the full list', 'J K L shuttle, I and O mark in and out', 'Ctrl+K cuts at the playhead', 'Press S to toggle snapping']],
];

const ago = t => { const s = (Date.now() - t) / 1000; if (s < 60) return 'Just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' hr ago'; const d = Math.floor(s / 86400); return d === 1 ? 'Yesterday' : d + ' days ago'; };

export function mountHome(root, api) {
  root.innerHTML = '';
  let page = 'home', q = '', sort = 'modified', projects = [];
  const side = h('div', { class: 'hside' });
  const main = h('div', { class: 'hmain' });
  root.append(side, main);

  const nav = (id, ic, label) => h('div', { class: 'hnav' + (page === id ? ' on' : ''), onclick: () => { page = id; draw(); } }, icon(ic, 18), label);
  const drawSide = () => {
    side.innerHTML = '';
    side.append(h('div', { class: 'hbrand' }, h('div', { class: 'hlogo' }, 'Pr'), h('div', {}, h('b', {}, 'OpenPremiere'), h('span', {}, 'Open source video editor'))),
      h('button', { class: 'btn primary hnew', onclick: () => api.newDialog() }, icon('plus', 14), 'New project'),
      nav('home', 'home', 'Home'), nav('projects', 'folder', 'Your projects'), nav('learn', 'learn', 'Learn'),
      h('div', { class: 'grow' }),
      h('div', { class: 'hnav', onclick: () => api.prefs() }, icon('gear', 18), 'Preferences'));
  };

  const card = p => {
    const m = h('button', { class: 'tb hcm', title: 'More', onclick: e => { e.stopPropagation(); popMenu(e.clientX, e.clientY, [
      ['Open', () => api.open(p.id)], ['Rename', async () => { const n = prompt('Project name', p.name); if (n) { await renameProject(p.id, n); load(); } }],
      ['Duplicate', async () => { await duplicateProject(p.id); load(); }], '-',
      ['Delete', async () => { if (confirm('Delete "' + p.name + '"? This also removes its media from this browser.')) { await deleteProject(p.id); load(); } }]]); } }, icon('more2', 16));
    return h('div', { class: 'pcard', onclick: () => api.open(p.id) },
      h('div', { class: 'pcthumb' }, p.thumb ? h('img', { src: p.thumb, draggable: false }) : icon('film', 40), m),
      h('div', { class: 'pcname' }, p.name), h('div', { class: 'pcsub' }, 'Edited ' + ago(p.modified)));
  };

  const quick = () => h('div', { class: 'hsec' }, h('h3', {}, 'Start with a preset'),
    h('div', { class: 'qgrid' }, PRESETS.map(([n, s, o, cls]) => h('div', { class: 'qcard', onclick: () => api.create({ ...o, name: 'Untitled' }) },
      h('div', { class: 'qshape' }, h('i', { class: cls })), h('div', { class: 'qn' }, n), h('div', { class: 'qs' }, s)))));

  const recent = (all) => {
    let list = projects.filter(p => !q || p.name.toLowerCase().includes(q));
    list.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b[sort] - a[sort]);
    if (!all) list = list.slice(0, 8);
    return h('div', { class: 'hsec' }, h('div', { class: 'hsh' }, h('h3', {}, all ? 'Your projects' : 'Recent'), all ? null : h('span', { class: 'hlink', onclick: () => { page = 'projects'; draw(); } }, 'View all'),
      h('div', { class: 'grow' }),
      all ? h('select', { class: 'msel', onchange: e => { sort = e.target.value; draw(); } }, [['modified', 'Last modified'], ['created', 'Created'], ['name', 'Name']].map(([v, l]) => h('option', { value: v, selected: v === sort }, l))) : null),
      list.length ? h('div', { class: 'pgrid' }, list.map(card)) : h('div', { class: 'hempty' }, projects.length ? 'No projects match your search' : 'Projects you create show up here'));
  };

  const learn = () => h('div', { class: 'hsec' }, h('h3', {}, 'Learn'),
    h('div', { class: 'lgrid' }, LEARN.map(([t, steps], i) => h('div', { class: 'lcard' }, h('div', { class: 'lnum' }, String(i + 1)), h('b', {}, t), h('ol', {}, steps.map(s => h('li', {}, s)))))));

  const draw = () => {
    drawSide(); main.innerHTML = '';
    const search = h('input', { class: 'psearch hsearch', placeholder: 'Search projects', value: q, oninput: e => { q = e.target.value.toLowerCase(); if (page === 'home' && q) page = 'projects'; draw(); const i = main.querySelector('.hsearch'); i && (i.focus(), i.setSelectionRange(99, 99)); } });
    main.append(h('div', { class: 'htop' }, search));
    if (page === 'home') {
      main.append(h('div', { class: 'hhero' }, h('h1', {}, 'Welcome to OpenPremiere'),
        h('div', { class: 'hact' },
          h('button', { class: 'btn primary lg', onclick: () => api.newDialog() }, 'New project'),
          h('button', { class: 'btn lg', onclick: () => api.quick() }, 'Start from media'),
          h('button', { class: 'btn lg', onclick: () => api.prefs() }, 'Preferences'))),
        quick(), recent(false), learn());
    } else if (page === 'projects') main.append(recent(true));
    else main.append(learn());
  };
  async function load() { projects = await db.allProjects().catch(() => []); draw(); }
  load();
  return { reload: load };
}
