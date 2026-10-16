import { P, uid, bus, newSeq, hist } from './core.js';
import { storeBlob } from './project.js';

const probe = (file, url) => new Promise(res => {
  const kind = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : file.type.startsWith('image') ? 'image' : null;
  if (!kind) return res(null);
  const it = { id: uid('m'), name: file.name, kind, url, file, size: file.size, w: 0, h: 0, dur: kind === 'image' ? 5 : 0, fps: 30, thumb: null, bin: 'root', hasAudio: kind !== 'image' };
  if (kind === 'image') {
    const im = new Image();
    im.onload = () => { it.w = im.naturalWidth; it.h = im.naturalHeight; it.thumb = thumb(im, im.naturalWidth, im.naturalHeight); res(it); };
    im.onerror = () => res(null); im.src = url; return;
  }
  const v = document.createElement(kind === 'video' ? 'video' : 'audio');
  v.preload = 'auto'; v.muted = true; v.src = url;
  v.onloadedmetadata = () => {
    it.dur = v.duration; it.w = v.videoWidth || 0; it.h = v.videoHeight || 0;
    if (kind === 'audio') { res(it); return; }
    v.currentTime = Math.min(0.1, v.duration / 2);
  };
  v.onseeked = () => { it.thumb = thumb(v, v.videoWidth, v.videoHeight); res(it); };
  v.onerror = () => res(null);
  setTimeout(() => res(it.dur ? it : null), 8000);
});

export function thumb(src, w, h, tw = 160) {
  const c = document.createElement('canvas'); const th = Math.round(tw * (h / w || 9 / 16));
  c.width = tw; c.height = th; c.getContext('2d').drawImage(src, 0, 0, tw, th);
  return c.toDataURL('image/jpeg', .7);
}

export async function importFiles(files, bin = 'root') {
  const out = [];
  for (const f of files) {
    const it = await probe(f, URL.createObjectURL(f));
    if (it) { it.bin = bin; it.added = Date.now(); P.items.push(it); out.push(it); storeBlob(it); }
  }
  bus.emit('project');
  return out;
}

export function pickFiles() {
  const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'video/*,audio/*,image/*';
  i.onchange = () => importFiles([...i.files]); i.click();
}

export const item = id => P.items.find(i => i.id === id);

// generated demo media: color bars/solid via canvas
export function makeSolid(name, color, w = 1920, h = 1080) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h);
  const it = { id: uid('m'), name, kind: 'image', url: c.toDataURL('image/png'), w, h, dur: 5, fps: 30, thumb: thumb(c, w, h), bin: 'root', hasAudio: false, solid: true };
  P.items.push(it); bus.emit('project'); return it;
}
export function makeBars() {
  const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const g = c.getContext('2d');
  const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 1920 / 7, 0, 1920 / 7 + 1, 720); });
  const b = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
  b.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 1920 / 7, 720, 1920 / 7 + 1, 90); });
  const grad = g.createLinearGradient(0, 0, 1920, 0); grad.addColorStop(0, '#000'); grad.addColorStop(1, '#fff');
  g.fillStyle = grad; g.fillRect(0, 810, 1920, 270);
  const it = { id: uid('m'), name: 'Bars and Tone', kind: 'image', url: c.toDataURL('image/png'), w: 1920, h: 1080, dur: 10, fps: 30, thumb: thumb(c, 1920, 1080), bin: 'root', hasAudio: false, solid: true };
  P.items.push(it); bus.emit('project'); return it;
}

// -------- element pool for playback --------
const pool = new Map();
export function elFor(clip, it) {
  let e = pool.get(clip.id);
  if (e && e.__url === it.url) return e;
  if (it.kind === 'image') { e = new Image(); e.src = it.url; }
  else { e = document.createElement(it.kind === 'video' && clip.type !== 'a' ? 'video' : (it.kind === 'audio' ? 'audio' : 'audio')); e.src = it.url; e.preload = 'auto'; e.playsInline = true; e.muted = clip.type !== 'a'; e.crossOrigin = 'anonymous'; }
  e.__url = it.url; pool.set(clip.id, e);
  return e;
}
export function dropEl(id) { const e = pool.get(id); if (e && e.pause) e.pause(); pool.delete(id); }
export const allEls = () => pool;
