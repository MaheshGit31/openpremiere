import { h, ls } from './core.js';
import { reg } from './dock.js';
import { SHORTCUTS } from './panels2.js';
import { CHANGELOG, VERSION } from './changelog.js';

const TUTS = [
  ['Getting started', [
    'Press Import at the top (or Ctrl+I) and pick your video, audio and images. They land in the Project panel.',
    'Drag a clip from the Project panel onto the timeline, or double click it to open it in the Source monitor and press , to insert.',
    'Press Space to play, J K L to shuttle, and drag the playhead in the ruler to scrub.',
    'Use the Edit tab at the top for the full editing layout, and Export when you are done.' ]],
  ['Cutting and trimming', [
    'Press C for the razor and click a clip to split it, or park the playhead and press Ctrl+K to cut every targeted track.',
    'Select the cut piece and press Delete to remove it, or Shift+Delete to ripple delete so the gap closes.',
    'Drag the edge of a clip to trim it. Hold the tool B for ripple edit, N for rolling edit, or Y for slip.',
    'Q and W ripple trim the previous or next edit to the playhead. Press S to toggle snapping if clips jump around.' ]],
  ['Using the Free Library', [
    'Open the Free Library tab (Import workspace, or Window menu). Pick Sound Effects, Memes or Built-in.',
    'Type a word or tap a chip, press the play button to preview, then Add to put it in the project or Insert to drop it at the playhead.',
    'You can also drag any row or tile straight onto the timeline.',
    'Sounds are CC licensed. Credit text is stored on the item, so keep it if the license is CC BY. Memes from reddit belong to their creators.',
    'The Built-in tab has vine boom, airhorn and other synthesized sounds that always work offline.' ]],
  ['Transitions', [
    'Open the Effects panel, search a transition, and drag it onto a cut between two clips, or onto a clip edge for a fade.',
    'Select the transition on the timeline and use Effect Controls to change duration and alignment.',
    'Ctrl+D adds the default video transition at the playhead, Ctrl+Shift+D the default audio one.' ]],
  ['Effects and keyframes', [
    'Select a clip, open Effect Controls, and drag an effect from the Effects panel onto the clip.',
    'Click the stopwatch next to a parameter to start keyframing, move the playhead and change the value to add another keyframe.',
    'Right click a keyframe to change its easing. Motion, opacity and scale are built into every clip.',
    'Save a good look with Save clip effects as preset in the Libraries panel.' ]],
  ['Text, shapes and masks', [
    'Press T and click the program monitor to type. Press P for the pen tool to draw shapes and masks.',
    'Select the graphic on the timeline to edit font, fill, stroke and position in Effect Controls.',
    'To mask a clip, add an effect and use the mask tools in Effect Controls, then keyframe the mask path to follow motion.' ]],
  ['Audio', [
    'Open the Audio workspace for meters and the audio monitor. Use G to change gain on a selected clip.',
    'Drag the rubber band on a clip to fade or adjust volume, and use M and S on a track header to mute or solo.',
    'Add audio effects from the Effects panel, and use audio transitions on cuts to smooth the sound.' ]],
  ['Markers and sequences', [
    'Press M to add a marker, double click it to name it or change the color. The Markers panel lists them all.',
    'Each sequence has its own tab above the timeline. Right click a tab to duplicate or close it.',
    'Nest one sequence inside another by dragging it from the Project panel onto the timeline.' ]],
  ['Exporting', [
    'Press the Export tab or Ctrl+M. Pick a format and quality, then hit Export.',
    'Set In and Out points with I and O first if you only want a section.',
    'Ctrl+Shift+E saves the current frame as an image.' ]],
];

function tutorials(el, q) {
  TUTS.forEach(([t, steps], i) => {
    const txt = (t + ' ' + steps.join(' ')).toLowerCase();
    if (q && !txt.includes(q)) return;
    const d = h('details', { class: 'ltut' }, h('summary', {}, t), h('ol', {}, steps.map(s => h('li', {}, s))));
    if (q || i === 0) d.open = true; el.append(d);
  });
  if (!el.children.length) el.append(h('div', { class: 'pempty' }, 'Nothing found'));
}
function shortcuts(el, q) {
  SHORTCUTS.filter(([k, d]) => !q || (k + ' ' + d).toLowerCase().includes(q)).forEach(([k, d]) => el.append(h('div', { class: 'irow' }, h('b', {}, k), h('span', {}, d))));
  if (!el.children.length) el.append(h('div', { class: 'pempty' }, 'Nothing found'));
}
function changelog(el) {
  CHANGELOG.forEach(c => el.append(h('div', { class: 'lcl' }, h('div', { class: 'lclh' }, h('b', {}, 'v' + c.v), h('span', {}, c.title), h('em', {}, c.date)), h('ul', {}, c.items.map(i => h('li', {}, i))))));
}

function build(el) {
  el.classList.add('learn');
  const tabs = [['tut', 'Tutorials', tutorials], ['keys', 'Shortcuts', shortcuts], ['log', 'What\'s new', changelog]];
  let cur = ls.get('learnTab', 'tut'); if (!tabs.some(t => t[0] === cur)) cur = 'tut';
  const body = h('div', { class: 'lbody' });
  const input = h('input', { class: 'flsearch', placeholder: 'Search tutorials and shortcuts', oninput: draw, onkeydown: e => e.stopPropagation() });
  const bar = h('div', { class: 'fltabs' }, tabs.map(([k, l]) => h('button', { class: 'fltab', 'data-k': k, onclick: () => { cur = k; ls.set('learnTab', k); draw(); } }, l)),
    h('span', { class: 'lver' }, 'OpenPremiere v' + VERSION));
  function draw() {
    bar.querySelectorAll('.fltab').forEach(b => b.classList.toggle('on', b.dataset.k === cur));
    input.style.display = cur === 'log' ? 'none' : '';
    body.replaceChildren(); tabs.find(t => t[0] === cur)[2](body, input.value.trim().toLowerCase());
  }
  el.append(bar, h('div', { class: 'lsb' }, input), body); draw();
}
reg('learn', 'Learn', build);
