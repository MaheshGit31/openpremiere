import { P, h, bus, tc, seqDur, clamp } from './core.js';
import { pb } from './playback.js';

const FORMATS = [
  ['video/webm;codecs=vp9,opus', 'WebM (VP9 + Opus)', 'webm'],
  ['video/webm;codecs=vp8,opus', 'WebM (VP8 + Opus)', 'webm'],
  ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'H.264 (MP4)', 'mp4'],
  ['video/mp4;codecs=avc1', 'H.264 (MP4, auto)', 'mp4'],
].filter(f => window.MediaRecorder && MediaRecorder.isTypeSupported(f[0]));

export function exportDialog() {
  if (!P.seq) return;
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const s = P.seq;
  const fmt = h('select', { class: 'msel wide' }, FORMATS.map(f => h('option', { value: f[0] }, f[1])));
  const res = h('select', { class: 'msel wide' }, [[1, `Full (${s.w} x ${s.h})`], [.5, `Half (${Math.round(s.w / 2)} x ${Math.round(s.h / 2)})`], [.25, `Quarter (${Math.round(s.w / 4)} x ${Math.round(s.h / 4)})`]].map(([v, l]) => h('option', { value: v }, l)));
  const rng = h('select', { class: 'msel wide' }, [['all', 'Entire Sequence'], ['io', 'Sequence In/Out']].map(([v, l]) => h('option', { value: v }, l)));
  const br = h('input', { type: 'number', class: 'nvi wide', value: 8, min: 1, max: 100 });
  const name = h('input', { class: 'nvi wide', value: s.name });
  const prog = h('div', { class: 'xprog' }, h('div', { class: 'xfill' })); const st = h('div', { class: 'xst' }, 'Real-time export: the preview plays while recording');
  const row = (l, el) => h('div', { class: 'xrow' }, h('label', {}, l), el);
  const go = h('button', { class: 'btn primary', onclick: run }, 'Export'), cancel = h('button', { class: 'btn', onclick: () => { stop(); m.remove(); } }, 'Cancel');
  const m = h('div', { class: 'modal' }, h('div', { class: 'mdl' }, h('div', { class: 'mh' }, 'Export Settings'),
    row('Format', fmt), row('Output Name', name), row('Resolution', res), row('Range', rng), row('Bitrate (Mbps)', br), prog, st, h('div', { class: 'mf' }, cancel, go)));
  document.body.append(m);
  let rec = null, stopped = false;
  function stop() { stopped = true; if (rec && rec.state !== 'inactive') rec.stop(); pb.pause(); }
  async function run() {
    go.disabled = true; stopped = false;
    pb.q = +res.value; pb.audioInit(); await pb.ac.resume();
    pb.render();
    const a = rng.value === 'io' && P.inP != null ? P.inP : 0, b = rng.value === 'io' && P.outP != null ? P.outP : seqDur();
    if (b <= a) { st.textContent = 'Nothing to export'; go.disabled = false; return; }
    const stream = pb.cv.captureStream(s.fps);
    pb.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const chunks = [];
    rec = new MediaRecorder(stream, { mimeType: fmt.value, videoBitsPerSecond: clamp(+br.value, 1, 100) * 1e6, audioBitsPerSecond: 192000 });
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise(r => rec.onstop = r);
    pb.seek(a); await new Promise(r => setTimeout(r, 250));
    rec.start(250); pb.rate = 1; pb.play();
    st.textContent = 'Exporting…';
    const poll = setInterval(() => {
      const f = clamp((P.t - a) / (b - a), 0, 1); prog.firstChild.style.width = f * 100 + '%'; st.textContent = `Exporting… ${Math.round(f * 100)}%`;
      if (P.t >= b - 0.02 || !P.playing || stopped) { clearInterval(poll); pb.pause(); if (rec.state !== 'inactive') rec.stop(); }
    }, 100);
    await done;
    pb.q = +document.querySelector('.msel')?.value || 1; pb.q = 1;
    if (stopped) return;
    const ext = FORMATS.find(f => f[0] === fmt.value)[2];
    const blob = new Blob(chunks, { type: fmt.value.split(';')[0] });
    const url = URL.createObjectURL(blob); const al = h('a', { href: url, download: (name.value || 'export') + '.' + ext }); document.body.append(al); al.click(); al.remove();
    prog.firstChild.style.width = '100%'; st.textContent = `Done · ${(blob.size / 1e6).toFixed(1)} MB`; go.disabled = false;
    pb.invalidate();
  }
}
