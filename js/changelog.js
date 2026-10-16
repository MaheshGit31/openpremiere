// Version history. RULE: every time changes are shipped, add a new entry at the TOP of CHANGELOG and bump VERSION.
export const VERSION = '0.5.0';
export const CHANGELOG = [
  { v: '0.5.0', date: '2026-10-15', title: 'Free library and real tutorials', items: [
    'New Free Library panel with 3 tabs: Sound Effects, Memes and Built-in',
    'Sound Effects search Openverse (Freesound and Wikimedia Commons, CC licensed) with preview, Add and Insert; credit lines are saved on each item',
    'Memes tab with imgflip templates and a live reddit meme feed, drag to the timeline or press Add / Insert',
    'Built-in sounds generated in your browser: vine boom, airhorn, bruh, record scratch, riser and more, so they work offline',
    'Insert puts the item on a free track at the playhead, drag and drop onto the timeline works too',
    'Learn panel rebuilt: step by step tutorials, shortcut search and this changelog',
    'Free Library is the first tab in the Import workspace and also sits in the Editing workspace' ] },
  { v: '0.4.1', date: '2026-10-14', title: 'Collapsible top bar', items: [
    'Squish the top bar with the x, hover the top edge to bring it back',
    'Fixed the home button glitch (a CSS class clash with the home screen)' ] },
  { v: '0.4.0', date: '2026-10-13', title: 'Premiere style skin', items: [
    'New header with Import / Edit / Export modes, status bar with tool hints',
    'Restyled timeline headers, track targets, sync lock and sequence tabs',
    'Project panel: list and icon view, zoom slider, sort, filter, labels, hover scrub, search',
    'Panel tabs with the menu button, restyled meters and program monitor buttons',
    'Command palette on Ctrl+Shift+P' ] },
  { v: '0.3.0', date: '2026-10-12', title: 'Big editor update', items: [
    '98 video effects, 32 video transitions, 38 audio effects and audio transitions',
    'Multiple sequences with tabs, better markers with colors and a markers panel',
    'Audio Monitor panel, Mixer improvements, marquee select anywhere on the timeline',
    'Full tool list with hold for flyout, Alt+drag to duplicate, Windows and Mac menu styles',
    'Adobe style home screen, extended keyboard shortcut set' ] },
  { v: '0.2.0', date: '2026-10-10', title: 'Graphics and effects', items: [
    'Text, shapes and masks with keyframes', 'Effect Controls with keyframe easing', 'Export panel with WebCodecs and ffmpeg.wasm' ] },
  { v: '0.1.0', date: '2026-10-08', title: 'First release', items: [
    'WebGL compositor, timeline editing, razor, ripple and trim, project saving in the browser',
    'Import video, audio and images, playback with audio, undo and redo' ] },
];
